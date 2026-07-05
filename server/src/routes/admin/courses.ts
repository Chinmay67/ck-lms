import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { authorize } from '../../middleware/auth.js';
import Course from '../../models/v2/Course.js';
import Enrollment from '../../models/v2/Enrollment.js';
import CourseFeeHistory from '../../models/v2/CourseFeeHistory.js';
import { upgradeStudentLevel } from '../../services/v2/feeService.js';

const router = Router();
const requireSuperAdmin = authorize('superadmin');

// ── List all courses ──────────────────────────────────────────────

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const filter = req.query.activeOnly === 'true' ? { isActive: true } : {};
  const courses = await Course.find(filter).sort({ displayOrder: 1, courseName: 1 });
  res.json({ success: true, data: courses, timestamp: new Date().toISOString() });
}));

// ── Get single course by ID ───────────────────────────────────────

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
  res.json({ success: true, data: course, timestamp: new Date().toISOString() });
}));

// ── Create course ─────────────────────────────────────────────────

router.post('/', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { courseName, displayName, description, displayOrder } = req.body;
  if (!courseName) return res.status(400).json({ success: false, error: 'courseName is required' });
  if (!displayName) return res.status(400).json({ success: false, error: 'displayName is required' });

  // Enforce single-course constraint
  const existingCount = await Course.countDocuments();
  if (existingCount > 0) {
    return res.status(400).json({
      success: false,
      error: 'Only one course is allowed. Edit the existing course instead.',
    });
  }

  const course = await Course.create({
    courseName: courseName.toLowerCase().trim(),
    displayName,
    description,
    displayOrder: displayOrder ?? 0,
    stages: [],
    createdBy: (req as any).user._id,
  });
  res.status(201).json({ success: true, data: course, timestamp: new Date().toISOString() });
}));

// ── Update course metadata ────────────────────────────────────────

router.put('/:id', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { displayName, description, displayOrder, isActive } = req.body;
  const update: any = {};
  if (displayName !== undefined) update.displayName = displayName;
  if (description !== undefined) update.description = description;
  if (displayOrder !== undefined) update.displayOrder = displayOrder;
  if (isActive !== undefined) update.isActive = isActive;

  const course = await Course.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
  res.json({ success: true, data: course, timestamp: new Date().toISOString() });
}));

// ── Delete course ─────────────────────────────────────────────────

router.delete('/:id', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const activeEnrollments = await Enrollment.countDocuments({
    courseId: new Types.ObjectId(req.params.id),
    endDate: null,
  });
  if (activeEnrollments > 0) {
    return res.status(400).json({
      success: false,
      error: `Cannot delete: ${activeEnrollments} active enrollment(s) use this course`,
    });
  }
  await Course.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Course deleted', timestamp: new Date().toISOString() });
}));

// ── Add stage ─────────────────────────────────────────────────────

router.post('/:id/stages', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { stageNumber, stageName } = req.body;
  if (!stageNumber || !stageName) {
    return res.status(400).json({ success: false, error: 'stageNumber and stageName are required' });
  }

  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

  const exists = (course.stages as any[]).find((s: any) => s.stageNumber === parseInt(stageNumber));
  if (exists) return res.status(400).json({ success: false, error: `Stage ${stageNumber} already exists` });

  (course.stages as any[]).push({ stageNumber: parseInt(stageNumber), stageName, levels: [] });
  (course.stages as any[]).sort((a: any, b: any) => a.stageNumber - b.stageNumber);
  await course.save();
  res.json({ success: true, data: course, timestamp: new Date().toISOString() });
}));

// ── Update stage name ─────────────────────────────────────────────

router.put('/:id/stages/:stageNum', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const stageNum = parseInt(req.params.stageNum);
  const { stageName } = req.body;
  if (!stageName) return res.status(400).json({ success: false, error: 'stageName is required' });

  const course = await Course.findOneAndUpdate(
    { _id: new Types.ObjectId(req.params.id), 'stages.stageNumber': stageNum },
    { $set: { 'stages.$.stageName': stageName } },
    { new: true },
  );
  if (!course) return res.status(404).json({ success: false, error: 'Course or stage not found' });
  res.json({ success: true, data: course, timestamp: new Date().toISOString() });
}));

// ── Delete stage ──────────────────────────────────────────────────

router.delete('/:id/stages/:stageNum', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const stageNum = parseInt(req.params.stageNum);
  const activeCount = await Enrollment.countDocuments({
    courseId: new Types.ObjectId(req.params.id),
    stageNumber: stageNum,
    endDate: null,
  });
  if (activeCount > 0) {
    return res.status(400).json({
      success: false,
      error: `Cannot delete: ${activeCount} active enrollment(s) at this stage`,
    });
  }

  const course = await Course.findByIdAndUpdate(
    req.params.id,
    { $pull: { stages: { stageNumber: stageNum } } },
    { new: true },
  );
  if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
  res.json({ success: true, data: course, timestamp: new Date().toISOString() });
}));

// ── Add level to stage ────────────────────────────────────────────

router.post('/:id/stages/:stageNum/levels', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const stageNum = parseInt(req.params.stageNum);
  const { levelNumber, feeAmount, durationMonthsMin, durationMonthsMax, approximateHours, description } = req.body;
  if (levelNumber === undefined || feeAmount === undefined) {
    return res.status(400).json({ success: false, error: 'levelNumber and feeAmount are required' });
  }

  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

  const stage = (course.stages as any[]).find((s: any) => s.stageNumber === stageNum);
  if (!stage) return res.status(404).json({ success: false, error: `Stage ${stageNum} not found` });

  if (stage.levels.find((l: any) => l.levelNumber === parseInt(levelNumber))) {
    return res.status(400).json({ success: false, error: `Level ${levelNumber} already exists` });
  }

  stage.levels.push({
    levelNumber: parseInt(levelNumber),
    feeAmount: parseInt(feeAmount),
    durationMonthsMin: durationMonthsMin ? parseInt(durationMonthsMin) : undefined,
    durationMonthsMax: durationMonthsMax ? parseInt(durationMonthsMax) : undefined,
    approximateHours: approximateHours ? parseInt(approximateHours) : 0,
    description,
  });
  stage.levels.sort((a: any, b: any) => a.levelNumber - b.levelNumber);
  await course.save();
  res.json({ success: true, data: course, timestamp: new Date().toISOString() });
}));

// ── Update level fee/details ──────────────────────────────────────

router.put('/:id/stages/:stageNum/levels/:levelNum', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const stageNum = parseInt(req.params.stageNum);
  const levelNum = parseInt(req.params.levelNum);
  const { feeAmount, durationMonthsMin, durationMonthsMax, approximateHours, description, reason } = req.body;

  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

  const stage = (course.stages as any[]).find((s: any) => s.stageNumber === stageNum);
  if (!stage) return res.status(404).json({ success: false, error: 'Stage not found' });

  const level = stage.levels.find((l: any) => l.levelNumber === levelNum);
  if (!level) return res.status(404).json({ success: false, error: 'Level not found' });

  const oldFee: number = level.feeAmount;

  const newFee = feeAmount !== undefined ? parseInt(feeAmount) : undefined;

  if (newFee !== undefined) level.feeAmount = newFee;
  if (durationMonthsMin !== undefined) level.durationMonthsMin = durationMonthsMin ? parseInt(durationMonthsMin) : null;
  if (durationMonthsMax !== undefined) level.durationMonthsMax = durationMonthsMax ? parseInt(durationMonthsMax) : null;
  if (approximateHours !== undefined) level.approximateHours = parseInt(approximateHours);
  if (description !== undefined) level.description = description;

  await course.save();

  // Log the fee change (only when feeAmount actually changed)
  if (newFee !== undefined && newFee !== oldFee) {
    await CourseFeeHistory.create({
      courseId: course._id,
      stageNumber: stageNum,
      levelNumber: levelNum,
      oldFee,
      newFee,
      reason: reason?.trim() || undefined,
      changedBy: new Types.ObjectId((req as any).user._id),
      changedAt: new Date(),
    });
  }

  res.json({ success: true, data: course, timestamp: new Date().toISOString() });
}));

// ── Fee change history for a level ───────────────────────────────

router.get('/:id/stages/:stageNum/levels/:levelNum/fee-history', asyncHandler(async (req: Request, res: Response) => {
  const stageNum = parseInt(req.params.stageNum);
  const levelNum = parseInt(req.params.levelNum);

  const course = await Course.findById(req.params.id).lean();
  if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

  const history = await CourseFeeHistory.find({
    courseId: new Types.ObjectId(req.params.id),
    stageNumber: stageNum,
    levelNumber: levelNum,
  })
    .sort({ changedAt: -1 })
    .populate('changedBy', 'name email')
    .lean();

  res.json({ success: true, data: history, timestamp: new Date().toISOString() });
}));

// ── Students on a stale fee (grossFee ≠ current course level fee) ─

router.get('/:id/fee-divergence', asyncHandler(async (req: Request, res: Response) => {
  const course = await Course.findById(req.params.id).lean();
  if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

  // Build a map of stageNumber+levelNumber → current feeAmount
  const currentFeeMap: Record<string, number> = {};
  for (const stage of (course as any).stages) {
    for (const level of stage.levels) {
      currentFeeMap[`${stage.stageNumber}:${level.levelNumber}`] = level.feeAmount;
    }
  }

  // Find all active enrollments for this course
  const activeEnrollments = await Enrollment.find({
    courseId: new Types.ObjectId(req.params.id),
    endDate: null,
    feeGrandfathered: { $ne: true },
  })
    .populate('studentId', 'studentName phone email studentCode')
    .lean();

  const diverged = activeEnrollments
    .map((enrollment: any) => {
      const key = `${enrollment.stageNumber}:${enrollment.levelNumber}`;
      const currentFee = currentFeeMap[key] ?? null;
      const delta = currentFee !== null ? currentFee - enrollment.grossFee : null;
      return { enrollment, currentCourseFee: currentFee, delta };
    })
    .filter(({ delta }) => delta !== null && delta !== 0);

  res.json({
    success: true,
    data: {
      total: diverged.length,
      enrollments: diverged.map(({ enrollment, currentCourseFee, delta }) => ({
        enrollmentId: enrollment._id,
        student: enrollment.studentId,
        stageNumber: enrollment.stageNumber,
        levelNumber: enrollment.levelNumber,
        enrollmentFee: enrollment.grossFee,   // what was current when they enrolled
        effectiveFee: enrollment.monthlyFee,  // what they actually pay (after discount)
        currentCourseFee,                     // what the course charges now
        feeDelta: delta,                      // positive = course went up, negative = course went down
        enrollmentStartDate: enrollment.startDate,
      })),
    },
    timestamp: new Date().toISOString(),
  });
}));

// ── Delete level ──────────────────────────────────────────────────

router.delete('/:id/stages/:stageNum/levels/:levelNum', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const stageNum = parseInt(req.params.stageNum);
  const levelNum = parseInt(req.params.levelNum);

  const activeCount = await Enrollment.countDocuments({
    courseId: new Types.ObjectId(req.params.id),
    stageNumber: stageNum,
    levelNumber: levelNum,
    endDate: null,
  });
  if (activeCount > 0) {
    return res.status(400).json({
      success: false,
      error: `Cannot delete: ${activeCount} active enrollment(s) at this level`,
    });
  }

  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

  const stage = (course.stages as any[]).find((s: any) => s.stageNumber === stageNum);
  if (!stage) return res.status(404).json({ success: false, error: 'Stage not found' });

  stage.levels = stage.levels.filter((l: any) => l.levelNumber !== levelNum);
  await course.save();
  res.json({ success: true, data: course, timestamp: new Date().toISOString() });
}));

// ── Bulk-apply a fee change to students ───────────────────────────
//
// Called after updating a level fee. The admin provides:
//   upgradeStudentIds   – apply the new course fee to these students (fee_change)
//   grandfatherStudentIds – keep on old fee, silence from divergence report
//   effectiveDate       – defaults to start of next UTC month
//
// Each student upgrade runs in its own transaction so one failure does not
// roll back the others. The response always returns a per-student summary.

router.post('/:id/stages/:stageNum/levels/:levelNum/bulk-apply-fee', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const stageNum = parseInt(req.params.stageNum);
  const levelNum = parseInt(req.params.levelNum);
  const adminUserId = (req as any).user._id.toString();

  const upgradeStudentIds: string[] = Array.isArray(req.body.upgradeStudentIds) ? req.body.upgradeStudentIds : [];
  const grandfatherStudentIds: string[] = Array.isArray(req.body.grandfatherStudentIds) ? req.body.grandfatherStudentIds : [];

  if (upgradeStudentIds.length === 0 && grandfatherStudentIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Provide at least one studentId in upgradeStudentIds or grandfatherStudentIds' });
  }

  // Default effectiveDate → first day of next month (UTC midnight)
  let effectiveDate: Date;
  if (req.body.effectiveDate) {
    effectiveDate = new Date(req.body.effectiveDate);
    if (isNaN(effectiveDate.getTime())) {
      return res.status(400).json({ success: false, error: 'effectiveDate is not a valid date' });
    }
  } else {
    const now = new Date();
    effectiveDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }

  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

  const newFee: number | null = (course as any).getFeeForLevel(stageNum, levelNum);
  if (newFee === null) {
    return res.status(404).json({ success: false, error: `Stage ${stageNum} Level ${levelNum} not found on course` });
  }

  const upgraded: Array<{ studentId: string; enrollmentId: string }> = [];
  const grandfathered: string[] = [];
  const failed: Array<{ studentId: string; error: string }> = [];

  // ── Apply fee_change upgrade ──────────────────────────────────
  for (const studentId of upgradeStudentIds) {
    try {
      // Load the current enrollment to carry the discount forward
      const currentEnrollment = await Enrollment.findOne({
        studentId: new Types.ObjectId(studentId),
        endDate: null,
      }).lean() as any;

      if (!currentEnrollment) {
        failed.push({ studentId, error: 'No active enrollment found' });
        continue;
      }

      // Re-apply the student's existing discount against the new gross fee
      const existingDiscountType: 'none' | 'percentage' | 'fixed' = currentEnrollment.discountType ?? 'none';
      const existingDiscountPct: number = currentEnrollment.discountPct ?? 0;
      const existingDiscountAmount: number = currentEnrollment.discountAmount ?? 0;

      let effectiveFee = newFee;
      if (existingDiscountType === 'percentage' && existingDiscountPct > 0) {
        effectiveFee = Math.round(newFee * (1 - existingDiscountPct / 100));
      } else if (existingDiscountType === 'fixed' && existingDiscountAmount > 0) {
        effectiveFee = Math.max(0, newFee - existingDiscountAmount);
      }

      const result = await upgradeStudentLevel(
        studentId,
        req.params.id,
        stageNum,
        levelNum,
        effectiveFee,         // monthlyFee = new gross fee with discount re-applied
        effectiveDate,
        adminUserId,
        undefined,            // carry existing batch forward (fee_change logic in service)
        existingDiscountPct,
        currentEnrollment.discountReason,
        newFee,               // grossFee = new course level fee
        existingDiscountType,
        existingDiscountAmount,
        false,
        'fee_change',
      );
      if (!result.success) {
        failed.push({ studentId, error: (result as any).error ?? 'Unknown error' });
      } else {
        upgraded.push({ studentId, enrollmentId: (result as any).enrollment._id.toString() });
      }
    } catch (err: any) {
      failed.push({ studentId, error: err.message ?? 'Unknown error' });
    }
  }

  // ── Grandfather ───────────────────────────────────────────────
  for (const studentId of grandfatherStudentIds) {
    try {
      const enrollment = await Enrollment.findOne({
        studentId: new Types.ObjectId(studentId),
        endDate: null,
      });
      if (!enrollment) {
        failed.push({ studentId, error: 'No active enrollment found' });
        continue;
      }
      enrollment.feeGrandfathered = true;
      enrollment.feeNote = req.body.grandfatherNote?.trim() || 'Kept on previous fee rate';
      await enrollment.save();
      grandfathered.push(studentId);
    } catch (err: any) {
      failed.push({ studentId, error: err.message ?? 'Unknown error' });
    }
  }

  const overallSuccess = failed.length === 0;
  res.status(overallSuccess ? 200 : 207).json({
    success: overallSuccess,
    data: {
      effectiveDate,
      newFee,
      upgraded,
      grandfathered,
      failed,
      summary: {
        totalRequested: upgradeStudentIds.length + grandfatherStudentIds.length,
        upgradedCount: upgraded.length,
        grandfatheredCount: grandfathered.length,
        failedCount: failed.length,
      },
    },
    timestamp: new Date().toISOString(),
  });
}));

export default router;
