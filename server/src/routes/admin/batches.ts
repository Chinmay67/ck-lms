import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { authorize } from '../../middleware/auth.js';
import Batch from '../../models/v2/Batch.js';
import Enrollment from '../../models/v2/Enrollment.js';

const router = Router();
const requireSuperAdmin = authorize('superadmin');

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { id, courseId, stageNumber, levelNumber, status } = req.query;
  const filter: any = {};
  if (id) filter._id = new Types.ObjectId(id as string);
  if (courseId) filter.courseId = new Types.ObjectId(courseId as string);
  if (stageNumber) filter.stageNumber = parseInt(stageNumber as string);
  if (levelNumber) filter.levelNumber = parseInt(levelNumber as string);
  if (status) filter.status = status;

  const batches = await Batch.find(filter).sort({ batchName: 1 }).lean();

  const batchIds = batches.map((b: any) => b._id);
  const counts = await Enrollment.aggregate([
    { $match: { batchId: { $in: batchIds }, endDate: null } },
    { $group: { _id: '$batchId', count: { $sum: 1 } } },
  ]);
  const countMap: Record<string, number> = {};
  (counts as any[]).forEach((c) => { countMap[c._id.toString()] = c.count; });

  const data = batches.map((b: any) => ({
    ...b,
    id: b._id.toString(),
    activeStudentCount: countMap[b._id.toString()] ?? 0,
  }));

  res.json({ success: true, data, timestamp: new Date().toISOString() });
}));

router.post('/', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const {
    batchName, batchCode, courseId, stageNumber, levelNumber,
    maxStudents, schedule, status, startDate, endDate, description,
  } = req.body;

  if (!batchName) return res.status(400).json({ success: false, error: 'batchName is required' });
  if (!courseId) return res.status(400).json({ success: false, error: 'courseId is required' });
  if (stageNumber === undefined || levelNumber === undefined) {
    return res.status(400).json({ success: false, error: 'stageNumber and levelNumber are required' });
  }

  const batch = await Batch.create({
    batchName,
    batchCode,
    courseId: new Types.ObjectId(courseId),
    stageNumber: parseInt(stageNumber),
    levelNumber: parseInt(levelNumber),
    maxStudents: maxStudents ?? null,
    schedule: Array.isArray(schedule) ? schedule : [],
    status: status ?? 'draft',
    startDate: startDate ? new Date(startDate) : new Date(),
    endDate: endDate ? new Date(endDate) : null,
    description: description ?? '',
    createdBy: req.user!._id,
  });

  res.status(201).json({ success: true, data: batch, timestamp: new Date().toISOString() });
}));

router.put('/:id', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const allowed = ['batchName', 'batchCode', 'maxStudents', 'schedule', 'status', 'startDate', 'endDate', 'description'];
  const update: any = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }
  if (update.startDate) update.startDate = new Date(update.startDate);
  if (update.endDate) update.endDate = new Date(update.endDate);

  const batch = await Batch.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
  res.json({ success: true, data: batch, timestamp: new Date().toISOString() });
}));

router.patch('/:id/end', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const batch = await Batch.findByIdAndUpdate(
    req.params.id,
    { $set: { status: 'ended', endDate: req.body?.endDate ? new Date(req.body.endDate) : new Date() } },
    { new: true, runValidators: true },
  );
  if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
  res.json({ success: true, data: batch, timestamp: new Date().toISOString() });
}));

router.delete('/:id', requireSuperAdmin, asyncHandler(async (req: Request, res: Response) => {
  const activeEnrollments = await Enrollment.countDocuments({
    batchId: new Types.ObjectId(req.params.id),
    endDate: null,
  });
  if (activeEnrollments > 0) {
    return res.status(400).json({ success: false, error: `Cannot delete batch with ${activeEnrollments} active enrollment(s)` });
  }
  const batch = await Batch.findById(req.params.id);
  if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
  await batch.deleteOne();
  res.json({ success: true, message: 'Batch deleted', timestamp: new Date().toISOString() });
}));

export default router;
