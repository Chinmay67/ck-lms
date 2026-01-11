/**
 * Frontend error handling utilities for meaningful error messages
 */

import toast from 'react-hot-toast';

/**
 * Error codes mapped to user-friendly messages
 */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  // Authentication errors
  UNAUTHORIZED: 'Please log in to continue',
  TOKEN_EXPIRED: 'Your session has expired. Please log in again.',
  INVALID_TOKEN: 'Your session is invalid. Please log in again.',
  FORBIDDEN: 'You don\'t have permission to perform this action',
  
  // Validation errors
  VALIDATION_ERROR: 'Please check your input and try again',
  DUPLICATE_ERROR: 'This record already exists',
  
  // Network errors
  NETWORK_ERROR: 'Unable to connect to the server. Please check your internet connection.',
  TIMEOUT_ERROR: 'The request timed out. Please try again.',
  
  // Server errors
  DB_CONNECTION_ERROR: 'Unable to connect to the database. Please try again later.',
  DB_TIMEOUT: 'The database operation timed out. Please try again.',
  INTERNAL_ERROR: 'Something went wrong. Please try again later.',
  
  // File upload errors
  FILE_UPLOAD_ERROR: 'Failed to upload the file. Please try again.',
  FILE_TOO_LARGE: 'The file is too large. Maximum size is 5MB.',
  INVALID_FILE_TYPE: 'Invalid file type. Please upload a valid file.',
};

/**
 * HTTP status code to user-friendly messages (fallback)
 */
const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your input.',
  401: 'Please log in to continue.',
  403: 'You don\'t have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'This record conflicts with existing data.',
  413: 'The file is too large to upload.',
  422: 'Unable to process your request. Please check your input.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again later.',
  502: 'Server is temporarily unavailable. Please try again later.',
  503: 'Service is temporarily unavailable. Please try again later.',
  504: 'The request timed out. Please try again.',
};

/**
 * Field name to user-friendly label mapping
 */
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
  transactionId: 'Transaction ID',
  remarks: 'Remarks',
};

/**
 * Get user-friendly field name
 */
export const getFieldLabel = (fieldName: string): string => {
  return FIELD_LABELS[fieldName] || 
    fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
};

/**
 * Parsed error structure
 */
export interface ParsedError {
  message: string;
  errorCode?: string;
  field?: string;
  statusCode?: number;
  isNetworkError?: boolean;
  isAuthError?: boolean;
  originalError?: any;
}

/**
 * Parse an error from axios or other sources into a user-friendly format
 */
export const parseError = (error: any): ParsedError => {
  // Handle null/undefined
  if (!error) {
    return {
      message: 'An unexpected error occurred',
      isNetworkError: false,
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      message: error,
    };
  }

  // Handle axios errors
  if (error.response) {
    const { status, data } = error.response;
    
    let message = data?.error || data?.message || HTTP_STATUS_MESSAGES[status] || 'Something went wrong';
    const errorCode = data?.errorCode;
    
    // Use error code message if available
    if (errorCode && ERROR_CODE_MESSAGES[errorCode]) {
      message = ERROR_CODE_MESSAGES[errorCode];
    }
    
    return {
      message,
      errorCode,
      statusCode: status,
      isAuthError: status === 401 || status === 403,
      originalError: error,
    };
  }

  // Handle network errors (no response)
  if (error.request && !error.response) {
    let message = ERROR_CODE_MESSAGES.NETWORK_ERROR;
    
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      message = ERROR_CODE_MESSAGES.TIMEOUT_ERROR;
    }
    
    return {
      message,
      errorCode: error.code || 'NETWORK_ERROR',
      isNetworkError: true,
      originalError: error,
    };
  }

  // Handle Error objects
  if (error instanceof Error) {
    return {
      message: error.message || 'An unexpected error occurred',
      originalError: error,
    };
  }

  // Handle objects with message property
  if (error.message) {
    return {
      message: error.message,
      errorCode: error.errorCode || error.code,
      originalError: error,
    };
  }

  // Fallback
  return {
    message: 'An unexpected error occurred',
    originalError: error,
  };
};

/**
 * Get user-friendly error message from any error
 */
export const getErrorMessage = (error: any): string => {
  return parseError(error).message;
};

/**
 * Show error toast with parsed message
 */
export const showErrorToast = (error: any, fallbackMessage?: string): void => {
  const parsed = parseError(error);
  toast.error(parsed.message || fallbackMessage || 'Something went wrong');
};

/**
 * Show success toast
 */
export const showSuccessToast = (message: string): void => {
  toast.success(message);
};

/**
 * Show info toast
 */
export const showInfoToast = (message: string): void => {
  toast(message, { icon: 'ℹ️' });
};

/**
 * Show warning toast
 */
export const showWarningToast = (message: string): void => {
  toast(message, { icon: '⚠️' });
};

/**
 * Handle API response errors
 * Returns true if error was handled, false if it should be propagated
 */
export const handleApiError = (
  error: any, 
  options?: {
    showToast?: boolean;
    fallbackMessage?: string;
    onAuthError?: () => void;
    onNetworkError?: () => void;
  }
): ParsedError => {
  const parsed = parseError(error);
  const { showToast = true, fallbackMessage, onAuthError, onNetworkError } = options || {};
  
  // Handle auth errors
  if (parsed.isAuthError && onAuthError) {
    onAuthError();
  }
  
  // Handle network errors
  if (parsed.isNetworkError && onNetworkError) {
    onNetworkError();
  }
  
  // Show toast if enabled
  if (showToast) {
    toast.error(parsed.message || fallbackMessage || 'Something went wrong');
  }
  
  return parsed;
};

/**
 * Format validation errors from backend
 */
export const formatValidationErrors = (errors: Record<string, string>): string => {
  const messages = Object.entries(errors).map(([field, message]) => {
    const label = getFieldLabel(field);
    return `${label}: ${message}`;
  });
  
  return messages.join('\n');
};

/**
 * Check if error is a network connectivity error
 */
export const isNetworkError = (error: any): boolean => {
  return parseError(error).isNetworkError === true;
};

/**
 * Check if error is an authentication error
 */
export const isAuthError = (error: any): boolean => {
  return parseError(error).isAuthError === true;
};

/**
 * Check if error is a validation error
 */
export const isValidationError = (error: any): boolean => {
  const parsed = parseError(error);
  return parsed.statusCode === 400 || parsed.errorCode === 'VALIDATION_ERROR';
};

/**
 * Check if error is a not found error
 */
export const isNotFoundError = (error: any): boolean => {
  const parsed = parseError(error);
  return parsed.statusCode === 404 || parsed.errorCode === 'NOT_FOUND';
};

/**
 * Check if error is a duplicate/conflict error
 */
export const isDuplicateError = (error: any): boolean => {
  const parsed = parseError(error);
  return parsed.statusCode === 409 || parsed.errorCode === 'DUPLICATE_ERROR';
};

/**
 * Format error for display in forms
 */
export const getFormError = (error: any, field?: string): string | null => {
  const parsed = parseError(error);
  
  if (parsed.field === field || !field) {
    return parsed.message;
  }
  
  return null;
};

/**
 * Create a retry-able error handler
 */
export const createRetryHandler = (
  maxRetries: number = 3,
  delayMs: number = 1000
) => {
  let retryCount = 0;
  
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    while (true) {
      try {
        const result = await operation();
        retryCount = 0; // Reset on success
        return result;
      } catch (error: any) {
        const parsed = parseError(error);
        
        // Don't retry auth errors or validation errors
        if (parsed.isAuthError || parsed.statusCode === 400 || parsed.statusCode === 404) {
          throw error;
        }
        
        // Retry on network/server errors
        if (retryCount < maxRetries && (parsed.isNetworkError || (parsed.statusCode && parsed.statusCode >= 500))) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, delayMs * retryCount));
          continue;
        }
        
        throw error;
      }
    }
  };
};
