import xlsx from 'xlsx';
import path from 'path';
import mongoose, { Types } from 'mongoose';
import Course from '../../models/v2/Course.js';
import Batch from '../../models/v2/Batch.js';
import Student from '../../models/v2/Student.js';
import Enrollment from '../../models/v2/Enrollment.js';
import Invoice from '../../models/v2/Invoice.js';
import PaymentTransaction from '../../models/v2/PaymentTransaction.js';
import PaymentAllocation from '../../models/v2/PaymentAllocation.js';
import CreditLedger from '../../models/v2/CreditLedger.js';
import ImportRun, { IImportIssue } from '../../models/v2/ImportRun.js';
import { addCredit, createInvoice, processPayment } from './feeService.js';

type StageName = 'Beginner' | 'Intermediate' | 'Advanced';

interface RawRow {
  rowNumber: number;
  raw: Record<string, unknown>;
}

interface PaymentColumn {
  dueDate: Date | null;
  status: string;
  paidDate: Date | null;
}

interface NormalizedStudentRow {
  rowNumber: number;
  name: string;
  phone: string;
  email: string;
  status: string;
  studentStartDate: Date | null;
  levelCode: string;
  duration: number | null;
  batchCode: string;
  timing: string;
  batchStartDate: Date | null;
  stageNumber: number;
  levelNumber: number;
  payments: PaymentColumn[];
  isDiscontinued: boolean;
}

interface BatchGroup {
  key: string;
  batchCode: string;
  batchName: string;
  courseId: Types.ObjectId;
  stageNumber: number;
  levelNumber: number;
  startDate: Date | null;
  schedule: { dayOfWeek: number; startTime: string }[];
  status: 'active' | 'draft';
  rowNumbers: number[];
  batchId?: Types.ObjectId;
}

export interface ImportSummary {
  mode: 'dry-run' | 'apply';
  fileName: string;
  totalRows: number;
  validRows: number;
  createdStudents: number;
  createdBatches: number;
  createdEnrollments: number;
  createdInvoices: number;
  createdPayments: number;
  createdCredits: number;
  skippedRows: number;
  issues: IImportIssue[];
  importRunId?: string;
}

const STAGES: Record<string, { stageNumber: number; stageName: StageName }> = {
  B: { stageNumber: 1, stageName: 'Beginner' },
  I: { stageNumber: 2, stageName: 'Intermediate' },
  A: { stageNumber: 3, stageName: 'Advanced' },
};

const DEFAULT_FEES: Record<number, Record<number, number>> = {
  1: { 1: 2000, 2: 2500, 3: 2500 },
  2: { 1: 3000, 2: 3500, 3: 3500 },
  3: { 1: 4000, 2: 4500, 3: 4500 },
};

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'nan') return '';
  return text;
}

function cleanPhone(value: unknown): string {
  let digits = cleanString(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 && /^[6-9]/.test(digits) ? digits : '';
}

function cleanEmail(value: unknown): string {
  const email = cleanString(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function parseDate(value: unknown): Date | null {
  if (!value || String(value).toLowerCase() === 'nan') return null;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (['need', 'start', 'batch', 'tbd', 'pending'].some((word) => lower.includes(word))) return null;
    const dmy = lower.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) return new Date(Date.UTC(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1])));
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }
  if (typeof value === 'number') {
    const timestamp = Date.UTC(1900, 0, 1) + (value - 2) * 24 * 60 * 60 * 1000;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  return null;
}

function parseLevel(value: unknown): { stageNumber: number; levelNumber: number } | null {
  const text = cleanString(value).toUpperCase().replace(/\s+/g, '');
  const match = text.match(/^([BIA])(\d+)$/);
  if (!match) return null;
  const stage = STAGES[match[1]];
  if (!stage) return null;
  return { stageNumber: stage.stageNumber, levelNumber: parseInt(match[2]) };
}

function parseBatchCode(value: string): { batchCode: string; schedule: { dayOfWeek: number; startTime: string }[]; valid: boolean } {
  const batchCode = value.trim();
  const codeWithoutSuffix = batchCode.replace(/\([^)]*\)$/g, '').trim();
  const [dayCodeRaw, hourRaw, minuteRaw] = codeWithoutSuffix.split(':');
  if (!dayCodeRaw || !hourRaw || !minuteRaw) return { batchCode, schedule: [], valid: false };
  const dayMap: Record<string, number[]> = {
    M: [1], T: [2], W: [3], TH: [4], F: [5], S: [6], SU: [0],
    MW: [1, 3], WF: [3, 5], TT: [2, 4], SS: [6, 0], MWF: [1, 3, 5], TTH: [2, 4],
  };
  const days = dayMap[dayCodeRaw.toUpperCase()] ?? [];
  const hour = parseInt(hourRaw);
  const minute = parseInt(minuteRaw);
  if (!days.length || Number.isNaN(hour) || Number.isNaN(minute)) return { batchCode, schedule: [], valid: false };
  const hour24 = hour === 12 ? 12 : hour + 12;
  const startTime = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { batchCode, schedule: days.map((dayOfWeek) => ({ dayOfWeek, startTime })), valid: true };
}

function getCell(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return undefined;
}

function extractPayments(row: Record<string, unknown>): PaymentColumn[] {
  const payments: PaymentColumn[] = [];
  for (let index = 0; index < 40; index += 1) {
    const suffixes = index === 0 ? [''] : [`__${index}`, `.${index}`];
    const dueRaw = getCell(row, suffixes.map((suffix) => `Payment Due date${suffix}`));
    const statusRaw = getCell(row, suffixes.map((suffix) => `Payment Status${suffix}`));
    const paidRaw = getCell(row, suffixes.map((suffix) => `Payment date${suffix}`));
    if (dueRaw === undefined && statusRaw === undefined && paidRaw === undefined) {
      if (index > 0) break;
      continue;
    }
    const dueDate = parseDate(dueRaw);
    const paidDate = parseDate(paidRaw);
    const status = cleanString(statusRaw);
    if (dueDate || paidDate || status) payments.push({ dueDate, status, paidDate });
  }
  return payments;
}

function normalizeRows(rawRows: RawRow[]): { rows: NormalizedStudentRow[]; issues: IImportIssue[] } {
  const rows: NormalizedStudentRow[] = [];
  const issues: IImportIssue[] = [];
  const seen = new Set<string>();

  for (const row of rawRows) {
    const name = cleanString(getCell(row.raw, ['Name', 'Student Name']));
    if (!name) {
      issues.push({ rowNumber: row.rowNumber, severity: 'error', code: 'missing_name', message: 'Student name is missing' });
      continue;
    }
    const phone = cleanPhone(getCell(row.raw, ['Contact Number', 'Phone', 'Mobile']));
    const email = cleanEmail(getCell(row.raw, ['E-mail', 'Email']));
    if (!phone && !email) {
      issues.push({ rowNumber: row.rowNumber, rawName: name, severity: 'error', code: 'missing_contact', message: 'Valid phone or email is required' });
      continue;
    }
    const parsedLevel = parseLevel(getCell(row.raw, ['Level']));
    if (!parsedLevel) {
      issues.push({ rowNumber: row.rowNumber, rawName: name, severity: 'error', code: 'invalid_level', message: 'Level must look like B1, I2, or A3' });
      continue;
    }
    const identity = `${name.toLowerCase()}|${phone}|${email}`;
    if (seen.has(identity)) {
      issues.push({ rowNumber: row.rowNumber, rawName: name, severity: 'warning', code: 'duplicate_row', message: 'Duplicate student row in the same import run; skipped' });
      continue;
    }
    seen.add(identity);

    const status = cleanString(getCell(row.raw, ['Status']));
    rows.push({
      rowNumber: row.rowNumber,
      name,
      phone,
      email,
      status,
      studentStartDate: parseDate(getCell(row.raw, ['Student Start Date'])),
      levelCode: cleanString(getCell(row.raw, ['Level'])),
      duration: parseInt(cleanString(getCell(row.raw, ['Duration']))) || null,
      batchCode: cleanString(getCell(row.raw, ['Batch'])),
      timing: cleanString(getCell(row.raw, ['Timing'])),
      batchStartDate: parseDate(getCell(row.raw, ['Batch Start Date'])),
      ...parsedLevel,
      payments: extractPayments(row.raw),
      isDiscontinued: /discontin|stopped|left|withdrawn/i.test(status),
    });
  }

  return { rows, issues };
}

async function ensureChessCourse(adminUserId: string) {
  let course = await Course.findOne({ courseName: 'chess' });
  if (course) return course;
  course = await Course.create({
    courseName: 'chess',
    displayName: 'Chess',
    description: 'Chess training program',
    isActive: true,
    displayOrder: 1,
    stages: Object.values(STAGES).map((stage) => ({
      stageNumber: stage.stageNumber,
      stageName: stage.stageName,
      levels: [1, 2, 3].map((levelNumber) => ({
        levelNumber,
        feeAmount: DEFAULT_FEES[stage.stageNumber][levelNumber],
        durationMonths: 1,
        approximateHours: 0,
        description: `${stage.stageName} Level ${levelNumber}`,
      })),
    })),
    createdBy: new Types.ObjectId(adminUserId),
  });
  return course;
}

function buildBatchGroups(rows: NormalizedStudentRow[], courseId: Types.ObjectId, issues: IImportIssue[]): BatchGroup[] {
  const groups = new Map<string, BatchGroup>();
  const codeUse = new Map<string, number>();

  for (const row of rows) {
    if (!row.batchCode) continue;
    const parsed = parseBatchCode(row.batchCode);
    if (!parsed.valid) {
      issues.push({ rowNumber: row.rowNumber, rawName: row.name, severity: 'warning', code: 'invalid_batch', message: `Could not parse batch code "${row.batchCode}"` });
      continue;
    }
    const startKey = row.batchStartDate ? row.batchStartDate.toISOString().slice(0, 10) : 'NO_DATE';
    const key = `${parsed.batchCode}|${row.stageNumber}|${row.levelNumber}|${startKey}`;
    if (!groups.has(key)) {
      const useCount = codeUse.get(parsed.batchCode) ?? 0;
      codeUse.set(parsed.batchCode, useCount + 1);
      const finalCode = useCount === 0 ? parsed.batchCode : `${parsed.batchCode}-${useCount + 1}`;
      groups.set(key, {
        key,
        batchCode: finalCode,
        batchName: `Chess S${row.stageNumber} L${row.levelNumber} - ${parsed.batchCode}`,
        courseId,
        stageNumber: row.stageNumber,
        levelNumber: row.levelNumber,
        startDate: row.batchStartDate,
        schedule: parsed.schedule,
        status: row.batchStartDate ? 'active' : 'draft',
        rowNumbers: [],
      });
    }
    groups.get(key)!.rowNumbers.push(row.rowNumber);
  }

  return Array.from(groups.values());
}

function effectiveStart(row: NormalizedStudentRow, batch?: BatchGroup): Date {
  if (batch?.startDate) {
    if (row.studentStartDate && row.studentStartDate > batch.startDate) return row.studentStartDate;
    return batch.startDate;
  }
  return row.studentStartDate ?? new Date();
}

function latestPaymentMonth(row: NormalizedStudentRow): Date | null {
  const dates = row.payments.flatMap((p) => [p.dueDate, p.paidDate]).filter(Boolean) as Date[];
  if (!dates.length) return null;
  dates.sort((a, b) => b.getTime() - a.getTime());
  return new Date(Date.UTC(dates[0].getUTCFullYear(), dates[0].getUTCMonth(), 1));
}

async function resetFreshV2Data() {
  await Promise.all([
    Student.deleteMany({}),
    Course.deleteMany({}),
    Batch.deleteMany({}),
    Enrollment.deleteMany({}),
    Invoice.deleteMany({}),
    PaymentTransaction.deleteMany({}),
    PaymentAllocation.deleteMany({}),
    CreditLedger.deleteMany({}),
    ImportRun.deleteMany({}),
  ]);
}

export async function importExcel(params: {
  filePath: string;
  apply: boolean;
  resetFreshDb?: boolean;
  adminUserId: string;
  sheetName?: string;
}): Promise<ImportSummary> {
  const workbook = xlsx.readFile(params.filePath);
  const selectedSheetName = params.sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[selectedSheetName];
  if (!sheet) throw new Error(`Sheet not found: ${selectedSheetName}`);

  const raw = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const rawRows = raw.map((row, index) => ({ rowNumber: index + 2, raw: row }));
  const normalized = normalizeRows(rawRows);
  const summary: ImportSummary = {
    mode: params.apply ? 'apply' : 'dry-run',
    fileName: path.basename(params.filePath),
    totalRows: rawRows.length,
    validRows: normalized.rows.length,
    createdStudents: 0,
    createdBatches: 0,
    createdEnrollments: 0,
    createdInvoices: 0,
    createdPayments: 0,
    createdCredits: 0,
    skippedRows: rawRows.length - normalized.rows.length,
    issues: normalized.issues,
  };

  if (!params.apply) {
    const fakeCourseId = new Types.ObjectId();
    buildBatchGroups(normalized.rows, fakeCourseId, summary.issues);
    return summary;
  }

  let importRun = await ImportRun.create({
    fileName: summary.fileName,
    mode: 'apply',
    status: 'running',
    totalRows: summary.totalRows,
    skippedRows: summary.skippedRows,
    issues: summary.issues,
    startedBy: new Types.ObjectId(params.adminUserId),
  });
  summary.importRunId = importRun._id.toString();

  try {
    if (params.resetFreshDb) await resetFreshV2Data();
    const course = await ensureChessCourse(params.adminUserId);
    const batchGroups = buildBatchGroups(normalized.rows, course._id as Types.ObjectId, summary.issues);
    const groupByRow = new Map<number, BatchGroup>();

    for (const group of batchGroups) {
      const existing = await Batch.findOne({ batchCode: group.batchCode });
      if (existing) {
        group.batchId = existing._id as Types.ObjectId;
      } else {
        const batch = await Batch.create({
          batchName: group.batchName,
          batchCode: group.batchCode,
          courseId: group.courseId,
          stageNumber: group.stageNumber,
          levelNumber: group.levelNumber,
          maxStudents: null,
          schedule: group.schedule,
          status: group.status,
          startDate: group.startDate ?? new Date(),
          endDate: null,
          description: group.batchCode,
          createdBy: new Types.ObjectId(params.adminUserId),
        });
        group.batchId = batch._id as Types.ObjectId;
        summary.createdBatches += 1;
      }
      for (const rowNumber of group.rowNumbers) groupByRow.set(rowNumber, group);
    }

    for (const row of normalized.rows) {
      const session = await mongoose.startSession();
      session.startTransaction();
      let committed = false;
      try {
        const group = groupByRow.get(row.rowNumber);
        const activeBatch = group?.status === 'active' ? group : undefined;
        const startDate = effectiveStart(row, activeBatch);
        const stage = course.stages.find((s) => s.stageNumber === row.stageNumber);
        const level = stage?.levels.find((l) => l.levelNumber === row.levelNumber);
        if (!level) throw new Error(`No configured fee for stage ${row.stageNumber} level ${row.levelNumber}`);

        const [student] = await Student.create([{
          studentName: row.name,
          phone: row.phone || undefined,
          email: row.email || undefined,
          courseId: course._id,
          stageNumber: row.stageNumber,
          levelNumber: row.levelNumber,
          batchId: activeBatch?.batchId ?? null,
          enrollmentDate: startDate,
          isActive: !row.isDiscontinued,
          creditBalance: 0,
        }], { session });

        const enrollmentEnd = row.isDiscontinued ? (latestPaymentMonth(row) ?? startDate) : null;
        // Reserve a batch seat for active enrollments (discontinued students get a
        // closed enrollment, so they never occupy a seat). Keeps filledSeats in
        // sync with the seat counters maintained by the lifecycle transitions.
        if (activeBatch?.batchId && !enrollmentEnd) {
          await Batch.updateOne(
            { _id: activeBatch.batchId },
            { $inc: { filledSeats: 1 } },
            { session },
          );
        }
        const [enrollment] = await Enrollment.create([{
          studentId: student._id,
          batchId: activeBatch?.batchId ?? null,
          courseId: course._id,
          stageNumber: row.stageNumber,
          levelNumber: row.levelNumber,
          monthlyFee: level.feeAmount,
          discountPct: 0,
          discountReason: '',
          startDate,
          endDate: enrollmentEnd,
          endReason: enrollmentEnd ? 'left' : null,
          pausedUntil: null,
          createdBy: new Types.ObjectId(params.adminUserId),
        }], { session });

        await Student.findByIdAndUpdate(
          student._id,
          { $set: { currentEnrollmentId: enrollmentEnd ? null : enrollment._id } },
          { session },
        );

        await session.commitTransaction();
        committed = true;
        summary.createdStudents += 1;
        summary.createdEnrollments += 1;

        if (!activeBatch) {
          for (const payment of row.payments.filter((p) => p.paidDate)) {
            await addCredit(
              student._id.toString(),
              level.feeAmount,
              `Unapplied imported payment${payment.paidDate ? ` on ${payment.paidDate.toISOString().slice(0, 10)}` : ''}`,
              params.adminUserId,
              {
                paymentMethod: 'other',
                paymentDate: payment.paidDate ?? new Date(),
                idempotencyKey: `import:${summary.fileName}:${row.rowNumber}:${payment.paidDate?.toISOString().slice(0, 10) ?? 'nodate'}`,
                createdBySource: 'import',
              },
            );
            summary.createdCredits += 1;
          }
          continue;
        }

        const latest = latestPaymentMonth(row);
        const durationMonths = row.duration ?? level.durationMonths ?? 1;
        const durationEnd = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + durationMonths - 1, 1));
        const currentMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
        const through = row.isDiscontinued ? (latest ?? durationEnd) : new Date(Math.max(durationEnd.getTime(), latest?.getTime() ?? 0, currentMonth.getTime()));

        const invoiceByMonth = new Map<string, string>();
        let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
        while (cursor <= through) {
          const invoice = await createInvoice({
            studentId: student._id.toString(),
            enrollmentId: enrollment._id.toString(),
            invoiceMonth: cursor,
            amount: level.feeAmount,
            createdBy: params.adminUserId,
            createdBySource: 'import',
          });
          invoiceByMonth.set(cursor.toISOString().slice(0, 7), invoice._id.toString());
          summary.createdInvoices += 1;
          cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
        }

        for (const payment of row.payments.filter((p) => p.paidDate)) {
          const monthDate = payment.dueDate ?? payment.paidDate;
          if (!monthDate) continue;
          const key = monthDate.toISOString().slice(0, 7);
          const invoiceId = invoiceByMonth.get(key);
          if (!invoiceId) {
            await addCredit(student._id.toString(), level.feeAmount, `Unmapped imported payment for ${key}`, params.adminUserId, {
              paymentMethod: 'other',
              paymentDate: payment.paidDate ?? new Date(),
              idempotencyKey: `import:${summary.fileName}:${row.rowNumber}:${key}`,
              createdBySource: 'import',
            });
            summary.createdCredits += 1;
            summary.issues.push({ rowNumber: row.rowNumber, rawName: row.name, severity: 'warning', code: 'unmapped_payment', message: `Payment for ${key} could not be mapped to an invoice` });
            continue;
          }
          await processPayment(
            student._id.toString(),
            level.feeAmount,
            [invoiceId],
            'other',
            params.adminUserId,
            undefined,
            {
              paymentDate: payment.paidDate ?? new Date(),
              idempotencyKey: `import:${summary.fileName}:${row.rowNumber}:${key}`,
              createdBySource: 'import',
            },
          );
          summary.createdPayments += 1;
        }
      } catch (error: any) {
        if (!committed) await session.abortTransaction();
        summary.skippedRows += 1;
        summary.issues.push({ rowNumber: row.rowNumber, rawName: row.name, severity: 'error', code: 'row_apply_failed', message: error.message });
      } finally {
        session.endSession();
      }
    }

    importRun.set({
      status: 'completed',
      finishedAt: new Date(),
      createdStudents: summary.createdStudents,
      createdBatches: summary.createdBatches,
      createdEnrollments: summary.createdEnrollments,
      createdInvoices: summary.createdInvoices,
      createdPayments: summary.createdPayments,
      createdCredits: summary.createdCredits,
      skippedRows: summary.skippedRows,
      issues: summary.issues,
    });
    await importRun.save();
    return summary;
  } catch (error: any) {
    importRun.set({ status: 'failed', finishedAt: new Date(), error: error.message, issues: summary.issues });
    await importRun.save();
    throw error;
  }
}
