/**
 * Custom error classes for better error handling and meaningful error messages
 */

/**
 * Base API error class with status code
 */
export class ApiError extends Error {
  statusCode: number;
  errorCode: string;
  
  constructor(message: string, statusCode: number = 500, errorCode: string = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error - 400 Bad Request
 */
export class ValidationError extends ApiError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Not found error - 404 Not Found
 */
export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Duplicate error - 409 Conflict
 */
export class DuplicateError extends ApiError {
  constructor(message: string) {
    super(message, 409, 'DUPLICATE_ERROR');
    this.name = 'DuplicateError';
  }
}

/**
 * Authorization error - 401 Unauthorized
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error - 403 Forbidden
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Access denied. Insufficient permissions.') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Business logic error - 422 Unprocessable Entity
 */
export class BusinessError extends ApiError {
  constructor(message: string) {
    super(message, 422, 'BUSINESS_ERROR');
    this.name = 'BusinessError';
  }
}

/**
 * Request validation helper functions
 */
export const validate = {
  /**
   * Check if a value is a non-empty string
   */
  isNonEmptyString(value: any): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  },

  /**
   * Check if a value is a valid email
   */
  isValidEmail(value: any): boolean {
    if (!this.isNonEmptyString(value)) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value.trim());
  },

  /**
   * Check if a value is a valid Indian phone number (10 digits)
   */
  isValidPhone(value: any): boolean {
    if (!value) return false;
    const digits = String(value).replace(/\D/g, '');
    // Handle country code
    if (digits.length === 12 && digits.startsWith('91')) {
      return /^91[6-9]\d{9}$/.test(digits);
    }
    return /^[6-9]\d{9}$/.test(digits);
  },

  /**
   * Check if a value is a valid MongoDB ObjectId
   */
  isValidObjectId(value: any): boolean {
    if (!value) return false;
    return /^[0-9a-fA-F]{24}$/.test(String(value));
  },

  /**
   * Check if a value is a positive number
   */
  isPositiveNumber(value: any): boolean {
    const num = Number(value);
    return !isNaN(num) && num > 0;
  },

  /**
   * Check if a value is a non-negative number
   */
  isNonNegativeNumber(value: any): boolean {
    const num = Number(value);
    return !isNaN(num) && num >= 0;
  },

  /**
   * Check if a value is a valid date string
   */
  isValidDate(value: any): boolean {
    if (!value) return false;
    const date = new Date(value);
    return !isNaN(date.getTime());
  },

  /**
   * Check if a value is in allowed values array
   */
  isInArray(value: any, allowedValues: any[]): boolean {
    return allowedValues.includes(value);
  }
};

/**
 * Validation assertion helpers - throw ValidationError if validation fails
 */
export const assert = {
  /**
   * Assert that required fields are present
   */
  required(fields: Record<string, any>, fieldLabels?: Record<string, string>): void {
    const missing: string[] = [];
    
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined || value === null || 
          (typeof value === 'string' && value.trim() === '')) {
        const label = fieldLabels?.[field] || field.replace(/([A-Z])/g, ' $1').toLowerCase();
        missing.push(label);
      }
    }
    
    if (missing.length === 1) {
      throw new ValidationError(`${missing[0].charAt(0).toUpperCase() + missing[0].slice(1)} is required`);
    } else if (missing.length > 1) {
      const lastField = missing.pop();
      throw new ValidationError(`${missing.join(', ')} and ${lastField} are required`);
    }
  },

  /**
   * Assert that email is valid
   */
  validEmail(email: any, fieldName: string = 'Email'): void {
    if (!validate.isValidEmail(email)) {
      throw new ValidationError(`${fieldName} is not a valid email address`);
    }
  },

  /**
   * Assert that phone is valid
   */
  validPhone(phone: any, fieldName: string = 'Phone number'): void {
    if (!validate.isValidPhone(phone)) {
      throw new ValidationError(`${fieldName} must be a valid 10-digit Indian mobile number`);
    }
  },

  /**
   * Assert that value is a valid ObjectId
   */
  validObjectId(id: any, fieldName: string = 'ID'): void {
    if (!validate.isValidObjectId(id)) {
      throw new ValidationError(`${fieldName} is not a valid ID format`);
    }
  },

  /**
   * Assert that value is a positive number
   */
  positiveNumber(value: any, fieldName: string = 'Value'): void {
    if (!validate.isPositiveNumber(value)) {
      throw new ValidationError(`${fieldName} must be a positive number`);
    }
  },

  /**
   * Assert that value is a non-negative number
   */
  nonNegativeNumber(value: any, fieldName: string = 'Value'): void {
    if (!validate.isNonNegativeNumber(value)) {
      throw new ValidationError(`${fieldName} must be a non-negative number`);
    }
  },

  /**
   * Assert that value is a valid date
   */
  validDate(value: any, fieldName: string = 'Date'): void {
    if (!validate.isValidDate(value)) {
      throw new ValidationError(`${fieldName} is not a valid date`);
    }
  },

  /**
   * Assert that value is in allowed values
   */
  inArray(value: any, allowedValues: any[], fieldName: string = 'Value'): void {
    if (!validate.isInArray(value, allowedValues)) {
      throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
    }
  },

  /**
   * Assert that array is not empty
   */
  nonEmptyArray(arr: any[], fieldName: string = 'Items'): void {
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new ValidationError(`At least one ${fieldName.toLowerCase()} is required`);
    }
  }
};

/**
 * Helper to wrap async functions for error handling
 */
export const handleAsync = <T>(
  operation: () => Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<T> => {
  return operation().catch((error) => {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(`${errorMessage}: ${error.message}`, 500);
  });
};
