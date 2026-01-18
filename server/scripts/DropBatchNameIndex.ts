/**
 * Migration Script: Drop unique index on batchName
 * This allows multiple batches to have the same name (but different codes)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function dropBatchNameIndex() {
  try {
    console.log('🚀 Starting index migration...\n');

    // Connect using Database singleton
    const db = Database.getInstance();
    await db.connect();

    const mongoDb = mongoose.connection.db;
    const collection = mongoDb.collection('batches');

    // Get existing indexes
    const indexes = await collection.indexes();
    console.log('📋 Current indexes:');
    indexes.forEach(index => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}${index.unique ? ' (unique)' : ''}`);
    });
    console.log();

    // Check if batchName_1 index exists
    const batchNameIndex = indexes.find(idx => idx.name === 'batchName_1');
    
    if (batchNameIndex) {
      if (batchNameIndex.unique) {
        console.log('🔧 Dropping unique index on batchName...');
        await collection.dropIndex('batchName_1');
        console.log('✅ Dropped unique index: batchName_1\n');
        
        // Recreate as non-unique index
        console.log('🔧 Creating non-unique index on batchName...');
        await collection.createIndex({ batchName: 1 });
        console.log('✅ Created non-unique index on batchName\n');
      } else {
        console.log('ℹ️  batchName_1 index already non-unique, no action needed\n');
      }
    } else {
      console.log('ℹ️  batchName_1 index does not exist\n');
      
      // Create non-unique index
      console.log('🔧 Creating non-unique index on batchName...');
      await collection.createIndex({ batchName: 1 });
      console.log('✅ Created non-unique index on batchName\n');
    }

    // Verify final indexes
    const finalIndexes = await collection.indexes();
    console.log('📋 Final indexes:');
    finalIndexes.forEach(index => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}${index.unique ? ' (unique)' : ''}`);
    });

    console.log('\n✅ Migration completed successfully!');
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await Database.getInstance().disconnect();
    process.exit(0);
  }
}

// Run migration
dropBatchNameIndex();
