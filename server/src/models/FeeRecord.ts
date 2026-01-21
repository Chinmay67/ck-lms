import mongoose, { Schema } from 'mongoose';
import { IFeeRecord } from '../types/index.js';

const FeeRecordSchema = new Schema<IFeeRecord>({
  studentId: {
    type: Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Student ID is required']
  },
  studentName: {
    type: String,
    required: [true, 'Student name is required'],
    trim: true,
    maxlength: [100, 'Student name cannot exceed 100 characters']
  },
  stage: {
    type: String,
    enum: {
      values: ['beginner', 'intermediate', 'advanced'],
      message: 'Stage must be one of: beginner, intermediate, advanced'
    },
    required: [true, 'Stage is required'],
    lowercase: true,
    trim: true
  },
  level: {
    type: Number,
    enum: {
      values: [1, 2, 3],
      message: 'Level must be 1, 2, or 3'
    },
    required: [true, 'Level is required'],
    min: [1, 'Level cannot be less than 1'],
    max: [3, 'Level cannot be greater than 3']
  },
  feeMonth: {
    type: String,
    required: [true, 'Fee month is required'],
    trim: true,
    maxlength: [50, 'Fee month cannot exceed 50 characters']
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  feeAmount: {
    type: Number,
    required: [true, 'Fee amount is required'],
    min: [0, 'Fee amount cannot be negative']
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: [0, 'Paid amount cannot be negative']
  },
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: {
      values: ['cash', 'online', 'card', 'upi', 'other'],
      message: 'Payment method must be one of: cash, online, card, upi, other'
    },
    lowercase: true,
    trim: true
  },
  transactionId: {
    type: String,
    trim: true,
    maxlength: [100, 'Transaction ID cannot exceed 100 characters']
  },
  paymentScreenshot: {
    type: String,
    trim: true // URL for future use
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: [500, 'Remarks cannot exceed 500 characters']
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  versionKey: false
});

// Indexes for better query performance
FeeRecordSchema.index({ studentId: 1 });
FeeRecordSchema.index({ studentName: 1 });
FeeRecordSchema.index({ stage: 1, level: 1 });
FeeRecordSchema.index({ dueDate: 1 });
FeeRecordSchema.index({ paymentDate: 1 });
FeeRecordSchema.index({ transactionId: 1 });
FeeRecordSchema.index({ createdAt: -1 });

// Compound indexes for common queries (optimized for computed status)
FeeRecordSchema.index({ studentId: 1, dueDate: 1 });
FeeRecordSchema.index({ studentId: 1, paymentDate: 1 });
FeeRecordSchema.index({ studentId: 1, feeMonth: 1 }, { unique: true });
FeeRecordSchema.index({ dueDate: 1, paymentDate: 1 });

// Virtual for remaining amount
FeeRecordSchema.virtual('remainingAmount').get(function() {
  return this.feeAmount - this.paidAmount;
});

// Virtual for payment status percentage
FeeRecordSchema.virtual('paymentPercentage').get(function() {
  if (this.feeAmount === 0) return 0;
  return Math.round((this.paidAmount / this.feeAmount) * 100);
});

// Virtual for computed status (calculated dynamically based on dates and payment)
FeeRecordSchema.virtual('status').get(function() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  if (this.paymentDate) {
    // If payment date exists, check if fully paid or partially paid
    return this.paidAmount >= this.feeAmount ? 'paid' : 'partially_paid';
  } else {
    // No payment date - check if overdue or upcoming
    return this.dueDate < now ? 'overdue' : 'upcoming';
  }
});

FeeRecordSchema.pre('deleteOne', { document: true, query: false }, async function() {
  const StudentCredit = mongoose.models.StudentCredit;
  if (!StudentCredit) return;

  await StudentCredit.updateMany(
    { feeRecordId: this._id },
    { $unset: { feeRecordId: 1 } }
  );
});

FeeRecordSchema.pre('deleteOne', { document: false, query: true }, async function() {
  const StudentCredit = mongoose.models.StudentCredit;
  if (!StudentCredit) return;

  const feeRecord = await this.model.findOne(this.getFilter()).select('_id');
  if (!feeRecord) return;

  await StudentCredit.updateMany(
    { feeRecordId: feeRecord._id },
    { $unset: { feeRecordId: 1 } }
  );
});

FeeRecordSchema.pre('deleteMany', async function() {
  const StudentCredit = mongoose.models.StudentCredit;
  if (!StudentCredit) return;

  const feeRecords = await this.model.find(this.getFilter()).select('_id');
  const feeRecordIds = feeRecords.map(f => f._id);
  if (!feeRecordIds.length) return;

  await StudentCredit.updateMany(
    { feeRecordId: { $in: feeRecordIds } },
    { $unset: { feeRecordId: 1 } }
  );
});


// Ensure virtual fields are serialized
FeeRecordSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret: any) {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  }
});

const FeeRecord = mongoose.model<IFeeRecord>('FeeRecord', FeeRecordSchema);

export default FeeRecord;
