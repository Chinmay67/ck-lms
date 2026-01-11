# Excel Data Conversion Summary

## Overview

This document explains the analysis and conversion of the Students.xlsx file for bulk import into the LMS system.

## Analysis Completed

### 1. Bulk Upload Systems Analyzed

**Student Bulk Upload (`/api/students/bulk-upload`)**
- Accepts Excel files with student data
- Required fields: Name, Contact Number OR E-mail (at least one)
- Optional fields: Parent Name, Date of Birth, Address, Referred By, Status, Student Start Date, Level, Batch
- Validates phone numbers (10 digits, starts with 6-9)
- Validates email format
- Parses Level field (B1, B2, I1, etc.) into stage and level
- Creates students if they don't exist, updates if they do (based on phone/email)

**Fee Bulk Upload (`/api/fees/bulk-upload`)**
- Accepts Excel files with fee payment data
- Required field: student_identifier (phone number or email)
- Supports up to 4 payment cycles per row:
  - Payment Due date, Payment Status, Payment date
  - Payment Due date.1, Payment Status.1, Payment date.1
  - Payment Due date.2, Payment Status.2, Payment date.2
  - Payment Due date.3, Payment Status.3, Payment date.3
- Automatically matches students by identifier
- Normalizes payment status (PAID, upcoming, overdue, DISCONTINUED)

### 2. Source Excel File Analysis

**File**: Students.xlsx on Desktop
**Sheet Analyzed**: "Student"
**Total Rows**: 83 student records

**Data Structure**:
- Student information: Name, Contact Number, E-mail, Status, Start Date, Level, Batch, Timing
- Payment cycles: 4 payment cycles with Due date, Status, and Payment date
- Issues identified:
  - 59 rows missing both phone and email (cannot be imported)
  - Mixed date formats (Excel serial dates and text dates)
  - Inconsistent payment status values (PAID, paid, Paid, AB, etc.)
  - Combined batch/timing information needs consolidation

## Conversion Process

### Script Created
**File**: `server/scripts/ConvertStudentsExcel.ts`

### What the Script Does

1. **Reads the Students.xlsx** file from Desktop
2. **Validates each row**:
   - Skips rows without phone OR email
   - Cleans phone numbers (removes spaces, country codes, validates format)
   - Validates email format
3. **Creates two new formatted sheets**:
   - **Students_Formatted**: Ready for student bulk upload
   - **Fees_Formatted**: Ready for fee bulk upload

### Conversion Results

✅ **Successfully Converted**: 24 students
- Students with valid phone numbers or emails
- All data cleaned and formatted for bulk import

❌ **Skipped**: 59 students
- Missing both phone number and email
- Cannot be imported without contact information

### Students Skipped (Contact Info Missing)

These students need manual data entry or contact information update:

SMARAN, PRAANJALI PUNEETH, CHIRANTH, SHRAVAN P IYER, PRAYANSH BHAT, ATHARVA, CHAYAN LODHA, AN SIDDHARTH, SIDDHARTH BHAGWAT, ANEGAN, NAMAN, PARVESH MANYU, HIMANK, SAI RAKSHITH, KRITHIK LAKSHMAN, RITHIK KRISHNA, SHIVIN KALMATH, SAI VYOM, SARAYU, KAVIN, SUDIKSHA, VIDHARTH, GAURI KIRAN, SAMMANVI SHETTY, PREETHI, NAINIKA, NITHYUSHA, HITESH KARTHIK, KRUTARTH, MOKSHITH, SHRESHTA, SAI SHRIKA, DHANVANT CHERIAN, ADITYA GOWDA, ARNAV, MITHRAN, AVYUKTH, KSHITIJ, DIVIK CHANDRASHEKAR, RATHANGG, DAKSHITHA P, AVYUKT BORSE, RUDRANSH DESHMUKH, ETHAN STANLEY, AYAAN JAIN, VIBHA SHREE, ABHIMANYU, ANEESH RAKAW, AARNA SHIVKUMAR, LIKITH MURTHY, VIKRAM, PRANAV MITHRAN, NEIL RUDRA, THANMAY, KRIYA SHETTAR, KRISHYA SHARMA, ADWAITH, AYANSH GUPTA, ADHRIT HERLE

## How to Use the Converted Data

### Step 1: Open the Modified Excel File
The original Students.xlsx file now contains two new sheets:
- **Students_Formatted**
- **Fees_Formatted**

### Step 2: Import Students
1. Log into the LMS application
2. Navigate to the Students section
3. Click "Bulk Upload"
4. Select the **Students_Formatted** sheet from Students.xlsx
5. Review the preview and confirm import

### Step 3: Import Fees
1. After students are imported, navigate to the Fees section
2. Click "Bulk Upload Fees"
3. Select the **Fees_Formatted** sheet from Students.xlsx
4. Review the preview and confirm import

### Step 4: Handle Skipped Students
For the 59 skipped students:
1. Gather their phone numbers or email addresses
2. Either:
   - Add them manually through the UI
   - Update the original Excel with contact info and re-run the conversion script

## Data Transformations Applied

### Student Data
- **Phone Numbers**: Cleaned to 10-digit format (removed spaces, country codes)
- **Emails**: Validated format, kept only valid emails
- **Dates**: Converted to YYYY-MM-DD format
- **Batch**: Combined Batch and Timing fields when different
- **Level**: Kept as-is (B1, B2, I1, etc. - will be parsed during import)
- **Status**: Preserved from original

### Fee Data
- **Payment Status**: Normalized to uppercase PAID or empty
- **Dates**: Converted to YYYY-MM-DD format
- **Student Identifier**: Uses phone if available, otherwise email
- **Payment Cycles**: Up to 4 cycles per student preserved
- **Special Cases**:
  - "AB" (absent) → empty/upcoming
  - "DISCONTINUED" → DISCONTINUED
  - Empty cells → empty/upcoming

## Running the Conversion Script

If you need to re-run the conversion (after updating the source data):

```bash
cd server
npx tsx scripts/ConvertStudentsExcel.ts
```

The script will:
- Read Students.xlsx from your Desktop
- Create/update the Students_Formatted and Fees_Formatted sheets
- Display a summary of converted and skipped rows

## Important Notes

1. **Contact Information is Required**: Students without phone OR email cannot be imported
2. **Identifier Matching**: The fee import matches students using phone (preferred) or email
3. **Updates vs Creates**: If a student with the same phone/email exists, they'll be updated
4. **Payment Cycles**: The system supports multiple payment cycles per student
5. **Data Validation**: The bulk upload endpoints validate all data before import
6. **Skipped Students**: The 59 students without contact info need to be added manually

## Technical Details

### Files Modified
- `server/scripts/ConvertStudentsExcel.ts` - New conversion script
- `Students.xlsx` (on Desktop) - Added two new formatted sheets

### Utilities Used
- `cleanPhoneNumber()` - From `server/src/utils/fieldValidation.ts`
- `parseExcelDate()` - From `server/src/utils/fieldValidation.ts`
- `xlsx` library - For Excel file manipulation

### Date Handling
The script handles multiple date formats:
- Excel serial dates (numeric)
- YYYY-MM-DD format
- DD/MM/YYYY format
- DD-MM-YYYY format

## Next Steps

1. ✅ Review the converted data in Students_Formatted and Fees_Formatted sheets
2. ⏭️ Use the bulk upload feature in the UI to import students
3. ⏭️ Use the bulk upload feature in the UI to import fees
4. ⏭️ Manually add the 59 students with missing contact information
5. ⏭️ Verify all data in the system

## Support

If you encounter any issues:
- Check the console output for specific error messages
- Verify the Excel file structure matches the expected format
- Ensure all required fields have valid data
- Contact support for assistance with data formatting
