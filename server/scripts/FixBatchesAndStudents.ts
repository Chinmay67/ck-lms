/**
 * Fix Batches and Students
 *
 * This script:
 * 1. Reads batch configuration from Excel
 * 2. Compares with database batches
 * 3. Fixes batch configuration
 * 4. Fixes student fee cycles and fee records
 * 5. Cleans up dangling fee records
 *
 * Usage:
 * - Dry run: npm run fix-batches:dry-run
 * - Live run: npm run fix-batches
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Student from '../src/models/Student.js';
import Batch from '../src/models/Batch.js';
import FeeRecord from '../src/models/FeeRecord.js';
import { FeeService } from '../src/services/FeeService.js';
import { StudentCreditService } from '../src/services/StudentCreditService.js';
import { config } from '../src/config/index.js';
import { parseExcelDate } from '../src/utils/batchParser.js';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

interface ExcelRow {
  'Batch': string;
  'Batch Start Date': any;
  [key: string]: any;
}

interface BatchComparison {
  batchCode: string;
  excelStartDate: Date | null;
  dbStartDate: Date | null;
  needsUpdate: boolean;
  status: 'active' | 'draft';
  students: any[];
}

interface FixStats {
  totalBatches: number;
  batchesProcessed: number;
  batchesUpdated: number;
  studentsProcessed: number;
  feeCyclesFixed: number;
  feeRecordsCreated: number;
  feeRecordsDeleted: number;
  creditsApplied: number;
  danglingRecordsCleaned: number;
  errors: Array<{ batchCode: string; studentId: string; error: string }>;
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
 * Read Excel file
 */
function readExcelFile(filePath: string): ExcelRow[] {
  console.log(`📖 Reading Excel file: ${filePath}`);

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const data: ExcelRow[] = xlsx.utils.sheet_to_json(sheet);

  console.log(`✅ Parsed ${data.length} rows from Excel`);
  return data;
}

/**
 * Compare Excel and DB batches
 */
async function compareBatches(excelRows: ExcelRow[]): Promise<BatchComparison[]> {
  const batchComparisons: BatchComparison[] = [];

  // Group Excel rows by batch code
  const excelBatches = new Map<string, ExcelRow[]>();
  for (const row of excelRows) {
    const batchCode = row['Batch']?.toString().trim();
    if (batchCode) {
      if (!excelBatches.has(batchCode)) {
        excelBatches.set(batchCode, []);
      }
      excelBatches.get(batchCode)!.push(row);
    }
  }

  // Get all batches from DB
  const dbBatches = await Batch.find({});

  // Compare each batch
  for (const [batchCode, rows] of excelBatches.entries()) {
    const excelStartDate = parseExcelDate(rows[0]['Batch Start Date']);
    const dbBatch = dbBatches.find(b => b.batchCode === batchCode);
    const dbStartDate = dbBatch ? new Date(dbBatch.startDate) : null;

    const needsUpdate = !dbBatch ||
      !!(excelStartDate && dbStartDate &&
       excelStartDate.getTime() !== dbStartDate.getTime()) ||
      !!(!excelStartDate && dbStartDate);

    // Get students in this batch - students are linked via batchId (ObjectId), not batchCode
    const students = dbBatch
      ? await Student.find({ batchId: dbBatch._id })
      : [];

    batchComparisons.push({
      batchCode,
      excelStartDate,
      dbStartDate,
      needsUpdate,
      status: excelStartDate && !isNaN(excelStartDate.getTime()) ? 'active' : 'draft',
      students
    });
  }

  return batchComparisons;
}

/**
 * Fix a single batch and its students
 */
async function fixBatchAndStudents(batchComparison: BatchComparison, dryRun: boolean): Promise<{
  updated: boolean;
  feeCyclesFixed: number;
  feeRecordsCreated: number;
  feeRecordsDeleted: number;
  creditsApplied: number;
  danglingCleaned: number;
  errors: Array<{ studentId: string; error: string }>;
}> {
  const result = {
    updated: false,
    feeCyclesFixed: 0,
    feeRecordsCreated: 0,
    feeRecordsDeleted: 0,
    creditsApplied: 0,
    danglingCleaned: 0,
    errors: [] as Array<{ studentId: string; error: string }>
  };

  try {
    // Update batch if needed
    if (batchComparison.needsUpdate) {
      const dbBatch = await Batch.findOne({ batchCode: batchComparison.batchCode });

      if (dbBatch) {
        if (batchComparison.excelStartDate) {
          dbBatch.startDate = batchComparison.excelStartDate;
          dbBatch.status = 'active';
        } else {
          dbBatch.startDate = new Date();
          dbBatch.status = 'draft';
        }

        if (!dryRun) {
          await dbBatch.save();
        }
        result.updated = true;
        console.log(`✅ Updated batch ${batchComparison.batchCode}`);
      }
    }

    // Process each student in the batch
    for (const student of batchComparison.students) {
      try {
        // Update fee cycle start date - MUST be the LATER of batch start or enrollment
        // This prevents creating fees for periods before student actually enrolled
        const enrollmentDate = new Date(student.enrollmentDate);
        const batchStartDate = batchComparison.excelStartDate ? new Date(batchComparison.excelStartDate) : enrollmentDate;

        // Use whichever date is LATER
        const newFeeCycleStartDate = batchStartDate > enrollmentDate ? batchStartDate : enrollmentDate;
        const currentStartDate = student.feeCycleStartDate ? new Date(student.feeCycleStartDate) : null;

        if (!currentStartDate || currentStartDate.getTime() !== newFeeCycleStartDate.getTime()) {
          if (!dryRun) {
            student.feeCycleStartDate = newFeeCycleStartDate;
            await student.save();
          }
          result.feeCyclesFixed++;
          console.log(`  ✅ Fixed fee cycle start for student ${student.studentCode ? student.studentCode : 'N/A'}: ${newFeeCycleStartDate.toISOString().split('T')[0]}`);
          console.log(`     Enrollment: ${enrollmentDate.toISOString().split('T')[0]}, Batch Start: ${batchStartDate.toISOString().split('T')[0]}`);
        }

        // Recalculate fee records
        const feeCycleStartDate = student.feeCycleStartDate || student.enrollmentDate;
        const stage = student.stage || student.skillCategory;

        // Delete all unpaid upcoming fees
        if (!dryRun) {
          await FeeRecord.deleteMany({
            studentId: student._id,
            paidAmount: 0,
            dueDate: { $gte: new Date() }
          });
        }
        result.feeRecordsDeleted++;

        // Generate new fees (only if not dry run)
        if (!dryRun) {
          const createdFees = await FeeService.createInitialOverdueFeesForStudent(
            student._id.toString(),
            feeCycleStartDate,
            stage
          );

          result.feeRecordsCreated += createdFees.length;

          // Apply credits
          const creditResult = await StudentCreditService.applyCreditsToFeeRecords({
            studentId: student._id.toString(),
            studentName: student.studentName,
            processedBy: student._id.toString()
          });
          result.creditsApplied += creditResult.feesCount;
        } else {
          console.log(`  🔍 DRY RUN: Would generate fees from ${feeCycleStartDate.toISOString().split('T')[0]} and apply credits`);
        }

        // Clean up dangling records
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        if (!dryRun) {
          await FeeRecord.deleteMany({
            studentId: student._id,
            feeMonth: { $lt: currentMonth },
            paidAmount: 0,
            paymentDate: null
          });
        }
        result.danglingCleaned++;

        console.log(`  ✅ Processed student ${student.studentCode}`);
      } catch (error: any) {
        result.errors.push({
          studentId: student._id.toString(),
          error: error.message
        });
        console.error(`❌ Error processing student ${student.studentCode}: ${error.message}`);
      }
    }

    return result;
  } catch (error: any) {
    result.errors.push({
      studentId: 'N/A',
      error: error.message
    });
    console.error(`❌ Error processing batch ${batchComparison.batchCode}: ${error.message}`);
    return result;
  }
}

/**
 * Main fix function
 */
async function fixBatchesAndStudents(options: {
  dryRun?: boolean;
} = {}) {
  const {
    dryRun = false
  } = options;

  console.log('\n🚀 Starting batch and student fix...');
  console.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`📋 Excel file: ${path.join(__dirname, '/../../../Desktop/Student data_15-jan-2026.xlsx')}`);

  const stats: FixStats = {
    totalBatches: 0,
    batchesProcessed: 0,
    batchesUpdated: 0,
    studentsProcessed: 0,
    feeCyclesFixed: 0,
    feeRecordsCreated: 0,
    feeRecordsDeleted: 0,
    creditsApplied: 0,
    danglingRecordsCleaned: 0,
    errors: []
  };

  try {
    // Read Excel file
    const excelRows = readExcelFile(path.join(__dirname, '/../../../Desktop/Student data_15-jan-2026.xlsx'));

    // Compare with DB
    const batchComparisons = await compareBatches(excelRows);

    stats.totalBatches = batchComparisons.length;

    // Process each batch
    for (const batchComparison of batchComparisons) {
      console.log(`\n➡️  Processing batch: ${batchComparison.batchCode} (${batchComparison.status})`);
      console.log(`  Excel start date: ${batchComparison.excelStartDate ? batchComparison.excelStartDate.toISOString().split('T')[0] : 'N/A'}`);
      console.log(`  DB start date: ${batchComparison.dbStartDate ? batchComparison.dbStartDate.toISOString().split('T')[0] : 'N/A'}`);

      const result = await fixBatchAndStudents(batchComparison, dryRun);

      stats.batchesProcessed++;
      if (result.updated) stats.batchesUpdated++;
      stats.studentsProcessed += batchComparison.students.length;
      stats.feeCyclesFixed += result.feeCyclesFixed;
      stats.feeRecordsCreated += result.feeRecordsCreated;
      stats.feeRecordsDeleted += result.feeRecordsDeleted;
      stats.creditsApplied += result.creditsApplied;
      stats.danglingRecordsCleaned += result.danglingCleaned;

      if (result.errors.length > 0) {
        stats.errors.push(...result.errors.map(e => ({
          batchCode: batchComparison.batchCode,
          studentId: e.studentId,
          error: e.error
        })));
      }
    }

    // Print summary
    console.log('\n\n╔═══════════════════════════════════════════════════════╗');
    console.log('║     BATCH AND STUDENT FIX SUMMARY                     ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log(`Total Batches:           ${stats.totalBatches}`);
    console.log(`Batches Processed:       ${stats.batchesProcessed}`);
    console.log(`Batches Updated:         ${stats.batchesUpdated}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`Students Processed:      ${stats.studentsProcessed}`);
    console.log(`Fee Cycles Fixed:        ${stats.feeCyclesFixed}`);
    console.log(`Fee Records Created:     ${stats.feeRecordsCreated}`);
    console.log(`Fee Records Deleted:     ${stats.feeRecordsDeleted}`);
    console.log(`Credits Applied:         ${stats.creditsApplied}`);
    console.log(`Dangling Records Cleaned: ${stats.danglingRecordsCleaned}`);
    console.log('───────────────────────────────────────────────────────');
    console.log(`Errors:                   ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      stats.errors.forEach((err, idx) => {
        console.log(`${idx + 1}. Batch ${err.batchCode}, student ${err.studentId}: ${err.error}`);
      });
    }

    console.log('═══════════════════════════════════════════════════════\n');

    if (dryRun) {
      console.log('⚠️  DRY RUN MODE - No changes were made to the database');
      console.log('💡 Run without --dry-run flag to apply changes\n');
    } else {
      console.log('✅ Fix completed successfully!');
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
    dryRun: args.includes('--dry-run')
  };

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║     FIX BATCHES AND STUDENTS SCRIPT                   ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    await connectDB();
    await fixBatchesAndStudents(options);

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

export { fixBatchesAndStudents };