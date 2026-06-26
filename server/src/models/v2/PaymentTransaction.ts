import mongoose, { Schema, Types, Document } from 'mongoose';

export interface IPaymentCorrection {
  field: 'transactionId' | 'paymentMethod' | 'remarks';
  oldValue?: string;
  newValue?: string;
  correctedBy: Types.ObjectId;
  correctedAt: Date;
  note?: string;
}

export interface IPaymentTransaction extends Document {
  studentId: Types.ObjectId;
  studentName: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: 'cash' | 'online' | 'card' | 'upi' | 'other';
  transactionId?: string;
  idempotencyKey?: string;
  remarks?: string;
  processedBy: Types.ObjectId;
  createdBySource: 'manual' | 'import';
  // Reversal audit (a reversed payment is never deleted; it is marked so the
  // ledger remains complete and auditable).
  isReversed?: boolean;
  reversedAt?: Date;
  reversedBy?: Types.ObjectId;
  reversalReason?: string;
  // Append-only history of metadata edits (transactionId/paymentMethod/remarks).
  // Money fields (amount, paymentDate) are never edited here — corrections to
  // those go through reverse + re-record.
  corrections?: IPaymentCorrection[];
  createdAt: Date;
  updatedAt: Date;
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    paymentDate: { type: Date, required: true, default: Date.now, index: true },
    paymentMethod: {
      type: String,
      enum: ['cash', 'online', 'card', 'upi', 'other'],
      required: true,
    },
    transactionId: { type: String, trim: true, maxlength: 200, index: true },
    idempotencyKey: { type: String, trim: true, maxlength: 200 },
    remarks: { type: String, trim: true, maxlength: 1000 },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBySource: { type: String, enum: ['manual', 'import'], default: 'manual' },
    isReversed: { type: Boolean, default: false, index: true },
    reversedAt: { type: Date },
    reversedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reversalReason: { type: String, trim: true, maxlength: 1000 },
    corrections: {
      type: [{
        field: { type: String, enum: ['transactionId', 'paymentMethod', 'remarks'], required: true },
        oldValue: { type: String, trim: true },
        newValue: { type: String, trim: true },
        correctedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        correctedAt: { type: Date, required: true, default: Date.now },
        note: { type: String, trim: true, maxlength: 500 },
      }],
      default: [],
    },
  },
  { timestamps: true, versionKey: false },
);

PaymentTransactionSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $exists: true, $type: 'string' } },
  },
);

PaymentTransactionSchema.set('toJSON', {
  transform(_doc: unknown, ret: any) {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

const PaymentTransaction = mongoose.model<IPaymentTransaction>('PaymentTransaction', PaymentTransactionSchema);
export default PaymentTransaction;
