/**
 * FeeRecord model (v2)
 *
 * One document per student per calendar month per enrollment.
 *
 * Design rules:
 *  1. feeAmount is a FROZEN snapshot of (enrollment.monthlyFee), possibly
 *     pro-rated for the join/upgrade month.  Never update after creation.
 *  2. paidAmount accumulates payments.  When paidAmount >= feeAmount the
 *     record is 'paid'.
 *  3. status is a computed virtual (not stored) to avoid stale flag issues.
 *  4. Linked to an Enrollment so fee history survives stage/level changes.
 */

import mongoose, { Schema } from 'mongoose';
import { IFeeRecordV2 } from '../../types/v2.js';

const FeeRecordSchema = new Schema<IFeeRecordV2>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'studentId is required'],
      index: true,
    },
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: [true, 'enrollmentId is required'],
      index: true,
    },
    studentName: {
      type: String,
      required: [true, 'studentName is required'],
      trim: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'courseId is required'],
    },
    stageNumber: {
      type: Number,
      required: [true, 'stageNumber is required'],
      min: [1, 'stageNumber must be ≥ 1'],
    },
    levelNumber: {
      type: Number,
      required: [true, 'levelNumber is required'],
      min: [1, 'levelNumber must be ≥ 1'],
    },
    /**
     * Always the 1st of the month at 00:00:00 UTC.
     * Use as the canonical key for "which month is this record for".
     */
    feeMonth: {
      type: Date,
      required: [true, 'feeMonth is required'],
    },
    dueDate: {
      type: Date,
      required: [true, 'dueDate is required'],
    },
    /**
     * Effective fee for this month (possibly pro-rated).
     * Frozen at creation — never updated.
     */
    feeAmount: {
      type: Number,
      required: [true, 'feeAmount is required'],
      min: [0, 'feeAmount must be ≥ 0'],
    },
    /** Full (non-pro-rated) monthly fee before proration — for display only */
    originalFeeAmount: {
      type: Number,
      min: 0,
    },
    discountPercentage: {
      type: Number,
      min: [0, 'discountPercentage must be ≥ 0'],
      max: [100, 'discountPercentage must be ≤ 100'],
      default: 0,
    },
    discountReason: {
      type: String,
      trim: true,
      maxlength: [500, 'discountReason cannot exceed 500 characters'],
      default: '',
    },
    /** Cumulative amount paid against this record */
    paidAmount: {
      type: Number,
      required: true,
      min: [0, 'paidAmount must be ≥ 0'],
      default: 0,
    },
    paymentDate: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['cash', 'online', 'card', 'upi', 'other'],
        message: 'paymentMethod must be one of: cash, online, card, upi, other',
      },
    },
    transactionId: {
      type: String,
      trim: true,
      maxlength: [200, 'transactionId cannot exceed 200 characters'],
    },
    paymentScreenshot: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [1000, 'remarks cannot exceed 1000 characters'],
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    /** Amount waived by admin (in rupees). Counts toward effective payment. */
    waivedAmount: {
      type: Number,
      default: 0,
      min: [0, 'waivedAmount must be ≥ 0'],
    },
    waivedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    waivedReason: {
      type: String,
      trim: true,
      maxlength: [500, 'waivedReason cannot exceed 500 characters'],
    },
    waivedAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    /** How this record was created */
    createdBySource: {
      type: String,
      enum: ['payment', 'manual', 'import'],
      default: 'manual',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ── Indexes ───────────────────────────────────────────────────────

/** Primary lookup: student's fee record for a specific month */
FeeRecordSchema.index(
  { studentId: 1, feeMonth: 1, enrollmentId: 1 },
  { unique: true, name: 'unique_student_month_enrollment' },
);

/** All records for an enrollment (enrollment history view) */
FeeRecordSchema.index({ enrollmentId: 1, feeMonth: 1 });

/** Dashboard queries — unpaid records by due date */
FeeRecordSchema.index({ dueDate: 1, paidAmount: 1 });

/** Course / stage / level reporting */
FeeRecordSchema.index({ courseId: 1, stageNumber: 1, levelNumber: 1, feeMonth: 1 });

/** Date range queries */
FeeRecordSchema.index({ feeMonth: 1 });

// ── Virtuals ──────────────────────────────────────────────────────

/**
 * status — computed from paidAmount vs feeAmount vs dueDate.
 * Never stored; always re-evaluated on read.
 *
 *   upcoming       → due in the future and not yet paid
 *   paid           → paidAmount >= feeAmount
 *   partially_paid → 0 < paidAmount < feeAmount (regardless of due date)
 *   overdue        → paidAmount === 0 and dueDate has passed
 */
FeeRecordSchema.virtual('status').get(function () {
  const now = new Date();
  const effectivePaid = this.paidAmount + (this.waivedAmount ?? 0);
  if (effectivePaid >= this.feeAmount) return 'paid';
  if (this.paidAmount > 0) return 'partially_paid';
  if (this.dueDate > now) return 'upcoming';
  return 'overdue';
});

FeeRecordSchema.virtual('remainingAmount').get(function () {
  return Math.max(0, this.feeAmount - this.paidAmount - (this.waivedAmount ?? 0));
});

FeeRecordSchema.virtual('paymentPercentage').get(function () {
  if (this.feeAmount === 0) return 100;
  return Math.min(100, Math.round((this.paidAmount / this.feeAmount) * 100));
});

// ── Pre-save guard ────────────────────────────────────────────────

FeeRecordSchema.pre('save', function (next) {
  if (this.paidAmount > this.feeAmount) {
    next(new Error(
      `paidAmount (${this.paidAmount}) cannot exceed feeAmount (${this.feeAmount}). Route excess to StudentCredit.`
    ));
    return;
  }
  const waived = this.waivedAmount ?? 0;
  if (this.paidAmount + waived > this.feeAmount) {
    next(new Error(
      `paidAmount + waivedAmount (${this.paidAmount + waived}) cannot exceed feeAmount (${this.feeAmount}).`
    ));
    return;
  }
  next();
});

// ── Serialization ─────────────────────────────────────────────────

FeeRecordSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(_doc: any, ret: any) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const FeeRecord = mongoose.model<IFeeRecordV2>('FeeRecord', FeeRecordSchema);

export default FeeRecord;
