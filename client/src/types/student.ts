export interface Student {
  _id: string;
  studentCode: string; // Unique system-generated identifier
  userId?: string; // Reference to User (guardian account) - can be shared by siblings
  studentName: string;
  dob?: string;
  parentName?: string;
  email?: string; // Optional - at least one of email/phone required
  phone?: string; // Optional - at least one of email/phone required
  alternatePhone?: string;
  alternateEmail?: string;
  address?: string;
  combinedSkill?: string;
  skillCategory?: 'beginner' | 'intermediate' | 'advanced';
  skillLevel?: 1 | 2 | 3;
  stage?: 'beginner' | 'intermediate' | 'advanced';
  level?: 1 | 2 | 3;
  batch?: string;
  batchId?: string | null;
  referredBy?: string;
  emailId?: string;
  enrollmentDate: string;
  isActive: boolean;
  hasOverdueFees?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Extended type for student updates that includes transient fields
export type StudentUpdate = Partial<Student> & {
  changeType?: 'progression' | 'correction';
};

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
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

export interface StudentFilters {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  stage?: string; // Course name (maps to course.courseName)
  isActive?: boolean; // Filter by active/inactive status
}

export interface FeeRecord {
  _id: string;
  studentId: string;
  studentName: string;
  stage: 'beginner' | 'intermediate' | 'advanced';
  level: 1 | 2 | 3;
  feeMonth: string;
  dueDate: string;
  status: 'upcoming' | 'paid' | 'overdue' | 'partially_paid';
  feeAmount: number;
  paidAmount: number;
  paymentDate?: string;
  paymentMethod?: 'cash' | 'online' | 'card' | 'upi' | 'other';
  transactionId?: string;
  paymentScreenshot?: string;
  remarks?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
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
  recentPayments: FeeRecord[];
  overdueStudents: Array<{
    studentId: string;
    studentName: string;
    stage: string;
    level: number;
    overdueAmount: number;
    overdueMonths: number;
  }>;
}

export interface FeeFilters {
  page?: number;
  limit?: number;
  status?: string;
  stage?: string;
  studentId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface StudentCredit {
  _id: string;
  studentId: string;
  studentName: string;
  amountPaid: number;
  amountUsed: number;
  remainingCredit: number;
  status: 'active' | 'used' | 'expired';
  paymentDate: string;
  paymentMethod?: string;
  processedBy: string;
  usageHistory: Array<{
    amount: number;
    feeRecordId: string;
    usedAt: string;
    monthCovered: string;
  }>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditSummary {
  totalCredits: number;
  activeCredits: number;
  usedCredits: number;
  expiredCredits: number;
  totalPaid: number;
  totalUsed: number;
  totalRemaining: number;
}
