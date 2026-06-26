import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const stages = [
  {
    stageNumber: 1, stageName: 'Beginner',
    description: 'Foundation of chess — piece movements, basic rules, and introductory tactics.',
    levels: [
      { levelNumber: 1, feeAmount: 3000, description: 'Board setup, piece movements, check & checkmate basics' },
      { levelNumber: 2, feeAmount: 3500, description: 'Basic tactics: forks, pins, simple mating patterns' },
      { levelNumber: 3, feeAmount: 4000, description: 'Opening principles, pawn structure, elementary endgames' },
    ],
  },
  {
    stageNumber: 2, stageName: 'Intermediate',
    description: 'Tactical and positional development — pattern recognition and strategic thinking.',
    levels: [
      { levelNumber: 1, feeAmount: 4500, description: 'Tactical motifs: discovered attacks, skewers, double check' },
      { levelNumber: 2, feeAmount: 5000, description: 'Positional concepts: piece activity, weak squares, pawn majorities' },
      { levelNumber: 3, feeAmount: 5500, description: 'Complex middlegames, prophylaxis, rook and pawn endgames' },
    ],
  },
  {
    stageNumber: 3, stageName: 'Advanced',
    description: 'Tournament-level preparation — deep calculation, opening repertoire, and master concepts.',
    levels: [
      { levelNumber: 1, feeAmount: 6000, description: 'Deep calculation, critical positions, advanced opening theory' },
      { levelNumber: 2, feeAmount: 6500, description: 'Complex strategy, game analysis, tournament preparation' },
    ],
  },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI!);
  const db = mongoose.connection.db!;
  const result = await db.collection('courses').updateOne(
    { courseName: 'chess' },
    { $set: { stages, updatedAt: new Date() } },
  );
  console.log('Updated:', result.modifiedCount, 'course(s)');
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => { console.error(err); process.exit(1); });
