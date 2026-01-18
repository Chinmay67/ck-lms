import StudentCredit from '../models/StudentCredit.js';
import Student from '../models/Student.js';
import { IStudentCredit } from '../types/index.js';
import mongoose from 'mongoose';

export class StudentCreditService {
  /**
   * Get the current credit balance for a student
   */
  static async getCreditBalance(studentId: string | mongoose.Types.ObjectId): Promise<number> {
    const lastTransaction = await StudentCredit.findOne({ studentId })
      .sort({ createdAt: -1 })
      .select('balanceAfter');
    
    return lastTransaction?.balanceAfter || 0;
  }

  /**
   * Add credit to a student's account
   */
  static async addCredit(params: {
    studentId: string | mongoose.Types.ObjectId;
    studentName: string;
    amount: number;
    description: string;
    paymentMethod?: 'cash' | 'online' | 'card' | 'upi' | 'other';
    transactionId?: string;
    processedBy: string | mongoose.Types.ObjectId;
    remarks?: string;
    dueDate?: Date;
    paidDate?: Date;
  }): Promise<IStudentCredit> {
    const { studentId, studentName, amount, description, paymentMethod, transactionId, processedBy, remarks, dueDate, paidDate } = params;

    if (amount <= 0) {
      throw new Error('Credit amount must be positive');
    }

    const balanceBefore = await this.getCreditBalance(studentId);
    const balanceAfter = balanceBefore + amount;

    const creditTransaction = new StudentCredit({
      studentId,
      studentName,
      transactionType: 'credit_added',
      amount,
      balanceBefore,
      balanceAfter,
      description,
      paymentMethod,
      transactionId,
      processedBy,
      processedAt: paidDate || new Date(),
      remarks,
      dueDate,
      paidDate
    });

    await creditTransaction.save();
    return creditTransaction;
  }

  /**
   * Use credit from a student's account
   */
  static async useCredit(params: {
    studentId: string | mongoose.Types.ObjectId;
    studentName: string;
    amount: number;
    description: string;
    feeRecordId?: string | mongoose.Types.ObjectId;
    feeMonth?: string;
    processedBy: string | mongoose.Types.ObjectId;
    remarks?: string;
  }): Promise<IStudentCredit> {
    const { studentId, studentName, amount, description, feeRecordId, feeMonth, processedBy, remarks } = params;

    if (amount <= 0) {
      throw new Error('Credit usage amount must be positive');
    }

    const balanceBefore = await this.getCreditBalance(studentId);
    
    if (balanceBefore < amount) {
      throw new Error(`Insufficient credit balance. Available: ${balanceBefore}, Required: ${amount}`);
    }

    const balanceAfter = balanceBefore - amount;

    const creditTransaction = new StudentCredit({
      studentId,
      studentName,
      transactionType: 'credit_used',
      amount,
      balanceBefore,
      balanceAfter,
      description,
      feeRecordId,
      feeMonth,
      processedBy,
      processedAt: new Date(),
      remarks
    });

    await creditTransaction.save();
    return creditTransaction;
  }

  /**
   * Add a refund to student's credit
   */
  static async addRefund(params: {
    studentId: string | mongoose.Types.ObjectId;
    studentName: string;
    amount: number;
    description: string;
    feeRecordId?: string | mongoose.Types.ObjectId;
    processedBy: string | mongoose.Types.ObjectId;
    remarks?: string;
  }): Promise<IStudentCredit> {
    const { studentId, studentName, amount, description, feeRecordId, processedBy, remarks } = params;

    if (amount <= 0) {
      throw new Error('Refund amount must be positive');
    }

    const balanceBefore = await this.getCreditBalance(studentId);
    const balanceAfter = balanceBefore + amount;

    const creditTransaction = new StudentCredit({
      studentId,
      studentName,
      transactionType: 'credit_refund',
      amount,
      balanceBefore,
      balanceAfter,
      description,
      feeRecordId,
      processedBy,
      processedAt: new Date(),
      remarks
    });

    await creditTransaction.save();
    return creditTransaction;
  }

  /**
   * Make an adjustment to student's credit (can be positive or negative)
   */
  static async makeAdjustment(params: {
    studentId: string | mongoose.Types.ObjectId;
    studentName: string;
    amount: number;
    description: string;
    processedBy: string | mongoose.Types.ObjectId;
    remarks?: string;
  }): Promise<IStudentCredit> {
    const { studentId, studentName, amount, description, processedBy, remarks } = params;

    const balanceBefore = await this.getCreditBalance(studentId);
    const balanceAfter = balanceBefore + amount;

    if (balanceAfter < 0) {
      throw new Error(`Adjustment would result in negative balance. Current: ${balanceBefore}, Adjustment: ${amount}`);
    }

    const creditTransaction = new StudentCredit({
      studentId,
      studentName,
      transactionType: 'credit_adjustment',
      amount,
      balanceBefore,
      balanceAfter,
      description,
      processedBy,
      processedAt: new Date(),
      remarks
    });

    await creditTransaction.save();
    return creditTransaction;
  }

  /**
   * Get credit transaction history for a student
   */
  static async getCreditHistory(
    studentId: string | mongoose.Types.ObjectId,
    options?: { limit?: number; skip?: number }
  ): Promise<IStudentCredit[]> {
    const query = StudentCredit.find({ studentId })
      .sort({ createdAt: -1 })
      .populate('processedBy', 'name email');

    if (options?.limit) {
      query.limit(options.limit);
    }

    if (options?.skip) {
      query.skip(options.skip);
    }

    return await query.exec();
  }

  /**
   * Apply available credit to fee payments when student joins a batch
   * Returns the number of months of fees paid using credit
   */
  static async applyCreditToFees(params: {
    studentId: string | mongoose.Types.ObjectId;
    studentName: string;
    monthlyFeeAmount: number;
    processedBy: string | mongoose.Types.ObjectId;
  }): Promise<{ monthsPaid: number; amountUsed: number; remainingCredit: number }> {
    const { studentId, studentName, monthlyFeeAmount, processedBy } = params;

    const availableCredit = await this.getCreditBalance(studentId);
    
    if (availableCredit <= 0) {
      return { monthsPaid: 0, amountUsed: 0, remainingCredit: 0 };
    }

    // Calculate how many months can be paid with available credit
    const monthsPaid = Math.floor(availableCredit / monthlyFeeAmount);
    const amountUsed = monthsPaid * monthlyFeeAmount;
    const remainingCredit = availableCredit - amountUsed;

    if (monthsPaid > 0) {
      await this.useCredit({
        studentId,
        studentName,
        amount: amountUsed,
        description: `Applied credit to pay ${monthsPaid} month(s) of fees on batch assignment`,
        processedBy,
        remarks: `Auto-applied on batch assignment. Monthly fee: ${monthlyFeeAmount}`
      });
    }

    return { monthsPaid, amountUsed, remainingCredit };
  }

  /**
   * Get credit summary for multiple students
   */
  static async getCreditSummaryForStudents(studentIds: (string | mongoose.Types.ObjectId)[]): Promise<Map<string, number>> {
    const summaryMap = new Map<string, number>();

    // Get the latest transaction for each student to get their current balance
    const latestTransactions = await StudentCredit.aggregate([
      { $match: { studentId: { $in: studentIds.map(id => new mongoose.Types.ObjectId(id.toString())) } } },
      { $sort: { studentId: 1, createdAt: -1 } },
      {
        $group: {
          _id: '$studentId',
          latestBalance: { $first: '$balanceAfter' }
        }
      }
    ]);

    latestTransactions.forEach(item => {
      summaryMap.set(item._id.toString(), item.latestBalance);
    });

    // For students with no transactions, set balance to 0
    studentIds.forEach(id => {
      const idString = id.toString();
      if (!summaryMap.has(idString)) {
        summaryMap.set(idString, 0);
      }
    });

    return summaryMap;
  }
}

export default StudentCreditService;
