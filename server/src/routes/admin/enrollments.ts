import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../../middleware/errorHandler.js';
import Enrollment from '../../models/v2/Enrollment.js';
import Course from '../../models/v2/Course.js';
import {
  upgradeStudentLevel,
  changeBatch,
  pauseEnrollment,
  resumeEnrollment,
  leaveEnrollment,
} from '../../services/v2/feeService.js';

const router = Router({ mergeParams: true });

// ── Enrollment history for a student ─────────────────────────────

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const enrollments = await Enrollment.find({ studentId: new Types.ObjectId(req.params.id) })
    .sort({ startDate: -1 })
    .populate('batchId', 'batchName batchCode')
    .populate('courseId', 'displayName');
  res.json({ success: true, data: enrollments, timestamp: new Date().toISOString() });
}));

// ── Upgrade stage/level ───────────────────────────────────────────

router.post('/upgrade', asyncHandler(async (req: Request, res: Response) => {
  const { courseId, stageNumber, levelNumber, monthlyFee, upgradeDate, batchId,
    discountPct, discountReason, discountType, discountAmount } = req.body;
  const adminUserId = (req as any).user._id.toString();

  if (!courseId || stageNumber === undefined || levelNumber === undefined || monthlyFee === undefined) {
    return res.status(400).json({ success: false, error: 'courseId, stageNumber, levelNumber, and monthlyFee are required' });
  }

  const adminEnteredFee = parseInt(monthlyFee);
  const resolvedDiscountType: 'none' | 'percentage' | 'fixed' = discountType ?? 'none';
  const resolvedDiscountPct = discountType === 'percentage' ? parseFloat(discountPct ?? 0) : 0;
  const resolvedDiscountAmount = discountType === 'fixed' ? parseFloat(discountAmount ?? 0) : 0;

  // grossFee = authoritative course level fee
  const course = await Course.findById(courseId);
  if (!course) return res.status(400).json({ success: false, error: 'Course not found' });
  const courseLevelFee = (course as any).getFeeForLevel(parseInt(stageNumber), parseInt(levelNumber)) ?? adminEnteredFee;

  let effectiveFee = adminEnteredFee;
  if (resolvedDiscountType === 'percentage') {
    effectiveFee = Math.round(courseLevelFee * (1 - resolvedDiscountPct / 100));
  } else if (resolvedDiscountType === 'fixed') {
    effectiveFee = Math.max(0, courseLevelFee - resolvedDiscountAmount);
  }

  const feeOverridden = resolvedDiscountType === 'none' && adminEnteredFee !== courseLevelFee;
  const requestedBatchId = Object.prototype.hasOwnProperty.call(req.body, 'batchId')
    ? (batchId ?? null)
    : undefined;

  // Detect whether this is a fee-only change (same stage/level) vs a true level upgrade
  const currentEnrollment = await Enrollment.findOne({ studentId: new Types.ObjectId(req.params.id), endDate: null });
  const isFeeChange = currentEnrollment
    && currentEnrollment.stageNumber === parseInt(stageNumber)
    && currentEnrollment.levelNumber === parseInt(levelNumber);
  const endReason: 'upgraded' | 'fee_change' = isFeeChange ? 'fee_change' : 'upgraded';

  const result = await upgradeStudentLevel(
    req.params.id, courseId,
    parseInt(stageNumber), parseInt(levelNumber),
    effectiveFee,
    upgradeDate ? new Date(upgradeDate) : new Date(),
    adminUserId,
    requestedBatchId,
    resolvedDiscountPct,
    discountReason,
    courseLevelFee,
    resolvedDiscountType,
    resolvedDiscountAmount,
    feeOverridden,
    endReason,
  );

  if (!result.success) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, data: result.enrollment, timestamp: new Date().toISOString() });
}));

// ── Change batch (same stage/level) ──────────────────────────────

router.post('/change-batch', asyncHandler(async (req: Request, res: Response) => {
  const { newBatchId, changeDate } = req.body;
  const adminUserId = (req as any).user._id.toString();

  const result = await changeBatch(
    req.params.id,
    newBatchId ?? null,
    changeDate ? new Date(changeDate) : new Date(),
    adminUserId,
  );

  if (!result.success) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, data: result.enrollment, timestamp: new Date().toISOString() });
}));

// ── Pause enrollment ──────────────────────────────────────────────

router.post('/pause', asyncHandler(async (req: Request, res: Response) => {
  const { pauseDate, pausedUntil } = req.body;
  const adminUserId = (req as any).user._id.toString();

  if (!pausedUntil) return res.status(400).json({ success: false, error: 'pausedUntil is required' });

  await pauseEnrollment(
    req.params.id,
    pauseDate ? new Date(pauseDate) : new Date(),
    new Date(pausedUntil),
    adminUserId,
  );

  res.json({ success: true, message: 'Enrollment paused', timestamp: new Date().toISOString() });
}));

// ── Resume enrollment ─────────────────────────────────────────────

router.post('/resume', asyncHandler(async (req: Request, res: Response) => {
  const { resumeDate } = req.body;
  const adminUserId = (req as any).user._id.toString();

  const enrollment = await resumeEnrollment(
    req.params.id,
    resumeDate ? new Date(resumeDate) : new Date(),
    adminUserId,
  );

  res.json({ success: true, data: enrollment, timestamp: new Date().toISOString() });
}));

// ── Mark as left ──────────────────────────────────────────────────

router.post('/leave', asyncHandler(async (req: Request, res: Response) => {
  const { leaveDate } = req.body;
  const adminUserId = (req as any).user._id.toString();

  await leaveEnrollment(
    req.params.id,
    leaveDate ? new Date(leaveDate) : new Date(),
    adminUserId,
  );

  res.json({ success: true, message: 'Student marked as left', timestamp: new Date().toISOString() });
}));

// ── Grandfather / un-grandfather fee ─────────────────────────────
//
// When grandfathered=true the student is intentionally on a different fee
// and will be excluded from the fee-divergence report.

router.patch('/grandfather', asyncHandler(async (req: Request, res: Response) => {
  const { grandfathered, note } = req.body;
  if (typeof grandfathered !== 'boolean') {
    return res.status(400).json({ success: false, error: 'grandfathered (boolean) is required' });
  }

  const enrollment = await Enrollment.findOne({
    studentId: new Types.ObjectId(req.params.id),
    endDate: null,
  });
  if (!enrollment) {
    return res.status(404).json({ success: false, error: 'No active enrollment found for this student' });
  }

  enrollment.feeGrandfathered = grandfathered;
  if (note !== undefined) enrollment.feeNote = note?.trim() ?? '';
  await enrollment.save();

  res.json({
    success: true,
    data: { feeGrandfathered: enrollment.feeGrandfathered, feeNote: enrollment.feeNote },
    timestamp: new Date().toISOString(),
  });
}));

export default router;
