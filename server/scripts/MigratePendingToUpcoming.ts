import mongoose from 'mongoose';
import { config } from '../src/config';
import FeeRecord from '../src/models/FeeRecord';

/**
 * Migration Script: Rename "pending" status to "upcoming" for all fee records
 * This script updates the database to reflect the new terminology
 */

async function migratePendingToUpcoming() {
  try {
    console.log('🔄 Starting migration: pending → upcoming');
    
    // Connect to database
    await mongoose.connect(config.mongoUri);
    console.log('✅ Connected to database');

    // Count records to be updated
    const pendingCount = await FeeRecord.countDocuments({ status: 'pending' });
    console.log(`📊 Found ${pendingCount} fee records with "pending" status`);

    if (pendingCount === 0) {
      console.log('✅ No records to migrate');
      await mongoose.connection.close();
      return;
    }

    // Update all pending records to upcoming
    const result = await FeeRecord.updateMany(
      { status: 'pending' },
      { $set: { status: 'upcoming' } }
    );

    console.log(`✅ Migration completed successfully`);
    console.log(`   - Records matched: ${result.matchedCount}`);
    console.log(`   - Records modified: ${result.modifiedCount}`);

    // Verify the migration
    const remainingPending = await FeeRecord.countDocuments({ status: 'pending' });
    const newUpcoming = await FeeRecord.countDocuments({ status: 'upcoming' });
    
    console.log('\n📊 Verification:');
    console.log(`   - Remaining "pending" records: ${remainingPending}`);
    console.log(`   - Total "upcoming" records: ${newUpcoming}`);

    if (remainingPending > 0) {
      console.warn('⚠️  Warning: Some "pending" records still exist!');
    } else {
      console.log('✅ All "pending" records successfully migrated to "upcoming"');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run migration
migratePendingToUpcoming()
  .then(() => {
    console.log('\n✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
