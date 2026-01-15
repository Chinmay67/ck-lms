import Batch from '../models/Batch.js';
import Student from '../models/Student.js';
import { IBatch, IScheduleEntry } from '../types/index.js';
import { StudentCreditService } from './StudentCreditService.js';
import { FeeService } from './FeeService.js';
import mongoose from 'mongoose';

export class BatchService {
  /**
   * Check for schedule conflicts with existing active batches
   */
  static async checkScheduleConflicts(
    schedule: IScheduleEntry[],
    excludeBatchId?: string
  ): Promise<{ hasConflict: boolean; conflicts: any[] }> {
    const conflicts: any[] = [];

    // Get all active batches
    const query: any = { status: 'active' };
    if (excludeBatchId) {
      query._id = { $ne: excludeBatchId };
    }

    const activeBatches = await Batch.find(query).select('batchName schedule');

    // Check each schedule entry against active batches
    for (const scheduleEntry of schedule) {
      for (const batch of activeBatches) {
        // Check if this batch has a conflicting schedule entry
        const conflictingEntry = batch.schedule.find(
          (entry: IScheduleEntry) =>
            entry.dayOfWeek === scheduleEntry.dayOfWeek &&
            entry.startTime === scheduleEntry.startTime
        );

        if (conflictingEntry) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          conflicts.push({
            batchId: batch._id.toString(),
            batchName: batch.batchName,
            dayOfWeek: scheduleEntry.dayOfWeek,
            dayName: dayNames[scheduleEntry.dayOfWeek],
            startTime: scheduleEntry.startTime
          });
        }
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts
    };
  }

  /**
   * Create a new batch
   */
  static async createBatch(batchData: Partial<IBatch>, createdBy: string): Promise<IBatch> {
    const batch = new Batch({
      ...batchData,
      createdBy
    });

    await batch.save();
    return batch;
  }

  /**
   * Update an existing batch
   */
  static async updateBatch(
    batchId: string,
    updateData: Partial<IBatch>
  ): Promise<IBatch | null> {
    const batch = await Batch.findById(batchId);
    
    if (!batch) {
      return null;
    }

    // Update batch
    Object.assign(batch, updateData);
    await batch.save();

    return batch;
  }

  /**
   * Get batch by ID with student count
   */
  static async getBatchById(batchId: string): Promise<any | null> {
    const batch = await Batch.findById(batchId).populate('createdBy', 'name email');
    
    if (!batch) {
      return null;
    }

    // Get student count
    const studentCount = await Student.countDocuments({ 
      batchId: batch._id,
      isActive: true 
    });

    return {
      ...batch.toJSON(),
      currentStudentCount: studentCount
    };
  }

  /**
   * Get all batches with filters and student counts
   */
  static async getAllBatches(filters?: {
    status?: 'active' | 'ended' | 'draft';
    stage?: 'beginner' | 'intermediate' | 'advanced';
    level?: number;
  }): Promise<any[]> {
    const query: any = {};

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.stage) {
      query.stage = filters.stage;
    }
    if (filters?.level) {
      query.level = filters.level;
    }

    const batches = await Batch.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // Add student counts
    const batchesWithCounts = await Promise.all(
      batches.map(async (batch) => {
        const studentCount = await Student.countDocuments({
          batchId: batch._id,
          isActive: true
        });

        return {
          ...batch.toJSON(),
          currentStudentCount: studentCount
        };
      })
    );

    return batchesWithCounts;
  }

  /**
   * Get available batches for a specific stage and level
   */
  static async getAvailableBatches(
    stage: 'beginner' | 'intermediate' | 'advanced',
    level: number
  ): Promise<any[]> {
    const batches = await Batch.find({
      status: 'active',
      stage,
      level
    }).sort({ batchName: 1 });

    // Filter out batches at capacity and add student counts
    const availableBatches = await Promise.all(
      batches.map(async (batch) => {
        const studentCount = await Student.countDocuments({
          batchId: batch._id,
          isActive: true
        });

        const isAvailable = batch.maxStudents === null || studentCount < batch.maxStudents;

        return {
          ...batch.toJSON(),
          currentStudentCount: studentCount,
          isAvailable
        };
      })
    );

    // Return only available batches
    return availableBatches.filter(b => b.isAvailable);
  }

  /**
   * End a batch (set status to ended and set end date)
   */
  static async endBatch(batchId: string): Promise<IBatch | null> {
    const batch = await Batch.findById(batchId);
    
    if (!batch) {
      return null;
    }

    if (batch.status === 'ended') {
      throw new Error('Batch is already ended');
    }

    batch.status = 'ended';
    batch.endDate = new Date();
    await batch.save();

    return batch;
  }

  /**
   * Delete a batch (only if no students are assigned)
   */
  static async deleteBatch(batchId: string): Promise<boolean> {
    // Check if any students are assigned to this batch
    const studentCount = await Student.countDocuments({ batchId });

    if (studentCount > 0) {
      throw new Error(`Cannot delete batch. ${studentCount} student(s) are currently assigned to this batch.`);
    }

    const result = await Batch.findByIdAndDelete(batchId);
    return result !== null;
  }

  /**
   * Get students in a batch
   */
  static async getBatchStudents(batchId: string): Promise<any[]> {
    const students = await Student.find({ 
      batchId,
      isActive: true 
    }).sort({ studentName: 1 });

    return students;
  }

  /**
   * Assign student to batch
   * - Sets fee cycle start date to batch start date
   * - Applies any active credits to pay fees
   * - Generates initial fee records if needed
   */
  static async assignStudentToBatch(
    studentId: string,
    batchId: string
  ): Promise<{ student: any; previousBatch: any | null; creditApplied?: number; feesCreated?: number }> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const batch = await Batch.findById(batchId).session(session);
      
      if (!batch) {
        throw new Error('Batch not found');
      }

      const student = await Student.findById(studentId).session(session);
      
      if (!student) {
        throw new Error('Student not found');
      }

      // Verify stage and level match
      const studentStage = student.stage || student.skillCategory;
      const studentLevel = student.level || student.skillLevel;

      if (studentStage !== batch.stage || studentLevel !== batch.level) {
        throw new Error(
          `Student's stage/level (${studentStage} ${studentLevel}) does not match batch (${batch.stage} ${batch.level})`
        );
      }

      // Check batch capacity and status
      const canAccept = await batch.canAcceptStudent();
      if (!canAccept.canAccept) {
        throw new Error(canAccept.reason || 'Batch cannot accept student');
      }

      // Get previous batch info if exists
      let previousBatch = null;
      if (student.batchId) {
        previousBatch = await Batch.findById(student.batchId).session(session);
      }

      // Set fee cycle start date to batch start date
      student.feeCycleStartDate = batch.startDate;

      // Update student's batch
      student.batchId = batch._id as any;
      // Also update the old string field for backward compatibility
      student.batch = batch.batchName;
      await student.save({ session });

      // Generate initial fee records based on batch start date
      const stage = studentStage;
      const createdFees = await FeeService.createInitialOverdueFeesForStudent(
        studentId,
        batch.startDate,
        stage,
        session
      );

      // Get fee amount for credit application
      const Course = (await import('../models/Course.js')).default;
      const course = await Course.findOne({ 
        courseName: stage, 
        isActive: true 
      }).session(session);
      
      let creditResult = { monthsPaid: 0, amountUsed: 0, remainingCredit: 0 };
      
      if (course && course.levels && course.levels.length > 0) {
        const levelConfig = course.levels.find((l: any) => l.levelNumber === studentLevel) || course.levels[0];
        
        if (levelConfig) {
          // Apply any active credits to pay fees
          creditResult = await StudentCreditService.applyCreditToFees({
            studentId,
            studentName: student.studentName,
            monthlyFeeAmount: levelConfig.feeAmount,
            processedBy: student._id as any // Using student ID as processedBy since this is auto-applied
          });
        }
      }

      await session.commitTransaction();

      return {
        student,
        previousBatch,
        creditApplied: creditResult.amountUsed,
        feesCreated: createdFees.length
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Remove student from batch
   */
  static async removeStudentFromBatch(studentId: string): Promise<any> {
    const student = await Student.findById(studentId);
    
    if (!student) {
      throw new Error('Student not found');
    }

    const previousBatchId = student.batchId;
    
    student.batchId = undefined;
    student.batch = 'Not Assigned';
    await student.save();

    let previousBatch = null;
    if (previousBatchId) {
      previousBatch = await Batch.findById(previousBatchId);
    }

    return {
      student,
      previousBatch
    };
  }

  /**
   * Get batch statistics
   */
  static async getBatchStats(): Promise<any> {
    const totalBatches = await Batch.countDocuments();
    const activeBatches = await Batch.countDocuments({ status: 'active' });
    const endedBatches = await Batch.countDocuments({ status: 'ended' });
    const draftBatches = await Batch.countDocuments({ status: 'draft' });

    // Get batches with student counts for capacity analysis
    const batches = await Batch.find({ status: 'active' });
    
    let totalCapacity = 0;
    let totalEnrolled = 0;
    let batchesAtCapacity = 0;

    for (const batch of batches) {
      const studentCount = await Student.countDocuments({
        batchId: batch._id,
        isActive: true
      });

      totalEnrolled += studentCount;
      
      if (batch.maxStudents !== null) {
        totalCapacity += batch.maxStudents;
        if (studentCount >= batch.maxStudents) {
          batchesAtCapacity++;
        }
      }
    }

    return {
      totalBatches,
      activeBatches,
      endedBatches,
      draftBatches,
      totalCapacity: totalCapacity > 0 ? totalCapacity : null,
      totalEnrolled,
      batchesAtCapacity,
      utilizationRate: totalCapacity > 0 ? (totalEnrolled / totalCapacity) * 100 : null
    };
  }

  /**
   * Get eligible students for a batch (matching stage/level)
   * Returns all students with the same stage/level as the batch,
   * including their current batch assignment info for transfer detection
   */
  static async getEligibleStudentsForBatch(batchId: string): Promise<any[]> {
    const batch = await Batch.findById(batchId);
    
    if (!batch) {
      throw new Error('Batch not found');
    }

    // Find all active students matching the batch's stage and level
    // Exclude students already in this batch
    const students = await Student.find({
      isActive: true,
      $and: [
        {
          $or: [
            { stage: batch.stage, level: batch.level },
            { skillCategory: batch.stage, skillLevel: batch.level }
          ]
        },
        {
          $or: [
            { batchId: { $ne: batch._id } },
            { batchId: null },
            { batchId: { $exists: false } }
          ]
        }
      ]
    })
    .populate('batchId', 'batchName batchCode')
    .sort({ studentName: 1 });

    // Map to include current batch info
    return students.map((student) => {
      const currentBatch = student.batchId as any;
      return {
        _id: student._id,
        studentName: student.studentName,
        email: student.email,
        phone: student.phone,
        stage: student.stage || student.skillCategory,
        level: student.level || student.skillLevel,
        isActive: student.isActive,
        currentBatchId: currentBatch?._id?.toString() || null,
        currentBatchName: currentBatch?.batchName || student.batch || null,
        isAssigned: !!currentBatch || (student.batch && student.batch !== 'Not Assigned')
      };
    });
  }

  /**
   * Bulk assign students to a batch
   * - Pre-validates capacity before starting
   * - Uses transaction for atomicity (all succeed or all fail)
   * - Returns detailed results
   */
  static async bulkAssignStudentsToBatch(
    studentIds: string[],
    batchId: string
  ): Promise<{
    success: boolean;
    assignedCount: number;
    results: Array<{ studentId: string; studentName: string; success: boolean; error?: string; previousBatch?: string }>;
  }> {
    if (!studentIds || studentIds.length === 0) {
      throw new Error('No students provided for assignment');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const batch = await Batch.findById(batchId).session(session);
      
      if (!batch) {
        throw new Error('Batch not found');
      }

      if (batch.status !== 'active') {
        throw new Error('Cannot assign students to a non-active batch');
      }

      // Get current student count in batch
      const currentStudentCount = await Student.countDocuments({
        batchId: batch._id,
        isActive: true
      }).session(session);

      // Pre-validate capacity
      if (batch.maxStudents !== null) {
        const availableSlots = batch.maxStudents - currentStudentCount;
        if (studentIds.length > availableSlots) {
          throw new Error(
            `Cannot assign ${studentIds.length} students. Batch has only ${availableSlots} available slot${availableSlots === 1 ? '' : 's'} (${currentStudentCount}/${batch.maxStudents} filled).`
          );
        }
      }

      const results: Array<{ studentId: string; studentName: string; success: boolean; error?: string; previousBatch?: string }> = [];

      // Process each student
      for (const studentId of studentIds) {
        try {
          const student = await Student.findById(studentId).session(session);
          
          if (!student) {
            results.push({ studentId, studentName: 'Unknown', success: false, error: 'Student not found' });
            continue;
          }

          // Verify stage and level match
          const studentStage = student.stage || student.skillCategory;
          const studentLevel = student.level || student.skillLevel;

          if (studentStage !== batch.stage || studentLevel !== batch.level) {
            results.push({
              studentId,
              studentName: student.studentName,
              success: false,
              error: `Stage/level mismatch: student is ${studentStage} ${studentLevel}, batch is ${batch.stage} ${batch.level}`
            });
            continue;
          }

          // Track previous batch for result
          let previousBatchName: string | undefined;
          if (student.batchId) {
            const prevBatch = await Batch.findById(student.batchId).session(session);
            previousBatchName = prevBatch?.batchName;
          }

          // Set fee cycle start date to batch start date
          student.feeCycleStartDate = batch.startDate;

          // Update student's batch
          student.batchId = batch._id as any;
          student.batch = batch.batchName;
          await student.save({ session });

          // Generate initial fee records based on batch start date
          const stage = studentStage;
          await FeeService.createInitialOverdueFeesForStudent(
            studentId,
            batch.startDate,
            stage,
            session
          );

          // Apply credits if applicable
          const Course = (await import('../models/Course.js')).default;
          const course = await Course.findOne({ 
            courseName: stage, 
            isActive: true 
          }).session(session);
          
          if (course && course.levels && course.levels.length > 0) {
            const levelConfig = course.levels.find((l: any) => l.levelNumber === studentLevel) || course.levels[0];
            
            if (levelConfig) {
              await StudentCreditService.applyCreditToFees({
                studentId,
                studentName: student.studentName,
                monthlyFeeAmount: levelConfig.feeAmount,
                processedBy: student._id as any
              });
            }
          }

          results.push({
            studentId,
            studentName: student.studentName,
            success: true,
            previousBatch: previousBatchName
          });
        } catch (error: any) {
          // If any individual student fails, abort the entire transaction
          throw new Error(`Failed to assign student: ${error.message}`);
        }
      }

      await session.commitTransaction();

      return {
        success: true,
        assignedCount: results.filter(r => r.success).length,
        results
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
