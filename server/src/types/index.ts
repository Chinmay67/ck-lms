import { Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: 'user' | 'admin' | 'superadmin';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IStudent extends Document {
  studentName: string;
  dob?: string;
  parentName?: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  alternateEmail?: string;
  address?: string;
  combinedSkill?: string; // Raw skill string from email (e.g., "Beginner Level - 1")
  skillCategory?: 'beginner' | 'intermediate' | 'advanced'; // Parsed category
  skillLevel?: 1 | 2 | 3; // Parsed level
  stage?: 'beginner' | 'intermediate' | 'advanced'; // Manual entry stage
  level?: 1 | 2 | 3; // Manual entry level
  batch?: string; // Batch identifier assigned by admin
  referredBy?: string;
  emailId?: string; // Gmail message ID for tracking
  enrollmentDate: Date; // When student joined the course
  isActive: boolean; // Whether student is active or deactivated
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
  createdBy: any; // Reference to User
  createdAt: Date;
  updatedAt: Date;
  numberOfLevels?: number;
  getFeeForLevel(levelNumber: number): number | null;
  hasLevel(levelNumber: number): boolean;
}

export interface IFeeRecord extends Document {
  studentId: any; // Reference to Student
  studentName: string;
  stage: 'beginner' | 'intermediate' | 'advanced';
  level: 1 | 2 | 3;
  feeMonth: string; // e.g., 'January 2024'
  dueDate: Date;
  status: 'upcoming' | 'paid' | 'overdue' | 'partially_paid';
  feeAmount: number;
  paidAmount: number;
  paymentDate?: Date;
  paymentMethod?: 'cash' | 'online' | 'card' | 'upi' | 'other';
  transactionId?: string;
  paymentScreenshot?: string; // URL - optional for future
  remarks?: string;
  updatedBy?: any; // Reference to User
  createdAt: Date;
  updatedAt: Date;
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
