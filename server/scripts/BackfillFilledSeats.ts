/**
 * Backfill Batch.filledSeats from existing enrollment data.
 *
 * Run once after deploying the atomic-capacity change (C7). The filledSeats
 * counter is the authoritative source for capacity checks, but enrollments
 * created before the counter existed left it at 0. This recomputes each batch's
 * filledSeats as the count of active (endDate: null) enrollments pointing at it.
 *
 * Usage:
 *   npx tsx scripts/BackfillFilledSeats.ts            # dry-run (reports only)
 *   npx tsx scripts/BackfillFilledSeats.ts --apply     # writes the corrections
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Database from '../src/config/database.js';
import Batch from '../src/models/v2/Batch.js';
import Enrollment from '../src/models/v2/Enrollment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const apply = process.argv.includes('--apply');
  const db = Database.getInstance();
  await db.connect();

  const batches = await Batch.find({}).select('_id batchName filledSeats maxStudents').lean();
  console.log(`Found ${batches.length} batches. Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  let corrections = 0;
  for (const batch of batches) {
    const activeCount = await Enrollment.countDocuments({
      batchId: batch._id,
      endDate: null,
    });
    const current = batch.filledSeats ?? 0;
    if (activeCount !== current) {
      corrections += 1;
      console.log(
        `  ${batch.batchName}: filledSeats ${current} → ${activeCount}` +
        (batch.maxStudents !== null ? ` (cap ${batch.maxStudents})` : ' (uncapped)'),
      );
      if (apply) {
        await Batch.updateOne({ _id: batch._id }, { $set: { filledSeats: activeCount } });
      }
    }
  }

  console.log(`\n${apply ? 'Corrected' : 'Would correct'} ${corrections} batch(es).`);
  await db.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
