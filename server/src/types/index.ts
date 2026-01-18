import { Document, Types } from 'mongoose';

export interface IUser extends Document {
  email?: string; // Optional - can use phone instead
  phone?: string; // Optional - can use email instead
  password: string;
  name: string;
  role: 'user' | 'admin' | 'superadmin';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IStudent extends Document {
  studentCode: string; // Unique system-generated identifier (e.g., STU-20260118-00001)
  userId?: Types.ObjectId; // Reference to User (guardian account) - can be shared by siblings
  studentName: string;
  dob?: string;
  parentName?: string;
  email?: string; // Optional - at least one of email/phone required
  phone?: string; // Optional - at least one of email/phone required
  alternatePhone?: string;
  alternateEmail?: string;
  address?: string;
  combinedSkill?: string; // Raw skill string from email (e.g., "Beginner Level - 1")
  skillCategory?: 'beginner' | 'intermediate' | 'advanced'; // DEPRECATED: Parsed category
  skillLevel?: 1 | 2 | 3; // DEPRECATED: Parsed level
  stage: 'beginner' | 'intermediate' | 'advanced'; // Required: Student's current stage
  level: 1 | 2 | 3; // Required: Student's current level
  batch?: string; // DEPRECATED: Use batchId instead
  batchId?: Types.ObjectId | null; // Reference to Batch model
  referredBy?: string;
  emailId?: string; // Gmail message ID for tracking
  enrollmentDate: Date; // When student joined the course
  feeCycleStartDate?: Date; // Date when fee cycle starts (batch start date)
  isActive: boolean; // Whether student is active or deactivated
  createdAt: Date;
  updatedAt: Date;
}

export interface IStudentCredit extends Document {
  studentId: Types.ObjectId; // Reference to Student
  studentName: string;
  transactionType: 'credit_added' | 'credit_used' | 'credit_refund' | 'credit_adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  paymentMethod?: 'cash' | 'online' | 'card' | 'upi' | 'other';
  transactionId?: string;
  feeRecordId?: Types.ObjectId; // Reference to FeeRecord
  feeMonth?: string;
  processedBy: Types.ObjectId; // Reference to User
  processedAt: Date;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISyncJob extends Document {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  lastProcessedEmailDate?: Date;
  emailsProcessed: number;
  studentsCreated: number;
  studentsUpdated: number;
  errorLogs: string[];
  metadata?: {
    totalEmails: number;
    successfulParsing: number;
    failedParsing: number;
  };
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  markAsRunning(): Promise<ISyncJob>;
  markAsCompleted(): Promise<ISyncJob>;
  markAsFailed(error: string): Promise<ISyncJob>;
  addError(error: string): Promise<ISyncJob>;
}

export interface EmailParseResult {
  studentName: string;
  dob: string;
  parentName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  alternateEmail: string;
  address: string;
  skillLevel: string; // This will contain the raw skill string from email
  referredBy: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errorCode?: string;
  count?: number;
  timestamp: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  stage?: 'beginner' | 'intermediate' | 'advanced';
  isActive?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ICourseLevel {
  levelNumber: number;
  feeAmount: number;
  durationMonths: number;
  approximateHours: number;
  description?: string;
}

export interface ICourse extends Document {
  courseName: string;
  displayName: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
  levels: ICourseLevel[];
  createdBy: Types.ObjectId; // Reference to User
  createdAt: Date;
  updatedAt: Date;
  numberOfLevels?: number;
  getFeeForLevel(levelNumber: number): number | null;
  hasLevel(levelNumber: number): boolean;
}

export interface IFeeRecord extends Document {
  studentId: Types.ObjectId; // Reference to Student
  studentName: string;
  stage: 'beginner' | 'intermediate' | 'advanced';
  level: 1 | 2 | 3;
  feeMonth: string; // e.g., 'January 2024'
  dueDate: Date;
  // Note: 'status' is a virtual computed field, not stored in DB
  // Computed as: paid | partially_paid | overdue | upcoming
  feeAmount: number;
  paidAmount: number;
  paymentDate?: Date;
  paymentMethod?: 'cash' | 'online' | 'card' | 'upi' | 'other';
  transactionId?: string;
  paymentScreenshot?: string; // URL - optional for future
  remarks?: string;
  updatedBy?: Types.ObjectId; // Reference to User
  createdAt: Date;
  updatedAt: Date;
  // Virtual fields
  status?: 'upcoming' | 'paid' | 'overdue' | 'partially_paid';
  remainingAmount?: number;
  paymentPercentage?: number;
}

export interface FeeStats {
  totalCollected: number;
  totalUpcoming: number;
  totalOverdue: number;
  totalPartiallyPaid: number;
  totalStudents: number;
  paidStudents: number;
  upcomingStudents: number;
  overdueStudentsCount: number;
  partiallyPaidStudents: number;
  stageBreakdown: {
    beginner: { collected: number; upcoming: number; overdue: number; students: number; paidStudents: number };
    intermediate: { collected: number; upcoming: number; overdue: number; students: number; paidStudents: number };
    advanced: { collected: number; upcoming: number; overdue: number; students: number; paidStudents: number };
  };
  recentPayments: IFeeRecord[];
  overdueStudents: Array<{
    studentId: string;
    studentName: string;
    stage: string;
    level: number;
    overdueAmount: number;
    overdueMonths: number;
  }>;
}

export interface IScheduleEntry {
  dayOfWeek: number; // 0-6 (0=Sunday, 6=Saturday)
  startTime: string; // HH:MM format (24-hour)
}

export interface IBatch extends Document {
  batchName: string;
  batchCode: string;
  stage: 'beginner' | 'intermediate' | 'advanced';
  level: 1 | 2 | 3;
  maxStudents: number | null;
  schedule: IScheduleEntry[];
  status: 'active' | 'ended' | 'draft';
  startDate: Date;
  endDate: Date | null;
  description: string;
  createdBy: Types.ObjectId; // Reference to User
  createdAt: Date;
  updatedAt: Date;
  currentStudentCount?: number; // Virtual field
  
  // Instance methods
  isAtCapacity(): Promise<boolean>;
  canAcceptStudent(): Promise<{ canAccept: boolean; reason?: string }>;
}
