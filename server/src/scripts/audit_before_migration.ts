// Usage: npx ts-node --esm src/scripts/audit_before_migration.ts
//
// Read-only diagnostic to run BEFORE executing migrations/001_add_enrollments.ts.
// Connects to MongoDB, reads existing data, prints a report. Does NOT write anything.

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// ─────────────────────────────────────────────────────────────────
// Types for raw MongoDB documents
// ─────────────────────────────────────────────────────────────────

type RawDoc = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const isoFormat = /^\d{4}-\d{2}$/;
const longFormat = /^[A-Za-z]+ \d{4}$/;

function isRecognisedFeeMonth(value: string): boolean {
  return isoFormat.test(value) || longFormat.test(value);
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

async function audit() {
  const dbUrl = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!dbUrl) {
    console.error('DATABASE_URL or MONGODB_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(dbUrl);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to get database handle');
    process.exit(1);
  }

  const blockers: string[] = [];

  try {
    console.log('════════════════════════════════════════');
    console.log('  PRE-MIGRATION AUDIT REPORT');
    console.log('════════════════════════════════════════\n');

    // ── Check A — feeMonth string formats ────────────────────────

    const feeRecordsColl = db.collection('feerecords');
    const sampledRecords = await feeRecordsColl.find({}).limit(20).toArray();
    const uniqueFeeMonths = [...new Set(
      sampledRecords
        .map((r: RawDoc) => r.feeMonth)
        .filter((v): v is string => typeof v === 'string')
    )];

    const unrecognised = uniqueFeeMonths.filter(v => !isRecognisedFeeMonth(v));

    console.log('[A] feeMonth formats found in FeeRecords:');
    console.log(`    Total records sampled: ${sampledRecords.length}`);
    console.log(`    Unique values: ${JSON.stringify(uniqueFeeMonths)}`);
    if (unrecognised.length === 0) {
      console.log('    ✓ All formats recognised');
    } else {
      console.log(`    ✗ Unrecognised formats — add handling before migration: ${JSON.stringify(unrecognised)}`);
      blockers.push(`Unrecognised feeMonth formats: ${JSON.stringify(unrecognised)}`);
    }
    console.log();

    // ── Check B — Students missing stage/level ───────────────────

    const studentsColl = db.collection('students');

    // Fixable: stage/level missing but skillCategory/skillLevel present
    const fixableCount = await studentsColl.countDocuments({
      $or: [
        { stage: { $exists: false } },
        { stage: null },
        { level: { $exists: false } },
        { level: null },
      ],
      $and: [
        { $or: [{ skillCategory: { $exists: true, $ne: null } }, { skillLevel: { $exists: true, $ne: null } }] },
      ],
    });

    // Manual intervention: stage/level missing AND skillCategory/skillLevel also missing
    const manualCount = await studentsColl.countDocuments({
      $or: [
        { stage: { $exists: false } },
        { stage: null },
        { level: { $exists: false } },
        { level: null },
      ],
      skillCategory: { $in: [null, undefined] },
      skillLevel: { $in: [null, undefined] },
    });

    console.log('[B] Students with missing stage/level:');
    console.log(`    Fixable (have skillCategory/skillLevel): ${fixableCount}`);
    console.log(`    Manual intervention needed (missing both): ${manualCount}`);
    if (manualCount > 0) {
      console.log(`    ⚠ ${manualCount} student(s) will be skipped — review before migration`);
      blockers.push(`${manualCount} student(s) missing stage/level with no fallback`);
    } else {
      console.log('    ✓ All students have stage/level or can be auto-fixed');
    }
    console.log();

    // ── Check C — Unmatched course fees ──────────────────────────

    const coursesColl = db.collection('courses');
    const courses = await coursesColl.find({ isActive: true }).toArray();

    // Build a set of valid "courseName:levelNumber" combinations
    const validCombos = new Set<string>();
    for (const course of courses) {
      const levels = course.levels as Array<RawDoc> | undefined;
      if (!levels) continue;
      for (const lvl of levels) {
        // In Course model, courseName is the stage name (e.g. "beginner")
        validCombos.add(`${course.courseName as string}:${lvl.levelNumber as number}`);
      }
    }

    // Find students with valid stage+level and check against course combos
    const studentsWithStageLevel = await studentsColl.find({
      stage: { $exists: true, $ne: null },
      level: { $exists: true, $ne: null },
    }).toArray();

    const unmatchedCombos = new Set<string>();
    let unmatchedStudentCount = 0;

    for (const student of studentsWithStageLevel) {
      const combo = `${student.stage as string}:${student.level as number}`;
      if (!validCombos.has(combo)) {
        unmatchedCombos.add(combo);
        unmatchedStudentCount++;
      }
    }

    console.log('[C] Unmatched course fees:');
    console.log(`    Students with no course fee for their stage:level: ${unmatchedStudentCount}`);
    if (unmatchedCombos.size > 0) {
      console.log(`    Unmatched combinations: ${JSON.stringify([...unmatchedCombos])}`);
      console.log('    ⚠ Create Course documents for these combinations before running migration');
      blockers.push(`Unmatched course fees: ${JSON.stringify([...unmatchedCombos])}`);
    } else {
      console.log('    ✓ All student stage:level combos have matching course fees');
    }
    console.log();

    // ── Check D — Orphaned FeeRecords ────────────────────────────

    const allStudentIds = new Set(
      (await studentsColl.find({}).project({ _id: 1 }).toArray())
        .map((s: RawDoc) => String(s._id))
    );

    const allFeeRecords = await feeRecordsColl.find({}).project({ studentId: 1 }).toArray();
    let orphanedCount = 0;
    for (const fr of allFeeRecords) {
      if (!fr.studentId || !allStudentIds.has(String(fr.studentId))) {
        orphanedCount++;
      }
    }

    console.log('[D] Orphaned FeeRecords (no matching student):');
    console.log(`    Count: ${orphanedCount}`);
    if (orphanedCount > 0) {
      console.log(`    ⚠ ${orphanedCount} fee record(s) have no matching student — will fail silently during migration`);
    } else {
      console.log('    ✓ No orphaned fee records');
    }
    console.log();

    // ── Check E — Existing enrollments ───────────────────────────

    const enrollmentsColl = db.collection('enrollments');
    let enrollmentCount = 0;
    try {
      enrollmentCount = await enrollmentsColl.countDocuments({});
    } catch {
      // Collection may not exist yet — that's fine
      enrollmentCount = 0;
    }

    console.log('[E] Existing enrollments:');
    console.log(`    Count: ${enrollmentCount}`);
    if (enrollmentCount === 0) {
      console.log('    ✓ Clean slate — migration has not been partially run');
    } else {
      console.log(`    ⚠ ${enrollmentCount} enrollment(s) already exist — migration will skip these students (idempotent)`);
    }
    console.log();

    // ── Summary ──────────────────────────────────────────────────

    console.log('════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('════════════════════════════════════════');
    if (blockers.length === 0) {
      console.log('  Action required before migration:    NO');
      console.log('  ✓ Safe to proceed with migration');
    } else {
      console.log('  Action required before migration:    YES');
      console.log('  Blockers:');
      for (const b of blockers) {
        console.log(`    • ${b}`);
      }
    }
    console.log('════════════════════════════════════════');

    return blockers.length > 0 ? 1 : 0;

  } catch (err) {
    console.error('Audit failed with error:', err);
    return 1;
  } finally {
    await mongoose.disconnect();
  }
}

audit().then((code) => process.exit(code));
