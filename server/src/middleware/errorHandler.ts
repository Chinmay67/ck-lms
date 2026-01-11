import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/index.js';

export interface CustomError extends Error {
  statusCode?: number;
  code?: number;
  errors?: Record<string, { message: string; path?: string; kind?: string; value?: any }>;
  keyValue?: Record<string, any>;
  path?: string;
  value?: any;
  kind?: string;
}

// Error code to user-friendly message mapping
const ERROR_MESSAGES: Record<string, string> = {
  'ECONNREFUSED': 'Unable to connect to the database. Please try again later.',
  'ENOTFOUND': 'Unable to reach the server. Please check your network connection.',
  'ETIMEDOUT': 'The request timed out. Please try again.',
  'ECONNRESET': 'Connection was interrupted. Please try again.',
};

// Field name to user-friendly name mapping
const FIELD_LABELS: Record<string, string> = {
  studentName: 'Student Name',
  email: 'Email Address',
  phone: 'Phone Number',
  parentName: 'Parent Name',
  enrollmentDate: 'Enrollment Date',
  stage: 'Stage',
  level: 'Level',
  batchId: 'Batch',
  dob: 'Date of Birth',
  address: 'Address',
  feeAmount: 'Fee Amount',
  paidAmount: 'Paid Amount',
  dueDate: 'Due Date',
  feeMonth: 'Fee Month',
  paymentDate: 'Payment Date',
  paymentMethod: 'Payment Method',
  courseName: 'Course Name',
  displayName: 'Display Name',
  batchName: 'Batch Name',
  maxCapacity: 'Maximum Capacity',
  startDate: 'Start Date',
  password: 'Password',
  name: 'Name',
  role: 'Role',
  amount: 'Amount',
  description: 'Description',
};

/**
 * Get user-friendly field name
 */
const getFieldLabel = (fieldName: string): string => {
  return FIELD_LABELS[fieldName] || fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

/**
 * Parse Mongoose validation errors into user-friendly messages
 */
const parseValidationErrors = (errors: Record<string, any>): string => {
  const messages: string[] = [];
  
  for (const [field, error] of Object.entries(errors)) {
    const fieldLabel = getFieldLabel(field);
    
    if (error.kind === 'required') {
      messages.push(`${fieldLabel} is required`);
    } else if (error.kind === 'minlength') {
      messages.push(`${fieldLabel} must be at least ${error.properties?.minlength} characters`);
    } else if (error.kind === 'maxlength') {
      messages.push(`${fieldLabel} must be no more than ${error.properties?.maxlength} characters`);
    } else if (error.kind === 'min') {
      messages.push(`${fieldLabel} must be at least ${error.properties?.min}`);
    } else if (error.kind === 'max') {
      messages.push(`${fieldLabel} must be no more than ${error.properties?.max}`);
    } else if (error.kind === 'enum') {
      const allowed = error.properties?.enumValues?.join(', ') || 'valid values';
      messages.push(`${fieldLabel} must be one of: ${allowed}`);
    } else if (error.kind === 'regexp' || error.kind === 'user defined') {
      messages.push(`${fieldLabel} format is invalid`);
    } else if (error.message) {
      messages.push(error.message);
    } else {
      messages.push(`${fieldLabel} is invalid`);
    }
  }
  
  return messages.join('. ');
};

/**
 * Parse duplicate key error into user-friendly message
 */
const parseDuplicateKeyError = (keyValue: Record<string, any>): string => {
  const field = Object.keys(keyValue)[0];
  const value = keyValue[field];
  const fieldLabel = getFieldLabel(field);
  
  if (field === 'email') {
    return `An account with email "${value}" already exists`;
  } else if (field === 'phone') {
    return `A student with phone number "${value}" already exists`;
  } else if (field === 'batchCode') {
    return `A batch with code "${value}" already exists`;
  } else if (field === 'courseName') {
    return `A course with name "${value}" already exists`;
  }
  
  return `A record with this ${fieldLabel} already exists`;
};

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errorCode: string | undefined;

  // Mongoose validation error
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    message = parseValidationErrors(err.errors);
    errorCode = 'VALIDATION_ERROR';
  }

  // Mongoose duplicate key error
  if (err.code === 11000 && err.keyValue) {
    statusCode = 409;
    message = parseDuplicateKeyError(err.keyValue);
    errorCode = 'DUPLICATE_ERROR';
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    const fieldLabel = err.path ? getFieldLabel(err.path) : 'ID';
    if (err.kind === 'ObjectId') {
      message = `Invalid ${fieldLabel} format. Please provide a valid ID.`;
    } else if (err.kind === 'Number') {
      message = `${fieldLabel} must be a valid number`;
    } else if (err.kind === 'Date') {
      message = `${fieldLabel} must be a valid date`;
    } else {
      message = `Invalid ${fieldLabel} format`;
    }
    errorCode = 'CAST_ERROR';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Your session is invalid. Please log in again.';
    errorCode = 'INVALID_TOKEN';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
    errorCode = 'TOKEN_EXPIRED';
  }

  // Network/Connection errors
  const networkErrorCode = (err as any).code;
  if (networkErrorCode && ERROR_MESSAGES[networkErrorCode]) {
    statusCode = 503;
    message = ERROR_MESSAGES[networkErrorCode];
    errorCode = networkErrorCode;
  }

  // MongoDB connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
    statusCode = 503;
    message = 'Database connection failed. Please try again later.';
    errorCode = 'DB_CONNECTION_ERROR';
  }

  // MongoDB timeout errors
  if (err.name === 'MongoTimeoutError') {
    statusCode = 504;
    message = 'Database operation timed out. Please try again.';
    errorCode = 'DB_TIMEOUT';
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    statusCode = 400;
    const multerError = err as any;
    if (multerError.code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds the maximum limit of 5MB';
    } else if (multerError.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field. Please check your upload.';
    } else {
      message = 'File upload failed. Please try again.';
    }
    errorCode = 'FILE_UPLOAD_ERROR';
  }

  // Syntax error in JSON body
  if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    message = 'Invalid request format. Please check your data.';
    errorCode = 'INVALID_JSON';
  }

  console.error('Error:', {
    message: err.message,
    errorCode,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: process.env.NODE_ENV === 'development' ? req.body : undefined,
    timestamp: new Date().toISOString()
  });

  res.status(statusCode).json({
    success: false,
    error: message,
    errorCode,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      originalError: err.message 
    })
  });
};

export const notFound = (req: Request, res: Response<ApiResponse>, next: NextFunction): void => {
  const error = new Error(`Not found - ${req.originalUrl}`) as CustomError;
  error.statusCode = 404;
  next(error);
};

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
