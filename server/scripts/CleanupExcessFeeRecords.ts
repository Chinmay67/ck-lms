/**
 * Cleanup Excess Fee Records Script
 * 
 * This script removes fee records that were created beyond the course duration.
 * It handles:
 * 1. Calculates the course end date based on feeCycleStartDate + durationMonths
 * 2. Deletes UNPAID fee records that are beyond the course duration
 * 3. Preserves all PAID fee records (never deletes paid fees)
 * 4. Respects the durationMonths from the Course configuration
 * 
 * Safe deletions:
 * - Only deletes fees with paidAmount = 0 and paymentDate = null
 * - Only deletes fees beyond the course duration
 * - Never touches paid or partially paid fees
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Student from '../src/models/Student.js';
import FeeRecord from '../src/models/FeeRecord.js';
import StudentCredit from '../src/models/StudentCredit.js';
import Course from '../src/models/Course.js';
import { config } from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

interface CleanupStats {
  totalStudents: number;
  studentsProcessed: number;
  studentsSkipped: number;
  totalFeesDeleted: number;
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
 * Get course duration for a student's stage and level
 */
async function getCourseDuration(stage: string, level: number): Promise<number | null> {
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

    return levelConfig.durationMonths;
  } catch (error: any) {
    console.error(`❌ Error fetching course duration: ${error.message}`);
    return null;
  }
}

/**
 * Parse fee month string to Date (supports both "YYYY-MM" and "January 2026" formats)
 */
function parseFeeMonth(feeMonth: string): Date | null {
  try {
    // Try YYYY-MM format first (standardized format)
    const numericMatch = feeMonth.match(/^(\d{4})-(\d{2})$/);
    if (numericMatch) {
      const year = parseInt(numericMatch[1], 10);
      const month = parseInt(numericMatch[2], 10) - 1; // 0-indexed
      return new Date(year, month, 1);
    }

    // Fallback to "Month YYYY" format for backward compatibility
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const parts = feeMonth.split(' ');
    if (parts.length !== 2) return null;
    
    const monthName = parts[0];
    const year = parseInt(parts[1], 10);
    
    const monthIndex = months.indexOf(monthName);
    if (monthIndex === -1) return null;
    
    return new Date(year, monthIndex, 1);
  } catch (error) {
    return null;
  }
}

/**
 * Cleanup excess fee records for a single student
 */
async function cleanupExcessFeesForStudent(student: any, dryRun: boolean): Promise<{
  feesDeleted: number;
  error?: string;
}> {
  const result = {
    feesDeleted: 0
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

    // Get course duration
    const durationMonths = await getCourseDuration(stage, level);
    if (!durationMonths) {
      return {
        ...result,
        error: `No course duration configured for ${stage} level ${level}`
      };
    }

    // Determine fee cycle start date
    const feeCycleStartDate = student.feeCycleStartDate || student.enrollmentDate;
    if (!feeCycleStartDate) {
      return {
        ...result,
        error: 'Student has no feeCycleStartDate or enrollmentDate'
      };
    }

    // Calculate course end date (feeCycleStartDate + durationMonths)
    const courseEndDate = new Date(feeCycleStartDate);
    courseEndDate.setMonth(courseEndDate.getMonth() + durationMonths);
    courseEndDate.setDate(1); // First of the month
    courseEndDate.setHours(0, 0, 0, 0);

    console.log(`  📅 Fee cycle: ${feeCycleStartDate.toISOString().split('T')[0]}`);
    console.log(`  ⏱️  Duration: ${durationMonths} months`);
    console.log(`  🏁 Course ends: ${courseEndDate.toISOString().split('T')[0]}`);

    // Get all UNPAID fee records for this student
    const unpaidFees = await FeeRecord.find({
      studentId: student._id,
      paidAmount: 0,
      paymentDate: null
    });

    console.log(`  📋 Found ${unpaidFees.length} unpaid fee records`);

    // Find fees beyond course duration
    const feesToDelete: any[] = [];
    
    for (const fee of unpaidFees) {
      const feeMonthDate = parseFeeMonth(fee.feeMonth);
      
      if (feeMonthDate && feeMonthDate >= courseEndDate) {
        feesToDelete.push(fee);
      }
    }

    if (feesToDelete.length === 0) {
      console.log(`  ✓ No excess fees to delete`);
      return result;
    }

    console.log(`  🗑️  Found ${feesToDelete.length} excess fee records beyond course duration:`);
    feesToDelete.forEach(fee => {
      console.log(`     - ${fee.feeMonth} (₹${fee.feeAmount})`);
    });

    // Delete the excess fees
    if (!dryRun) {
      const feeIds = feesToDelete.map(f => f._id);
      const deleteResult = await FeeRecord.deleteMany({
        _id: { $in: feeIds }
      });
      
      result.feesDeleted = deleteResult.deletedCount || 0;
      console.log(`  ✅ Deleted ${result.feesDeleted} excess fee records`);
    } else {
      result.feesDeleted = feesToDelete.length;
      console.log(`  🔍 DRY RUN: Would delete ${result.feesDeleted} fee records`);
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
 * Main function to cleanup excess fee records for all students
 */
async function cleanupExcessFeeRecords(options: {
  dryRun?: boolean;
  activeOnly?: boolean;
} = {}) {
  const {
    dryRun = false,
    activeOnly = true
  } = options;

  console.log('\n🚀 Starting fee cleanup...');
  console.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`📋 Active students only: ${activeOnly ? 'Yes' : 'No'}\n`);

  const stats: CleanupStats = {
    totalStudents: 0,
    studentsProcessed: 0,
    studentsSkipped: 0,
    totalFeesDeleted: 0,
    errors: []
  };

  try {
    // Build query filter
    const query: any = {};
    if (activeOnly) {
      query.isActive = true;
    }

    // Get all students with fee records
    const studentIdsWithFees = await FeeRecord.distinct('studentId');
    query._id = { $in: studentIdsWithFees };

    const students = await Student.find(query).sort({ studentName: 1 });
    stats.totalStudents = students.length;

    console.log(`📊 Found ${stats.totalStudents} students with fee records to process\n`);

    // Process each student
    for (const student of students) {
      console.log(`\n➡️  Processing: ${student.studentName} (${student.studentCode})`);
      console.log(`  📚 Stage: ${student.stage || student.skillCategory}, Level: ${student.level || student.skillLevel}`);

      const result = await cleanupExcessFeesForStudent(student, dryRun);

      if (result.error) {
        console.log(`  ❌ Error: ${result.error}`);
        stats.errors.push({
          studentId: student._id.toString(),
          studentName: student.studentName,
          error: result.error
        });
        stats.studentsSkipped++;
      } else {
        stats.totalFeesDeleted += result.feesDeleted;
        stats.studentsProcessed++;
      }
    }

    // Print summary
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('📊 CLEANUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Students:           ${stats.totalStudents}`);
    console.log(`Students Processed:       ${stats.studentsProcessed}`);
    console.log(`Students Skipped:         ${stats.studentsSkipped}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`Total Fees Deleted:       ${stats.totalFeesDeleted}`);
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
    console.error('\n❌ Fatal error during cleanup:', error.message);
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
    activeOnly: !args.includes('--include-inactive')
  };

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║     CLEANUP EXCESS FEE RECORDS SCRIPT                 ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    await connectDB();
    const stats = await cleanupExcessFeeRecords(options);

    if (!options.dryRun && stats.totalFeesDeleted > 0) {
      console.log('✅ Cleanup completed successfully!');
      console.log(`🗑️  Deleted ${stats.totalFeesDeleted} excess fee records`);
    } else if (options.dryRun) {
      console.log('✅ Dry run completed successfully!');
    } else {
      console.log('✅ No excess fee records found!');
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

export { cleanupExcessFeeRecords };
