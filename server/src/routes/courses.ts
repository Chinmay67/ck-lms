import { Router, Request, Response } from 'express';
import Course from '../models/Course.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ApiResponse, ICourse } from '../types/index.js';

const router = Router();

// Apply authentication to all course routes
router.use(authenticate);

// GET /api/courses - Get all courses (public for dropdown menus)
router.get('/', asyncHandler(async (req: Request, res: Response<ApiResponse<ICourse[]>>) => {
  const { activeOnly } = req.query;
  
  const query: any = {};
  if (activeOnly === 'true') {
    query.isActive = true;
  }
  
  const courses = await Course.find(query).sort({ displayOrder: 1, courseName: 1 });
  
  return res.json({
    success: true,
    data: courses,
    message: 'Courses retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// GET /api/courses/:id - Get specific course with levels
router.get('/:id', asyncHandler(async (req: Request, res: Response<ApiResponse<ICourse>>) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Course ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const course = await Course.findById(id);
  
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Course not found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    data: course,
    message: 'Course retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// GET /api/courses/name/:courseName - Get course by name
router.get('/name/:courseName', asyncHandler(async (req: Request, res: Response<ApiResponse<ICourse>>) => {
  const { courseName } = req.params;
  
  if (!courseName) {
    return res.status(400).json({
      success: false,
      error: 'Course name is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const course = await Course.findOne({ courseName: courseName.toLowerCase() });
  
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Course not found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    data: course,
    message: 'Course retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/courses - Create course (superadmin only)
router.post('/', authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse<ICourse>>) => {
  const { courseName, displayName, description, isActive, displayOrder, levels } = req.body;
  const userId = (req as any).user.id;
  
  // Validation
  if (!courseName || !displayName) {
    return res.status(400).json({
      success: false,
      error: 'Course name and display name are required',
      timestamp: new Date().toISOString()
    });
  }
  
  // Check if course already exists
  const existingCourse = await Course.findOne({ courseName: courseName.toLowerCase() });
  if (existingCourse) {
    return res.status(400).json({
      success: false,
      error: 'Course with this name already exists',
      timestamp: new Date().toISOString()
    });
  }
  
  // Validate levels if provided
  if (levels && levels.length > 0) {
    if (levels.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 levels allowed per course',
        timestamp: new Date().toISOString()
      });
    }
    
    // Check for sequential levels
    const levelNumbers = levels.map((l: any) => l.levelNumber).sort((a: number, b: number) => a - b);
    for (let i = 0; i < levelNumbers.length; i++) {
      if (levelNumbers[i] !== i + 1) {
        return res.status(400).json({
          success: false,
          error: 'Levels must be sequential starting from 1 (e.g., 1, 2, 3...)',
          timestamp: new Date().toISOString()
        });
      }
    }
  }
  
  const course = await Course.create({
    courseName: courseName.toLowerCase(),
    displayName,
    description,
    isActive: isActive !== undefined ? isActive : true,
    displayOrder: displayOrder || 0,
    levels: levels || [],
    createdBy: userId
  });
  
  return res.status(201).json({
    success: true,
    data: course as any,
    message: 'Course created successfully',
    timestamp: new Date().toISOString()
  });
}));

// PUT /api/courses/:id - Update course (superadmin only)
router.put('/:id', authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse<ICourse>>) => {
  const { id } = req.params;
  const { displayName, description, isActive, displayOrder } = req.body;
  const userId = (req as any).user.id;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Course ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const updateData: any = { createdBy: userId };
  
  if (displayName !== undefined) updateData.displayName = displayName;
  if (description !== undefined) updateData.description = description;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
  
  const course = await Course.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
  
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Course not found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    data: course as any,
    message: 'Course updated successfully',
    timestamp: new Date().toISOString()
  });
}));

// DELETE /api/courses/:id - Delete course (superadmin only)
router.delete('/:id', authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Course ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  // Check if any students are enrolled in this course
  const course = await Course.findById(id);
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Course not found',
      timestamp: new Date().toISOString()
    });
  }
  
  const studentCount = await Student.countDocuments({ stage: course.courseName });
  if (studentCount > 0) {
    return res.status(400).json({
      success: false,
      error: `Cannot delete course. ${studentCount} student(s) are enrolled. Please deactivate the course instead.`,
      timestamp: new Date().toISOString()
    });
  }
  
  await Course.findByIdAndDelete(id);

  return res.json({
    success: true,
    message: 'Course deleted successfully',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/courses/:id/levels - Add level to course (superadmin only)
router.post('/:id/levels', authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse<ICourse>>) => {
  const { id } = req.params;
  const { levelNumber, feeAmount, durationMonths, approximateHours, description } = req.body;
  const userId = (req as any).user.id;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Course ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  if (!levelNumber || feeAmount === undefined) {
    return res.status(400).json({
      success: false,
      error: 'Level number and fee amount are required',
      timestamp: new Date().toISOString()
    });
  }
  
  if (levelNumber < 1 || levelNumber > 5) {
    return res.status(400).json({
      success: false,
      error: 'Level number must be between 1 and 5',
      timestamp: new Date().toISOString()
    });
  }
  
  if (feeAmount < 0) {
    return res.status(400).json({
      success: false,
      error: 'Fee amount cannot be negative',
      timestamp: new Date().toISOString()
    });
  }
  
  const course = await Course.findById(id);
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Course not found',
      timestamp: new Date().toISOString()
    });
  }
  
  // Check if level already exists
  if (course.hasLevel(levelNumber)) {
    return res.status(400).json({
      success: false,
      error: `Level ${levelNumber} already exists in this course`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Check if adding this level would exceed 5 levels
  if (course.levels.length >= 5) {
    return res.status(400).json({
      success: false,
      error: 'Maximum 5 levels allowed per course',
      timestamp: new Date().toISOString()
    });
  }
  
  // Add the new level
  course.levels.push({
    levelNumber,
    feeAmount,
    durationMonths: durationMonths || 1,
    approximateHours: approximateHours || 0,
    description
  });
  
  // Sort levels by levelNumber
  course.levels.sort((a: any, b: any) => a.levelNumber - b.levelNumber);
  
  await course.save();
  
  return res.json({
    success: true,
    data: course as any,
    message: 'Level added successfully',
    timestamp: new Date().toISOString()
  });
}));

// PUT /api/courses/:id/levels/:levelNumber - Update level config (superadmin only)
router.put('/:id/levels/:levelNumber', authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse<ICourse>>) => {
  const { id, levelNumber } = req.params;
  const { feeAmount, durationMonths, approximateHours, description } = req.body;
  const userId = (req as any).user.id;
  
  if (!id || !levelNumber) {
    return res.status(400).json({
      success: false,
      error: 'Course ID and level number are required',
      timestamp: new Date().toISOString()
    });
  }
  
  const levelNum = parseInt(levelNumber);
  
  const course = await Course.findById(id);
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Course not found',
      timestamp: new Date().toISOString()
    });
  }
  
  const levelIndex = course.levels.findIndex((l: any) => l.levelNumber === levelNum);
  if (levelIndex === -1) {
    return res.status(404).json({
      success: false,
      error: `Level ${levelNum} not found in this course`,
      timestamp: new Date().toISOString()
    });
  }
  
  const level = course.levels[levelIndex];
  if (!level) {
    return res.status(404).json({
      success: false,
      error: `Level ${levelNum} not found in this course`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Update level fields
  if (feeAmount !== undefined) {
    if (feeAmount < 0) {
      return res.status(400).json({
        success: false,
        error: 'Fee amount cannot be negative',
        timestamp: new Date().toISOString()
      });
    }
    level.feeAmount = feeAmount;
  }
  
  if (durationMonths !== undefined) {
    if (durationMonths < 1) {
      return res.status(400).json({
        success: false,
        error: 'Duration must be at least 1 month',
        timestamp: new Date().toISOString()
      });
    }
    level.durationMonths = durationMonths;
  }
  
  if (approximateHours !== undefined) {
    level.approximateHours = approximateHours;
  }
  
  if (description !== undefined) {
    level.description = description;
  }
  
  await course.save();
  
  return res.json({
    success: true,
    data: course as any,
    message: 'Level updated successfully',
    timestamp: new Date().toISOString()
  });
}));

// DELETE /api/courses/:id/levels/:levelNumber - Remove level (superadmin only)
router.delete('/:id/levels/:levelNumber', authorize('superadmin'), asyncHandler(async (req: Request, res: Response<ApiResponse<ICourse>>) => {
  const { id, levelNumber } = req.params;
  
  if (!id || !levelNumber) {
    return res.status(400).json({
      success: false,
      error: 'Course ID and level number are required',
      timestamp: new Date().toISOString()
    });
  }
  
  const levelNum = parseInt(levelNumber);
  
  const course = await Course.findById(id);
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Course not found',
      timestamp: new Date().toISOString()
    });
  }
  
  // Check if any students are at this level
  const studentCount = await Student.countDocuments({ 
    stage: course.courseName,
    level: levelNum
  });
  
  if (studentCount > 0) {
    return res.status(400).json({
      success: false,
      error: `Cannot remove level ${levelNum}. ${studentCount} student(s) are currently at this level. Please move them to another level first.`,
      timestamp: new Date().toISOString()
    });
  }
  
  const levelIndex = course.levels.findIndex((l: any) => l.levelNumber === levelNum);
  if (levelIndex === -1) {
    return res.status(404).json({
      success: false,
      error: `Level ${levelNum} not found in this course`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Remove the level
  course.levels.splice(levelIndex, 1);
  
  await course.save();
  
  return res.json({
    success: true,
    data: course as any,
    message: 'Level removed successfully',
    timestamp: new Date().toISOString()
  });
}));

export default router;
