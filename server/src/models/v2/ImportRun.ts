import mongoose, { Schema, Types, Document } from 'mongoose';

export interface IImportIssue {
  rowNumber?: number;
  severity: 'warning' | 'error';
  code: string;
  message: string;
  rawName?: string;
}

export interface IImportRun extends Document {
  fileName: string;
  mode: 'dry-run' | 'apply';
  status: 'running' | 'completed' | 'failed';
  totalRows: number;
  createdStudents: number;
  createdBatches: number;
  createdEnrollments: number;
  createdInvoices: number;
  createdPayments: number;
  createdCredits: number;
  skippedRows: number;
  issues: IImportIssue[];
  startedBy: Types.ObjectId;
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ImportIssueSchema = new Schema<IImportIssue>(
  {
    rowNumber: Number,
    severity: { type: String, enum: ['warning', 'error'], required: true },
    code: { type: String, required: true },
    message: { type: String, required: true },
    rawName: String,
  },
  { _id: false },
);

const ImportRunSchema = new Schema<IImportRun>(
  {
    fileName: { type: String, required: true },
    mode: { type: String, enum: ['dry-run', 'apply'], required: true },
    status: { type: String, enum: ['running', 'completed', 'failed'], required: true, default: 'running' },
    totalRows: { type: Number, default: 0 },
    createdStudents: { type: Number, default: 0 },
    createdBatches: { type: Number, default: 0 },
    createdEnrollments: { type: Number, default: 0 },
    createdInvoices: { type: Number, default: 0 },
    createdPayments: { type: Number, default: 0 },
    createdCredits: { type: Number, default: 0 },
    skippedRows: { type: Number, default: 0 },
    issues: { type: [ImportIssueSchema], default: [] },
    startedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
    error: String,
  },
  { timestamps: true, versionKey: false },
);

ImportRunSchema.index({ startedAt: -1 });

const ImportRun = mongoose.model<IImportRun>('ImportRun', ImportRunSchema);
export default ImportRun;
