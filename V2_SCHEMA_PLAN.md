# V2 Schema & Implementation Plan
## Chess Klub LMS — Fee Management Rebuild

> Generated: 2026-03-29  
> Status: **PLANNING**

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Schema Analysis — What's Good](#2-schema-analysis--whats-good)
3. [Critical Bugs to Fix](#3-critical-bugs-to-fix)
4. [Design Gaps to Fill](#4-design-gaps-to-fill)
5. [Missing Indexes](#5-missing-indexes)
6. [Minor Issues](#6-minor-issues)
7. [Detailed Fix Plan (Ordered by Priority)](#7-detailed-fix-plan-ordered-by-priority)
8. [Migration Strategy from V1 → V2](#8-migration-strategy-from-v1--v2)
9. [Testing Checklist](#9-testing-checklist)
10. [Files Affected](#10-files-affected)

---

## 1. Overview & Goals

The v1 system had cascading bugs caused by:
- Fee records mutated in place (no history)
- Stage/level stored as flat string enums — upgrade meant rewriting old records
- No enrollment timeline — joining mid-batch lost pro-ration info
- `status` stored as a flag that went stale
- Credits not linked to specific months — impossible to audit

The v2 design fixes the root causes with:
- **Enrollment** as an immutable timeline record
- **FeeRecord** linked to Enrollment, with frozen `feeAmount`
- **Computed `status`** virtual — never stored
- **Append-only StudentCredit ledger**

This document captures what is still missing or broken in the v2 schema and the exact plan to fix it.

---

## 2. Schema Analysis — What's Good

| Design Decision | Why It's Correct |
|---|---|
| `Enrollment.monthlyFee` is frozen at creation | Fee changes only affect new enrollments, not old records |
| `FeeRecord.status` is a virtual (not stored) | Eliminates stale flag bugs entirely |
| Unique index `{ studentId, feeMonth, enrollmentId }` on FeeRecord | Allows multiple records per month when student upgrades mid-month |
| Partial index `{ studentId, endDate: null }` on Enrollment | O(1) active enrollment lookup without scanning all history |
| `StudentCredit` as an append-only ledger with `balanceBefore/balanceAfter` | Full audit trail, cannot silently mutate a balance |
| Per-month `credit_used` entries with `feeMonth` + `feeRecordId` | Granular audit — can reconstruct exactly which month each credit applied to |
| `batchId: null` allowed on Enrollment | Student can be enrolled (accruing fees) before being assigned a batch |
| Pro-ration computed at FeeRecord creation time, not stored on Enrollment | No lossy rounding in source-of-truth |

---

## 3. Critical Bugs to Fix

### BUG-01 — Mid-Month Upgrade Creates Phantom Debt (Severity: 🔴 Critical)

**Problem:**  
When a student upgrades on March 15:
- Old enrollment: `startDate=Jan 1, endDate=Mar 15`
- New enrollment: `startDate=Mar 15`

`calculateMonthFee()` runs this query:
```ts
startDate: { $lte: monthEnd },
$or: [{ endDate: null }, { endDate: { $gte: monthStart } }]
```
Both enrollments match March. The function takes `.sort({ startDate: -1 })` → picks the new enrollment only.

**Effect:**  
- The old enrollment's fee for March days 1–14 is **never calculated or recorded**.
- The new enrollment covers March 15–31 (pro-rated).
- Days 1–14 of the old enrollment are silently dropped → student is undercharged.

**Fix Plan:**  
`calculateMonthFee` must return **all** enrollments active during a month, not just the latest one.  
`createOrUpdateFeeRecords` and `processPayment` must iterate over `(month × enrollment)` pairs.

Specifically:
1. Rename `calculateMonthFee(studentId, month)` → `calculateMonthFees(studentId, month): MonthFeeResult[]` (returns array)
2. For each month, query ALL enrollments active during that month:
   ```ts
   Enrollment.find({
     studentId,
     startDate: { $lte: monthEnd },
     $or: [{ endDate: null }, { endDate: { $gt: monthStart } }]  // NOTE: $gt not $gte
   })
   ```
3. For each enrollment in that month, compute pro-ration:
   - `activeDaysStart = max(enrollment.startDate, monthStart)`
   - `activeDaysEnd = min(enrollment.endDate ?? monthEnd, monthEnd)`
   - `daysActive = activeDaysEnd.getDate() - activeDaysStart.getDate() + 1`
   - If `daysActive === daysInMonth` → full fee, no pro-ration
4. Create one FeeRecord per `(month, enrollmentId)` pair
5. Payment loop iterates over all FeeRecords for that month across all enrollments

---

### BUG-02 — Enrollment Boundary Day Double-Counted (Severity: 🔴 Critical)

**Problem:**  
On upgrade date (e.g., March 15):
- Old enrollment has `endDate = March 15`
- New enrollment has `startDate = March 15`
- The query `endDate: { $gte: monthStart }` includes the old enrollment for March
- March 15 is counted in BOTH enrollments' pro-ration → student is double-charged for that day

**Fix Plan:**  
Adopt **exclusive endDate** convention:
- Old enrollment `endDate = March 15` means the student was enrolled **up to but NOT including** March 15
- New enrollment `startDate = March 15` means student is enrolled **from** March 15

Update pro-ration logic:
```
Old enrollment active days in March = [March 1 → March 14] = 14 days
New enrollment active days in March = [March 15 → March 31] = 17 days
Total = 31 days ✓ (no double-counting)
```

Update the query to use `$gt` (not `$gte`) for endDate:
```ts
$or: [{ endDate: null }, { endDate: { $gt: monthStart } }]
```

Update `Enrollment` pre-save hook:
```ts
// Change: endDate > startDate (currently)
// To:     endDate >= startDate (endDate === startDate means 0-day enrollment, which is valid for same-day upgrade)
```

---

### BUG-03 — Concurrent Credit Balance Race Condition (Severity: 🔴 Critical)

**Problem:**  
```ts
const last = await StudentCredit.findOne({ studentId })
  .sort({ createdAt: -1 })
  .select('balanceAfter');
```
- Two concurrent payment requests both read the same `balanceAfter`
- Both compute `balanceBefore = X`, `balanceAfter = X - creditUsed`
- Both write → second write overwrites the first → credit balance is wrong
- Additionally, if two entries have the same millisecond `createdAt`, sort order is non-deterministic

**Fix Plan:**  
Add a `creditBalance` field directly on the `Student` document, updated atomically using `$inc` inside the same transaction as the credit ledger entry:
```ts
// In processPayment, inside the session:
await StudentV2.findByIdAndUpdate(
  studentId,
  { $inc: { creditBalance: -creditApplied } },
  { session, new: true }
);
```
The `StudentCredit` ledger entries still store `balanceBefore/balanceAfter` for display, but the **authoritative balance** is `Student.creditBalance`.

Schema change to `Student`:
```ts
creditBalance: { type: Number, required: true, default: 0, min: 0 }
```

---

### BUG-04 — `studentCode` Auto-Generation Is Broken (Severity: 🔴 Bug)

**Problem:**  
```ts
const lastSeq = parseInt((lastStudent.studentCode).split('-')[2]);
```
Format is `STU-YYYYMMDD-NNNNN`. `split('-')` gives `['STU', 'YYYYMMDD', 'NNNNN']`.  
Index `[2]` gives the 8-digit date string (`20260329`), not the sequence number (`00001`).  
`parseInt('20260329')` = 20260329 → next student gets code `STU-20260329-20260330`.

**Fix Plan:**  
```ts
const parts = lastStudent.studentCode.split('-');
const lastSeq = parseInt(parts[parts.length - 1]);
```
Or use index `[3]` since the format has exactly 4 parts with the date being `[2]` and sequence being `[3]`.  
Wait — `STU-20260329-00001` splits into `['STU', '20260329', '00001']` which is 3 parts (index 0,1,2). So index `[2]` IS the sequence. The bug only manifests if the date contains a hyphen. Since dates are formatted as `YYYYMMDD` (no hyphens), `split('-')[2]` is actually correct.

**Re-analysis:** The regex used to find last student is:
```ts
.findOne({ studentCode: new RegExp(`^STU-${dateStr}-`) })
```
This matches today's students only. If no student exists today, `lastSeq` fails and sequence resets to 1 — correct. If a student exists, `split('-')[2]` gets the sequence. This is actually correct for today-scoped codes.

**Actual bug:** The sort is `{ studentCode: -1 }` (alphabetic), which sorts `STU-20260329-00010` before `STU-20260329-00009` (string sort). This works for zero-padded 5-digit sequences. ✅ No bug here after closer inspection — mark as minor.

---

### BUG-05 — `processPayment` Does Not Handle Multi-Enrollment Months (Severity: 🔴 Critical)

Follows from BUG-01. The payment loop:
```ts
for (const month of months) {
  const calc = await calculateMonthFee(studentId, month, session);
  // finds only ONE enrollment's fee record
}
```
After fixing BUG-01, this loop must become:
```ts
for (const month of months) {
  const calcs = await calculateMonthFees(studentId, month, session); // array
  for (const calc of calcs) {
    // process each (month, enrollment) pair
  }
}
```

---

## 4. Design Gaps to Fill

### GAP-01 — No Pause/Resume Mechanism (Severity: 🟡 Important)

**Problem:**  
`endReason: 'paused'` closes an enrollment but there is no:
- Record of when the pause ends
- Query to find "students whose pause ends this month"
- Auto-resume logic

**Fix Plan — Option A (Recommended): Add `pausedUntil` to Enrollment**
```ts
pausedUntil: {
  type: Date,
  default: null,
  // Required when endReason === 'paused'
}
```
A cron job checks `Enrollment.find({ endReason: 'paused', pausedUntil: { $lte: today } })` and creates new active enrollments for those students.

**Fix Plan — Option B: Separate `StudentPause` collection**
```ts
{
  studentId, enrollmentId,
  pauseStart, pauseEnd,
  reason, approvedBy
}
```
More complex but allows overlapping pauses and detailed history.

Recommend Option A for simplicity.

---

### GAP-02 — No Batch Compatibility Enforcement (Severity: 🟡 Important)

**Problem:**  
Nothing prevents assigning a Stage 2 Level 1 student to a Stage 1 Level 3 batch.

**Fix Plan:**  
In `changeBatch()` and `upgradeStudentLevel()` in `feeService.ts`, add validation:
```ts
const batch = await Batch.findById(newBatchId).session(session);
if (batch.stageNumber !== newStageNumber || batch.levelNumber !== newLevelNumber) {
  throw new Error(`Batch ${batch.batchName} is for Stage ${batch.stageNumber} Level ${batch.levelNumber}, 
    but student is being enrolled at Stage ${newStageNumber} Level ${newLevelNumber}`);
}
```

---

### GAP-03 — No Batch Capacity Enforcement (Severity: 🟡 Important)

**Problem:**  
`Batch.maxStudents` is defined but never checked when assigning students.

**Fix Plan:**  
In `changeBatch()` and enrollment creation, before committing:
```ts
if (batch.maxStudents !== null) {
  const activeCount = await Enrollment.countDocuments({
    batchId: newBatchId,
    endDate: null,
  }).session(session);
  if (activeCount >= batch.maxStudents) {
    throw new Error(`Batch ${batch.batchName} is full (${activeCount}/${batch.maxStudents})`);
  }
}
```

---

### GAP-04 — No Fee Waiver Support (Severity: 🟡 Important)

**Problem:**  
When an admin needs to partially waive a fee ("student was sick, reduce this month's fee by ₹500"), there's no clean mechanism. Options:
- Lower `feeAmount` → violates the frozen rule
- Add a credit → loses the audit reason

**Fix Plan:**  
Add waiver fields to `FeeRecord`:
```ts
waivedAmount: { type: Number, default: 0, min: 0 }
waivedBy: { type: Schema.Types.ObjectId, ref: 'User' }
waivedReason: { type: String, maxlength: 500 }
waivedAt: { type: Date }
```

Update the `status` virtual:
```ts
FeeRecordSchema.virtual('status').get(function () {
  const effectivePaid = this.paidAmount + (this.waivedAmount ?? 0);
  if (effectivePaid >= this.feeAmount) return 'paid';
  if (this.paidAmount > 0) return 'partially_paid';
  if (this.dueDate > new Date()) return 'upcoming';
  return 'overdue';
});
```

Update `remainingAmount` virtual:
```ts
FeeRecordSchema.virtual('remainingAmount').get(function () {
  return Math.max(0, this.feeAmount - this.paidAmount - (this.waivedAmount ?? 0));
});
```

---

### GAP-05 — Configurable Due Date (Severity: 🟠 Nice-to-Have)

**Problem:**  
`defaultDueDate()` always returns the 5th of the month, hardcoded.

**Fix Plan:**  
Add `dueDayOfMonth: { type: Number, default: 5, min: 1, max: 28 }` to Course (or Batch).  
Pass it through to `createOrUpdateFeeRecords` and `processPayment`.

---

### GAP-06 — Credit Expiry (Severity: 🟠 Nice-to-Have)

**Problem:**  
Credits have no expiry. If a club has a "credits expire after 6 months" policy, there's no schema support.

**Fix Plan:**  
Add `expiresAt: Date | null` to `StudentCredit` (default null = never expires).  
`getCreditBalance` filters out expired entries:
```ts
StudentCredit.find({ 
  studentId, 
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
})
```

---

### GAP-07 — No `createdBy` on FeeRecord (Severity: 🟠 Audit Gap)

**Problem:**  
`FeeRecord` has `updatedBy` but not `createdBy`. Cannot determine if a record was auto-generated (cron), created during payment, or manually added by admin.

**Fix Plan:**  
Add:
```ts
createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: false }
createdBySource: { type: String, enum: ['payment', 'cron', 'manual', 'migration'], default: 'payment' }
```

---

### GAP-08 — Dual IStudentV2 Interface Definition (Severity: 🟡 Maintenance)

**Problem:**  
`IStudentV2` is defined in both `server/src/models/v2/Student.ts` and `server/src/types/v2.ts` and they are diverging.

**Fix Plan:**  
- Keep only the `types/v2.ts` definition as the canonical type
- In `v2/Student.ts`, import from `types/v2.ts`: `import type { IStudentV2 } from '../../types/v2.js'`
- Remove the duplicate interface from `v2/Student.ts`

---

### GAP-09 — Student `stage`/`level` Are Hardcoded Enums (Severity: 🟡 Maintenance)

**Problem:**  
```ts
stage: { enum: ['beginner', 'intermediate', 'advanced'] }
level: { enum: [1, 2, 3] }
```
This breaks if you add a 4th stage or rename "beginner" to "Foundation". The Enrollment model uses numeric `stageNumber`/`levelNumber` correctly, but the denormalized cache on Student is still string-enum-locked.

**Fix Plan:**  
Replace string `stage` + numeric `level` with pure numeric denormalized cache:
```ts
// Remove:
stage: { type: String, enum: ['beginner', 'intermediate', 'advanced'] }
level: { type: Number, enum: [1, 2, 3] }

// Add (matching Enrollment):
stageNumber: { type: Number, min: 1, default: null }
levelNumber: { type: Number, min: 1, default: null }
```
Keep `stage`/`level` as deprecated optional fields for backward compat during migration.  
The UI resolves the display name by looking up `Course.stages[stageNumber].stageName`.

---

### GAP-10 — `studentName` Sync Only Covers `findOneAndUpdate` (Severity: 🟡 Stale Data)

**Problem:**  
The post-hook that syncs `studentName` to FeeRecord and StudentCredit only fires on `findOneAndUpdate`. If name is updated via `save()` or `updateOne()`, FeeRecord and StudentCredit go stale.

**Fix Plan:**  
Add hooks for `save` and `updateOne`:
```ts
StudentV2Schema.pre('save', async function (next) {
  if (this.isModified('studentName') && !this.isNew) {
    await mongoose.model('FeeRecord').updateMany({ studentId: this._id }, { $set: { studentName: this.studentName } });
    await mongoose.model('StudentCredit').updateMany({ studentId: this._id }, { $set: { studentName: this.studentName } });
  }
  next();
});
```

---

## 5. Missing Indexes

```ts
// Student — find all active students in a batch (used heavily in batch views)
StudentV2Schema.index({ batchId: 1, isActive: 1 });

// Student — filter by stage + level for reporting
StudentV2Schema.index({ stageNumber: 1, levelNumber: 1, isActive: 1 });

// Student — credit balance queries
StudentV2Schema.index({ creditBalance: 1 });  // after adding creditBalance field

// StudentCredit — balance lookup by processedAt (not just createdAt)
StudentCreditSchema.index({ studentId: 1, processedAt: -1 });

// FeeRecord — dashboard query: all overdue records (unpaid, due date passed)
FeeRecordSchema.index({ dueDate: 1, paidAmount: 1, feeAmount: 1 });

// FeeRecord — monthly collection report
FeeRecordSchema.index({ feeMonth: 1, paidAmount: 1 });

// Enrollment — find all active enrollments for a course/stage/level (batch reassignment tool)
EnrollmentSchema.index({ courseId: 1, stageNumber: 1, levelNumber: 1, endDate: 1 });
// (this one exists ✓ — confirming it's present)
```

---

## 6. Minor Issues

| ID | File | Issue | Fix |
|---|---|---|---|
| M-01 | `v2/StudentCredit.ts` | Uses `mongoose.models.StudentCredit \|\| mongoose.model(...)` fallback — the previous session fixed this but verify the export is a clean `mongoose.model()` call | Use clean `mongoose.model()` call |
| M-02 | `v2/FeeRecord.ts` | `paidAmount > feeAmount` is technically valid (overpayment) but status virtual returns 'paid' — should it be 'overpaid' to trigger a credit creation? | Add `overpaid` status or cap `paidAmount` at `feeAmount` during payment |
| M-03 | `v2/Student.ts` | `studentName` sync pre-hook for `save` is missing (post-hook only covers `findOneAndUpdate`) | Add pre-save hook (see GAP-10) |
| M-04 | `v2/Enrollment.ts` | `endReason` Mongoose enum includes `null` — Mongoose enums reject `null` unless you add `null` explicitly or set `required: false` with no enum | Ensure `enum` array includes `null` OR remove it from enum and handle at app layer |
| M-05 | `types/v2.ts` | `IStudentV2` duplicated in `v2/Student.ts` — will diverge | Consolidate into one source (see GAP-08) |

---

## 7. Detailed Fix Plan (Ordered by Priority)

### Phase 1 — Schema Fixes (Do First, Everything Depends on This)

**Order:** BUG-02 → GAP-09 → BUG-03 → GAP-04 → GAP-07

#### Step 1.1 — Fix `Enrollment.ts`: exclusive endDate + `pausedUntil`

File: `server/src/models/v2/Enrollment.ts`

Changes:
1. Add `pausedUntil: { type: Date, default: null }` field
2. Update pre-save validator:
   ```ts
   // Change from: this.endDate > this.startDate
   // To:          this.endDate >= this.startDate
   ```
3. Update comment block to document the exclusive-endDate convention clearly

#### Step 1.2 — Fix `Student.ts`: add `creditBalance`, replace string stage/level

File: `server/src/models/v2/Student.ts`

Changes:
1. Add `creditBalance: { type: Number, required: true, default: 0, min: 0 }`
2. Add `stageNumber: { type: Number, min: 1, default: null }` (replaces `stage` string enum)
3. Add `levelNumber: { type: Number, min: 1, default: null }` (replaces `level` number enum)
4. Mark existing `stage`/`level` fields as deprecated (keep as optional for migration)
5. Add missing indexes: `{ batchId: 1, isActive: 1 }`, `{ stageNumber: 1, levelNumber: 1, isActive: 1 }`, `{ creditBalance: 1 }`
6. Add `pre('save')` hook to sync `studentName` changes to FeeRecord + StudentCredit

#### Step 1.3 — Fix `FeeRecord.ts`: add waiver fields + `createdBy`/`createdBySource`

File: `server/src/models/v2/FeeRecord.ts`

Changes:
1. Add `waivedAmount: { type: Number, default: 0, min: 0 }`
2. Add `waivedBy: { type: Schema.Types.ObjectId, ref: 'User' }`
3. Add `waivedReason: { type: String, maxlength: 500 }`
4. Add `waivedAt: { type: Date }`
5. Add `createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: false }`
6. Add `createdBySource: { type: String, enum: ['payment', 'cron', 'manual', 'migration'], default: 'payment' }`
7. Update `status` virtual to account for `waivedAmount`
8. Update `remainingAmount` virtual to account for `waivedAmount`
9. Add missing indexes: `{ dueDate: 1, paidAmount: 1 }`, `{ feeMonth: 1, paidAmount: 1 }`

#### Step 1.4 — Fix `types/v2.ts`: deduplicate + extend interfaces

File: `server/src/types/v2.ts`

Changes:
1. Update `IStudentV2` — add `stageNumber`, `levelNumber`, `creditBalance`; deprecate `stage`/`level`
2. Update `IFeeRecordV2` — add `waivedAmount`, `waivedBy`, `waivedReason`, `waivedAt`, `createdBy`, `createdBySource`
3. Update `IEnrollment` — add `pausedUntil`
4. Add `IStudentPause` interface (even if not implementing Option B now, document it)
5. Update `MonthFeeResult` → return type should be `MonthFeeResult[]` (array, for multi-enrollment months)
6. Update `status` in `MonthFeeResult` to include `'overpaid'`

#### Step 1.5 — Fix `StudentCredit.ts`: add `expiresAt`

File: `server/src/models/v2/StudentCredit.ts`

Changes:
1. Add `expiresAt: { type: Date, default: null }` field
2. Add index `{ studentId: 1, processedAt: -1 }`

---

### Phase 2 — Service Layer Fixes (Core Logic)

**Order:** BUG-02 boundary fix → BUG-01/BUG-05 multi-enrollment → BUG-03 credit race

#### Step 2.1 — Fix `feeService.ts`: calculateMonthFees returns array

File: `server/src/services/v2/feeService.ts`

Changes:
1. Rename `calculateMonthFee` → `calculateMonthFees` (returns `MonthFeeResult[]`)
2. Remove `.sort({ startDate: -1 }).limit(1)` — fetch ALL enrollments for the month:
   ```ts
   const enrollments = await Enrollment.find({
     studentId,
     startDate: { $lte: monthEnd },
     $or: [{ endDate: null }, { endDate: { $gt: monthStart } }]  // exclusive endDate
   }).session(session);
   ```
3. For each enrollment, compute pro-ration using exclusive-endDate arithmetic:
   ```ts
   const activeDaysStart = enrollment.startDate > monthStart ? enrollment.startDate : monthStart;
   const activeDaysEnd   = (enrollment.endDate && enrollment.endDate < monthEnd) ? enrollment.endDate : monthEnd;
   // endDate is exclusive, so subtract 1 day
   const daysActive = Math.ceil((activeDaysEnd.getTime() - activeDaysStart.getTime()) / 86400000);
   const isProRated = daysActive < daysInMonth;
   ```
4. Return one `MonthFeeResult` per enrollment active in that month
5. Keep backward-compat wrapper `calculateMonthFee(...)` that returns `calcs[0]` for existing callers during migration

#### Step 2.2 — Fix `feeService.ts`: createOrUpdateFeeRecords iterates (month × enrollment)

File: `server/src/services/v2/feeService.ts`

Changes:
1. In `createOrUpdateFeeRecords`, for each `month` in the range:
   ```ts
   const calcs = await calculateMonthFees(studentId, month, session);
   for (const calc of calcs) {
     await FeeRecord.findOneAndUpdate(
       { studentId, feeMonth: month, enrollmentId: calc.enrollmentId },
       { $setOnInsert: { feeAmount: calc.owedAmount, ... } },
       { upsert: true, session }
     );
   }
   ```
2. Pass `createdBySource` from caller into each created FeeRecord

#### Step 2.3 — Fix `feeService.ts`: processPayment iterates (month × enrollment)

File: `server/src/services/v2/feeService.ts`

Changes:
1. For each month, fetch all FeeRecords for that student/month (across all enrollments):
   ```ts
   const feeRecords = await FeeRecord.find({
     studentId,
     feeMonth: month,
     // no enrollmentId filter — get all enrollments' records for this month
   }).sort({ enrollmentId: 1 }).session(session);
   ```
2. Apply payment to each FeeRecord in order (oldest enrollment first)
3. Stop when `remainingPayment === 0`

#### Step 2.4 — Fix `feeService.ts`: credit balance uses `Student.creditBalance`

File: `server/src/services/v2/feeService.ts`

Changes:
1. Replace `getCreditBalance()` ledger scan with:
   ```ts
   const student = await StudentV2.findById(studentId).select('creditBalance').session(session);
   return student?.creditBalance ?? 0;
   ```
2. In `processPayment`, when applying credit:
   ```ts
   await StudentV2.findByIdAndUpdate(
     studentId,
     { $inc: { creditBalance: -creditApplied } },
     { session }
   );
   ```
3. When adding credit (overpayment):
   ```ts
   await StudentV2.findByIdAndUpdate(
     studentId,
     { $inc: { creditBalance: creditAdded } },
     { session }
   );
   ```

#### Step 2.5 — Add batch compatibility + capacity enforcement

File: `server/src/services/v2/feeService.ts`

Changes:
1. In `changeBatch(studentId, newBatchId, ...)`:
   ```ts
   const [batch, activeEnrollment] = await Promise.all([
     Batch.findById(newBatchId).session(session),
     Enrollment.findOne({ studentId, endDate: null }).session(session)
   ]);
   if (!batch) throw new Error('Batch not found');
   if (activeEnrollment) {
     if (batch.stageNumber !== activeEnrollment.stageNumber || 
         batch.levelNumber !== activeEnrollment.levelNumber) {
       throw new Error(`Batch stage/level mismatch: batch is S${batch.stageNumber}L${batch.levelNumber}, 
         student is S${activeEnrollment.stageNumber}L${activeEnrollment.levelNumber}`);
     }
   }
   if (batch.maxStudents !== null) {
     const count = await Enrollment.countDocuments({ batchId: newBatchId, endDate: null }).session(session);
     if (count >= batch.maxStudents) throw new Error(`Batch is full (${count}/${batch.maxStudents})`);
   }
   ```

---

### Phase 3 — Migration Script Updates

#### Step 3.1 — Update `001_add_enrollments.ts` migration

File: `server/src/migrations/001_add_enrollments.ts`

Changes:
1. After creating each Enrollment from old data, set `Student.creditBalance = 0` (will be recomputed)
2. Replace `stage`/`level` denormalization with `stageNumber`/`levelNumber`
3. After all enrollments created, recompute `creditBalance` for each student from their credit ledger

#### Step 3.2 — Add `creditBalance` backfill script

File: `server/scripts/BackfillCreditBalance.ts` (new)

Logic:
```ts
for each student:
  const credits = await StudentCredit.find({ studentId: student._id });
  const balance = credits.reduce((sum, c) => {
    if (c.transactionType === 'credit_added' || c.transactionType === 'credit_refund') return sum + c.amount;
    if (c.transactionType === 'credit_used') return sum - c.amount;
    return sum; // adjustment: use balanceAfter of last entry
  }, 0);
  await Student.findByIdAndUpdate(student._id, { creditBalance: Math.max(0, balance) });
```

---

### Phase 4 — Cron / Automation

#### Step 4.1 — Pause auto-resume cron

File: `server/src/routes/cron.ts` (existing) or new `server/src/services/v2/PauseService.ts`

Logic:
```ts
// Run daily
const expiredPauses = await Enrollment.find({
  endReason: 'paused',
  pausedUntil: { $lte: new Date() }
});
for (const enrollment of expiredPauses) {
  await createEnrollment({
    studentId: enrollment.studentId,
    batchId: enrollment.batchId,
    courseId: enrollment.courseId,
    stageNumber: enrollment.stageNumber,
    levelNumber: enrollment.levelNumber,
    monthlyFee: enrollment.monthlyFee,
    discountPct: enrollment.discountPct,
    startDate: enrollment.pausedUntil,
    createdBy: SYSTEM_USER_ID
  });
}
```

---

## 8. Migration Strategy from V1 → V2

### Pre-Migration Audit

Run `server/src/scripts/audit_before_migration.ts` to capture:
- Total students, active vs inactive
- Students with missing `stage`/`level`
- Students with `feeCycleStartDate` set
- Total FeeRecords, distribution by status
- Total StudentCredits, balance per student
- All batches and their student counts

Save this as a baseline to verify after migration.

### Migration Steps (in order)

```
Step 1: Deploy new schema (models/v2) alongside v1 — BOTH active
Step 2: Run BackfillCreditBalance.ts (safe, read-only, creates no side effects)
Step 3: Run 001_add_enrollments.ts migration (creates Enrollment docs from old data)
Step 4: Verify: each active student has exactly one Enrollment with endDate: null
Step 5: Verify: Student.creditBalance matches sum of StudentCredit ledger
Step 6: Verify: all FeeRecords have an enrollmentId set
Step 7: Switch application code to use v2 models
Step 8: Shadow-run v2 fee calculations for 1 week — compare output to v1 calculations
Step 9: Cut over completely, disable v1 endpoints
Step 10: Run post-migration audit — compare against pre-migration baseline
```

### Rollback Plan

- Keep v1 models in place until Step 9 is confirmed
- All v2 operations run inside MongoDB sessions/transactions — partial failure rolls back
- Post Step 3: if enrollment count mismatches, re-run migration with `--dry-run` flag to diagnose

### Data Integrity Rules to Verify Post-Migration

1. `∀ student with isActive=true: ∃ exactly 1 Enrollment with endDate=null`
2. `∀ FeeRecord: enrollmentId exists in Enrollment collection`
3. `∀ Student: creditBalance = sum(credit_added + credit_refund) - sum(credit_used) from StudentCredit`
4. `∀ Enrollment: startDate < endDate (or endDate is null)`
5. `∀ adjacent Enrollments for same student: enrollment[n].endDate === enrollment[n+1].startDate (exclusive boundary)`

---

## 9. Testing Checklist

### Fee Calculation Edge Cases

- [ ] Student joins on the 1st of a month → full fee, no pro-ration
- [ ] Student joins on the 15th of a 30-day month → 50% pro-ration
- [ ] Student joins on the last day of a month → 1/30 pro-ration
- [ ] Student upgrades on the 15th → old enrollment billed days 1–14, new billed days 15–end
- [ ] Student upgrades on the 1st → no old enrollment contribution for that month
- [ ] Student upgrades on the last day → old gets 29/30, new gets 1/30
- [ ] Student pays 3 months at once → correct FeeRecords created for all 3 months
- [ ] Student has credit, pays → credit applied before cash
- [ ] Overpayment → excess goes to creditBalance, not lost
- [ ] Student paused mid-month → fee only for active days in pause month
- [ ] Two upgrades in same month → three FeeRecords for that month (three enrollment segments)

### Batch Assignment Edge Cases

- [ ] Assign student to wrong stage/level batch → validation error
- [ ] Assign student to full batch → capacity error
- [ ] Assign student with no active enrollment to batch → should create enrollment first (or error clearly)
- [ ] Remove student from batch → `batchId = null` on student and enrollment, fee continues

### Concurrency

- [ ] Two simultaneous payments for the same student → only one credit balance deducted (not double)
- [ ] Two simultaneous batch assignments → only one succeeds if batch is at capacity

### Credit Ledger

- [ ] `balanceBefore` + `amount` (or - `amount`) === `balanceAfter` for every entry
- [ ] `Student.creditBalance` === last `StudentCredit.balanceAfter` for each student
- [ ] Credit refund correctly increases `creditBalance`
- [ ] Credit adjustment correctly sets `creditBalance` to target value

---

## 10. Files Affected

### Schema Changes Required

| File | Change |
|---|---|
| `server/src/models/v2/Student.ts` | Add `creditBalance`, `stageNumber`, `levelNumber`; deprecate `stage`/`level`; add indexes; fix name sync hooks |
| `server/src/models/v2/FeeRecord.ts` | Add `waivedAmount`, `waivedBy`, `waivedReason`, `waivedAt`, `createdBy`, `createdBySource`; update virtuals; add indexes |
| `server/src/models/v2/Enrollment.ts` | Add `pausedUntil`; fix endDate validator (exclusive convention) |
| `server/src/models/v2/StudentCredit.ts` | Add `expiresAt`; add `processedAt` index |
| `server/src/types/v2.ts` | Update all interfaces to match schema changes; fix `MonthFeeResult` to be array-typed |

### Service Changes Required

| File | Change |
|---|---|
| `server/src/services/v2/feeService.ts` | `calculateMonthFees` returns array; `processPayment` handles multi-enrollment months; credit balance from `Student.creditBalance`; batch validation; capacity enforcement |
| `server/src/services/v2/LedgerService.ts` | Update `getCreditBalance` to read from `Student.creditBalance` |

### New Files to Create

| File | Purpose |
|---|---|
| `server/scripts/BackfillCreditBalance.ts` | One-time: compute and set `Student.creditBalance` from ledger |
| `server/src/services/v2/PauseService.ts` | Pause/resume logic + cron entry |

### Migration Files to Update

| File | Change |
|---|---|
| `server/src/migrations/001_add_enrollments.ts` | Use `stageNumber`/`levelNumber`; set `creditBalance = 0`; pass `createdBySource: 'migration'` |

---

*End of V2 Schema Plan — version 1.0*
