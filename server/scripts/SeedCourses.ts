import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Course from '../src/models/Course.js';
import User from '../src/models/User.js';
import Database from '../src/config/database.js';

dotenv.config();

async function seedCourses() {
  try {
    console.log('🌱 Starting course seeding...\n');

    // Connect to database
    const db = Database.getInstance();
    await db.connect();
    console.log('✅ Connected to database\n');

    // Find superadmin user
    const superadmin = await User.findOne({ role: 'superadmin' });
    if (!superadmin) {
      console.error('❌ No superadmin user found. Please create a superadmin first.');
      process.exit(1);
    }
    console.log(`✅ Found superadmin: ${superadmin.email}\n`);

    // Define initial courses
    const initialCourses = [
      {
        courseName: 'beginner',
        displayName: 'Beginner Chess Training',
        description: 'Foundation level chess training for new players. Learn basic piece movements, board setup, and fundamental strategies.',
        displayOrder: 1,
        levels: [
          {
            levelNumber: 1,
            feeAmount: 2000,
            durationMonths: 1,
            approximateHours: 20,
            description: 'Introduction to chess pieces, board setup, and basic movements'
          },
          {
            levelNumber: 2,
            feeAmount: 2500,
            durationMonths: 1,
            approximateHours: 25,
            description: 'Basic tactics, checkmate patterns, and opening principles'
          }
        ]
      },
      {
        courseName: 'intermediate',
        displayName: 'Intermediate Chess Training',
        description: 'Advanced tactics and strategy development for players with basic chess knowledge. Improve tactical vision and positional understanding.',
        displayOrder: 2,
        levels: [
          {
            levelNumber: 1,
            feeAmount: 3000,
            durationMonths: 1,
            approximateHours: 30,
            description: 'Tactical motifs, pawn structures, and middle game planning'
          },
          {
            levelNumber: 2,
            feeAmount: 3500,
            durationMonths: 1,
            approximateHours: 35,
            description: 'Advanced tactics, endgame fundamentals, and strategic concepts'
          }
        ]
      },
      {
        courseName: 'advanced',
        displayName: 'Advanced Chess Training',
        description: 'Expert level training and tournament preparation for serious players. Master complex strategies and compete at higher levels.',
        displayOrder: 3,
        levels: [
          {
            levelNumber: 1,
            feeAmount: 4000,
            durationMonths: 1,
            approximateHours: 40,
            description: 'Complex endgames, positional play, and calculation techniques'
          },
          {
            levelNumber: 2,
            feeAmount: 4500,
            durationMonths: 1,
            approximateHours: 45,
            description: 'Opening repertoire, tournament preparation, and psychological aspects'
          }
        ]
      }
    ];

    let createdCount = 0;
    let updatedCount = 0;

    for (const courseData of initialCourses) {
      const existingCourse = await Course.findOne({ courseName: courseData.courseName });

      if (existingCourse) {
        console.log(`⚠️  Course "${courseData.displayName}" already exists. Skipping.`);
        updatedCount++;
      } else {
        await Course.create({
          ...courseData,
          createdBy: superadmin._id,
          isActive: true
        });
        console.log(`✅ Created course: ${courseData.displayName}`);
        console.log(`   - ${courseData.levels.length} levels configured`);
        console.log(`   - Fees: ${courseData.levels.map(l => `Level ${l.levelNumber}: ₹${l.feeAmount}`).join(', ')}`);
        createdCount++;
      }
      console.log('');
    }

    console.log('\n📊 Summary:');
    console.log(`   - Courses created: ${createdCount}`);
    console.log(`   - Courses skipped (already exist): ${updatedCount}`);
    console.log(`   - Total courses: ${initialCourses.length}\n`);

    console.log('✅ Course seeding completed successfully!\n');

    // Disconnect from database
    await db.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding courses:', error);
    process.exit(1);
  }
}

// Run the seeding
seedCourses();
