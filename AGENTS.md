# CK-LMS Agent Instructions

CK-LMS is the **Chess Klub Learning Management System** — a full-stack app to manage student enrollments, batch scheduling, and fee/payment tracking for a chess education org.

## Monorepo Structure

```
client/   React 19 + TypeScript + Vite + Tailwind CSS (SPA)
server/   Express + MongoDB/Mongoose + TypeScript (REST API)
```

## Dev Commands

### Server (`cd server`)
```bash
npm install
npm run dev          # tsx watch mode on port 3000
npm run build        # tsc → dist/
npm run type-check   # no emit type check
npm start            # run compiled dist/
```

### Client (`cd client`)
```bash
npm install
npm run dev          # Vite dev server on port 5173
npm run build        # tsc + vite build
npm run lint         # ESLint
```

## Architecture

### Backend (`server/src/`)

| Dir | Purpose |
|-----|---------|
| `models/` | V1 Mongoose schemas (Student, Batch, Course, FeeRecord, User, StudentCredit, SyncJob) |
| `models/v2/` | V2 schemas (StudentV2, Enrollment, Invoice, CreditLedger) — emerging system |
| `routes/` | Express route handlers (auth, students, batches, fees, courses, credits, sync) |
| `routes/admin/` | V2 admin routes (mounted at `/api/v2/*`) |
| `middleware/` | `authenticate` (JWT) + `authorize(...roles)` + `asyncHandler` + `errorHandler` |
| `services/` | BatchService, FeeService, DatabaseService, StudentCreditService, EmailSyncService |
| `config/` | `index.ts` exports env-based config; `database.ts` is a singleton Mongoose connection |
| `scripts/` | One-off data migration & import scripts (run via `npm run <script>`) |

### API Conventions

- **Base paths:** `/api/auth`, `/api/students`, `/api/batches`, `/api/fees`, `/api/courses`, `/api/credits`, `/api/v2/*`
- **Auth:** `Authorization: Bearer <JWT>` header; 7-day token expiry
- **Roles:** `user` → `admin` → `superadmin` (escalating permissions)
- **Superadmin-only:** batch/course creation, imports (`/api/v2/imports`)
- **Standard response shape:**
  ```ts
  { success: boolean; data?: T; message?: string; error?: string; timestamp: string }
  ```
- **Error handling:** Throw `ValidationError`, `DuplicateError`, `NotFoundError`, `BusinessError` — `asyncHandler` catches and `errorHandler` formats them
- **V1 vs V2:** V1 routes still mounted; V2 routes are the active admin API. See [PLAN.md](PLAN.md) and [V2_SCHEMA_PLAN.md](V2_SCHEMA_PLAN.md)

### Frontend (`client/src/`)

| Dir | Purpose |
|-----|---------|
| `components/{students,fees,batches,courses}/` | Domain-scoped UI components |
| `components/ui/` | Shared primitives (LoadingSpinner, etc.) |
| `components/layout/` | App shell / nav wrapper |
| `services/api.ts` | Axios client with auth interceptors; exports `StudentsAPI`, `BatchesAPI`, `FeesAPI`, `CoursesAPI`, `AuthAPI` |
| `contexts/AuthContext.tsx` | Auth state (`user`, `login()`, `logout()`); use `useAuth()` hook |
| `types/` | TypeScript interfaces for all API entities |
| `utils/` | `errorHandler.ts` (`parseError`), `dateFormatter.ts`, `whatsapp.ts` |
| `config/env.ts` | Reads `import.meta.env.VITE_*` variables |

**Navigation:** Tab-based in `App.tsx` — no router library. Tabs: Students, Fees Overview, Courses (superadmin), Batches (superadmin).

## Key Domain Models

| Model | Key fields | Notes |
|-------|-----------|-------|
| **Student** | studentCode (unique), studentName, stage (`beginner`/`intermediate`/`advanced`), level (1-3), batchId, isActive | `studentCode` auto-generated |
| **Batch** | batchCode (unique auto), batchName, stage, level, schedule `[{dayOfWeek 0-6, startTime HH:MM}]`, status (`active`/`ended`/`draft`) | ≥1 schedule required for active batches |
| **Course** | courseName (unique), displayName, levels `[{levelNumber, feeAmount, durationMonths}]` | `getFeeForLevel()` method |
| **FeeRecord** | studentId, feeMonth (YYYY-MM), dueDate, feeAmount, paidAmount, paymentDate | `status` is a **virtual computed field** — never store directly |
| **User** | email, password (bcrypt), name, role, isActive | Password hashed via pre-save hook |

## Environment Variables

**Server** — create `server/.env`:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/ck-lms
JWT_SECRET=<strong-secret>           # REQUIRED — no insecure default in prod
NODE_ENV=development
DEV_FRONTEND_URL=http://localhost:5173
OUTLOOK_CLIENT_ID=...                # Microsoft Graph email sync
OUTLOOK_CLIENT_SECRET=...
OUTLOOK_TENANT_ID=...
OUTLOOK_REFRESH_TOKEN=...
```

**Client** — `client/.env.development` and `.env.production`:
```
VITE_API_BASE_URL=http://localhost:3000/api
VITE_APP_ENV=development
```

## Conventions

- **TypeScript strict mode** in both client and server
- **Server module system:** `NodeNext` (ESM) — use `.js` extensions in imports even for `.ts` source files
- **Async/await** everywhere; no `.then()` chains
- **Component files:** PascalCase `.tsx`; utility files: camelCase `.ts`; model files: PascalCase `.ts`
- **Error classes** in `server/src/middleware/errorHandler.ts` — use these instead of raw `Error`
- **Pagination** via `PaginatedResponse<T>` shape: `{ data[], pagination: { currentPage, totalPages, totalItems } }`

## Pitfalls

- **V1 vs V2 split:** Two parallel model sets in `models/` vs `models/v2/`. New work goes in V2. Don't mix imports.
- **FeeRecord.status is virtual** — computed from `dueDate` + `paidAmount`. Never write to it; filtering by status requires Mongoose aggregation or post-query filtering.
- **batchCode uniqueness:** Auto-generated; duplicate key errors indicate a pre-save hook issue, not a data problem.
- **JWT_SECRET default is insecure** — the code falls back to a literal string if env var is missing.
- **No frontend router** — refresh always resets to Students tab. Don't add URL-based navigation without refactoring `App.tsx`.
- **Email sync is Outlook-based** — Gmail OAuth vars in `.env` are deprecated/legacy.

## Relevant Documentation

- [PLAN.md](PLAN.md) — V2 migration strategy and cutover plan  
- [V2_SCHEMA_PLAN.md](V2_SCHEMA_PLAN.md) — V2 data model design  
- [BATCH_SYSTEM_IMPLEMENTATION.md](BATCH_SYSTEM_IMPLEMENTATION.md) — Batch scheduling details  
- [FEE_SYSTEM_IMPROVEMENTS.md](FEE_SYSTEM_IMPROVEMENTS.md) — Fee computation logic  
- [STUDENT_INGESTION_GUIDE.md](STUDENT_INGESTION_GUIDE.md) — Excel import workflow  
- [server/AUTHENTICATION.md](server/AUTHENTICATION.md) — Auth setup details  
- [server/MIGRATION_SUMMARY.md](server/MIGRATION_SUMMARY.md) — DB migration history  
