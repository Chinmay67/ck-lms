/**
 * Seeds the single Chess course (V2 Course model) with 3 stages and levels.
 * Safe to run multiple times — skips if a course already exists.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Course from '../src/models/v2/Course.js';
import User from '../src/models/User.js';

async function seed() {
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('✅ Connected to MongoDB');

  const existing = await Course.countDocuments();
  if (existing > 0) {
    console.log(`⚠️  ${existing} course(s) already exist — skipping seed.`);
    await mongoose.disconnect();
    return;
  }

  const superadmin = await User.findOne({ role: 'superadmin' }).lean();
  if (!superadmin) {
    console.error('❌ No superadmin found. Run create-superadmin first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const course = await Course.create({
    courseName: 'chess',
    displayName: 'Chess Training',
    description: 'Comprehensive chess training program covering beginner to advanced levels.',
    displayOrder: 1,
    isActive: true,
    stages: [
      {
        stageNumber: 1,
        stageName: 'Beginner',
        levels: [
          { levelNumber: 1, feeAmount: 2000, durationMonthsMin: 2, durationMonthsMax: 3, approximateHours: 20, description: 'Board setup, piece movements, basic rules' },
          { levelNumber: 2, feeAmount: 2000, durationMonthsMin: 2, durationMonthsMax: 4, approximateHours: 25, description: 'Basic tactics, simple checkmates, opening principles' },
          { levelNumber: 3, feeAmount: 2500, durationMonthsMin: 3, durationMonthsMax: 5, approximateHours: 30, description: 'Pawn structures, piece coordination, fundamental endgames' },
        ],
      },
      {
        stageNumber: 2,
        stageName: 'Intermediate',
        levels: [
          { levelNumber: 1, feeAmount: 3000, durationMonthsMin: 3, durationMonthsMax: 5, approximateHours: 35, description: 'Tactical motifs, middlegame planning, pawn play' },
          { levelNumber: 2, feeAmount: 3000, durationMonthsMin: 3, durationMonthsMax: 6, approximateHours: 40, description: 'Positional concepts, piece activity, complex endgames' },
          { levelNumber: 3, feeAmount: 3500, durationMonthsMin: 4, durationMonthsMax: 6, approximateHours: 45, description: 'Strategic thinking, prophylaxis, advanced endgame technique' },
        ],
      },
      {
        stageNumber: 3,
        stageName: 'Advanced',
        levels: [
          { levelNumber: 1, feeAmount: 4000, durationMonthsMin: 4, durationMonthsMax: 8, approximateHours: 50, description: 'Deep calculation, opening repertoire, complex strategy' },
          { levelNumber: 2, feeAmount: 4500, durationMonthsMin: 6, durationMonthsMax: 12, approximateHours: 60, description: 'Tournament preparation, game analysis, master-level concepts' },
        ],
      },
    ],
    createdBy: (superadmin as any)._id,
  });

  console.log(`\n✅ Chess course created!`);
  console.log(`   ID:          ${course._id}`);
  console.log(`   Name:        ${course.displayName}`);
  console.log(`   Stages:      ${course.stages.length}`);
  course.stages.forEach((s: any) => {
    const totalMin = s.levels.reduce((sum: number, l: any) => sum + (l.durationMonthsMin || 0), 0);
    const totalMax = s.levels.reduce((sum: number, l: any) => sum + (l.durationMonthsMax || 0), 0);
    console.log(`   • ${s.stageName}: ${s.levels.length} levels, ${totalMin}–${totalMax} mo total`);
  });

  await mongoose.disconnect();
  console.log('\n✅ Done.');
}

seed().catch((err) => { console.error(err); process.exit(1); });
