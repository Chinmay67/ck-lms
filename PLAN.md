# Fresh V2 Cutover And Excel Ingestion Plan

## Summary

Build v2 as the only production system, with no compatibility dependency on v1 data. The old database contents can be discarded, but the Excel file such as `Student data_15-jan-2026.xlsx` remains the source for initial students, batches, enrollments, and historical fee/payment state.

The implementation should be a hard cutover:
- Remove v1 runtime routes/services/models from the active server entrypoint.
- Promote the v2 domain to canonical API behavior.
- Rebuild frontend data types and screens around v2 shapes.
- Replace fragile cumulative fee/payment logic with auditable invoice, payment, allocation, and credit ledger records.
- Provide one deterministic fresh import pipeline with dry-run, validation report, and live import modes.

## Key Decisions

- **Data history:** ignore existing MongoDB v1 data completely.
- **Excel source:** import only from the workbook passed to the ingestion command; default may remain `Student data_15-jan-2026.xlsx`.
- **Money unit:** store all monetary values as integer rupees unless product later explicitly chooses paise. Use one unit everywhere: models, API, UI, import, reports, tests.
- **Course model:** use one configurable `Chess` course with stages `Beginner`, `Intermediate`, `Advanced`; Excel level codes `B1`, `I2`, `A3` map to stageNumber/levelNumber.
- **Fees:** generate monthly invoices from enrollment start through course duration or current billing horizon. Paid Excel rows become payment transactions allocated to invoices.
- **Draft batches:** create the batch as `draft`, create the student and enrollment without active billing if the batch has no valid start date, and store paid Excel rows as unapplied credit unless a due month can be confidently mapped.
- **Inactive/discontinued students:** import the student, close enrollment at the discontinued date if derivable, mark inactive, keep historical paid invoices, and do not generate future invoices.

## Implementation Changes

### 1. Clean V2 Foundation

- Make v2 the only loaded model set in server startup.
  - Remove v1 route mounting from `server/src/index.ts`.
  - Mount only `/api/auth` plus `/api/v2/*`.
  - Ensure no file imports both v1 and v2 versions of `Student`, `Course`, `Batch`, `FeeRecord`, or `User`.
- Resolve model naming cleanly.
  - Either move v2 schemas into canonical `server/src/models/*`, or keep `models/v2/*` but ensure every active import uses v2.
  - Remove or quarantine unused broken files such as the current `LedgerService` until its models exist.
- Add strict role protection.
  - `/api/v2/courses`, `/api/v2/batches`, `/api/v2/students`, `/api/v2/enrollments`, `/api/v2/fees`, `/api/v2/imports`: `admin` and `superadmin`.
  - destructive/import/reset endpoints: `superadmin` only.
- Fix required invariants at the database level.
  - `Enrollment`: unique partial index on `{ studentId: 1 }` where `endDate: null`.
  - `Batch`: unique `batchCode`.
  - `Invoice`: unique `{ studentId, enrollmentId, invoiceMonth }`.
  - `PaymentTransaction`: unique idempotency key when provided.
  - `Student`: unique generated `studentCode`, but allow shared email/phone for siblings.

### 2. Canonical V2 Domain

- Use these core collections:
  - `User`: admins and optional parent/guardian accounts.
  - `Student`: personal/contact data, active flags, current denormalized course/stage/level/batch, `currentEnrollmentId`, `creditBalance`.
  - `Course`: configurable stages and levels with fee and duration.
  - `Batch`: course/stage/level, schedule, capacity, status, start/end dates.
  - `Enrollment`: source of truth for a student’s course/stage/level/batch period and monthly fee snapshot.
  - `Invoice`: one monthly fee obligation for one enrollment.
  - `PaymentTransaction`: one real-world payment event.
  - `PaymentAllocation`: links payments or credits to invoices.
  - `CreditLedger`: append-only credit added/used/refunded/adjusted records.
  - `ImportRun` and `ImportIssue`: import audit, row-level results, warnings, and failures.
- Keep `Student.creditBalance` as a cached balance only; every mutation must be backed by `CreditLedger`.
- Enforce lifecycle transitions through services only.
  - Create student + enrollment in one transaction.
  - Upgrade closes current enrollment and opens the next.
  - Change batch closes current enrollment and opens same course/stage/level with new batch.
  - Pause/leave closes current enrollment and stops future invoice generation.
  - Resume creates a new enrollment from the latest paused enrollment.
- Validate all transitions.
  - Course exists and is active.
  - Stage and level exist in that course.
  - Batch belongs to the same course/stage/level.
  - Active batch has valid schedule.
  - Capacity is checked transactionally.
  - No overlapping active enrollment.
  - Transition date cannot precede enrollment start.
  - Same-day transitions use clear exclusive end date semantics.

### 3. Billing And Payment Rules

- Generate invoices through a billing service, not directly in routes.
  - Invoice month stored as UTC first day of month.
  - Due date defaults to the enrollment start day, capped to month length.
  - Fee amount is the enrollment’s monthly fee snapshot.
  - Optional proration should be explicit and deterministic; if not required, do not silently prorate.
- Payment processing must be auditable.
  - Create one `PaymentTransaction` per payment.
  - Allocate payment to selected invoices oldest-first unless the request explicitly provides invoice IDs.
  - Reject invoice IDs that do not belong to the student.
  - Reject duplicate transaction/idempotency keys.
  - Excess amount becomes credit.
  - Existing credit may be applied only through `CreditLedger` plus `PaymentAllocation`.
- Invoice status is derived:
  - `paid`: allocated + waived >= invoice amount.
  - `partially_paid`: allocated > 0 and less than invoice amount.
  - `overdue`: unpaid balance > 0 and due date is before today.
  - `upcoming`: unpaid balance > 0 and due date is today/future.
  - `void`: invoice canceled with audit reason.
- Corrections must preserve audit history.
  - Do not edit paid invoice amount directly.
  - For unpaid invoices, allow correction with reason.
  - For paid/part-paid invoices, use waiver, adjustment invoice, refund, or credit correction.
- Deleting financial records should be forbidden after any payment/allocation exists; use void/reversal instead.

### 4. Excel Import Pipeline

- Replace old v1 ingestion scripts with one v2 importer:
  - `npm run import:excel -- --file "<path>" --dry-run`
  - `npm run import:excel -- --file "<path>" --apply`
  - `npm run import:excel -- --file "<path>" --reset-fresh-db --apply`
- Import stages:
  - Read workbook and selected sheet.
  - Normalize headers supporting current variants: `S.No`, `S.No (http://s.no/)`, `Payment Due date`, `Payment Due date__1`, `Payment Due date.1`.
  - Parse rows into a neutral DTO before creating DB records.
  - Validate all rows and produce an import report before writing.
  - In apply mode, run deterministic writes in transactions.
- Row normalization:
  - Trim names and text fields.
  - Clean Indian phone numbers to 10 digits where possible.
  - Lowercase and validate emails.
  - Require at least one valid phone or email.
  - Parse Excel serial dates, ISO dates, and `dd/mm/yyyy`.
  - Treat invalid date text like `need to start batch`, `pending`, `tbd` as null.
  - Parse level codes `B1`, `B 1`, `I2`, `A3`.
  - Parse batch codes like `WF:2:30(U)`, preserving suffixes.
  - Convert batch times to 24-hour format with explicit PM assumption.
- Import course setup:
  - Seed `Chess` if missing.
  - Stages: Beginner = 1, Intermediate = 2, Advanced = 3.
  - Levels derive from configured seed values; fail import if Excel references a stage/level with no configured fee.
- Import batches:
  - Group by normalized batch code + stage + level + batch start date.
  - Create `active` batch when start date and schedule are valid.
  - Create `draft` batch when start date is missing/invalid.
  - Preserve duplicate-looking Excel batch codes by adding deterministic suffixes only when the same code points to different stage/level/start-date groups.
  - Detect and report unparseable schedules instead of silently assigning students.
- Import students/enrollments:
  - Deduplicate only by exact row identity rules: same normalized name plus same phone/email is considered same student within the same import run.
  - Allow siblings sharing phone/email as separate students.
  - Create parent/guardian user only if the system still needs login accounts for guardians; otherwise keep contact data on Student.
  - Effective enrollment start date:
    - If active batch start exists and student start is after it, use student start.
    - If active batch start exists and student start is before/on it, use batch start.
    - If no active batch start exists, use student start if valid but keep no active billing batch.
  - Assign active batch only when batch is valid and not draft.
  - Mark inactive for discontinued/left/stopped/withdrawn statuses.
- Import invoices and payments:
  - Build invoice months from effective enrollment start through max of configured duration, latest Excel due/payment month, and current month for active students.
  - Map paid Excel rows by due-date month first, then paid-date month when due date is missing.
  - Create paid invoice + payment + allocation when payment can be mapped.
  - Create unpaid invoice when due date exists but no paid date.
  - If paid date exists but no invoice month can be derived, create unapplied credit and record an import warning.
  - Do not generate future invoices for inactive/discontinued students beyond their closure month.
  - Import payment method as `other` unless Excel later provides a method column.
- Import reporting:
  - Save `ImportRun` with total rows, created students, created batches, invoices, payments, credits, skipped rows, warnings, errors.
  - Export a CSV/JSON report for row-level failures.
  - Dry-run must perform all validation without writing tracked business records.

### 5. API And Frontend Completion

- Replace frontend v1 types with v2 types.
  - `Course` has `stages[].levels[]`, not flat `levels`.
  - `Student` has `courseId`, `stageNumber`, `levelNumber`, `currentEnrollmentId`, `creditBalance`.
  - `Batch` has `courseId`, `stageNumber`, `levelNumber`, not string `stage`.
  - Fees use invoices, payments, allocations, and credits.
- Build/complete v2 screens:
  - Dashboard: active/inactive students, overdue invoices, monthly collection, outstanding balance, credit liability.
  - Students: search/filter, profile, enrollment history, invoices, payments, credit ledger.
  - Courses: stages/levels CRUD with protection when active enrollments exist.
  - Batches: CRUD, schedule, capacity, active/draft/end states, student roster.
  - Enrollments: upgrade, change batch, pause, resume, leave.
  - Billing: invoice list, payment collection, waiver, correction, credit application, void/reversal.
  - Import: upload Excel, dry-run preview, row issues, apply import, import history.
- Keep API responses consistent:
  - `{ success, data, error, message, timestamp }`.
  - Paginated list shape: `{ data, pagination }`.
  - Dates returned as ISO strings.
  - Money returned as integer rupees plus formatted display handled by UI.

## Real-World Edge Cases To Cover

- Duplicate student names with different contacts.
- Siblings sharing the same phone/email.
- Student with email only or phone only.
- Invalid phone and invalid email.
- Empty student name row.
- Excel date serials, local date strings, invalid date text, timezone boundaries.
- Batch code suffixes such as `(U)` and duplicate batch code with different start dates.
- Draft batch with payments already received.
- Student starts after batch start and misses earlier months.
- Student starts before batch start.
- Missing student start but valid batch start.
- Missing batch start but valid student start.
- Discontinued student with paid historical months.
- Discontinued student with future unpaid rows.
- Paid date exists with missing due date.
- Due date exists with missing paid date.
- Duplicate payment columns.
- Re-importing same Excel file.
- Duplicate transaction/idempotency key.
- Overpayment across selected invoices.
- Partial payment.
- Credit application before cash.
- Waiver on unpaid, partial, and paid invoices.
- Attempt to delete paid invoice.
- Course fee changes after enrollment start.
- Upgrade mid-billing period.
- Batch change with same stage/level.
- Pause and resume.
- Leave and later rejoin.
- Batch capacity race conditions.
- Admin role versus regular user access.
- Mongo transaction rollback on mid-import failure.

## Test Plan

- Add server unit tests for parsers:
  - level parsing, batch parsing, date parsing, status parsing, header variants.
- Add service tests with an isolated test database:
  - student creation, enrollment transitions, invoice generation, payment allocation, credit ledger, waivers, voids.
- Add importer tests:
  - dry-run writes nothing.
  - apply mode creates expected students/batches/enrollments/invoices/payments.
  - malformed rows produce row-level errors and do not crash the run.
  - repeated import is idempotent when import source row keys match.
- Add API integration tests:
  - auth/authorization.
  - CRUD for courses, batches, students.
  - enrollment lifecycle endpoints.
  - billing/payment endpoints.
  - import dry-run and apply endpoints.
- Add frontend checks:
  - TypeScript build passes.
  - Main v2 screens render with mocked API data.
  - Payment and import forms validate obvious bad input.
- Required acceptance gates:
  - `npm run type-check` passes in server.
  - `npm run build` passes in client.
  - Test suite passes.
  - Fresh DB seed + Excel dry-run + Excel apply completes with a saved import report.
  - Manual smoke flow works: login, view dashboard, open student, collect payment, see invoice/credit updates.

## Rollout Steps

1. Freeze current v1 code as legacy reference only.
2. Implement/fix v2 models and services.
3. Remove v1 runtime route mounting and broken mixed imports.
4. Implement v2 importer with dry-run reports.
5. Update frontend to v2-only types and screens.
6. Add tests and fix type-check/build.
7. Run fresh database reset in non-production.
8. Seed admin user and `Chess` course config.
9. Run Excel dry-run and review import issues.
10. Fix import mapping/configuration issues.
11. Run Excel apply.
12. Verify dashboard totals, student counts, batch counts, invoices, paid amounts, credit liability.
13. Deploy v2-only backend/frontend.
14. Keep old v1 scripts/routes out of runtime; archive them only if needed for reference.

## Assumptions

- Existing MongoDB business data can be dropped or ignored.
- The Excel workbook is the only source of initial operational data.
- Fees in existing scripts are rupee integers, so v2 will standardize on rupees.
- Chess is the initial course; Beginner/Intermediate/Advanced become configurable stages inside that course.
- Excel does not contain exact payment amounts, so each paid payment row is treated as one full monthly fee unless an amount column is later added.
- Guardian login accounts are optional; contact sharing for siblings must be supported either way.
