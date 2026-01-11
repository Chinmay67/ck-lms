# Fee Cycle and Batch-Based Implementation

## Overview
This document describes the implementation of a batch-based fee cycle system with student credits for pre-batch payments.

## Implementation Date
January 11, 2026

## Key Changes

### 1. Database Schema Updates

#### Student Model (`server/src/models/Student.ts`)
- Added `feeCycleStartDate?: Date` - Tracks when fee cycle starts for the student
- Added `batchId?: mongoose.Types.ObjectId` - Reference to the batch
- The fee cycle start date is set to:
  - Batch start date if student joins before batch starts
  - Current date if student joins after batch has started
  - Null if student is not part of a batch yet

#### New StudentCredit Model (`server/src/models/StudentCredit.ts`)
Created to handle payments made before batch assignment:
- `studentId` - Reference to student
- `studentName` - Name of student
- `amountPaid` - Total amount paid
- `amountUsed` - Amount used for fee payments
- `remainingCredit` - Balance available
- `status` - 'active' | 'used' | 'expired'
- `paymentDate` - When payment was received
- `paymentMethod` - Method of payment
- `processedBy` - User who processed the payment
- `usageHistory` - Array tracking how credits were used
- `notes` - Additional notes

### 2. New Services

#### StudentCreditService (`server/src/services/StudentCreditService.ts`)
Manages student credits with the following operations:
- `createCredit()` - Create new credit when payment received without batch
- `useCredit()` - Apply credits to fee payments
- `getStudentCredits()` - Get all credits for a student
- `getCreditSummary()` - Get aggregated credit statistics
- Auto-apply credits when student is assigned to batch

#### Updated FeeService (`server/src/services/FeeService.ts`)
Enhanced fee management:
- `generateFeeCycles()` - Creates fee records based on batch start date
- Uses `feeCycleStartDate` instead of enrollment date
- Automatically applies available credits when generating fees
- Handles partial payments and credit applications

#### Updated BatchService (`server/src/services/BatchService.ts`)
Enhanced batch operations:
- When adding student to batch:
  - Sets `feeCycleStartDate` to batch start date
  - Automatically applies any active credits
  - Generates fee cycles from batch start date

### 3. API Endpoints

#### New Credit Routes (`server/src/routes/credits.ts`)
- `POST /api/credits` - Create new credit
- `GET /api/credits/student/:studentId` - Get student credits
- `GET /api/credits/student/:studentId/summary` - Get credit summary
- `PUT /api/credits/:creditId/use` - Manually use credit
- `GET /api/credits/:creditId` - Get credit details

#### Updated Fee Routes (`server/src/routes/fees.ts`)
- Enhanced to work with batch-based fee cycles
- Supports credit application during payment

#### Updated Batch Routes (`server/src/routes/batches.ts`)
- Enhanced student addition to handle fee cycle initialization
- Auto-applies credits when student joins batch

### 4. Frontend Updates

#### Type Definitions (`client/src/types/student.ts`)
Added new types:
```typescript
interface StudentCredit {
  _id: string;
  studentId: string;
  studentName: string;
  amountPaid: number;
  amountUsed: number;
  remainingCredit: number;
  status: 'active' | 'used' | 'expired';
  paymentDate: string;
  paymentMethod?: string;
  processedBy: string;
  usageHistory: Array<{...}>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreditSummary {
  totalCredits: number;
  activeCredits: number;
  usedCredits: number;
  expiredCredits: number;
  totalPaid: number;
  totalUsed: number;
  totalRemaining: number;
}
```

#### API Service (`client/src/services/api.ts`)
Added CreditAPI with methods:
- `getStudentCredits(studentId)`
- `getCreditSummary(studentId)`
- `createCredit(creditData)`
- `useCredit(creditId, amount, feeRecordId)`

#### Fee Payment Modal (`client/src/components/fees/FeePaymentModal.tsx`)
Enhanced to:
- Show available credits
- Allow payment with or without using credits
- Display credit application in real-time
- Support partial payments with credit combination

#### Student Fees Tab (`client/src/components/fees/StudentFeesTab.tsx`)
Enhanced to display:
- Active credits section with balance
- Credit history with usage tracking
- Visual indicators for credit status
- Overdue and upcoming fees
- Full payment history

## Workflow

### Scenario 1: Student Joins Before Batch Starts
1. Student enrolls and pays fees
2. Since no batch assigned, create StudentCredit
3. When batch is created and student added:
   - Set `feeCycleStartDate` = batch start date
   - Auto-apply credits to generate fee records
   - Credits used for as many months as available

### Scenario 2: Student Joins After Batch Starts
1. Student enrolls and is added to batch
2. Set `feeCycleStartDate` = batch start date
3. Generate fee cycles from batch start date
4. If payment made, apply directly to fees

### Scenario 3: Student Pays Before Batch Assignment
1. Payment received, student not in batch
2. Create StudentCredit with full amount
3. Credit remains active until:
   - Student joins batch (auto-applied)
   - Manual application
   - Expiration (if configured)

## Credit Auto-Application Logic

When student is added to batch:
```typescript
1. Fetch all active credits for student
2. Generate fee cycles from batch start date
3. For each fee record (oldest first):
   - If credits available:
     - Apply credit to fee
     - Update credit usage
     - Mark fee as paid/partially_paid
   - Continue until credits exhausted or all fees paid
```

## Database Indexes
- StudentCredit: `studentId`, `status`
- FeeRecord: `studentId`, `status`, `dueDate`
- Student: `batchId`, `feeCycleStartDate`

## Migration Considerations
- Existing students without `feeCycleStartDate` should have it set to their enrollment date
- Existing fee records remain valid
- No data loss during migration

## Testing Checklist
- ✅ Create credit for student without batch
- ✅ Add student to batch and verify auto-application
- ✅ Generate fees based on batch start date
- ✅ Manual credit application
- ✅ Partial payment with credits
- ✅ Credit summary calculations
- ✅ Frontend credit display
- ✅ Fee cycle generation from batch date

## Security Considerations
- All credit operations require authentication
- Credit creation requires admin/staff role
- Credit usage tracked with user audit trail
- Payment validation before credit creation

## Future Enhancements
- Credit expiration policies
- Credit transfer between students
- Bulk credit operations
- Credit refund workflow
- Advanced credit reporting

## Known Limitations
- Credits are non-refundable by default
- Manual intervention needed for credit adjustments
- Credits auto-apply in chronological order (cannot skip months)

## Files Modified
### Backend
- `server/src/models/Student.ts`
- `server/src/models/StudentCredit.ts` (new)
- `server/src/services/FeeService.ts`
- `server/src/services/StudentCreditService.ts` (new)
- `server/src/services/BatchService.ts`
- `server/src/routes/fees.ts`
- `server/src/routes/credits.ts` (new)
- `server/src/routes/batches.ts`
- `server/src/index.ts`

### Frontend
- `client/src/types/student.ts`
- `client/src/services/api.ts`
- `client/src/components/fees/FeePaymentModal.tsx`
- `client/src/components/fees/StudentFeesTab.tsx`

## Conclusion
The implementation successfully transitions the fee management system from enrollment-date based to batch-start-date based, with robust handling of pre-batch payments through the credit system.
