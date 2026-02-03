/**
 * Verify and Fix Batches and Fees from Excel (Source of Truth)
 * 
 * This comprehensive script reconciles database state with Excel data.
 * 
 * Usage:
 * - Dry run: npm run verify-from-excel -- --dry-run
 * - Live run: npm run verify-from-excel
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
  parseExcelDate,
  isDiscontinued,
  cleanPhoneNumber,
  cleanEmail,
  parseCourseLevel,
  isValidDate
} from '../src/utils/batchParser.js';
import { FeeService } from '../src/services/FeeService.js';
import { config } from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const EXCEL_FILE_PATH = path.join(__dirname, '/../../../Desktop/Student data_15-jan-2026.xlsx');

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
  [key: string]: any;
}

interface PaymentRecord {
  dueDate: Date | null;
  status: string;
  paidDate: Date | null;
}

interface ExcelStudentData {
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

interface BatchInfo {
  baseBatchCode: string;
  batchStartDate: Date | null;
  stage: string;
  level: number;
  timing: string;
  students: ExcelStudentData[];
  finalBatchCode?: string;
}

let adminUser: any;

async function connectDB(): Promise<void> {
  const mongoUri = config.mongoUri;
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');
}

async function getAdminUser(): Promise<void> {
  adminUser = await User.findOne({ role: 'superadmin' });
  if (!adminUser) {
    adminUser = await User.create({
      username: 'system',
      email: 'system@lms.com',
      password: 'temp123',
      role: 'super_admin',
      isActive: true
    });
  }
  console.log('✅ Admin user loaded:', adminUser.username);
}

function parseExcelFile(filePath: string): ExcelRow[] {
  console.log(`\n📖 Reading Excel file: ${filePath}`);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: ExcelRow[] = xlsx.utils.sheet_to_json(sheet);
  console.log(`✅ Parsed ${data.length} rows from Excel`);
  return data;
}

function extractPaymentRecords(row: ExcelRow, studentStartDate: Date | null, batchStartDate: Date | null): PaymentRecord[] {
  const payments: PaymentRecord[] = [];
  let index = 0;
  
  // Determine fee cycle start (used to calculate missing due dates)
  let feeCycleStart: Date | null = null;
  if (batchStartDate) {
    if (studentStartDate && studentStartDate > batchStartDate) {
      feeCycleStart = studentStartDate; // Student joined after batch started
    } else {
      feeCycleStart = batchStartDate; // Student joined on/before batch started
    }
  } else if (studentStartDate) {
    feeCycleStart = studentStartDate;
  }
  
  while (true) {
    const dueDateKey = `Payment Due date${index > 0 ? '__' + index : ''}`;
    const actualDueDateKey = index === 0 ? 'Payment Due date' : dueDateKey;
    const actualStatusKey = index === 0 ? 'Payment Status' : `Payment Status${index > 0 ? '__' + index : ''}`;
    const actualPaidDateKey = index === 0 ? 'Payment date' : `Payment date${index > 0 ? '__' + index : ''}`;
    
    if (!(dueDateKey in row) && !(`Payment Due date` in row && index === 0)) break;
    
    let dueDate = parseExcelDate(row[actualDueDateKey]);
    const status = row[actualStatusKey]?.toString().trim() || '';
    const paidDate = parseExcelDate(row[actualPaidDateKey]);
    
    // If paidDate exists but dueDate is missing, calculate it
    if (paidDate && !dueDate && feeCycleStart) {
      // Calculate which month this payment is for based on paid date
      const paidMonth = new Date(Date.UTC(paidDate.getUTCFullYear(), paidDate.getUTCMonth(), 1));
      
      // Due date = first day of paid month + cycle day
      const cycleDay = feeCycleStart.getUTCDate();
      dueDate = new Date(Date.UTC(paidMonth.getUTCFullYear(), paidMonth.getUTCMonth(), cycleDay));
    }
    
    if (dueDate || paidDate) {
      payments.push({ dueDate, status, paidDate });
    }
    
    index++;
    if (index > 20) break;
  }
  
  return payments;
}

function processExcelData(rows: ExcelRow[]): ExcelStudentData[] {
  const students: ExcelStudentData[] = [];
  
  for (const row of rows) {
    const name = row['Name']?.toString().trim();
    if (!name) continue;
    
    const { stage, level: levelNumber } = parseCourseLevel(row['Level']?.toString().trim() || '');
    const studentStartDate = parseExcelDate(row['Student Start Date']);
    const batchStartDate = parseExcelDate(row['Batch Start Date']);
    
    students.push({
      name,
      phone: cleanPhoneNumber(row['Contact Number']),
      email: cleanEmail(row['E-mail']),
      status: row['Status']?.toString().trim() || '',
      studentStartDate,
      level: row['Level']?.toString().trim() || '',
      duration: row['Duration'] ? parseInt(row['Duration'].toString(), 10) : null,
      batchCode: row['Batch']?.toString().trim() || '',
      timing: row['Timing']?.toString().trim() || '',
      batchStartDate,
      payments: extractPaymentRecords(row, studentStartDate, batchStartDate),
      stage,
      levelNumber
    });
  }
  
  return students;
}

function groupIntoBatches(students: ExcelStudentData[]): Map<string, BatchInfo> {
  const batches = new Map<string, BatchInfo>();
  
  for (const student of students) {
    if (!student.batchCode || !student.stage || !student.levelNumber) continue;
    
    const parsedBatch = parseBatchCode(student.batchCode);
    if (!parsedBatch.isValid) continue;
    
    const startDateKey = student.batchStartDate 
      ? student.batchStartDate.toISOString().split('T')[0]
      : 'NO_DATE';
    const key = `${parsedBatch.batchCode}|${startDateKey}|${student.stage}|${student.levelNumber}`;
    
    if (!batches.has(key)) {
      batches.set(key, {
        baseBatchCode: parsedBatch.batchCode,
        batchStartDate: student.batchStartDate,
        stage: student.stage,
        level: student.levelNumber,
        timing: student.timing,
        students: []
      });
    }
    
    batches.get(key)!.students.push(student);
  }
  
  console.log(`\n📊 Grouped into ${batches.size} unique batches`);
  return batches;
}

async function generateUniqueBatchCode(baseBatchCode: string, batchStartDate: Date | null, stage: string, level: number): Promise<string> {
  const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  
  for (let i = 0; i < romanNumerals.length; i++) {
    const testCode = i === 0 ? baseBatchCode : `${baseBatchCode}-${romanNumerals[i]}`;
    const existing = await Batch.findOne({ batchCode: testCode });
    
    if (!existing) return testCode;
    
    const existingDate = existing.startDate ? new Date(existing.startDate).toISOString().split('T')[0] : null;
    const ourDate = batchStartDate ? batchStartDate.toISOString().split('T')[0] : null;
    
    if (existingDate === ourDate && existing.stage === stage && existing.level === level) {
      return testCode;
    }
  }
  
  let suffix = 11;
  while (true) {
    const testCode = `${baseBatchCode}-${suffix}`;
    if (!await Batch.findOne({ batchCode: testCode })) return testCode;
    suffix++;
  }
}

async function verifyAndFixBatches(batchesMap: Map<string, BatchInfo>, dryRun: boolean): Promise<void> {
  console.log('\n� PHASE 1: Verifying and fixing batches...\n');
  
  for (const [key, batchInfo] of batchesMap) {
    console.log(`\n➡️  Batch: ${batchInfo.baseBatchCode} (${batchInfo.stage} L${batchInfo.level})`);
    
    const finalCode = await generateUniqueBatchCode(
      batchInfo.baseBatchCode,
      batchInfo.batchStartDate,
      batchInfo.stage,
      batchInfo.level
    );
    
    batchInfo.finalBatchCode = finalCode;
    
    const existingBatch = await Batch.findOne({ batchCode: finalCode });
    const isDraft = !batchInfo.batchStartDate || !isValidDate(batchInfo.batchStartDate);
    
    if (existingBatch) {
      const updates: any = {};
      
      if (existingBatch.stage !== batchInfo.stage) updates.stage = batchInfo.stage;
      if (existingBatch.level !== batchInfo.level) updates.level = batchInfo.level;
      
      if (!isDraft) {
        const existingDate = existingBatch.startDate ? new Date(existingBatch.startDate).toISOString().split('T')[0] : null;
        const excelDate = batchInfo.batchStartDate!.toISOString().split('T')[0];
        
        if (existingDate !== excelDate) updates.startDate = batchInfo.batchStartDate;
        if (existingBatch.status !== 'active') updates.status = 'active';
      } else {
        if (existingBatch.status !== 'draft') updates.status = 'draft';
      }
      
      if (Object.keys(updates).length > 0) {
        console.log(`   📝 Updating batch: ${JSON.stringify(updates)}`);
        if (!dryRun) await Batch.updateOne({ _id: existingBatch._id }, { $set: updates });
      } else {
        console.log(`   ✅ Batch already correct`);
      }
    } else {
      console.log(`   ➕ Creating ${isDraft ? 'DRAFT' : 'ACTIVE'} batch: ${finalCode}`);
      
      if (!dryRun) {
        const parsedBatch = parseBatchCode(batchInfo.baseBatchCode);
        const dayNameToNumber: { [key: string]: number } = {
          'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
          'thursday': 4, 'friday': 5, 'saturday': 6
        };
        
        const scheduleEntries = parsedBatch.days.map(day => ({
          dayOfWeek: dayNameToNumber[day.toLowerCase()],
          startTime: parsedBatch.time
        }));
        
        await Batch.create({
          batchCode: finalCode,
          batchName: `${batchInfo.stage.charAt(0).toUpperCase() + batchInfo.stage.slice(1)} ${batchInfo.level} - ${parsedBatch.timing}`,
          stage: batchInfo.stage,
          level: batchInfo.level,
          schedule: scheduleEntries,
          description: batchInfo.timing || parsedBatch.timing,
          status: isDraft ? 'draft' : 'active',
          startDate: batchInfo.batchStartDate || new Date(),
          maxStudents: null,
          createdBy: adminUser._id
        });
      }
    }
  }
}

async function verifyAndFixStudentsAndFees(batchesMap: Map<string, BatchInfo>, allStudents: ExcelStudentData[], dryRun: boolean): Promise<void> {
  console.log('\n🔍 PHASE 2: Verifying students and regenerating fees...\n');
  
  for (const studentData of allStudents) {
    console.log(`\n➡️  Student: ${studentData.name}`);
    
    const student = await Student.findOne({ studentName: studentData.name });
    
    if (!student) {
      console.log(`   ⚠️  Not found in database - skipping`);
      continue;
    }
    
    const isDraft = !studentData.batchStartDate || !isValidDate(studentData.batchStartDate);
    const updates: any = {};
    
    // Find final batch code
    let finalBatchCode: string | null = null;
    for (const [key, batchInfo] of batchesMap) {
      if (batchInfo.students.some(s => s.name === studentData.name)) {
        finalBatchCode = batchInfo.finalBatchCode || null;
        break;
      }
    }
    
    // Handle batch assignment
    if (!isDraft && finalBatchCode) {
      const batch = await Batch.findOne({ batchCode: finalBatchCode });
      if (batch && (!student.batchId || student.batchId.toString() !== batch._id.toString())) {
        updates.batchId = batch._id;
        updates.batch = batch.batchName;
      }
      
      // Set fee cycle start date based on CORRECT LOGIC:
      // 1. If student has explicit start date AND it's AFTER batch start -> use student start date
      // 2. Otherwise, use batch start date (student joined on/before batch started)
      let feeCycleStartDate: Date | null = null;
      
      if (studentData.batchStartDate) {
        if (studentData.studentStartDate && studentData.studentStartDate > studentData.batchStartDate) {
          // Student joined AFTER batch started -> fee cycle from student start
          feeCycleStartDate = studentData.studentStartDate;
        } else {
          // Student joined ON or BEFORE batch started -> fee cycle from batch start
          feeCycleStartDate = studentData.batchStartDate;
        }
      } else if (studentData.studentStartDate) {
        // No batch start date, use student start date
        feeCycleStartDate = studentData.studentStartDate;
      }
      
      if (feeCycleStartDate) {
        const currentCycleDate = student.feeCycleStartDate ? new Date(student.feeCycleStartDate).toISOString().split('T')[0] : null;
        const newCycleDate = feeCycleStartDate.toISOString().split('T')[0];
        
        if (currentCycleDate !== newCycleDate) {
          updates.feeCycleStartDate = feeCycleStartDate;
        }
      }
    } else if (isDraft && student.batchId) {
      updates.batchId = null;
      updates.batch = 'Not Assigned';
    }
    
    if (student.stage !== studentData.stage) updates.stage = studentData.stage;
    if (student.level !== studentData.levelNumber) updates.level = studentData.levelNumber;
    
    if (Object.keys(updates).length > 0) {
      console.log(`   📝 Updating student: ${JSON.stringify(updates)}`);
      if (!dryRun) await Student.updateOne({ _id: student._id }, { $set: updates });
      
      // Refresh student data after update
      if (!dryRun) {
        const updatedStudent = await Student.findById(student._id);
        if (updatedStudent) {
          student.feeCycleStartDate = updatedStudent.feeCycleStartDate;
          student.stage = updatedStudent.stage;
          student.level = updatedStudent.level;
          student.batchId = updatedStudent.batchId;
        }
      }
    }
    
    // Audit and regenerate fees
    if (!isDraft && studentData.stage && (student.feeCycleStartDate || updates.feeCycleStartDate)) {
      const cycleStart = updates.feeCycleStartDate || student.feeCycleStartDate;
      
      // Audit existing fees
      const existingFees = await FeeRecord.find({ studentId: student._id }).sort({ feeMonth: 1 });
      console.log(`   📊 Existing fees: ${existingFees.length} records`);
      
      // Check for issues
      const issues: string[] = [];
      
      if (existingFees.length > 0) {
        // Check continuity
        const months = existingFees.map(f => f.feeMonth);
        const startMonth = new Date(cycleStart);
        const now = new Date();
        
        let currentCheck = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth(), 1));
        const endCheck = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        
        while (currentCheck <= endCheck) {
          const monthKey = `${currentCheck.getUTCFullYear()}-${String(currentCheck.getUTCMonth() + 1).padStart(2, '0')}`;
          if (!months.includes(monthKey)) {
            issues.push(`Missing month: ${monthKey}`);
          }
          currentCheck.setUTCMonth(currentCheck.getUTCMonth() + 1);
        }
        
        // Check payment dates match Excel
        for (const payment of studentData.payments) {
          if (payment.paidDate) {
            const monthKey = `${payment.paidDate.getUTCFullYear()}-${String(payment.paidDate.getUTCMonth() + 1).padStart(2, '0')}`;
            const feeRecord = existingFees.find(f => f.feeMonth === monthKey);
            
            if (!feeRecord) {
              issues.push(`Payment in Excel but no fee record: ${monthKey}`);
            } else if (!feeRecord.paymentDate) {
              issues.push(`Fee exists but not marked paid: ${monthKey}`);
            }
          }
        }
      } else {
        issues.push('No fee records exist');
      }
      
      if (issues.length > 0) {
        console.log(`   ⚠️  Fee issues found: ${issues.length}`);
        issues.forEach(issue => console.log(`      - ${issue}`));
      }
      
      // Regenerate fees
      if (!dryRun) {
        console.log(`   🔄 Deleting ${existingFees.length} existing fees and regenerating...`);
        console.log(`   📅 Fee cycle start: ${cycleStart.toISOString().split('T')[0]}`);
        console.log(`   📋 Excel payment records: ${studentData.payments.length}`);
        studentData.payments.forEach((p, idx) => {
          console.log(`      ${idx + 1}. Due: ${p.dueDate?.toISOString().split('T')[0] || 'N/A'}, Paid: ${p.paidDate?.toISOString().split('T')[0] || 'N/A'}, Status: ${p.status}`);
        });
        
        // Delete all existing fees
        await FeeRecord.deleteMany({ studentId: student._id });
        
        // Get course fee amount
        const course = await Course.findOne({ courseName: studentData.stage });
        if (!course) {
          console.error(`   ❌ Course not found: ${studentData.stage}`);
          continue;
        }
        
        const courseLevel = course.levels.find((l: any) => l.levelNumber === studentData.levelNumber);
        if (!courseLevel) {
          console.error(`   ❌ Level ${studentData.levelNumber} not found for course ${studentData.stage}`);
          continue;
        }
        
        const feeAmount = courseLevel.feeAmount;
        const totalCourseDuration = studentData.duration || courseLevel.durationMonths;
        
        // Calculate how many months remain from student's join date
        // If batch started before student joined, student misses those months
        const batchStart = studentData.batchStartDate!;
        const studentJoin = cycleStart; // This is already the student's effective start date
        
        // Calculate months between batch start and student join
        const monthsBetween = (studentJoin.getUTCFullYear() - batchStart.getUTCFullYear()) * 12 + 
                             (studentJoin.getUTCMonth() - batchStart.getUTCMonth());
        
        // Remaining duration = total duration - months already passed in batch
        const remainingDuration = Math.max(1, totalCourseDuration - monthsBetween);
        
        console.log(`   📊 Course duration calculation:`);
        console.log(`      - Total course duration: ${totalCourseDuration} months`);
        console.log(`      - Batch started: ${batchStart.toISOString().split('T')[0]}`);
        console.log(`      - Student joined: ${studentJoin.toISOString().split('T')[0]}`);
        console.log(`      - Months student missed: ${monthsBetween}`);
        console.log(`      - Remaining duration for student: ${remainingDuration} months`);
        
        // Create fee records from cycle start for the remaining duration
        const startMonth = new Date(cycleStart);
        let currentMonth = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth(), 1));
        
        let createdCount = 0;
        let paidCount = 0;
        
        while (createdCount < remainingDuration) {
          const monthKey = `${currentMonth.getUTCFullYear()}-${String(currentMonth.getUTCMonth() + 1).padStart(2, '0')}`;
          
          // Check if this month was paid in Excel
          // Try multiple matching strategies:
          // 1. Match by due date month
          // 2. Match by paid date month (if no due date match found)
          let payment = studentData.payments.find(p => {
            if (p.dueDate) {
              const paymentMonthKey = `${p.dueDate.getUTCFullYear()}-${String(p.dueDate.getUTCMonth() + 1).padStart(2, '0')}`;
              return paymentMonthKey === monthKey;
            }
            return false;
          });
          
          // If no match by due date, try matching by paid date
          if (!payment) {
            payment = studentData.payments.find(p => {
              if (p.paidDate) {
                const paidMonthKey = `${p.paidDate.getUTCFullYear()}-${String(p.paidDate.getUTCMonth() + 1).padStart(2, '0')}`;
                return paidMonthKey === monthKey;
              }
              return false;
            });
          }
          
          if (payment) {
            console.log(`      ✓ Matched payment for ${monthKey}: Due ${payment.dueDate?.toISOString().split('T')[0] || 'N/A'}, Paid ${payment.paidDate?.toISOString().split('T')[0] || 'N/A'}`);
          }
          
          // Calculate due date for this month
          // Due date = same day of month as fee cycle start (in UTC to avoid timezone shifts)
          const cycleDay = startMonth.getUTCDate();
          const dueDate = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth(), cycleDay));
          
          // Create fee record
          const feeRecord = {
            studentId: student._id,
            studentName: student.studentName,
            stage: studentData.stage,
            level: studentData.levelNumber,
            feeMonth: monthKey,
            dueDate: dueDate,
            feeAmount: feeAmount,
            paidAmount: payment?.paidDate ? feeAmount : 0,
            paymentDate: payment?.paidDate || null,
            paymentMethod: payment?.paidDate ? 'other' : undefined,
            updatedBy: adminUser._id
          };
          
          await FeeRecord.create(feeRecord);
          
          console.log(`      Created ${monthKey}: ${payment?.paidDate ? 'PAID' : 'PENDING'} (Due: ${dueDate.toISOString().split('T')[0]})`);
          
          createdCount++;
          if (payment?.paidDate) paidCount++;
          
          currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
        }
        
        console.log(`   ✅ Created ${createdCount} fee records (${paidCount} paid, ${createdCount - paidCount} pending)`);
      }
    } else if (isDraft) {
      // Student in draft batch - should have credits instead
      const existingFees = await FeeRecord.find({ studentId: student._id });
      if (existingFees.length > 0 && !dryRun) {
        console.log(`   🗑️  Removing ${existingFees.length} fee records (student in draft batch)`);
        await FeeRecord.deleteMany({ studentId: student._id });
      }
    }
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log('🚀 Starting verification and fix process...');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE RUN'}\n`);
  
  try {
    await connectDB();
    await getAdminUser();
    
    const rows = parseExcelFile(EXCEL_FILE_PATH);
    const students = processExcelData(rows);
    const batchesMap = groupIntoBatches(students);
    
    await verifyAndFixBatches(batchesMap, dryRun);
    await verifyAndFixStudentsAndFees(batchesMap, students, dryRun);
    
    console.log('\n✅ Verification and fix completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
