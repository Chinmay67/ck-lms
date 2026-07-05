/**
 * MigrateToChessCourse.ts
 *
 * Consolidates 3 separate courses (beginner/intermediate/advanced) into
 * one Chess course with 3 stages. Fee schedule:
 *   Beginner:     L1=3000, L2=3500, L3=4000
 *   Intermediate: L1=4500, L2=5000, L3=5500
 *   Advanced:     L1=6000, L2=6500
 *
 * Updates all batches, enrollments, invoices, and students to reference
 * the new course ID + correct stageNumber.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI!;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }

// ─── Fee schedule ─────────────────────────────────────────────
const STAGES = [
  {
    stageNumber: 1,
    stageName: 'Beginner',
    levels: [
      { levelNumber: 1, feeAmount: 3000 },
      { levelNumber: 2, feeAmount: 3500 },
      { levelNumber: 3, feeAmount: 4000 },
    ],
  },
  {
    stageNumber: 2,
    stageName: 'Intermediate',
    levels: [
      { levelNumber: 1, feeAmount: 4500 },
      { levelNumber: 2, feeAmount: 5000 },
      { levelNumber: 3, feeAmount: 5500 },
    ],
  },
  {
    stageNumber: 3,
    stageName: 'Advanced',
    levels: [
      { levelNumber: 1, feeAmount: 6000 },
      { levelNumber: 2, feeAmount: 6500 },
    ],
  },
];

// Map old course names → new stageNumber
const NAME_TO_STAGE: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected\n');

  const db = mongoose.connection.db!;
  const courses = db.collection('courses');
  const batches = db.collection('batches');
  const enrollments = db.collection('enrollments');
  const invoices = db.collection('invoices');
  const students = db.collection('students');

  // ── 1. Find superadmin for createdBy ──────────────────────
  const users = db.collection('users');
  const superadmin = await users.findOne({ role: 'superadmin' });
  if (!superadmin) { console.error('No superadmin found'); process.exit(1); }

  // ── 2. Find old courses ───────────────────────────────────
  const oldCourses = await courses.find({
    courseName: { $in: ['beginner', 'intermediate', 'advanced'] },
  }).toArray();

  console.log(`Found ${oldCourses.length} old course(s):`);
  oldCourses.forEach(c => console.log(`  - ${c.courseName} (${c._id})`));

  // Build map: courseName → old ObjectId
  const oldIdMap: Record<string, mongoose.Types.ObjectId> = {};
  for (const c of oldCourses) {
    oldIdMap[c.courseName as string] = c._id as mongoose.Types.ObjectId;
  }

  // ── 3. Check for existing Chess course ───────────────────
  let chessCourse = await courses.findOne({ courseName: 'chess' });

  if (chessCourse) {
    console.log(`\n♻️  Chess course already exists (${chessCourse._id}), updating stages/fees…`);
    await courses.updateOne(
      { _id: chessCourse._id },
      { $set: { stages: STAGES, displayName: 'Chess', isActive: true } },
    );
  } else {
    console.log('\n🆕 Creating Chess course…');
    const result = await courses.insertOne({
      courseName: 'chess',
      displayName: 'Chess',
      description: 'Chess training program.',
      isActive: true,
      displayOrder: 1,
      stages: STAGES,
      createdBy: superadmin._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    chessCourse = await courses.findOne({ _id: result.insertedId });
    console.log(`   Created: ${chessCourse!._id}`);
  }

  const chessId = chessCourse!._id as mongoose.Types.ObjectId;

  // ── 4. Update references in other collections ─────────────
  let totalUpdated = 0;

  for (const [name, stageNumber] of Object.entries(NAME_TO_STAGE)) {
    const oldId = oldIdMap[name];
    if (!oldId) {
      console.log(`\n⚠️  No old course found for "${name}", skipping reference updates`);
      continue;
    }

    console.log(`\n🔄 Updating references: ${name} (stageNumber=${stageNumber})`);

    const batchResult = await batches.updateMany(
      { courseId: oldId },
      { $set: { courseId: chessId, stageNumber } },
    );
    console.log(`   batches: ${batchResult.modifiedCount} updated`);
    totalUpdated += batchResult.modifiedCount;

    const enrollResult = await enrollments.updateMany(
      { courseId: oldId },
      { $set: { courseId: chessId, stageNumber } },
    );
    console.log(`   enrollments: ${enrollResult.modifiedCount} updated`);
    totalUpdated += enrollResult.modifiedCount;

    const invoiceResult = await invoices.updateMany(
      { courseId: oldId },
      { $set: { courseId: chessId, stageNumber } },
    );
    console.log(`   invoices: ${invoiceResult.modifiedCount} updated`);
    totalUpdated += invoiceResult.modifiedCount;

    const studentResult = await students.updateMany(
      { courseId: oldId },
      { $set: { courseId: chessId, stageNumber } },
    );
    console.log(`   students: ${studentResult.modifiedCount} updated`);
    totalUpdated += studentResult.modifiedCount;
  }

  // ── 5. Delete old courses ─────────────────────────────────
  const oldIds = Object.values(oldIdMap);
  if (oldIds.length > 0) {
    const del = await courses.deleteMany({ _id: { $in: oldIds } });
    console.log(`\n🗑️  Deleted ${del.deletedCount} old course(s)`);
  }

  console.log(`\n✅ Migration complete — ${totalUpdated} total documents updated`);
  console.log(`   New Chess course ID: ${chessId}`);

  await mongoose.disconnect();
}

migrate().catch((err) => { console.error(err); process.exit(1); });
