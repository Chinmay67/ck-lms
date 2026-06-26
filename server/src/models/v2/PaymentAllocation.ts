import mongoose, { Schema, Types, Document } from 'mongoose';

export interface IPaymentAllocation extends Document {
  studentId: Types.ObjectId;
  invoiceId?: Types.ObjectId;
  paymentTransactionId?: Types.ObjectId;
  creditLedgerId?: Types.ObjectId;
  amount: number;
  allocationType: 'payment' | 'credit';
  allocatedAt: Date;
  allocatedBy: Types.ObjectId;
  // Reversal audit: a reversed allocation is marked (not deleted) so the
  // allocation history remains auditable.
  isReversed?: boolean;
  reversedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentAllocationSchema = new Schema<IPaymentAllocation>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
    paymentTransactionId: { type: Schema.Types.ObjectId, ref: 'PaymentTransaction', index: true },
    creditLedgerId: { type: Schema.Types.ObjectId, ref: 'CreditLedger', index: true },
    amount: { type: Number, required: true, min: 1 },
    allocationType: { type: String, enum: ['payment', 'credit'], required: true },
    allocatedAt: { type: Date, required: true, default: Date.now },
    allocatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isReversed: { type: Boolean, default: false },
    reversedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

PaymentAllocationSchema.pre('validate', function (next) {
  if (!this.paymentTransactionId && !this.creditLedgerId) {
    next(new Error('Payment allocation must reference a payment transaction or credit ledger entry'));
    return;
  }
  next();
});

PaymentAllocationSchema.set('toJSON', {
  transform(_doc: unknown, ret: any) {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

const PaymentAllocation = mongoose.model<IPaymentAllocation>('PaymentAllocation', PaymentAllocationSchema);
export default PaymentAllocation;
