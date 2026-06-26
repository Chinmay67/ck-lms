/**
 * MIGRATION: 001_add_enrollments
 *
 * Backfills the new Enrollment collection from existing Student + FeeRecord data.
 *
 * Steps:
 *   1. Fix legacy fields: copy skillCategory → stage, skillLevel → level where needed
 *   2. Create one Enrollment per active student
 *   3. Link existing FeeRecords to the new Enrollment
 *   4. Set currentEnrollmentId on each Student
 *
 * Usage:
 *   npx ts-node --esm src/migrations/001_add_enrollments.ts
 *
 * Prerequisites:
 *   - MongoDB connection string in DATABASE_URL env var (or config)
 *   - Course documents must exist with correct fee amounts
 *   - Run against a BACKUP first
 */

import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// We import models by registering them — order matters for refs
import Course from '../models/v2/Course.js';
import Student from '../models/v2/Student.js';
// Uses v2 FeeRecord — feeMonth field is now a Date
import FeeRecord from '../models/v2/FeeRecord.js';
import Enrollment from '../models/v2/Enrollment.js';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

/** Parse a feeMonth string like '2026-01' or 'January 2026' into a midnight-UTC Date for the 1st. */
function parseFeeMonth(raw: string): Date | null {
  // Try YYYY-MM first
  const isoMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (isoMatch) {
    return new Date(Date.UTC(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, 1));
  }
  // Try "Month YYYY"
  const parsed = new Date(raw + ' 1');
  if (!isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), 1));
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Main migration
// ─────────────────────────────────────────────────────────────────

async function migrate() {
  const dbUrl = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!dbUrl) {
    console.error('DATABASE_URL or MONGODB_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(dbUrl);
  console.log('Connected to MongoDB');

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ── Step 1: Fix legacy skillCategory → stage, skillLevel → level ──
    console.log('\n── Step 1: Fix legacy fields ──');

    const legacyStudents = await Student.find({
      $or: [
        { stage: { $exists: false } },
        { stage: null },
        { level: { $exists: false } },
        { level: null },
      ],
    }).session(session);

    let fixedCount = 0;
    for (const student of legacyStudents) {
      const needsStage = !student.stage && student.skillCategory;
      const needsLevel = !student.level && student.skillLevel;

      if (needsStage || needsLevel) {
        if (needsStage && student.skillCategory) {
          student.stage = student.skillCategory;
        }
        if (needsLevel) {
          student.level = (student.skillLevel ?? 1) as 1 | 2 | 3;
        }
        await student.save({ session });
        fixedCount++;
      }
    }
    console.log(`  Fixed ${fixedCount} students with legacy skillCategory/skillLevel`);

    // ── Step 2: Create Enrollments for each student ──────────────
    console.log('\n── Step 2: Create Enrollments ──');

    // Pre-load course fee lookups from v2 Course (stages[].levels[])
    // Map: "courseId:stageNumber:levelNumber" → { feeAmount, courseId }
    const courses = await Course.find({ isActive: true }).session(session);

    type FeeMapEntry = { courseId: Types.ObjectId; feeAmount: number };
    // Key: "stageName_lower:levelNumber"  (matches legacy student.stage / student.level)
    const feeByStageLevel = new Map<string, FeeMapEntry>();
    // Key: "courseId:stageNumber:levelNumber"  (for any student that already has numeric keys)
    const feeByNumeric = new Map<string, FeeMapEntry>();
    // Use the first (or only) active course as the default courseId for legacy students
    const defaultCourse = courses[0];

    for (const course of courses) {
      for (const stage of course.stages) {
        for (const lvl of stage.levels) {
          feeByNumeric.set(
            `${course._id}:${stage.stageNumber}:${lvl.levelNumber}`,
            { courseId: course._id as Types.ObjectId, feeAmount: lvl.feeAmount },
          );
          // Legacy key: stageName (lowercased) + levelNumber
          const legacyKey = `${stage.stageName.toLowerCase()}:${lvl.levelNumber}`;
          if (!feeByStageLevel.has(legacyKey)) {
            feeByStageLevel.set(legacyKey, {
              courseId: course._id as Types.ObjectId,
              feeAmount: lvl.feeAmount,
            });
          }
        }
      }
    }

    const allStudents = await Student.find({}).session(session);
    let enrollmentCount = 0;
    let skippedCount = 0;

    for (const student of allStudents) {
      // v2 Student uses stageNumber / levelNumber; v1 used stage (string) / level (number)
      const stageNum: number | undefined = (student as any).stageNumber ?? undefined;
      const levelNum: number | undefined = (student as any).levelNumber ?? undefined;
      const stageName: string | undefined = (student as any).stage ?? undefined;
      const levelLegacy: number | undefined = (student as any).level ?? undefined;

      // Check if enrollment already exists (idempotent)
      const existing = await Enrollment.findOne({
        studentId: student._id,
        endDate: null,
      }).session(session);

      if (existing) {
        // Already migrated — just make sure student has currentEnrollmentId
        await Student.updateOne(
          { _id: student._id },
          { $set: { currentEnrollmentId: existing._id } },
          { session },
        );
        continue;
      }

      // Resolve fee entry — prefer numeric keys, fall back to legacy string stage
      let feeEntry: FeeMapEntry | undefined;
      let resolvedStageNumber: number | undefined;
      let resolvedLevelNumber: number | undefined;
      let resolvedCourseId: Types.ObjectId | undefined;

      const studentCourseId = (student as any).courseId as Types.ObjectId | undefined;

      if (stageNum && levelNum && (studentCourseId || defaultCourse)) {
        const cid = studentCourseId ?? defaultCourse._id as Types.ObjectId;
        feeEntry = feeByNumeric.get(`${cid}:${stageNum}:${levelNum}`);
        resolvedStageNumber = stageNum;
        resolvedLevelNumber = levelNum;
        resolvedCourseId = cid;
      }

      if (!feeEntry && stageName && levelLegacy) {
        feeEntry = feeByStageLevel.get(`${stageName.toLowerCase()}:${levelLegacy}`);
        // Derive stageNumber from matched course
        if (feeEntry && defaultCourse) {
          const matchedStage = defaultCourse.stages.find(
            (s: { stageName: string }) => s.stageName.toLowerCase() === stageName.toLowerCase(),
          );
          resolvedStageNumber = matchedStage?.stageNumber;
          resolvedLevelNumber = levelLegacy;
          resolvedCourseId = feeEntry.courseId;
        }
      }

      if (!feeEntry || resolvedStageNumber === undefined || resolvedLevelNumber === undefined || !resolvedCourseId) {
        console.warn(
          `  SKIP student ${student._id} (${student.studentName}) — ` +
          `cannot resolve fee for stage=${stageName ?? stageNum} level=${levelLegacy ?? levelNum}`,
        );
        skippedCount++;
        continue;
      }

      // Determine start date: use feeCycleStartDate if available, else enrollmentDate
      const bestStartDate: Date = (student as any).feeCycleStartDate ?? student.enrollmentDate ?? new Date();

      const enrollment = new Enrollment({
        studentId: student._id,
        batchId: student.batchId ?? null,
        courseId: resolvedCourseId,
        stageNumber: resolvedStageNumber,
        levelNumber: resolvedLevelNumber,
        monthlyFee: feeEntry.feeAmount,
        discountPct: 0,
        startDate: bestStartDate,
        endDate: student.isActive ? null : new Date(),
        endReason: student.isActive ? null : 'inactive',
        createdBy: (student as any).createdBy ?? new Types.ObjectId(),
      });
      await enrollment.save({ session });

      await Student.updateOne(
        { _id: student._id },
        { $set: { currentEnrollmentId: enrollment._id } },
        { session },
      );

      enrollmentCount++;
    }
    console.log(`  Created ${enrollmentCount} enrollments (${skippedCount} skipped)`);

    // ── Step 3: Backfill FeeRecords with enrollmentId ────────────
    console.log('\n── Step 3: Link FeeRecords to Enrollments ──');

    const allFeeRecords = await FeeRecord.find({}).session(session);
    let linkedCount = 0;
    let unlinkableCount = 0;

    for (const fr of allFeeRecords) {
      // Skip if already linked (use .get() for fields not in the strict interface)
      if ((fr as any).enrollmentId) {
        continue;
      }

      // Parse feeMonth string into a Date
      // Existing v1 data has feeMonth as string, but v2 schema types it as Date
      const feeMonthStr = fr.feeMonth as unknown as string;
      const feeMonthDate = parseFeeMonth(feeMonthStr);
      if (!feeMonthDate) {
        console.warn(`  SKIP FeeRecord ${fr._id} — cannot parse feeMonth "${feeMonthStr}"`);
        unlinkableCount++;
        continue;
      }

      const monthStart = startOfMonthUTC(feeMonthDate);
      const monthEnd = endOfMonthUTC(feeMonthDate);

      // Find matching enrollment
      const enrollment = await Enrollment.findOne({
        studentId: fr.studentId,
        startDate: { $lte: monthEnd },
        $or: [
          { endDate: null },
          { endDate: { $gte: monthStart } },
        ],
      })
        .sort({ startDate: -1 })
        .session(session);

      if (!enrollment) {
        console.warn(`  SKIP FeeRecord ${fr._id} — no matching enrollment for ${feeMonthStr}`);
        unlinkableCount++;
        continue;
      }

      // Update in place: add enrollmentId + convert feeMonth to Date
      await FeeRecord.updateOne(
        { _id: fr._id },
        {
          $set: {
            enrollmentId: enrollment._id,
            feeMonth: monthStart, // Convert string → Date
          },
        },
        { session },
      );
      linkedCount++;
    }
    console.log(`  Linked ${linkedCount} fee records (${unlinkableCount} could not be linked)`);

    // ── Commit ───────────────────────────────────────────────────
    await session.commitTransaction();
    console.log('\n✓ Migration completed successfully');
  } catch (err) {
    await session.abortTransaction();
    console.error('\n✗ Migration failed — transaction rolled back');
    console.error(err);
    process.exit(1);
  } finally {
    session.endSession();
    await mongoose.disconnect();
  }
}

migrate();
