# Student Ingestion System - Complete Guide

## Overview

This document describes the complete student ingestion system that processes Excel data and imports students, batches, credits, and fee records into the CK-LMS system.

## Key Features Implemented

### 1. Flexible Contact Information
- **Old System**: Required both email AND phone number
- **New System**: Requires at least ONE of email OR phone number
- **Important**: Email is required for user account creation during ingestion
- Validation ensures student creation is prevented if both are missing

### 1.1 Automatic User Account Creation
When a student is created via ingestion:
- **User Account**: Automatically created for each student
- **Login Credentials**:
  - **Email**: Same as student email
  - **Password**: 
    - If student has phone number → Phone number is used as password
    - If student has no phone → Default password: `Student@123`
- **Role**: 'user' (can login to view their own data)
- **Status**: Active by default

**Security Note**: Admin should instruct students to change their password on first login.

### 2. Enhanced Credit System
Credits are now stored with detailed tracking:
- **Due Date**: Optional - when the credit was expected to be used
- **Paid Date**: Required - when the payment was actually received
- **Multiple Credits**: Admin can add multiple credit entries for a single student
- **Credit Types**: 
  - `advance_payment`: Pre-payment before batch assignment
  - `excess_payment`: Overpayment that gets credited
  - `refund_reversal`: Adjustment from refund reversals
  - `other`: General credits

### 3. Smart Fee Record Creation
The system intelligently creates fee records based on:
- Student's course duration
- Payments already made
- Due dates and paid dates from Excel
- Whether student has an active batch

**Rules:**
- Only create fee records for months with actual payments (paid date exists)
- Don't create duplicate pending records
- Create one pending/upcoming record for current/next month
- Fee status (paid/overdue/upcoming) is computed dynamically based on current date

### 4. Batch Management
Batches are created/linked based on Excel data:
- **Format**: `WF:2:30(U)` → Wednesday & Friday, 2:30 PM, (U) for unknown/other info
- **Draft Batches**: Created when batch start date is not yet confirmed
- **Active Batches**: Created when batch has started
- **Conversion**: Draft batches can be converted to active with a start date

### 5. Inactive Student Handling
When "discontinued" appears in any Excel column:
- Student is marked as inactive
- All pending fees are removed
- Overdue fees are retained for record-keeping

## Excel Data Structure

### Required Columns
| Column | Description | Example |
|--------|-------------|---------|
| Name | Student name | RISHALI |
| Contact Number | Phone number | 99866 13044 |
| E-mail | Email address | student@example.com |
| Status | Student status | Active/Irregular/discontinued |
| Student Start Date | When student joined | 2025-10-25 |
| Level | Course level | B1, I1, B2 |
| Duration | Course duration in months | 4, 6, 7 |
| Batch | Batch identifier | SS:2:30(U) |
| Timing | Batch timing description | SS:2:30 |
| Batch Start Date | When batch started | 2025-10-25 or "need to start batch" |

### Payment Columns (Repeating Pattern)
For each payment period:
- **Payment Due date**: When payment was due
- **Payment Status**: PAID, pending, etc.
- **Payment date**: When payment was received (optional if not paid)

## Ingestion Logic Flow

### 1. Student Processing

```
For each row in Excel:
  ├─ Validate contact info (email OR phone must exist)
  ├─ Check for "discontinued" status → Mark inactive
  ├─ Parse course level (B1, I1, B2, etc.)
  ├─ Create/Update student record
  └─ Process batch assignment
```

### 2. Batch Processing

```
If batch ID exists in Excel:
  ├─ Check if batch start date is valid
  │  ├─ YES → Create ACTIVE batch
  │  └─ NO  → Create DRAFT batch
  ├─ Parse batch format (e.g., WF:2:30(U))
  │  ├─ Extract days: WF → Wednesday, Friday
  │  ├─ Extract time: 2:30
  │  └─ Store timing in description
  └─ Link student to batch
```

### 3. Payment Processing

```
For each payment column set:
  ├─ Check if paid date exists
  │  ├─ YES → Process as payment
  │  │  ├─ Student has batch?
  │  │  │  ├─ YES → Create fee record
  │  │  │  └─ NO  → Create credit
  │  │  └─ Store with due date and paid date
  │  └─ NO → Skip (don't create fee or credit record)
  └─ Continue to next payment set
```

**Important Rule**: Fee records and credits are ONLY created when a paid date exists. If a payment has a due date but no paid date, it is skipped entirely.

### 4. Fee Record Creation

```
When creating fee records:
  ├─ Calculate fee month based on batch/student start date
  ├─ Check if record already exists for that month
  │  └─ Skip if exists
  ├─ Create fee record with:
  │  ├─ Due date from Excel
  │  ├─ Paid date from Excel
  │  ├─ Amount from course configuration
  │  └─ Status (computed from dates)
  └─ Create pending record for next month (if within course duration)
```

### 5. Credit Creation

```
When student has no batch but has payments:
  ├─ Create credit record with:
  │  ├─ Due date (if specified)
  │  ├─ Paid date (required)
  │  ├─ Amount
  │  └─ Type: advance_payment
  └─ Credits will auto-apply when batch is assigned
```

## Special Cases

### Case 1: Student Without Batch
- **Scenario**: Payment received but batch not yet assigned
- **Action**: Store as credit with due/paid dates
- **Later**: When batch assigned, credits auto-convert to fee records

### Case 2: Incomplete Student Start Date
- **Rule 1**: If batch exists but student start date missing → Use batch start date
- **Rule 2**: If earliest payment date < batch start date → Use payment date
- **Rule 3**: Otherwise → Use batch start date

### Case 3: Batch Not Started
- **Excel Indicator**: Batch start date is empty or "need to start batch"
- **Action**: 
  - Create DRAFT batch
  - Store all payments as credits
  - Don't create fee records yet

### Case 4: Discontinued Student
- **Excel Indicator**: "discontinued" or "discontinuted" in any column
- **Actions**:
  - Mark student as inactive
  - Remove all pending fees
  - Keep overdue fees
  - Keep paid fees
  - Preserve credit history

### Case 5: Partial Course Payment
- **Scenario**: Student paid for 3 months of 4-month course
- **Action**:
  - Create fee records for 3 paid months
  - Create 1 pending record for 4th month
  - Don't create beyond course duration

## Database Models

### Student Model
```typescript
{
  studentName: string
  email?: string           // Optional but one of email/phone required
  phone?: string          // Optional but one of email/phone required
  stage: 'beginner' | 'intermediate' | 'advanced'
  level: number
  isActive: boolean
  studentStartDate?: Date
  batch?: ObjectId
  // ... other fields
}
```

### StudentCredit Model
```typescript
{
  student: ObjectId
  amount: number
  creditType: 'advance_payment' | 'excess_payment' | 'refund_reversal' | 'other'
  description: string
  dueDate?: Date          // New: When credit was expected to be used
  paidDate?: Date         // New: When payment was received
  isUsed: boolean
  usedAmount: number
  paymentMethod?: string
  transactionId?: string
  remarks?: string
}
```

### Batch Model
```typescript
{
  batchId: string         // e.g., "WF:2:30(U)"
  stage: 'beginner' | 'intermediate' | 'advanced'
  level: number
  status: 'draft' | 'active' | 'ended'
  startDate?: Date
  endDate?: Date
  schedule: ScheduleEntry[]
  description?: string    // Stores timing info
  maxStudents?: number
  currentStudents: number
}
```

### FeeRecord Model
```typescript
{
  student: ObjectId
  feeMonth: string        // YYYY-MM format
  dueDate: Date
  expectedAmount: number
  paidAmount?: number
  paymentDate?: Date
  status: 'paid' | 'pending' | 'overdue'  // Computed
  paymentMethod?: string
  transactionId?: string
  remarks?: string
}
```

## Running the Ingestion Script

### Prerequisites
1. Excel file in correct format
2. MongoDB connection configured
3. Course configurations created (B1, B2, I1, etc.)

### Execution

```bash
cd server
npx ts-node scripts/IngestStudentsFromExcel.ts
```

### What Happens
1. Reads Excel file from Desktop
2. Processes each student row
3. Creates/updates students
4. Creates/links batches
5. Creates credits or fee records
6. Generates detailed report

### Output Report
```
===== INGESTION SUMMARY =====
Students Processed: 94
  - Created: 45
  - Updated: 49
  - Skipped: 0

Batches Processed: 15
  - Active: 10
  - Draft: 5

Payments Processed: 234
  - Fee Records: 180
  - Credits: 54

Errors: 0
```

## Frontend Integration

### Add Credit Modal
Enhanced to support multiple credit entries:
- Add/remove credit rows
- Each row has due date, paid date, amount
- Validates paid date is required
- Supports all payment methods

### Student Fees Tab
Shows:
- Fee records with status badges
- Credit history with due/paid dates
- Upcoming payments
- Total balance

## Testing Scenarios

### Scenario 1: New Student with Batch
```
Input: Student with batch, 3 payments made
Expected: Student created, batch linked, 3 fee records + 1 pending
```

### Scenario 2: Student Without Batch
```
Input: Student without batch, 2 payments made
Expected: Student created, 2 credits stored
```

### Scenario 3: Discontinued Student
```
Input: Student with "discontinued" status, has pending fees
Expected: Student marked inactive, pending fees removed
```

### Scenario 4: Draft Batch
```
Input: Batch with no start date, students with payments
Expected: Draft batch created, payments stored as credits
```

## Migration Considerations

### From Old System
1. **Contact Info**: Ensure all students have at least email OR phone
2. **Credits**: Old single credit → Multiple credit entries
3. **Batches**: All batches need status field
4. **Fees**: Add status computation logic

### Data Validation
- Run validation script before ingestion
- Check for duplicate students
- Verify course configurations exist
- Validate batch format consistency

## Error Handling

The system handles:
- ✅ Missing contact information
- ✅ Invalid date formats
- ✅ Duplicate students (updates existing)
- ✅ Missing course configurations
- ✅ Invalid batch formats
- ✅ Payment inconsistencies

## Best Practices

1. **Before Ingestion**:
   - Backup database
   - Validate Excel data format
   - Ensure course configs exist

2. **During Ingestion**:
   - Monitor console output
   - Check for errors
   - Validate batch creation

3. **After Ingestion**:
   - Review generated report
   - Spot-check student records
   - Verify fee calculations
   - Test credit system

## Support & Troubleshooting

### Common Issues

**Issue**: "Either email or phone must be provided"
**Solution**: Add email or phone to student row in Excel

**Issue**: "Course configuration not found"
**Solution**: Run SeedCourses script to create course configs

**Issue**: Batch not being created
**Solution**: Check batch ID format and timing column

**Issue**: Credits not converting to fees
**Solution**: Ensure batch is assigned and status is 'active'

## Conclusion

This ingestion system provides a robust, flexible way to import historical student data while maintaining data integrity and supporting modern requirements like flexible contact information and detailed credit tracking.

For questions or issues, refer to the code in:
- `server/scripts/IngestStudentsFromExcel.ts`
- `server/src/services/StudentCreditService.ts`
- `server/src/utils/batchParser.ts`
