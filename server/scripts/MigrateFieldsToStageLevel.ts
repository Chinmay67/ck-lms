import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Student from '../src/models/Student.js';
import FeeRecord from '../src/models/FeeRecord.js';
import { generateCombinedSkill } from '../src/utils/fieldValidation.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

interface MigrationStats {
  studentsProcessed: number;
  studentsUpdated: number;
  studentsMissingData: number;
  feesProcessed: number;
  feesUpdated: number;
  errors: Array<{ type: string; id: string; error: string }>;
}

async function migrateFields() {
  const stats: MigrationStats = {
    studentsProcessed: 0,
    studentsUpdated: 0,
    studentsMissingData: 0,
    feesProcessed: 0,
    feesUpdated: 0,
    errors: []
  };

  try {
    console.log('='.repeat(60));
    console.log('MIGRATION: skillCategory/skillLevel → stage/level');
    console.log('='.repeat(60));
    console.log('');

    // Connect to database
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    await mongoose.connect(mongoUri);
    console.log('✓ Connected to database');
    console.log('');

    // ========================================
    // PHASE 1: Migrate Students
    // ========================================
    console.log('PHASE 1: Migrating Students');
    console.log('-'.repeat(60));

    const students = await Student.find({});
    console.log(`Found ${students.length} students to process`);
    console.log('');

    for (const student of students) {
      stats.studentsProcessed++;
      let needsUpdate = false;
      const updates: any = {};

      // Get the current values (new fields take precedence)
      let currentStage = (student as any).stage;
      let currentLevel = (student as any).level;

      // If new fields are empty, copy from old fields
      if (!currentStage && (student as any).skillCategory) {
        currentStage = (student as any).skillCategory;
        updates.stage = currentStage;
        needsUpdate = true;
      }

      if (!currentLevel && (student as any).skillLevel) {
        currentLevel = (student as any).skillLevel;
        updates.level = currentLevel;
        needsUpdate = true;
      }

      // Regenerate combinedSkill if we have both stage and level
      if (currentStage && currentLevel) {
        const expectedCombinedSkill = generateCombinedSkill(currentStage, currentLevel);
        if ((student as any).combinedSkill !== expectedCombinedSkill) {
          updates.combinedSkill = expectedCombinedSkill;
          needsUpdate = true;
        }
      } else {
        // Track students missing required data
        stats.studentsMissingData++;
        console.warn(`⚠ Student ${student._id} (${(student as any).studentName}) missing stage or level`);
      }

      // Apply updates if needed
      if (needsUpdate) {
        try {
          await Student.updateOne({ _id: student._id }, { $set: updates });
          stats.studentsUpdated++;
          console.log(`✓ Updated student ${student._id} (${(student as any).studentName})`);
        } catch (error: any) {
          stats.errors.push({
            type: 'student',
            id: student._id.toString(),
            error: error.message
          });
          console.error(`✗ Failed to update student ${student._id}: ${error.message}`);
        }
      }
    }

    console.log('');
    console.log(`Students processed: ${stats.studentsProcessed}`);
    console.log(`Students updated: ${stats.studentsUpdated}`);
    console.log(`Students with missing data: ${stats.studentsMissingData}`);
    console.log('');

    // ========================================
    // PHASE 2: Migrate Fee Records
    // ========================================
    console.log('PHASE 2: Migrating Fee Records');
    console.log('-'.repeat(60));

    const fees = await FeeRecord.find({});
    console.log(`Found ${fees.length} fee records to process`);
    console.log('');

    for (const fee of fees) {
      stats.feesProcessed++;
      
      try {
        // Get the student for this fee record
        const student = await Student.findById((fee as any).studentId);
        
        if (!student) {
          stats.errors.push({
            type: 'fee',
            id: fee._id.toString(),
            error: 'Student not found'
          });
          console.warn(`⚠ Fee ${fee._id} references non-existent student ${(fee as any).studentId}`);
          continue;
        }

        // Check if fee record's stage/level matches student's current stage/level
        const studentStage = (student as any).stage || (student as any).skillCategory;
        const studentLevel = (student as any).level || (student as any).skillLevel;

        if (!studentStage || !studentLevel) {
          console.warn(`⚠ Student ${student._id} has no stage/level, skipping fee ${fee._id}`);
          continue;
        }

        // Update fee if stage or level doesn't match
        if ((fee as any).stage !== studentStage || (fee as any).level !== studentLevel) {
          await FeeRecord.updateOne(
            { _id: fee._id },
            { 
              $set: { 
                stage: studentStage,
                level: studentLevel
              }
            }
          );
          stats.feesUpdated++;
          console.log(`✓ Updated fee ${fee._id} to match student's stage/level`);
        }
      } catch (error: any) {
        stats.errors.push({
          type: 'fee',
          id: fee._id.toString(),
          error: error.message
        });
        console.error(`✗ Failed to update fee ${fee._id}: ${error.message}`);
      }
    }

    console.log('');
    console.log(`Fee records processed: ${stats.feesProcessed}`);
    console.log(`Fee records updated: ${stats.feesUpdated}`);
    console.log('');

    // ========================================
    // FINAL SUMMARY
    // ========================================
    console.log('='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log('');
    console.log('Students:');
    console.log(`  - Processed: ${stats.studentsProcessed}`);
    console.log(`  - Updated: ${stats.studentsUpdated}`);
    console.log(`  - Missing data: ${stats.studentsMissingData}`);
    console.log('');
    console.log('Fee Records:');
    console.log(`  - Processed: ${stats.feesProcessed}`);
    console.log(`  - Updated: ${stats.feesUpdated}`);
    console.log('');
    
    if (stats.errors.length > 0) {
      console.log('Errors:');
      stats.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err.type} ${err.id}: ${err.error}`);
      });
      console.log('');
    } else {
      console.log('✓ No errors encountered');
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('Migration completed successfully!');
    console.log('='.repeat(60));
    console.log('');
    console.log('NEXT STEPS:');
    console.log('1. Review any students with missing data');
    console.log('2. Update Student model to remove old fields (skillCategory, skillLevel)');
    console.log('3. Update all code to use only stage and level fields');
    console.log('');

    await mongoose.disconnect();
    console.log('✓ Disconnected from database');
    
  } catch (error: any) {
    console.error('');
    console.error('='.repeat(60));
    console.error('MIGRATION FAILED');
    console.error('='.repeat(60));
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
    
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      console.error('Failed to disconnect from database:', disconnectError);
    }
    
    process.exit(1);
  }
}

// Run migration
migrateFields();
