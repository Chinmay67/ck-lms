import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import Invoice from '../../models/v2/Invoice.js';
import PaymentTransaction from '../../models/v2/PaymentTransaction.js';
import StudentV2 from '../../models/v2/Student.js';
import Enrollment from '../../models/v2/Enrollment.js';
import Batch from '../../models/v2/Batch.js';

const router = Router();

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  const balanceExpr = {
    $max: [0, { $subtract: ['$amount', { $add: ['$allocatedAmount', { $ifNull: ['$waivedAmount', 0] }] }] }],
  };

  const [
    totalActive, totalInactive, paused,
    feeStats, recentPayments, overdueRecords,
    batchStats, creditTotal,
    studentStatusCounts, stageBreakdownAgg,
  ] = await Promise.all([
    StudentV2.countDocuments({ isActive: true }),
    StudentV2.countDocuments({ isActive: false }),
    Enrollment.aggregate([
      { $sort: { startDate: -1, createdAt: -1 } },
      {
        $group: {
          _id: '$studentId',
          latestEndReason: { $first: '$endReason' },
          latestEndDate: { $first: '$endDate' },
        },
      },
      { $match: { latestEndReason: 'paused', latestEndDate: { $ne: null } } },
      { $count: 'count' },
    ]),

    Invoice.aggregate([
      { $match: { isVoid: false } },
      {
        $addFields: { balance: balanceExpr },
      },
      {
        $group: {
          _id: null,
          totalFees: { $sum: '$amount' },
          totalPaid: { $sum: '$allocatedAmount' },
          totalWaived: { $sum: { $ifNull: ['$waivedAmount', 0] } },
          totalPartiallyPaid: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: [{ $add: ['$allocatedAmount', { $ifNull: ['$waivedAmount', 0] }] }, 0] },
                    { $gt: ['$balance', 0] },
                  ],
                },
                '$balance',
                0,
              ],
            },
          },
        },
      },
    ]),

    PaymentTransaction.find({ paymentDate: { $gte: monthStart, $lte: monthEnd } })
      .sort({ paymentDate: -1 })
      .limit(10)
      .select('studentId studentName amount paymentMethod paymentDate transactionId')
      .lean(),

    Invoice.find({
      dueDate: { $lt: now },
      isVoid: false,
      $expr: {
        $gt: [{ $subtract: ['$amount', { $add: ['$allocatedAmount', '$waivedAmount'] }] }, 0],
      },
    })
      .select('studentId studentName invoiceMonth amount allocatedAmount waivedAmount dueDate stageNumber levelNumber')
      .lean({ virtuals: true }),

    Batch.aggregate([
      {
        $lookup: {
          from: 'enrollments',
          let: { batchId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$batchId', '$$batchId'] }, { $eq: ['$endDate', null] }],
                },
              },
            },
            { $count: 'count' },
          ],
          as: 'activeEnrollments',
        },
      },
      {
        $project: {
          batchName: 1, batchCode: 1, status: 1, maxStudents: 1,
          activeCount: { $ifNull: [{ $arrayElemAt: ['$activeEnrollments.count', 0] }, 0] },
        },
      },
    ]),

    StudentV2.aggregate([{ $group: { _id: null, total: { $sum: '$creditBalance' } } }]),

    // Per-student status flags → roll up to counts
    Invoice.aggregate([
      { $match: { isVoid: false } },
      { $addFields: { balance: balanceExpr } },
      {
        $group: {
          _id: '$studentId',
          hasUpcoming: {
            $max: { $cond: [{ $and: [{ $gte: ['$dueDate', now] }, { $gt: ['$balance', 0] }] }, 1, 0] },
          },
          hasPartial: {
            $max: {
              $cond: [
                {
                  $and: [
                    { $gt: [{ $add: ['$allocatedAmount', { $ifNull: ['$waivedAmount', 0] }] }, 0] },
                    { $gt: ['$balance', 0] },
                  ],
                },
                1, 0,
              ],
            },
          },
          hasPaid: { $max: { $cond: [{ $eq: ['$balance', 0] }, 1, 0] } },
        },
      },
      {
        $group: {
          _id: null,
          paidStudents: { $sum: '$hasPaid' },
          upcomingStudents: { $sum: '$hasUpcoming' },
          partialStudents: { $sum: '$hasPartial' },
        },
      },
    ]),

    // Per-stage fee breakdown
    Invoice.aggregate([
      { $match: { isVoid: false } },
      { $addFields: { balance: balanceExpr } },
      {
        $group: {
          _id: '$stageNumber',
          collected: { $sum: '$allocatedAmount' },
          overdue: {
            $sum: {
              $cond: [{ $and: [{ $lt: ['$dueDate', now] }, { $gt: ['$balance', 0] }] }, '$balance', 0],
            },
          },
          upcoming: {
            $sum: {
              $cond: [{ $and: [{ $gte: ['$dueDate', now] }, { $gt: ['$balance', 0] }] }, '$balance', 0],
            },
          },
          studentIds: { $addToSet: '$studentId' },
          paidStudentIds: {
            $addToSet: { $cond: [{ $eq: ['$balance', 0] }, '$studentId', null] },
          },
        },
      },
    ]),
  ]);

  const stats = feeStats[0] ?? { totalFees: 0, totalPaid: 0, totalWaived: 0, totalPartiallyPaid: 0 };
  const totalOverdue = (overdueRecords as any[]).reduce((sum, r) => {
    return sum + Math.max(0, r.amount - r.allocatedAmount - (r.waivedAmount ?? 0));
  }, 0);

  const statusCounts = (studentStatusCounts as any[])[0] ?? { paidStudents: 0, upcomingStudents: 0, partialStudents: 0 };
  const pausedCount = (paused as any[])[0]?.count ?? 0;

  // Map stageNumber → stage name for frontend compatibility
  const STAGE_NAMES: Record<number, string> = { 1: 'beginner', 2: 'intermediate', 3: 'advanced' };
  const stageBreakdown: Record<string, any> = {
    beginner: { collected: 0, upcoming: 0, overdue: 0, students: 0, paidStudents: 0 },
    intermediate: { collected: 0, upcoming: 0, overdue: 0, students: 0, paidStudents: 0 },
    advanced: { collected: 0, upcoming: 0, overdue: 0, students: 0, paidStudents: 0 },
  };
  (stageBreakdownAgg as any[]).forEach((s) => {
    const stageName = STAGE_NAMES[s._id] ?? `stage_${s._id}`;
    const studentCount = (s.studentIds ?? []).length;
    const paidStudentCount = (s.paidStudentIds ?? []).filter((id: any) => id !== null).length;
    stageBreakdown[stageName] = {
      collected: s.collected ?? 0,
      upcoming: s.upcoming ?? 0,
      overdue: s.overdue ?? 0,
      students: studentCount,
      paidStudents: paidStudentCount,
    };
  });

  res.json({
    success: true,
    data: {
      students: { active: totalActive, inactive: totalInactive, paused: pausedCount },
      fees: {
        totalCollected: stats.totalPaid,
        totalWaived: stats.totalWaived,
        totalOutstanding: stats.totalFees - stats.totalPaid - stats.totalWaived,
        totalOverdue,
        totalPartiallyPaid: stats.totalPartiallyPaid ?? 0,
        paidStudents: statusCounts.paidStudents,
        upcomingStudents: statusCounts.upcomingStudents,
        partialStudents: statusCounts.partialStudents,
      },
      stageBreakdown,
      totalCreditsOnAccount: (creditTotal as any[])[0]?.total ?? 0,
      recentPayments,
      overdueStudents: (overdueRecords as any[]).map((r) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        invoiceMonth: r.invoiceMonth,
        feeMonth: r.invoiceMonth,
        overdueAmount: Math.max(0, r.amount - r.allocatedAmount - (r.waivedAmount ?? 0)),
        stageNumber: r.stageNumber,
        levelNumber: r.levelNumber,
      })),
      batches: batchStats,
    },
    timestamp: new Date().toISOString(),
  });
}));

export default router;
