/**
 * Fresh-start cleanup script:
 * 1. Soft-deletes all users EXCEPT admin@chessklub.com
 * 2. Drops all other data collections (students, enrollments, invoices, etc.)
 * 3. Preserves the courses collection (your chess course stays)
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const KEEP_EMAIL = 'admin@chessklub.com';

// Collections to wipe completely
const COLLECTIONS_TO_DROP = [
  'students',      // V1
  'studentv2s',    // V2
  'batches',       // V1
  'batchv2s',      // V2 (if separate)
  'enrollments',
  'feerecords',
  'invoices',
  'paymenttransactions',
  'paymentallocations',
  'creditledgers',
  'studentcredits',
  'syncjobs',
  'importruns',
  'leads',
];

async function cleanup() {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db!;

  // 1. Soft-delete all users except the keeper
  const usersCol = db.collection('users');
  const keeper = await usersCol.findOne({ email: KEEP_EMAIL });

  if (!keeper) {
    console.error(`❌ Keeper account "${KEEP_EMAIL}" not found — aborting to avoid locking yourself out.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const softDeleteResult = await usersCol.updateMany(
    { _id: { $ne: keeper._id } },
    { $set: { deletedAt: new Date(), isActive: false } },
  );
  console.log(`👤 Soft-deleted ${softDeleteResult.modifiedCount} user(s) (kept: ${KEEP_EMAIL})`);

  // 2. Drop data collections
  const existingCollections = (await db.listCollections().toArray()).map((c) => c.name);

  let dropped = 0;
  let skipped = 0;
  for (const name of COLLECTIONS_TO_DROP) {
    if (existingCollections.includes(name)) {
      await db.dropCollection(name);
      console.log(`🗑️  Dropped: ${name}`);
      dropped++;
    } else {
      skipped++;
    }
  }

  console.log(`\n✅ Done — ${dropped} collection(s) dropped, ${skipped} already empty.`);
  console.log(`📋 Preserved: users (soft-deleted all except ${KEEP_EMAIL}), courses`);

  await mongoose.disconnect();
}

cleanup().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
