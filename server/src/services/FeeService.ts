import FeeRecord from '../models/FeeRecord';
import Course from '../models/Course';
import Student from '../models/Student';
import mongoose from 'mongoose';

export class FeeService {
  /**
   * Generate upcoming fee records for a student
   * @param studentId - The ID of the student
   * @param startMonth - The start month for fee generation (defaults to student's enrollment date)
   * @param monthsToGenerate - Number of months to generate (defaults to 3)
   * @param session - Mongoose session for transaction support
   * @returns Array of created fee records
   */
  static async generateUpcomingFeesForStudent(
    studentId: string,
    startMonth?: Date,
    monthsToGenerate: number = 3,
    session?: mongoose.ClientSession
  ): Promise<any[]> {
    try {
      // Get student details
      const student = await Student.findById(studentId).session(session || null);
      if (!student) {
        throw new Error('Student not found');
      }

      // Determine the stage (use stage if available, otherwise use skillCategory)
      const stage = student.stage || student.skillCategory;
      if (!stage) {
        throw new Error('Student does not have a stage or skillCategory');
      }

      // Get course configuration for the stage
      const course = await Course.findOne({ 
        courseName: stage, 
        isActive: true 
      }).session(session || null);

      if (!course || course.levels.length === 0) {
        throw new Error(`No active course configuration found for stage: ${stage}`);
      }
      
      // Get fee amount from the first level (or use student's level if available)
      const studentLevel = student.level || student.skillLevel || 1;
      const levelConfig = course.levels.find(l => l.levelNumber === studentLevel) || course.levels[0];
      
      if (!levelConfig) {
        throw new Error(`No level configuration found for course: ${stage}`);
      }
      
      const feeAmount = levelConfig.feeAmount;

      // Determine start month (use provided date or student's enrollment date)
      const startDate = startMonth || student.enrollmentDate;
      if (!startDate) {
        throw new Error('No start month provided and student has no enrollment date');
      }

      // Set start date to the 1st of the month
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      const createdFees: any[] = [];
      const errors: string[] = [];

      // Generate fee records for each month
      for (let i = 0; i < monthsToGenerate; i++) {
        try {
          const feeDate = new Date(startDate);
          feeDate.setMonth(feeDate.getMonth() + i);

          const feeMonth = this.generateFeeMonthName(feeDate);
          const dueDate = this.calculateDueDate(feeDate);

          // Check if fee record already exists for this month
          const existingFee = await FeeRecord.findOne({
            studentId,
            feeMonth
          }).session(session || null);

          if (existingFee) {
            errors.push(`Fee record already exists for ${feeMonth}`);
            continue;
          }

          // Create fee record
          const fee = new FeeRecord({
            studentId,
            studentName: student.studentName,
            stage,
            level: student.level || student.skillLevel,
            feeMonth,
            dueDate,
            status: 'upcoming',
            feeAmount: feeAmount,
            paidAmount: 0
          });

          await fee.save({ session: session || null });
          createdFees.push(fee);
        } catch (error: any) {
          errors.push(`Failed to create fee for month ${i + 1}: ${error.message}`);
        }
      }

      if (errors.length > 0) {
        console.warn(`Fee generation warnings for student ${studentId}:`, errors);
      }

      return createdFees;
    } catch (error: any) {
      throw new Error(`Failed to generate upcoming fees: ${error.message}`);
    }
  }

  /**
   * Get the active course configuration for a stage
   * @param stage - The stage (beginner, intermediate, advanced)
   * @returns Course configuration or null
   */
  static async getCourseConfigurationForStage(stage: string): Promise<any> {
    try {
      return await Course.findOne({ 
        courseName: stage.toLowerCase(), 
        isActive: true 
      });
    } catch (error: any) {
      throw new Error(`Failed to get course configuration: ${error.message}`);
    }
  }

  /**
   * Generate a month name from a date
   * @param date - The date
   * @returns Month name like "January 2024"
   */
  static generateFeeMonthName(date: Date): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  /**
   * Calculate the due date for a fee month
   * Due date is the 10th of the month by default
   * @param monthDate - The month date
   * @param dueDay - The day of month for due date (default: 10)
   * @returns Due date
   */
  static calculateDueDate(monthDate: Date, dueDay: number = 10): Date {
    const dueDate = new Date(monthDate);
    dueDate.setDate(dueDay);
    dueDate.setHours(23, 59, 59, 999);
    return dueDate;
  }

  /**
   * Generate upcoming fees for all students who don't have any fee records
   * @param monthsToGenerate - Number of months to generate per student
   * @returns Summary of generation results
   */
  static async generateUpcomingFeesForAllStudents(
    monthsToGenerate: number = 3
  ): Promise<{
    totalStudents: number;
    successful: number;
    failed: number;
    errors: Array<{ studentId: string; studentName: string; error: string }>;
  }> {
    const results = {
      totalStudents: 0,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ studentId: string; studentName: string; error: string }>
    };

    try {
      // Get all students
      const students = await Student.find({});
      results.totalStudents = students.length;

      for (const student of students) {
        try {
          // Check if student already has fee records
          const existingFees = await FeeRecord.find({ studentId: (student._id as any).toString() });
          
          if (existingFees.length > 0) {
            // Skip students who already have fee records
            continue;
          }

          // Generate upcoming fees for this student
          await this.generateUpcomingFeesForStudent(
            (student._id as any).toString(),
            student.enrollmentDate,
            monthsToGenerate
          );
          
          results.successful++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            studentId: (student._id as any).toString(),
            studentName: student.studentName,
            error: error.message
          });
        }
      }

      return results;
    } catch (error: any) {
      throw new Error(`Failed to generate upcoming fees for all students: ${error.message}`);
    }
  }

  /**
   * Get fee records for a specific student
   * @param studentId - The student ID
   * @returns Array of fee records
   */
  static async getStudentFees(studentId: string): Promise<any[]> {
    try {
      return await FeeRecord.find({ studentId }).sort({ dueDate: 1 });
    } catch (error: any) {
      throw new Error(`Failed to get student fees: ${error.message}`);
    }
  }

  /**
   * Check if a student has any upcoming fee records
   * @param studentId - The student ID
   * @returns True if student has upcoming fees
   */
  static async hasUpcomingFees(studentId: string): Promise<boolean> {
    try {
      const count = await FeeRecord.countDocuments({ 
        studentId, 
        status: 'upcoming' 
      });
      return count > 0;
    } catch (error: any) {
      throw new Error(`Failed to check upcoming fees: ${error.message}`);
    }
  }

  /**
   * Get the next upcoming fee for a student
   * @param studentId - The student ID
   * @returns The next upcoming fee record or null
   */
  static async getNextUpcomingFee(studentId: string): Promise<any | null> {
    try {
      return await FeeRecord.findOne({ 
        studentId, 
        status: 'upcoming' 
      }).sort({ dueDate: 1 });
    } catch (error: any) {
      throw new Error(`Failed to get next upcoming fee: ${error.message}`);
    }
  }

  /**
   * Check if a student has any overdue fees
   * @param studentId - The student ID
   * @returns True if student has overdue fees (status is 'overdue' OR upcoming fees past due date)
   */
  static async hasOverdueFees(studentId: string): Promise<boolean> {
    try {
      const now = new Date();
      const count = await FeeRecord.countDocuments({ 
        studentId,
        $or: [
          { status: 'overdue' },
          { status: 'partially_paid' },
          { 
            status: 'upcoming',
            dueDate: { $lt: now }
          }
        ]
      });
      return count > 0;
    } catch (error: any) {
      throw new Error(`Failed to check overdue fees: ${error.message}`);
    }
  }

  /**
   * Generate the next month's fee record for a student (incremental approach)
   * Creates only ONE fee record - either the first month or the next upcoming month
   * @param studentId - The student ID
   * @param baseDate - Optional base date (used for first fee generation)
   * @param session - Mongoose session for transaction support
   * @returns The created fee record or null if unable to create
   */
  static async generateNextMonthFee(
    studentId: string,
    baseDate?: Date,
    session?: mongoose.ClientSession
  ): Promise<any | null> {
    try {
      // Get student details
      const student = await Student.findById(studentId).session(session || null);
      if (!student) {
        throw new Error('Student not found');
      }

      // Determine the stage
      const stage = student.stage || student.skillCategory;
      if (!stage) {
        console.warn(`Student ${studentId} does not have a stage or skillCategory`);
        return null;
      }

      // Get course configuration for the stage
      const course = await Course.findOne({ 
        courseName: stage, 
        isActive: true 
      }).session(session || null);

      if (!course || course.levels.length === 0) {
        console.warn(`No active course configuration found for stage: ${stage}`);
        return null;
      }
      
      // Get fee amount from the first level (or use student's level if available)
      const studentLevel = student.level || student.skillLevel || 1;
      const levelConfig = course.levels.find(l => l.levelNumber === studentLevel) || course.levels[0];
      
      if (!levelConfig) {
        console.warn(`No level configuration found for course: ${stage}`);
        return null;
      }
      
      const feeAmount = levelConfig.feeAmount;

      // Find the latest fee record for this student
      const latestFee = await FeeRecord.findOne({ studentId })
        .sort({ dueDate: -1 })
        .limit(1)
        .session(session || null);

      let nextMonthDate: Date;

      if (!latestFee) {
        // No fees exist - create first month from enrollment or provided base date
        const startDate = baseDate || student.enrollmentDate;
        if (!startDate) {
          throw new Error('No base date provided and student has no enrollment date');
        }
        nextMonthDate = new Date(startDate);
      } else {
        // Create next month after latest fee
        nextMonthDate = new Date(latestFee.dueDate);
        nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
      }

      // Set to the 1st of the month
      nextMonthDate.setDate(1);
      nextMonthDate.setHours(0, 0, 0, 0);

      const feeMonth = this.generateFeeMonthName(nextMonthDate);
      const dueDate = this.calculateDueDate(nextMonthDate);

      // Check if fee record already exists for this month
      const existingFee = await FeeRecord.findOne({
        studentId,
        feeMonth
      }).session(session || null);

      if (existingFee) {
        console.log(`Fee record already exists for student ${studentId}, month ${feeMonth}`);
        return existingFee;
      }

      // Create fee record
      const fee = new FeeRecord({
        studentId,
        studentName: student.studentName,
        stage,
        level: student.level || student.skillLevel,
            feeMonth,
            dueDate,
            status: 'upcoming',
            feeAmount: feeAmount,
        paidAmount: 0
      });

      await fee.save({ session: session || null });
      console.log(`Created fee record for student ${studentId}, month ${feeMonth}`);
      
      return fee;
    } catch (error: any) {
      console.error(`Failed to generate next month fee: ${error.message}`);
      throw new Error(`Failed to generate next month fee: ${error.message}`);
    }
  }

  /**
   * Update overdue status for all upcoming fees past their due date
   * Should be called by a scheduled job
   * @returns Number of fees updated
   */
  static async updateOverdueFees(): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await FeeRecord.updateMany(
        {
          status: 'upcoming',
          dueDate: { $lt: today }
        },
        {
          status: 'overdue'
        }
      );

      console.log(`Updated ${result.modifiedCount} fees to overdue status`);
      return result.modifiedCount;
    } catch (error: any) {
      console.error(`Failed to update overdue fees: ${error.message}`);
      throw new Error(`Failed to update overdue fees: ${error.message}`);
    }
  }

  /**
   * Create initial fee records for a newly created student
   * - For past months: Creates overdue fees
   * - For current month: Creates upcoming fee
   * - Also creates one next month's upcoming fee
   * @param studentId - The student ID
   * @param enrollmentDate - The student's enrollment date
   * @param stage - The student's stage (beginner, intermediate, advanced)
   * @param session - Mongoose session for transaction support
   * @returns Array of created fee records
   */
  static async createInitialOverdueFeesForStudent(
    studentId: string,
    enrollmentDate: Date,
    stage: string,
    session?: mongoose.ClientSession
  ): Promise<any[]> {
    try {
      // Get student details for additional info
      const student = await Student.findById(studentId).session(session || null);
      if (!student) {
        throw new Error('Student not found');
      }

      // Get course configuration for the stage
      const course = await Course.findOne({ 
        courseName: stage.toLowerCase(), 
        isActive: true 
      }).session(session || null);

      if (!course || course.levels.length === 0) {
        throw new Error(`No active course configuration found for stage: ${stage}`);
      }
      
      // Get fee amount from the first level (or use student's level if available)
      const studentLevel = student.level || student.skillLevel || 1;
      const levelConfig = course.levels.find(l => l.levelNumber === studentLevel) || course.levels[0];
      
      if (!levelConfig) {
        throw new Error(`No level configuration found for course: ${stage}`);
      }
      
      const feeAmount = levelConfig.feeAmount;

      const createdFees: any[] = [];
      const currentDate = new Date();
      currentDate.setDate(1);
      currentDate.setHours(0, 0, 0, 0);

      // Start from enrollment month
      const monthDate = new Date(enrollmentDate);
      monthDate.setDate(1);
      monthDate.setHours(0, 0, 0, 0);

      // Generate fee records from enrollment month onwards
      // Create past months and current month as overdue, and one next month as upcoming
      let monthsProcessed = 0;
      const maxMonths = 100; // Safety limit

      while (monthsProcessed < maxMonths) {
        const feeMonth = this.generateFeeMonthName(monthDate);
        const dueDate = this.calculateDueDate(monthDate);

        // Check if fee record already exists for this month
        const existingFee = await FeeRecord.findOne({
          studentId,
          feeMonth
        }).session(session || null);

        if (!existingFee) {
          // Determine status based on month
          let status: 'overdue' | 'upcoming';
          
          if (monthDate <= currentDate) {
            // Past months and current month are overdue
            status = 'overdue';
          } else {
            // Future months are upcoming
            status = 'upcoming';
          }

          // Create fee record
          const fee = new FeeRecord({
            studentId,
            studentName: student.studentName,
            stage,
            level: student.level || student.skillLevel,
            feeMonth,
            dueDate,
            status,
            feeAmount: feeAmount,
            paidAmount: 0
          });

          await fee.save({ session: session || null });
          createdFees.push(fee);
        }

        // Stop after creating one upcoming month (next month after current)
        if (monthDate > currentDate) {
          break;
        }

        // Move to next month
        monthDate.setMonth(monthDate.getMonth() + 1);
        monthsProcessed++;
      }

      console.log(`Created ${createdFees.length} initial fees for student ${studentId}`);
      return createdFees;
    } catch (error: any) {
      console.error(`Failed to create initial fees: ${error.message}`);
      throw new Error(`Failed to create initial fees: ${error.message}`);
    }
  }

  /**
   * Get payable fees for a student (overdue + one next upcoming)
   * This filters fees to show only what's relevant for payment
   * @param studentId - The student ID
   * @returns Object with overdue and nextUpcoming fee arrays
   */
  static async getPayableFees(studentId: string): Promise<{
    overdue: any[];
    nextUpcoming: any | null;
  }> {
    try {
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);

      // Get all overdue and partially paid fees
      const overdueFees = await FeeRecord.find({
        studentId,
        $or: [
          { status: 'overdue' },
          { status: 'partially_paid' }
        ]
      }).sort({ dueDate: 1 });

      // Get the earliest upcoming fee only
      const nextUpcomingFee = await FeeRecord.findOne({
        studentId,
        status: 'upcoming'
      }).sort({ dueDate: 1 });

      return {
        overdue: overdueFees,
        nextUpcoming: nextUpcomingFee
      };
    } catch (error: any) {
      throw new Error(`Failed to get payable fees: ${error.message}`);
    }
  }
}
