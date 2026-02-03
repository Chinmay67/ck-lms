/**
 * Comprehensive Batch and Student Fix Script
 *
 * This script performs a thorough fix of batches and student fee records:
 * 1. Fetches all batches from DB and matches them with Excel data
 * 2. Fixes batch configuration (start dates, status, etc.)
 * 3. For each student in the batch:
 *    - Updates feeCycleStartDate to match batch start date
 *    - Deletes all unpaid fee records
 *    - Regenerates fee records from batch start to current month
 *    - Applies student credits if available
 *    - Removes dangling/orphaned fee records
 *
 * Usage:
 * - Dry run: bun run scripts/ComprehensiveBatchAndStudentFix.ts --dry-run
 * - Live run: bun run scripts/ComprehensiveBatchAndStudentFix.ts
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import xlsx from 'xlsx';
import Student from '../src/models/Student.js';
import Batch from '../src/models/Batch.js';
import FeeRecord from '../src/models/FeeRecord.js';
import Course from '../src/models/Course.js';
import StudentCredit from '../src/models/StudentCredit.js';
import { StudentCreditService } from '../src/services/StudentCreditService.js';
import { FeeService } from '../src/services/FeeService.js';
import { config } from '../src/config/index.js';
import { parseBatchCode, parseExcelDate, parseCourseLevel } from '../src/utils/batchParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

interface ExcelRow {
  'Name': string;
  'Batch': string;
  'Batch Start Date': any;
  'Level': string;
  'Student Start Date': any;
  [key: string]: any;
}

interface ExcelBatchInfo {
  batchCode: string;
  startDate: Date | null;
  studentNames: string[];
}

interface BatchFixResult {
  batchCode: string;
  batchName: string;
  excelStartDate: Date | null;
  dbStartDate: Date | null;
  wasUpdated: boolean;
  studentsProcessed: number;
  feeCyclesFixed: number;
  feeRecordsDeleted: number;
  feeRecordsCreated: number;
  creditsApplied: number;
  errors: string[];
}

interface FixStats {
  totalBatchesInExcel: number;
  totalBatchesInDB: number;
  batchesProcessed: number;
  batchesUpdated: number;
  studentsProcessed: number;
  feeCyclesFixed: number;
  feeRecordsDeleted: number;
  feeRecordsCreated: number;
  creditsApplied: number;
  danglingRecordsCleaned: number;
  errors: Array<{ context: string; error: string }>;
}

/**
 * Connect to MongoDB
 */
async function connectDB(): Promise<void> {
  try {
    const mongoUri = config.mongoUri;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error: any) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

/**
 * Read and parse Excel file
 */
function readExcelFile(filePath: string): ExcelRow[] {
  console.log(`\n📖 Reading Excel file: ${filePath}`);

  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: ExcelRow[] = xlsx.utils.sheet_to_json(sheet);

    console.log(`✅ Parsed ${data.length} rows from Excel`);
    return data;
  } catch (error: any) {
    console.error(`❌ Failed to read Excel file: ${error.message}`);
    throw error;
  }
}

/**
 * Extract batch information from Excel rows
 */
function extractBatchesFromExcel(rows: ExcelRow[]): Map<string, ExcelBatchInfo> {
  const batches = new Map<string, ExcelBatchInfo>();

  for (const row of rows) {
    const batchCodeRaw = row['Batch']?.toString().trim();
    const studentName = row['Name']?.toString().trim();

    if (!batchCodeRaw || !studentName) continue;

    const parsedBatch = parseBatchCode(batchCodeRaw);
    if (!parsedBatch.isValid) {
      console.warn(`⚠️  Skipping invalid batch code: ${batchCodeRaw}`);
      continue;
    }

    const batchCode = parsedBatch.batchCode;
    const startDate = parseExcelDate(row['Batch Start Date']);

    if (!batches.has(batchCode)) {
      batches.set(batchCode, {
        batchCode,
        startDate,
        studentNames: []
      });
    }

    // Add student name to the batch
    batches.get(batchCode)!.studentNames.push(studentName);
  }

  console.log(`\n📊 Found ${batches.size} unique batches in Excel`);
  return batches;
}

/**
 * Fix a single batch and all its students
 */
async function fixBatchAndStudents(
  batchCode: string,
  excelBatchInfo: ExcelBatchInfo | null,
  dryRun: boolean
): Promise<BatchFixResult> {
  const result: BatchFixResult = {
    batchCode,
    batchName: '',
    excelStartDate: excelBatchInfo?.startDate || null,
    dbStartDate: null,
    wasUpdated: false,
    studentsProcessed: 0,
    feeCyclesFixed: 0,
    feeRecordsDeleted: 0,
    feeRecordsCreated: 0,
    creditsApplied: 0,
    errors: []
  };

  try {
    // Find batch in DB
    const dbBatch = await Batch.findOne({ batchCode });

    if (!dbBatch) {
      result.errors.push(`Batch ${batchCode} not found in database`);
      return result;
    }

    result.batchName = dbBatch.batchName;
    result.dbStartDate = dbBatch.startDate ? new Date(dbBatch.startDate) : null;

    console.log(`\n➡️  Processing Batch: ${dbBatch.batchName} (${batchCode})`);
    console.log(`   Excel Start Date: ${excelBatchInfo?.startDate ? excelBatchInfo.startDate.toISOString().split('T')[0] : 'N/A'}`);
    console.log(`   DB Start Date: ${result.dbStartDate ? result.dbStartDate.toISOString().split('T')[0] : 'N/A'}`);

    // Update batch if needed
    let batchUpdated = false;
    if (excelBatchInfo?.startDate) {
      const excelTime = excelBatchInfo.startDate.getTime();
      const dbTime = result.dbStartDate?.getTime() || 0;

      if (excelTime !== dbTime) {
        console.log(`   📝 Updating batch start date...`);
        if (!dryRun) {
          dbBatch.startDate = excelBatchInfo.startDate;
          dbBatch.status = 'active';
          await dbBatch.save();
        }
        result.wasUpdated = true;
        batchUpdated = true;
        console.log(`   ✅ Batch start date updated`);
      }
    }

    // Find all students in this batch
    const students = await Student.find({ 
      $or: [
        { batchId: dbBatch._id },
        { batch: dbBatch.batchName },
        { batch: batchCode }
      ]
    });

    console.log(`   👥 Found ${students.length} students in batch`);

    // Process each student
    for (const student of students) {
      try {
        console.log(`\n   ➡️  Student: ${student.studentCode || 'N/A'} - ${student.studentName}`);

        // Determine the correct fee cycle start date
        let feeCycleStartDate: Date;
        
        if (excelBatchInfo?.startDate) {
          // Use batch start date from Excel
          feeCycleStartDate = new Date(excelBatchInfo.startDate);
        } else if (dbBatch.startDate) {
          // Use batch start date from DB
          feeCycleStartDate = new Date(dbBatch.startDate);
        } else {
          // Fall back to student's enrollment date
          feeCycleStartDate = new Date(student.enrollmentDate);
        }

        // Update student's fee cycle start date if different
        const currentFeeCycle = student.feeCycleStartDate ? new Date(student.feeCycleStartDate) : null;
        
        if (!currentFeeCycle || currentFeeCycle.getTime() !== feeCycleStartDate.getTime()) {
          console.log(`      📝 Updating fee cycle start date from ${currentFeeCycle ? currentFeeCycle.toISOString().split('T')[0] : 'N/A'} to ${feeCycleStartDate.toISOString().split('T')[0]}`);
          
          if (!dryRun) {
            student.feeCycleStartDate = feeCycleStartDate;
            await student.save();
          }
          result.feeCyclesFixed++;
        }

        // Get student's stage and level
        const stage = student.stage || student.skillCategory || 'beginner';
        const level = student.level || student.skillLevel || 1;

        console.log(`      📚 Stage: ${stage}, Level: ${level}`);

        // Delete all unpaid fee records for this student
        const deleteResult = await FeeRecord.deleteMany({
          studentId: student._id,
          paidAmount: 0
        });

        if (!dryRun) {
          console.log(`      🗑️  Deleted ${deleteResult.deletedCount} unpaid fee records`);
          result.feeRecordsDeleted += deleteResult.deletedCount || 0;
        }

        // Regenerate fee records from fee cycle start to current month
        console.log(`      🔄 Regenerating fee records...`);
        
        if (!dryRun) {
          const createdFees = await FeeService.createInitialOverdueFeesForStudent(
            student._id.toString(),
            feeCycleStartDate,
            stage
          );

          console.log(`      ✅ Created ${createdFees.length} fee records`);
          result.feeRecordsCreated += createdFees.length;

          // Apply any available credits to the fee records
          try {
            const creditResult = await StudentCreditService.applyCreditsToFeeRecords({
              studentId: student._id.toString(),
              studentName: student.studentName,
              processedBy: student._id.toString()
            });

            if (creditResult.feesCount > 0) {
              console.log(`      💰 Applied credits to ${creditResult.feesCount} fee records`);
              result.creditsApplied += creditResult.feesCount;
            }
          } catch (creditError: any) {
            console.log(`      ⚠️  Credit application: ${creditError.message}`);
          }
        }

        result.studentsProcessed++;
        console.log(`      ✅ Student processed successfully`);

      } catch (studentError: any) {
        const errorMsg = `Student ${student.studentCode || student._id}: ${studentError.message}`;
        result.errors.push(errorMsg);
        console.error(`      ❌ Error: ${studentError.message}`);
      }
    }

    return result;

  } catch (error: any) {
    result.errors.push(`Batch processing error: ${error.message}`);
    console.error(`   ❌ Error processing batch: ${error.message}`);
    return result;
  }
}

/**
 * Clean up dangling fee records (orphaned records)
 */
async function cleanupDanglingRecords(dryRun: boolean): Promise<number> {
  console.log(`\n🧹 Cleaning up dangling fee records...`);

  try {
    // Find all fee records
    const allFeeRecords = await FeeRecord.find({});
    let danglingCount = 0;

    for (const feeRecord of allFeeRecords) {
      // Check if student exists
      const student = await Student.findById(feeRecord.studentId);
      
      if (!student) {
        console.log(`   🗑️  Dangling record: Fee for non-existent student ${feeRecord.studentId}`);
        if (!dryRun) {
          await FeeRecord.deleteOne({ _id: feeRecord._id });
        }
        danglingCount++;
      }
    }

    if (danglingCount > 0) {
      console.log(`   ✅ ${dryRun ? 'Found' : 'Cleaned'} ${danglingCount} dangling fee records`);
    } else {
      console.log(`   ✅ No dangling fee records found`);
    }

    return danglingCount;

  } catch (error: any) {
    console.error(`   ❌ Error cleaning dangling records: ${error.message}`);
    return 0;
  }
}

/**
 * Main fix function
 */
async function comprehensiveFix(options: {
  dryRun?: boolean;
  excelPath?: string;
} = {}): Promise<FixStats> {
  const {
    dryRun = false,
    excelPath = path.join(__dirname, '/../../../Desktop/Student data_15-jan-2026.xlsx')
  } = options;

  console.log('\n🚀 Starting comprehensive batch and student fix...');
  console.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`📋 Excel file: ${excelPath}`);

  const stats: FixStats = {
    totalBatchesInExcel: 0,
    totalBatchesInDB: 0,
    batchesProcessed: 0,
    batchesUpdated: 0,
    studentsProcessed: 0,
    feeCyclesFixed: 0,
    feeRecordsDeleted: 0,
    feeRecordsCreated: 0,
    creditsApplied: 0,
    danglingRecordsCleaned: 0,
    errors: []
  };

  try {
    // Read Excel file
    const excelRows = readExcelFile(excelPath);
    const excelBatches = extractBatchesFromExcel(excelRows);
    stats.totalBatchesInExcel = excelBatches.size;

    // Get all batches from DB
    const dbBatches = await Batch.find({});
    stats.totalBatchesInDB = dbBatches.length;

    console.log(`\n📊 Database contains ${dbBatches.length} batches`);

    // Create a set of all batch codes to process (union of Excel and DB)
    const allBatchCodes = new Set<string>();
    
    // Add Excel batch codes
    excelBatches.forEach((_, code) => allBatchCodes.add(code));
    
    // Add DB batch codes
    dbBatches.forEach(batch => allBatchCodes.add(batch.batchCode));

    console.log(`\n🔄 Processing ${allBatchCodes.size} total batches...`);

    // Process each batch
    for (const batchCode of allBatchCodes) {
      const excelInfo = excelBatches.get(batchCode) || null;
      
      const result = await fixBatchAndStudents(batchCode, excelInfo, dryRun);

      stats.batchesProcessed++;
      if (result.wasUpdated) stats.batchesUpdated++;
      stats.studentsProcessed += result.studentsProcessed;
      stats.feeCyclesFixed += result.feeCyclesFixed;
      stats.feeRecordsDeleted += result.feeRecordsDeleted;
      stats.feeRecordsCreated += result.feeRecordsCreated;
      stats.creditsApplied += result.creditsApplied;

      if (result.errors.length > 0) {
        result.errors.forEach(error => {
          stats.errors.push({
            context: `Batch ${batchCode}`,
            error
          });
        });
      }
    }

    // Clean up dangling records
    const danglingCleaned = await cleanupDanglingRecords(dryRun);
    stats.danglingRecordsCleaned = danglingCleaned;

    // Print summary
    printSummary(stats, dryRun);

    return stats;

  } catch (error: any) {
    console.error('\n❌ Fatal error during fix:', error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Print summary of fix operation
 */
function printSummary(stats: FixStats, dryRun: boolean): void {
  console.log('\n\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   COMPREHENSIVE FIX SUMMARY                           ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`Mode:                    ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('───────────────────────────────────────────────────────');
  console.log(`Total Batches in Excel:  ${stats.totalBatchesInExcel}`);
  console.log(`Total Batches in DB:     ${stats.totalBatchesInDB}`);
  console.log(`Batches Processed:       ${stats.batchesProcessed}`);
  console.log(`Batches Updated:         ${stats.batchesUpdated}`);
  console.log('───────────────────────────────────────────────────────');
  console.log(`Students Processed:      ${stats.studentsProcessed}`);
  console.log(`Fee Cycles Fixed:        ${stats.feeCyclesFixed}`);
  console.log(`Fee Records Deleted:     ${stats.feeRecordsDeleted}`);
  console.log(`Fee Records Created:     ${stats.feeRecordsCreated}`);
  console.log(`Credits Applied:         ${stats.creditsApplied}`);
  console.log(`Dangling Records Cleaned: ${stats.danglingRecordsCleaned}`);
  console.log('───────────────────────────────────────────────────────');
  console.log(`Errors:                  ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    stats.errors.forEach((err, idx) => {
      console.log(`${idx + 1}. ${err.context}: ${err.error}`);
    });
  }

  console.log('═══════════════════════════════════════════════════════\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes were made to the database');
    console.log('💡 Run without --dry-run flag to apply changes\n');
  } else {
    console.log('✅ Fix completed successfully!');
    console.log('💡 Review the changes and verify data integrity\n');
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
  console.log('║   COMPREHENSIVE BATCH & STUDENT FIX SCRIPT            ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    await connectDB();
    await comprehensiveFix(options);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { comprehensiveFix };
