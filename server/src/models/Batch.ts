import mongoose, { Schema } from 'mongoose';
import { IBatch } from '../types/index.js';

const ScheduleEntrySchema = new Schema({
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6,
    validate: {
      validator: Number.isInteger,
      message: 'Day of week must be an integer between 0 (Sunday) and 6 (Saturday)'
    }
  },
  startTime: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(time: string) {
        // Validate HH:MM format (24-hour)
        return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
      },
      message: 'Start time must be in HH:MM format (24-hour, e.g., 14:30)'
    }
  }
}, { _id: false });

const BatchSchema = new Schema<IBatch>({
  batchName: {
    type: String,
    required: [true, 'Batch name is required'],
    unique: true,
    trim: true,
    maxlength: [100, 'Batch name cannot exceed 100 characters']
  },
  batchCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  stage: {
    type: String,
    required: [true, 'Stage is required'],
    enum: {
      values: ['beginner', 'intermediate', 'advanced'],
      message: 'Stage must be one of: beginner, intermediate, advanced'
    },
    lowercase: true,
    trim: true
  },
  level: {
    type: Number,
    required: [true, 'Level is required'],
    enum: {
      values: [1, 2, 3],
      message: 'Level must be 1, 2, or 3'
    },
    min: [1, 'Level cannot be less than 1'],
    max: [3, 'Level cannot be greater than 3']
  },
  maxStudents: {
    type: Number,
    default: null,
    min: [1, 'Max students must be at least 1'],
    validate: {
      validator: function(value: number | null) {
        return value === null || (Number.isInteger(value) && value > 0);
      },
      message: 'Max students must be a positive integer or null'
    }
  },
  schedule: {
    type: [ScheduleEntrySchema],
    default: [],
    validate: {
      validator: function(schedule: any[]) {
        // Check for duplicate days
        const days = schedule.map(s => s.dayOfWeek);
        return days.length === new Set(days).size;
      },
      message: 'Schedule cannot have duplicate days'
    }
  },
  status: {
    type: String,
    required: true,
    enum: {
      values: ['active', 'ended', 'draft'],
      message: 'Status must be one of: active, ended, draft'
    },
    default: 'draft'
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
    default: Date.now
  },
  endDate: {
    type: Date,
    default: null
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: ''
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  }
}, {
  timestamps: true,
  versionKey: false
});

// Indexes for better query performance
BatchSchema.index({ batchName: 1 }, { unique: true });
BatchSchema.index({ batchCode: 1 }, { unique: true });
BatchSchema.index({ stage: 1, level: 1 });
BatchSchema.index({ status: 1 });
BatchSchema.index({ createdAt: -1 });

// Pre-save hook to generate batch code if not provided
BatchSchema.pre('save', function(next) {
  if (!this.batchCode) {
    // Generate batch code: STAGE_LEVEL_TIMESTAMP (e.g., BEG_1_1234567890)
    const stagePrefix = this.stage.substring(0, 3).toUpperCase();
    const timestamp = Date.now().toString().slice(-10);
    this.batchCode = `${stagePrefix}_${this.level}_${timestamp}`;
  }
  next();
});

// Custom validation: Active batches must have at least one schedule entry
BatchSchema.pre('save', function(next) {
  if (this.status === 'active' && (!this.schedule || this.schedule.length === 0)) {
    next(new Error('Active batches must have at least one schedule entry'));
  } else {
    next();
  }
});

// Virtual for student count (will be populated by service layer)
BatchSchema.virtual('currentStudentCount', {
  ref: 'Student',
  localField: '_id',
  foreignField: 'batchId',
  count: true
});

// Method to check if batch is at capacity
BatchSchema.methods.isAtCapacity = async function(): Promise<boolean> {
  if (this.maxStudents === null) return false;
  
  const Student = mongoose.model('Student');
  const count = await Student.countDocuments({ batchId: this._id, isActive: true });
  return count >= this.maxStudents;
};

// Method to check if batch can accept a student
BatchSchema.methods.canAcceptStudent = async function(): Promise<{ canAccept: boolean; reason?: string }> {
  if (this.status !== 'active') {
    return { canAccept: false, reason: 'Batch is not active' };
  }
  
  if (await this.isAtCapacity()) {
    return { canAccept: false, reason: 'Batch is at full capacity' };
  }
  
  return { canAccept: true };
};

// Cascade: Unassign students when batch is deleted
BatchSchema.pre('deleteOne', { document: true, query: false }, async function() {
  const batchId = this._id;
  await mongoose.model('Student').updateMany(
    { batchId },
    { $set: { batchId: null, batch: 'Not Assigned' } }
  );
});

// Handle query-based deleteOne
BatchSchema.pre('deleteOne', { document: false, query: true }, async function() {
  const batch = await this.model.findOne(this.getFilter()).select('_id');
  if (batch) {
    await mongoose.model('Student').updateMany(
      { batchId: batch._id },
      { $set: { batchId: null, batch: 'Not Assigned' } }
    );
  }
});

// Handle deleteMany
BatchSchema.pre('deleteMany', async function() {
  const batches = await this.model.find(this.getFilter()).select('_id');
  const batchIds = batches.map(b => b._id);
  if (batchIds.length > 0) {
    await mongoose.model('Student').updateMany(
      { batchId: { $in: batchIds } },
      { $set: { batchId: null, batch: 'Not Assigned' } }
    );
  }
});

// Ensure virtual fields are serialized
BatchSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret: any) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const Batch = mongoose.model<IBatch>('Batch', BatchSchema);

export default Batch;
