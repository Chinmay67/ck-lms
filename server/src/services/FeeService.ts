import FeeRecord from '../models/FeeRecord.js';
import Course from '../models/Course.js';
import Student from '../models/Student.js';
import Batch from '../models/Batch.js';
import mongoose from 'mongoose';

export class FeeService {
  /**
   * Get the effective fee cycle start date for a student
   * @param student - The student document
   * @returns The fee cycle start date (feeCycleStartDate if available, otherwise enrollmentDate)
   */
  static getFeeCycleStartDate(student: any): Date {
    return student.feeCycleStartDate || student.enrollmentDate;
  }

  /**
   * Generate upcoming fee records for a student
   * @param studentId - The ID of the student
   * @param startMonth - The start month for fee generation (defaults to student's fee cycle start date)
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
      const levelConfig = course.levels.find((l: any) => l.levelNumber === studentLevel) || course.levels[0];
      
      if (!levelConfig) {
        throw new Error(`No level configuration found for course: ${stage}`);
      }
      
      const feeAmount = levelConfig.feeAmount;

      // Determine start month (use provided date or student's fee cycle start date)
      const feeCycleStartDate = this.getFeeCycleStartDate(student);
      const startDate = startMonth || feeCycleStartDate;
      if (!startDate) {
        throw new Error('No start month provided and student has no fee cycle start date');
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
          const dueDate = this.calculateDueDate(feeDate, feeCycleStartDate);

          // Check if fee record already exists for this month
          const existingFee = await FeeRecord.findOne({
            studentId,
            feeMonth
          }).session(session || null);

          if (existingFee) {
            errors.push(`Fee record already exists for ${feeMonth}`);
            continue;
          }

          // Create fee record (status is computed dynamically)
          const fee = new FeeRecord({
            studentId,
            studentName: student.studentName,
            stage,
            level: student.level || student.skillLevel,
            feeMonth,
            dueDate,
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
   * Always uses the enrollment date day for consistency
   * @param monthDate - The month date
   * @param enrollmentDate - The student's enrollment date
   * @returns Due date
   */
  static calculateDueDate(
    monthDate: Date,
    enrollmentDate: Date
  ): Date {
    const dueDate = new Date(monthDate);
    
    // Always use enrollment day for all fees
    const enrollDay = enrollmentDate.getDate();
    const lastDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    dueDate.setDate(Math.min(enrollDay, lastDayOfMonth));
    
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
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      const count = await FeeRecord.countDocuments({ 
        studentId, 
        paymentDate: null,
        dueDate: { $gte: now }
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
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      return await FeeRecord.findOne({ 
        studentId, 
        paymentDate: null,
        dueDate: { $gte: now }
      }).sort({ dueDate: 1 });
    } catch (error: any) {
      throw new Error(`Failed to get next upcoming fee: ${error.message}`);
    }
  }

  /**
   * Check if a student has any overdue fees
   * @param studentId - The student ID
   * @returns True if student has overdue fees
   */
  static async hasOverdueFees(studentId: string): Promise<boolean> {
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      const count = await FeeRecord.countDocuments({ 
        studentId,
        paymentDate: null,
        dueDate: { $lt: now }
      });
      return count > 0;
    } catch (error: any) {
      throw new Error(`Failed to check overdue fees: ${error.message}`);
    }
  }

  /**
   * Generate the next month's fee record for a student (incremental approach)
   * Creates only ONE fee record - either the first month or the next upcoming month
   * Only creates if student has no overdue fees and no existing upcoming fees
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
      const levelConfig = course.levels.find((l: any) => l.levelNumber === studentLevel) || course.levels[0];
      
      if (!levelConfig) {
        console.warn(`No level configuration found for course: ${stage}`);
        return null;
      }
      
      const feeAmount = levelConfig.feeAmount;

      // Check if student has any overdue fees
      const hasOverdue = await this.hasOverdueFees(studentId);
      if (hasOverdue) {
        console.log(`Student ${studentId} has overdue fees, skipping upcoming fee generation`);
        return null;
      }

      // Check if student already has upcoming fees
      const hasUpcoming = await this.hasUpcomingFees(studentId);
      if (hasUpcoming) {
        console.log(`Student ${studentId} already has upcoming fees, skipping generation`);
        return null;
      }

      // Find the latest fee record for this student
      const latestFee = await FeeRecord.findOne({ studentId })
        .sort({ dueDate: -1 })
        .limit(1)
        .session(session || null);

      let nextMonthDate: Date;
      const feeCycleStartDate = this.getFeeCycleStartDate(student);

      if (!latestFee) {
        // No fees exist - create first month from fee cycle start date or provided base date
        const startDate = baseDate || feeCycleStartDate;
        if (!startDate) {
          throw new Error('No base date provided and student has no fee cycle start date');
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
      const dueDate = this.calculateDueDate(
        nextMonthDate,
        feeCycleStartDate
      );

      // Check if fee record already exists for this month
      const existingFee = await FeeRecord.findOne({
        studentId,
        feeMonth
      }).session(session || null);

      if (existingFee) {
        console.log(`Fee record already exists for student ${studentId}, month ${feeMonth}`);
        return existingFee;
      }

      // Create fee record (status is computed dynamically)
      const fee = new FeeRecord({
        studentId,
        studentName: student.studentName,
        stage,
        level: student.level || student.skillLevel,
        feeMonth,
        dueDate,
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
   * Create initial fee records for a newly created student
   * - For past months: Creates overdue fees
   * - For current month: Creates upcoming fee
   * - Also creates one next month's upcoming fee
   * @param studentId - The student ID
   * @param enrollmentDate - The student's enrollment date (or fee cycle start date)
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

      // Use fee cycle start date if available, otherwise use enrollmentDate parameter
      const feeCycleStartDate = this.getFeeCycleStartDate(student);
      const startDate = feeCycleStartDate || enrollmentDate;

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
      const levelConfig = course.levels.find((l: any) => l.levelNumber === studentLevel) || course.levels[0];
      
      if (!levelConfig) {
        throw new Error(`No level configuration found for course: ${stage}`);
      }
      
      const feeAmount = levelConfig.feeAmount;

      const createdFees: any[] = [];
      const currentDate = new Date();
      currentDate.setDate(1);
      currentDate.setHours(0, 0, 0, 0);

      // Start from fee cycle start date
      const monthDate = new Date(startDate);
      monthDate.setDate(1);
      monthDate.setHours(0, 0, 0, 0);

      // Generate fee records from enrollment month onwards
      // Create past months and current month only (do not create future months)
      let monthsProcessed = 0;
      const maxMonths = 100; // Safety limit

      while (monthsProcessed < maxMonths) {
        // Check if we've gone past current month BEFORE creating fee
        if (monthDate.getFullYear() > currentDate.getFullYear() ||
            (monthDate.getFullYear() === currentDate.getFullYear() && 
             monthDate.getMonth() > currentDate.getMonth())) {
          break;  // Stop before creating next month
        }

        const feeMonth = this.generateFeeMonthName(monthDate);
        const dueDate = this.calculateDueDate(monthDate, startDate);

        // Check if fee record already exists for this month
        const existingFee = await FeeRecord.findOne({
          studentId,
          feeMonth
        }).session(session || null);

        if (!existingFee) {
          // Create fee record (status is computed dynamically based on dueDate and paymentDate)
          const fee = new FeeRecord({
            studentId,
            studentName: student.studentName,
            stage,
            level: student.level || student.skillLevel,
            feeMonth,
            dueDate,
            feeAmount: feeAmount,
            paidAmount: 0
          });

          await fee.save({ session: session || null });
          createdFees.push(fee);
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
   * Handle stage/level transition for a student
   * - Deletes all unpaid upcoming fees (status: upcoming, amountPaid: 0)
   * - Determines effective date based on batch start date vs current date
   * - Generates new fees from effective date with new stage/level fee amount
   * - Updates student's feeCycleStartDate
   * @param studentId - The student ID
   * @param newBatchId - The new batch ID
   * @param newStage - The new stage
   * @param newLevel - The new level
   * @param session - Mongoose session for transaction support
   * @returns Object with deleted and created fee counts
   */
  static async handleStageLevelTransition(
    studentId: string,
    newBatchId: string,
    newStage: string,
    newLevel: number,
    session?: mongoose.ClientSession
  ): Promise<{
    deletedFeesCount: number;
    createdFeesCount: number;
    effectiveDate: Date;
  }> {
    try {
      // Get the student
      const student = await Student.findById(studentId).session(session || null);
      if (!student) {
        throw new Error('Student not found');
      }

      // Get the new batch
      const batch = await Batch.findById(newBatchId).session(session || null);
      if (!batch) {
        throw new Error('Batch not found');
      }

      // Validate batch matches new stage/level
      if (batch.stage !== newStage || batch.level !== newLevel) {
        throw new Error(`Batch does not match the new stage (${newStage}) and level (${newLevel})`);
      }

      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);

      // Delete all unpaid upcoming fees
      // Upcoming fees have dueDate >= today and paidAmount = 0
      const deleteResult = await FeeRecord.deleteMany({
        studentId,
        paidAmount: 0,
        dueDate: { $gte: currentDate }
      }).session(session || null);

      const deletedFeesCount = deleteResult.deletedCount || 0;
      console.log(`Deleted ${deletedFeesCount} unpaid upcoming fees for student ${studentId}`);

      // Determine effective date: max(batch start date, current date)
      const batchStartDate = new Date(batch.startDate);
      batchStartDate.setHours(0, 0, 0, 0);
      
      const effectiveDate = batchStartDate > currentDate ? batchStartDate : currentDate;
      
      // Set to first of the month for fee generation
      const feeStartDate = new Date(effectiveDate);
      feeStartDate.setDate(1);
      feeStartDate.setHours(0, 0, 0, 0);

      // Update student's feeCycleStartDate to the effective date
      student.feeCycleStartDate = effectiveDate;
      student.stage = newStage;
      student.level = newLevel;
      student.batchId = batch._id as any;
      student.batch = batch.batchName;
      await student.save({ session: session || null });

      // Generate new fees from effective date using the new stage
      const createdFees = await this.createInitialOverdueFeesForStudent(
        studentId,
        feeStartDate,
        newStage,
        session
      );

      console.log(`Created ${createdFees.length} new fees for student ${studentId} after stage/level transition`);

      return {
        deletedFeesCount,
        createdFeesCount: createdFees.length,
        effectiveDate
      };
    } catch (error: any) {
      console.error(`Failed to handle stage/level transition: ${error.message}`);
      throw new Error(`Failed to handle stage/level transition: ${error.message}`);
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

      // Get all overdue fees (no payment date and past due date)
      const overdueFees = await FeeRecord.find({
        studentId,
        paymentDate: null,
        dueDate: { $lt: currentDate }
      }).sort({ dueDate: 1 });

      // Get the earliest upcoming fee only (no payment date and future due date)
      const nextUpcomingFee = await FeeRecord.findOne({
        studentId,
        paymentDate: null,
        dueDate: { $gte: currentDate }
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
