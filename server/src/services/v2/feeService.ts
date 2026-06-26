import mongoose, { ClientSession, Types } from 'mongoose';
import { ApiError } from '../../utils/errors.js';
import Enrollment from '../../models/v2/Enrollment.js';
import Invoice, { IInvoice } from '../../models/v2/Invoice.js';
import PaymentTransaction, { IPaymentCorrection, IPaymentTransaction } from '../../models/v2/PaymentTransaction.js';
import PaymentAllocation from '../../models/v2/PaymentAllocation.js';
import CreditLedger from '../../models/v2/CreditLedger.js';
import WaiverLedger from '../../models/v2/WaiverLedger.js';
import StudentV2 from '../../models/v2/Student.js';
import Batch from '../../models/v2/Batch.js';
import Course from '../../models/v2/Course.js';
import type { IEnrollment, ProcessPaymentResult, ReversalResult, UpgradeError, UpgradeResult } from '../../types/v2.js';

export type { IEnrollment, ProcessPaymentResult, ReversalResult, UpgradeError, UpgradeResult };

type PaymentMethod = 'cash' | 'online' | 'card' | 'upi' | 'other';

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function dateOnlyUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysInUTCMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function dueDateForMonth(monthStart: Date, anchorDate: Date): Date {
  const day = Math.min(anchorDate.getUTCDate(), daysInUTCMonth(monthStart.getUTCFullYear(), monthStart.getUTCMonth()));
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day));
}

async function assertCourseLevel(
  courseId: string | Types.ObjectId,
  stageNumber: number,
  levelNumber: number,
  session: ClientSession,
) {
  const course = await Course.findById(courseId).session(session);
  if (!course) throw new Error('Course not found');
  if (!course.isActive) throw new Error('Course is inactive');
  if (!(course as any).hasLevel(stageNumber, levelNumber)) {
    throw new Error(`Stage ${stageNumber} Level ${levelNumber} does not exist for this course`);
  }
  return course;
}

async function validateBatch(
  batchId: string | Types.ObjectId,
  courseId: string | Types.ObjectId,
  stageNumber: number,
  levelNumber: number,
  session: ClientSession,
): Promise<void> {
  const batch = await Batch.findById(batchId).session(session);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'active') throw new Error('Batch is not active');
  if (batch.courseId.toString() !== courseId.toString()) throw new Error('Batch belongs to a different course');
  if (batch.stageNumber !== stageNumber || batch.levelNumber !== levelNumber) {
    throw new Error(`Batch is for Stage ${batch.stageNumber} Level ${batch.levelNumber}`);
  }
  if (!batch.schedule.length) throw new Error('Active batch has no schedule');
  // Capacity is enforced AUTHORITATIVELY by reserveBatchSeat (an atomic
  // conditional updateOne). The count here is only a cheap early rejection so
  // obviously-full batches fail fast without entering the transaction body.
  if (batch.maxStudents !== null && (batch.filledSeats ?? 0) >= batch.maxStudents) {
    throw new Error(`Batch is full (${batch.filledSeats}/${batch.maxStudents})`);
  }
}

/**
 * Atomically reserve a seat in a batch. Uses a single conditional updateOne so
 * that two concurrent enrollments cannot both pass the capacity check — the
 * second sees filledSeats already incremented and its update matches 0 docs.
 * Must be called inside the caller's transaction.
 */
async function reserveBatchSeat(
  batchId: string | Types.ObjectId | null,
  session: ClientSession,
): Promise<void> {
  if (!batchId) throw new Error('Cannot reserve a seat without a batch');
  const result = await Batch.updateOne(
    {
      _id: new Types.ObjectId(batchId.toString()),
      $expr: {
        $or: [
          { $eq: ['$maxStudents', null] },
          { $lt: ['$filledSeats', { $ifNull: ['$maxStudents', 0] }] },
        ],
      },
    },
    { $inc: { filledSeats: 1 } },
    { session },
  );
  if (result.modifiedCount === 0) throw new Error('Batch is full');
}

/**
 * Atomically release a seat from a batch (floor at 0). Called on every
 * transition that closes an enrollment tied to a batch: pause, leave,
 * change-batch (old), upgrade (old). Must be called inside the caller's
 * transaction.
 */
async function releaseBatchSeat(
  batchId: string | Types.ObjectId | null | undefined,
  session: ClientSession,
): Promise<void> {
  if (!batchId) return;
  await Batch.updateOne(
    { _id: new Types.ObjectId(batchId.toString()), filledSeats: { $gt: 0 } },
    { $inc: { filledSeats: -1 } },
    { session },
  );
}

async function closeCurrentEnrollment(
  studentId: string,
  endDate: Date,
  endReason: 'upgraded' | 'batch_change' | 'fee_change' | 'left' | 'inactive' | 'paused',
  session: ClientSession,
  pausedUntil?: Date,
) {
  const current = await Enrollment.findOne({ studentId: new Types.ObjectId(studentId), endDate: null }).session(session);
  if (!current) throw new Error('No active enrollment found for student');
  if (dateOnlyUTC(endDate) < dateOnlyUTC(current.startDate)) {
    throw new Error('Transition date cannot be before enrollment start date');
  }
  await Enrollment.findByIdAndUpdate(
    current._id,
    { $set: { endDate, endReason, pausedUntil: pausedUntil ?? null } },
    { session, runValidators: true },
  );
  return current;
}

export async function createInvoice(params: {
  studentId: string;
  enrollmentId: string;
  invoiceMonth: Date;
  amount?: number;
  dueDate?: Date;
  createdBy: string;
  createdBySource?: 'manual' | 'import' | 'billing';
  session?: ClientSession;
}): Promise<IInvoice> {
  const work = async (session?: ClientSession) => {
    // MongoDB does not support parallel operations on the same transaction
    // session. Keep these reads sequential because this helper may run inside
    // either its own transaction or a caller-provided transaction.
    const student = await StudentV2.findById(params.studentId).session(session ?? null);
    const enrollment = await Enrollment.findById(params.enrollmentId).session(session ?? null);
    if (!student) throw new Error('Student not found');
    if (!enrollment) throw new Error('Enrollment not found');
    if (enrollment.studentId.toString() !== params.studentId) {
      throw new Error('Enrollment does not belong to student');
    }

    const invoiceMonth = startOfMonthUTC(params.invoiceMonth);
    const existing = await Invoice.findOne({
      studentId: student._id,
      enrollmentId: enrollment._id,
      invoiceMonth,
    }).session(session ?? null);
    if (existing) return existing;

    const [invoice] = await Invoice.create([{
      studentId: student._id,
      enrollmentId: enrollment._id,
      studentName: student.studentName,
      courseId: enrollment.courseId,
      stageNumber: enrollment.stageNumber,
      levelNumber: enrollment.levelNumber,
      invoiceMonth,
      dueDate: params.dueDate ?? dueDateForMonth(invoiceMonth, enrollment.startDate),
      amount: params.amount ?? enrollment.monthlyFee,
      allocatedAmount: 0,
      waivedAmount: 0,
      createdBy: new Types.ObjectId(params.createdBy),
      createdBySource: params.createdBySource ?? 'manual',
    }], { session });
    return invoice;
  };

  if (params.session) return work(params.session);
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const invoice = await work(session);
    await session.commitTransaction();
    return invoice;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function generateInvoicesForEnrollment(params: {
  enrollmentId: string;
  throughMonth: Date;
  createdBy: string;
  createdBySource?: 'manual' | 'import' | 'billing';
  session?: ClientSession;
}): Promise<IInvoice[]> {
  const enrollment = await Enrollment.findById(params.enrollmentId).session(params.session ?? null);
  if (!enrollment) throw new Error('Enrollment not found');
  const invoices: IInvoice[] = [];
  let cursor = startOfMonthUTC(enrollment.startDate);
  const end = startOfMonthUTC(params.throughMonth);
  while (cursor <= end) {
    invoices.push(await createInvoice({
      studentId: enrollment.studentId.toString(),
      enrollmentId: enrollment._id.toString(),
      invoiceMonth: cursor,
      createdBy: params.createdBy,
      createdBySource: params.createdBySource ?? 'billing',
      session: params.session,
    }));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return invoices;
}

export async function processPayment(
  studentId: string,
  amount: number,
  invoiceIds: string[],
  paymentMethod: PaymentMethod,
  adminUserId: string,
  transactionId?: string,
  opts: {
    paymentDate?: Date;
    idempotencyKey?: string;
    remarks?: string;
    createdBySource?: 'manual' | 'import';
    discount?: { type: 'percentage' | 'fixed'; value: number; reason?: string };
  } = {},
): Promise<ProcessPaymentResult & { paymentTransactionId: string | null }> {
  if (amount <= 0) throw new Error('Payment amount must be greater than zero');
  // Validate the discount up front (before any writes) so a bad discount
  // aborts the whole payment cleanly.
  if (opts.discount) {
    const { type, value } = opts.discount;
    if (type === 'percentage') {
      if (!(value > 0) || value > 100) throw new Error('Discount percentage must be between 0 and 100');
    } else if (type === 'fixed') {
      if (!(value > 0)) throw new Error('Discount amount must be greater than 0');
    } else {
      throw new Error('Discount type must be "percentage" or "fixed"');
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (opts.idempotencyKey) {
      const duplicate = await PaymentTransaction.findOne({ idempotencyKey: opts.idempotencyKey }).session(session);
      if (duplicate) {
        // A duplicate submission (double-click / network retry). This is benign —
        // the original submission already succeeded. Surface as 409 Conflict so the
        // client can treat it as "already done" rather than a server error.
        throw new ApiError('This payment was already recorded (duplicate submission).', 409, 'DUPLICATE_PAYMENT');
      }
    }

    const student = await StudentV2.findById(studentId).session(session);
    if (!student) throw new Error('Student not found');

    const payment = await PaymentTransaction.create([{
      studentId: student._id,
      studentName: student.studentName,
      amount,
      paymentDate: opts.paymentDate ?? new Date(),
      paymentMethod,
      transactionId,
      idempotencyKey: opts.idempotencyKey,
      remarks: opts.remarks,
      processedBy: new Types.ObjectId(adminUserId),
      createdBySource: opts.createdBySource ?? 'manual',
    }], { session });

    let remainingCash = amount;
    let runningCredit = student.creditBalance;
    let creditUsed = 0;
    const applied: ProcessPaymentResult['applied'] = [];

    const query = invoiceIds.length > 0
      ? { _id: { $in: invoiceIds.map((id) => new Types.ObjectId(id)) } }
      : { studentId: student._id, isVoid: false };
    const invoices = await Invoice.find(query).sort({ dueDate: 1, invoiceMonth: 1 }).session(session);

    if (invoiceIds.length > 0 && invoices.length !== invoiceIds.length) {
      throw new Error('One or more invoices were not found');
    }

    // ── Apply discount as a per-invoice waiver BEFORE cash/credit allocation ──
    // A discount at payment time forgives part of each selected invoice's
    // balance; the collected cash then settles the remainder. The waiver is
    // audited per-occurrence via WaiverLedger (waiverType: 'discount'), linked
    // to this payment transaction.
    if (opts.discount) {
      const { type, value, reason } = opts.discount;
      const invoiceBalances = invoices.map((inv) => ({
        invoice: inv,
        balance: Math.max(0, inv.amount - inv.allocatedAmount - inv.waivedAmount),
      }));
      const totalBalance = invoiceBalances.reduce((s, b) => s + b.balance, 0);

      if (type === 'percentage') {
        // Each invoice waived by the same % of its own balance.
        for (const { invoice, balance } of invoiceBalances) {
          if (balance <= 0) continue;
          const waiverAmount = Math.round((balance * value) / 100);
          if (waiverAmount <= 0) continue;
          invoice.waivedAmount += waiverAmount;
          invoice.waivedReason = reason || `Discount ${value}% on payment`;
          invoice.waivedBy = new Types.ObjectId(adminUserId);
          invoice.waivedAt = opts.paymentDate ?? new Date();
          await invoice.save({ session });
          await WaiverLedger.create([{
            studentId: invoice.studentId,
            studentName: invoice.studentName,
            invoiceId: invoice._id,
            invoiceMonth: invoice.invoiceMonth,
            amount: waiverAmount,
            reason: reason || `Discount ${value}% on payment`,
            waiverType: 'discount',
            paymentTransactionId: payment[0]._id,
            waivedBy: new Types.ObjectId(adminUserId),
            waivedAt: invoice.waivedAt,
            createdBySource: 'payment',
          }], { session });
        }
      } else {
        // Fixed amount distributed oldest-first (invoices are already sorted
        // by dueDate/invoiceMonth). Reject if it exceeds the total balance.
        if (value > totalBalance) {
          throw new Error(`Discount amount (₹${value}) exceeds the selected invoices' total (₹${totalBalance})`);
        }
        let remainingDiscount = value;
        for (const { invoice, balance } of invoiceBalances) {
          if (remainingDiscount <= 0 || balance <= 0) continue;
          const waiverAmount = Math.min(remainingDiscount, balance);
          remainingDiscount -= waiverAmount;
          invoice.waivedAmount += waiverAmount;
          invoice.waivedReason = reason || 'Fixed discount on payment';
          invoice.waivedBy = new Types.ObjectId(adminUserId);
          invoice.waivedAt = opts.paymentDate ?? new Date();
          await invoice.save({ session });
          await WaiverLedger.create([{
            studentId: invoice.studentId,
            studentName: invoice.studentName,
            invoiceId: invoice._id,
            invoiceMonth: invoice.invoiceMonth,
            amount: waiverAmount,
            reason: reason || 'Fixed discount on payment',
            waiverType: 'discount',
            paymentTransactionId: payment[0]._id,
            waivedBy: new Types.ObjectId(adminUserId),
            waivedAt: invoice.waivedAt,
            createdBySource: 'payment',
          }], { session });
        }
      }
    }

    for (const invoice of invoices) {
      if (invoice.studentId.toString() !== studentId) throw new Error('Invoice does not belong to student');
      if (invoice.isVoid) continue;

      const balance = Math.max(0, invoice.amount - invoice.allocatedAmount - invoice.waivedAmount);
      if (balance === 0) continue;

      let creditApplied = 0;
      if (runningCredit > 0) creditApplied = Math.min(runningCredit, balance);

      const afterCredit = balance - creditApplied;
      const cashApplied = Math.min(remainingCash, afterCredit);
      const totalApplied = creditApplied + cashApplied;
      if (totalApplied === 0) continue;

      if (creditApplied > 0) {
        // Decrement credit atomically and read back the authoritative balance so
        // the ledger reflects the real committed state (not a stale snapshot).
        // runValidators:true enforces creditBalance.min(0) — a concurrent spend
        // that would drive the balance negative aborts the transaction instead.
        const afterDec = await StudentV2.findOneAndUpdate(
          { _id: student._id },
          { $inc: { creditBalance: -creditApplied } },
          { session, runValidators: true, returnDocument: 'after' },
        );
        const balanceBefore = (afterDec?.creditBalance ?? 0) + creditApplied;
        runningCredit = afterDec?.creditBalance ?? 0;
        const [creditEntry] = await CreditLedger.create([{
          studentId: student._id,
          studentName: student.studentName,
          type: 'credit_used',
          amount: -creditApplied,
          balanceBefore,
          balanceAfter: runningCredit,
          description: `Credit applied to invoice ${invoice.invoiceMonth.toISOString().slice(0, 7)}`,
          invoiceId: invoice._id,
          processedBy: new Types.ObjectId(adminUserId),
          processedAt: opts.paymentDate ?? new Date(),
          createdBySource: 'payment',
        }], { session });
        await PaymentAllocation.create([{
          studentId: student._id,
          invoiceId: invoice._id,
          creditLedgerId: creditEntry._id,
          amount: creditApplied,
          allocationType: 'credit',
          allocatedBy: new Types.ObjectId(adminUserId),
        }], { session });
        creditUsed += creditApplied;
      }

      if (cashApplied > 0) {
        remainingCash -= cashApplied;
        await PaymentAllocation.create([{
          studentId: student._id,
          invoiceId: invoice._id,
          paymentTransactionId: payment[0]._id,
          amount: cashApplied,
          allocationType: 'payment',
          allocatedBy: new Types.ObjectId(adminUserId),
        }], { session });
      }

      invoice.allocatedAmount += totalApplied;
      await invoice.save({ session });
      applied.push({ month: invoice.invoiceMonth, feeRecordId: invoice._id.toString(), amountApplied: totalApplied });
    }

    // Credit decrements already happened per-invoice via findOneAndUpdate above
    // (each reads back the authoritative balance). finalCreditBalance tracks it.
    let creditAdded = 0;
    let finalCreditBalance = runningCredit;
    if (remainingCash > 0) {
      creditAdded = remainingCash;
      const afterInc = await StudentV2.findOneAndUpdate(
        { _id: student._id },
        { $inc: { creditBalance: creditAdded } },
        { session, runValidators: true, returnDocument: 'after' },
      );
      const balanceBefore = (afterInc?.creditBalance ?? 0) - creditAdded;
      finalCreditBalance = afterInc?.creditBalance ?? 0;
      await CreditLedger.create([{
        studentId: student._id,
        studentName: student.studentName,
        type: 'credit_added',
        amount: creditAdded,
        balanceBefore,
        balanceAfter: finalCreditBalance,
        description: 'Excess payment stored as credit',
        paymentTransactionId: payment[0]._id,
        processedBy: new Types.ObjectId(adminUserId),
        processedAt: opts.paymentDate ?? new Date(),
        createdBySource: opts.createdBySource === 'import' ? 'import' : 'payment',
      }], { session });
    }

    await session.commitTransaction();
    return {
      applied,
      creditUsed,
      creditAdded,
      remainingCredit: finalCreditBalance,
      paymentTransactionId: payment[0]._id.toString(),
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Reverse a payment — undo its allocations and claw back any excess credit it
 * created, without deleting any record (everything is soft-marked for audit).
 *
 * Policy (confirmed): if the excess credit this payment created has since been
 * spent on other invoices (so the student's current credit balance is less than
 * the amount to claw back), the reversal is BLOCKED with a clear shortfall error.
 * The balance is never driven negative.
 */
export async function reversePayment(
  paymentTransactionId: string,
  reason: string,
  adminUserId: string,
): Promise<ReversalResult> {
  if (!reason?.trim()) throw new Error('Reversal reason is required');
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const payment = await PaymentTransaction.findById(paymentTransactionId).session(session);
    if (!payment) throw new Error('Payment transaction not found');
    if (payment.isReversed) throw new Error('Payment has already been reversed');

    const student = await StudentV2.findById(payment.studentId).session(session);
    if (!student) throw new Error('Student not found');

    // 1. Cash this payment allocated to invoices (payment-type allocations).
    const cashAllocations = await PaymentAllocation.find({
      paymentTransactionId: payment._id,
      allocationType: 'payment',
      isReversed: { $ne: true },
    }).session(session);

    const reversedAmount = cashAllocations.reduce((sum, a) => sum + a.amount, 0);

    // 2. Excess credit this payment created (credit_added rows linked to it).
    const creditAddedRows = await CreditLedger.find({
      paymentTransactionId: payment._id,
      type: 'credit_added',
    }).session(session);
    const creditRefunded = creditAddedRows.reduce((sum, r) => sum + r.amount, 0);

    // 3. Shortfall guard: if the credit this payment created has since been
    //    spent on other invoices, clawing it back would drive the balance
    //    negative. Count how many credit_used rows exist for this student
    //    since the payment — a proxy for "credit already spent elsewhere."
    if (creditRefunded > 0) {
      const currentBalance = student.creditBalance;
      if (creditRefunded > currentBalance) {
        const shortfall = creditRefunded - currentBalance;
        const spentAllocations = await PaymentAllocation.countDocuments({
          studentId: student._id,
          allocationType: 'credit',
          isReversed: { $ne: true },
          allocatedAt: { $gte: payment.paymentDate },
        }).session(session);
        throw new Error(
          `Cannot reverse: ₹${shortfall} of this payment's excess credit (₹${creditRefunded}) is already ` +
          `allocated to ${spentAllocations} other invoice(s). The student's current credit balance is ` +
          `₹${currentBalance}. Reverse those allocations first.`,
        );
      }
    }

    // 4. Un-allocate cash from each invoice (restore balances), soft-mark allocations.
    //    Group by invoice to batch the decrement.
    const invoiceDecrement = new Map<string, number>();
    for (const alloc of cashAllocations) {
      if (alloc.invoiceId) {
        invoiceDecrement.set(
          alloc.invoiceId.toString(),
          (invoiceDecrement.get(alloc.invoiceId.toString()) ?? 0) + alloc.amount,
        );
      }
      alloc.isReversed = true;
      alloc.reversedAt = new Date();
      await alloc.save({ session });
    }
    for (const [invId, dec] of invoiceDecrement) {
      // Decrement allocatedAmount, floor at 0 via Math.max in code (min:0 on field).
      const inv = await Invoice.findById(invId).session(session);
      if (inv) {
        inv.allocatedAmount = Math.max(0, inv.allocatedAmount - dec);
        await inv.save({ session });
      }
    }

    // 5. Claw back the excess credit this payment created. Write a credit_refund
    //    ledger entry, using the authoritative post-decrement balance.
    let finalCreditBalance = student.creditBalance;
    if (creditRefunded > 0) {
      const afterDec = await StudentV2.findOneAndUpdate(
        { _id: student._id },
        { $inc: { creditBalance: -creditRefunded } },
        { session, runValidators: true, returnDocument: 'after' },
      );
      const balanceBefore = (afterDec?.creditBalance ?? 0) + creditRefunded;
      finalCreditBalance = afterDec?.creditBalance ?? 0;
      await CreditLedger.create([{
        studentId: student._id,
        studentName: student.studentName,
        type: 'credit_refund',
        amount: -creditRefunded,
        balanceBefore,
        balanceAfter: finalCreditBalance,
        description: `Reversal of payment ${payment._id}: ${reason}`,
        paymentTransactionId: payment._id,
        processedBy: new Types.ObjectId(adminUserId),
        processedAt: new Date(),
        createdBySource: 'manual',
      }], { session });
    }

    // 6. Mark the payment reversed (never delete).
    payment.isReversed = true;
    payment.reversedAt = new Date();
    payment.reversedBy = new Types.ObjectId(adminUserId);
    payment.reversalReason = reason;
    await payment.save({ session });

    await session.commitTransaction();
    return {
      paymentTransactionId: payment._id.toString(),
      reversedAmount,
      creditRefunded,
      allocationsReversed: cashAllocations.length,
      creditBalance: finalCreditBalance,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Edit a payment's NON-MONEY metadata (transactionId, paymentMethod, remarks).
 * Each changed field appends an entry to PaymentTransaction.corrections so the
 * audit trail shows who changed what, from what, to what, when. Money fields
 * (amount, paymentDate) are never edited here — corrections to those go
 * through reverse + re-record so the ledger stays honest.
 */
export async function editPaymentMetadata(
  paymentTransactionId: string,
  changes: { transactionId?: string; paymentMethod?: PaymentMethod; remarks?: string },
  adminUserId: string,
  note?: string,
): Promise<IPaymentTransaction> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const payment = await PaymentTransaction.findById(paymentTransactionId).session(session);
    if (!payment) throw new Error('Payment transaction not found');
    if (payment.isReversed) throw new Error('Cannot edit a reversed payment');

    const corrections: IPaymentCorrection[] = [];
    const adminObjectId = new Types.ObjectId(adminUserId);
    const now = new Date();

    if (changes.transactionId !== undefined && (changes.transactionId ?? '') !== (payment.transactionId ?? '')) {
      corrections.push({
        field: 'transactionId',
        oldValue: payment.transactionId ?? '',
        newValue: changes.transactionId ?? '',
        correctedBy: adminObjectId,
        correctedAt: now,
        note,
      });
      payment.transactionId = changes.transactionId || undefined;
    }
    if (changes.paymentMethod !== undefined && changes.paymentMethod !== payment.paymentMethod) {
      corrections.push({
        field: 'paymentMethod',
        oldValue: payment.paymentMethod,
        newValue: changes.paymentMethod,
        correctedBy: adminObjectId,
        correctedAt: now,
        note,
      });
      payment.paymentMethod = changes.paymentMethod;
    }
    if (changes.remarks !== undefined && (changes.remarks ?? '') !== (payment.remarks ?? '')) {
      corrections.push({
        field: 'remarks',
        oldValue: payment.remarks ?? '',
        newValue: changes.remarks ?? '',
        correctedBy: adminObjectId,
        correctedAt: now,
        note,
      });
      payment.remarks = changes.remarks || undefined;
    }

    if (corrections.length === 0) {
      throw new Error('No metadata changes provided');
    }
    payment.corrections = [...(payment.corrections ?? []), ...corrections];
    await payment.save({ session });
    await session.commitTransaction();
    return payment;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function waiveInvoice(
  invoiceId: string,
  waivedAmount: number,
  reason: string,
  adminUserId: string,
): Promise<IInvoice> {
  if (waivedAmount <= 0) throw new Error('Waived amount must be greater than zero');
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const invoice = await Invoice.findById(invoiceId).session(session);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.isVoid) throw new Error('Cannot waive a void invoice');
    if (invoice.allocatedAmount + invoice.waivedAmount + waivedAmount > invoice.amount) {
      throw new Error('Waiver would exceed invoice balance');
    }
    invoice.waivedAmount += waivedAmount;
    // Denormalized "latest waiver" for quick display; the per-occurrence truth
    // is the append-only WaiverLedger row below.
    invoice.waivedReason = reason;
    invoice.waivedBy = new Types.ObjectId(adminUserId);
    invoice.waivedAt = new Date();
    await invoice.save({ session });
    await WaiverLedger.create([{
      studentId: invoice.studentId,
      studentName: invoice.studentName,
      invoiceId: invoice._id,
      invoiceMonth: invoice.invoiceMonth,
      amount: waivedAmount,
      reason,
      waiverType: 'manual',
      waivedBy: new Types.ObjectId(adminUserId),
      waivedAt: invoice.waivedAt,
      createdBySource: 'manual',
    }], { session });
    await session.commitTransaction();
    return invoice;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function correctInvoiceAmount(
  invoiceId: string,
  amount: number,
  reason: string,
  adminUserId: string,
): Promise<IInvoice> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const invoice = await Invoice.findById(invoiceId).session(session);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.isVoid) throw new Error('Cannot correct a void invoice');
    if (invoice.allocatedAmount > 0) throw new Error('Cannot directly correct an invoice with allocations');
    // Reject zero/negative — a ₹0 invoice would read as "paid" with no money
    // collected and no audit trail. Removing an invoice is what void is for.
    if (!(amount > 0)) throw new Error('Corrected amount must be greater than 0');
    invoice.amount = amount;
    invoice.correctionReason = reason || `Corrected by ${adminUserId}`;
    await invoice.save({ session });
    await session.commitTransaction();
    return invoice;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function voidInvoice(invoiceId: string, reason: string, adminUserId: string): Promise<IInvoice> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const invoice = await Invoice.findById(invoiceId).session(session);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.isVoid) throw new Error('Invoice is already void');
    const allocationCount = await PaymentAllocation.countDocuments({ invoiceId: invoice._id }).session(session);
    if (allocationCount > 0) throw new Error('Cannot void invoice with payment or credit allocations');
    // A waiver is a forgiven amount — voiding the invoice would silently
    // nullify it. Block so the admin reverses the waiver (or corrects) first,
    // keeping the waiver audit trail intact.
    if (invoice.waivedAmount > 0) {
      throw new Error('Cannot void invoice with existing waivers — reverse the waiver first');
    }
    invoice.isVoid = true;
    invoice.voidReason = reason;
    invoice.voidedBy = new Types.ObjectId(adminUserId);
    invoice.voidedAt = new Date();
    await invoice.save({ session });
    await session.commitTransaction();
    return invoice;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function addCredit(
  studentId: string,
  amount: number,
  description: string,
  adminUserId: string,
  opts: {
    paymentMethod?: PaymentMethod;
    transactionId?: string;
    paymentDate?: Date;
    idempotencyKey?: string;
    remarks?: string;
    processedAt?: Date;
    createdBySource?: 'manual' | 'import' | 'payment';
  } = {},
): Promise<{ paymentTransactionId: string; creditBalance: number }> {
  if (amount <= 0) throw new Error('Credit amount must be greater than zero');
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Duplicate-submission guard — same mechanism as processPayment (H5).
    if (opts.idempotencyKey) {
      const duplicate = await PaymentTransaction.findOne({ idempotencyKey: opts.idempotencyKey }).session(session);
      if (duplicate) {
        throw new ApiError('This credit was already recorded (duplicate submission).', 409, 'DUPLICATE_PAYMENT');
      }
    }

    const student = await StudentV2.findById(studentId).session(session);
    if (!student) throw new Error('Student not found');

    // A standalone credit is "money was received" — record it as a
    // PaymentTransaction (with no allocations; the whole amount becomes credit)
    // so it is reversible via reversePayment, counted in dashboard totals, and
    // protected against duplicates — the same treatment as excess-payment credit.
    const paymentDate = opts.paymentDate ?? opts.processedAt ?? new Date();
    const payment = await PaymentTransaction.create([{
      studentId: student._id,
      studentName: student.studentName,
      amount,
      paymentDate,
      paymentMethod: opts.paymentMethod ?? 'other',
      transactionId: opts.transactionId,
      idempotencyKey: opts.idempotencyKey,
      remarks: opts.remarks,
      processedBy: new Types.ObjectId(adminUserId),
      createdBySource: opts.createdBySource === 'import' ? 'import' : 'manual',
    }], { session });

    // Increment atomically and read back the authoritative balance so the
    // ledger's balanceBefore/After reflect the real committed state.
    const afterInc = await StudentV2.findOneAndUpdate(
      { _id: student._id },
      { $inc: { creditBalance: amount } },
      { session, runValidators: true, returnDocument: 'after' },
    );
    const balanceBefore = (afterInc?.creditBalance ?? 0) - amount;
    await CreditLedger.create([{
      studentId: student._id,
      studentName: student.studentName,
      type: 'credit_added',
      amount,
      balanceBefore,
      balanceAfter: afterInc?.creditBalance ?? 0,
      description,
      paymentTransactionId: payment[0]._id,
      processedBy: new Types.ObjectId(adminUserId),
      processedAt: paymentDate,
      createdBySource: opts.createdBySource ?? 'manual',
    }], { session });
    await session.commitTransaction();
    return { paymentTransactionId: payment[0]._id.toString(), creditBalance: afterInc?.creditBalance ?? 0 };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function createStudentWithEnrollment(params: {
  student: Record<string, unknown>;
  courseId: string;
  stageNumber: number;
  levelNumber: number;
  batchId?: string | null;
  monthlyFee: number;       // effective fee (after discount) — caller must compute
  grossFee: number;         // fee from course level before discount
  discountType?: 'none' | 'percentage' | 'fixed';
  discountPct?: number;
  discountAmount?: number;
  discountReason?: string;
  feeOverridden?: boolean;  // true when monthlyFee ≠ grossFee with no discount
  startDate: Date;
  createdBy: string;
  session?: ClientSession;
}) {
  const work = async (session: ClientSession) => {
    await assertCourseLevel(params.courseId, params.stageNumber, params.levelNumber, session);
    if (params.batchId) {
      await validateBatch(params.batchId, params.courseId, params.stageNumber, params.levelNumber, session);
      await reserveBatchSeat(params.batchId, session);
    }

    const [student] = await StudentV2.create([{
      ...params.student,
      enrollmentDate: params.startDate,
      courseId: new Types.ObjectId(params.courseId),
      stageNumber: params.stageNumber,
      levelNumber: params.levelNumber,
      batchId: params.batchId ? new Types.ObjectId(params.batchId) : null,
      isActive: true,
      creditBalance: 0,
    }], { session });

    const [enrollment] = await Enrollment.create([{
      studentId: student._id,
      batchId: params.batchId ? new Types.ObjectId(params.batchId) : null,
      courseId: new Types.ObjectId(params.courseId),
      stageNumber: params.stageNumber,
      levelNumber: params.levelNumber,
      grossFee: params.grossFee,
      monthlyFee: params.monthlyFee,
      discountType: params.discountType ?? 'none',
      discountPct: params.discountPct ?? 0,
      discountAmount: params.discountAmount ?? 0,
      discountReason: params.discountReason ?? '',
      feeOverridden: params.feeOverridden ?? false,
      startDate: params.startDate,
      endDate: null,
      endReason: null,
      pausedUntil: null,
      createdBy: new Types.ObjectId(params.createdBy),
    }], { session });

    await StudentV2.findByIdAndUpdate(student._id, { $set: { currentEnrollmentId: enrollment._id } }, { session });
    return { student, enrollment };
  };

  if (params.session) return work(params.session);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function upgradeStudentLevel(
  studentId: string,
  courseId: string,
  newStageNumber: number,
  newLevelNumber: number,
  newMonthlyFee: number,
  upgradeDate: Date,
  adminUserId: string,
  newBatchId?: string | null,
  newDiscountPct?: number,
  newDiscountReason?: string,
  newGrossFee?: number,
  newDiscountType?: 'none' | 'percentage' | 'fixed',
  newDiscountAmount?: number,
  newFeeOverridden?: boolean,
  endReason: 'upgraded' | 'fee_change' = 'upgraded',
): Promise<UpgradeResult | UpgradeError> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const student = await StudentV2.findById(studentId).session(session);
    if (!student) return { success: false, error: 'Student not found' };
    await assertCourseLevel(courseId, newStageNumber, newLevelNumber, session);
    if (newBatchId) await validateBatch(newBatchId, courseId, newStageNumber, newLevelNumber, session);
    const current = await closeCurrentEnrollment(studentId, upgradeDate, endReason, session);

    // For fee_change with no explicit batchId, carry the existing batch forward
    const resolvedBatchId = newBatchId !== undefined
      ? (newBatchId ?? null)
      : (endReason === 'fee_change' ? current.batchId : null);

    // Seat accounting: release the old batch's seat and reserve the new one,
    // but only when the batch actually changes (a fee_change that carries the
    // same batch forward leaves the student in their existing seat).
    const oldBatchIdStr = current.batchId ? current.batchId.toString() : null;
    const newBatchIdStr = resolvedBatchId ? resolvedBatchId.toString() : null;
    if (oldBatchIdStr && oldBatchIdStr !== newBatchIdStr) {
      await releaseBatchSeat(current.batchId, session);
    }
    if (newBatchIdStr && newBatchIdStr !== oldBatchIdStr) {
      await reserveBatchSeat(resolvedBatchId, session);
    }

    const [enrollment] = await Enrollment.create([{
      studentId: student._id,
      batchId: resolvedBatchId,
      courseId: new Types.ObjectId(courseId),
      stageNumber: newStageNumber,
      levelNumber: newLevelNumber,
      grossFee: newGrossFee ?? newMonthlyFee,
      monthlyFee: newMonthlyFee,
      discountType: newDiscountType ?? (current as any).discountType ?? 'none',
      discountPct: newDiscountPct ?? current.discountPct,
      discountAmount: newDiscountAmount ?? (current as any).discountAmount ?? 0,
      discountReason: newDiscountReason ?? current.discountReason,
      feeOverridden: newFeeOverridden ?? false,
      feeGrandfathered: false,
      feeNote: '',
      startDate: upgradeDate,
      endDate: null,
      endReason: null,
      pausedUntil: null,
      createdBy: new Types.ObjectId(adminUserId),
    }], { session });
    await StudentV2.findByIdAndUpdate(studentId, {
      $set: {
        courseId: new Types.ObjectId(courseId),
        stageNumber: newStageNumber,
        levelNumber: newLevelNumber,
        batchId: resolvedBatchId,
        currentEnrollmentId: enrollment._id,
        isActive: true,
      },
    }, { session });
    await session.commitTransaction();
    return { success: true, enrollment };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function changeBatch(
  studentId: string,
  newBatchId: string | null,
  changeDate: Date,
  adminUserId: string,
): Promise<UpgradeResult | UpgradeError> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const student = await StudentV2.findById(studentId).session(session);
    if (!student) return { success: false, error: 'Student not found' };
    const current = await closeCurrentEnrollment(studentId, changeDate, 'batch_change', session);
    if (newBatchId) {
      await validateBatch(newBatchId, current.courseId, current.stageNumber, current.levelNumber, session);
      await reserveBatchSeat(newBatchId, session);
    }
    // Release the seat in the batch being left (always — change-batch closes
    // the old enrollment regardless of whether a new batch is assigned).
    if (current.batchId) {
      await releaseBatchSeat(current.batchId, session);
    }
    const [enrollment] = await Enrollment.create([{
      studentId: student._id,
      batchId: newBatchId ? new Types.ObjectId(newBatchId) : null,
      courseId: current.courseId,
      stageNumber: current.stageNumber,
      levelNumber: current.levelNumber,
      // Carry the full fee snapshot forward — a batch change stays in the same
      // stage/level, so grossFee/discount/override must be preserved (not just
      // monthlyFee) or the audit trail and divergence report are corrupted.
      grossFee: current.grossFee,
      monthlyFee: current.monthlyFee,
      discountType: current.discountType,
      discountPct: current.discountPct,
      discountAmount: current.discountAmount,
      discountReason: current.discountReason,
      feeOverridden: current.feeOverridden,
      startDate: changeDate,
      endDate: null,
      endReason: null,
      pausedUntil: null,
      createdBy: new Types.ObjectId(adminUserId),
    }], { session });
    await StudentV2.findByIdAndUpdate(studentId, {
      $set: { batchId: newBatchId ? new Types.ObjectId(newBatchId) : null, currentEnrollmentId: enrollment._id },
    }, { session });
    await session.commitTransaction();
    return { success: true, enrollment };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function pauseEnrollment(studentId: string, pauseDate: Date, pausedUntil: Date, _adminUserId: string): Promise<void> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const paused = await closeCurrentEnrollment(studentId, pauseDate, 'paused', session, pausedUntil);
    // Release the seat and clear the denormalized batchId so the paused student
    // no longer counts against batch capacity (H4 fix).
    await releaseBatchSeat(paused.batchId, session);
    await StudentV2.findByIdAndUpdate(studentId, {
      $set: { isActive: false, currentEnrollmentId: null, batchId: null },
    }, { session });
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function resumeEnrollment(studentId: string, resumeDate: Date, adminUserId: string): Promise<IEnrollment> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const paused = await Enrollment.findOne({ studentId: new Types.ObjectId(studentId), endReason: 'paused' })
      .sort({ endDate: -1 })
      .session(session);
    if (!paused) throw new Error('No paused enrollment found for student');
    const active = await Enrollment.findOne({ studentId: new Types.ObjectId(studentId), endDate: null }).session(session);
    if (active) throw new Error('Student already has an active enrollment');
    // Reserve the seat in the batch being resumed into (paired with the release
    // done at pause time). Student.batchId is restored below (H4 fix).
    if (paused.batchId) {
      await reserveBatchSeat(paused.batchId, session);
    }
    const [enrollment] = await Enrollment.create([{
      studentId: paused.studentId,
      batchId: paused.batchId,
      courseId: paused.courseId,
      stageNumber: paused.stageNumber,
      levelNumber: paused.levelNumber,
      // Carry the full fee snapshot forward on resume (same stage/level as the
      // paused enrollment) — mirrors changeBatch.
      grossFee: paused.grossFee,
      monthlyFee: paused.monthlyFee,
      discountType: paused.discountType,
      discountPct: paused.discountPct,
      discountAmount: paused.discountAmount,
      discountReason: paused.discountReason,
      feeOverridden: paused.feeOverridden,
      startDate: resumeDate,
      endDate: null,
      endReason: null,
      pausedUntil: null,
      createdBy: new Types.ObjectId(adminUserId),
    }], { session });
    await StudentV2.findByIdAndUpdate(studentId, {
      $set: {
        isActive: true,
        currentEnrollmentId: enrollment._id,
        courseId: enrollment.courseId,
        stageNumber: enrollment.stageNumber,
        levelNumber: enrollment.levelNumber,
        batchId: enrollment.batchId,
      },
    }, { session });
    await session.commitTransaction();
    return enrollment;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function leaveEnrollment(studentId: string, leaveDate: Date, _adminUserId: string): Promise<void> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const left = await closeCurrentEnrollment(studentId, leaveDate, 'left', session);
    // Release the seat and clear the denormalized batchId (H4 fix).
    await releaseBatchSeat(left.batchId, session);
    await StudentV2.findByIdAndUpdate(studentId, {
      $set: { isActive: false, currentEnrollmentId: null, batchId: null },
    }, { session });
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
