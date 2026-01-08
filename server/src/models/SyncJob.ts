import mongoose, { Schema } from 'mongoose';
import { ISyncJob } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

const SyncJobSchema = new Schema<ISyncJob>({
  jobId: {
    type: String,
    required: true,
    default: () => uuidv4()
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    required: true
  },
  startTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  lastProcessedEmailDate: {
    type: Date
  },
  emailsProcessed: {
    type: Number,
    default: 0,
    min: 0
  },
  studentsCreated: {
    type: Number,
    default: 0,
    min: 0
  },
  studentsUpdated: {
    type: Number,
    default: 0,
    min: 0
  },
  errorLogs: [{
    type: String
  }],
  metadata: {
    totalEmails: {
      type: Number,
      default: 0,
      min: 0
    },
    successfulParsing: {
      type: Number,
      default: 0,
      min: 0
    },
    failedParsing: {
      type: Number,
      default: 0,
      min: 0
    }
  }
}, {
  timestamps: true,
  versionKey: false
});

// Indexes for better query performance
SyncJobSchema.index({ jobId: 1 }, { unique: true });
SyncJobSchema.index({ status: 1 });
SyncJobSchema.index({ startTime: -1 });
SyncJobSchema.index({ createdAt: -1 });

// Virtual for duration calculation
SyncJobSchema.virtual('duration').get(function() {
  if (this.endTime && this.startTime) {
    return this.endTime.getTime() - this.startTime.getTime();
  }
  return null;
});

// Virtual for success rate
SyncJobSchema.virtual('successRate').get(function() {
  if (this.metadata && this.metadata.totalEmails > 0) {
    return (this.metadata.successfulParsing / this.metadata.totalEmails) * 100;
  }
  return 0;
});

// Instance methods
SyncJobSchema.methods.markAsRunning = function() {
  this.status = 'running';
  this.startTime = new Date();
  return this.save();
};

SyncJobSchema.methods.markAsCompleted = function() {
  this.status = 'completed';
  this.endTime = new Date();
  return this.save();
};

SyncJobSchema.methods.markAsFailed = function(error: string) {
  this.status = 'failed';
  this.endTime = new Date();
  this.errorLogs.push(error);
  return this.save();
};

SyncJobSchema.methods.addError = function(error: string) {
  this.errorLogs.push(error);
  return this.save();
};

// Static methods
SyncJobSchema.statics.getLatestJob = function() {
  return this.findOne().sort({ createdAt: -1 });
};

SyncJobSchema.statics.getRunningJobs = function() {
  return this.find({ status: 'running' });
};

// Ensure virtual fields are serialized
SyncJobSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret: any) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const SyncJob = mongoose.model<ISyncJob>('SyncJob', SyncJobSchema);

export default SyncJob;
