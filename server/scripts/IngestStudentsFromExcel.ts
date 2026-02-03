/**
 * Student Ingestion Script from Excel
 * 
 * This script ingests students from the Excel file and:
 * 1. Creates/updates batches (active or draft)
 * 2. Creates students with proper validation
 * 3. Creates fee records based on payment data
 * 4. Creates credits where applicable
 * 5. Handles discontinued students
 */

import xlsx from 'xlsx';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Student from '../src/models/Student.js';
import Batch from '../src/models/Batch.js';
import FeeRecord from '../src/models/FeeRecord.js';
import StudentCredit from '../src/models/StudentCredit.js';
import Course from '../src/models/Course.js';
import User from '../src/models/User.js';
import {
  parseBatchCode,
  generateUniqueBatchCode,
  parseExcelDate,
  isDiscontinued,
  cleanPhoneNumber,
  cleanEmail,
  parseCourseLevel,
  isValidDate
} from '../src/utils/batchParser.js';
import { BatchService } from '../src/services/BatchService.js';
import { DatabaseService } from '../src/services/DatabaseService.js';
import {config} from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

interface ExcelRow {
  'S.No (http://s.no/)': number;
  'Name': string;
  'Contact Number': string;
  'E-mail': string;
  'Status': string;
  'Student Start Date': any;
  'Level': string;
  'Duration': number;
  'Batch': string;
  'Timing': string;
  'Batch Start Date': any;
  [key: string]: any; // For dynamic payment columns
}

interface PaymentRecord {
  dueDate: Date | null;
  status: string;
  paidDate: Date | null;
}

interface ProcessedStudent {
  name: string;
  phone: string;
  email: string;
  status: string;
  studentStartDate: Date | null;
  level: string;
  duration: number | null;
  batchCode: string;
  timing: string;
  batchStartDate: Date | null;
  payments: PaymentRecord[];
  stage: 'beginner' | 'intermediate' | 'advanced' | null;
  levelNumber: number | null;
}

// Global variables
let adminUser: any;
let existingBatchCodes: string[] = [];

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
 * Get or create admin user for processing
 */
async function getAdminUser() {
  try {
    adminUser = await User.findOne({ role: 'superadmin' });
    
    if (!adminUser) {
      console.warn('⚠️  No super admin found. Creating temporary admin...');
      adminUser = await User.create({
        username: 'system',
        email: 'system@lms.com',
        password: 'temp123',
        role: 'super_admin',
        isActive: true
      });
    }
    
    console.log('✅ Admin user loaded:', adminUser.username);
  } catch (error) {
    console.error('❌ Error loading admin user:', error);
    process.exit(1);
  }
}

/**
 * Load existing batch codes to avoid collisions
 */
async function loadExistingBatchCodes() {
  try {
    const batches = await Batch.find({}, 'batchCode');
    existingBatchCodes = batches.map(b => b.batchCode);
    console.log(`✅ Loaded ${existingBatchCodes.length} existing batch codes`);
  } catch (error) {
    console.error('❌ Error loading batch codes:', error);
    existingBatchCodes = [];
  }
}

/**
 * Parse Excel file
 */
function parseExcelFile(filePath: string): ExcelRow[] {
  console.log(`📖 Reading Excel file: ${filePath}`);
  
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  const data: ExcelRow[] = xlsx.utils.sheet_to_json(sheet);
  
  console.log(`✅ Parsed ${data.length} rows from Excel`);
  return data;
}

/**
 * Extract payment records from Excel row
 */
function extractPaymentRecords(row: ExcelRow): PaymentRecord[] {
  const payments: PaymentRecord[] = [];
  
  // Payment columns follow pattern: Payment Due date, Payment Status, Payment date
  // Starting from column index (after Batch Start Date)
  let index = 0;
  
  while (true) {
    const dueDateKey = `Payment Due date${index > 0 ? '__' + index : ''}`;
    const statusKey = `Payment Status${index > 0 ? '__' + index : ''}`;
    const paidDateKey = `Payment date${index > 0 ? '__' + index : ''}`;
    
    // Check if these columns exist
    if (!(dueDateKey in row) && !(`Payment Due date` in row && index === 0)) {
      break;
    }
    
    const actualDueDateKey = index === 0 ? 'Payment Due date' : dueDateKey;
    const actualStatusKey = index === 0 ? 'Payment Status' : statusKey;
    const actualPaidDateKey = index === 0 ? 'Payment date' : paidDateKey;
    
    const dueDate = parseExcelDate(row[actualDueDateKey]);
    const status = row[actualStatusKey]?.toString().trim() || '';
    const paidDate = parseExcelDate(row[actualPaidDateKey]);
    
    // Only add if we have at least a due date or paid date
    if (dueDate || paidDate) {
      payments.push({
        dueDate,
        status,
        paidDate
      });
    }
    
    index++;
    
    // Safety break after 20 iterations
    if (index > 20) break;
  }
  
  return payments;
}

/**
 * Process a single row from Excel
 */
function processExcelRow(row: ExcelRow): ProcessedStudent | null {
  const name = row['Name']?.toString().trim();
  
  if (!name) {
    return null; // Skip rows without names
  }
  
  const phone = cleanPhoneNumber(row['Contact Number']);
  const email = cleanEmail(row['E-mail']);
  const status = row['Status']?.toString().trim() || '';
  const studentStartDate = parseExcelDate(row['Student Start Date']);
  const level = row['Level']?.toString().trim() || '';
  const duration = row['Duration'] ? parseInt(row['Duration'].toString(), 10) : null;
  const batchCode = row['Batch']?.toString().trim() || '';
  const timing = row['Timing']?.toString().trim() || '';
  const batchStartDate = parseExcelDate(row['Batch Start Date']);
  
  const payments = extractPaymentRecords(row);
  
  const { stage, level: levelNumber } = parseCourseLevel(level);
  
  return {
    name,
    phone,
    email,
    status,
    studentStartDate,
    level,
    duration,
    batchCode,
    timing,
    batchStartDate,
    payments,
    stage,
    levelNumber
  };
}

/**
 * Create or find batch
 */
async function createOrFindBatch(
  batchCodeRaw: string,
  timing: string,
  batchStartDate: Date | null,
  stage: string,
  level: number
): Promise<any> {
  const parsedBatch = parseBatchCode(batchCodeRaw);
  
  if (!parsedBatch.isValid) {
    console.warn(`⚠️  Invalid batch code: ${batchCodeRaw}`);
    return null;
  }
  
  // Check if batch with this exact code already exists
  let batch = await Batch.findOne({ batchCode: parsedBatch.batchCode });
  
  if (batch) {
    console.log(`✅ Found existing batch: ${parsedBatch.batchCode}`);
    return batch;
  }
  
  // Generate unique batch code by checking database for collisions
  let uniqueBatchCode = parsedBatch.batchCode;
  let suffix = 0;
  const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  
  while (await Batch.findOne({ batchCode: uniqueBatchCode })) {
    suffix++;
    if (suffix < romanNumerals.length) {
      uniqueBatchCode = `${parsedBatch.batchCode}-${romanNumerals[suffix]}`;
    } else {
      uniqueBatchCode = `${parsedBatch.batchCode}-${suffix}`;
    }
  }
  
  // Create new batch
  const isDraft = !batchStartDate || !isValidDate(batchStartDate);
  
  // Convert day names to day numbers (0=Sunday, 1=Monday, etc.)
  const dayNameToNumber: { [key: string]: number } = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
  };
  
  // Prepare schedule entries
  const scheduleEntries = parsedBatch.days.map(day => ({
    dayOfWeek: dayNameToNumber[day.toLowerCase()],
    startTime: parsedBatch.time
  }));
  
  // Create batch - active if has start date, draft otherwise
  // No schedule conflict checking - allow multiple batches with same schedule
  if (!isDraft) {
    // Has batch start date - create as ACTIVE
    batch = await Batch.create({
      batchCode: uniqueBatchCode,
      batchName: `${stage.charAt(0).toUpperCase() + stage.slice(1)} ${level} - ${parsedBatch.timing}`,
      stage,
      level,
      schedule: scheduleEntries,
      description: timing || parsedBatch.timing,
      status: 'active',
      startDate: batchStartDate,
      maxStudents: null,
      createdBy: adminUser._id
    });
  } else {
    // No batch start date - create as DRAFT
    batch = await Batch.create({
      batchCode: uniqueBatchCode,
      batchName: `${stage.charAt(0).toUpperCase() + stage.slice(1)} ${level} - ${parsedBatch.timing}`,
      stage,
      level,
      schedule: scheduleEntries,
      description: timing || parsedBatch.timing,
      status: 'draft',
      startDate: new Date(), // Required field in schema
      maxStudents: null,
      createdBy: adminUser._id
    });
  }
  
  // Add to existing batch codes
  existingBatchCodes.push(uniqueBatchCode);
  
  console.log(`✅ Created ${isDraft ? 'draft' : 'active'} batch: ${uniqueBatchCode}`);
  return batch;
}

/**
 * Create student
 */
async function createStudent(data: ProcessedStudent, batchId: mongoose.Types.ObjectId | null): Promise<any> {
  // Validate contact info - must have email OR phone for user account creation
  if (!data.email && !data.phone) {
    throw new Error(`Student ${data.name} must have email or phone to create user account`);
  }
  
  // NOTE: We no longer check for duplicate students here
  // Siblings can share email/phone, so duplicates are allowed
  // DatabaseService.createStudent() will handle finding/creating shared User accounts
  
  // Determine student start date
  let studentStartDate = data.studentStartDate;
  
  // If no student start date but has batch start date, use batch start date
  if (!studentStartDate && data.batchStartDate) {
    studentStartDate = data.batchStartDate;
  }
  
  // If there's a payment with earlier date, use that
  if (data.payments.length > 0) {
    const earliestPayment = data.payments
      .filter(p => p.paidDate)
      .sort((a, b) => (a.paidDate!.getTime() - b.paidDate!.getTime()))[0];
    
    if (earliestPayment && earliestPayment.paidDate) {
      if (!studentStartDate || earliestPayment.paidDate < studentStartDate) {
        studentStartDate = earliestPayment.paidDate;
      }
    }
  }
  
  const isActive = !isDiscontinued(data.status);
  
  // Use DatabaseService.createStudent() which automatically:
  // - Finds or creates a User account (shared if email/phone matches)
  // - Links student to user via userId
  // - Generates unique studentCode
  const student = await DatabaseService.createStudent({
    studentName: data.name,
    email: data.email || undefined,  // Convert empty string to undefined
    phone: data.phone || undefined,  // Convert empty string to undefined
    stage: data.stage!,
    level: data.levelNumber! as 1 | 2 | 3,
    batchId: batchId,
    batch: batchId ? undefined : 'Not Assigned',
    enrollmentDate: studentStartDate || new Date(),
    feeCycleStartDate: studentStartDate || undefined,
    isActive
  });
  
  console.log(`✅ Created student and linked to user account: ${data.name} (${isActive ? 'Active' : 'Inactive'})`);
  return student;
}

/**
 * Create fee records for student
 */
async function createFeeRecords(
  student: any,
  payments: PaymentRecord[],
  duration: number | null,
  stage: string,
  level: number
): Promise<void> {
  // Get course and fee amount
  const course = await Course.findOne({ courseName: stage });
  if (!course) {
    console.warn(`⚠️  Course not found for ${stage}`);
    return;
  }
  
  const courseLevel = course.levels.find((l: any) => l.levelNumber === level);
  if (!courseLevel) {
    console.warn(`⚠️  Level ${level} not found for course ${stage}`);
    return;
  }
  
  const feeAmount = courseLevel.feeAmount;
  const courseDuration = duration || courseLevel.durationMonths;
  
  // Process each payment
  for (const payment of payments) {
    // Skip if no paid date (don't create fee record)
    if (!payment.paidDate) {
      continue;
    }
    
    // Check if pending record already exists for this month
    const feeMonth = payment.dueDate
      ? `${payment.dueDate.getFullYear()}-${String(payment.dueDate.getMonth() + 1).padStart(2, '0')}`
      : `${payment.paidDate.getFullYear()}-${String(payment.paidDate.getMonth() + 1).padStart(2, '0')}`;
    
    const existingRecord = await FeeRecord.findOne({
      studentId: student._id,
      feeMonth: feeMonth
    });
    
    if (existingRecord) {
      console.log(`⚠️  Fee record already exists for ${student.studentName} - ${feeMonth}`);
      continue;
    }
    
    // Create fee record
    await FeeRecord.create({
      studentId: student._id,
      studentName: student.studentName,
      stage,
      level,
      feeMonth: feeMonth,
      dueDate: payment.dueDate || payment.paidDate,
      feeAmount: feeAmount,
      paidAmount: feeAmount,
      paymentDate: payment.paidDate,
      paymentMethod: 'other',
      updatedBy: adminUser._id
    });
  }
  
  // Create pending record for current/next month if student is active
  if (student.isActive && student.feeCycleStartDate) {
    const now = new Date();
    const cycleStart = new Date(student.feeCycleStartDate);
    
    // Calculate months since start
    const monthsSinceStart = (now.getFullYear() - cycleStart.getFullYear()) * 12 + 
                           (now.getMonth() - cycleStart.getMonth());
    
    // Only create pending if within course duration
    if (monthsSinceStart < courseDuration) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextFeeMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
      
      const existingPending = await FeeRecord.findOne({
        studentId: student._id,
        feeMonth: nextFeeMonth
      });
      
      if (!existingPending) {
        await FeeRecord.create({
          studentId: student._id,
          studentName: student.studentName,
          stage,
          level,
          feeMonth: nextFeeMonth,
          dueDate: nextMonth,
          feeAmount: feeAmount,
          paidAmount: 0,
          updatedBy: adminUser._id
        });
        
        console.log(`✅ Created pending fee for ${student.studentName} - ${nextFeeMonth}`);
      }
    }
  }
}

/**
 * Create credits for student
 */
async function createCredits(
  student: any,
  payments: PaymentRecord[]
): Promise<void> {
  let balance = 0;
  
  for (const payment of payments) {
    // Skip if no paid date (don't create credit)
    if (!payment.paidDate) {
      continue;
    }
    
    // Get course to determine fee amount
    const course = await Course.findOne({ courseName: student.stage });
    if (!course) continue;
    
    const courseLevel = course.levels.find((l: any) => l.levelNumber === student.level);
    if (!courseLevel) continue;
    
    const amount = courseLevel.feeAmount;
    
    await StudentCredit.create({
      studentId: student._id,
      studentName: student.studentName,
      transactionType: 'credit_added',
      amount,
      balanceBefore: balance,
      balanceAfter: balance + amount,
      description: `Payment for ${payment.dueDate ? payment.dueDate.toISOString().substring(0, 7) : 'N/A'}`,
      dueDate: payment.dueDate,
      paidDate: payment.paidDate,
      processedBy: adminUser._id,
      processedAt: payment.paidDate || new Date()
    });
    
    balance += amount;
  }
  
  if (balance > 0) {
    console.log(`✅ Created credits for ${student.studentName}: ${balance}`);
  }
}

/**
 * Main ingestion function
 */
async function ingestStudents(filePath: string) {
  console.log('🚀 Starting student ingestion...\n');
  
  const rows = parseExcelFile(filePath);
  const processedData: ProcessedStudent[] = [];
  
  // Process each row
  for (const row of rows) {
    const processed = processExcelRow(row);
    if (processed) {
      processedData.push(processed);
    }
  }
  
  console.log(`\n📊 Processed ${processedData.length} valid student records\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  // Ingest each student
  for (const data of processedData) {
    try {
      console.log(`\n➡️  Processing: ${data.name}`);
      
      // Handle discontinued students
      if (isDiscontinued(data.status)) {
        console.log(`⚠️  Student is discontinued - will mark as inactive`);
      }
      
      // Handle batch creation/assignment
      let batch = null;
      let batchId = null;
      
      if (data.batchCode && data.stage && data.levelNumber) {
        // Check if batch already exists with this code
        batch = await Batch.findOne({ batchCode: data.batchCode });
        
        if (batch) {
          // Existing batch found - only assign if it's active (has start date)
          if (batch.status === 'active') {
            batchId = batch._id;
            console.log(`✅ Assigning to existing ACTIVE batch: ${batch.batchCode}`);
          } else {
            console.log(`⚠️  Found DRAFT batch ${batch.batchCode} - student will have NO batch assignment (fees → credits)`);
          }
        } else {
          // Batch doesn't exist - create it
          if (data.batchStartDate && isValidDate(data.batchStartDate)) {
            // Has start date - create active batch and assign student
            batch = await createOrFindBatch(
              data.batchCode,
              data.timing,
              data.batchStartDate,
              data.stage,
              data.levelNumber
            );
            batchId = batch?._id || null;
            console.log(`📝 Created ACTIVE batch: ${batch?.batchCode}`);
          } else {
            // NO start date - create draft batch but DON'T assign student
            batch = await createOrFindBatch(
              data.batchCode,
              data.timing,
              data.batchStartDate,
              data.stage,
              data.levelNumber
            );
            console.log(`⚠️  Created DRAFT batch ${batch?.batchCode} - student will have NO batch assignment (fees → credits)`);
          }
        }
      }
      
      // Create student
      const student = await createStudent(data, batchId);

      // If student has batch assignment, handle fees
      if (batchId) {
        // First, create fee records for paid months if any payments exist
        if (data.payments.length > 0) {
          await createFeeRecords(
            student,
            data.payments,
            data.duration,
            data.stage!,
            data.levelNumber!
          );
        }

        // Then, fill in any missing fee records from feeCycleStartDate to current month
        // This ensures continuous fee records even if some months weren't paid
        const FeeService = (await import('../src/services/FeeService.js')).FeeService;
        const feeCycleStart = student.feeCycleStartDate || student.enrollmentDate;

        try {
          await FeeService.createInitialOverdueFeesForStudent(
            student._id.toString(),
            feeCycleStart,
            data.stage!
          );
          console.log(`✅ Filled missing fee records for ${student.studentName}`);
        } catch (feeError: any) {
          console.warn(`⚠️  Failed to fill missing fees for ${student.studentName}: ${feeError.message}`);
        }
      }
      // If NO batch assignment but has payments, create credits
      else if (!batchId && data.payments.length > 0) {
        await createCredits(student, data.payments);
      }
      
      // Handle discontinued students - remove pending fees (fees with no payment date)
      if (isDiscontinued(data.status)) {
        await FeeRecord.deleteMany({
          studentId: student._id,
          paymentDate: null // Pending/upcoming fees have no payment date
        });
        console.log(`✅ Removed pending fees for discontinued student`);
      }
      
      successCount++;
      
    } catch (error: any) {
      console.error(`❌ Error processing ${data.name}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n\n📊 INGESTION SUMMARY`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📊 Total: ${processedData.length}\n`);
}

/**
 * Main execution
 */
async function main() {
  const excelFilePath = process.argv[2] || path.join(__dirname, '/../../../Desktop/Student data_15-jan-2026.xlsx');
  
  if (!excelFilePath) {
    console.error('❌ Please provide path to Excel file');
    console.log('Usage: npm run ingest <path-to-excel-file>');
    process.exit(1);
  }
  
  try {
    await connectDB();
    await getAdminUser();
    await loadExistingBatchCodes();
    await ingestStudents(excelFilePath);
    
    console.log('\n✅ Ingestion completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Fatal error during ingestion:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ingestStudents };
