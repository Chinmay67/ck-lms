/**
 * Fix Payment Discrepancies Script
 * 
 * This script identifies and fixes various discrepancies in the database:
 * 1. Fee records showing "partially_paid" when actually fully paid (missing paymentDate)
 * 2. Discontinued students still marked as active
 * 3. Duplicate batches (same name + start date)
 * 4. Missing payment dates for paid fees
 * 5. Invalid payment amounts
 * 6. Date format issues
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Student from '../src/models/Student.js';
import Batch from '../src/models/Batch.js';
import FeeRecord from '../src/models/FeeRecord.js';
import { config } from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

interface DiscrepancyStats {
  missingPaymentDates: number;
  discontinuedStudents: number;
  duplicateBatches: number;
  invalidAmounts: number;
  invalidDates: number;
  fixedRecords: number;
}

const stats: DiscrepancyStats = {
  missingPaymentDates: 0,
  discontinuedStudents: 0,
  duplicateBatches: 0,
  invalidAmounts: 0,
  invalidDates: 0,
  fixedRecords: 0
};

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
 * Fix 1: Find and fix fee records with missing payment dates
 * Issue: paidAmount >= feeAmount but no paymentDate causes status to show as "partially_paid"
 */
async function fixMissingPaymentDates(dryRun: boolean = true): Promise<void> {
  console.log('\n🔍 Checking for fee records with missing payment dates...');
  
  // Find fee records where paid amount equals or exceeds fee amount but no payment date
  const recordsWithIssue = await FeeRecord.find({
    $expr: { $gte: ['$paidAmount', '$feeAmount'] },
    paymentDate: null
  });
  
  stats.missingPaymentDates = recordsWithIssue.length;
  
  if (recordsWithIssue.length === 0) {
    console.log('✅ No records found with missing payment dates');
    return;
  }
  
  console.log(`\n⚠️  Found ${recordsWithIssue.length} fee records with missing payment dates:`);
  
  for (const record of recordsWithIssue) {
    console.log(`   - ${record.studentName} | ${record.feeMonth} | Paid: ₹${record.paidAmount} / ₹${record.feeAmount}`);
    
    if (!dryRun) {
      // Use dueDate as paymentDate
      record.paymentDate = record.dueDate;
      await record.save();
      stats.fixedRecords++;
    }
  }
  
  if (dryRun) {
    console.log('\n💡 Fix: Set paymentDate = dueDate for these records');
  } else {
    console.log(`\n✅ Fixed ${recordsWithIssue.length} records`);
  }
}

/**
 * Fix 2: Find and fix discontinued students still marked as active
 */
async function fixDiscontinuedStudents(dryRun: boolean = true): Promise<void> {
  console.log('\n🔍 Checking for discontinued students marked as active...');
  
  // This would require checking student status field or batch status
  // For now, we'll look for students with no recent fee payments and in ended batches
  
  const endedBatches = await Batch.find({ status: 'ended' }).select('_id');
  const endedBatchIds = endedBatches.map(b => b._id);
  
  const discontinuedStudents = await Student.find({
    batchId: { $in: endedBatchIds },
    isActive: true
  });
  
  stats.discontinuedStudents = discontinuedStudents.length;
  
  if (discontinuedStudents.length === 0) {
    console.log('✅ No discontinued students found marked as active');
    return;
  }
  
  console.log(`\n⚠️  Found ${discontinuedStudents.length} students in ended batches still marked as active:`);
  
  for (const student of discontinuedStudents) {
    console.log(`   - ${student.studentName} | Batch: ${student.batch}`);
    
    if (!dryRun) {
      student.isActive = false;
      await student.save();
      stats.fixedRecords++;
    }
  }
  
  if (dryRun) {
    console.log('\n💡 Fix: Set isActive = false for these students');
  } else {
    console.log(`\n✅ Marked ${discontinuedStudents.length} students as inactive`);
  }
}

/**
 * Fix 3: Find duplicate batches (same name + start date)
 */
async function findDuplicateBatches(dryRun: boolean = true): Promise<void> {
  console.log('\n🔍 Checking for duplicate batches (same name + start date)...');
  
  const batches = await Batch.find({}).sort({ batchName: 1, startDate: 1 });
  
  const batchGroups = new Map<string, typeof batches>();
  
  for (const batch of batches) {
    const key = `${batch.batchName}|${batch.startDate.toISOString().split('T')[0]}`;
    
    if (!batchGroups.has(key)) {
      batchGroups.set(key, []);
    }
    batchGroups.get(key)!.push(batch);
  }
  
  const duplicateGroups = Array.from(batchGroups.values()).filter(group => group.length > 1);
  stats.duplicateBatches = duplicateGroups.reduce((acc, group) => acc + (group.length - 1), 0);
  
  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicate batches found');
    return;
  }
  
  console.log(`\n⚠️  Found ${duplicateGroups.length} batch groups with duplicates:`);
  
  for (const group of duplicateGroups) {
    console.log(`\n   Batch Name: ${group[0].batchName} | Start Date: ${group[0].startDate.toISOString().split('T')[0]}`);
    console.log(`   Duplicates:`);
    
    for (let i = 0; i < group.length; i++) {
      const batch = group[i];
      const studentCount = await Student.countDocuments({ batchId: batch._id });
      console.log(`     ${i + 1}. Code: ${batch.batchCode} | Students: ${studentCount} | Status: ${batch.status}`);
    }
    
    if (!dryRun) {
      // Keep the first batch (usually the one created earliest)
      const [keepBatch, ...duplicateBatches] = group;
      
      for (const dupBatch of duplicateBatches) {
        // Move students from duplicate to the kept batch
        await Student.updateMany(
          { batchId: dupBatch._id },
          { $set: { batchId: keepBatch._id, batch: keepBatch.batchName } }
        );
        
        // Delete the duplicate batch
        await Batch.deleteOne({ _id: dupBatch._id });
        stats.fixedRecords++;
      }
      
      console.log(`   ✅ Merged into: ${keepBatch.batchCode}`);
    }
  }
  
  if (dryRun) {
    console.log('\n💡 Fix: Merge students to first batch and remove duplicates');
  } else {
    console.log(`\n✅ Merged ${stats.duplicateBatches} duplicate batches`);
  }
}

/**
 * Fix 4: Find fee records with invalid payment amounts
 */
async function findInvalidPaymentAmounts(): Promise<void> {
  console.log('\n🔍 Checking for invalid payment amounts...');
  
  // Find records where paidAmount > feeAmount
  const invalidRecords = await FeeRecord.find({
    $expr: { $gt: ['$paidAmount', '$feeAmount'] }
  });
  
  stats.invalidAmounts = invalidRecords.length;
  
  if (invalidRecords.length === 0) {
    console.log('✅ No records with invalid payment amounts found');
    return;
  }
  
  console.log(`\n⚠️  Found ${invalidRecords.length} records with paidAmount > feeAmount:`);
  
  for (const record of invalidRecords) {
    console.log(`   - ${record.studentName} | ${record.feeMonth} | Paid: ₹${record.paidAmount} / ₹${record.feeAmount}`);
  }
  
  console.log('\n⚠️  These require manual review - possible overpayment or credit scenario');
}

/**
 * Fix 5: Find and report invalid dates
 */
async function findInvalidDates(): Promise<void> {
  console.log('\n🔍 Checking for invalid dates...');
  
  const records = await FeeRecord.find({});
  const invalidDateRecords: any[] = [];
  
  for (const record of records) {
    if (record.dueDate && !(record.dueDate instanceof Date) || isNaN(record.dueDate.getTime())) {
      invalidDateRecords.push({ record, field: 'dueDate' });
    }
    if (record.paymentDate && (!(record.paymentDate instanceof Date) || isNaN(record.paymentDate.getTime()))) {
      invalidDateRecords.push({ record, field: 'paymentDate' });
    }
  }
  
  stats.invalidDates = invalidDateRecords.length;
  
  if (invalidDateRecords.length === 0) {
    console.log('✅ No records with invalid dates found');
    return;
  }
  
  console.log(`\n⚠️  Found ${invalidDateRecords.length} records with invalid dates:`);
  
  for (const { record, field } of invalidDateRecords) {
    console.log(`   - ${record.studentName} | ${record.feeMonth} | Invalid field: ${field}`);
  }
  
  console.log('\n⚠️  These require manual review');
}

/**
 * Print summary statistics
 */
function printSummary(dryRun: boolean) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 DISCREPANCY ANALYSIS SUMMARY');
  console.log('='.repeat(60));
  console.log(`\n🔍 Issues Found:`);
  console.log(`   - Missing payment dates: ${stats.missingPaymentDates}`);
  console.log(`   - Discontinued students (active): ${stats.discontinuedStudents}`);
  console.log(`   - Duplicate batches: ${stats.duplicateBatches}`);
  console.log(`   - Invalid payment amounts: ${stats.invalidAmounts}`);
  console.log(`   - Invalid dates: ${stats.invalidDates}`);
  
  const totalIssues = stats.missingPaymentDates + stats.discontinuedStudents + stats.duplicateBatches;
  
  if (dryRun) {
    console.log(`\n💡 Total fixable issues: ${totalIssues}`);
    console.log('\n⚠️  DRY RUN MODE - No changes were made');
    console.log('   Run with --apply flag to apply fixes');
  } else {
    console.log(`\n✅ Total records fixed: ${stats.fixedRecords}`);
  }
  
  console.log('\n' + '='.repeat(60));
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  
  console.log('🚀 Payment Discrepancy Fix Script');
  console.log('='.repeat(60));
  
  if (dryRun) {
    console.log('\n⚠️  RUNNING IN DRY-RUN MODE');
    console.log('   Use --apply flag to apply fixes\n');
  } else {
    console.log('\n⚠️  APPLYING FIXES - Changes will be made to the database!');
    console.log('   Make sure you have a backup!\n');
    
    // Wait for confirmation
    await new Promise(resolve => {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      readline.question('Continue? (yes/no): ', (answer: string) => {
        readline.close();
        if (answer.toLowerCase() !== 'yes') {
          console.log('❌ Aborted by user');
          process.exit(0);
        }
        resolve(null);
      });
    });
  }
  
  try {
    await connectDB();
    
    // Run all checks and fixes
    await fixMissingPaymentDates(dryRun);
    await fixDiscontinuedStudents(dryRun);
    await findDuplicateBatches(dryRun);
    await findInvalidPaymentAmounts();
    await findInvalidDates();
    
    // Print summary
    printSummary(dryRun);
    
    console.log('\n✅ Analysis completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error during analysis:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { fixMissingPaymentDates, fixDiscontinuedStudents, findDuplicateBatches };
