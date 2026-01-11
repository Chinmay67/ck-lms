import express, { Request, Response } from 'express';
import { BatchService } from '../services/BatchService.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError, NotFoundError, BusinessError, assert, validate } from '../utils/errors.js';
import { ApiResponse } from '../types/index.js';

const router = express.Router();

/**
 * @route   POST /api/batches
 * @desc    Create a new batch
 * @access  Superadmin only
 */
router.post('/', authenticate, authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { batchName, stage, level, maxCapacity, schedule, startDate, status } = req.body;
  
  // Validation with descriptive messages
  assert.required({ batchName, stage, level, maxCapacity, startDate }, {
    batchName: 'Batch name',
    stage: 'Stage',
    level: 'Level',
    maxCapacity: 'Maximum capacity',
    startDate: 'Start date'
  });
  
  assert.inArray(stage, ['beginner', 'intermediate', 'advanced'], 'Stage');
  assert.positiveNumber(level, 'Level');
  assert.positiveNumber(maxCapacity, 'Maximum capacity');
  
  if (level > 5) {
    throw new ValidationError('Level cannot be greater than 5');
  }
  
  if (schedule && (!Array.isArray(schedule) || schedule.length === 0)) {
    throw new ValidationError('Please add at least one schedule entry for the batch');
  }
  
  const batch = await BatchService.createBatch(req.body, (req.user!._id as any).toString());
  
  res.status(201).json({
    success: true,
    data: batch,
    message: `Batch "${batchName}" created successfully`,
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   GET /api/batches
 * @desc    Get all batches with optional filters
 * @access  Authenticated users
 */
router.get('/', authenticate, asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { status, stage, level } = req.query;
  
  const filters: any = {};
  if (status) {
    if (!['active', 'ended', 'draft'].includes(status as string)) {
      throw new ValidationError('Invalid status filter. Use: active, ended, or draft');
    }
    filters.status = status;
  }
  if (stage) {
    if (!['beginner', 'intermediate', 'advanced'].includes(stage as string)) {
      throw new ValidationError('Invalid stage filter. Use: beginner, intermediate, or advanced');
    }
    filters.stage = stage;
  }
  if (level) {
    const levelNum = parseInt(level as string);
    if (isNaN(levelNum) || levelNum < 1 || levelNum > 5) {
      throw new ValidationError('Invalid level filter. Use a number between 1 and 5');
    }
    filters.level = levelNum;
  }
  
  const batches = await BatchService.getAllBatches(filters);
  
  res.json({
    success: true,
    data: batches,
    count: batches.length,
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   GET /api/batches/stats
 * @desc    Get batch statistics
 * @access  Authenticated users
 */
router.get('/stats', authenticate, asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const stats = await BatchService.getBatchStats();
  
  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   GET /api/batches/available
 * @desc    Get available batches for a specific stage and level
 * @access  Authenticated users
 */
router.get('/available', authenticate, asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { stage, level } = req.query;
  
  if (!stage || !level) {
    throw new ValidationError('Please specify both stage and level to find available batches');
  }
  
  if (!['beginner', 'intermediate', 'advanced'].includes(stage as string)) {
    throw new ValidationError('Invalid stage. Use: beginner, intermediate, or advanced');
  }
  
  const levelNum = parseInt(level as string);
  if (isNaN(levelNum) || levelNum < 1 || levelNum > 5) {
    throw new ValidationError('Invalid level. Must be a number between 1 and 5');
  }
  
  const batches = await BatchService.getAvailableBatches(
    stage as 'beginner' | 'intermediate' | 'advanced',
    levelNum
  );
  
  res.json({
    success: true,
    data: batches,
    count: batches.length,
    message: batches.length === 0 
      ? `No available batches found for ${stage} level ${levelNum}` 
      : `Found ${batches.length} available batch(es)`,
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   POST /api/batches/validate-schedule
 * @desc    Validate schedule for conflicts
 * @access  Superadmin only
 */
router.post('/validate-schedule', authenticate, authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { schedule, excludeBatchId } = req.body;
  
  if (!schedule || !Array.isArray(schedule)) {
    throw new ValidationError('Please provide a schedule to validate');
  }
  
  if (schedule.length === 0) {
    throw new ValidationError('Schedule must contain at least one entry');
  }
  
  // Validate schedule entries
  for (const entry of schedule) {
    if (entry.dayOfWeek === undefined || entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
      throw new ValidationError('Each schedule entry must have a valid day of week (0-6)');
    }
    if (!entry.startTime) {
      throw new ValidationError('Each schedule entry must have a start time');
    }
  }
  
  const result = await BatchService.checkScheduleConflicts(schedule, excludeBatchId);
  
  res.json({
    success: true,
    data: result,
    message: result.hasConflict 
      ? `Schedule conflicts found with ${result.conflicts.length} existing batch(es)` 
      : 'No schedule conflicts found',
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   GET /api/batches/:id
 * @desc    Get batch by ID
 * @access  Authenticated users
 */
router.get('/:id', authenticate, asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  
  if (!validate.isValidObjectId(id)) {
    throw new ValidationError('Invalid batch ID format');
  }
  
  const batch = await BatchService.getBatchById(id);
  
  if (!batch) {
    throw new NotFoundError('Batch');
  }
  
  res.json({
    success: true,
    data: batch,
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   GET /api/batches/:id/students
 * @desc    Get all students in a batch
 * @access  Authenticated users
 */
router.get('/:id/students', authenticate, asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  
  if (!validate.isValidObjectId(id)) {
    throw new ValidationError('Invalid batch ID format');
  }
  
  const students = await BatchService.getBatchStudents(id);
  
  res.json({
    success: true,
    data: students,
    count: students.length,
    message: students.length === 0 
      ? 'No students enrolled in this batch yet' 
      : `Found ${students.length} student(s) in this batch`,
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   PUT /api/batches/:id
 * @desc    Update batch
 * @access  Superadmin only
 */
router.put('/:id', authenticate, authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  
  if (!validate.isValidObjectId(id)) {
    throw new ValidationError('Invalid batch ID format');
  }
  
  const batch = await BatchService.updateBatch(id, req.body);
  
  if (!batch) {
    throw new NotFoundError('Batch');
  }
  
  res.json({
    success: true,
    data: batch,
    message: `Batch "${batch.batchName}" updated successfully`,
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   PATCH /api/batches/:id/end
 * @desc    End a batch
 * @access  Superadmin only
 */
router.patch('/:id/end', authenticate, authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  
  if (!validate.isValidObjectId(id)) {
    throw new ValidationError('Invalid batch ID format');
  }
  
  const batch = await BatchService.endBatch(id);
  
  if (!batch) {
    throw new NotFoundError('Batch');
  }
  
  res.json({
    success: true,
    data: batch,
    message: `Batch "${batch.batchName}" has been ended. Students can no longer be enrolled.`,
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   DELETE /api/batches/:id
 * @desc    Delete batch (only if no students assigned)
 * @access  Superadmin only
 */
router.delete('/:id', authenticate, authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  
  if (!validate.isValidObjectId(id)) {
    throw new ValidationError('Invalid batch ID format');
  }
  
  const deleted = await BatchService.deleteBatch(id);
  
  if (!deleted) {
    throw new NotFoundError('Batch');
  }
  
  res.json({
    success: true,
    message: 'Batch deleted successfully',
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   PATCH /api/batches/:batchId/assign/:studentId
 * @desc    Assign student to batch
 * @access  Admin and Superadmin
 */
router.patch('/:batchId/assign/:studentId', authenticate, authorize('admin', 'superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { batchId, studentId } = req.params;
  
  if (!validate.isValidObjectId(batchId)) {
    throw new ValidationError('Invalid batch ID format');
  }
  
  if (!validate.isValidObjectId(studentId)) {
    throw new ValidationError('Invalid student ID format');
  }
  
  const result = await BatchService.assignStudentToBatch(studentId, batchId);
  
  res.json({
    success: true,
    data: result,
    message: 'Student successfully assigned to batch',
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   PATCH /api/batches/remove/:studentId
 * @desc    Remove student from batch
 * @access  Admin and Superadmin
 */
router.patch('/remove/:studentId', authenticate, authorize('admin', 'superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { studentId } = req.params;
  
  if (!validate.isValidObjectId(studentId)) {
    throw new ValidationError('Invalid student ID format');
  }
  
  const result = await BatchService.removeStudentFromBatch(studentId);
  
  res.json({
    success: true,
    data: result,
    message: 'Student has been removed from their batch',
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   GET /api/batches/:id/eligible-students
 * @desc    Get all eligible students for a batch (matching stage/level)
 * @access  Admin and Superadmin
 */
router.get('/:id/eligible-students', authenticate, authorize('admin', 'superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  
  if (!validate.isValidObjectId(id)) {
    throw new ValidationError('Invalid batch ID format');
  }
  
  const students = await BatchService.getEligibleStudentsForBatch(id);
  
  res.json({
    success: true,
    data: students,
    count: students.length,
    message: students.length === 0 
      ? 'No eligible students found for this batch' 
      : `Found ${students.length} eligible student(s)`,
    timestamp: new Date().toISOString()
  });
}));

/**
 * @route   POST /api/batches/:id/assign-bulk
 * @desc    Bulk assign students to batch
 * @access  Admin and Superadmin
 */
router.post('/:id/assign-bulk', authenticate, authorize('admin', 'superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  const { studentIds } = req.body;
  
  if (!validate.isValidObjectId(id)) {
    throw new ValidationError('Invalid batch ID format');
  }
  
  if (!studentIds || !Array.isArray(studentIds)) {
    throw new ValidationError('Please provide a list of student IDs to assign');
  }
  
  if (studentIds.length === 0) {
    throw new ValidationError('Please select at least one student to assign');
  }
  
  // Validate all student IDs
  for (const studentId of studentIds) {
    if (!validate.isValidObjectId(studentId)) {
      throw new ValidationError(`Invalid student ID format: ${studentId}`);
    }
  }
  
  const result = await BatchService.bulkAssignStudentsToBatch(studentIds, id);
  
  const failedResults = result.results.filter(r => !r.success);
  let message = `Successfully assigned ${result.assignedCount} student(s) to batch`;
  if (failedResults.length > 0) {
    message += `. ${failedResults.length} student(s) could not be assigned.`;
  }
  
  res.json({
    success: true,
    data: result,
    message,
    timestamp: new Date().toISOString()
  });
}));

export default router;
