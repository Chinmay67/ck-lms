import Database from '../config/database.js';
import Batch from '../models/v2/Batch.js';
import Course from '../models/v2/Course.js';
import CreditLedger from '../models/v2/CreditLedger.js';
import Enrollment from '../models/v2/Enrollment.js';
import Invoice from '../models/v2/Invoice.js';
import Lead from '../models/v2/Lead.js';
import PaymentAllocation from '../models/v2/PaymentAllocation.js';
import PaymentTransaction from '../models/v2/PaymentTransaction.js';
import StudentV2 from '../models/v2/Student.js';
import User from '../models/v2/User.js';
import WaiverLedger from '../models/v2/WaiverLedger.js';
import {
  addCredit,
  createInvoice,
  createStudentWithEnrollment,
  leaveEnrollment,
  pauseEnrollment,
  processPayment,
} from '../services/v2/feeService.js';

const FIXTURE_EMAIL_DOMAIN = 'chessklub.org';
const SUPERADMIN_EMAIL = `e2e.superadmin@${FIXTURE_EMAIL_DOMAIN}`;
const ADMIN_EMAIL = `e2e.admin@${FIXTURE_EMAIL_DOMAIN}`;
const COURSE_NAME = 'e2e-chess-klub';

const today = new Date();
const currentMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
const previousMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function monthDueDate(month: Date, day = 5): Date {
  return utcDate(month.getUTCFullYear(), month.getUTCMonth(), day);
}

async function upsertUser(params: {
  email: string;
  name: string;
  role: 'admin' | 'superadmin';
}) {
  const existing = await User.findOne({ email: params.email }).select('+password');
  if (existing) {
    existing.name = params.name;
    existing.role = params.role;
    existing.isActive = true;
    existing.password = 'Admin@12345';
    await existing.save();
    return existing;
  }

  return User.create({
    email: params.email,
    name: params.name,
    password: 'Admin@12345',
    role: params.role,
    isActive: true,
  });
}

async function clearFixtureSlice() {
  const fixtureStudents = await StudentV2.find({
    email: { $regex: `^e2e\\..*@${FIXTURE_EMAIL_DOMAIN.replace('.', '\\.')}$` },
  }).select('_id');
  const studentIds = fixtureStudents.map((student) => student._id);

  if (studentIds.length > 0) {
    await Promise.all([
      Invoice.deleteMany({ studentId: { $in: studentIds } }),
      PaymentTransaction.deleteMany({ studentId: { $in: studentIds } }),
      PaymentAllocation.deleteMany({ studentId: { $in: studentIds } }),
      CreditLedger.deleteMany({ studentId: { $in: studentIds } }),
      WaiverLedger.deleteMany({ studentId: { $in: studentIds } }),
      Enrollment.deleteMany({ studentId: { $in: studentIds } }),
    ]);
    await StudentV2.deleteMany({ _id: { $in: studentIds } });
  }

  const course = await Course.findOne({ courseName: COURSE_NAME }).select('_id');
  if (course) {
    await Batch.deleteMany({ courseId: course._id });
    await Course.deleteOne({ _id: course._id });
  }

  await Lead.deleteMany({
    email: { $regex: `^e2e\\.lead.*@${FIXTURE_EMAIL_DOMAIN.replace('.', '\\.')}$` },
  });
}

async function createCourse(createdBy: string) {
  return Course.create({
    courseName: COURSE_NAME,
    displayName: 'Chess Klub E2E Program',
    description: 'Fixture course for validating admin workflows end to end.',
    isActive: true,
    displayOrder: 1,
    createdBy,
    stages: [
      {
        stageNumber: 1,
        stageName: 'Beginner',
        levels: [
          { levelNumber: 1, feeAmount: 2500, durationMonthsMin: 2, durationMonthsMax: 3, approximateHours: 16 },
          { levelNumber: 2, feeAmount: 2750, durationMonthsMin: 2, durationMonthsMax: 3, approximateHours: 18 },
          { levelNumber: 3, feeAmount: 3000, durationMonthsMin: 2, durationMonthsMax: 4, approximateHours: 20 },
        ],
      },
      {
        stageNumber: 2,
        stageName: 'Intermediate',
        levels: [
          { levelNumber: 1, feeAmount: 3500, durationMonthsMin: 3, durationMonthsMax: 4, approximateHours: 24 },
          { levelNumber: 2, feeAmount: 3750, durationMonthsMin: 3, durationMonthsMax: 4, approximateHours: 26 },
          { levelNumber: 3, feeAmount: 4000, durationMonthsMin: 3, durationMonthsMax: 5, approximateHours: 28 },
        ],
      },
      {
        stageNumber: 3,
        stageName: 'Advanced',
        levels: [
          { levelNumber: 1, feeAmount: 4500, durationMonthsMin: 4, durationMonthsMax: 5, approximateHours: 32 },
          { levelNumber: 2, feeAmount: 5000, durationMonthsMin: 4, durationMonthsMax: 6, approximateHours: 36 },
          { levelNumber: 3, feeAmount: 5500, durationMonthsMin: 5, durationMonthsMax: 6, approximateHours: 40 },
        ],
      },
    ],
  });
}

async function createBatches(courseId: string, createdBy: string) {
  const active = await Batch.create({
    batchName: 'E2E Beginner Morning',
    batchCode: 'E2E-BEG-MORN',
    courseId,
    stageNumber: 1,
    levelNumber: 1,
    maxStudents: 12,
    filledSeats: 0,
    schedule: [
      { dayOfWeek: 1, startTime: '16:30' },
      { dayOfWeek: 3, startTime: '16:30' },
    ],
    status: 'active',
    startDate: previousMonth,
    description: 'Active fixture batch for student enrollment and fee tests.',
    createdBy,
  });

  const draft = await Batch.create({
    batchName: 'E2E Intermediate Draft',
    batchCode: 'E2E-INT-DRAFT',
    courseId,
    stageNumber: 2,
    levelNumber: 1,
    maxStudents: 10,
    filledSeats: 0,
    schedule: [],
    status: 'draft',
    startDate: nextMonth,
    description: 'Draft fixture batch for visibility and permissions tests.',
    createdBy,
  });

  const ended = await Batch.create({
    batchName: 'E2E Advanced Ended',
    batchCode: 'E2E-ADV-ENDED',
    courseId,
    stageNumber: 3,
    levelNumber: 1,
    maxStudents: 8,
    filledSeats: 0,
    schedule: [{ dayOfWeek: 6, startTime: '10:00' }],
    status: 'ended',
    startDate: utcDate(previousMonth.getUTCFullYear(), previousMonth.getUTCMonth() - 3, 1),
    endDate: previousMonth,
    description: 'Ended fixture batch for status filtering tests.',
    createdBy,
  });

  return { active, draft, ended };
}

async function createStudent(params: {
  name: string;
  emailKey: string;
  parentName: string;
  phoneSuffix: string;
  courseId: string;
  batchId: string | null;
  stageNumber?: number;
  levelNumber?: number;
  monthlyFee?: number;
  startDate?: Date;
  createdBy: string;
}) {
  return createStudentWithEnrollment({
    student: {
      studentName: params.name,
      parentName: params.parentName,
      phone: `90000${params.phoneSuffix}`,
      email: `e2e.${params.emailKey}@${FIXTURE_EMAIL_DOMAIN}`,
      referredBy: 'E2E fixture',
    },
    courseId: params.courseId,
    stageNumber: params.stageNumber ?? 1,
    levelNumber: params.levelNumber ?? 1,
    batchId: params.batchId,
    grossFee: params.monthlyFee ?? 2500,
    monthlyFee: params.monthlyFee ?? 2500,
    discountType: 'none',
    discountPct: 0,
    discountAmount: 0,
    discountReason: '',
    feeOverridden: false,
    startDate: params.startDate ?? currentMonth,
    createdBy: params.createdBy,
  });
}

async function seedStudents(courseId: string, batchId: string, adminUserId: string) {
  const paid = await createStudent({
    name: 'E2E Paid Student',
    emailKey: 'paid',
    parentName: 'Paid Parent',
    phoneSuffix: '0001',
    courseId,
    batchId,
    createdBy: adminUserId,
  });
  const paidInvoice = await createInvoice({
    studentId: paid.student._id.toString(),
    enrollmentId: paid.enrollment._id.toString(),
    invoiceMonth: currentMonth,
    dueDate: monthDueDate(currentMonth),
    amount: 2500,
    createdBy: adminUserId,
  });
  await processPayment(
    paid.student._id.toString(),
    2500,
    [paidInvoice._id.toString()],
    'upi',
    adminUserId,
    'E2E-PAID-001',
    { remarks: 'Fixture full payment' },
  );

  const partial = await createStudent({
    name: 'E2E Partial Student',
    emailKey: 'partial',
    parentName: 'Partial Parent',
    phoneSuffix: '0002',
    courseId,
    batchId,
    createdBy: adminUserId,
  });
  const partialInvoice = await createInvoice({
    studentId: partial.student._id.toString(),
    enrollmentId: partial.enrollment._id.toString(),
    invoiceMonth: currentMonth,
    dueDate: monthDueDate(currentMonth),
    amount: 2500,
    createdBy: adminUserId,
  });
  await processPayment(
    partial.student._id.toString(),
    1000,
    [partialInvoice._id.toString()],
    'cash',
    adminUserId,
    'E2E-PARTIAL-001',
    { remarks: 'Fixture partial payment' },
  );

  const overdue = await createStudent({
    name: 'E2E Overdue Student',
    emailKey: 'overdue',
    parentName: 'Overdue Parent',
    phoneSuffix: '0003',
    courseId,
    batchId,
    startDate: previousMonth,
    createdBy: adminUserId,
  });
  await createInvoice({
    studentId: overdue.student._id.toString(),
    enrollmentId: overdue.enrollment._id.toString(),
    invoiceMonth: previousMonth,
    dueDate: monthDueDate(previousMonth),
    amount: 2500,
    createdBy: adminUserId,
  });

  const credit = await createStudent({
    name: 'E2E Credit Student',
    emailKey: 'credit',
    parentName: 'Credit Parent',
    phoneSuffix: '0004',
    courseId,
    batchId: null,
    createdBy: adminUserId,
  });
  await addCredit(credit.student._id.toString(), 1800, 'Advance collected before batch assignment', adminUserId, {
    paymentMethod: 'online',
    transactionId: 'E2E-CREDIT-001',
    remarks: 'Fixture standalone credit',
  });

  const paused = await createStudent({
    name: 'E2E Paused Student',
    emailKey: 'paused',
    parentName: 'Paused Parent',
    phoneSuffix: '0005',
    courseId,
    batchId,
    createdBy: adminUserId,
  });
  await pauseEnrollment(
    paused.student._id.toString(),
    today,
    utcDate(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 15),
    adminUserId,
  );

  const left = await createStudent({
    name: 'E2E Left Student',
    emailKey: 'left',
    parentName: 'Left Parent',
    phoneSuffix: '0006',
    courseId,
    batchId,
    createdBy: adminUserId,
  });
  await leaveEnrollment(left.student._id.toString(), today, adminUserId);
}

async function seedLeads(courseId: string, adminUserId: string) {
  await Lead.create([
    {
      name: 'E2E New Lead Parent',
      phone: '9100000001',
      email: `e2e.lead-new@${FIXTURE_EMAIL_DOMAIN}`,
      childName: 'E2E New Lead Child',
      childAge: 8,
      interestedCourseId: courseId,
      interestedStageName: 'Beginner',
      source: 'online',
      status: 'new',
      notes: 'Fixture lead for create/edit/status tests.',
      createdBy: adminUserId,
    },
    {
      name: 'E2E Follow Up Parent',
      phone: '9100000002',
      email: `e2e.lead-follow-up@${FIXTURE_EMAIL_DOMAIN}`,
      childName: 'E2E Follow Up Child',
      childAge: 10,
      interestedCourseId: courseId,
      interestedStageName: 'Intermediate',
      source: 'referral',
      status: 'follow-up',
      followUpDate: utcDate(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 3),
      notes: 'Fixture follow-up lead.',
      createdBy: adminUserId,
    },
    {
      name: 'E2E Converted Lead Parent',
      phone: '9100000003',
      email: `e2e.lead-converted@${FIXTURE_EMAIL_DOMAIN}`,
      childName: 'E2E Converted Lead Child',
      childAge: 9,
      interestedCourseId: courseId,
      interestedStageName: 'Beginner',
      source: 'walk-in',
      status: 'converted',
      notes: 'Fixture converted lead.',
      createdBy: adminUserId,
    },
  ]);
}

async function main() {
  const db = Database.getInstance();
  await db.connect();

  try {
    console.log('Clearing existing E2E fixture data...');
    await clearFixtureSlice();

    const superadmin = await upsertUser({
      email: SUPERADMIN_EMAIL,
      name: 'E2E Superadmin',
      role: 'superadmin',
    });
    await upsertUser({
      email: ADMIN_EMAIL,
      name: 'E2E Admin',
      role: 'admin',
    });

    const course = await createCourse(superadmin._id.toString());
    const batches = await createBatches(course._id.toString(), superadmin._id.toString());
    await seedStudents(course._id.toString(), batches.active._id.toString(), superadmin._id.toString());
    await seedLeads(course._id.toString(), superadmin._id.toString());

    console.log(JSON.stringify({
      success: true,
      credentials: {
        superadmin: { email: SUPERADMIN_EMAIL, password: 'Admin@12345' },
        admin: { email: ADMIN_EMAIL, password: 'Admin@12345' },
      },
      course: { id: course._id.toString(), displayName: course.displayName },
      batches: {
        active: batches.active.batchCode,
        draft: batches.draft.batchCode,
        ended: batches.ended.batchCode,
      },
      students: {
        paid: `e2e.paid@${FIXTURE_EMAIL_DOMAIN}`,
        partial: `e2e.partial@${FIXTURE_EMAIL_DOMAIN}`,
        overdue: `e2e.overdue@${FIXTURE_EMAIL_DOMAIN}`,
        credit: `e2e.credit@${FIXTURE_EMAIL_DOMAIN}`,
        paused: `e2e.paused@${FIXTURE_EMAIL_DOMAIN}`,
        left: `e2e.left@${FIXTURE_EMAIL_DOMAIN}`,
      },
    }, null, 2));
  } finally {
    await db.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
