/**
 * Enrollment model (v2)
 *
 * An Enrollment is the authoritative record of "which student is in which
 * course/stage/level, from when, at what fee".
 *
 * Design rules:
 *  1. Only ONE active enrollment (endDate === null) per student at a time.
 *  2. When a student upgrades, changes batch, or leaves:
 *     - Set endDate + endReason on the current enrollment.
 *     - Insert a new enrollment with a new startDate (and the new fee snapshot).
 *  3. monthlyFee is a snapshot — never modify it after creation.
 *     Fee changes only take effect in the NEXT enrollment.
 *  4. Pro-ration is computed by the FeeService using startDate; it is NOT
 *     stored here (no lossy rounding stored in the source of truth).
 *  5. batchId may be null while the student is enrolled but awaiting batch
 *     assignment (fees still accrue from startDate).
 */

import mongoose, { Schema } from 'mongoose';
import { IEnrollment } from '../../types/v2.js';

const EnrollmentSchema = new Schema<IEnrollment>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'studentId is required'],
      index: true,
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'Batch',
      default: null,
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
      validate: {
        validator: Number.isInteger,
        message: 'stageNumber must be an integer',
      },
    },
    levelNumber: {
      type: Number,
      required: [true, 'levelNumber is required'],
      min: [1, 'levelNumber must be ≥ 1'],
      validate: {
        validator: Number.isInteger,
        message: 'levelNumber must be an integer',
      },
    },
    /**
     * Effective monthly fee IN PAISE at the time this enrollment was created.
     * Already has discount applied:  effectiveFee = grossFee * (1 - discountPct/100)
     * This value is FROZEN — never update it.  Create a new enrollment instead.
     */
    monthlyFee: {
      type: Number,
      required: [true, 'monthlyFee is required'],
      min: [0, 'monthlyFee must be ≥ 0'],
    },
    /** Original fee from the course level before any discount. Snapshot. */
    grossFee: {
      type: Number,
      required: [true, 'grossFee is required'],
      min: [0, 'grossFee must be ≥ 0'],
    },
    /** 'none' | 'percentage' | 'fixed' */
    discountType: {
      type: String,
      enum: ['none', 'percentage', 'fixed'],
      default: 'none',
    },
    /** Percentage discount granted (0–100). Used when discountType === 'percentage'. */
    discountPct: {
      type: Number,
      required: true,
      min: [0, 'discountPct must be ≥ 0'],
      max: [100, 'discountPct must be ≤ 100'],
      default: 0,
    },
    /** Fixed ₹ amount off. Used when discountType === 'fixed'. */
    discountAmount: {
      type: Number,
      min: [0, 'discountAmount must be ≥ 0'],
      default: 0,
    },
    /** Human-readable reason for the discount (optional). */
    discountReason: {
      type: String,
      trim: true,
      maxlength: [500, 'discountReason cannot exceed 500 characters'],
      default: '',
    },
    /**
     * True when the admin manually set a fee different from the course level fee
     * and did not use the discount fields to explain the difference.
     * Acts as an audit flag — the effective monthlyFee is still correct.
     */
    feeOverridden: {
      type: Boolean,
      default: false,
    },
    /**
     * The date from which fee obligations begin (inclusive).
     * For mid-month joins the FeeService will pro-rate the first month.
     */
    startDate: {
      type: Date,
      required: [true, 'startDate is required'],
    },
    /**
     * Null while the enrollment is active.
     * Set when the enrollment is closed (upgrade / batch change / left / paused).
     */
    endDate: {
      type: Date,
      default: null,
    },
    /**
     * Why this enrollment ended.  Null while active.
     * - upgraded    → student moved to a higher stage/level
     * - batch_change → same stage/level, different batch
     * - left         → student left the club
     * - inactive     → admin marked inactive (no billing)
     * - paused       → temporarily paused (no billing during pause)
     */
    endReason: {
      type: String,
      enum: {
        values: ['upgraded', 'batch_change', 'fee_change', 'left', 'inactive', 'paused'],
        message:
          'endReason must be one of: upgraded, batch_change, fee_change, left, inactive, paused',
      },
      default: null,
    },
    /**
     * When endReason === 'paused', the date the student is expected to resume.
     * Null for all other end reasons.
     */
    pausedUntil: {
      type: Date,
      default: null,
    },
    /**
     * When true, this student is intentionally kept on their current fee
     * regardless of future course-level fee changes.
     * The fee-divergence report will exclude grandfathered enrollments.
     * An admin must explicitly set this — it is never set automatically.
     */
    feeGrandfathered: {
      type: Boolean,
      default: false,
    },
    /**
     * Optional note explaining why the fee was grandfathered or amended.
     * Updated by amend-fee and grandfather endpoints.
     */
    feeNote: {
      type: String,
      trim: true,
      maxlength: [500, 'feeNote cannot exceed 500 characters'],
      default: '',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'createdBy is required'],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ── Indexes ───────────────────────────────────────────────────────

/** Fast lookup of all enrollments for a student (history view) */
EnrollmentSchema.index({ studentId: 1, startDate: -1 });

/** Fast lookup of the active enrollment for a student */
EnrollmentSchema.index(
  { studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { endDate: null },
    name: 'active_enrollment_per_student',
  },
);

/** Batch membership queries */
EnrollmentSchema.index({ batchId: 1, endDate: 1 });

/** Course + stage + level reporting */
EnrollmentSchema.index({ courseId: 1, stageNumber: 1, levelNumber: 1, endDate: 1 });

// ── Validation ────────────────────────────────────────────────────

/** endDate must be >= startDate when set (same-day transitions allowed) */
EnrollmentSchema.pre('save', function (next) {
  if (this.endDate !== null && this.endDate < this.startDate) {
    next(new Error('endDate cannot be before startDate'));
  } else {
    next();
  }
});

/** endReason must be set iff endDate is set */
EnrollmentSchema.pre('save', function (next) {
  const hasEndDate = this.endDate !== null;
  const hasEndReason = this.endReason !== null;
  if (hasEndDate && !hasEndReason) {
    next(new Error('endReason is required when endDate is set'));
  } else if (!hasEndDate && hasEndReason) {
    next(new Error('endReason must be null when endDate is null (enrollment is active)'));
  } else {
    next();
  }
});

// ── Virtuals ──────────────────────────────────────────────────────

EnrollmentSchema.virtual('isActive').get(function () {
  return this.endDate === null;
});

// ── Serialization ─────────────────────────────────────────────────

EnrollmentSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(_doc: any, ret: any) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const Enrollment = mongoose.model<IEnrollment>('Enrollment', EnrollmentSchema);

export default Enrollment;
