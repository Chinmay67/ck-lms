/**
 * Batch model (v2)
 *
 * Key changes from v1:
 * - courseId (ObjectId ref) replaces the implicit "chess-only" assumption
 * - stageNumber / levelNumber (integers) replace the hard-coded stage enum +
 *   fixed 1|2|3 level enum so new stages/levels need no schema migration
 * - Cascade hooks updated to clear batchId on students when batch is removed
 */

import mongoose, { Schema } from 'mongoose';
import { IBatch } from '../../types/v2.js';

// ── Schedule entry sub-schema ─────────────────────────────────────

const ScheduleEntrySchema = new Schema(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: [0, 'dayOfWeek must be 0 (Sun) – 6 (Sat)'],
      max: [6, 'dayOfWeek must be 0 (Sun) – 6 (Sat)'],
      validate: {
        validator: Number.isInteger,
        message: 'dayOfWeek must be an integer',
      },
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (t: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(t),
        message: 'startTime must be HH:MM (24-hour, e.g. 14:30)',
      },
    },
  },
  { _id: false },
);

// ── Batch schema ──────────────────────────────────────────────────

const BatchSchema = new Schema<IBatch>(
  {
    batchName: {
      type: String,
      required: [true, 'Batch name is required'],
      trim: true,
      maxlength: [100, 'Batch name cannot exceed 100 characters'],
    },
    batchCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
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
    maxStudents: {
      type: Number,
      default: null,
      min: [1, 'maxStudents must be ≥ 1'],
      validate: {
        validator: (v: number | null) =>
          v === null || (Number.isInteger(v) && v > 0),
        message: 'maxStudents must be a positive integer or null',
      },
    },
    // Denormalized seat counter — the AUTHORITATIVE source for capacity checks.
    // Mutated only via the atomic reserveBatchSeat / releaseBatchSeat helpers in
    // feeService, which use a single conditional updateOne so two concurrent
    // enrollments cannot both grab the last seat.
    filledSeats: {
      type: Number,
      default: 0,
      min: [0, 'filledSeats must be ≥ 0'],
      validate: {
        validator: Number.isInteger,
        message: 'filledSeats must be an integer',
      },
    },
    schedule: {
      type: [ScheduleEntrySchema],
      default: [],
      validate: {
        validator(schedule: { dayOfWeek: number }[]) {
          const days = schedule.map((s) => s.dayOfWeek);
          return days.length === new Set(days).size;
        },
        message: 'Schedule cannot have duplicate days',
      },
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ['active', 'ended', 'draft'],
        message: 'status must be one of: active, ended, draft',
      },
      default: 'draft',
    },
    startDate: {
      type: Date,
      required: [true, 'startDate is required'],
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
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

BatchSchema.index({ batchName: 1 });
BatchSchema.index({ batchCode: 1 }, { unique: true });
BatchSchema.index({ courseId: 1, stageNumber: 1, levelNumber: 1 });
BatchSchema.index({ status: 1 });
BatchSchema.index({ createdAt: -1 });

// ── Pre-save hooks ────────────────────────────────────────────────

/** Auto-generate batchCode when not supplied */
BatchSchema.pre('save', function (next) {
  if (!this.batchCode) {
    const ts = Date.now().toString().slice(-10);
    // e.g. S1L2_1234567890
    this.batchCode = `S${this.stageNumber}L${this.levelNumber}_${ts}`;
  }
  next();
});

/** Active batches must have at least one schedule entry */
BatchSchema.pre('save', function (next) {
  if (this.status === 'active' && this.schedule.length === 0) {
    next(new Error('Active batches must have at least one schedule entry'));
  } else {
    next();
  }
});

// ── Virtuals ──────────────────────────────────────────────────────

BatchSchema.virtual('currentStudentCount', {
  ref: 'Student',
  localField: '_id',
  foreignField: 'batchId',
  count: true,
});

// ── Instance methods ──────────────────────────────────────────────

BatchSchema.methods.isAtCapacity = async function (): Promise<boolean> {
  if (this.maxStudents === null) return false;
  // filledSeats is the authoritative counter, kept in sync by the reserve/
  // release helpers in feeService. Re-read to avoid acting on a stale in-memory
  // value. (This is a display/pre-check helper; the authoritative enforcement
  // is the atomic conditional updateOne in reserveBatchSeat.)
  const fresh = await mongoose.model('Batch').findById(this._id).select('filledSeats maxStudents').lean() as
    | { filledSeats?: number; maxStudents?: number | null }
    | null;
  const filled = fresh?.filledSeats ?? (this as any).filledSeats ?? 0;
  const cap = fresh?.maxStudents ?? this.maxStudents;
  return cap === null ? false : filled >= cap;
};

BatchSchema.methods.canAcceptStudent = async function (): Promise<{
  canAccept: boolean;
  reason?: string;
}> {
  if (this.status !== 'active') {
    return { canAccept: false, reason: 'Batch is not active' };
  }
  if (await this.isAtCapacity()) {
    return { canAccept: false, reason: 'Batch is at full capacity' };
  }
  return { canAccept: true };
};

// ── Cascade: unassign students when batch is removed ──────────────

const unassignStudents = async (batchId: unknown) => {
  await mongoose.model('Student').updateMany(
    { batchId },
    { $set: { batchId: null } },
  );
};

BatchSchema.pre('deleteOne', { document: true, query: false }, async function () {
  await unassignStudents(this._id);
});

BatchSchema.pre('deleteOne', { document: false, query: true }, async function () {
  const batch = await this.model.findOne(this.getFilter()).select('_id');
  if (batch) await unassignStudents(batch._id);
});

BatchSchema.pre('deleteMany', async function () {
  const batches = await this.model.find(this.getFilter()).select('_id');
  const ids = batches.map((b: { _id: unknown }) => b._id);
  if (ids.length > 0) await unassignStudents({ $in: ids });
});

// ── Serialization ─────────────────────────────────────────────────

BatchSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(_doc: any, ret: any) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const Batch = mongoose.model<IBatch>('Batch', BatchSchema);

export default Batch;
