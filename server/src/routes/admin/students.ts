import { Router, Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { asyncHandler } from '../../middleware/errorHandler.js';
import StudentV2 from '../../models/v2/Student.js';
import Enrollment from '../../models/v2/Enrollment.js';
import Invoice from '../../models/v2/Invoice.js';
import Course from '../../models/v2/Course.js';
import Batch from '../../models/v2/Batch.js';
import PaymentAllocation from '../../models/v2/PaymentAllocation.js';
import PaymentTransaction from '../../models/v2/PaymentTransaction.js';
import CreditLedger from '../../models/v2/CreditLedger.js';
import WaiverLedger from '../../models/v2/WaiverLedger.js';
import { createInvoice, createStudentWithEnrollment } from '../../services/v2/feeService.js';

const router = Router();

type AuditCategory = 'fees' | 'payments' | 'credits' | 'enrollment' | 'imports';

type AuditEvent = {
  id: string;
  occurredAt: Date;
  category: AuditCategory;
  action: string;
  title: string;
  description?: string;
  amount?: number;
  actor?: { id: string; name?: string; email?: string };
  source?: 'manual' | 'import' | 'billing' | 'payment';
  related?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

function asId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  const record = value as Record<string, unknown>;
  const id = record._id ?? record.id;
  return id ? String(id) : undefined;
}

function actorFrom(value: unknown): AuditEvent['actor'] | undefined {
  const id = asId(value);
  if (!id) return undefined;
  const record = value as Record<string, unknown>;
  return {
    id,
    name: typeof record.name === 'string' ? record.name : undefined,
    email: typeof record.email === 'string' ? record.email : undefined,
  };
}

function monthLabel(value: Date): string {
  return value.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ── List students (paginated, filtered) ───────────────────────────

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const { search, courseId, stageNumber, levelNumber, batchId, isActive, overdueOnly } = req.query;

  const filter: any = {};

  if (search) {
    const escapedSearch = (search as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { studentName: { $regex: escapedSearch, $options: 'i' } },
      { parentName: { $regex: escapedSearch, $options: 'i' } },
      { phone: { $regex: escapedSearch, $options: 'i' } },
      { email: { $regex: escapedSearch, $options: 'i' } },
      { studentCode: { $regex: escapedSearch, $options: 'i' } },
    ];
  }
  if (courseId) filter.courseId = new Types.ObjectId(courseId as string);
  if (stageNumber) filter.stageNumber = parseInt(stageNumber as string);
  if (levelNumber) filter.levelNumber = parseInt(levelNumber as string);
  if (batchId) filter.batchId = new Types.ObjectId(batchId as string);
  if (isActive !== undefined && isActive !== 'all') filter.isActive = isActive === 'true';

  // Overdue filter: only students with at least one overdue fee record
  if (overdueOnly === 'true') {
    const now = new Date();
    const overdueIds = await Invoice.distinct('studentId', {
      dueDate: { $lt: now },
      isVoid: false,
      $expr: {
        $gt: [{ $subtract: ['$amount', { $add: ['$allocatedAmount', '$waivedAmount'] }] }, 0],
      },
    });
    if (overdueIds.length === 0) {
      return res.json({
        success: true,
        data: {
          data: [],
          pagination: { currentPage: page, totalPages: 0, totalItems: 0, itemsPerPage: limit, hasNext: false, hasPrev: false },
        },
        timestamp: new Date().toISOString(),
      });
    }
    filter._id = { $in: overdueIds };
  }

  const [total, students] = await Promise.all([
    StudentV2.countDocuments(filter),
    StudentV2.find(filter)
      .sort({ studentName: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('batchId', 'batchName batchCode')
      .populate('courseId', 'displayName courseName')
      .lean(),
  ]);

  // Attach hasOverdueFees flag efficiently
  const now = new Date();
  const studentIds = (students as any[]).map((s) => s._id);
  const overdueIds = await Invoice.distinct('studentId', {
    studentId: { $in: studentIds },
    dueDate: { $lt: now },
    isVoid: false,
    $expr: {
      $gt: [{ $subtract: ['$amount', { $add: ['$allocatedAmount', '$waivedAmount'] }] }, 0],
    },
  });
  const overdueSet = new Set(overdueIds.map((id: any) => id.toString()));

  const data = (students as any[]).map((s) => ({
    ...s,
    id: s._id.toString(),
    hasOverdueFees: overdueSet.has(s._id.toString()),
  }));

  res.json({
    success: true,
    data: {
      data,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    },
    timestamp: new Date().toISOString(),
  });
}));

// ── Create student + enrollment ───────────────────────────────────

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const {
    studentName, parentName, phone, email, dob, address, referredBy,
    enrollmentDate, courseId, stageNumber, levelNumber, batchId,
    monthlyFee, discountPct, discountReason,
    discountType, discountAmount,
    createFirstFeeRecord, firstMonthFee, firstMonthDueDate,
  } = req.body;

  if (!studentName) return res.status(400).json({ success: false, error: 'studentName is required' });
  if (!phone && !email) return res.status(400).json({ success: false, error: 'phone or email is required' });
  if (!courseId) return res.status(400).json({ success: false, error: 'courseId is required' });
  if (stageNumber === undefined || levelNumber === undefined) {
    return res.status(400).json({ success: false, error: 'stageNumber and levelNumber are required' });
  }
  if (monthlyFee === undefined) return res.status(400).json({ success: false, error: 'monthlyFee is required' });

  const adminUserId = req.user!._id.toString();
  const startDate = enrollmentDate ? new Date(enrollmentDate) : new Date();

  const adminEnteredFee = parseInt(monthlyFee);
  const resolvedDiscountType: 'none' | 'percentage' | 'fixed' = discountType ?? 'none';
  const resolvedDiscountPct = discountType === 'percentage' ? parseFloat(discountPct ?? 0) : 0;
  const resolvedDiscountAmount = discountType === 'fixed' ? parseFloat(discountAmount ?? 0) : 0;

  try {
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(400).json({ success: false, error: 'Course not found' });
    }

    // grossFee = the authoritative course level fee (not the admin-entered value)
    const courseLevelFee = (course as any).getFeeForLevel(parseInt(stageNumber), parseInt(levelNumber)) ?? adminEnteredFee;

    // Effective (net) fee: apply discount on course level fee
    let effectiveFee = adminEnteredFee; // default: use exactly what admin entered
    if (resolvedDiscountType === 'percentage') {
      effectiveFee = Math.round(courseLevelFee * (1 - resolvedDiscountPct / 100));
    } else if (resolvedDiscountType === 'fixed') {
      effectiveFee = Math.max(0, courseLevelFee - resolvedDiscountAmount);
    }

    // Flag if the admin manually typed a fee that differs from the course level fee
    // (only relevant when no explicit discount type was set)
    const feeOverridden = resolvedDiscountType === 'none' && adminEnteredFee !== courseLevelFee;

    const { student, enrollment } = await createStudentWithEnrollment({
      student: { studentName, parentName, phone, email, dob, address, referredBy },
      courseId,
      stageNumber: parseInt(stageNumber),
      levelNumber: parseInt(levelNumber),
      batchId: batchId ?? null,
      grossFee: courseLevelFee,
      monthlyFee: effectiveFee,
      discountType: resolvedDiscountType,
      discountPct: resolvedDiscountPct,
      discountAmount: resolvedDiscountAmount,
      discountReason: discountReason ?? '',
      feeOverridden,
      startDate,
      createdBy: adminUserId,
    });

    let invoice = null;
    if (createFirstFeeRecord) {
      const explicitFirstMonthFee = firstMonthFee !== undefined && firstMonthFee !== null && firstMonthFee !== '';
      const invoiceMonth = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
      const dueDate = firstMonthDueDate
        ? new Date(firstMonthDueDate)
        : new Date(Date.UTC(invoiceMonth.getUTCFullYear(), invoiceMonth.getUTCMonth(), 5));
      invoice = await createInvoice({
        studentId: student._id.toString(),
        enrollmentId: enrollment._id.toString(),
        invoiceMonth,
        dueDate,
        amount: explicitFirstMonthFee && resolvedDiscountType === 'none'
          ? Number(firstMonthFee)
          : effectiveFee,
        createdBy: adminUserId,
        createdBySource: 'manual',
      });
    }

    res.status(201).json({
      success: true,
      data: { student, enrollment, invoice },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    throw err;
  }
}));

// ── Student audit history (read-only ledger aggregation) ──────────

router.get('/:id/audit-history', asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid student ID' });
  }
  const studentId = new Types.ObjectId(req.params.id);
  const category = String(req.query.category ?? 'all');
  const allowedCategories = new Set(['all', 'fees', 'payments', 'credits', 'enrollment', 'imports']);
  if (!allowedCategories.has(category)) {
    return res.status(400).json({ success: false, error: 'Invalid category filter' });
  }

  const student = await StudentV2.findById(studentId).select('_id studentName').lean();
  if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

  const [
    enrollments,
    invoices,
    payments,
    allocations,
    credits,
    waivers,
  ] = await Promise.all([
    Enrollment.find({ studentId })
      .sort({ startDate: -1 })
      .populate('createdBy', 'name email')
      .populate('batchId', 'batchName batchCode')
      .populate('courseId', 'displayName courseName')
      .lean(),
    Invoice.find({ studentId })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email')
      .populate('waivedBy', 'name email')
      .populate('voidedBy', 'name email')
      .lean({ virtuals: true }),
    PaymentTransaction.find({ studentId })
      .sort({ paymentDate: -1 })
      .populate('processedBy', 'name email')
      .populate('reversedBy', 'name email')
      .populate('corrections.correctedBy', 'name email')
      .lean(),
    PaymentAllocation.find({ studentId })
      .sort({ allocatedAt: -1 })
      .populate('paymentTransactionId', 'amount paymentDate paymentMethod transactionId createdBySource')
      .populate('creditLedgerId', 'type amount description createdBySource')
      .lean(),
    CreditLedger.find({ studentId })
      .sort({ processedAt: -1 })
      .populate('processedBy', 'name email')
      .lean(),
    WaiverLedger.find({ studentId })
      .sort({ waivedAt: -1 })
      .populate('waivedBy', 'name email')
      .populate('paymentTransactionId', 'amount paymentDate paymentMethod transactionId createdBySource')
      .lean(),
  ]);

  const events: AuditEvent[] = [];
  const waiverInvoiceIds = new Set(
    (waivers as any[])
      .map((waiver) => asId(waiver.invoiceId))
      .filter((invoiceId): invoiceId is string => Boolean(invoiceId)),
  );

  for (const enrollment of enrollments as any[]) {
    const courseName = enrollment.courseId?.displayName ?? 'course';
    const batchName = enrollment.batchId?.batchName;
    events.push({
      id: `enrollment:${enrollment._id}:start`,
      occurredAt: enrollment.startDate ?? enrollment.createdAt,
      category: 'enrollment',
      action: enrollment.endReason === 'fee_change' ? 'fee_change_started' : 'enrollment_started',
      title: enrollment.endReason === 'fee_change' ? 'Fee enrollment started' : 'Enrollment started',
      description: `${courseName} Stage ${enrollment.stageNumber} / Level ${enrollment.levelNumber}${batchName ? ` · ${batchName}` : ''}`,
      amount: enrollment.monthlyFee,
      actor: actorFrom(enrollment.createdBy),
      related: { enrollmentId: enrollment._id.toString(), batchId: asId(enrollment.batchId) ?? '', courseId: asId(enrollment.courseId) ?? '' },
      metadata: {
        grossFee: enrollment.grossFee,
        discountType: enrollment.discountType,
        discountPct: enrollment.discountPct,
        discountAmount: enrollment.discountAmount,
        discountReason: enrollment.discountReason,
        feeOverridden: enrollment.feeOverridden,
        feeGrandfathered: enrollment.feeGrandfathered,
      },
    });

    if (enrollment.endDate && enrollment.endReason) {
      events.push({
        id: `enrollment:${enrollment._id}:end`,
        occurredAt: enrollment.endDate,
        category: 'enrollment',
        action: enrollment.endReason,
        title: ({
          upgraded: 'Enrollment upgraded',
          batch_change: 'Batch changed',
          fee_change: 'Fee changed',
          left: 'Student left',
          inactive: 'Enrollment made inactive',
          paused: 'Enrollment paused',
        } as Record<string, string>)[enrollment.endReason] ?? 'Enrollment ended',
        description: `${courseName} Stage ${enrollment.stageNumber} / Level ${enrollment.levelNumber}`,
        actor: actorFrom(enrollment.createdBy),
        related: { enrollmentId: enrollment._id.toString() },
        metadata: { pausedUntil: enrollment.pausedUntil },
      });
    }
  }

  for (const invoice of invoices as any[]) {
    const invoiceMonth = monthLabel(invoice.invoiceMonth);
    events.push({
      id: `invoice:${invoice._id}:created`,
      occurredAt: invoice.createdAt,
      category: invoice.createdBySource === 'import' ? 'imports' : 'fees',
      action: 'invoice_created',
      title: invoice.createdBySource === 'import' ? 'Invoice imported' : 'Invoice created',
      description: `${invoiceMonth} invoice`,
      amount: invoice.amount,
      actor: actorFrom(invoice.createdBy),
      source: invoice.createdBySource,
      related: { invoiceId: invoice._id.toString(), enrollmentId: asId(invoice.enrollmentId) ?? '' },
      metadata: {
        invoiceMonth: invoice.invoiceMonth,
        dueDate: invoice.dueDate,
        stageNumber: invoice.stageNumber,
        levelNumber: invoice.levelNumber,
        allocatedAmount: invoice.allocatedAmount,
        waivedAmount: invoice.waivedAmount,
      },
    });

    if (invoice.correctionReason) {
      events.push({
        id: `invoice:${invoice._id}:corrected`,
        occurredAt: invoice.updatedAt ?? invoice.createdAt,
        category: 'fees',
        action: 'invoice_corrected',
        title: 'Invoice amount corrected',
        description: invoice.correctionReason,
        amount: invoice.amount,
        source: invoice.createdBySource,
        related: { invoiceId: invoice._id.toString() },
      });
    }

    if (invoice.waivedAmount > 0 && !waiverInvoiceIds.has(invoice._id.toString())) {
      events.push({
        id: `invoice:${invoice._id}:waived`,
        occurredAt: invoice.waivedAt ?? invoice.updatedAt,
        category: 'fees',
        action: 'invoice_waived',
        title: 'Invoice waived',
        description: invoice.waivedReason,
        amount: invoice.waivedAmount,
        actor: actorFrom(invoice.waivedBy),
        related: { invoiceId: invoice._id.toString() },
      });
    }

    if (invoice.isVoid) {
      events.push({
        id: `invoice:${invoice._id}:voided`,
        occurredAt: invoice.voidedAt ?? invoice.updatedAt,
        category: 'fees',
        action: 'invoice_voided',
        title: 'Invoice voided',
        description: invoice.voidReason,
        amount: invoice.amount,
        actor: actorFrom(invoice.voidedBy),
        related: { invoiceId: invoice._id.toString() },
      });
    }
  }

  for (const payment of payments as any[]) {
    events.push({
      id: `payment:${payment._id}:recorded`,
      occurredAt: payment.paymentDate ?? payment.createdAt,
      category: payment.createdBySource === 'import' ? 'imports' : 'payments',
      action: 'payment_recorded',
      title: payment.createdBySource === 'import' ? 'Payment imported' : 'Payment recorded',
      description: payment.remarks || `${payment.paymentMethod?.toUpperCase?.() ?? 'Payment'}${payment.transactionId ? ` · ${payment.transactionId}` : ''}`,
      amount: payment.amount,
      actor: actorFrom(payment.processedBy),
      source: payment.createdBySource,
      related: { paymentTransactionId: payment._id.toString() },
      metadata: { paymentMethod: payment.paymentMethod, transactionId: payment.transactionId },
    });

    if (payment.isReversed) {
      events.push({
        id: `payment:${payment._id}:reversed`,
        occurredAt: payment.reversedAt ?? payment.updatedAt,
        category: 'payments',
        action: 'payment_reversed',
        title: 'Payment reversed',
        description: payment.reversalReason,
        amount: payment.amount,
        actor: actorFrom(payment.reversedBy),
        related: { paymentTransactionId: payment._id.toString() },
      });
    }

    for (const correction of payment.corrections ?? []) {
      events.push({
        id: `payment:${payment._id}:correction:${correction.correctedAt}:${correction.field}`,
        occurredAt: correction.correctedAt,
        category: 'payments',
        action: 'payment_metadata_corrected',
        title: 'Payment details corrected',
        description: correction.note || `${correction.field} changed`,
        actor: actorFrom(correction.correctedBy),
        related: { paymentTransactionId: payment._id.toString() },
        metadata: { field: correction.field, oldValue: correction.oldValue, newValue: correction.newValue },
      });
    }
  }

  for (const allocation of allocations as any[]) {
    const paymentSource = allocation.paymentTransactionId?.createdBySource;
    const creditSource = allocation.creditLedgerId?.createdBySource;
    const source = paymentSource ?? creditSource;
    events.push({
      id: `allocation:${allocation._id}`,
      occurredAt: allocation.allocatedAt ?? allocation.createdAt,
      category: source === 'import' ? 'imports' : (allocation.allocationType === 'credit' ? 'credits' : 'payments'),
      action: allocation.isReversed ? 'allocation_reversed' : `${allocation.allocationType}_allocated`,
      title: allocation.isReversed
        ? 'Allocation reversed'
        : allocation.allocationType === 'credit' ? 'Credit allocated to invoice' : 'Payment allocated to invoice',
      amount: allocation.amount,
      source,
      related: {
        allocationId: allocation._id.toString(),
        invoiceId: asId(allocation.invoiceId) ?? '',
        paymentTransactionId: asId(allocation.paymentTransactionId) ?? '',
        creditLedgerId: asId(allocation.creditLedgerId) ?? '',
      },
      metadata: { allocationType: allocation.allocationType, reversedAt: allocation.reversedAt },
    });
  }

  for (const credit of credits as any[]) {
    const isImport = credit.createdBySource === 'import';
    events.push({
      id: `credit:${credit._id}`,
      occurredAt: credit.processedAt ?? credit.createdAt,
      category: isImport ? 'imports' : 'credits',
      action: credit.type,
      title: ({
        credit_added: isImport ? 'Credit imported' : 'Credit added',
        credit_used: 'Credit used',
        credit_refund: 'Credit refunded',
        credit_adjustment: 'Credit adjusted',
      } as Record<string, string>)[credit.type] ?? 'Credit event',
      description: credit.description,
      amount: credit.amount,
      actor: actorFrom(credit.processedBy),
      source: credit.createdBySource,
      related: {
        creditLedgerId: credit._id.toString(),
        invoiceId: asId(credit.invoiceId) ?? '',
        paymentTransactionId: asId(credit.paymentTransactionId) ?? '',
      },
      metadata: { balanceBefore: credit.balanceBefore, balanceAfter: credit.balanceAfter },
    });
  }

  for (const waiver of waivers as any[]) {
    const isImport = waiver.createdBySource === 'import';
    events.push({
      id: `waiver:${waiver._id}`,
      occurredAt: waiver.waivedAt ?? waiver.createdAt,
      category: isImport ? 'imports' : 'fees',
      action: waiver.waiverType === 'discount' ? 'discount_waiver' : 'manual_waiver',
      title: waiver.waiverType === 'discount' ? 'Discount waiver applied' : 'Manual waiver applied',
      description: waiver.reason,
      amount: waiver.amount,
      actor: actorFrom(waiver.waivedBy),
      source: waiver.createdBySource,
      related: {
        invoiceId: asId(waiver.invoiceId) ?? '',
        paymentTransactionId: asId(waiver.paymentTransactionId) ?? '',
      },
      metadata: { waiverType: waiver.waiverType, reversedAt: waiver.reversedAt },
    });
  }

  const filtered = events
    .filter((event) => category === 'all' || event.category === category)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .map((event) => ({
      ...event,
      occurredAt: event.occurredAt.toISOString(),
    }));

  res.json({
    success: true,
    data: {
      events: filtered,
      total: filtered.length,
      categories: {
        all: events.length,
        fees: events.filter((e) => e.category === 'fees').length,
        payments: events.filter((e) => e.category === 'payments').length,
        credits: events.filter((e) => e.category === 'credits').length,
        enrollment: events.filter((e) => e.category === 'enrollment').length,
        imports: events.filter((e) => e.category === 'imports').length,
      },
    },
    timestamp: new Date().toISOString(),
  });
}));

// ── Get full student profile ──────────────────────────────────────

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const [student, enrollments, invoices] = await Promise.all([
    StudentV2.findById(req.params.id)
      .populate('courseId', 'displayName courseName stages')
      .populate('batchId', 'batchName batchCode schedule')
      .populate('currentEnrollmentId')
      .lean(),
    Enrollment.find({ studentId: new Types.ObjectId(req.params.id) })
      .sort({ startDate: -1 })
      .populate('batchId', 'batchName batchCode')
      .populate('courseId', 'displayName')
      .lean(),
    Invoice.find({ studentId: new Types.ObjectId(req.params.id) })
      .sort({ invoiceMonth: -1 })
      .lean({ virtuals: true }),
  ]);

  if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

  // Enrich each invoice with its latest payment's metadata (transactionId,
  // paymentMethod, paymentDate, remarks) and the paymentTransactionId, so the
  // UI can display how an invoice was paid and edit that payment's metadata.
  const invoiceIds = invoices.map((inv) => inv._id);
  const allocations = invoiceIds.length > 0
    ? await PaymentAllocation.find({ invoiceId: { $in: invoiceIds }, isReversed: { $ne: true } }).lean()
    : [];
  const txnIds = [...new Set(allocations.map((a) => a.paymentTransactionId).filter(Boolean))];
  const transactions = txnIds.length > 0
    ? await PaymentTransaction.find({ _id: { $in: txnIds } }).lean()
    : [];
  const txnById = new Map(transactions.map((t) => [t._id.toString(), t]));
  // Map invoiceId → latest payment (by paymentDate) for display.
  const latestPaymentByInvoice = new Map<string, any>();
  for (const alloc of allocations) {
    if (!alloc.paymentTransactionId) continue;
    const txn = txnById.get(alloc.paymentTransactionId.toString());
    if (!txn) continue;
    const invId = alloc.invoiceId?.toString();
    if (!invId) continue;
    const existing = latestPaymentByInvoice.get(invId);
    if (!existing || new Date(txn.paymentDate) > new Date(existing.paymentDate)) {
      latestPaymentByInvoice.set(invId, txn);
    }
  }
  const invoicesWithPayment = invoices.map((inv) => {
    const txn = latestPaymentByInvoice.get(inv._id.toString());
    return txn ? {
      ...inv,
      paymentTransactionId: txn._id,
      transactionId: txn.transactionId,
      paymentMethod: txn.paymentMethod,
      paymentDate: txn.paymentDate,
      paymentRemarks: txn.remarks,
      isPaymentReversed: txn.isReversed === true,
    } : inv;
  });

  res.json({
    success: true,
    data: { student, enrollments, invoices: invoicesWithPayment, feeRecords: invoicesWithPayment },
    timestamp: new Date().toISOString(),
  });
}));

// ── Update personal/contact info ──────────────────────────────────

router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const ALLOWED = ['studentName', 'parentName', 'phone', 'email', 'dob', 'address', 'alternatePhone', 'alternateEmail', 'referredBy'];
  const update: Record<string, unknown> = {};
  ALLOWED.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ success: false, error: 'No valid fields to update' });
  }

  const student = await StudentV2.findByIdAndUpdate(
    req.params.id,
    { $set: update },
    { new: true, runValidators: true },
  );
  if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
  res.json({ success: true, data: student, timestamp: new Date().toISOString() });
}));

// ── Toggle active status ──────────────────────────────────────────

router.patch('/:id/toggle-active', asyncHandler(async (req: Request, res: Response) => {
  const student = await StudentV2.findById(req.params.id).select('isActive');
  if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

  const newStatus = !student.isActive;
  await StudentV2.findByIdAndUpdate(req.params.id, { $set: { isActive: newStatus } });
  res.json({ success: true, data: { isActive: newStatus }, timestamp: new Date().toISOString() });
}));

// ── Delete student (cascade) ──────────────────────────────────────

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const student = await StudentV2.findById(req.params.id);
  if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
  await student.deleteOne();
  res.json({ success: true, message: 'Student and all related records deleted', timestamp: new Date().toISOString() });
}));

export default router;
