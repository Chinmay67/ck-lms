/**
 * Generate Missing Fee Records Script
 * 
 * This script scans the entire database and creates all missing fee records for students.
 * It handles:
 * 1. Students with batches: Creates fee records from feeCycleStartDate (or enrollmentDate) to current month
 * 2. Overdue fees: Creates records for past months that haven't been paid
 * 3. Current month fees: Ensures current month fee exists
 * 4. Skips: Inactive students, students without batches (they use credit system)
 * 
 * Fee records are created with:
 * - Status computed dynamically based on dueDate and paymentDate
 * - Overdue: dueDate < today && paymentDate is null
 * - Upcoming: dueDate >= today && paymentDate is null
 * - Paid: paymentDate is not null
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Student from '../src/models/Student.js';
import Batch from '../src/models/Batch.js';
import FeeRecord from '../src/models/FeeRecord.js';
import Course from '../src/models/Course.js';
import { FeeService } from '../src/services/FeeService.js';
import { config } from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

interface GenerationStats {
  totalStudents: number;
  studentsProcessed: number;
  studentsSkipped: number;
  studentsWithBatch: number;
  studentsWithoutBatch: number;
  inactiveStudents: number;
  totalFeesCreated: number;
  overdueFeesCreated: number;
  upcomingFeesCreated: number;
  errors: Array<{ studentId: string; studentName: string; error: string }>;
}

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    const mongoUri = config.mongoUri;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Get fee amount for a student's stage and level
 */
async function getFeeAmountForStudent(stage: string, level: number): Promise<number | null> {
  try {
    const course = await Course.findOne({ courseName: stage.toLowerCase(), isActive: true });
    if (!course) {
      console.warn(`⚠️  No active course found for stage: ${stage}`);
      return null;
    }

    const levelConfig = course.levels.find((l: any) => l.levelNumber === level);
    if (!levelConfig) {
      console.warn(`⚠️  No level ${level} configuration found for course: ${stage}`);
      return null;
    }

    return levelConfig.feeAmount;
  } catch (error: any) {
    console.error(`❌ Error fetching fee amount: ${error.message}`);
    return null;
  }
}

/**
 * Generate fee month name in standardized YYYY-MM format (e.g., "2026-01")
 */
function generateFeeMonthName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Calculate due date based on enrollment date day
 */
function calculateDueDate(monthDate: Date, enrollmentDate: Date): Date {
  const dueDate = new Date(monthDate);
  
  // Use enrollment day for all fees
  const enrollDay = enrollmentDate.getDate();
  const lastDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  dueDate.setDate(Math.min(enrollDay, lastDayOfMonth));
  
  dueDate.setHours(23, 59, 59, 999);
  return dueDate;
}

/**
 * Generate missing fee records for a single student
 */
async function generateMissingFeesForStudent(student: any): Promise<{
  feesCreated: number;
  overdueCount: number;
  upcomingCount: number;
  error?: string;
}> {
  const result = {
    feesCreated: 0,
    overdueCount: 0,
    upcomingCount: 0
  };

  try {
    // Validate student has required fields
    const stage = student.stage || student.skillCategory;
    const level = student.level || student.skillLevel;

    if (!stage || !level) {
      return {
        ...result,
        error: 'Student missing stage or level'
      };
    }

    // Get fee amount for this student's stage/level
    const feeAmount = await getFeeAmountForStudent(stage, level);
    if (!feeAmount) {
      return {
        ...result,
        error: `No fee amount configured for ${stage} level ${level}`
      };
    }

    // Determine fee cycle start date - use the LATER of feeCycleStartDate or enrollmentDate
    // This prevents creating fees for periods before student actually enrolled
    let feeCycleStartDate: Date;
    let cycleStartSource: string;

    if (student.feeCycleStartDate && student.enrollmentDate) {
      const feeStart = new Date(student.feeCycleStartDate);
      const enrollStart = new Date(student.enrollmentDate);

      // Use whichever is later
      if (feeStart > enrollStart) {
        feeCycleStartDate = feeStart;
        cycleStartSource = 'feeCycleStartDate (later than enrollment)';
      } else {
        feeCycleStartDate = enrollStart;
        cycleStartSource = 'enrollmentDate (later than or equal to fee cycle)';
      }
    } else if (student.feeCycleStartDate) {
      feeCycleStartDate = new Date(student.feeCycleStartDate);
      cycleStartSource = 'feeCycleStartDate';
    } else if (student.enrollmentDate) {
      feeCycleStartDate = new Date(student.enrollmentDate);
      cycleStartSource = 'enrollmentDate';
    } else {
      return {
        ...result,
        error: 'Student has no feeCycleStartDate or enrollmentDate'
      };
    }

    console.log(`  📅 Using ${cycleStartSource}: ${feeCycleStartDate.toISOString().split('T')[0]}`);

    // Get all existing fee records for this student
    const existingFees = await FeeRecord.find({ studentId: student._id });
    const existingFeeMonths = new Set(existingFees.map(f => f.feeMonth));
    
    if (existingFees.length > 0) {
      console.log(`  📋 Found ${existingFees.length} existing fee records`);
    }

    // Determine the date range for fee generation
    const startDate = new Date(feeCycleStartDate);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const currentDate = new Date();
    currentDate.setDate(1);
    currentDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Generate fee records from start date to current month (inclusive)
    const monthDate = new Date(startDate);
    let monthsProcessed = 0;
    const maxMonths = 120; // Safety limit (10 years)

    while (monthsProcessed < maxMonths) {
      // Stop if we've passed the current month
      if (monthDate.getFullYear() > currentDate.getFullYear() ||
          (monthDate.getFullYear() === currentDate.getFullYear() && 
           monthDate.getMonth() > currentDate.getMonth())) {
        break;
      }

      const feeMonth = generateFeeMonthName(monthDate);

      // Check if fee record already exists for this month
      if (!existingFeeMonths.has(feeMonth)) {
        const dueDate = calculateDueDate(monthDate, feeCycleStartDate);

        // Create fee record
        const feeRecord = await FeeRecord.create({
          studentId: student._id,
          studentName: student.studentName,
          stage,
          level,
          feeMonth,
          dueDate,
          feeAmount,
          paidAmount: 0
          // Note: paymentDate is null, status is computed dynamically
        });

        result.feesCreated++;

        // Categorize as overdue or upcoming
        if (dueDate < today) {
          result.overdueCount++;
        } else {
          result.upcomingCount++;
        }

        console.log(`  ✅ Created ${dueDate < today ? 'overdue' : 'upcoming'} fee: ${feeMonth}`);
      }

      // Move to next month
      monthDate.setMonth(monthDate.getMonth() + 1);
      monthsProcessed++;
    }

    return result;
  } catch (error: any) {
    return {
      ...result,
      error: error.message
    };
  }
}

/**
 * Main function to generate missing fee records for all students
 */
async function generateMissingFeeRecords(options: {
  dryRun?: boolean;
  studentsWithBatchOnly?: boolean;
  activeOnly?: boolean;
} = {}) {
  const {
    dryRun = false,
    studentsWithBatchOnly = true,
    activeOnly = true
  } = options;

  console.log('\n🚀 Starting fee record generation...');
  console.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`📋 Students with batch only: ${studentsWithBatchOnly ? 'Yes' : 'No'}`);
  console.log(`📋 Active students only: ${activeOnly ? 'Yes' : 'No'}\n`);

  const stats: GenerationStats = {
    totalStudents: 0,
    studentsProcessed: 0,
    studentsSkipped: 0,
    studentsWithBatch: 0,
    studentsWithoutBatch: 0,
    inactiveStudents: 0,
    totalFeesCreated: 0,
    overdueFeesCreated: 0,
    upcomingFeesCreated: 0,
    errors: []
  };

  try {
    // Build query filter
    const query: any = {};
    if (activeOnly) {
      query.isActive = true;
    }

    // Get all students matching criteria
    const students = await Student.find(query).sort({ studentName: 1 });
    stats.totalStudents = students.length;

    console.log(`📊 Found ${stats.totalStudents} students to process\n`);

    // Process each student
    for (const student of students) {
      console.log(`\n➡️  Processing: ${student.studentName} (${student.studentCode})`);
      console.log(`  📚 Stage: ${student.stage || student.skillCategory}, Level: ${student.level || student.skillLevel}`);

      // Check if student has a batch
      if (!student.batchId) {
        stats.studentsWithoutBatch++;
        if (studentsWithBatchOnly) {
          console.log(`  ⏭️  Skipped: No batch assigned (uses credit system)`);
          stats.studentsSkipped++;
          continue;
        }
      } else {
        stats.studentsWithBatch++;
        // Show batch info if available
        const batch = await Batch.findById(student.batchId);
        if (batch) {
          console.log(`  🎓 Batch: ${batch.batchCode} (start: ${batch.startDate.toISOString().split('T')[0]})`);
        }
      }

      // Check if student is inactive
      if (!student.isActive) {
        stats.inactiveStudents++;
        if (activeOnly) {
          console.log(`  ⏭️  Skipped: Inactive student`);
          stats.studentsSkipped++;
          continue;
        }
      }

      // Generate missing fee records
      if (!dryRun) {
        const result = await generateMissingFeesForStudent(student);

        if (result.error) {
          console.log(`  ❌ Error: ${result.error}`);
          stats.errors.push({
            studentId: student._id.toString(),
            studentName: student.studentName,
            error: result.error
          });
        } else {
          if (result.feesCreated > 0) {
            console.log(`  ✅ Created ${result.feesCreated} fee records (${result.overdueCount} overdue, ${result.upcomingCount} upcoming)`);
            stats.totalFeesCreated += result.feesCreated;
            stats.overdueFeesCreated += result.overdueCount;
            stats.upcomingFeesCreated += result.upcomingCount;
          } else {
            console.log(`  ✓ No missing fees - all up to date`);
          }
          stats.studentsProcessed++;
        }
      } else {
        console.log(`  🔍 DRY RUN: Would check and generate fees`);
        stats.studentsProcessed++;
      }
    }

    // Print summary
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('📊 FEE GENERATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Students:           ${stats.totalStudents}`);
    console.log(`Students Processed:       ${stats.studentsProcessed}`);
    console.log(`Students Skipped:         ${stats.studentsSkipped}`);
    console.log(`  - With Batch:           ${stats.studentsWithBatch}`);
    console.log(`  - Without Batch:        ${stats.studentsWithoutBatch}`);
    console.log(`  - Inactive:             ${stats.inactiveStudents}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`Total Fees Created:       ${stats.totalFeesCreated}`);
    console.log(`  - Overdue Fees:         ${stats.overdueFeesCreated}`);
    console.log(`  - Upcoming Fees:        ${stats.upcomingFeesCreated}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`Errors:                   ${stats.errors.length}`);
    
    if (stats.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      stats.errors.forEach((err, idx) => {
        console.log(`${idx + 1}. ${err.studentName} (${err.studentId}): ${err.error}`);
      });
    }

    console.log('═══════════════════════════════════════════════════════\n');

    if (dryRun) {
      console.log('⚠️  DRY RUN MODE - No changes were made to the database');
      console.log('💡 Run without --dry-run flag to apply changes\n');
    }

    return stats;
  } catch (error: any) {
    console.error('\n❌ Fatal error during fee generation:', error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    dryRun: args.includes('--dry-run'),
    studentsWithBatchOnly: !args.includes('--include-no-batch'),
    activeOnly: !args.includes('--include-inactive')
  };

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║     GENERATE MISSING FEE RECORDS SCRIPT               ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    await connectDB();
    const stats = await generateMissingFeeRecords(options);

    if (!options.dryRun && stats.totalFeesCreated > 0) {
      console.log('✅ Fee generation completed successfully!');
      console.log(`📝 Created ${stats.totalFeesCreated} new fee records`);
    } else if (options.dryRun) {
      console.log('✅ Dry run completed successfully!');
    } else {
      console.log('✅ All students have up-to-date fee records!');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateMissingFeeRecords };
