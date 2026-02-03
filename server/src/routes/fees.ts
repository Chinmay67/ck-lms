import { Router, Request, Response } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import FeeRecord from '../models/FeeRecord.js';
import Course from '../models/Course.js';
import Student from '../models/Student.js';
import { FeeService } from '../services/FeeService.js';
import { StudentCreditService } from '../services/StudentCreditService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ApiResponse, IFeeRecord, FeeStats, PaginatedResponse } from '../types/index.js';
import { cleanPhoneNumber, parseExcelDate } from '../utils/fieldValidation.js';

const router = Router();

// Helper function to convert status filter to date-based query
function getStatusQuery(status: string): any {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  switch(status) {
    case 'paid':
      return { paymentDate: { $ne: null }, $expr: { $gte: ['$paidAmount', '$feeAmount'] } };
    case 'partially_paid':
      return { paymentDate: { $ne: null }, $expr: { $lt: ['$paidAmount', '$feeAmount'] } };
    case 'overdue':
      return { paymentDate: null, dueDate: { $lt: now } };
    case 'upcoming':
      return { paymentDate: null, dueDate: { $gte: now } };
    default:
      return {};
  }
}

// Configure multer for file upload (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only Excel files
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

// Apply authentication to all fee routes
router.use(authenticate);
// Only admin and superadmin can access fee data
router.use(authorize('admin', 'superadmin'));

// GET /api/fees - Get all fee records with filters (admin/superadmin)
router.get('/', asyncHandler(async (req: Request, res: Response<ApiResponse<PaginatedResponse<IFeeRecord>>>) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const status = req.query.status as string;
  const stage = req.query.stage as string;
  const studentId = req.query.studentId as string;
  const sortBy = req.query.sortBy as string || 'dueDate';
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'asc';

  const query: any = {};
  
  if (status) {
    Object.assign(query, getStatusQuery(status));
  }
  
  if (stage) {
    query.stage = stage;
  }
  
  if (studentId) {
    query.studentId = studentId;
  }

  const skip = (page - 1) * limit;
  const sort: any = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  const [data, total] = await Promise.all([
    FeeRecord.find(query).sort(sort).skip(skip).limit(limit),
    FeeRecord.countDocuments(query)
  ]);

  const totalPages = Math.ceil(total / limit);

  return res.json({
    success: true,
    data: {
      data,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    },
    message: `Retrieved ${data.length} fee records`,
    timestamp: new Date().toISOString()
  });
}));

// GET /api/fees/student/:studentId - Get fees for specific student
router.get('/student/:studentId', asyncHandler(async (req: Request, res: Response<ApiResponse<IFeeRecord[]>>) => {
  const { studentId } = req.params;
  
  if (!studentId) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const fees = await FeeRecord.find({ studentId }).sort({ dueDate: 1 });
  
  return res.json({
    success: true,
    data: fees,
    message: `Retrieved ${fees.length} fee records for student`,
    timestamp: new Date().toISOString()
  });
}));

// GET /api/fees/overdue - Get all overdue fees
router.get('/overdue', asyncHandler(async (req: Request, res: Response<ApiResponse<IFeeRecord[]>>) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const overdueFees = await FeeRecord.find({ 
    paymentDate: null,
    dueDate: { $lt: now }
  })
    .sort({ dueDate: 1 })
    .populate('studentId', 'studentName email phone');
  
  return res.json({
    success: true,
    data: overdueFees,
    message: `Retrieved ${overdueFees.length} overdue fee records`,
    timestamp: new Date().toISOString()
  });
}));

// GET /api/fees/stats - Get payment statistics
router.get('/stats', asyncHandler(async (req: Request, res: Response<ApiResponse<FeeStats>>) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalCollected,
    totalUpcoming,
    totalOverdue,
    totalPartiallyPaid,
    recentPayments,
    allFees,
    totalStudentsCount,
    studentStatusCounts
  ] = await Promise.all([
    FeeRecord.aggregate([
      { $match: { paymentDate: { $ne: null }, $expr: { $gte: ['$paidAmount', '$feeAmount'] } } },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } }
    ]),
    FeeRecord.aggregate([
      { $match: { paymentDate: null, dueDate: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$feeAmount' } } }
    ]),
    FeeRecord.aggregate([
      { $match: { paymentDate: null, dueDate: { $lt: today } } },
      { $group: { _id: null, total: { $sum: '$feeAmount' } } }
    ]),
    FeeRecord.aggregate([
      { $match: { paymentDate: { $ne: null }, $expr: { $lt: ['$paidAmount', '$feeAmount'] } } },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } }
    ]),
    FeeRecord.find({ paymentDate: { $ne: null } })
      .sort({ paymentDate: -1 })
      .limit(10),
    FeeRecord.find(),
    Student.countDocuments(),
    FeeRecord.aggregate([
      {
        $group: {
          _id: '$studentId',
          fees: {
            $push: {
              paymentDate: '$paymentDate',
              paidAmount: '$paidAmount',
              feeAmount: '$feeAmount',
              dueDate: '$dueDate'
            }
          }
        }
      },
      {
        $project: {
          studentId: '$_id',
          hasPaid: {
            $anyElementTrue: {
              $map: {
                input: '$fees',
                as: 'fee',
                in: {
                  $and: [
                    { $ne: ['$$fee.paymentDate', null] },
                    { $gte: ['$$fee.paidAmount', '$$fee.feeAmount'] }
                  ]
                }
              }
            }
          },
          hasUpcoming: {
            $anyElementTrue: {
              $map: {
                input: '$fees',
                as: 'fee',
                in: {
                  $and: [
                    { $eq: ['$$fee.paymentDate', null] },
                    { $gte: ['$$fee.dueDate', today] }
                  ]
                }
              }
            }
          },
          hasOverdue: {
            $anyElementTrue: {
              $map: {
                input: '$fees',
                as: 'fee',
                in: {
                  $and: [
                    { $eq: ['$$fee.paymentDate', null] },
                    { $lt: ['$$fee.dueDate', today] }
                  ]
                }
              }
            }
          },
          hasPartiallyPaid: {
            $anyElementTrue: {
              $map: {
                input: '$fees',
                as: 'fee',
                in: {
                  $and: [
                    { $ne: ['$$fee.paymentDate', null] },
                    { $lt: ['$$fee.paidAmount', '$$fee.feeAmount'] }
                  ]
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          paidStudents: { $sum: { $cond: ['$hasPaid', 1, 0] } },
          upcomingStudents: { $sum: { $cond: ['$hasUpcoming', 1, 0] } },
          overdueStudentsCount: { $sum: { $cond: ['$hasOverdue', 1, 0] } },
          partiallyPaidStudents: { $sum: { $cond: ['$hasPartiallyPaid', 1, 0] } }
        }
      }
    ])
  ]);

  // Calculate stage breakdown with student counts
  const stageBreakdown = {
    beginner: { collected: 0, upcoming: 0, overdue: 0, students: 0, paidStudents: 0 },
    intermediate: { collected: 0, upcoming: 0, overdue: 0, students: 0, paidStudents: 0 },
    advanced: { collected: 0, upcoming: 0, overdue: 0, students: 0, paidStudents: 0 }
  };

  const stageStudentMap = new Map();
  
  allFees.forEach((fee: any) => {
    const stage = fee.stage as keyof typeof stageBreakdown;
    if (stageBreakdown[stage]) {
      // Track unique students per stage
      const studentKey = `${fee.studentId}-${stage}`;
      if (!stageStudentMap.has(studentKey)) {
        stageStudentMap.set(studentKey, true);
        stageBreakdown[stage].students += 1;
      }
      
      // Calculate status for this fee
      let feeStatus: 'paid' | 'partially_paid' | 'overdue' | 'upcoming';
      if (fee.paymentDate) {
        feeStatus = fee.paidAmount >= fee.feeAmount ? 'paid' : 'partially_paid';
      } else {
        feeStatus = fee.dueDate < today ? 'overdue' : 'upcoming';
      }
      
      // Track amounts based on calculated status
      if (feeStatus === 'paid') {
        stageBreakdown[stage].collected += fee.paidAmount;
        stageBreakdown[stage].paidStudents += 1;
      } else if (feeStatus === 'upcoming') {
        stageBreakdown[stage].upcoming += fee.feeAmount;
      } else if (feeStatus === 'overdue') {
        stageBreakdown[stage].overdue += fee.feeAmount;
      }
    }
  });

  // Calculate overdue students
  const overdueStudentMap = new Map();
  allFees.forEach((fee: any) => {
    // Calculate status for this fee
    let feeStatus: 'paid' | 'partially_paid' | 'overdue' | 'upcoming';
    if (fee.paymentDate) {
      feeStatus = fee.paidAmount >= fee.feeAmount ? 'paid' : 'partially_paid';
    } else {
      feeStatus = fee.dueDate < today ? 'overdue' : 'upcoming';
    }
    
    if (feeStatus === 'overdue') {
      const key = fee.studentId.toString();
      if (!overdueStudentMap.has(key)) {
        overdueStudentMap.set(key, {
          studentId: fee.studentId.toString(),
          studentName: fee.studentName,
          stage: fee.stage,
          level: fee.level,
          overdueAmount: 0,
          overdueMonths: 0
        });
      }
      const student = overdueStudentMap.get(key);
      student.overdueAmount += fee.feeAmount;
      student.overdueMonths += 1;
    }
  });

  const stats: FeeStats = {
    totalCollected: totalCollected[0]?.total || 0,
    totalUpcoming: totalUpcoming[0]?.total || 0,
    totalOverdue: totalOverdue[0]?.total || 0,
    totalPartiallyPaid: totalPartiallyPaid[0]?.total || 0,
    totalStudents: totalStudentsCount,
    paidStudents: studentStatusCounts[0]?.paidStudents || 0,
    upcomingStudents: studentStatusCounts[0]?.upcomingStudents || 0,
    overdueStudentsCount: studentStatusCounts[0]?.overdueStudentsCount || 0,
    partiallyPaidStudents: studentStatusCounts[0]?.partiallyPaidStudents || 0,
    stageBreakdown,
    recentPayments,
    overdueStudents: Array.from(overdueStudentMap.values())
  };

  return res.json({
    success: true,
    data: stats,
    message: 'Fee statistics retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/fees - Create single or multiple fee records
router.post('/', asyncHandler(async (req: Request, res: Response<ApiResponse<IFeeRecord | IFeeRecord[]>>) => {
  const feeData = req.body;
  const userId = (req as any).user.id;
  
  // Handle bulk creation
  if (Array.isArray(feeData)) {
    const createdFees: IFeeRecord[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < feeData.length; i++) {
      try {
        const fee = await createFeeRecord(feeData[i], userId);
        createdFees.push(fee);
      } catch (error: any) {
        errors.push({ index: i, error: error.message });
      }
    }

    return res.status(201).json({
      success: true,
      data: createdFees,
      message: `Created ${createdFees.length} fee records${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
      timestamp: new Date().toISOString()
    });
  } else {
    // Single fee record creation
    const fee = await createFeeRecord(feeData, userId);
    
    return res.status(201).json({
      success: true,
      data: fee,
      message: 'Fee record created successfully',
      timestamp: new Date().toISOString()
    });
  }
}));

// PUT /api/fees/:id - Update fee record
router.put('/:id', asyncHandler(async (req: Request, res: Response<ApiResponse<IFeeRecord>>) => {
  const { id } = req.params;
  const updateData = req.body;
  const userId = (req as any).user.id;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Fee record ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  // Remove fields that shouldn't be updated directly
  delete updateData.id;
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.updatedAt;
  delete updateData.studentId;
  delete updateData.studentName;
  delete updateData.stage;
  delete updateData.level;
  delete updateData.feeMonth;
  delete updateData.dueDate;
  delete updateData.feeAmount;
  
  // Add updatedBy
  updateData.updatedBy = userId;
  
  // Get existing fee record for validation and auto-fill logic
  const existingFee = await FeeRecord.findById(id);
  if (!existingFee) {
    return res.status(404).json({
      success: false,
      error: 'Fee record not found',
      timestamp: new Date().toISOString()
    });
  }
  
  // Validate transactionId if provided (optional - not required for cash payments)
  if (updateData.transactionId) {
    // Check if transactionId is used by another student
    const duplicateTransaction = await FeeRecord.findOne({
      transactionId: updateData.transactionId,
      studentId: { $ne: existingFee.studentId }
    });
    
    if (duplicateTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID is already used by another student',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Auto-fill paidAmount when paymentDate is set (works for both cash and online payments)
  // If paymentDate is being added/updated and paidAmount is not explicitly provided or is 0,
  // assume full payment and set paidAmount to feeAmount
  if (updateData.paymentDate !== undefined) {
    if (updateData.paymentDate !== null) {
      // Payment date is being set
      if (updateData.paidAmount === undefined || updateData.paidAmount === 0) {
        // Default to full payment if paidAmount not specified or is 0
        updateData.paidAmount = existingFee.feeAmount;
      }
    } else {
      // Payment date is being cleared - reset paidAmount to 0
      updateData.paidAmount = 0;
    }
  }
  
  // Validate that paidAmount does not exceed feeAmount
  if (updateData.paidAmount !== undefined && updateData.paidAmount > existingFee.feeAmount) {
    return res.status(400).json({
      success: false,
      error: `Paid amount (₹${updateData.paidAmount}) cannot exceed fee amount (₹${existingFee.feeAmount})`,
      timestamp: new Date().toISOString()
    });
  }
  
  const fee = await FeeRecord.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
  
  if (!fee) {
    return res.status(404).json({
      success: false,
      error: 'Fee record not found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    data: fee,
    message: 'Fee record updated successfully',
    timestamp: new Date().toISOString()
  });
}));

// DELETE /api/fees/:id - Delete fee record
router.delete('/:id', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Fee record ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const deleted = await FeeRecord.findByIdAndDelete(id);
  
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: 'Fee record not found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    message: 'Fee record deleted successfully',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/fees/bulk-payment - Record payment for multiple months
router.post('/bulk-payment', asyncHandler(async (req: Request, res: Response<ApiResponse<any>>) => {
  const { studentId, months, paymentDate, paymentMethod, transactionId, remarks, paidAmount } = req.body;
  const userId = (req as any).user.id;
  
  // Validation
  if (!studentId) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  if (!paymentDate || !paymentMethod) {
    return res.status(400).json({
      success: false,
      error: 'Payment date and payment method are required',
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
  
  // Get course configuration for student's stage
  const course = await Course.findOne({ 
    courseName: student.stage || student.skillCategory,
    isActive: true 
  });
  
  if (!course || course.levels.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Course configuration not found for student\'s stage',
      timestamp: new Date().toISOString()
    });
  }
  
  // Get fee amount from the first level (or use student's level if available)
  const studentLevel = student.level || student.skillLevel || 1;
  const levelConfig = course.levels.find((l: any) => l.levelNumber === studentLevel) || course.levels[0];
  
  if (!levelConfig) {
    return res.status(400).json({
      success: false,
      error: 'No level configuration found for course',
      timestamp: new Date().toISOString()
    });
  }
  
  const feeAmount = levelConfig.feeAmount;
  
  // Check if student has a batch assigned
  if (!student.batchId) {
    // Student has no batch - create active credit instead
    const totalAmount = paidAmount || (months && Array.isArray(months) ? months.length * feeAmount : feeAmount);
    
    const credit = await StudentCreditService.addCredit({
      studentId,
      studentName: student.studentName,
      amount: totalAmount,
      description: `Payment received before batch assignment - ${paymentMethod}`,
      paymentMethod,
      transactionId,
      processedBy: userId
    });
    
    return res.status(201).json({
      success: true,
      data: {
        credit,
        message: 'Student has no batch assigned. Credit created and will be applied when student is assigned to a batch.'
      },
      message: 'Credit added successfully for student without batch',
      timestamp: new Date().toISOString()
    });
  }
  
  // Student has a batch - proceed with normal fee payment
  if (!months || !Array.isArray(months) || months.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Months array is required for students with batch assignment',
      timestamp: new Date().toISOString()
    });
  }
  
  // Validate transaction ID if provided
  if (transactionId) {
    // Check if transactionId is used by another student
    const duplicateTransaction = await FeeRecord.findOne({
      transactionId,
      studentId: { $ne: studentId }
    });
    
    if (duplicateTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID is already used by another student',
        timestamp: new Date().toISOString()
      });
    }
    
    // Check if months are consecutive for the same transaction ID
    const sortedMonths = [...months].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    for (let i = 1; i < sortedMonths.length; i++) {
      const prevMonth = new Date(sortedMonths[i - 1].dueDate);
      const currMonth = new Date(sortedMonths[i].dueDate);
      const monthDiff = (currMonth.getMonth() - prevMonth.getMonth()) + 
                        (currMonth.getFullYear() - prevMonth.getFullYear()) * 12;
      
      if (monthDiff !== 1) {
        return res.status(400).json({
          success: false,
          error: 'Months must be consecutive when using the same transaction ID',
          timestamp: new Date().toISOString()
        });
      }
    }
  }
  
  // Create fee records for each month
  const createdFees: IFeeRecord[] = [];
  const errors: Array<{ month: string; error: string }> = [];
  
  for (const monthData of months) {
    try {
      // Check if fee record already exists
      const existingFee = await FeeRecord.findOne({
        studentId,
        feeMonth: monthData.feeMonth
      });
      
      if (existingFee) {
        // Update existing fee record
        const amountToPay = paidAmount || feeAmount;
        existingFee.paidAmount = Math.min(existingFee.paidAmount + amountToPay, feeAmount);
        existingFee.paymentDate = new Date(paymentDate);
        existingFee.paymentMethod = paymentMethod;
        existingFee.transactionId = transactionId;
        existingFee.remarks = remarks;
        existingFee.updatedBy = userId;
        
        await existingFee.save();
        createdFees.push(existingFee);
      } else {
        // Create new fee record (status is computed dynamically)
        const amountToPay = paidAmount || feeAmount;
        
        const fee = await FeeRecord.create({
          studentId,
          studentName: student.studentName,
          stage: student.stage || student.skillCategory,
          level: student.level || student.skillLevel,
          feeMonth: monthData.feeMonth,
          dueDate: new Date(monthData.dueDate),
          feeAmount: feeAmount,
          paidAmount: amountToPay,
          paymentDate: new Date(paymentDate),
          paymentMethod,
          transactionId,
          remarks,
          updatedBy: userId
        });
        createdFees.push(fee);
      }
    } catch (error: any) {
      errors.push({ month: monthData.feeMonth, error: error.message });
    }
  }
  
  // Automatically generate the next month's fee after payment
  try {
    await FeeService.generateNextMonthFee(studentId);
  } catch (error: any) {
    console.warn(`Failed to generate next month fee for student ${studentId}: ${error.message}`);
    // Don't fail the payment if fee generation fails
  }
  
  return res.status(201).json({
    success: true,
    data: createdFees,
    message: `Recorded payment for ${createdFees.length} months${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    timestamp: new Date().toISOString()
  });
}));

// Helper function to create a fee record
async function createFeeRecord(data: any, userId: string): Promise<IFeeRecord> {
  const { studentId, feeMonth, dueDate, status, feeAmount, paidAmount, paymentDate, paymentMethod, transactionId, remarks } = data;
  
  // Validation
  if (!studentId || !feeMonth || !dueDate || !feeAmount) {
    throw new Error('Student ID, fee month, due date, and fee amount are required');
  }
  
  // Get student details
  const student = await Student.findById(studentId);
  if (!student) {
    throw new Error('Student not found');
  }
  
  // Check if fee record already exists for this student and month
  const existingFee = await FeeRecord.findOne({ studentId, feeMonth });
  if (existingFee) {
    throw new Error(`Fee record already exists for ${feeMonth}`);
  }
  
  // Validate transaction ID if provided
  if (transactionId) {
    const duplicateTransaction = await FeeRecord.findOne({
      transactionId,
      studentId: { $ne: studentId }
    });
    
    if (duplicateTransaction) {
      throw new Error('Transaction ID is already used by another student');
    }
  }
  
  // Create fee record (status is computed dynamically)
  const fee = await FeeRecord.create({
    studentId,
    studentName: student.studentName,
    stage: student.stage || student.skillCategory,
    level: student.level || student.skillLevel,
    feeMonth,
    dueDate: new Date(dueDate),
    feeAmount,
    paidAmount: paidAmount || 0,
    paymentDate: paymentDate ? new Date(paymentDate) : undefined,
    paymentMethod,
    transactionId,
    remarks,
    updatedBy: userId
  });
  
  return fee;
}

// POST /api/fees/generate-pending/:studentId - Generate pending fees for a specific student
router.post('/generate-pending/:studentId', asyncHandler(async (req: Request, res: Response<ApiResponse<IFeeRecord[]>>) => {
  const { studentId } = req.params;
  const { startMonth, monthsToGenerate } = req.body;
  
  if (!studentId) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  // Validate student exists
  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({
      success: false,
      error: 'Student not found',
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    const fees = await FeeService.generateUpcomingFeesForStudent(
      studentId,
      startMonth ? new Date(startMonth) : undefined,
      monthsToGenerate || 3
    );
    
    return res.status(201).json({
      success: true,
      data: fees,
      message: `Generated ${fees.length} pending fee records for student`,
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

// POST /api/fees/generate-pending-all - Generate pending fees for all students without fee records
router.post('/generate-pending-all', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { monthsToGenerate } = req.body;
  
  try {
    const results = await FeeService.generateUpcomingFeesForAllStudents(
      monthsToGenerate || 3
    );
    
    return res.status(201).json({
      success: true,
      data: results,
      message: `Generated pending fees for ${results.successful} students${results.failed > 0 ? ` (${results.failed} failed)` : ''}`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

// GET /api/fees/students-overdue-status - Get overdue status for all students
router.get('/students-overdue-status', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    // Get all students with overdue fees
    const overdueRecords = await FeeRecord.find({ 
      paymentDate: null,
      dueDate: { $lt: now }
    }).distinct('studentId');
    
    // Create a map of student IDs with overdue fees
    const overdueMap: Record<string, boolean> = {};
    overdueRecords.forEach((studentId: any) => {
      overdueMap[studentId.toString()] = true;
    });
    
    return res.json({
      success: true,
      data: overdueMap,
      message: 'Retrieved overdue status for students',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

// GET /api/fees/payable/:studentId - Get payable fees for a student (overdue + one next pending)
router.get('/payable/:studentId', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { studentId } = req.params;
  
  if (!studentId) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    const payableFees = await FeeService.getPayableFees(studentId);
    
    return res.json({
      success: true,
      data: payableFees,
      message: 'Retrieved payable fees for student',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

// Helper function to normalize payment status
const normalizePaymentStatus = (status: any): 'upcoming' | 'paid' | 'overdue' | 'partially_paid' | 'discontinued' => {
  if (!status || status === 'nan' || String(status).toLowerCase() === 'nan' || String(status).trim() === '') {
    return 'upcoming';
  }
  
  const statusStr = String(status).toLowerCase().trim();
  
  if (statusStr === 'paid' || statusStr === 'Paid' || statusStr === 'PAID') {
    return 'paid';
  }
  
  if (statusStr === 'discontinued' || statusStr === 'DISCONTINUED') {
    return 'discontinued';
  }
  
  if (statusStr === 'ab' || statusStr === 'AB') {
    return 'upcoming'; // AB (absent) treated as upcoming
  }
  
  return 'upcoming';
};

// GET /api/fees/download-template - Download Excel template for bulk fee upload
router.get('/download-template', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Create template data matching the user's Excel format
    const templateData = [
      {
        'student_identifier': '9876543210',
        'Payment Due date': '2025-10-25',
        'Payment Status': 'PAID',
        'Payment date': '2025-10-25',
        'Payment Due date.1': '2025-11-25',
        'Payment Status.1': 'PAID',
        'Payment date.1': '2025-11-25',
        'Payment Due date.2': '2025-12-25',
        'Payment Status.2': 'PAID',
        'Payment date.2': '2025-12-25',
        'Payment Due date.3': '2026-01-25',
        'Payment Status.3': 'pending',
        'Payment date.3': ''
      },
      {
        'student_identifier': '9123456789',
        'Payment Due date': '2025-10-25',
        'Payment Status': 'PAID',
        'Payment date': '2025-10-20',
        'Payment Due date.1': '2025-11-25',
        'Payment Status.1': '',
        'Payment date.1': '',
        'Payment Due date.2': '2025-12-25',
        'Payment Status.2': '',
        'Payment date.2': '',
        'Payment Due date.3': '2026-01-25',
        'Payment Status.3': '',
        'Payment date.3': ''
      }
    ];

    // Create workbook and worksheet
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(templateData);

    // Set column widths
    const colWidths = [
      { wch: 20 }, // student_identifier
      { wch: 18 }, // Payment Due date
      { wch: 15 }, // Payment Status
      { wch: 18 }, // Payment date
      { wch: 18 }, // Payment Due date.1
      { wch: 15 }, // Payment Status.1
      { wch: 18 }, // Payment date.1
      { wch: 18 }, // Payment Due date.2
      { wch: 15 }, // Payment Status.2
      { wch: 18 }, // Payment date.2
      { wch: 18 }, // Payment Due date.3
      { wch: 15 }, // Payment Status.3
      { wch: 18 }  // Payment date.3
    ];
    ws['!cols'] = colWidths;

    xlsx.utils.book_append_sheet(wb, ws, 'Fees Template');

    // Generate buffer
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=fees-template.xlsx');

    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate template',
      timestamp: new Date().toISOString()
    });
  }
}));

// POST /api/fees/bulk-upload - Bulk upload fees from Excel
router.post('/bulk-upload', upload.single('file'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const userId = (req as any).user.id;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
      timestamp: new Date().toISOString()
    });
  }

  try {
    // Parse Excel file
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({
        success: false,
        error: 'No sheet found in the Excel file',
        timestamp: new Date().toISOString()
      });
    }
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return res.status(400).json({
        success: false,
        error: 'No worksheet found in the Excel file',
        timestamp: new Date().toISOString()
      });
    }
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No data found in the Excel file',
        timestamp: new Date().toISOString()
      });
    }

    const results = {
      total: data.length,
      successful: 0,
      updated: 0,
      studentsNotFound: 0,
      skipped: 0,
      errors: [] as Array<{ row: number; phone: string; error: string; data: any }>
    };

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any;
      const rowNum = i + 2; // Excel row numbers start from 1, plus header row

      try {
        // Get student identifier (phone number)
        const studentIdentifier = row['student_identifier'];
        
        // Clean and validate phone number
        const cleanedPhone = cleanPhoneNumber(studentIdentifier);
        if (!cleanedPhone) {
          results.skipped++;
          results.errors.push({
            row: rowNum,
            phone: String(studentIdentifier || 'N/A'),
            error: 'Invalid or missing phone number',
            data: { studentIdentifier }
          });
          continue;
        }

        // Find student by phone number
        const student = await Student.findOne({ phone: cleanedPhone });
        if (!student) {
          results.studentsNotFound++;
          results.errors.push({
            row: rowNum,
            phone: cleanedPhone,
            error: 'Student not found in database',
            data: { studentIdentifier }
          });
          continue;
        }

        // If student has no batch, create credits instead of fee records
        if (!student.batchId) {
          // Calculate total paid amount from all cycles
          const cycles = [
            { status: row['Payment Status'], paymentDate: row['Payment date'] },
            { status: row['Payment Status.1'], paymentDate: row['Payment date.1'] },
            { status: row['Payment Status.2'], paymentDate: row['Payment date.2'] },
            { status: row['Payment Status.3'], paymentDate: row['Payment date.3'] }
          ];
          
          let totalPaidAmount = 0;
          let latestPaymentDate: Date | null = null;
          
          // Get course configuration for fee amount
          const stageForCredit = student.stage || student.skillCategory;
          if (stageForCredit) {
            const courseForCredit = await Course.findOne({ courseName: stageForCredit, isActive: true });
            if (courseForCredit && courseForCredit.levels.length > 0) {
              const studentLevelForCredit = student.level || student.skillLevel || 1;
              const levelConfigForCredit = courseForCredit.levels.find((l: any) => l.levelNumber === studentLevelForCredit) || courseForCredit.levels[0];
              const feeAmountForCredit = levelConfigForCredit?.feeAmount || 0;
              
              for (const cycle of cycles) {
                const status = normalizePaymentStatus(cycle.status);
                if (status === 'paid') {
                  totalPaidAmount += feeAmountForCredit;
                  const paymentDate = parseExcelDate(cycle.paymentDate);
                  if (paymentDate && (!latestPaymentDate || paymentDate > latestPaymentDate)) {
                    latestPaymentDate = paymentDate;
                  }
                }
              }
              
              if (totalPaidAmount > 0) {
                // Create credit for the student
                await StudentCreditService.addCredit({
                  studentId: (student._id as any).toString(),
                  studentName: student.studentName,
                  amount: totalPaidAmount,
                  description: `Bulk upload credit - ${cycles.filter(c => normalizePaymentStatus(c.status) === 'paid').length} month(s) worth of fees`,
                  paymentMethod: 'cash',
                  processedBy: userId,
                  remarks: `Created via bulk fee upload. Student has no batch assigned, so payment stored as credit.`
                });
                results.successful++;
              } else {
                results.skipped++;
              }
            } else {
              results.skipped++;
              results.errors.push({
                row: rowNum,
                phone: cleanedPhone,
                error: 'No course configuration found for credit calculation',
                data: { studentName: student.studentName }
              });
            }
          } else {
            results.skipped++;
          }
          continue; // Skip fee record creation for students without batch
        }

        // Get course configuration for fee amount
        const stage = student.stage || student.skillCategory;
        if (!stage) {
          results.skipped++;
          results.errors.push({
            row: rowNum,
            phone: cleanedPhone,
            error: 'Student has no stage/skillCategory',
            data: { studentName: student.studentName }
          });
          continue;
        }

        const course = await Course.findOne({ 
          courseName: stage, 
          isActive: true 
        });

        if (!course || course.levels.length === 0) {
          results.skipped++;
          results.errors.push({
            row: rowNum,
            phone: cleanedPhone,
            error: `No active course configuration found for stage: ${stage}`,
            data: { studentName: student.studentName, stage }
          });
          continue;
        }

        const studentLevel = student.level || student.skillLevel || 1;
        const levelConfig = course.levels.find((l: any) => l.levelNumber === studentLevel) || course.levels[0];
        
        if (!levelConfig) {
          results.skipped++;
          results.errors.push({
            row: rowNum,
            phone: cleanedPhone,
            error: 'No level configuration found',
            data: { studentName: student.studentName }
          });
          continue;
        }

        const feeAmount = levelConfig.feeAmount;
        let discontinuedStudent = false;

        // Process up to 4 payment cycles
        const cycles = [
          { dueDate: row['Payment Due date'], status: row['Payment Status'], paymentDate: row['Payment date'] },
          { dueDate: row['Payment Due date.1'], status: row['Payment Status.1'], paymentDate: row['Payment date.1'] },
          { dueDate: row['Payment Due date.2'], status: row['Payment Status.2'], paymentDate: row['Payment date.2'] },
          { dueDate: row['Payment Due date.3'], status: row['Payment Status.3'], paymentDate: row['Payment date.3'] }
        ];

        for (const cycle of cycles) {
          // Skip if due date is empty
          const dueDate = parseExcelDate(cycle.dueDate);
          if (!dueDate) {
            continue;
          }

          // Generate fee month name
          const feeMonth = FeeService.generateFeeMonthName(dueDate);

          // Normalize status
          const status = normalizePaymentStatus(cycle.status);
          
          // Check for DISCONTINUED status
          if (status === 'discontinued') {
            discontinuedStudent = true;
            // Create this fee record as paid, but skip future pending records
            const parsedPaymentDate = parseExcelDate(cycle.paymentDate) || dueDate;

            // Check if fee record exists
            const existingFee = await FeeRecord.findOne({
              studentId: (student._id as any).toString(),
              feeMonth
            });

            if (existingFee) {
              // Update existing
              existingFee.paidAmount = feeAmount;
              existingFee.paymentDate = parsedPaymentDate;
              existingFee.paymentMethod = 'cash';
              existingFee.updatedBy = userId;
              await existingFee.save();
              results.updated++;
            } else {
              // Create new (status is computed dynamically)
              await FeeRecord.create({
                studentId: (student._id as any).toString(),
                studentName: student.studentName,
                stage,
                level: student.level || student.skillLevel,
                feeMonth,
                dueDate,
                feeAmount,
                paidAmount: feeAmount,
                paymentDate: parsedPaymentDate,
                paymentMethod: 'cash',
                updatedBy: userId
              });
              results.successful++;
            }
            break; // Don't process further cycles for discontinued students
          }

          // Parse payment date
          const parsedPaymentDate = parseExcelDate(cycle.paymentDate);

          // Determine paid amount
          let paidAmount = 0;
          
          if (status === 'paid') {
            paidAmount = feeAmount;
          }

          // Check if fee record already exists
          const existingFee = await FeeRecord.findOne({
            studentId: (student._id as any).toString(),
            feeMonth
          });

          if (existingFee) {
            // Update existing fee record
            existingFee.paidAmount = paidAmount;
            if (parsedPaymentDate) {
              existingFee.paymentDate = parsedPaymentDate;
            }
            if (status === 'paid') {
              existingFee.paymentMethod = existingFee.paymentMethod || 'cash';
            }
            existingFee.updatedBy = userId;
            await existingFee.save();
            results.updated++;
          } else {
            // Create new fee record (status is computed dynamically)
            const feeData: any = {
              studentId: (student._id as any).toString(),
              studentName: student.studentName,
              stage,
              level: student.level || student.skillLevel,
              feeMonth,
              dueDate,
              feeAmount,
              paidAmount,
              updatedBy: userId
            };

            if (parsedPaymentDate) {
              feeData.paymentDate = parsedPaymentDate;
            }

            if (status === 'paid') {
              feeData.paymentMethod = 'cash';
            }

            await FeeRecord.create(feeData);
            results.successful++;
          }
        }

      } catch (error: any) {
        results.errors.push({
          row: rowNum,
          phone: String(row['student_identifier'] || 'N/A'),
          error: error.message,
          data: row
        });
      }
    }

    return res.json({
      success: true,
      data: results,
      message: `Bulk upload completed: ${results.successful} fee records created, ${results.updated} updated, ${results.studentsNotFound} students not found, ${results.skipped} skipped`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: `Failed to process Excel file: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
}));

export default router;
