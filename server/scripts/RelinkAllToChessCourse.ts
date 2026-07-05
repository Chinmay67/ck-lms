/**
 * Relinks v2 program data to the canonical Chess course.
 *
 * This is intended for cleanup after accidental course creation such as B1.
 * It updates references in batches, enrollments, invoices, student caches,
 * and leads while preserving stageNumber/levelNumber where valid.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const STAGE_BY_PREFIX: Record<string, number> = {
  b: 1,
  beginner: 1,
  i: 2,
  intermediate: 2,
  a: 3,
  advanced: 3,
};

type MongoId = mongoose.Types.ObjectId;
type AnyDoc = Record<string, any>;
type Placement = { stageNumber: number; levelNumber: number };

function objectIdString(value: unknown): string | null {
  if (!value) return null;
  return String(value);
}

function inferFromText(value: unknown): Partial<Placement> {
  if (!value || typeof value !== 'string') return {};
  const normalized = value.trim().toLowerCase();

  const codeMatch = normalized.match(/\b([bia])\s*[-_ ]?\s*([1-9]\d*)\b/);
  if (codeMatch) {
    return {
      stageNumber: STAGE_BY_PREFIX[codeMatch[1]],
      levelNumber: Number(codeMatch[2]),
    };
  }

  const stageName = Object.keys(STAGE_BY_PREFIX).find((key) => normalized.includes(key));
  if (stageName) return { stageNumber: STAGE_BY_PREFIX[stageName] };

  const sLevelMatch = normalized.match(/\bs\s*([1-9]\d*)\s*l\s*([1-9]\d*)\b/);
  if (sLevelMatch) {
    return {
      stageNumber: Number(sLevelMatch[1]),
      levelNumber: Number(sLevelMatch[2]),
    };
  }

  return {};
}

function isValidPlacement(
  stageNumber: unknown,
  levelNumber: unknown,
  validLevels: Set<string>,
): stageNumber is number {
  return (
    typeof stageNumber === 'number'
    && typeof levelNumber === 'number'
    && validLevels.has(`${stageNumber}:${levelNumber}`)
  );
}

function inferPlacement(doc: AnyDoc, oldCourse: AnyDoc | null, validLevels: Set<string>): Placement | null {
  if (isValidPlacement(doc.stageNumber, doc.levelNumber, validLevels)) {
    return { stageNumber: doc.stageNumber, levelNumber: doc.levelNumber };
  }

  const candidates = [
    oldCourse?.courseName,
    oldCourse?.displayName,
    doc.batchCode,
    doc.batchName,
    doc.description,
  ];

  let inferred: Partial<Placement> = {};
  for (const candidate of candidates) {
    inferred = { ...inferred, ...inferFromText(candidate) };
    if (isValidPlacement(inferred.stageNumber, inferred.levelNumber, validLevels)) {
      return {
        stageNumber: inferred.stageNumber,
        levelNumber: inferred.levelNumber,
      };
    }
  }

  if (typeof inferred.stageNumber === 'number') {
    const levelsForStage = [...validLevels]
      .map((key) => key.split(':').map(Number))
      .filter(([stage]) => stage === inferred.stageNumber)
      .map(([, level]) => level)
      .sort((a, b) => a - b);
    if (levelsForStage.length === 1) {
      return { stageNumber: inferred.stageNumber, levelNumber: levelsForStage[0] };
    }
  }

  return null;
}

async function updateCoursePlacementCollection(
  collectionName: string,
  chessId: MongoId,
  courseById: Map<string, AnyDoc>,
  validLevels: Set<string>,
) {
  const collection = mongoose.connection.db!.collection(collectionName);
  const docs = await collection.find({}).toArray();
  let updated = 0;
  const unresolved: string[] = [];

  for (const doc of docs) {
    const oldCourse = courseById.get(objectIdString(doc.courseId) ?? '') ?? null;
    const placement = inferPlacement(doc, oldCourse, validLevels);

    if (!placement) {
      const alreadyChess = objectIdString(doc.courseId) === String(chessId);
      if (!alreadyChess || !isValidPlacement(doc.stageNumber, doc.levelNumber, validLevels)) {
        unresolved.push(`${doc._id}`);
      }
      continue;
    }

    const needsUpdate = (
      objectIdString(doc.courseId) !== String(chessId)
      || doc.stageNumber !== placement.stageNumber
      || doc.levelNumber !== placement.levelNumber
    );

    if (!needsUpdate) continue;

    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          courseId: chessId,
          stageNumber: placement.stageNumber,
          levelNumber: placement.levelNumber,
        },
      },
    );
    updated += 1;
  }

  console.log(`✅ ${collectionName}: ${updated} updated`);
  if (unresolved.length > 0) {
    console.warn(`⚠️  ${collectionName}: ${unresolved.length} unresolved placement(s): ${unresolved.slice(0, 10).join(', ')}${unresolved.length > 10 ? '…' : ''}`);
  }
}

async function syncStudentCaches(chessId: MongoId, validLevels: Set<string>) {
  const db = mongoose.connection.db!;
  const students = await db.collection('students').find({}).toArray();
  const enrollments = db.collection('enrollments');
  const batches = db.collection('batches');
  let updated = 0;
  const unresolved: string[] = [];

  for (const student of students) {
    const enrollment = student.currentEnrollmentId
      ? await enrollments.findOne({ _id: student.currentEnrollmentId })
      : await enrollments.findOne({ studentId: student._id, endDate: null });
    const batch = student.batchId ? await batches.findOne({ _id: student.batchId }) : null;

    const placement = enrollment && isValidPlacement(enrollment.stageNumber, enrollment.levelNumber, validLevels)
      ? { stageNumber: enrollment.stageNumber, levelNumber: enrollment.levelNumber }
      : batch && isValidPlacement(batch.stageNumber, batch.levelNumber, validLevels)
        ? { stageNumber: batch.stageNumber, levelNumber: batch.levelNumber }
        : isValidPlacement(student.stageNumber, student.levelNumber, validLevels)
          ? { stageNumber: student.stageNumber, levelNumber: student.levelNumber }
          : null;

    const next: AnyDoc = { courseId: chessId };
    if (placement) {
      next.stageNumber = placement.stageNumber;
      next.levelNumber = placement.levelNumber;
    } else if (objectIdString(student.courseId) !== String(chessId)) {
      unresolved.push(`${student._id}`);
    }
    if (enrollment?._id) next.currentEnrollmentId = enrollment._id;
    if (enrollment?.batchId !== undefined) next.batchId = enrollment.batchId ?? null;

    const needsUpdate = Object.entries(next).some(([key, value]) => objectIdString(student[key]) !== objectIdString(value));
    if (!needsUpdate) continue;

    await db.collection('students').updateOne({ _id: student._id }, { $set: next });
    updated += 1;
  }

  console.log(`✅ students: ${updated} updated`);
  if (unresolved.length > 0) {
    console.warn(`⚠️  students: ${unresolved.length} unresolved placement(s): ${unresolved.slice(0, 10).join(', ')}${unresolved.length > 10 ? '…' : ''}`);
  }
}

async function relinkLeads(chessId: MongoId) {
  const result = await mongoose.connection.db!.collection('leads').updateMany(
    {
      $or: [
        { interestedCourseId: { $exists: false } },
        { interestedCourseId: null },
        { interestedCourseId: { $ne: chessId } },
      ],
    },
    { $set: { interestedCourseId: chessId } },
  );
  console.log(`✅ leads: ${result.modifiedCount} interestedCourseId updated`);
}

async function deactivateOldCourses(chessId: MongoId) {
  const result = await mongoose.connection.db!.collection('courses').updateMany(
    { _id: { $ne: chessId }, isActive: { $ne: false } },
    { $set: { isActive: false, updatedAt: new Date() } },
  );
  console.log(`✅ courses: ${result.modifiedCount} non-Chess course(s) deactivated`);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db!;
  const courses = await db.collection('courses').find({}).toArray();
  const chess = courses.find((course) => course.courseName === 'chess');
  if (!chess) {
    console.error('❌ No canonical Chess course found. Run npm run seed:chess first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const chessId = chess._id as MongoId;
  const validLevels = new Set<string>();
  for (const stage of chess.stages ?? []) {
    for (const level of stage.levels ?? []) {
      validLevels.add(`${stage.stageNumber}:${level.levelNumber}`);
    }
  }

  if (validLevels.size === 0) {
    console.error('❌ Chess course has no configured stages/levels.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const courseById = new Map(courses.map((course) => [String(course._id), course]));
  console.log(`Canonical course: ${chess.displayName} (${chessId})`);
  console.log(`Configured placements: ${[...validLevels].join(', ')}`);

  await updateCoursePlacementCollection('batches', chessId, courseById, validLevels);
  await updateCoursePlacementCollection('enrollments', chessId, courseById, validLevels);
  await updateCoursePlacementCollection('invoices', chessId, courseById, validLevels);
  await syncStudentCaches(chessId, validLevels);
  await relinkLeads(chessId);
  await deactivateOldCourses(chessId);

  await mongoose.disconnect();
  console.log('✅ Done.');
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
