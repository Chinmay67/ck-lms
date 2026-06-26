import { Router, Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { asyncHandler } from '../../middleware/errorHandler.js';
import Lead from '../../models/v2/Lead.js';
import Course from '../../models/v2/Course.js';
import { createInvoice, createStudentWithEnrollment } from '../../services/v2/feeService.js';

const router = Router();

// ── List leads (paginated, filtered) ─────────────────────────────

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const { search, status, source, followUpFrom, followUpTo } = req.query;

  const filter: any = {};

  if (search) {
    const escaped = (search as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { childName: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (status) filter.status = status;
  if (source) filter.source = source;

  if (followUpFrom || followUpTo) {
    filter.followUpDate = {};
    if (followUpFrom) filter.followUpDate.$gte = new Date(followUpFrom as string);
    if (followUpTo) filter.followUpDate.$lte = new Date(followUpTo as string);
  }

  const [total, leads] = await Promise.all([
    Lead.countDocuments(filter),
    Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('interestedCourseId', 'displayName courseName')
      .populate('convertedStudentId', 'studentName studentCode')
      .lean(),
  ]);

  res.json({
    success: true,
    data: {
      data: leads,
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

// ── Get single lead ───────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const lead = await Lead.findById(req.params.id)
    .populate('interestedCourseId', 'displayName courseName stages')
    .populate('convertedStudentId', 'studentName studentCode');
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  res.json({ success: true, data: lead, timestamp: new Date().toISOString() });
}));

// ── Create lead ───────────────────────────────────────────────────

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const {
    name, phone, email, childName, childAge,
    interestedCourseId, interestedStageName,
    source, status, notes, followUpDate, assignedTo,
  } = req.body;

  if (!name) return res.status(400).json({ success: false, error: 'name is required' });
  if (!phone && !email) return res.status(400).json({ success: false, error: 'phone or email is required' });
  if (status === 'converted') {
    return res.status(400).json({ success: false, error: 'Use the Convert action to mark a lead as converted' });
  }

  const lead = await Lead.create({
    name: name.trim(),
    phone: phone?.trim() || undefined,
    email: email?.trim().toLowerCase() || undefined,
    childName: childName?.trim() || undefined,
    childAge: childAge != null ? Number(childAge) : undefined,
    interestedCourseId: interestedCourseId ? new Types.ObjectId(interestedCourseId) : undefined,
    interestedStageName: interestedStageName?.trim() || undefined,
    source: source ?? 'other',
    status: status ?? 'new',
    notes: notes?.trim() || undefined,
    followUpDate: followUpDate ? new Date(followUpDate) : undefined,
    assignedTo: assignedTo ? new Types.ObjectId(assignedTo) : undefined,
    createdBy: req.user!._id,
  });

  res.status(201).json({ success: true, data: lead, timestamp: new Date().toISOString() });
}));

// ── Convert lead to student ───────────────────────────────────────

router.post('/:id/convert', asyncHandler(async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, convertedStudentId: null },
      { $currentDate: { updatedAt: true } },
      { new: true, session },
    );

    if (!lead) {
      const existing = await Lead.findById(req.params.id).session(session);
      await session.abortTransaction();
      if (!existing) return res.status(404).json({ success: false, error: 'Lead not found' });
      return res.status(409).json({ success: false, error: 'Lead is already converted' });
    }

    const {
      studentName, parentName, phone, email, dob, address, referredBy,
      enrollmentDate, courseId, stageNumber, levelNumber, batchId,
      monthlyFee, discountPct, discountReason,
      discountType, discountAmount,
      createFirstFeeRecord, firstMonthFee, firstMonthDueDate,
    } = req.body;

    const resolvedStudentName = String(studentName || lead.childName || '').trim();
    const resolvedParentName = String(parentName || lead.name || '').trim();
    const resolvedPhone = String(phone || lead.phone || '').trim();
    const resolvedEmail = String(email || lead.email || '').trim().toLowerCase();
    const resolvedCourseId = courseId || lead.interestedCourseId?.toString();
    const resolvedStageNumber = Number(stageNumber);
    const resolvedLevelNumber = Number(levelNumber);
    const resolvedMonthlyFee = Number(monthlyFee);

    if (!resolvedStudentName) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'studentName is required' });
    }
    if (!resolvedPhone && !resolvedEmail) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'phone or email is required' });
    }
    if (!resolvedCourseId) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'courseId is required' });
    }
    if (!resolvedStageNumber || !resolvedLevelNumber) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'stageNumber and levelNumber are required' });
    }
    if (!Number.isFinite(resolvedMonthlyFee) || resolvedMonthlyFee < 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'monthlyFee is required' });
    }

    const course = await Course.findById(resolvedCourseId).session(session);
    if (!course) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'Course not found' });
    }

    const courseLevelFee = (course as any).getFeeForLevel(resolvedStageNumber, resolvedLevelNumber) ?? resolvedMonthlyFee;
    const resolvedDiscountType: 'none' | 'percentage' | 'fixed' = discountType ?? 'none';
    const resolvedDiscountPct = resolvedDiscountType === 'percentage' ? Number(discountPct ?? 0) : 0;
    const resolvedDiscountAmount = resolvedDiscountType === 'fixed' ? Number(discountAmount ?? 0) : 0;

    let effectiveFee = resolvedMonthlyFee;
    if (resolvedDiscountType === 'percentage') {
      effectiveFee = Math.round(courseLevelFee * (1 - resolvedDiscountPct / 100));
    } else if (resolvedDiscountType === 'fixed') {
      effectiveFee = Math.max(0, courseLevelFee - resolvedDiscountAmount);
    }
    const feeOverridden = resolvedDiscountType === 'none' && resolvedMonthlyFee !== courseLevelFee;
    const adminUserId = req.user!._id.toString();
    const startDate = enrollmentDate ? new Date(enrollmentDate) : new Date();

    const { student, enrollment } = await createStudentWithEnrollment({
      student: {
        studentName: resolvedStudentName,
        parentName: resolvedParentName || undefined,
        phone: resolvedPhone || undefined,
        email: resolvedEmail || undefined,
        dob,
        address,
        referredBy: referredBy || `Converted from lead: ${lead.name}`,
      },
      courseId: resolvedCourseId,
      stageNumber: resolvedStageNumber,
      levelNumber: resolvedLevelNumber,
      batchId: batchId || null,
      grossFee: courseLevelFee,
      monthlyFee: effectiveFee,
      discountType: resolvedDiscountType,
      discountPct: resolvedDiscountPct,
      discountAmount: resolvedDiscountAmount,
      discountReason: discountReason ?? '',
      feeOverridden,
      startDate,
      createdBy: adminUserId,
      session,
    });

    let invoice = null;
    if (createFirstFeeRecord ?? !!batchId) {
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
        session,
      });
    }

    lead.status = 'converted';
    lead.convertedStudentId = student._id;
    lead.convertedAt = new Date();
    lead.followUpDate = undefined;
    await lead.save({ session });

    await session.commitTransaction();
    res.status(201).json({
      success: true,
      data: { lead, student, enrollment, invoice },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}));

// ── Update lead ───────────────────────────────────────────────────

router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const ALLOWED = [
    'name', 'phone', 'email', 'childName', 'childAge',
    'interestedCourseId', 'interestedStageName',
    'source', 'status', 'notes', 'followUpDate', 'assignedTo',
  ];
  const update: any = {};
  const existing = await Lead.findById(req.params.id).select('convertedStudentId');
  if (!existing) return res.status(404).json({ success: false, error: 'Lead not found' });

  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) {
      if (key === 'interestedCourseId') {
        update[key] = req.body[key] ? new Types.ObjectId(req.body[key]) : null;
      } else if (key === 'followUpDate') {
        update[key] = req.body[key] ? new Date(req.body[key]) : null;
      } else if (key === 'assignedTo') {
        update[key] = req.body[key] ? new Types.ObjectId(req.body[key]) : null;
      } else if (key === 'childAge') {
        update[key] = req.body[key] != null ? Number(req.body[key]) : undefined;
      } else {
        update[key] = req.body[key];
      }
    }
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ success: false, error: 'No valid fields to update' });
  }
  if (update.status === 'converted' && !existing.convertedStudentId) {
    return res.status(400).json({ success: false, error: 'Use the Convert action to mark a lead as converted' });
  }
  if (existing.convertedStudentId && update.status && update.status !== 'converted') {
    return res.status(400).json({ success: false, error: 'Converted lead status cannot be changed' });
  }

  const lead = await Lead.findByIdAndUpdate(
    req.params.id,
    { $set: update },
    { new: true, runValidators: true },
  )
    .populate('interestedCourseId', 'displayName courseName stages')
    .populate('convertedStudentId', 'studentName studentCode');

  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  res.json({ success: true, data: lead, timestamp: new Date().toISOString() });
}));

// ── Update status only ────────────────────────────────────────────

router.patch('/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body;
  const valid = ['new', 'contacted', 'follow-up', 'dropped'];
  if (!status || !valid.includes(status)) {
    return res.status(400).json({ success: false, error: `status must be one of: ${valid.join(', ')}` });
  }
  const existing = await Lead.findById(req.params.id).select('convertedStudentId');
  if (!existing) return res.status(404).json({ success: false, error: 'Lead not found' });
  if (existing.convertedStudentId) {
    return res.status(400).json({ success: false, error: 'Converted lead status cannot be changed' });
  }

  const lead = await Lead.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  res.json({ success: true, data: lead, timestamp: new Date().toISOString() });
}));

// ── Delete lead ───────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const lead = await Lead.findByIdAndDelete(req.params.id);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  res.json({ success: true, message: 'Lead deleted', timestamp: new Date().toISOString() });
}));

export default router;
