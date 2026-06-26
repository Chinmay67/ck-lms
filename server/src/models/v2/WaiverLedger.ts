import mongoose, { Schema, Types, Document } from 'mongoose';

/**
 * WaiverLedger — append-only audit trail for invoice waivers.
 *
 * Each waiver (including the waived portion of a discounted payment) is one
 * row. Invoice.waivedAmount is kept as a cached running total for fast status
 * computation, but the per-occurrence truth (who waived what, when, why) lives
 * here. Mirrors CreditLedger's shape.
 */
export interface IWaiverLedger extends Document {
  studentId: Types.ObjectId;
  studentName: string;
  invoiceId: Types.ObjectId;
  invoiceMonth: Date;
  amount: number;                 // positive ₹ waived by this single entry
  reason: string;
  waiverType: 'manual' | 'discount';   // manual = standalone waive; discount = part of a discounted payment
  paymentTransactionId?: Types.ObjectId; // set when this waiver was part of a discounted payment
  waivedBy: Types.ObjectId;
  waivedAt: Date;
  createdBySource: 'manual' | 'import' | 'payment';
  reversedAt?: Date;              // set if this waiver is nullified by an invoice void
  createdAt: Date;
  updatedAt: Date;
}

const WaiverLedgerSchema = new Schema<IWaiverLedger>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    invoiceMonth: { type: Date, required: true },
    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    waiverType: {
      type: String,
      enum: ['manual', 'discount'],
      required: true,
      default: 'manual',
      index: true,
    },
    paymentTransactionId: { type: Schema.Types.ObjectId, ref: 'PaymentTransaction', index: true },
    waivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    waivedAt: { type: Date, required: true, default: Date.now },
    createdBySource: { type: String, enum: ['manual', 'import', 'payment'], default: 'manual' },
    reversedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

WaiverLedgerSchema.index({ studentId: 1, waivedAt: -1 });
WaiverLedgerSchema.index({ paymentTransactionId: 1 });

WaiverLedgerSchema.set('toJSON', {
  transform(_doc: unknown, ret: any) {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

const WaiverLedger = mongoose.model<IWaiverLedger>('WaiverLedger', WaiverLedgerSchema);
export default WaiverLedger;
