import Student from '../models/Student.js';
import User from '../models/User.js';
import SyncJob from '../models/SyncJob.js';
import { IStudent, ISyncJob, EmailParseResult, PaginationOptions, PaginatedResponse } from '../types/index.js';
import { parseSkillString } from '../utils/skillParser.js';
import { FeeService } from './FeeService.js';
import mongoose from 'mongoose';

export class DatabaseService {
  // Student operations
  static async createStudent(studentData: Partial<IStudent>): Promise<IStudent> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validate: Must have email OR phone
      if (!studentData.email && !studentData.phone) {
        throw new Error('Student must have either email or phone number');
      }

      // Find or create User account for the student
      // Search by email first, then by phone
      let existingUser = null;
      
      if (studentData.email) {
        existingUser = await User.findOne({ email: studentData.email }).session(session);
      }
      
      // If not found by email, try phone
      if (!existingUser && studentData.phone) {
        existingUser = await User.findOne({ phone: studentData.phone }).session(session);
      }
      
      let userId = existingUser?._id;
      
      if (!existingUser) {
        // Create new user account
        // User identifier: email (if available) OR phone
        // Password: phone (if available) OR default
        const password = studentData.phone || 'Student@123';
        
        const userData: any = {
          name: studentData.email || studentData.phone || 'Unknown',
          password: password,
          role: 'user' as const,
          isActive: true
        };
        
        // Set email if available
        if (studentData.email) {
          userData.email = studentData.email;
        }
        
        // Set phone if available
        if (studentData.phone) {
          userData.phone = studentData.phone;
        }
        
        const user = new User(userData);
        await user.save({ session });
        userId = user._id;
      }

      // Create the student with userId reference
      const student = new Student({
        ...studentData,
        userId: userId
      });
      await student.save({ session });

      // Note: Fee records are created in the route handler using createInitialOverdueFeesForStudent()
      // which properly handles overdue fees from enrollment to current month + one pending month

      await session.commitTransaction();
      return student;
    } catch (error: any) {
      await session.abortTransaction();
      if (error.code === 11000) {
        // Check which field caused the duplicate
        if (error.message.includes('studentCode')) {
          throw new Error('Student code already exists - please try again');
        }
        throw new Error(`Duplicate key error: ${error.message}`);
      }
      throw new Error(`Failed to create student: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  static async getStudentByEmail(email: string): Promise<IStudent | null> {
    try {
      return await Student.findOne({ email: email.toLowerCase() });
    } catch (error: any) {
      throw new Error(`Failed to find student by email: ${error.message}`);
    }
  }

  static async getStudentById(id: string): Promise<IStudent | null> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
      }
      return await Student.findById(id);
    } catch (error: any) {
      throw new Error(`Failed to find student by ID: ${error.message}`);
    }
  }

  static async updateStudent(id: string, updateData: Partial<IStudent>): Promise<IStudent | null> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
      }
      return await Student.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    } catch (error: any) {
      throw new Error(`Failed to update student: ${error.message}`);
    }
  }

  static async deleteStudent(id: string): Promise<boolean> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return false;
      }
      const result = await Student.findByIdAndDelete(id);
      return !!result;
    } catch (error: any) {
      throw new Error(`Failed to delete student: ${error.message}`);
    }
  }

  static async toggleStudentActiveStatus(id: string): Promise<IStudent | null> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
      }
      const student = await Student.findById(id);
      if (!student) {
        return null;
      }
      student.isActive = !student.isActive;
      return await student.save();
    } catch (error: any) {
      throw new Error(`Failed to toggle student active status: ${error.message}`);
    }
  }

  static async getAllStudents(options: PaginationOptions): Promise<PaginatedResponse<IStudent>> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', stage, isActive } = options;
      
      const skip = (page - 1) * limit;
      const sortDirection = sortOrder === 'asc' ? 1 : -1;
      const sortOptions = { [sortBy]: sortDirection };

      // Build filter - only show active students by default, unless isActive is specified
      const filter: any = {};
      if (isActive !== undefined) {
        filter.isActive = isActive;
      } else {
        filter.isActive = true; // Default to active only
      }
      if (stage) {
        filter.stage = stage;
      }

      const [students, totalItems] = await Promise.all([
        Student.find(filter).sort(sortOptions as any).skip(skip).limit(limit),
        Student.countDocuments(filter)
      ]);

      const totalPages = Math.ceil(totalItems / limit);

      return {
        data: students,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to get students: ${error.message}`);
    }
  }

  static async searchStudents(query: string, options: PaginationOptions): Promise<PaginatedResponse<IStudent>> {
    try {
      const { page = 1, limit = 10, stage, isActive } = options;
      const skip = (page - 1) * limit;

      const searchRegex = new RegExp(query, 'i');
      const searchFilter: any = {
        $or: [
          { studentName: searchRegex },
          { email: searchRegex },
          { parentName: searchRegex },
          { phone: searchRegex }
        ]
      };

      // Add isActive filter - default to active only unless specified
      if (isActive !== undefined) {
        searchFilter.isActive = isActive;
      } else {
        searchFilter.isActive = true; // Default to active only
      }

      // Add stage filter if provided
      if (stage) {
        searchFilter.stage = stage;
      }

      const [students, totalItems] = await Promise.all([
        Student.find(searchFilter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Student.countDocuments(searchFilter)
      ]);

      const totalPages = Math.ceil(totalItems / limit);

      return {
        data: students,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to search students: ${error.message}`);
    }
  }

  static async upsertStudentFromEmail(
    emailData: EmailParseResult, 
    emailId?: string
  ): Promise<{ student: IStudent; created: boolean }> {
    try {
      const existingStudent = await Student.findOne({ email: emailData.email.toLowerCase() });
      
      // Parse skill information from the raw skill string
      const parsedSkill = parseSkillString(emailData.skillLevel);
      
      // Prepare student data with parsed skill information
      const processedData: any = {
        ...emailData,
        combinedSkill: emailData.skillLevel, // Store raw skill string
        ...(parsedSkill.category && { skillCategory: parsedSkill.category }),
        ...(parsedSkill.level && { skillLevel: parsedSkill.level }),
        ...(emailId && { emailId })
      };
      
      // Remove the old skillLevel field since we now use combinedSkill, skillCategory, and skillLevel
      const { skillLevel: _, ...studentDataWithoutOldSkill } = processedData;
      
      if (existingStudent) {
        // Update existing student
        Object.assign(existingStudent, studentDataWithoutOldSkill);
        const updatedStudent = await existingStudent.save();
        return { student: updatedStudent, created: false };
      } else {
        // Create new student
        const newStudent = await this.createStudent(studentDataWithoutOldSkill);
        return { student: newStudent, created: true };
      }
    } catch (error: any) {
      throw new Error(`Failed to upsert student from email: ${error.message}`);
    }
  }

  // SyncJob operations
  static async createSyncJob(jobData?: Partial<ISyncJob>): Promise<ISyncJob> {
    try {
      const syncJob = new SyncJob(jobData);
      return await syncJob.save();
    } catch (error: any) {
      throw new Error(`Failed to create sync job: ${error.message}`);
    }
  }

  static async getSyncJobById(id: string): Promise<ISyncJob | null> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
      }
      return await SyncJob.findById(id);
    } catch (error: any) {
      throw new Error(`Failed to find sync job: ${error.message}`);
    }
  }

  static async getLatestSyncJob(): Promise<ISyncJob | null> {
    try {
      return await SyncJob.findOne().sort({ createdAt: -1 });
    } catch (error: any) {
      throw new Error(`Failed to get latest sync job: ${error.message}`);
    }
  }

  static async getAllSyncJobs(options: PaginationOptions): Promise<PaginatedResponse<ISyncJob>> {
    try {
      const { page = 1, limit = 10 } = options;
      const skip = (page - 1) * limit;

      const [jobs, totalItems] = await Promise.all([
        SyncJob.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
        SyncJob.countDocuments()
      ]);

      const totalPages = Math.ceil(totalItems / limit);

      return {
        data: jobs,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to get sync jobs: ${error.message}`);
    }
  }

  static async getRunningJobs(): Promise<ISyncJob[]> {
    try {
      return await SyncJob.find({ status: 'running' });
    } catch (error: any) {
      throw new Error(`Failed to get running jobs: ${error.message}`);
    }
  }

  // Statistics
  static async getStudentStats() {
    try {
      const [totalStudents, recentStudents, studentsBySkill] = await Promise.all([
        Student.countDocuments(),
        Student.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
        Student.aggregate([
          { $group: { _id: '$skillCategory', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
      ]);

      return {
        totalStudents,
        recentStudents,
        studentsBySkill
      };
    } catch (error: any) {
      throw new Error(`Failed to get student statistics: ${error.message}`);
    }
  }

  static async getSyncJobStats() {
    try {
      const [totalJobs, successfulJobs, failedJobs, lastSuccessfulSync] = await Promise.all([
        SyncJob.countDocuments(),
        SyncJob.countDocuments({ status: 'completed' }),
        SyncJob.countDocuments({ status: 'failed' }),
        SyncJob.findOne({ status: 'completed' }).sort({ endTime: -1 })
      ]);

      return {
        totalJobs,
        successfulJobs,
        failedJobs,
        lastSuccessfulSync: lastSuccessfulSync?.endTime || null
      };
    } catch (error: any) {
      throw new Error(`Failed to get sync job statistics: ${error.message}`);
    }
  }
}
