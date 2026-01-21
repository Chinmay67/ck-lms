/**
 * Date and time formatting utilities
 */

/**
 * Format fee month from YYYY-MM to readable format
 * @param feeMonth - Fee month in YYYY-MM format (e.g., "2026-01")
 * @returns Formatted month name (e.g., "January 2026")
 */
export function formatFeeMonth(feeMonth: string): string {
  // Handle both YYYY-MM format and legacy "Month YYYY" format
  const numericMatch = feeMonth.match(/^(\d{4})-(\d{1,2})$/);
  
  if (numericMatch) {
    const year = numericMatch[1];
    const monthNum = parseInt(numericMatch[2], 10);
    
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const monthName = months[monthNum - 1];
    return monthName ? `${monthName} ${year}` : feeMonth;
  }
  
  // Already in readable format or unrecognized - return as is
  return feeMonth;
}

/**
 * Format fee month to short format (e.g., "Jan 2026")
 * @param feeMonth - Fee month in YYYY-MM format (e.g., "2026-01")
 * @returns Short month name (e.g., "Jan 2026")
 */
export function formatFeeMonthShort(feeMonth: string): string {
  const numericMatch = feeMonth.match(/^(\d{4})-(\d{1,2})$/);
  
  if (numericMatch) {
    const year = numericMatch[1];
    const monthNum = parseInt(numericMatch[2], 10);
    
    const monthsShort = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    
    const monthName = monthsShort[monthNum - 1];
    return monthName ? `${monthName} ${year}` : feeMonth;
  }
  
  // Try to parse "Month YYYY" format and convert to short
  const longMatch = feeMonth.match(/^(\w+)\s+(\d{4})$/);
  if (longMatch) {
    const monthName = longMatch[1];
    const year = longMatch[2];
    
    const monthShortMap: Record<string, string> = {
      'January': 'Jan', 'February': 'Feb', 'March': 'Mar', 'April': 'Apr',
      'May': 'May', 'June': 'Jun', 'July': 'Jul', 'August': 'Aug',
      'September': 'Sep', 'October': 'Oct', 'November': 'Nov', 'December': 'Dec'
    };
    
    const shortMonth = monthShortMap[monthName];
    return shortMonth ? `${shortMonth} ${year}` : feeMonth;
  }
  
  return feeMonth;
}

/**
 * Parse fee month to Date object
 * @param feeMonth - Fee month in YYYY-MM format or "Month YYYY"
 * @returns Date object set to the 1st of the month
 */
export function parseFeeMonth(feeMonth: string): Date | null {
  // Try YYYY-MM format first
  const numericMatch = feeMonth.match(/^(\d{4})-(\d{1,2})$/);
  if (numericMatch) {
    const year = parseInt(numericMatch[1], 10);
    const month = parseInt(numericMatch[2], 10) - 1; // 0-indexed
    return new Date(year, month, 1);
  }
  
  // Try "Month YYYY" format
  const longMatch = feeMonth.match(/^(\w+)\s+(\d{4})$/);
  if (longMatch) {
    const monthName = longMatch[1];
    const year = parseInt(longMatch[2], 10);
    
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const monthIndex = months.indexOf(monthName);
    if (monthIndex !== -1) {
      return new Date(year, monthIndex, 1);
    }
  }
  
  return null;
}

/**
 * Format a date to readable format
 * @param date - Date object or ISO string
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-US', options);
}

/**
 * Format a date to relative time (e.g., "2 days ago", "in 3 days")
 * @param date - Date object or ISO string
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0) return `In ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}
