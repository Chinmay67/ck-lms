/**
 * WhatsApp utility functions for sending reminders
 */

/**
 * Format phone number for WhatsApp (add country code if missing)
 * @param phone - Phone number to format
 * @param countryCode - Country code (default: 91 for India)
 * @returns Formatted phone number or null if invalid
 */
export const formatPhoneForWhatsApp = (phone: string | undefined, countryCode: string = '91'): string | null => {
  if (!phone) return null;
  
  // Remove all non-digit characters
  let cleanPhone = phone.replace(/\D/g, '');
  
  // If phone is empty after cleaning, return null
  if (!cleanPhone) return null;
  
  // If phone doesn't start with country code, add it
  if (!cleanPhone.startsWith(countryCode)) {
    cleanPhone = countryCode + cleanPhone;
  }
  
  // Validate phone number length (should be reasonable)
  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return null;
  }
  
  return cleanPhone;
};

/**
 * Generate WhatsApp message for fee reminder
 * @param studentName - Name of the student
 * @param instituteName - Name of the institute (optional)
 * @returns Pre-formatted message text
 */
export const generateFeeReminderMessage = (
  studentName: string,
  instituteName: string = 'our institute'
): string => {
  const message = `Hello ${studentName},

This is a gentle reminder about your pending fee payment at ${instituteName}.

We request you to kindly make the payment at your earliest convenience to avoid any interruption in your classes.

For any queries or assistance regarding payment, please feel free to contact us.

Thank you for your cooperation!`;

  return message;
};

/**
 * Generate WhatsApp URL with pre-filled message
 * @param phone - Phone number (will be formatted automatically)
 * @param message - Message text (will be URL encoded)
 * @returns WhatsApp URL or null if phone is invalid
 */
export const generateWhatsAppURL = (phone: string | undefined, message: string): string | null => {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  
  if (!formattedPhone) return null;
  
  // URL encode the message
  const encodedMessage = encodeURIComponent(message);
  
  // Generate WhatsApp URL (works for both web and mobile)
  return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
};

/**
 * Send WhatsApp fee reminder
 * @param studentName - Name of the student
 * @param phone - Phone number
 * @param instituteName - Name of the institute (optional)
 * @returns Opens WhatsApp with pre-filled message or returns null if phone is invalid
 */
export const sendWhatsAppReminder = (
  studentName: string,
  phone: string | undefined,
  instituteName?: string
): void => {
  const message = generateFeeReminderMessage(studentName, instituteName);
  const url = generateWhatsAppURL(phone, message);
  
  if (url) {
    window.open(url, '_blank');
  } else {
    console.error('Invalid phone number for WhatsApp');
  }
};

/**
 * Check if phone number is valid for WhatsApp
 * @param phone - Phone number to validate
 * @returns true if valid, false otherwise
 */
export const isValidWhatsAppPhone = (phone: string | undefined): boolean => {
  return formatPhoneForWhatsApp(phone) !== null;
};
