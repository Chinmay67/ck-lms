import mongoose, { Schema, Types, Document } from 'mongoose';

export interface ICreditLedger extends Document {
  studentId: Types.ObjectId;
  studentName: string;
  type: 'credit_added' | 'credit_used' | 'credit_refund' | 'credit_adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  paymentTransactionId?: Types.ObjectId;
  invoiceId?: Types.ObjectId;
  processedBy: Types.ObjectId;
  processedAt: Date;
  createdBySource: 'manual' | 'import' | 'payment';
  createdAt: Date;
  updatedAt: Date;
}

const CreditLedgerSchema = new Schema<ICreditLedger>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['credit_added', 'credit_used', 'credit_refund', 'credit_adjustment'],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    paymentTransactionId: { type: Schema.Types.ObjectId, ref: 'PaymentTransaction' },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    processedAt: { type: Date, required: true, default: Date.now },
    createdBySource: { type: String, enum: ['manual', 'import', 'payment'], default: 'manual' },
  },
  { timestamps: true, versionKey: false },
);

CreditLedgerSchema.index({ studentId: 1, processedAt: -1 });

CreditLedgerSchema.set('toJSON', {
  transform(_doc: unknown, ret: any) {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

const CreditLedger = mongoose.model<ICreditLedger>('CreditLedger', CreditLedgerSchema);
export default CreditLedger;
