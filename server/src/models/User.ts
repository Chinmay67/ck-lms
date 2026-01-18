import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '../types/index.js';

const UserSchema = new Schema<IUser>({
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address'
    ],
    sparse: true // Allow null values but maintain uniqueness when present
  },
  phone: {
    type: String,
    trim: true,
    maxlength: [20, 'Phone number cannot exceed 20 characters'],
    sparse: true // Allow null values but maintain uniqueness when present
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false // Don't include password in queries by default
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  role: {
    type: String,
    enum: {
      values: ['user', 'admin', 'superadmin'],
      message: 'Role must be one of: user, admin, superadmin'
    },
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  versionKey: false
});

// Validation: Must have either email or phone
UserSchema.pre('save', function(next) {
  if (!this.email && !this.phone) {
    return next(new Error('User must have either email or phone'));
  }
  next();
});

// Index for better query performance
// Use partialFilterExpression to only enforce uniqueness when field exists and is not null
UserSchema.index(
  { email: 1 }, 
  { 
    unique: true,
    partialFilterExpression: { email: { $exists: true, $type: 'string' } }
  }
);
UserSchema.index(
  { phone: 1 }, 
  { 
    unique: true,
    partialFilterExpression: { phone: { $exists: true, $type: 'string' } }
  }
);

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    return false;
  }
};

// Ensure password is not returned in JSON
UserSchema.set('toJSON', {
  transform: function(doc, ret: any) {
    delete ret.password;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const User = mongoose.model<IUser>('User', UserSchema);

export default User;
