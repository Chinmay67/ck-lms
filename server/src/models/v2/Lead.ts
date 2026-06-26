import mongoose, { Schema, Document, Types } from 'mongoose';

export type LeadStatus = 'new' | 'contacted' | 'follow-up' | 'converted' | 'dropped';
export type LeadSource = 'walk-in' | 'referral' | 'online' | 'social-media' | 'phone-call' | 'other';

export interface ILead extends Document {
  // Contact (parent / guardian)
  name: string;
  phone?: string;
  email?: string;
  // Child info
  childName?: string;
  childAge?: number;
  // Interest
  interestedCourseId?: Types.ObjectId;
  interestedStageName?: string;   // free text so we don't need a course to exist yet
  // Lead metadata
  source: LeadSource;
  status: LeadStatus;
  notes?: string;
  followUpDate?: Date;
  // Audit
  assignedTo?: Types.ObjectId;
  convertedStudentId?: Types.ObjectId;
  convertedAt?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, 'Phone cannot exceed 20 characters'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      validate: {
        validator(v: string) {
          if (!v) return true;
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        },
        message: 'Please provide a valid email address',
      },
    },
    childName: {
      type: String,
      trim: true,
      maxlength: [100, 'Child name cannot exceed 100 characters'],
    },
    childAge: {
      type: Number,
      min: [0, 'Age cannot be negative'],
      max: [30, 'Age seems too high'],
    },
    interestedCourseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
    },
    interestedStageName: {
      type: String,
      trim: true,
      maxlength: [100, 'Stage name cannot exceed 100 characters'],
    },
    source: {
      type: String,
      enum: ['walk-in', 'referral', 'online', 'social-media', 'phone-call', 'other'],
      default: 'other',
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'follow-up', 'converted', 'dropped'],
      default: 'new',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    followUpDate: {
      type: Date,
      default: null,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    convertedStudentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    convertedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);

// ── Validation: at least phone or email ───────────────────────────

LeadSchema.path('phone').validate(function (this: ILead) {
  return !!(this.phone || this.email);
}, 'At least one contact method (phone or email) is required');

// ── Indexes ───────────────────────────────────────────────────────

LeadSchema.index({ status: 1 });
LeadSchema.index({ source: 1 });
LeadSchema.index({ followUpDate: 1 });
LeadSchema.index({ convertedStudentId: 1 });
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({
  name: 'text',
  phone: 'text',
  email: 'text',
  childName: 'text',
});

// ── Serialization ─────────────────────────────────────────────────

LeadSchema.set('toJSON', {
  virtuals: true,
  transform(_doc: unknown, ret: any) {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

const Lead = mongoose.model<ILead>('Lead', LeadSchema);
export default Lead;
