# Fee Management: Course/Level Change Implementation

## Overview

This implementation adds support for properly handling fee records when a student's course and level are changed. It distinguishes between two scenarios:

1. **Progression**: Student naturally moves to the next level (e.g., completes Beginner L1, moves to Beginner L2)
2. **Correction**: Student data was entered incorrectly and needs to be fixed

## Changes Made

### 1. StudentCreditService (`server/src/services/StudentCreditService.ts`)

**Added Method: `applyCreditsToFeeRecords()`**

This method applies available student credits to unpaid/partially-paid fee records:

```typescript
static async applyCreditsToFeeRecords(params: {
  studentId: string | mongoose.Types.ObjectId;
  studentName: string;
  processedBy: string | mongoose.Types.ObjectId;
  session?: mongoose.ClientSession;
}): Promise<{ feesCount: number; amountUsed: number; remainingCredit: number }>
```

**What it does:**
- Gets all unpaid/partially-paid fees in chronological order
- Applies available credits to pay fees (oldest first)
- Marks fee records as paid
- Creates `credit_used` transaction records
- Returns count of fees paid, amount used, and remaining credit

---

### 2. FeeService (`server/src/services/FeeService.ts`)

**Updated Method: `handleStageLevelTransition()`**

**New Parameters:**
- `changeType: 'progression' | 'correction'` - Type of change
- `userId: string` - ID of user making the change

**New Return Fields:**
- `convertedCreditAmount: number` - Amount converted to credits (correction only)
- `appliedFeesCount: number` - Number of fees paid with credits (correction only)

**Logic:**

#### Progression Mode:
1. Delete only UNPAID upcoming fees
2. Keep all paid fees (student correctly paid for previous level)
3. Generate new fees at new rate
4. Prorate current month if mid-month change

#### Correction Mode:
1. Find ALL upcoming fees (including paid ones)
2. Convert PAID amounts to student credits
3. Delete ALL upcoming fees
4. Generate new fees at correct rate
5. Prorate current month if mid-month change
6. Auto-apply credits to new fees

---

### 3. Student Routes (`server/src/routes/students.ts`)

**Updated: `PUT /api/students/:id`**

**New Required Field:**
- `changeType: 'progression' | 'correction'` - Required when stage/level changes

**Validation:**
- Requires `changeType` when stage or level changes
- Validates `changeType` is either 'progression' or 'correction'
- Passes `changeType` and `userId` to `handleStageLevelTransition()`

**Response Messages:**
- **Progression**: Shows count of unpaid fees deleted and new fees generated
- **Correction**: Shows count of fees deleted, new fees generated, credits converted, and fees paid with credits

---

## API Usage

### Example 1: Student Progression (Upgrade)

```javascript
PUT /api/students/student123
{
  "stage": "beginner",
  "level": 2,
  "batchId": "batch456",
  "changeType": "progression"  // Student naturally moving to next level
}
```

**Result:**
- Unpaid upcoming fees at Beginner L1 deleted
- Paid fees at Beginner L1 kept (student correctly paid for L1)
- New fees generated at Beginner L2 rate
- Current month prorated if mid-month

---

### Example 2: Student Data Correction

```javascript
PUT /api/students/student123
{
  "stage": "intermediate",
  "level": 1,
  "batchId": "batch789",
  "changeType": "correction"  // Student was wrongly assigned course/level
}
```

**Result:**
- ALL upcoming fees deleted (paid and unpaid)
- Paid amounts converted to student credits
- New fees generated at Intermediate L1 rate
- Credits auto-applied to new fees
- Current month prorated if mid-month

---

## Scenario Examples

### Scenario 1: Progression with Prepayment

**Before:**
- Student: John Doe
- Course: Beginner L1 (₹2,000/month)
- Fees: Jan (PAID), Feb (PAID), Mar (UNPAID)

**Action:** Progression to Beginner L2 (₹2,500/month)

**After:**
- Jan: ₹2,000 (PAID) - kept
- Feb: ₹2,000 (PAID) - kept
- Mar: ₹2,500 (UNPAID) - regenerated at new rate

**Student Owes:** ₹2,500 for March

---

### Scenario 2: Correction with Prepayment

**Before:**
- Student: Jane Smith
- Course: Beginner L1 (₹2,000/month) - WRONG!
- Fees: Jan (PAID ₹2,000), Feb (PAID ₹2,000), Mar (PAID ₹2,000)

**Action:** Correction to Beginner L2 (₹2,500/month)

**After:**
- ₹6,000 converted to credits (from 3 paid fees)
- New fees generated: Jan (₹2,500), Feb (₹2,500), Mar (₹2,500)
- Credits auto-applied:
  - Jan: PAID ₹2,500 (from credit)
  - Feb: PAID ₹2,500 (from credit)
  - Mar: PAID ₹1,000 (from remaining credit)
- Credit Balance: ₹0

**Student Owes:** ₹1,500 for March (₹2,500 - ₹1,000 credit)

---

### Scenario 3: Mid-Month Correction

**Before:**
- Student: Mike Johnson
- Course: Beginner L1 (₹2,000/month) - WRONG!
- Fees: Jan (PAID ₹2,000)
- Change Date: January 15th

**Action:** Correction to Beginner L2 (₹2,500/month)

**After:**
- ₹2,000 converted to credits
- January fee prorated:
  - Days in January: 31
  - Days remaining: 17 (Jan 15-31)
  - Prorated fee: ₹1,370 (rounded)
- January: PAID ₹1,370 (from credit)
- Credit Balance: ₹630 (₹2,000 - ₹1,370)

**Student Owes:** ₹0 (credit covers January)

---

## Comparison Table

| Aspect | Progression | Correction |
|--------|------------|------------|
| **Use Case** | Student completes level, moves to next | Student data was wrong from the start |
| **Paid upcoming fees** | ✅ Keep as-is | ❌ Convert to credits |
| **Unpaid upcoming fees** | ❌ Delete | ❌ Delete |
| **Historical fees (past)** | ✅ Keep untouched | ✅ Keep untouched |
| **Credits created** | ❌ No | ✅ Yes (from paid fees) |
| **Auto-apply credits** | ❌ No | ✅ Yes |
| **Proration** | ✅ Yes (if mid-month) | ✅ Yes (if mid-month) |

---

## Frontend Implementation Guide

When updating a student's course/level, the frontend must:

1. **Prompt the user** to select the type of change:
   - "Student Progression" - Natural upgrade to next level
   - "Data Correction" - Fixing wrongly entered information

2. **Send the appropriate `changeType`** in the API request

3. **Display the result** to the user:
   - Show fees deleted, created
   - If correction: Show credits converted and applied
   - Show any remaining balance owed

### Example UI Flow

```
┌─────────────────────────────────────────┐
│  Change Student Course/Level            │
├─────────────────────────────────────────┤
│  Current: Beginner Level 1              │
│  New: Beginner Level 2                  │
│                                         │
│  Select Change Type:                    │
│  ○ Student Progression                  │
│     (Student completed level, moving    │
│      to next level)                     │
│                                         │
│  ○ Data Correction                      │
│     (Student was assigned wrong         │
│      course/level from the start)       │
│                                         │
│  [Cancel]  [Update]                     │
└─────────────────────────────────────────┘
```

---

## Testing Checklist

- [ ] Test progression with no prepayment
- [ ] Test progression with prepaid fees
- [ ] Test correction with no prepayment
- [ ] Test correction with prepaid fees
- [ ] Test mid-month change (proration)
- [ ] Test end-of-month change
- [ ] Test credits auto-apply correctly
- [ ] Test credit balance is accurate
- [ ] Verify fee amounts match new course/level
- [ ] Verify transaction history is complete
- [ ] Test error handling (invalid changeType, missing batch, etc.)

---

## Database Changes

No schema changes required. The implementation uses existing:
- `FeeRecord` model
- `StudentCredit` model
- `Student` model
- `Batch` model
- `Course` model

---

## Notes

- Overdue fees are **always kept untouched** regardless of change type
- Proration is calculated based on days remaining in the month
- Credits are applied to fees in chronological order (oldest first)
- All operations are logged to console for audit trail
- Transaction IDs are generated for credit-based payments

---

## Migration

No database migration required. The changes are backward compatible:
- Existing code that doesn't pass `changeType` will fail with clear error message
- All existing fee records and credits remain valid
- No changes to existing data structures

---

## Future Enhancements

Potential improvements for future versions:

1. **Refund Support**: Add option to issue cash refund instead of credits
2. **Batch Change Without Course/Level Change**: Handle batch reassignment within same course/level
3. **Partial Month Refund**: Support refund for unused portion when student leaves mid-month
4. **Automatic Progression**: Auto-detect when student completes level duration
5. **Change History**: Track all course/level changes for audit trail
6. **Email Notifications**: Notify student/parent when fees are adjusted due to change
