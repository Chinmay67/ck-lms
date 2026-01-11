import mongoose, { Schema } from 'mongoose';
import { IStudent } from '../types/index.js';

const StudentSchema = new Schema<IStudent>({
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
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
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
  combinedSkill: {
    type: String,
    trim: true,
    maxlength: [100, 'Combined skill cannot exceed 100 characters']
  },
  // DEPRECATED: Use stage and level instead (kept for backward compatibility during migration)
  skillCategory: {
    type: String,
    enum: {
      values: ['beginner', 'intermediate', 'advanced'],
      message: 'Skill category must be one of: beginner, intermediate, advanced'
    },
    lowercase: true,
    trim: true
  },
  // DEPRECATED: Use stage and level instead (kept for backward compatibility during migration)
  skillLevel: {
    type: Number,
    enum: {
      values: [1, 2, 3],
      message: 'Skill level must be 1, 2, or 3'
    },
    min: [1, 'Skill level cannot be less than 1'],
    max: [3, 'Skill level cannot be greater than 3']
  },
  // STANDARDIZED FIELDS: Use these instead of skillCategory/skillLevel
  stage: {
    type: String,
    required: [true, 'Stage is required'],
    enum: {
      values: ['beginner', 'intermediate', 'advanced'],
      message: 'Stage must be one of: beginner, intermediate, advanced'
    },
    lowercase: true,
    trim: true
  },
  level: {
    type: Number,
    required: [true, 'Level is required'],
    enum: {
      values: [1, 2, 3],
      message: 'Level must be 1, 2, or 3'
    },
    min: [1, 'Level cannot be less than 1'],
    max: [3, 'Level cannot be greater than 3']
  },
  batch: {
    type: String,
    default: 'Not Assigned',
    trim: true,
    maxlength: [100, 'Batch cannot exceed 100 characters']
  },
  batchId: {
    type: Schema.Types.ObjectId,
    ref: 'Batch',
    default: null
  },
  referredBy: {
    type: String,
    trim: true,
    maxlength: [100, 'Referred by cannot exceed 100 characters']
  },
  emailId: {
    type: String,
    trim: true
  },
  enrollmentDate: {
    type: Date,
    default: Date.now,
    required: [true, 'Enrollment date is required']
  },
  feeCycleStartDate: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true,
    required: [true, 'Active status is required']
  }
}, {
  timestamps: true,
  versionKey: false
});

// Indexes for better query performance
StudentSchema.index({ email: 1 }, { unique: true });
StudentSchema.index({ studentName: 1 });
StudentSchema.index({ createdAt: -1 });
StudentSchema.index({ emailId: 1 });

// Virtual for full name display
StudentSchema.virtual('displayName').get(function() {
  return this.studentName || 'Unknown Student';
});

// Cascade delete: Remove related records when student is deleted
StudentSchema.pre('deleteOne', { document: true, query: false }, async function() {
  const studentId = this._id;
  await mongoose.model('FeeRecord').deleteMany({ studentId });
  await mongoose.model('StudentCredit').deleteMany({ studentId });
});

// Handle query-based deleteOne (e.g., Student.deleteOne({ _id: ... }))
StudentSchema.pre('deleteOne', { document: false, query: true }, async function() {
  const student = await this.model.findOne(this.getFilter()).select('_id');
  if (student) {
    await mongoose.model('FeeRecord').deleteMany({ studentId: student._id });
    await mongoose.model('StudentCredit').deleteMany({ studentId: student._id });
  }
});

// Handle deleteMany
StudentSchema.pre('deleteMany', async function() {
  const students = await this.model.find(this.getFilter()).select('_id');
  const studentIds = students.map(s => s._id);
  if (studentIds.length > 0) {
    await mongoose.model('FeeRecord').deleteMany({ studentId: { $in: studentIds } });
    await mongoose.model('StudentCredit').deleteMany({ studentId: { $in: studentIds } });
  }
});

// Sync studentName to related records when updated
StudentSchema.post('findOneAndUpdate', async function(doc) {
  if (doc) {
    const update = this.getUpdate() as any;
    const newName = update?.$set?.studentName || update?.studentName;
    if (newName) {
      await mongoose.model('FeeRecord').updateMany(
        { studentId: doc._id },
        { $set: { studentName: newName } }
      );
      await mongoose.model('StudentCredit').updateMany(
        { studentId: doc._id },
        { $set: { studentName: newName } }
      );
    }
  }
});

// Ensure virtual fields are serialized
StudentSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret: any) {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  }
});

const Student = mongoose.model<IStudent>('Student', StudentSchema);

export default Student;
