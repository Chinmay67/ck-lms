/**
 * Fix Fee Records in Database Script
 *
 * This script fixes all fee-related issues in the database:
 * 1. Corrects feeCycleStartDate for students (use later of batch.startDate or enrollmentDate)
 * 2. Deletes duplicate fee records
 * 3. Fills missing fee records (gaps in fee history)
 * 4. Removes excess unpaid fees beyond course duration
 * 5. Applies existing credits to unpaid fees
 * 6. Fixes overpayment issues (paidAmount > feeAmount)
 * 7. Cleans up orphaned credit records
 *
 * Usage:
 * - Dry run: npm run fix-fees -- --dry-run
 * - Live run: npm run fix-fees
 * - Active students only: npm run fix-fees -- --active-only
 * - All students: npm run fix-fees -- --include-inactive
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Student from '../src/models/Student.js';
import Batch from '../src/models/Batch.js';
import FeeRecord from '../src/models/FeeRecord.js';
import Course from '../src/models/Course.js';
import StudentCredit from '../src/models/StudentCredit.js';
import { FeeService } from '../src/services/FeeService.js';
import { StudentCreditService } from '../src/services/StudentCreditService.js';
import { config } from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

interface FixStats {
  totalStudents: number;
  studentsProcessed: number;
  studentsSkipped: number;
  feeCycleStartCorrected: number;
  duplicateFeesDeleted: number;
  missingFeesCreated: number;
  excessFeesDeleted: number;
  creditsApplied: number;
  overpaymentsFixed: number;
  dueDatesFixed: number;
  orphanedCreditsCleaned: number;
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
 * Fix feeCycleStartDate for a student
 * Uses the LATER of batch.startDate or student.enrollmentDate
 */
async function fixFeeCycleStartDate(student: any, dryRun: boolean): Promise<{
  corrected: boolean;
  oldDate: Date | null;
  newDate: Date | null;
}> {
  const result = {
    corrected: false,
    oldDate: student.feeCycleStartDate,
    newDate: null as Date | null
  };

  // If student has no batch, use enrollment date only
  if (!student.batchId) {
    if (!student.feeCycleStartDate) {
      result.corrected = true;
      result.newDate = new Date(student.enrollmentDate);
      if (!dryRun) {
        student.feeCycleStartDate = result.newDate;
        await student.save();
        console.log(`  ✅ Set feeCycleStartDate to enrollment date: ${result.newDate.toISOString().split('T')[0]}`);
      } else {
        console.log(`  🔍 Would set feeCycleStartDate to enrollment date: ${result.newDate.toISOString().split('T')[0]}`);
      }
    }
    return result;
  }

  const batch = await Batch.findById(student.batchId);
  if (!batch) {
    return result;
  }

  const enrollmentDate = new Date(student.enrollmentDate);
  const batchStartDate = new Date(batch.startDate);

  // Determine correct fee cycle start (later of the two)
  const correctStartDate = batchStartDate > enrollmentDate ? batchStartDate : enrollmentDate;

  // Check if current feeCycleStartDate is wrong
  const currentStartDate = student.feeCycleStartDate ? new Date(student.feeCycleStartDate) : null;

  // Need to correct if:
  // 1. No feeCycleStartDate set, OR
  // 2. feeCycleStartDate is before enrollmentDate (student can't have fees before enrollment), OR
  // 3. feeCycleStartDate is before batch start but student enrolled after batch start
  const needsCorrection =
    !currentStartDate ||
    currentStartDate < enrollmentDate ||
    (batchStartDate < enrollmentDate && currentStartDate.getTime() !== enrollmentDate.getTime());

  if (needsCorrection) {
    result.corrected = true;
    result.newDate = correctStartDate;

    if (!dryRun) {
      student.feeCycleStartDate = correctStartDate;
      await student.save();
      console.log(`  ✅ Corrected feeCycleStartDate: ${currentStartDate?.toISOString().split('T')[0] || 'null'} → ${correctStartDate.toISOString().split('T')[0]}`);
    } else {
      console.log(`  🔍 Would correct feeCycleStartDate: ${currentStartDate?.toISOString().split('T')[0] || 'null'} → ${correctStartDate.toISOString().split('T')[0]}`);
    }
  }

  return result;
}

/**
 * Delete duplicate fee records for a student
 * Keeps the one with payment data, or the earliest created
 */
async function deleteDuplicateFees(studentId: string, dryRun: boolean): Promise<number> {
  // Group fees by month
  const fees = await FeeRecord.find({ studentId }).sort({ feeMonth: 1, createdAt: 1 });

  const feesByMonth = new Map<string, any[]>();
  for (const fee of fees) {
    if (!feesByMonth.has(fee.feeMonth)) {
      feesByMonth.set(fee.feeMonth, []);
    }
    feesByMonth.get(fee.feeMonth)!.push(fee);
  }

  let deletedCount = 0;

  // Process each month that has duplicates
  for (const [month, monthFees] of feesByMonth.entries()) {
    if (monthFees.length > 1) {
      // Sort: paid fees first, then by paidAmount descending, then by createdAt ascending
      const sorted = monthFees.sort((a, b) => {
        // Paid fees come first
        if (a.paymentDate && !b.paymentDate) return -1;
        if (!a.paymentDate && b.paymentDate) return 1;
        // If both paid or both unpaid, higher paidAmount first
        if (b.paidAmount !== a.paidAmount) return b.paidAmount - a.paidAmount;
        // Finally, earlier created date first
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      // Keep the first one, delete the rest
      const toKeep = sorted[0];
      const toDelete = sorted.slice(1);

      console.log(`  🗑️  Duplicate fees for ${month}: keeping ${toKeep._id}, deleting ${toDelete.length} duplicate(s)`);

      if (!dryRun) {
        for (const fee of toDelete) {
          await FeeRecord.findByIdAndDelete(fee._id);
          deletedCount++;
        }
      } else {
        deletedCount += toDelete.length;
      }
    }
  }

  return deletedCount;
}

/**
 * Fix overpayment issues (paidAmount > feeAmount)
 */
async function fixOverpayments(studentId: string, dryRun: boolean): Promise<number> {
  const overpaidFees = await FeeRecord.find({
    studentId,
    $expr: { $gt: ['$paidAmount', '$feeAmount'] }
  });

  let fixedCount = 0;

  for (const fee of overpaidFees) {
    const excess = fee.paidAmount - fee.feeAmount;
    if (excess > 0) {
      console.log(`  💰 Overpayment found for ${fee.feeMonth}: paid ₹${fee.paidAmount}, fee ₹${fee.feeAmount}, excess ₹${excess}`);

      if (!dryRun) {
        // Cap paidAmount at feeAmount
        fee.paidAmount = fee.feeAmount;
        await fee.save();
        fixedCount++;

        // Convert excess to credit
        try {
          await StudentCreditService.makeAdjustment({
            studentId,
            studentName: fee.studentName,
            amount: excess,
            description: `Overpayment correction for ${fee.feeMonth}`,
            processedBy: 'system'
          });
          console.log(`    ✅ Converted ₹${excess} excess to credit`);
        } catch (creditError: any) {
          console.warn(`    ⚠️  Failed to create credit: ${creditError.message}`);
        }
      } else {
        fixedCount++;
      }
    }
  }

  return fixedCount;
}

/**
 * Fill missing fee records for a student
 */
async function fillMissingFees(student: any, dryRun: boolean): Promise<number> {
  const stage = student.stage || student.skillCategory;
  const level = student.level || student.skillLevel;

  if (!stage || !level) {
    return 0;
  }

  // Get fee cycle start date (use later of feeCycleStartDate or enrollmentDate)
  const feeCycleStartDate = student.feeCycleStartDate
    ? new Date(Math.max(
        new Date(student.feeCycleStartDate).getTime(),
        new Date(student.enrollmentDate).getTime()
      ))
    : new Date(student.enrollmentDate);

  const startDate = new Date(feeCycleStartDate);
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  const currentDate = new Date();
  currentDate.setDate(1);
  currentDate.setHours(0, 0, 0, 0);

  // Get existing fees
  const existingFees = await FeeRecord.find({ studentId: student._id });
  const existingMonths = new Set(existingFees.map(f => f.feeMonth));

  // Get fee amount
  const course = await Course.findOne({ courseName: stage.toLowerCase(), isActive: true });
  if (!course) {
    console.warn(`  ⚠️  No course found for ${stage}`);
    return 0;
  }

  const levelConfig = course.levels.find((l: any) => l.levelNumber === level);
  if (!levelConfig) {
    console.warn(`  ⚠️  No level ${level} config for ${stage}`);
    return 0;
  }

  const feeAmount = levelConfig.feeAmount;
  let createdCount = 0;

  // Generate missing months
  const monthDate = new Date(startDate);
  const maxMonths = 120;
  let monthsProcessed = 0;

  while (monthsProcessed < maxMonths) {
    // Stop if past current month
    if (monthDate > currentDate) {
      break;
    }

    const feeMonth = FeeService.generateFeeMonthName(monthDate);

    if (!existingMonths.has(feeMonth)) {
      const dueDate = FeeService.calculateDueDate(monthDate, feeCycleStartDate);

      if (!dryRun) {
        await FeeRecord.create({
          studentId: student._id,
          studentName: student.studentName,
          stage,
          level,
          feeMonth,
          dueDate,
          feeAmount,
          paidAmount: 0
        });
        console.log(`  ✅ Created missing fee: ${feeMonth}`);
      } else {
        console.log(`  🔍 Would create missing fee: ${feeMonth}`);
      }
      createdCount++;
    }

    monthDate.setMonth(monthDate.getMonth() + 1);
    monthsProcessed++;
  }

  return createdCount;
}

/**
 * Delete excess unpaid fees beyond course duration
 */
async function deleteExcessFees(student: any, dryRun: boolean): Promise<number> {
  const stage = student.stage || student.skillCategory;
  const level = student.level || student.skillLevel;

  if (!stage || !level) {
    return 0;
  }

  // Get course duration
  const course = await Course.findOne({ courseName: stage.toLowerCase(), isActive: true });
  if (!course) {
    return 0;
  }

  const levelConfig = course.levels.find((l: any) => l.levelNumber === level);
  if (!levelConfig) {
    return 0;
  }

  const durationMonths = levelConfig.durationMonths;

  // Calculate course end date
  const feeCycleStartDate = student.feeCycleStartDate || student.enrollmentDate;
  const courseEndDate = new Date(feeCycleStartDate);
  courseEndDate.setMonth(courseEndDate.getMonth() + durationMonths);
  courseEndDate.setDate(1);
  courseEndDate.setHours(0, 0, 0, 0);

  // Find unpaid fees beyond course duration
  const unpaidFees = await FeeRecord.find({
    studentId: student._id,
    paidAmount: 0,
    paymentDate: null
  });

  let deletedCount = 0;

  for (const fee of unpaidFees) {
    const feeMonthParts = fee.feeMonth.split('-');
    const feeMonthDate = new Date(parseInt(feeMonthParts[0]), parseInt(feeMonthParts[1]) - 1, 1);

    if (feeMonthDate >= courseEndDate) {
      if (!dryRun) {
        await FeeRecord.findByIdAndDelete(fee._id);
        console.log(`  🗑️  Deleted excess fee beyond course duration: ${fee.feeMonth}`);
      } else {
        console.log(`  🔍 Would delete excess fee: ${fee.feeMonth}`);
      }
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Apply existing credits to unpaid fees
 */
async function applyCreditsToFees(student: any, dryRun: boolean): Promise<number> {
  if (dryRun) {
    const balance = await StudentCreditService.getCreditBalance(student._id);
    if (balance > 0) {
      console.log(`  🔍 Would apply ₹${balance} in credits`);
      return 1;
    }
    return 0;
  }

  try {
    const result = await StudentCreditService.applyCreditsToFeeRecords({
      studentId: student._id,
      studentName: student.studentName,
      processedBy: student._id
    });

    if (result.amountUsed > 0) {
      console.log(`  💳 Applied ₹${result.amountUsed} credits to ${result.feesCount} fees, ₹${result.remainingCredit} remaining`);
      return result.feesCount;
    }
  } catch (error: any) {
    console.warn(`  ⚠️  Credit application failed: ${error.message}`);
  }

  return 0;
}

/**
 * Clean up orphaned credit records
 * Credits that reference non-existent fee records or students
 */
async function cleanupOrphanedCredits(dryRun: boolean): Promise<number> {
  let cleanedCount = 0;

  // Find credits with feeRecordId pointing to non-existent fees
  const creditsWithFeeRecord = await StudentCredit.find({
    feeRecordId: { $exists: true, $ne: null }
  });

  for (const credit of creditsWithFeeRecord) {
    const feeExists = await FeeRecord.exists({ _id: credit.feeRecordId });
    if (!feeExists) {
      if (!dryRun) {
        await StudentCredit.findByIdAndDelete(credit._id);
        console.log(`  🗑️  Deleted orphaned credit: ${credit._id}`);
      } else {
        console.log(`  🔍 Would delete orphaned credit: ${credit._id}`);
      }
      cleanedCount++;
    }
  }

  // Find credits with studentId pointing to non-existent students
  const credits = await StudentCredit.find({});
  const studentIds = [...new Set(credits.map(c => c.studentId))];
  const existingStudentIds = new Set(
    (await Student.find({ _id: { $in: studentIds } }, '_id')).map(s => s._id.toString())
  );

  for (const credit of credits) {
    if (!existingStudentIds.has(credit.studentId.toString())) {
      if (!dryRun) {
        await StudentCredit.findByIdAndDelete(credit._id);
        console.log(`  🗑️  Deleted credit for non-existent student: ${credit.studentId}`);
      } else {
        console.log(`  🔍 Would delete credit for non-existent student: ${credit.studentId}`);
      }
      cleanedCount++;
    }
  }

  return cleanedCount;
}

/**
 * Fix incorrect due dates for fee records
 * Handles edge cases like Feb 29th, months with 30/31 days, invalid dates
 */
async function fixIncorrectDueDates(studentId: string, dryRun: boolean): Promise<number> {
  const fees = await FeeRecord.find({ studentId });

  let fixedCount = 0;

  for (const fee of fees) {
    // Parse the feeMonth to get the correct month and year
    const parts = fee.feeMonth.split('-');
    if (parts.length !== 2) continue;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed

    // Get the student to determine the due day
    const student = await Student.findById(studentId);
    if (!student) continue;

    // Use enrollment day for due date, or default to 1st if not available
    const enrollmentDate = new Date(student.enrollmentDate);
    const dueDayOfMonth = enrollmentDate.getDate() || 1;

    // Calculate the last day of the target month
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

    // Cap the due day at the last day of the month
    const actualDueDay = Math.min(dueDayOfMonth, lastDayOfMonth);

    // Create correct due date (end of that day: 23:59:59.999)
    const correctDueDate = new Date(year, month, actualDueDay);
    correctDueDate.setHours(23, 59, 59, 999);

    // Check if due date needs fixing
    const currentDueDate = new Date(fee.dueDate);

    // Normalize both to compare dates only (ignore milliseconds)
    const currentDateOnly = new Date(currentDueDate);
    currentDateOnly.setHours(0, 0, 0, 0);
    const correctDateOnly = new Date(correctDueDate);
    correctDateOnly.setHours(0, 0, 0, 0);

    // Compare dates
    const needsFixing = currentDateOnly.getTime() !== correctDateOnly.getTime();

    if (needsFixing) {
      console.log(`  📅 Fixed due date for ${fee.feeMonth}: ${currentDueDate.toISOString().split('T')[0]} → ${correctDueDate.toISOString().split('T')[0]} (day ${actualDueDay} of ${lastDayOfMonth})`);

      if (!dryRun) {
        fee.dueDate = correctDueDate;
        await fee.save();
        fixedCount++;
      } else {
        fixedCount++;
      }
    }
  }

  return fixedCount;
}

/**
 * Fix fees for a single student
 */
async function fixFeesForStudent(student: any, dryRun: boolean): Promise<{
  feeCycleCorrected: boolean;
  duplicatesDeleted: number;
  missingCreated: number;
  excessDeleted: number;
  creditsApplied: number;
  overpaymentsFixed: number;
  dueDatesFixed: number;
  error?: string;
}> {
  const result = {
    feeCycleCorrected: false,
    duplicatesDeleted: 0,
    missingCreated: 0,
    excessDeleted: 0,
    creditsApplied: 0,
    overpaymentsFixed: 0,
    dueDatesFixed: 0
  };

  try {
    // Step 1: Fix feeCycleStartDate
    const cycleResult = await fixFeeCycleStartDate(student, dryRun);
    result.feeCycleCorrected = cycleResult.corrected;

    // Step 2: Delete duplicate fees
    result.duplicatesDeleted = await deleteDuplicateFees(student._id.toString(), dryRun);

    // Step 3: Fix overpayments
    result.overpaymentsFixed = await fixOverpayments(student._id.toString(), dryRun);

    // Step 4: Fix incorrect due dates
    result.dueDatesFixed = await fixIncorrectDueDates(student._id.toString(), dryRun);

    // Step 5: Fill missing fees
    result.missingCreated = await fillMissingFees(student, dryRun);

    // Step 6: Delete excess fees
    result.excessDeleted = await deleteExcessFees(student, dryRun);

    // Step 7: Apply credits
    result.creditsApplied = await applyCreditsToFees(student, dryRun);

    return result;
  } catch (error: any) {
    return {
      ...result,
      error: error.message
    };
  }
}

/**
 * Main fix function
 */
async function fixAllFeeRecords(options: {
  dryRun?: boolean;
  activeOnly?: boolean;
} = {}) {
  const {
    dryRun = false,
    activeOnly = true
  } = options;

  console.log('\n🚀 Starting fee records fix...');
  console.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`📋 Active students only: ${activeOnly ? 'Yes' : 'No'}\n`);

  const stats: FixStats = {
    totalStudents: 0,
    studentsProcessed: 0,
    studentsSkipped: 0,
    feeCycleStartCorrected: 0,
    duplicateFeesDeleted: 0,
    missingFeesCreated: 0,
    excessFeesDeleted: 0,
    creditsApplied: 0,
    overpaymentsFixed: 0,
    dueDatesFixed: 0,
    orphanedCreditsCleaned: 0,
    errors: []
  };

  try {
    // Build query
    const query: any = {};
    if (activeOnly) {
      query.isActive = true;
    }

    // Get all students
    const students = await Student.find(query).sort({ studentName: 1 });
    stats.totalStudents = students.length;

    console.log(`📊 Found ${stats.totalStudents} students to process\n`);

    // Process each student
    for (const student of students) {
      console.log(`\n➡️  Processing: ${student.studentName} (${student.studentCode})`);
      console.log(`  📚 Stage: ${student.stage || student.skillCategory}, Level: ${student.level || student.skillLevel}`);
      console.log(`  📅 Enrollment: ${new Date(student.enrollmentDate).toISOString().split('T')[0]}`);
      console.log(`  💰 Fee Cycle: ${student.feeCycleStartDate ? new Date(student.feeCycleStartDate).toISOString().split('T')[0] : 'Not set'}`);
      console.log(`  🎓 Batch: ${student.batch || 'Not Assigned'}`);

      const result = await fixFeesForStudent(student, dryRun);

      if (result.error) {
        console.log(`  ❌ Error: ${result.error}`);
        stats.errors.push({
          studentId: student._id.toString(),
          studentName: student.studentName,
          error: result.error
        });
        stats.studentsSkipped++;
      } else {
        if (result.feeCycleCorrected) stats.feeCycleStartCorrected++;
        stats.duplicateFeesDeleted += result.duplicatesDeleted;
        stats.missingFeesCreated += result.missingCreated;
        stats.excessFeesDeleted += (result.excessDeleted || 0);
        stats.creditsApplied += (result.creditsApplied || 0);
        stats.overpaymentsFixed += (result.overpaymentsFixed || 0);
        stats.dueDatesFixed += (result.dueDatesFixed || 0);
        stats.studentsProcessed++;

        const changes = [];
        if (result.feeCycleCorrected) changes.push('fee cycle start');
        if (result.duplicatesDeleted > 0) changes.push(`${result.duplicatesDeleted} duplicates`);
        if (result.overpaymentsFixed > 0) changes.push(`${result.overpaymentsFixed} overpayments`);
        if (result.dueDatesFixed > 0) changes.push(`${result.dueDatesFixed} due dates`);
        if (result.missingCreated > 0) changes.push(`${result.missingCreated} missing fees`);
        if (result.excessDeleted > 0) changes.push(`${result.excessDeleted} excess fees`);
        if (result.creditsApplied > 0) changes.push('credits');

        if (changes.length > 0) {
          console.log(`  ✓ Fixed: ${changes.join(', ')}`);
        } else {
          console.log(`  ✓ No issues found`);
        }
      }
    }

    // Clean up orphaned credits
    console.log(`\n\n🧹 Cleaning up orphaned credits...`);
    stats.orphanedCreditsCleaned = await cleanupOrphanedCredits(dryRun);

    // Print summary
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('📊 FIX SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Students:           ${stats.totalStudents}`);
    console.log(`Students Processed:       ${stats.studentsProcessed}`);
    console.log(`Students Skipped:         ${stats.studentsSkipped}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`Fee Cycle Dates Corrected: ${stats.feeCycleStartCorrected}`);
    console.log(`Duplicate Fees Deleted:   ${stats.duplicateFeesDeleted}`);
    console.log(`Overpayments Fixed:        ${stats.overpaymentsFixed}`);
    console.log(`Missing Fees Created:     ${stats.missingFeesCreated}`);
    console.log(`Excess Fees Deleted:      ${stats.excessDeleted}`);
    console.log(`Credits Applied:           ${stats.creditsApplied}`);
    console.log(`Orphaned Credits Cleaned:  ${stats.orphanedCreditsCleaned}`);
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
    } else {
      const totalChanges = stats.feeCycleStartCorrected + stats.duplicateFeesDeleted +
                          stats.overpaymentsFixed + stats.missingFeesCreated +
                          stats.excessFeesDeleted + stats.creditsApplied + stats.orphanedCreditsCleaned;
      if (totalChanges > 0) {
        console.log(`✅ Fix completed successfully! ${totalChanges} changes made.`);
      } else {
        console.log('✅ No issues found - database is clean!');
      }
    }

    return stats;
  } catch (error: any) {
    console.error('\n❌ Fatal error during fix:', error.message);
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
  console.log('║     FIX FEE RECORDS IN DATABASE SCRIPT                ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    await connectDB();
    await fixAllFeeRecords(options);

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

export { fixAllFeeRecords };