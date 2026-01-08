import mongoose, { Schema } from 'mongoose';
import { ICourse } from '../types/index.js';

const CourseLevelSchema = new Schema({
  levelNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  feeAmount: {
    type: Number,
    required: true,
    min: 0
  },
  durationMonths: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  approximateHours: {
    type: Number,
    min: 0,
    default: 0
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Level description cannot exceed 500 characters']
  }
}, { _id: false });

const CourseSchema = new Schema<ICourse>({
  courseName: {
    type: String,
    required: [true, 'Course name is required'],
    lowercase: true,
    trim: true,
    unique: true,
    maxlength: [50, 'Course name cannot exceed 50 characters']
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true,
    maxlength: [100, 'Display name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  levels: {
    type: [CourseLevelSchema],
    default: [],
    validate: {
      validator: function(levels: any[]) {
        // Check that levels are sequential and unique
        const levelNumbers = levels.map(l => l.levelNumber).sort((a, b) => a - b);
        for (let i = 0; i < levelNumbers.length; i++) {
          if (levelNumbers[i] !== i + 1) return false;
        }
        return true;
      },
      message: 'Levels must be sequential starting from 1 (e.g., 1, 2, 3...)'
    }
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  versionKey: false
});

// Indexes for better query performance
CourseSchema.index({ courseName: 1 }, { unique: true });
CourseSchema.index({ isActive: 1 });
CourseSchema.index({ displayOrder: 1 });

// Virtual for number of levels
CourseSchema.virtual('numberOfLevels').get(function() {
  return this.levels.length;
});

// Method to get fee for a specific level
CourseSchema.methods.getFeeForLevel = function(levelNumber: number): number | null {
  const level = this.levels.find(l => l.levelNumber === levelNumber);
  return level ? level.feeAmount : null;
};

// Method to check if level exists
CourseSchema.methods.hasLevel = function(levelNumber: number): boolean {
  return this.levels.some(l => l.levelNumber === levelNumber);
};

// Ensure virtual fields are serialized
CourseSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret: any) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const Course = mongoose.model<ICourse>('Course', CourseSchema);

export default Course;
