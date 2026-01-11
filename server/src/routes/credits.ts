import { Router, Request, Response } from 'express';
import { StudentCreditService } from '../services/StudentCreditService.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ApiResponse, IStudentCredit, PaginatedResponse } from '../types/index.js';

const router = Router();

// Apply authentication to all credit routes
router.use(authenticate);
// Only admin and superadmin can access credit data
router.use(authorize('admin', 'superadmin'));

// GET /api/credits/student/:studentId - Get credit balance for a student
router.get('/student/:studentId', asyncHandler(async (req: Request, res: Response<ApiResponse<{ balance: number }>>) => {
  const { studentId } = req.params;
  
  if (!studentId) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const balance = await StudentCreditService.getCreditBalance(studentId);
  
  return res.json({
    success: true,
    data: { balance },
    message: 'Credit balance retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// GET /api/credits/history/:studentId - Get credit transaction history for a student
router.get('/history/:studentId', asyncHandler(async (req: Request, res: Response<ApiResponse<IStudentCredit[]>>) => {
  const { studentId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = parseInt(req.query.skip as string) || 0;
  
  if (!studentId) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const history = await StudentCreditService.getCreditHistory(studentId, { limit, skip });
  
  return res.json({
    success: true,
    data: history,
    message: `Retrieved ${history.length} credit transactions`,
    timestamp: new Date().toISOString()
  });
}));

// POST /api/credits/add - Add credit to a student's account
router.post('/add', asyncHandler(async (req: Request, res: Response<ApiResponse<IStudentCredit>>) => {
  const { studentId, amount, description, paymentMethod, transactionId, remarks } = req.body;
  const userId = (req as any).user.id;
  
  // Validation
  if (!studentId || !amount || !description) {
    return res.status(400).json({
      success: false,
      error: 'Student ID, amount, and description are required',
      timestamp: new Date().toISOString()
    });
  }
  
  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Amount must be positive',
      timestamp: new Date().toISOString()
    });
  }
  
  // Get student details
  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({
      success: false,
      error: 'Student not found',
      timestamp: new Date().toISOString()
    });
  }
  
  const credit = await StudentCreditService.addCredit({
    studentId,
    studentName: student.studentName,
    amount,
    description,
    paymentMethod,
    transactionId,
    processedBy: userId,
    remarks
  });
  
  return res.status(201).json({
    success: true,
    data: credit,
    message: 'Credit added successfully',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/credits/refund - Add a refund to student's credit
router.post('/refund', asyncHandler(async (req: Request, res: Response<ApiResponse<IStudentCredit>>) => {
  const { studentId, amount, description, feeRecordId, remarks } = req.body;
  const userId = (req as any).user.id;
  
  // Validation
  if (!studentId || !amount || !description) {
    return res.status(400).json({
      success: false,
      error: 'Student ID, amount, and description are required',
      timestamp: new Date().toISOString()
    });
  }
  
  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Amount must be positive',
      timestamp: new Date().toISOString()
    });
  }
  
  // Get student details
  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({
      success: false,
      error: 'Student not found',
      timestamp: new Date().toISOString()
    });
  }
  
  const refund = await StudentCreditService.addRefund({
    studentId,
    studentName: student.studentName,
    amount,
    description,
    feeRecordId,
    processedBy: userId,
    remarks
  });
  
  return res.status(201).json({
    success: true,
    data: refund,
    message: 'Refund processed successfully',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/credits/adjust - Make an adjustment to student's credit
router.post('/adjust', asyncHandler(async (req: Request, res: Response<ApiResponse<IStudentCredit>>) => {
  const { studentId, amount, description, remarks } = req.body;
  const userId = (req as any).user.id;
  
  // Validation
  if (!studentId || amount === undefined || !description) {
    return res.status(400).json({
      success: false,
      error: 'Student ID, amount, and description are required',
      timestamp: new Date().toISOString()
    });
  }
  
  // Get student details
  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({
      success: false,
      error: 'Student not found',
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    const adjustment = await StudentCreditService.makeAdjustment({
      studentId,
      studentName: student.studentName,
      amount,
      description,
      processedBy: userId,
      remarks
    });
    
    return res.status(201).json({
      success: true,
      data: adjustment,
      message: 'Adjustment made successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

// GET /api/credits/summary - Get credit summary for multiple students
router.get('/summary', asyncHandler(async (req: Request, res: Response<ApiResponse<Record<string, number>>>) => {
  const studentIds = req.query.studentIds as string | string[];
  
  if (!studentIds) {
    return res.status(400).json({
      success: false,
      error: 'Student IDs are required',
      timestamp: new Date().toISOString()
    });
  }
  
  const ids = Array.isArray(studentIds) ? studentIds : [studentIds];
  
  const summaryMap = await StudentCreditService.getCreditSummaryForStudents(ids);
  const summary: Record<string, number> = {};
  
  summaryMap.forEach((balance, studentId) => {
    summary[studentId] = balance;
  });
  
  return res.json({
    success: true,
    data: summary,
    message: `Retrieved credit summary for ${ids.length} students`,
    timestamp: new Date().toISOString()
  });
}));

export default router;
