/**
 * STUDENT MODEL (v2)
 *
 * stage/level are denormalized numeric caches from the active Enrollment.
 * They are updated whenever the enrollment changes (upgrade, batch change, etc).
 * Source of truth for stage/level is always the Enrollment collection.
 *
 * creditBalance is the authoritative credit balance in rupees.
 * The CreditLedger collection is the audit ledger; this field is the fast-lookup balance.
 * It is updated atomically using $inc inside MongoDB sessions.
 */

import mongoose, { Schema, Types } from 'mongoose';
import type { IStudentV2 } from '../../types/v2.js';

const StudentV2Schema = new Schema<IStudentV2>({
  studentCode: {
    type: String,
    unique: true,
    trim: true,
    uppercase: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  studentName: {
    type: String,
    required: [true, 'Student name is required'],
    trim: true,
    maxlength: [100, 'Student name cannot exceed 100 characters']
  },
  dob: {
    type: String,
    trim: true,
    maxlength: [20, 'Date of birth cannot exceed 20 characters']
  },
  parentName: {
    type: String,
    trim: true,
    maxlength: [100, 'Parent name cannot exceed 100 characters']
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        if (!v) return true;
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please provide a valid email address'
    }
  },
  phone: {
    type: String,
    trim: true,
    maxlength: [20, 'Phone number cannot exceed 20 characters']
  },
  alternatePhone: {
    type: String,
    trim: true,
    maxlength: [20, 'Alternate phone number cannot exceed 20 characters']
  },
  alternateEmail: {
    type: String,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid alternate email address'
    ]
  },
  address: {
    type: String,
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters']
  },
  referredBy: {
    type: String,
    trim: true,
    maxlength: [100, 'Referred by cannot exceed 100 characters']
  },

  // ── Denormalized from active Enrollment ─────────────────────────
  courseId: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    default: null
  },
  /** Denormalized stageNumber from active Enrollment */
  stageNumber: {
    type: Number,
    min: [1, 'stageNumber must be ≥ 1'],
    default: null
  },
  /** Denormalized levelNumber from active Enrollment */
  levelNumber: {
    type: Number,
    min: [1, 'levelNumber must be ≥ 1'],
    default: null
  },
  batchId: {
    type: Schema.Types.ObjectId,
    ref: 'Batch',
    default: null
  },
  /** Points to the active Enrollment (endDate: null). Null if no active enrollment. */
  currentEnrollmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Enrollment',
    default: null
  },

  enrollmentDate: {
    type: Date,
    default: Date.now,
    required: [true, 'Enrollment date is required']
  },
  isActive: {
    type: Boolean,
    default: true,
    required: [true, 'Active status is required']
  },
  /**
   * Authoritative credit balance in rupees.
   * Updated atomically via $inc inside MongoDB sessions.
   * Never set directly — always use $inc.
   */
  creditBalance: {
    type: Number,
    required: true,
    default: 0,
    min: [0, 'creditBalance cannot be negative']
  }
}, {
  timestamps: true,
  versionKey: false
});

// ── Contact validation ──────────────────────────────────────────

StudentV2Schema.path('email').validate(function(this: IStudentV2) {
  return !!(this.email || this.phone);
}, 'At least one contact method (email or phone) is required');

StudentV2Schema.path('phone').validate(function(this: IStudentV2) {
  return !!(this.email || this.phone);
}, 'At least one contact method (email or phone) is required');

// ── Auto-generate studentCode ───────────────────────────────────

StudentV2Schema.pre('save', async function(next) {
  if (!this.studentCode) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const lastStudent = await (this.constructor as mongoose.Model<IStudentV2>)
      .findOne({ studentCode: new RegExp(`^STU-${dateStr}-`) })
      .sort({ studentCode: -1 })
      .select('studentCode');

    let sequence = 1;
    const lastCode = (lastStudent as { studentCode?: string } | null)?.studentCode;
    if (lastCode) {
      const parts = lastCode.split('-');
      const lastSeq = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastSeq)) sequence = lastSeq + 1;
    }
    this.studentCode = `STU-${dateStr}-${sequence.toString().padStart(5, '0')}`;
  }
  next();
});

// ── Indexes ─────────────────────────────────────────────────────

StudentV2Schema.index({ studentCode: 1 }, { unique: true });
StudentV2Schema.index({ userId: 1 });
StudentV2Schema.index({ email: 1 });
StudentV2Schema.index({ phone: 1 });
StudentV2Schema.index({ studentName: 1 });
StudentV2Schema.index({ createdAt: -1 });
StudentV2Schema.index({ currentEnrollmentId: 1 });
StudentV2Schema.index({ batchId: 1, isActive: 1 });
StudentV2Schema.index({ courseId: 1, stageNumber: 1, levelNumber: 1, isActive: 1 });
StudentV2Schema.index({ creditBalance: 1 });

// ── Cascade delete ──────────────────────────────────────────────

StudentV2Schema.pre('deleteOne', { document: true, query: false }, async function() {
  const studentId = this._id;
  await mongoose.model('Invoice').deleteMany({ studentId });
  await mongoose.model('PaymentTransaction').deleteMany({ studentId });
  await mongoose.model('PaymentAllocation').deleteMany({ studentId });
  await mongoose.model('CreditLedger').deleteMany({ studentId });
  await mongoose.model('Enrollment').deleteMany({ studentId });
});

StudentV2Schema.pre('deleteOne', { document: false, query: true }, async function() {
  const student = await this.model.findOne(this.getFilter()).select('_id');
  if (student) {
    await mongoose.model('Invoice').deleteMany({ studentId: student._id });
    await mongoose.model('PaymentTransaction').deleteMany({ studentId: student._id });
    await mongoose.model('PaymentAllocation').deleteMany({ studentId: student._id });
    await mongoose.model('CreditLedger').deleteMany({ studentId: student._id });
    await mongoose.model('Enrollment').deleteMany({ studentId: student._id });
  }
});

StudentV2Schema.pre('deleteMany', async function() {
  const students = await this.model.find(this.getFilter()).select('_id');
  const studentIds = students.map((s: { _id: Types.ObjectId }) => s._id);
  if (studentIds.length > 0) {
    await mongoose.model('Invoice').deleteMany({ studentId: { $in: studentIds } });
    await mongoose.model('PaymentTransaction').deleteMany({ studentId: { $in: studentIds } });
    await mongoose.model('PaymentAllocation').deleteMany({ studentId: { $in: studentIds } });
    await mongoose.model('CreditLedger').deleteMany({ studentId: { $in: studentIds } });
    await mongoose.model('Enrollment').deleteMany({ studentId: { $in: studentIds } });
  }
});

// ── Sync studentName to related records ─────────────────────────

StudentV2Schema.post('findOneAndUpdate', async function(doc) {
  if (doc) {
    const update = this.getUpdate() as Record<string, Record<string, string> | string>;
    const newName = (update?.$set as Record<string, string>)?.studentName
      || (update as Record<string, string>)?.studentName;
    if (newName) {
      await mongoose.model('Invoice').updateMany(
        { studentId: doc._id },
        { $set: { studentName: newName } }
      );
      await mongoose.model('PaymentTransaction').updateMany(
        { studentId: doc._id },
        { $set: { studentName: newName } }
      );
      await mongoose.model('CreditLedger').updateMany(
        { studentId: doc._id },
        { $set: { studentName: newName } }
      );
    }
  }
});

// ── Serialization ───────────────────────────────────────────────

StudentV2Schema.set('toJSON', {
  virtuals: true,
  transform: function(_doc: unknown, ret: any) {
    ret.id = (ret._id as Types.ObjectId)?.toString();
    delete ret._id;
    return ret;
  }
});

const StudentV2 = mongoose.model<IStudentV2>('Student', StudentV2Schema);

export default StudentV2;
