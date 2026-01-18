/**
 * Batch Parsing Utilities
 * Handles parsing of batch codes from Excel data
 */

export interface ParsedBatchInfo {
  batchCode: string;
  days: string[];
  time: string;
  timing: string; // Full timing string for description
  isValid: boolean;
  error?: string;
}

/**
 * Parse batch code from Excel format
 * Examples:
 * - "WF:2:30(U)" -> {days: ['wednesday', 'friday'], time: '2:30', timing: 'WF:2:30(U)'}
 * - "SS:4:30" -> {days: ['saturday', 'sunday'], time: '4:30', timing: 'SS:4:30'}
 * - "TT:5:30(u)" -> {days: ['tuesday', 'thursday'], time: '5:30', timing: 'TT:5:30(u)'}
 * 
 * Note: Preserves suffix in parentheses (e.g., (u), (U)) as they distinguish different batches
 */
export function parseBatchCode(batchCodeRaw: string | null | undefined): ParsedBatchInfo {
  if (!batchCodeRaw || typeof batchCodeRaw !== 'string') {
    return {
      batchCode: '',
      days: [],
      time: '',
      timing: '',
      isValid: false,
      error: 'Batch code is empty or invalid'
    };
  }

  const originalBatchCode = batchCodeRaw.trim();
  
  // Extract suffix in parentheses if present (e.g., (u), (U), (p))
  const suffixMatch = originalBatchCode.match(/\([^)]*\)$/);
  const suffix = suffixMatch ? suffixMatch[0] : '';
  
  // Remove suffix temporarily for parsing
  const codeWithoutSuffix = originalBatchCode.replace(/\([^)]*\)$/g, '').trim();

  // Parse format: DAY_CODES:HOUR:MINUTE
  // e.g., WF:2:30, SS:4:30, TT:5:30
  const parts = codeWithoutSuffix.split(':');
  
  if (parts.length < 3) {
    return {
      batchCode: originalBatchCode,
      days: [],
      time: '',
      timing: originalBatchCode,
      isValid: false,
      error: 'Invalid batch code format. Expected format: DAY:HOUR:MINUTE (e.g., WF:2:30)'
    };
  }

  const dayCode = parts[0].toUpperCase();
  const hour = parseInt(parts[1], 10);
  const minute = parts[2];
  
  // Convert to 24-hour format (assuming PM)
  // If hour is 1-11, add 12 to make it PM (13-23)
  // If hour is 12, keep it as 12 (12 PM)
  const hour24 = hour === 12 ? 12 : hour + 12;
  const time = `${String(hour24).padStart(2, '0')}:${minute}`;

  // Map day codes to full day names
  const dayMapping: { [key: string]: string[] } = {
    'M': ['monday'],
    'T': ['tuesday'],
    'W': ['wednesday'],
    'TH': ['thursday'],
    'F': ['friday'],
    'S': ['saturday'],
    'SU': ['sunday'],
    // Common combinations
    'MW': ['monday', 'wednesday'],
    'WF': ['wednesday', 'friday'],
    'TT': ['tuesday', 'thursday'],
    'SS': ['saturday', 'sunday'],
    'MWF': ['monday', 'wednesday', 'friday'],
    'TTH': ['tuesday', 'thursday']
  };

  const days = dayMapping[dayCode] || [];

  if (days.length === 0) {
    return {
      batchCode: originalBatchCode,
      days: [],
      time,
      timing: originalBatchCode,
      isValid: false,
      error: `Unknown day code: ${dayCode}. Supported codes: ${Object.keys(dayMapping).join(', ')}`
    };
  }

  // Reconstruct batch code with suffix preserved
  const finalBatchCode = codeWithoutSuffix + suffix;

  return {
    batchCode: finalBatchCode,
    days,
    time,
    timing: finalBatchCode,
    isValid: true
  };
}

/**
 * Generate a unique batch code by adding a suffix if collision detected
 * @param baseBatchCode The base batch code (e.g., "WF:2:30")
 * @param existingBatchCodes Array of existing batch codes to check against
 * @returns A unique batch code
 */
export function generateUniqueBatchCode(
  baseBatchCode: string,
  existingBatchCodes: string[]
): string {
  if (!existingBatchCodes.includes(baseBatchCode)) {
    return baseBatchCode;
  }

  // Add numeric suffix until we find a unique code
  let suffix = 1;
  let uniqueCode = `${baseBatchCode}-${suffix}`;
  
  while (existingBatchCodes.includes(uniqueCode)) {
    suffix++;
    uniqueCode = `${baseBatchCode}-${suffix}`;
  }

  return uniqueCode;
}

/**
 * Validate if a date string is actually a valid date
 * @param dateStr Date string to validate
 * @returns true if valid date, false otherwise
 */
export function isValidDate(dateStr: any): boolean {
  if (!dateStr) return false;
  
  // Check if it's a string that looks like "need to start batch" or similar
  if (typeof dateStr === 'string') {
    const lowerStr = dateStr.toLowerCase().trim();
    if (
      lowerStr.includes('need') ||
      lowerStr.includes('start') ||
      lowerStr.includes('batch') ||
      lowerStr.includes('tbd') ||
      lowerStr.includes('pending')
    ) {
      return false;
    }
  }

  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Parse and validate a date from Excel
 * @param dateValue The date value from Excel (could be Date, string, or number)
 * @returns Date object or null if invalid
 */
export function parseExcelDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  
  // If already a Date object
  if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
    return dateValue;
  }

  // If it's a string, try to parse it
  if (typeof dateValue === 'string') {
    // Check if it's a text indicator (not a date)
    if (!isValidDate(dateValue)) {
      return null;
    }
    
    const parsed = new Date(dateValue);
    return !isNaN(parsed.getTime()) ? parsed : null;
  }

  // If it's an Excel serial number
  if (typeof dateValue === 'number') {
    // Excel serial date: days since 1900-01-01 (with leap year bug)
    const excelEpoch = new Date(1900, 0, 1);
    const days = dateValue - 2; // Adjust for Excel's leap year bug
    const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
    return !isNaN(date.getTime()) ? date : null;
  }

  return null;
}

/**
 * Check if a student status indicates they are discontinued
 * @param status The status string from Excel
 * @returns true if student is discontinued
 */
export function isDiscontinued(status: string | null | undefined): boolean {
  if (!status) return false;
  
  const statusLower = status.toString().toLowerCase().trim();
  return (
    statusLower.includes('discontin') ||
    statusLower.includes('stopped') ||
    statusLower.includes('left') ||
    statusLower.includes('withdrawn')
  );
}

/**
 * Clean and normalize phone number
 * @param phone Phone number string
 * @returns Cleaned phone number or empty string
 */
export function cleanPhoneNumber(phone: any): string {
  if (!phone) return '';
  
  const phoneStr = phone.toString().trim();
  // Remove all non-digit characters except +
  return phoneStr.replace(/[^\d+]/g, '');
}

/**
 * Clean and normalize email
 * @param email Email string
 * @returns Cleaned email or empty string
 */
export function cleanEmail(email: any): string {
  if (!email) return '';
  
  const emailStr = email.toString().trim().toLowerCase();
  // Basic email validation
  if (emailStr.includes('@') && emailStr.includes('.')) {
    return emailStr;
  }
  
  return '';
}

/**
 * Parse course level from Excel format
 * Examples: "B1" -> {stage: 'beginner', level: 1}
 *          "I 1" -> {stage: 'intermediate', level: 1}
 *          "A2" -> {stage: 'advanced', level: 2}
 */
export function parseCourseLevel(levelStr: string | null | undefined): {
  stage: 'beginner' | 'intermediate' | 'advanced' | null;
  level: number | null;
} {
  if (!levelStr || typeof levelStr !== 'string') {
    return { stage: null, level: null };
  }

  const cleaned = levelStr.trim().toUpperCase().replace(/\s+/g, '');
  
  // Extract stage letter and level number
  const match = cleaned.match(/^([BIA])(\d)$/);
  
  if (!match) {
    return { stage: null, level: null };
  }

  const stageCode = match[1];
  const levelNum = parseInt(match[2], 10);

  const stageMap: { [key: string]: 'beginner' | 'intermediate' | 'advanced' } = {
    'B': 'beginner',
    'I': 'intermediate',
    'A': 'advanced'
  };

  return {
    stage: stageMap[stageCode] || null,
    level: levelNum
  };
}
