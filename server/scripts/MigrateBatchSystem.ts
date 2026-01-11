import Database from '../src/config/database.js';
import Student from '../src/models/Student.js';
import Batch from '../src/models/Batch.js';
import User from '../src/models/User.js';

/**
 * Migration script for batch system
 * This script:
 * 1. Creates default batches based on existing student data
 * 2. Migrates students from old `batch` string field to new `batchId` reference
 * 3. Preserves existing batch information where possible
 */

interface BatchGroup {
  stage: 'beginner' | 'intermediate' | 'advanced';
  level: 1 | 2 | 3;
  batchName: string;
  students: any[];
}

async function migrateBatchSystem() {
  try {
    console.log('🚀 Starting batch system migration...\n');

    // Connect to database
    const db = Database.getInstance();
    await db.connect();

    // Get superadmin user to assign as creator
    const superadmin = await User.findOne({ role: 'superadmin' });
    if (!superadmin) {
      throw new Error('No superadmin user found. Please create a superadmin first.');
    }

    console.log(`✅ Found superadmin: ${superadmin.name} (${superadmin.email})\n`);

    // Get all active students
    const students = await Student.find({ isActive: true });
    console.log(`📊 Found ${students.length} active students\n`);

    // Group students by stage and level
    const batchGroups: Map<string, BatchGroup> = new Map();

    for (const student of students) {
      if (!student.stage || !student.level) {
        console.log(`⚠️  Skipping student ${student.studentName} - missing stage or level`);
        continue;
      }

      const key = `${student.stage}-${student.level}`;
      
      if (!batchGroups.has(key)) {
        batchGroups.set(key, {
          stage: student.stage,
          level: student.level,
          batchName: student.batch || `${student.stage.charAt(0).toUpperCase() + student.stage.slice(1)} Level ${student.level}`,
          students: []
        });
      }

      batchGroups.get(key)!.students.push(student);
    }

    console.log(`📦 Grouped students into ${batchGroups.size} batch groups\n`);

    // Create batches and migrate students
    let batchesCreated = 0;
    let studentsMigrated = 0;

    for (const [key, group] of batchGroups.entries()) {
      console.log(`\n📝 Processing ${key}: ${group.students.length} students`);

      // Check if batch already exists
      let batch = await Batch.findOne({
        stage: group.stage,
        level: group.level,
        status: 'active'
      });

      if (!batch) {
        // Create new batch
        const batchCode = `${group.stage.substring(0, 3).toUpperCase()}${group.level}-${Date.now().toString().slice(-4)}`;
        
        batch = await Batch.create({
          batchName: group.batchName,
          batchCode: batchCode,
          stage: group.stage,
          level: group.level,
          maxStudents: null, // No limit initially
          schedule: [
            // Default schedule - can be updated later
            {
              dayOfWeek: 1, // Monday
              startTime: '10:00'
            },
            {
              dayOfWeek: 3, // Wednesday
              startTime: '10:00'
            },
            {
              dayOfWeek: 5, // Friday
              startTime: '10:00'
            }
          ],
          status: 'active',
          startDate: new Date(),
          endDate: null,
          description: `Auto-created batch for ${group.stage} level ${group.level}`,
          createdBy: superadmin._id
        });

        console.log(`✅ Created batch: ${batch.batchName} (${batch.batchCode})`);
        batchesCreated++;
      } else {
        console.log(`ℹ️  Using existing batch: ${batch.batchName} (${batch.batchCode})`);
      }

      // Migrate students to this batch
      for (const student of group.students) {
        if (!student.batchId) {
          student.batchId = batch._id;
          await student.save();
          studentsMigrated++;
          console.log(`  ✓ Migrated: ${student.studentName}`);
        } else {
          console.log(`  ⊗ Already migrated: ${student.studentName}`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✨ Migration Summary:');
    console.log('='.repeat(60));
    console.log(`📦 Batches created: ${batchesCreated}`);
    console.log(`👥 Students migrated: ${studentsMigrated}`);
    console.log(`📊 Total batch groups: ${batchGroups.size}`);
    console.log('='.repeat(60) + '\n');

    // Show batch summary
    const allBatches = await Batch.find({ status: 'active' }).populate('createdBy', 'name email');
    console.log('\n📋 Active Batches:');
    console.log('='.repeat(60));
    for (const batch of allBatches) {
      const count = await Student.countDocuments({ batchId: batch._id });
      console.log(`\n${batch.batchName} (${batch.batchCode})`);
      console.log(`  Stage/Level: ${batch.stage} / ${batch.level}`);
      console.log(`  Students: ${count}${batch.maxStudents ? ` / ${batch.maxStudents}` : ' (unlimited)'}`);
      console.log(`  Schedule: ${batch.schedule.length} sessions/week`);
      console.log(`  Created: ${batch.createdAt.toLocaleDateString()}`);
    }
    console.log('\n' + '='.repeat(60));

    console.log('\n✅ Migration completed successfully!');
    console.log('ℹ️  Note: Please review and update batch schedules as needed.\n');

    await db.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateBatchSystem();
