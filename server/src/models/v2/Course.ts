/**
 * Course model (v2)
 *
 * Hierarchy: Course → Stage → Level
 *
 * A Stage has a configurable name (e.g. "Beginner", "Intermediate") and
 * an ordered list of Levels, each carrying its own fee and duration.
 * Both stageNumber and levelNumber are 1-based integers so the schema
 * never needs to be changed when the club adds / renames stages.
 */

import mongoose, { Schema } from 'mongoose';
import { ICourse } from '../../types/v2.js';

// ── Level sub-schema ──────────────────────────────────────────────

const CourseLevelSchema = new Schema(
  {
    levelNumber: {
      type: Number,
      required: true,
      min: [1, 'levelNumber must be ≥ 1'],
    },
    feeAmount: {
      type: Number,
      required: true,
      min: [0, 'feeAmount must be ≥ 0'],
    },
    // Legacy — kept optional for backward compat; use durationMonthsMin/Max instead
    durationMonths: {
      type: Number,
      min: [1, 'durationMonths must be ≥ 1'],
      default: null,
    },
    durationMonthsMin: {
      type: Number,
      min: [1, 'durationMonthsMin must be ≥ 1'],
      default: null,
    },
    durationMonthsMax: {
      type: Number,
      min: [1, 'durationMonthsMax must be ≥ 1'],
      default: null,
    },
    approximateHours: {
      type: Number,
      min: 0,
      default: 0,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Level description cannot exceed 500 characters'],
    },
  },
  { _id: false },
);

// ── Stage sub-schema ──────────────────────────────────────────────

const CourseStageSchema = new Schema(
  {
    stageNumber: {
      type: Number,
      required: true,
      min: [1, 'stageNumber must be ≥ 1'],
    },
    stageName: {
      type: String,
      required: [true, 'stageName is required'],
      trim: true,
      maxlength: [100, 'stageName cannot exceed 100 characters'],
    },
    levels: {
      type: [CourseLevelSchema],
      default: [],
      validate: {
        validator(levels: { levelNumber: number }[]) {
          // levelNumbers must be unique and sequential from 1
          const nums = levels.map((l) => l.levelNumber).sort((a, b) => a - b);
          return nums.every((n, i) => n === i + 1);
        },
        message: 'Level numbers within a stage must be sequential starting from 1',
      },
    },
  },
  { _id: false },
);

// ── Course schema ─────────────────────────────────────────────────

const CourseSchema = new Schema<ICourse>(
  {
    courseName: {
      type: String,
      required: [true, 'Course name is required'],
      lowercase: true,
      trim: true,
      unique: true,
      maxlength: [50, 'Course name cannot exceed 50 characters'],
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      maxlength: [100, 'Display name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    stages: {
      type: [CourseStageSchema],
      default: [],
      validate: {
        validator(stages: { stageNumber: number }[]) {
          // stageNumbers must be unique and sequential from 1
          const nums = stages.map((s) => s.stageNumber).sort((a, b) => a - b);
          return nums.every((n, i) => n === i + 1);
        },
        message: 'Stage numbers must be sequential starting from 1',
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ── Indexes ───────────────────────────────────────────────────────

CourseSchema.index({ courseName: 1 }, { unique: true });
CourseSchema.index({ isActive: 1 });
CourseSchema.index({ displayOrder: 1 });

// ── Virtuals ──────────────────────────────────────────────────────

CourseSchema.virtual('numberOfStages').get(function () {
  return this.stages.length;
});

// ── Instance methods ──────────────────────────────────────────────

/** Return the fee for (stageNumber, levelNumber), or null if not found */
CourseSchema.methods.getFeeForLevel = function (
  stageNumber: number,
  levelNumber: number,
): number | null {
  const stage = this.stages.find(
    (s: { stageNumber: number }) => s.stageNumber === stageNumber,
  );
  if (!stage) return null;
  const level = stage.levels.find(
    (l: { levelNumber: number }) => l.levelNumber === levelNumber,
  );
  return level ? level.feeAmount : null;
};

/** Return true if (stageNumber, levelNumber) exists in this course */
CourseSchema.methods.hasLevel = function (
  stageNumber: number,
  levelNumber: number,
): boolean {
  const stage = this.stages.find(
    (s: { stageNumber: number }) => s.stageNumber === stageNumber,
  );
  if (!stage) return false;
  return stage.levels.some(
    (l: { levelNumber: number }) => l.levelNumber === levelNumber,
  );
};

// ── Serialization ─────────────────────────────────────────────────

CourseSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(_doc: any, ret: any) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const Course = mongoose.model<ICourse>('Course', CourseSchema);

export default Course;
