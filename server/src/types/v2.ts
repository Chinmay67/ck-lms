/**
 * TYPE DEFINITIONS (v2)
 *
 * New and updated interfaces for the v2 data layer.
 * Imports from this file only — does not modify the v1 types/index.ts.
 *
 * Key design decisions:
 * - "stage" is now a numeric stageNumber (not a hardcoded enum string)
 * - "level" is now a numeric levelNumber within that stage
 * - Stage display name lives in Course.stages[].stageName — not duplicated here
 * - All monetary values are integers (paise)
 */

import { Document, Types } from 'mongoose';

// ── Course / Stage / Level ────────────────────────────────────────

export interface ICourseLevel {
  levelNumber: number;          // 1-based within the stage
  feeAmount: number;            // monthly fee in rupees
  durationMonths?: number;      // legacy — use min/max instead
  durationMonthsMin?: number;   // minimum expected months at this level
  durationMonthsMax?: number;   // maximum expected months at this level
  approximateHours?: number;
  description?: string;
}

export interface ICourseStage {
  stageNumber: number;    // 1-based ordering of stages
  stageName: string;      // configurable display name, e.g. "Beginner", "Intermediate"
  levels: ICourseLevel[];
}

export interface ICourse extends Document {
  courseName: string;     // slug / internal key, lowercase unique
  displayName: string;    // human-readable, e.g. "Chess"
  description?: string;
  isActive: boolean;
  displayOrder: number;
  stages: ICourseStage[]; // replaces the old flat levels[]
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── Batch ─────────────────────────────────────────────────────────

export interface IScheduleEntry {
  dayOfWeek: number;  // 0 = Sunday … 6 = Saturday
  startTime: string;  // "HH:MM" 24-hour
}

export interface IBatch extends Document {
  batchName: string;
  batchCode: string;
  courseId: Types.ObjectId;   // which course this batch belongs to
  stageNumber: number;        // which stage within the course (replaces string enum)
  levelNumber: number;        // which level within that stage (replaces 1|2|3 enum)
  maxStudents: number | null;
  filledSeats: number;          // denormalized seat counter — authoritative for capacity
  schedule: IScheduleEntry[];
  status: 'active' | 'ended' | 'draft';
  startDate: Date;
  endDate: Date | null;
  description?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── Enrollment (new in v2) ────────────────────────────────────────

export interface IEnrollment extends Document {
  studentId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  courseId: Types.ObjectId;
  stageNumber: number;
  levelNumber: number;
  grossFee: number;           // fee from course level before any discount (snapshot)
  monthlyFee: number;         // effective fee after discount — NEVER update
  discountType: 'none' | 'percentage' | 'fixed';
  discountPct: number;        // 0–100 (used when discountType === 'percentage')
  discountAmount: number;     // absolute ₹ value off (used when discountType === 'fixed')
  discountReason?: string;
  feeOverridden: boolean;     // true when monthlyFee ≠ course level fee and no discount type was set
  startDate: Date;
  endDate: Date | null;
  endReason: 'upgraded' | 'batch_change' | 'fee_change' | 'left' | 'inactive' | 'paused' | null;
  pausedUntil: Date | null;
  /** Excluded from fee-divergence report when true. Set explicitly by admin. */
  feeGrandfathered: boolean;
  /** Free-text note explaining a grandfather or in-place fee amendment. */
  feeNote?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── Student (v2) ─────────────────────────────────────────────────

export interface IStudentV2 extends Document {
  studentCode: string;
  userId?: Types.ObjectId;
  studentName: string;
  dob?: string;
  parentName?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
  alternateEmail?: string;
  address?: string;
  referredBy?: string;
  /** Denormalized from active Enrollment.courseId */
  courseId?: Types.ObjectId | null;
  /** Denormalized from active Enrollment.stageNumber */
  stageNumber?: number | null;
  /** Denormalized from active Enrollment.levelNumber */
  levelNumber?: number | null;
  batchId?: Types.ObjectId | null;
  currentEnrollmentId?: Types.ObjectId | null;
  enrollmentDate: Date;
  isActive: boolean;
  /** Authoritative credit balance in rupees. Updated atomically via $inc. */
  creditBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── FeeRecord (v2 updated) ────────────────────────────────────────

export interface IFeeRecordV2 extends Document {
  studentId: Types.ObjectId;
  enrollmentId: Types.ObjectId; // link to the Enrollment that generated this obligation
  studentName: string;
  courseId: Types.ObjectId;   // snapshot
  stageNumber: number;        // snapshot
  levelNumber: number;        // snapshot
  feeMonth: Date;             // always 1st of month at midnight UTC
  dueDate: Date;
  feeAmount: number;          // historical snapshot — NEVER update after creation
  originalFeeAmount?: number;
  discountPercentage?: number;
  discountReason?: string;
  paidAmount: number;
  paymentDate?: Date;
  paymentMethod?: 'cash' | 'online' | 'card' | 'upi' | 'other';
  transactionId?: string;
  paymentScreenshot?: string;
  remarks?: string;
  updatedBy?: Types.ObjectId;
  /** Amount waived by admin. Counts toward effective payment for status calculation. Defaults to 0. */
  waivedAmount: number;
  waivedBy?: Types.ObjectId;
  waivedReason?: string;
  waivedAt?: Date;
  createdBy?: Types.ObjectId;
  createdBySource?: 'payment' | 'manual' | 'import';
  createdAt: Date;
  updatedAt: Date;
  // Virtuals
  status?: 'upcoming' | 'paid' | 'overdue' | 'partially_paid';
  remainingAmount?: number;
  paymentPercentage?: number;
}

// ── Fee calculation result ────────────────────────────────────────

export interface MonthFeeResult {
  enrollmentId: string | null;
  owedAmount: number;
  paidAmount: number;
  balanceDue: number;
  isProRated: boolean;
  proRationDetails?: { daysActive: number; daysInMonth: number; fullMonthFee: number };
  status: 'no_enrollment' | 'upcoming' | 'overdue' | 'paid' | 'partially_paid';
}

// ── Payment processing result ─────────────────────────────────────

export interface PaymentApplied {
  month: Date;
  feeRecordId: string;
  amountApplied: number;
}

export interface ProcessPaymentResult {
  applied: PaymentApplied[];
  creditUsed: number;
  creditAdded: number;
  remainingCredit: number;
}

export interface ReversalResult {
  paymentTransactionId: string;
  reversedAmount: number;       // cash un-allocated from invoices
  creditRefunded: number;       // excess credit this payment created, now clawed back
  allocationsReversed: number;  // count of PaymentAllocation rows marked reversed
  creditBalance: number;        // student's credit balance after reversal
}

// ── Upgrade result ────────────────────────────────────────────────

export interface UpgradeResult {
  success: true;
  enrollment: IEnrollment;
}

export interface UpgradeError {
  success: false;
  error: string;
}
