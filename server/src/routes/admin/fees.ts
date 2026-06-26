import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../../middleware/errorHandler.js';
import Invoice from '../../models/v2/Invoice.js';
import CreditLedger from '../../models/v2/CreditLedger.js';
import WaiverLedger from '../../models/v2/WaiverLedger.js';
import StudentV2 from '../../models/v2/Student.js';
import PaymentAllocation from '../../models/v2/PaymentAllocation.js';
import {
  addCredit,
  correctInvoiceAmount,
  createInvoice,
  editPaymentMetadata,
  processPayment,
  reversePayment,
  voidInvoice,
  waiveInvoice,
} from '../../services/v2/feeService.js';

const router = Router();

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const { studentId, status, courseId, stageNumber, levelNumber, monthFrom, monthTo } = req.query;

  const filter: any = { isVoid: false };
  if (studentId) filter.studentId = new Types.ObjectId(studentId as string);
  if (courseId) filter.courseId = new Types.ObjectId(courseId as string);
  if (stageNumber) filter.stageNumber = parseInt(stageNumber as string);
  if (levelNumber) filter.levelNumber = parseInt(levelNumber as string);
  if (monthFrom || monthTo) {
    filter.invoiceMonth = {};
    if (monthFrom) filter.invoiceMonth.$gte = new Date(monthFrom as string);
    if (monthTo) filter.invoiceMonth.$lte = new Date(monthTo as string);
  }

  const now = new Date();
  const balanceExpr = { $subtract: ['$amount', { $add: ['$allocatedAmount', '$waivedAmount'] }] };
  if (status === 'paid') {
    filter.$expr = { $lte: [balanceExpr, 0] };
  } else if (status === 'partially_paid') {
    filter.$expr = {
      $and: [
        { $gt: [{ $add: ['$allocatedAmount', '$waivedAmount'] }, 0] },
        { $gt: [balanceExpr, 0] },
      ],
    };
  } else if (status === 'overdue') {
    filter.dueDate = { $lt: now };
    filter.$expr = { $gt: [balanceExpr, 0] };
  } else if (status === 'upcoming') {
    filter.dueDate = { $gte: now };
    filter.$expr = { $gt: [balanceExpr, 0] };
  } else if (status === 'void') {
    filter.isVoid = true;
  }

  const [total, invoices] = await Promise.all([
    Invoice.countDocuments(filter),
    Invoice.find(filter)
      .sort({ invoiceMonth: -1, studentName: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean({ virtuals: true }),
  ]);

  res.json({
    success: true,
    data: {
      data: invoices,
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

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { studentId, enrollmentId, invoiceMonth, amount, dueDate, createdBySource } = req.body;
  const adminUserId = req.user!._id.toString();
  if (!studentId) return res.status(400).json({ success: false, error: 'studentId is required' });
  if (!enrollmentId) return res.status(400).json({ success: false, error: 'enrollmentId is required' });
  if (!invoiceMonth) return res.status(400).json({ success: false, error: 'invoiceMonth is required' });

  const invoice = await createInvoice({
    studentId,
    enrollmentId,
    invoiceMonth: new Date(invoiceMonth),
    amount: amount !== undefined ? parseInt(amount) : undefined,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    createdBy: adminUserId,
    createdBySource: createdBySource ?? 'manual',
  });
  res.status(201).json({ success: true, data: invoice, timestamp: new Date().toISOString() });
}));

router.post('/payment', asyncHandler(async (req: Request, res: Response) => {
  const {
    studentId, amount, invoiceIds, feeRecordIds, paymentMethod, transactionId,
    idempotencyKey, paymentDate, remarks,
    discountType, discountValue, discountReason,
  } = req.body;
  const adminUserId = req.user!._id.toString();
  const targetInvoiceIds = Array.isArray(invoiceIds) ? invoiceIds : (Array.isArray(feeRecordIds) ? feeRecordIds : []);
  if (!studentId) return res.status(400).json({ success: false, error: 'studentId is required' });
  if (amount === undefined || amount <= 0) return res.status(400).json({ success: false, error: 'amount must be > 0' });
  if (!paymentMethod) return res.status(400).json({ success: false, error: 'paymentMethod is required' });

  // Optional discount applied as a per-invoice waiver on the selected months.
  // discountValue is a % (percentage) or ₹ (fixed). amount is the cash collected
  // AFTER the discount is taken off the invoiced total.
  let discount: { type: 'percentage' | 'fixed'; value: number; reason?: string } | undefined;
  if (discountType !== undefined) {
    if (discountType !== 'percentage' && discountType !== 'fixed') {
      return res.status(400).json({ success: false, error: 'discountType must be "percentage" or "fixed"' });
    }
    discount = { type: discountType, value: Number(discountValue), reason: discountReason };
  }

  const result = await processPayment(
    studentId,
    parseInt(amount),
    targetInvoiceIds,
    paymentMethod,
    adminUserId,
    transactionId,
    { idempotencyKey, paymentDate: paymentDate ? new Date(paymentDate) : undefined, remarks, discount },
  );

  res.json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

// Reverse a payment — undoes allocations and claws back excess credit, without
// deleting any record. Blocks if the credit has already been spent elsewhere.
router.post('/payment/:id/reverse', asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body ?? {};
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, error: 'reason is required' });
  }
  try {
    const result = await reversePayment(req.params.id, String(reason).trim(), req.user!._id.toString());
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error: any) {
    // Business-rule blocks (already-reversed, shortfall) → 422/409 surfaced as 400-friendly.
    const message = error?.message ?? 'Reversal failed';
    const status = /already been reversed/i.test(message) ? 409
      : /Cannot reverse/i.test(message) ? 422
      : /not found/i.test(message) ? 404
      : 500;
    res.status(status).json({ success: false, error: message, timestamp: new Date().toISOString() });
  }
}));

// Edit a payment's NON-MONEY metadata (transactionId, paymentMethod, remarks).
// Each changed field is appended to an audit trail on the payment. Money changes
// (amount/date) must go through reverse + re-record, not this endpoint.
router.patch('/payment/:id', asyncHandler(async (req: Request, res: Response) => {
  const { transactionId, paymentMethod, remarks, note } = req.body ?? {};
  try {
    const payment = await editPaymentMetadata(
      req.params.id,
      { transactionId, paymentMethod, remarks },
      req.user!._id.toString(),
      note,
    );
    res.json({ success: true, data: payment, timestamp: new Date().toISOString() });
  } catch (error: any) {
    const message = error?.message ?? 'Edit failed';
    const status = /not found/i.test(message) ? 404
      : /reversed/i.test(message) ? 409
      : /No metadata changes/i.test(message) ? 400
      : 500;
    res.status(status).json({ success: false, error: message, timestamp: new Date().toISOString() });
  }
}));

router.patch('/:id/correct-amount', asyncHandler(async (req: Request, res: Response) => {
  const { amount, feeAmount, reason } = req.body;
  const nextAmount = amount ?? feeAmount;
  if (nextAmount === undefined || nextAmount <= 0) {
    return res.status(400).json({ success: false, error: 'amount must be greater than 0 — use void to remove an invoice instead' });
  }
  const invoice = await correctInvoiceAmount(req.params.id, parseInt(nextAmount), reason ?? '', req.user!._id.toString());
  res.json({ success: true, data: invoice, timestamp: new Date().toISOString() });
}));

router.post('/:id/waive', asyncHandler(async (req: Request, res: Response) => {
  const { waivedAmount, reason } = req.body;
  if (waivedAmount === undefined || waivedAmount <= 0) {
    return res.status(400).json({ success: false, error: 'waivedAmount must be > 0' });
  }
  if (!reason) return res.status(400).json({ success: false, error: 'reason is required' });
  const invoice = await waiveInvoice(req.params.id, parseInt(waivedAmount), reason, req.user!._id.toString());
  res.json({ success: true, data: invoice, timestamp: new Date().toISOString() });
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body ?? {};
  const invoice = await voidInvoice(req.params.id, reason ?? 'Voided by admin', req.user!._id.toString());
  res.json({ success: true, data: invoice, message: 'Invoice voided', timestamp: new Date().toISOString() });
}));

router.get('/student/:studentId/credits', asyncHandler(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const [student, credits] = await Promise.all([
    StudentV2.findById(studentId).select('creditBalance studentName').lean(),
    CreditLedger.find({ studentId: new Types.ObjectId(studentId) }).sort({ processedAt: -1 }).lean(),
  ]);
  if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
  res.json({
    success: true,
    data: { creditBalance: (student as any).creditBalance, credits },
    timestamp: new Date().toISOString(),
  });
}));

router.post('/student/:studentId/credits', asyncHandler(async (req: Request, res: Response) => {
  const { amount, description, paymentMethod, transactionId, paidDate, idempotencyKey, remarks } = req.body;
  if (amount === undefined || amount <= 0) return res.status(400).json({ success: false, error: 'amount must be > 0' });
  if (!description) return res.status(400).json({ success: false, error: 'description is required' });
  const result = await addCredit(req.params.studentId, parseInt(amount), description, req.user!._id.toString(), {
    paymentMethod,
    transactionId,
    paymentDate: paidDate ? new Date(paidDate) : undefined,
    idempotencyKey,
    remarks,
  });
  res.json({
    success: true,
    data: { creditBalance: result.creditBalance, paymentTransactionId: result.paymentTransactionId },
    timestamp: new Date().toISOString(),
  });
}));

router.get('/:id/allocations', asyncHandler(async (req: Request, res: Response) => {
  const allocations = await PaymentAllocation.find({ invoiceId: new Types.ObjectId(req.params.id) })
    .populate('paymentTransactionId')
    .populate('creditLedgerId')
    .sort({ allocatedAt: -1 })
    .lean();
  res.json({ success: true, data: allocations, timestamp: new Date().toISOString() });
}));

// Waiver audit history for an invoice (append-only ledger).
router.get('/:id/waivers', asyncHandler(async (req: Request, res: Response) => {
  const waivers = await WaiverLedger.find({ invoiceId: new Types.ObjectId(req.params.id) })
    .populate('waivedBy', 'name email')
    .populate('paymentTransactionId', 'amount paymentDate paymentMethod transactionId')
    .sort({ waivedAt: -1 })
    .lean();
  res.json({ success: true, data: waivers, timestamp: new Date().toISOString() });
}));

export default router;
