import mongoose, { Schema, Document } from 'mongoose';

export interface IStudentCredit extends Document {
  studentId: mongoose.Types.ObjectId;
  studentName: string;
  transactionType: 'credit_added' | 'credit_used' | 'credit_refund' | 'credit_adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  paymentMethod?: 'cash' | 'online' | 'card' | 'upi' | 'other';
  transactionId?: string;
  feeRecordId?: mongoose.Types.ObjectId;
  feeMonth?: string;
  dueDate?: Date;
  paidDate?: Date;
  processedBy: mongoose.Types.ObjectId;
  processedAt: Date;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StudentCreditSchema = new Schema<IStudentCredit>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true
    },
    studentName: {
      type: String,
      required: true
    },
    transactionType: {
      type: String,
      enum: ['credit_added', 'credit_used', 'credit_refund', 'credit_adjustment'],
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true
    },
    balanceBefore: {
      type: Number,
      required: true,
      default: 0
    },
    balanceAfter: {
      type: Number,
      required: true,
      default: 0
    },
    description: {
      type: String,
      required: true
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'online', 'card', 'upi', 'other']
    },
    transactionId: {
      type: String,
      index: true
    },
    feeRecordId: {
      type: Schema.Types.ObjectId,
      ref: 'FeeRecord'
    },
    feeMonth: {
      type: String
    },
    dueDate: {
      type: Date
    },
    paidDate: {
      type: Date
    },
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    processedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    remarks: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient balance calculation
StudentCreditSchema.index({ studentId: 1, createdAt: -1 });

// Index for transaction queries
StudentCreditSchema.index({ transactionType: 1, processedAt: -1 });

export default
  mongoose.models.StudentCredit ||
  mongoose.model('StudentCredit', StudentCreditSchema);