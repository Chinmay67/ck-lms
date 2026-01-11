/**
 * Shared utility functions for field validation and data parsing
 * Used across student and fee bulk upload endpoints
 */

/**
 * Clean and validate phone number
 * Handles various formats including +91 prefix and leading zeros
 * @param phone - Phone number in any format
 * @returns 10-digit cleaned phone number or null if invalid
 */
export function cleanPhoneNumber(phone: string | number): string | null {
  if (!phone) return null;
  
  // Convert to string and remove all non-digit characters
  let cleaned = String(phone).replace(/\D/g, '');
  
  // Handle +91 prefix (Indian country code)
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.length === 11 && cleaned.startsWith('91')) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    // Handle leading zero
    cleaned = cleaned.substring(1);
  }
  
  // Validate: Must be exactly 10 digits starting with 6-9
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return cleaned;
  }
  
  return null;
}

/**
 * Parse Excel date values into JavaScript Date objects
 * Handles Excel serial dates, Date objects, and various string formats
 * @param dateValue - Date value from Excel (number, string, or Date object)
 * @returns Parsed Date object or null if invalid
 */
export function parseExcelDate(dateValue: any): Date | null {
  if (!dateValue || dateValue === 'nan' || String(dateValue).toLowerCase() === 'nan') {
    return null;
  }

  try {
    // Case 1: Already a Date object from xlsx
    if (dateValue instanceof Date) {
      return dateValue;
    }
    
    // Case 2: Excel serial date (number)
    if (typeof dateValue === 'number') {
      // Excel serial date: days since 1900-01-01 (with leap year bug)
      const excelEpoch = new Date(1900, 0, 1);
      const daysOffset = dateValue - 2; // Adjust for Excel's leap year bug
      return new Date(excelEpoch.getTime() + daysOffset * 24 * 60 * 60 * 1000);
    }
    
    // Case 3: String format
    if (typeof dateValue === 'string') {
      const dateStr = dateValue.trim();
      
      // Try yyyy-mm-dd format (ISO format)
      const ymdMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (ymdMatch && ymdMatch[1] && ymdMatch[2] && ymdMatch[3]) {
        const year = parseInt(ymdMatch[1]);
        const month = parseInt(ymdMatch[2]);
        const day = parseInt(ymdMatch[3]);
        return new Date(year, month - 1, day);
      }
      
      // Try dd/mm/yyyy format (Indian/European style)
      const dmyMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dmyMatch && dmyMatch[1] && dmyMatch[2] && dmyMatch[3]) {
        const day = parseInt(dmyMatch[1]);
        const month = parseInt(dmyMatch[2]);
        const year = parseInt(dmyMatch[3]);
        return new Date(year, month - 1, day);
      }
      
      // Try dd-mm-yyyy format
      const dmy2Match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (dmy2Match && dmy2Match[1] && dmy2Match[2] && dmy2Match[3]) {
        const day = parseInt(dmy2Match[1]);
        const month = parseInt(dmy2Match[2]);
        const year = parseInt(dmy2Match[3]);
        return new Date(year, month - 1, day);
      }
      
      // Fallback to standard Date parsing
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn(`Failed to parse date: ${dateValue}`);
  }
  
  return null;
}

/**
 * Generate combinedSkill field consistently from stage and level
 * @param stage - Student's stage (beginner, intermediate, advanced)
 * @param level - Student's level (1, 2, 3)
 * @returns Formatted combined skill string
 */
export function generateCombinedSkill(stage: string, level: number): string {
  const stageCapitalized = stage.charAt(0).toUpperCase() + stage.slice(1);
  return `${stageCapitalized} Level - ${level}`;
}

/**
 * Validate email format
 * @param email - Email address to validate
 * @returns true if valid email format, false otherwise
 */
export function isValidEmail(email: any): boolean {
  if (!email || email === 'nan' || String(email).toLowerCase() === 'nan') {
    return false;
  }
  
  const emailStr = String(email).trim();
  if (!emailStr) return false;
  
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(emailStr);
}

/**
 * Parse level field from Excel (B1, B2, I1, etc.) to stage and level
 * @param level - Level code from Excel (e.g., "B1", "I2", "A3")
 * @returns Object with stage and level, or empty object if invalid
 */
export function parseLevelField(level: string): { stage?: 'beginner' | 'intermediate' | 'advanced'; level?: 1 | 2 | 3 } {
  if (!level || level === 'nan') return {};
  
  const levelStr = String(level).trim().toUpperCase();
  
  // Map level codes to stage and level
  const levelMap: { [key: string]: { stage: 'beginner' | 'intermediate' | 'advanced'; level: 1 | 2 | 3 } } = {
    'B1': { stage: 'beginner', level: 1 },
    'B2': { stage: 'beginner', level: 2 },
    'B3': { stage: 'beginner', level: 3 },
    'I1': { stage: 'intermediate', level: 1 },
    'I2': { stage: 'intermediate', level: 2 },
    'I3': { stage: 'intermediate', level: 3 },
    'A1': { stage: 'advanced', level: 1 },
    'A2': { stage: 'advanced', level: 2 },
    'A3': { stage: 'advanced', level: 3 },
  };
  
  // Remove spaces and parse
  const code = levelStr.replace(/\s+/g, '');
  
  return levelMap[code] || {};
}

/**
 * Parse status field to determine if student is active
 * @param status - Status from Excel (Active, Irregular, Discontinued, etc.)
 * @returns true if active, false if discontinued
 */
export function parseStatus(status: any): boolean {
  if (!status || status === 'nan') return true; // Default to active
  
  const statusStr = String(status).toLowerCase().trim();
  
  // Only mark as inactive if explicitly "discontinued"
  if (statusStr === 'discontinued' || statusStr === 'discontinue') {
    return false;
  }
  
  // All other statuses (including "irregular") are active
  return true;
}

/**
 * Normalize payment status from Excel
 * @param status - Payment status from Excel
 * @returns Normalized status
 */
export function normalizePaymentStatus(status: any): 'upcoming' | 'paid' | 'overdue' | 'partially_paid' | 'discontinued' {
  if (!status || status === 'nan' || String(status).toLowerCase() === 'nan' || String(status).trim() === '') {
    return 'upcoming';
  }
  
  const statusStr = String(status).toLowerCase().trim();
  
  if (statusStr === 'paid' || statusStr === 'Paid' || statusStr === 'PAID') {
    return 'paid';
  }
  
  if (statusStr === 'discontinued' || statusStr === 'DISCONTINUED') {
    return 'discontinued';
  }
  
  if (statusStr === 'ab' || statusStr === 'AB') {
    return 'upcoming'; // AB (absent) treated as upcoming
  }
  
  return 'upcoming';
}
