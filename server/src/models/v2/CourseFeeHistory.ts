/**
 * CourseFeeHistory (v2)
 *
 * Append-only log of every fee change for a course/stage/level combination.
 * Written whenever Course.stages[].levels[].feeAmount is updated.
 *
 * This lets the admin panel:
 *  1. Show the full fee-change timeline for any level.
 *  2. Identify students whose active enrollment.grossFee no longer matches
 *     the current course level fee ("students on old fee").
 */

import mongoose, { Schema, Types, Document } from 'mongoose';

export interface ICourseFeeHistory extends Document {
  courseId: Types.ObjectId;
  stageNumber: number;
  levelNumber: number;
  /** Fee before this change (null when this is the first-ever record for the level). */
  oldFee: number | null;
  /** New fee after this change. */
  newFee: number;
  /** Optional human-readable reason for the change. */
  reason?: string;
  /** Admin who made the change. */
  changedBy: Types.ObjectId;
  /** When the change was recorded (defaults to now). */
  changedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CourseFeeHistorySchema = new Schema<ICourseFeeHistory>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    stageNumber: {
      type: Number,
      required: true,
      min: [1, 'stageNumber must be ≥ 1'],
    },
    levelNumber: {
      type: Number,
      required: true,
      min: [1, 'levelNumber must be ≥ 1'],
    },
    oldFee: {
      type: Number,
      default: null,
    },
    newFee: {
      type: Number,
      required: true,
      min: [0, 'newFee must be ≥ 0'],
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'reason cannot exceed 500 characters'],
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

// Most common query: history for one level, newest first
CourseFeeHistorySchema.index({ courseId: 1, stageNumber: 1, levelNumber: 1, changedAt: -1 });

CourseFeeHistorySchema.set('toJSON', {
  transform(_doc: unknown, ret: any) {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

const CourseFeeHistory = mongoose.model<ICourseFeeHistory>('CourseFeeHistory', CourseFeeHistorySchema);
export default CourseFeeHistory;
