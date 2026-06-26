import mongoose, { Schema, Types, Document } from 'mongoose';

export interface IInvoice extends Document {
  studentId: Types.ObjectId;
  enrollmentId: Types.ObjectId;
  studentName: string;
  courseId: Types.ObjectId;
  stageNumber: number;
  levelNumber: number;
  invoiceMonth: Date;
  dueDate: Date;
  amount: number;
  allocatedAmount: number;
  waivedAmount: number;
  waivedBy?: Types.ObjectId;
  waivedReason?: string;
  waivedAt?: Date;
  correctionReason?: string;
  isVoid: boolean;
  voidReason?: string;
  voidedBy?: Types.ObjectId;
  voidedAt?: Date;
  createdBy?: Types.ObjectId;
  createdBySource: 'manual' | 'import' | 'billing';
  createdAt: Date;
  updatedAt: Date;
  status?: 'upcoming' | 'paid' | 'overdue' | 'partially_paid' | 'void';
  balanceDue?: number;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    stageNumber: { type: Number, required: true, min: 1 },
    levelNumber: { type: Number, required: true, min: 1 },
    invoiceMonth: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    allocatedAmount: { type: Number, required: true, min: 0, default: 0 },
    waivedAmount: { type: Number, required: true, min: 0, default: 0 },
    waivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    waivedReason: { type: String, trim: true, maxlength: 500 },
    waivedAt: { type: Date },
    correctionReason: { type: String, trim: true, maxlength: 1000 },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, trim: true, maxlength: 1000 },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBySource: {
      type: String,
      enum: ['manual', 'import', 'billing'],
      default: 'manual',
    },
  },
  { timestamps: true, versionKey: false },
);

InvoiceSchema.index(
  { studentId: 1, enrollmentId: 1, invoiceMonth: 1 },
  { unique: true, name: 'unique_student_enrollment_invoice_month' },
);
InvoiceSchema.index({ invoiceMonth: 1 });
InvoiceSchema.index({ dueDate: 1, isVoid: 1 });
InvoiceSchema.index({ courseId: 1, stageNumber: 1, levelNumber: 1, invoiceMonth: 1 });

InvoiceSchema.virtual('balanceDue').get(function () {
  if (this.isVoid) return 0;
  return Math.max(0, this.amount - this.allocatedAmount - this.waivedAmount);
});

InvoiceSchema.virtual('status').get(function () {
  if (this.isVoid) return 'void';
  const balance = Math.max(0, this.amount - this.allocatedAmount - this.waivedAmount);
  if (balance === 0) return 'paid';
  if (this.allocatedAmount > 0 || this.waivedAmount > 0) return 'partially_paid';
  if (this.dueDate < new Date()) return 'overdue';
  return 'upcoming';
});

InvoiceSchema.pre('save', function (next) {
  if (this.allocatedAmount + this.waivedAmount > this.amount) {
    next(new Error('allocatedAmount + waivedAmount cannot exceed invoice amount'));
    return;
  }
  next();
});

InvoiceSchema.set('toJSON', {
  virtuals: true,
  transform(_doc: unknown, ret: any) {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

const Invoice = mongoose.model<IInvoice>('Invoice', InvoiceSchema);
export default Invoice;
