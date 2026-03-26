/**
 * LEDGER SERVICE
 *
 * The ONLY place where balance computation logic lives.
 * Never compute balances inline in controllers — always use this service.
 *
 * Core principle:
 *   balance = sum(credits) - sum(debits)   [excluding void entries]
 *
 *   Positive balance → student has CREDIT (overpaid / advance payment)
 *   Negative balance → student OWES money (underpaid)
 *   Zero balance    → fully settled
 *
 * This mirrors how Stripe, QuickBooks, and other financial systems work.
 */

import mongoose, { Types } from 'mongoose';
import Ledger, { ILedger } from '../../models/v2/Ledger.js';
import Invoice from '../../models/v2/Invoice.js';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface StudentBalance {
  studentId: string;
  totalDebits: number;    // Sum of all charges (money owed by student)
  totalCredits: number;   // Sum of all payments + refunds (money paid / returned)
  balance: number;        // credits - debits  (positive = overpaid / credit, negative = owes)
  currency: string;
}

export interface UserBalance {
  userId: string;
  perStudent: StudentBalance[];
  totalDebits: number;
  totalCredits: number;
  balance: number;        // Aggregate across all children
  currency: string;
}

export interface LedgerEntryInput {
  studentId: Types.ObjectId;
  userId: Types.ObjectId;
  enrollmentId?: Types.ObjectId;
  type: ILedger['type'];
  direction: ILedger['direction'];
  amount: number;
  description: string;
  referenceType: ILedger['referenceType'];
  referenceId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdBy: Types.ObjectId;
}

export interface InvoiceWithStatus {
  invoiceId: string;
  invoiceNumber: string;
  netAmount: number;
  totalCharged: number;   // From ledger (should equal netAmount unless voided)
  totalPaid: number;      // Portion of payments attributable to this invoice
  outstanding: number;    // netAmount - totalPaid (approximation)
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  description: string;
  isVoid: boolean;
}

const CURRENCY = 'INR';

// ─────────────────────────────────────────────────────────────────
// Balance Computation
// ─────────────────────────────────────────────────────────────────

/**
 * Compute the running balance for a single student.
 *
 * Algorithm:
 *   1. Fetch all non-void ledger entries for the student
 *   2. Sum debits (charges) and credits (payments, refunds, adjustments)
 *   3. balance = credits - debits
 *
 * This is pure aggregation — O(n) in ledger entries for this student.
 * For production scale, consider a pre-aggregated snapshot + delta approach.
 */
export async function getStudentBalance(studentId: Types.ObjectId): Promise<StudentBalance> {
  const result = await Ledger.aggregate([
    {
      $match: {
        studentId,
        isVoid: false,
      },
    },
    {
      $group: {
        _id: null,
        totalDebits: {
          $sum: {
            $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', 0],
          },
        },
        totalCredits: {
          $sum: {
            $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0],
          },
        },
      },
    },
  ]);

  const row = result[0] ?? { totalDebits: 0, totalCredits: 0 };
  return {
    studentId: studentId.toString(),
    totalDebits: row.totalDebits,
    totalCredits: row.totalCredits,
    balance: row.totalCredits - row.totalDebits,
    currency: CURRENCY,
  };
}

/**
 * Compute balance for ALL students under a parent account.
 * Returns per-student breakdown AND aggregate total.
 */
export async function getUserBalance(userId: Types.ObjectId): Promise<UserBalance> {
  const result = await Ledger.aggregate([
    {
      $match: {
        userId,
        isVoid: false,
      },
    },
    {
      $group: {
        _id: '$studentId',
        totalDebits: {
          $sum: {
            $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', 0],
          },
        },
        totalCredits: {
          $sum: {
            $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0],
          },
        },
      },
    },
  ]);

  const perStudent: StudentBalance[] = result.map((row) => ({
    studentId: row._id.toString(),
    totalDebits: row.totalDebits,
    totalCredits: row.totalCredits,
    balance: row.totalCredits - row.totalDebits,
    currency: CURRENCY,
  }));

  const totalDebits = perStudent.reduce((s, r) => s + r.totalDebits, 0);
  const totalCredits = perStudent.reduce((s, r) => s + r.totalCredits, 0);

  return {
    userId: userId.toString(),
    perStudent,
    totalDebits,
    totalCredits,
    balance: totalCredits - totalDebits,
    currency: CURRENCY,
  };
}

/**
 * Recompute balance at a specific point in time.
 * Useful for auditing historical state.
 */
export async function getStudentBalanceAt(
  studentId: Types.ObjectId,
  asOf: Date
): Promise<StudentBalance> {
  const result = await Ledger.aggregate([
    {
      $match: {
        studentId,
        isVoid: false,
        createdAt: { $lte: asOf },
      },
    },
    {
      $group: {
        _id: null,
        totalDebits: {
          $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', 0] },
        },
        totalCredits: {
          $sum: { $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0] },
        },
      },
    },
  ]);

  const row = result[0] ?? { totalDebits: 0, totalCredits: 0 };
  return {
    studentId: studentId.toString(),
    totalDebits: row.totalDebits,
    totalCredits: row.totalCredits,
    balance: row.totalCredits - row.totalDebits,
    currency: CURRENCY,
  };
}

// ─────────────────────────────────────────────────────────────────
// Ledger Entry Creation (write operations)
// ─────────────────────────────────────────────────────────────────

/**
 * Create a single ledger entry.
 * All financial writes MUST go through this function — never save Ledger directly.
 */
export async function createLedgerEntry(input: LedgerEntryInput): Promise<ILedger> {
  if (input.amount < 0) {
    throw new Error('Ledger amount must be non-negative. Use direction to encode sign.');
  }

  const entry = new Ledger({
    studentId: input.studentId,
    userId: input.userId,
    enrollmentId: input.enrollmentId ?? null,
    type: input.type,
    direction: input.direction,
    amount: input.amount,
    description: input.description,
    referenceType: input.referenceType,
    referenceId: input.referenceId ?? null,
    metadata: input.metadata ?? {},
    isVoid: false,
    createdBy: input.createdBy,
  });

  return entry.save();
}

/**
 * Record a payment received.
 * Optionally link to an invoice via referenceId.
 */
export async function recordPayment(params: {
  studentId: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  description: string;
  referenceId?: Types.ObjectId;       // Invoice._id if paying specific invoice
  enrollmentId?: Types.ObjectId;
  metadata?: Record<string, unknown>; // e.g. { mode: 'UPI', upiRef: 'TX12345' }
  createdBy: Types.ObjectId;
}): Promise<ILedger> {
  return createLedgerEntry({
    studentId: params.studentId,
    userId: params.userId,
    enrollmentId: params.enrollmentId,
    type: 'payment',
    direction: 'credit',
    amount: params.amount,
    description: params.description,
    referenceType: params.referenceId ? 'invoice' : 'manual',
    referenceId: params.referenceId,
    metadata: params.metadata,
    createdBy: params.createdBy,
  });
}

/**
 * Record a fee charge (typically triggered when an Invoice is generated).
 * Always link to the Invoice via referenceId so we can reconcile later.
 */
export async function recordCharge(params: {
  studentId: Types.ObjectId;
  userId: Types.ObjectId;
  enrollmentId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  amount: number;
  description: string;
  createdBy: Types.ObjectId;
}): Promise<ILedger> {
  return createLedgerEntry({
    studentId: params.studentId,
    userId: params.userId,
    enrollmentId: params.enrollmentId,
    type: 'charge',
    direction: 'debit',
    amount: params.amount,
    description: params.description,
    referenceType: 'invoice',
    referenceId: params.invoiceId,
    createdBy: params.createdBy,
  });
}

/**
 * Issue a refund.
 */
export async function recordRefund(params: {
  studentId: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  description: string;
  originalLedgerEntryId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  metadata?: Record<string, unknown>;
}): Promise<ILedger> {
  return createLedgerEntry({
    studentId: params.studentId,
    userId: params.userId,
    type: 'refund',
    direction: 'credit',
    amount: params.amount,
    description: params.description,
    referenceType: params.originalLedgerEntryId ? 'ledger_entry' : 'manual',
    referenceId: params.originalLedgerEntryId,
    metadata: params.metadata,
    createdBy: params.createdBy,
  });
}

/**
 * Apply a manual adjustment (discount, write-off, correction).
 * direction must be explicitly specified by caller.
 */
export async function recordAdjustment(params: {
  studentId: Types.ObjectId;
  userId: Types.ObjectId;
  direction: 'debit' | 'credit';
  amount: number;
  description: string;
  createdBy: Types.ObjectId;
  metadata?: Record<string, unknown>;
}): Promise<ILedger> {
  return createLedgerEntry({
    studentId: params.studentId,
    userId: params.userId,
    type: 'adjustment',
    direction: params.direction,
    amount: params.amount,
    description: params.description,
    referenceType: 'manual',
    metadata: params.metadata,
    createdBy: params.createdBy,
  });
}

/**
 * Void (reverse) an existing ledger entry.
 * Creates a reversal entry and marks the original as void.
 * NEVER deletes the original entry.
 */
export async function voidLedgerEntry(
  entryId: Types.ObjectId,
  reason: string,
  createdBy: Types.ObjectId
): Promise<ILedger> {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const original = await Ledger.findById(entryId).session(session);
    if (!original) throw new Error(`Ledger entry ${entryId} not found`);
    if (original.isVoid) throw new Error(`Ledger entry ${entryId} is already void`);

    // Create reversal: opposite direction, same amount
    const reversal = new Ledger({
      studentId: original.studentId,
      userId: original.userId,
      enrollmentId: original.enrollmentId,
      type: 'reversal',
      direction: original.direction === 'debit' ? 'credit' : 'debit',
      amount: original.amount,
      description: `Reversal of entry ${entryId}: ${reason}`,
      referenceType: 'ledger_entry',
      referenceId: entryId,
      metadata: { originalType: original.type, reason },
      isVoid: false,
      createdBy,
    });
    await reversal.save({ session });

    // Mark original as void
    original.isVoid = true;
    original.voidedBy = reversal._id as Types.ObjectId;
    await original.save({ session });

    await session.commitTransaction();
    return reversal;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

// ─────────────────────────────────────────────────────────────────
// Prorated Fee Calculation
// ─────────────────────────────────────────────────────────────────

/**
 * Calculate the prorated fee for a student joining mid-month.
 *
 * Example:
 *   Monthly fee: ₹2000
 *   Join date: March 15
 *   Days in March: 31
 *   Days remaining (15→31): 17
 *   Prorated fee: 2000 * (17/31) = ₹1097 (rounded)
 */
export function calculateProratedFee(params: {
  monthlyFee: number;
  joinDate: Date;
}): { proratedAmount: number; daysInMonth: number; daysRemaining: number; periodStart: Date; periodEnd: Date } {
  const { monthlyFee, joinDate } = params;

  const year = joinDate.getFullYear();
  const month = joinDate.getMonth(); // 0-indexed

  // Last day of the month
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = joinDate.getDate();
  const daysRemaining = lastDay - dayOfMonth + 1; // inclusive

  const proratedAmount = Math.round((monthlyFee * daysRemaining) / lastDay);

  const periodStart = new Date(joinDate);
  const periodEnd = new Date(year, month + 1, 0, 23, 59, 59, 999); // end of month

  return { proratedAmount, daysInMonth: lastDay, daysRemaining, periodStart, periodEnd };
}

/**
 * Calculate the upgrade fee difference for a mid-cycle level upgrade.
 *
 * When a student upgrades:
 * - They already paid (or were charged) oldFee for the full month
 * - They now need to pay the difference: (newFee - oldFee) * (daysRemaining / daysInMonth)
 *
 * The difference is billed as a new charge ledger entry.
 */
export function calculateUpgradeDifferenceFee(params: {
  oldMonthlyFee: number;
  newMonthlyFee: number;
  upgradeDate: Date;
}): { differenceAmount: number; daysInMonth: number; daysRemaining: number } {
  const { oldMonthlyFee, newMonthlyFee, upgradeDate } = params;

  if (newMonthlyFee <= oldMonthlyFee) {
    return { differenceAmount: 0, daysInMonth: 0, daysRemaining: 0 };
  }

  const year = upgradeDate.getFullYear();
  const month = upgradeDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = upgradeDate.getDate();
  const daysRemaining = lastDay - dayOfMonth + 1;

  const dailyDiff = (newMonthlyFee - oldMonthlyFee) / lastDay;
  const differenceAmount = Math.round(dailyDiff * daysRemaining);

  return { differenceAmount, daysInMonth: lastDay, daysRemaining };
}

// ─────────────────────────────────────────────────────────────────
// Lump-sum Payment Split (parent pays for multiple children)
// ─────────────────────────────────────────────────────────────────

/**
 * When a parent pays a lump sum for multiple children, split across students.
 *
 * Allocation strategy: proportional to outstanding balance.
 * If all balances are 0 (advance payment), record against each student equally.
 *
 * Returns array of { studentId, allocatedAmount } to be recorded as separate
 * Ledger entries, each with the full parent userId.
 */
export async function allocateLumpSumPayment(params: {
  userId: Types.ObjectId;
  studentIds: Types.ObjectId[];
  totalAmount: number;
  createdBy: Types.ObjectId;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<{ studentId: Types.ObjectId; allocatedAmount: number }[]> {
  const { userId, studentIds, totalAmount } = params;

  // Fetch current balances (negative balance = owes money)
  const balances = await Promise.all(
    studentIds.map((sid) => getStudentBalance(sid))
  );

  // Outstanding amounts (how much each student owes — clamped at 0 min)
  const outstanding = balances.map((b) => Math.max(-b.balance, 0));
  const totalOutstanding = outstanding.reduce((s, v) => s + v, 0);

  if (totalOutstanding === 0) {
    // Advance payment — split equally
    const equalShare = Math.floor(totalAmount / studentIds.length);
    const remainder = totalAmount - equalShare * studentIds.length;
    return studentIds.map((sid, i) => ({
      studentId: sid,
      allocatedAmount: equalShare + (i === 0 ? remainder : 0),
    }));
  }

  // Proportional allocation
  let remaining = totalAmount;
  const allocations = studentIds.map((sid, i) => {
    const proportion = outstanding[i] / totalOutstanding;
    const alloc = i === studentIds.length - 1
      ? remaining // last student gets the remainder to avoid rounding loss
      : Math.round(totalAmount * proportion);
    remaining -= alloc;
    return { studentId: sid, allocatedAmount: alloc };
  });

  return allocations;
}

// ─────────────────────────────────────────────────────────────────
// Audit: Full Transaction History
// ─────────────────────────────────────────────────────────────────

/**
 * Fetch complete ledger history for a student (for audit/display).
 * Returns entries in chronological order.
 */
export async function getStudentLedger(
  studentId: Types.ObjectId,
  options: { includeVoid?: boolean; limit?: number; skip?: number } = {}
): Promise<Record<string, unknown>[]> {
  const filter: Record<string, unknown> = { studentId };
  if (!options.includeVoid) filter.isVoid = false;

  return Ledger.find(filter)
    .sort({ createdAt: 1 })
    .skip(options.skip ?? 0)
    .limit(options.limit ?? 500)
    .populate('createdBy', 'name email')
    .lean() as unknown as Record<string, unknown>[];
}

/**
 * Get invoice-level breakdown for a student.
 * Computes how much of each invoice has been paid from the Ledger.
 *
 * Strategy: FIFO — older charges are paid off first by chronological payments.
 * Returns outstanding amount per invoice (approximation, not per-payment reconciled).
 */
export async function getStudentInvoiceSummary(
  studentId: Types.ObjectId
): Promise<InvoiceWithStatus[]> {
  // 1. Fetch all non-void invoices for the student (oldest first)
  const invoices = await Invoice.find({ studentId, isVoid: false })
    .sort({ periodStart: 1 })
    .lean();

  if (invoices.length === 0) return [];

  // 2. Fetch total charges from ledger grouped by invoiceId
  const chargesByInvoice = await Ledger.aggregate([
    {
      $match: {
        studentId,
        type: 'charge',
        referenceType: 'invoice',
        isVoid: false,
      },
    },
    {
      $group: {
        _id: '$referenceId',
        totalCharged: { $sum: '$amount' },
      },
    },
  ]);
  const chargeMap = new Map<string, number>(
    chargesByInvoice.map((r) => [r._id.toString(), r.totalCharged])
  );

  // 3. Fetch all non-void credits (payments + refunds + credit adjustments) in order
  const allCredits = await Ledger.find({
    studentId,
    direction: 'credit',
    isVoid: false,
  })
    .sort({ createdAt: 1 })
    .lean();

  const totalCredits = allCredits.reduce((s, e) => s + e.amount, 0);

  // 4. FIFO allocation: work through invoices oldest-first, allocate credits
  let remainingCredits = totalCredits;

  const result: InvoiceWithStatus[] = invoices.map((inv) => {
    const invoiceId = inv._id.toString();
    const totalCharged = chargeMap.get(invoiceId) ?? inv.netAmount;
    const totalPaid = Math.min(remainingCredits, totalCharged);
    remainingCredits = Math.max(0, remainingCredits - totalPaid);
    const outstanding = Math.max(0, totalCharged - totalPaid);

    return {
      invoiceId,
      invoiceNumber: inv.invoiceNumber,
      netAmount: inv.netAmount,
      totalCharged,
      totalPaid,
      outstanding,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      dueDate: inv.dueDate,
      description: inv.description,
      isVoid: inv.isVoid,
    };
  });

  return result;
}
