import { Router, Request, Response } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { DatabaseService } from '../services/DatabaseService.js';
import { FeeService } from '../services/FeeService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ApiResponse, PaginatedResponse, IStudent } from '../types/index.js';

const router = Router();

// Configure multer for file upload (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only Excel files
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

// Apply authentication to all student routes
router.use(authenticate);
// Only admin and superadmin can access student data
router.use(authorize('admin', 'superadmin'));

// GET /api/students - Get all students with pagination
router.get('/', asyncHandler(async (req: Request, res: Response<ApiResponse<PaginatedResponse<IStudent>>>) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const sortBy = req.query.sortBy as string || 'createdAt';
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';
  const search = req.query.search as string;
  const stage = req.query.stage as 'beginner' | 'intermediate' | 'advanced' | undefined;
  const isActive = req.query.isActive as string | undefined;

  let result: PaginatedResponse<IStudent>;

  // Build options object, only including filters if they're defined
  const baseOptions = { page, limit, sortBy, sortOrder };
  const optionsWithFilters: any = { ...baseOptions };
  
  if (stage) {
    optionsWithFilters.stage = stage;
  }
  
  if (isActive !== undefined && isActive !== 'all') {
    optionsWithFilters.isActive = isActive === 'true';
  }

  if (search) {
    result = await DatabaseService.searchStudents(search, optionsWithFilters);
  } else {
    result = await DatabaseService.getAllStudents(optionsWithFilters);
  }

  // Add overdue status to each student
  const studentsWithOverdue = await Promise.all(
    result.data.map(async (student: any) => {
      const hasOverdue = await FeeService.hasOverdueFees((student._id as any).toString());
      return {
        ...student.toObject(),
        hasOverdueFees: hasOverdue
      };
    })
  );

  return res.json({
    success: true,
    data: {
      ...result,
      data: studentsWithOverdue as any
    },
    message: search ? `Found ${result.data.length} students matching "${search}"` : `Retrieved ${result.data.length} students`,
    timestamp: new Date().toISOString()
  });
}));

// GET /api/students/stats - Get student statistics
router.get('/stats', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const stats = await DatabaseService.getStudentStats();
  
  return res.json({
    success: true,
    data: stats,
    message: 'Student statistics retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// GET /api/students/email/:email - Get student by email (must come before /:id)
router.get('/email/:email', asyncHandler(async (req: Request, res: Response<ApiResponse<IStudent>>) => {
  const { email } = req.params;
  
  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Email is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const student = await DatabaseService.getStudentByEmail(email);
  
  if (!student) {
    return res.status(404).json({
      success: false,
      error: 'Student not found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    data: student,
    message: 'Student retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// GET /api/students/download-template - Download Excel template (must come before /:id)
router.get('/download-template', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Create template data matching the user's Excel format
    const templateData = [
      {
        'Name': 'John Doe',
        'Contact Number': '9876543210',
        'E-mail': 'john.doe@example.com',
        'Status': 'Active',
        'Student Start Date': '2025-01-15',
        'Level': 'B1',
        'Batch': 'SS:2:30',
        'Parent Name': 'Jane Doe',
        'Date of Birth': '2010-05-20',
        'Address': '123 Main St, City, State',
        'Referred By': 'John Smith'
      },
      {
        'Name': 'Jane Smith',
        'Contact Number': '9123456789',
        'E-mail': 'jane.smith@example.com',
        'Status': 'Irregular',
        'Student Start Date': '2025-01-20',
        'Level': 'I1',
        'Batch': 'TT:4:30',
        'Parent Name': 'Bob Smith',
        'Date of Birth': '2011-03-15',
        'Address': '456 Oak Ave, City, State',
        'Referred By': 'Alice Johnson'
      }
    ];

    // Create workbook and worksheet
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(templateData);

    // Set column widths
    const colWidths = [
      { wch: 25 }, // Name
      { wch: 18 }, // Contact Number
      { wch: 30 }, // E-mail
      { wch: 15 }, // Status
      { wch: 20 }, // Student Start Date
      { wch: 12 }, // Level
      { wch: 15 }, // Batch
      { wch: 25 }, // Parent Name
      { wch: 18 }, // Date of Birth
      { wch: 35 }, // Address
      { wch: 20 }  // Referred By
    ];
    ws['!cols'] = colWidths;

    xlsx.utils.book_append_sheet(wb, ws, 'Students Template');

    // Generate buffer
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=students-template.xlsx');

    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate template',
      timestamp: new Date().toISOString()
    });
  }
}));

// Helper functions for validation
const cleanPhoneNumber = (phone: string | number): string | null => {
  if (!phone) return null;
  
  // Convert to string and remove all non-digit characters
  const cleaned = String(phone).replace(/\D/g, '');
  
  // Check if it's a valid 10-digit Indian mobile number
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return cleaned;
  }
  
  return null;
};

const isValidEmail = (email: any): boolean => {
  if (!email || email === 'nan' || String(email).toLowerCase() === 'nan') {
    return false;
  }
  
  const emailStr = String(email).trim();
  if (!emailStr) return false;
  
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(emailStr);
};

const parseLevelField = (level: string): { skillCategory?: string; skillLevel?: number } => {
  if (!level || level === 'nan') return {};
  
  const levelStr = String(level).trim().toUpperCase();
  
  // Map level codes to category and level
  const levelMap: { [key: string]: { category: string; level: number } } = {
    'B1': { category: 'beginner', level: 1 },
    'B2': { category: 'beginner', level: 2 },
    'B3': { category: 'beginner', level: 3 },
    'I1': { category: 'intermediate', level: 1 },
    'I2': { category: 'intermediate', level: 2 },
    'I3': { category: 'intermediate', level: 3 },
    'A1': { category: 'advanced', level: 1 },
    'A2': { category: 'advanced', level: 2 },
    'A3': { category: 'advanced', level: 3 },
  };
  
  // Remove spaces and parse
  const code = levelStr.replace(/\s+/g, '');
  
  if (levelMap[code]) {
    return {
      skillCategory: levelMap[code].category,
      skillLevel: levelMap[code].level
    };
  }
  
  return {};
};

const parseStatus = (status: any): boolean => {
  if (!status || status === 'nan') return true; // Default to active
  
  const statusStr = String(status).toLowerCase().trim();
  
  // Only mark as inactive if explicitly "discontinued"
  if (statusStr === 'discontinued' || statusStr === 'discontinue') {
    return false;
  }
  
  // All other statuses (including "irregular") are active
  return true;
};

// POST /api/students/bulk-upload - Bulk upload students from Excel (must come before /:id)
router.post('/bulk-upload', upload.single('file'), asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
      timestamp: new Date().toISOString()
    });
  }

  try {
    // Parse Excel file
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({
        success: false,
        error: 'No sheet found in the Excel file',
        timestamp: new Date().toISOString()
      });
    }
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return res.status(400).json({
        success: false,
        error: 'No worksheet found in the Excel file',
        timestamp: new Date().toISOString()
      });
    }
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No data found in the Excel file',
        timestamp: new Date().toISOString()
      });
    }

    const results = {
      total: data.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      feesGenerated: 0,
      feesSkipped: 0,
      errors: [] as Array<{ row: number; error: string; data: any }>
    };

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any;
      const rowNum = i + 2; // Excel row numbers start from 1, plus header row

      try {
        // Map Excel columns - support both old and new formats
        const name = row['Name'] || row['Student Name'];
        const contactNumber = row['Contact Number'] || row['Phone'];
        const email = row['E-mail'] || row['Email'];
        const status = row['Status'];
        // Use Student Start Date first, fall back to Batch Start Date if missing
        const studentStartDate = row['Student Start Date'] || row['Batch Start Date'];
        const level = row['Level'];
        const batch = row['Batch'];
        const parentName = row['Parent Name'];
        const dob = row['Date of Birth'] || row['dob'];
        const address = row['Address'];
        const referredBy = row['Referred By'];
        
        // STRICT VALIDATION: Must have both valid phone and email
        const cleanedPhone = cleanPhoneNumber(contactNumber);
        if (!cleanedPhone) {
          results.skipped++;
          results.errors.push({
            row: rowNum,
            error: 'Invalid or missing phone number (must be 10-digit Indian mobile)',
            data: { name, contactNumber, email }
          });
          continue;
        }
        
        if (!isValidEmail(email)) {
          results.skipped++;
          results.errors.push({
            row: rowNum,
            error: 'Invalid or missing email address',
            data: { name, contactNumber, email }
          });
          continue;
        }
        
        // Skip if name is missing
        if (!name || name === 'nan' || String(name).trim() === '') {
          results.skipped++;
          results.errors.push({
            row: rowNum,
            error: 'Missing student name',
            data: { name, contactNumber, email }
          });
          continue;
        }
        
        // Parse level field (B1, B2, I1, etc.)
        const levelInfo = parseLevelField(level);
        
        // Parse status to determine isActive
        const isActive = parseStatus(status);
        
        // Build student data
        const studentData: Partial<IStudent> = {
          studentName: String(name).trim(),
          email: String(email).trim().toLowerCase(),
          phone: cleanedPhone,
          isActive: isActive,
          batch: batch && batch !== 'nan' ? String(batch).trim() : 'Not Assigned'
        };
        
        // Add optional fields if present
        if (parentName && parentName !== 'nan') {
          studentData.parentName = String(parentName).trim();
        }
        
        if (dob && dob !== 'nan') {
          studentData.dob = String(dob).trim();
        }
        
        if (address && address !== 'nan') {
          studentData.address = String(address).trim();
        }
        
        if (referredBy && referredBy !== 'nan') {
          studentData.referredBy = String(referredBy).trim();
        }
        
        // Add level information if parsed
        if (levelInfo.skillCategory) {
          studentData.skillCategory = levelInfo.skillCategory as any;
          studentData.stage = levelInfo.skillCategory as any;
        }
        
        if (levelInfo.skillLevel) {
          studentData.skillLevel = levelInfo.skillLevel as 1 | 2 | 3;
          studentData.level = levelInfo.skillLevel as 1 | 2 | 3;
        }
        
        // Auto-generate combinedSkill from stage + level
        if (levelInfo.skillCategory && levelInfo.skillLevel) {
          const stageCapitalized = levelInfo.skillCategory.charAt(0).toUpperCase() + levelInfo.skillCategory.slice(1);
          studentData.combinedSkill = `${stageCapitalized} Level - ${levelInfo.skillLevel}`;
        }
        
        // Parse enrollment date - handle Excel date formats
        if (studentStartDate && studentStartDate !== 'nan') {
          try {
            let parsedDate: Date | null = null;
            
            // Case 1: Already a Date object from xlsx
            if (studentStartDate instanceof Date) {
              parsedDate = studentStartDate;
            }
            // Case 2: Excel serial date (number)
            else if (typeof studentStartDate === 'number') {
              // Excel serial date: days since 1900-01-01 (with leap year bug)
              const excelEpoch = new Date(1900, 0, 1);
              const daysOffset = studentStartDate - 2; // Adjust for Excel's leap year bug
              parsedDate = new Date(excelEpoch.getTime() + daysOffset * 24 * 60 * 60 * 1000);
            }
            // Case 3: String in yyyy-mm-dd or other formats
            else if (typeof studentStartDate === 'string') {
              const dateStr = studentStartDate.trim();
              // Try to parse yyyy-mm-dd format explicitly
              const ymdMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
              if (ymdMatch && ymdMatch[1] && ymdMatch[2] && ymdMatch[3]) {
                const year = parseInt(ymdMatch[1]);
                const month = parseInt(ymdMatch[2]);
                const day = parseInt(ymdMatch[3]);
                parsedDate = new Date(year, month - 1, day);
              } else {
                // Try standard Date parsing as fallback
                parsedDate = new Date(dateStr);
              }
            }
            
            // Validate and set if we got a valid date
            if (parsedDate && !isNaN(parsedDate.getTime())) {
              studentData.enrollmentDate = parsedDate;
            }
          } catch (e) {
            console.warn(`Failed to parse enrollment date for row ${rowNum}: ${studentStartDate}`);
          }
        }

        // Create student (this will also create user account via DatabaseService)
        const student = await DatabaseService.createStudent(studentData);
        results.successful++;
        
        // Generate fee records (same as single student creation)
        try {
          const stage = student.stage || student.skillCategory;
          if (stage && studentData.enrollmentDate) {
            await FeeService.createInitialOverdueFeesForStudent(
              (student._id as any).toString(),
              studentData.enrollmentDate,
              stage
            );
            results.feesGenerated++;
          } else {
            // Log if we couldn't generate fees
            if (!stage) {
              console.warn(`No stage/skillCategory for student ${student._id}, skipping fee generation`);
            }
            if (!studentData.enrollmentDate) {
              console.warn(`No enrollment date for student ${student._id}, skipping fee generation`);
            }
            results.feesSkipped++;
          }
        } catch (feeError: any) {
          // Don't fail student creation if fee generation fails
          console.warn(`Failed to generate fees for student ${student._id}: ${feeError.message}`);
          results.feesSkipped++;
        }

      } catch (error: any) {
        results.failed++;
        results.errors.push({
          row: rowNum,
          error: error.message,
          data: row
        });
      }
    }

    return res.json({
      success: true,
      data: results,
      message: `Bulk upload completed: ${results.successful} students created, ${results.failed} failed, ${results.skipped} skipped (validation). Fees: ${results.feesGenerated} generated, ${results.feesSkipped} skipped.`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: `Failed to process Excel file: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
}));

// GET /api/students/:id - Get student by ID
router.get('/:id', asyncHandler(async (req: Request, res: Response<ApiResponse<IStudent>>) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const student = await DatabaseService.getStudentById(id);
  
  if (!student) {
    return res.status(404).json({
      success: false,
      error: 'Student not found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    data: student,
    message: 'Student retrieved successfully',
    timestamp: new Date().toISOString()
  });
}));

// POST /api/students - Create new student
router.post('/', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const studentData = req.body;
  
  // Basic validation
  if (!studentData.studentName || !studentData.email) {
    return res.status(400).json({
      success: false,
      error: 'Student name and email are required',
      timestamp: new Date().toISOString()
    });
  }

  // Auto-generate combinedSkill from stage + level
  if (studentData.stage && studentData.level) {
    const stageCapitalized = studentData.stage.charAt(0).toUpperCase() + studentData.stage.slice(1);
    studentData.combinedSkill = `${stageCapitalized} Level - ${studentData.level}`;
  }

  const student = await DatabaseService.createStudent(studentData);
  
  // Automatically create initial overdue fee records from enrollment to current month
  let initialFees: any[] = [];
  try {
    const stage = student.stage || student.skillCategory;
    if (stage && student.enrollmentDate) {
      initialFees = await FeeService.createInitialOverdueFeesForStudent(
        (student._id as any).toString(),
        student.enrollmentDate,
        stage
      );
    }
  } catch (error: any) {
    console.warn(`Failed to generate initial fees for student ${student._id}: ${error.message}`);
    // Don't fail the student creation if fee generation fails
  }
  
  return res.status(201).json({
    success: true,
    data: {
      student,
      initialFees // Return fees so frontend knows what was created
    },
    message: 'Student created successfully',
    timestamp: new Date().toISOString()
  });
}));

// PUT /api/students/:id - Update student
router.put('/:id', asyncHandler(async (req: Request, res: Response<ApiResponse<IStudent>>) => {
  const { id } = req.params;
  const updateData = req.body;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  // Remove fields that shouldn't be updated directly
  delete updateData.id;
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.updatedAt;
  
  // Auto-generate combinedSkill from stage + level
  if (updateData.stage && updateData.level) {
    const stageCapitalized = updateData.stage.charAt(0).toUpperCase() + updateData.stage.slice(1);
    updateData.combinedSkill = `${stageCapitalized} Level - ${updateData.level}`;
  }
  
  const student = await DatabaseService.updateStudent(id, updateData);
  
  if (!student) {
    return res.status(404).json({
      success: false,
      error: 'Student not found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    data: student,
    message: 'Student updated successfully',
    timestamp: new Date().toISOString()
  });
}));

// PATCH /api/students/:id/toggle-active - Toggle student active/inactive status
router.patch('/:id/toggle-active', asyncHandler(async (req: Request, res: Response<ApiResponse<IStudent>>) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const student = await DatabaseService.toggleStudentActiveStatus(id);
  
  if (!student) {
    return res.status(404).json({
      success: false,
      error: 'Student not found',
      timestamp: new Date().toISOString()
    });
  }

  const statusMessage = student.isActive ? 'activated' : 'deactivated';
  return res.json({
    success: true,
    data: student,
    message: `Student ${statusMessage} successfully`,
    timestamp: new Date().toISOString()
  });
}));

// DELETE /api/students/:id - Delete student
router.delete('/:id', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  const deleted = await DatabaseService.deleteStudent(id);
  
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: 'Student not found',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    success: true,
    message: 'Student deleted successfully',
    timestamp: new Date().toISOString()
  });
}));


// GET /api/students/:id/fees - Get all fee records for a specific student
router.get('/:id/fees', asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Student ID is required',
      timestamp: new Date().toISOString()
    });
  }
  
  // Validate student exists
  const student = await DatabaseService.getStudentById(id);
  if (!student) {
    return res.status(404).json({
      success: false,
      error: 'Student not found',
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    const fees = await FeeService.getStudentFees(id);
    
    return res.json({
      success: true,
      data: fees,
      message: `Retrieved ${fees.length} fee records for student`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

export default router;
