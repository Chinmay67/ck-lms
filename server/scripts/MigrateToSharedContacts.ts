/**
 * Migration Script: Migrate to Shared Contacts Model
 * 
 * This script migrates the database to support:
 * 1. Multiple students sharing the same email/phone (siblings)
 * 2. One User per unique email OR phone (not per student)
 * 3. Students linked to Users via userId
 * 4. System-generated studentCode for unique identification
 * 
 * IMPORTANT: Run this AFTER deploying the new model code
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Student from '../src/models/Student.js';
import User from '../src/models/User.js';
import { config } from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    const mongoUri = config.mongoUri;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

/**
 * Drop old unique index on Student.email
 */
async function dropEmailIndex() {
  try {
    console.log('\n📋 Dropping old unique index on Student.email...');
    if (!mongoose.connection.db) {
      throw new Error('Database connection not established');
    }
    const collection = mongoose.connection.db.collection('students');
    
    // Get all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => idx.name));
    
    // Drop the unique email index if it exists
    const emailIndexExists = indexes.some(idx => idx.name === 'email_1');
    if (emailIndexExists) {
      await collection.dropIndex('email_1');
      console.log('✅ Dropped unique index on email');
    } else {
      console.log('ℹ️  No unique email index found (already dropped)');
    }
  } catch (error: any) {
    if (error.code === 27 || error.message.includes('index not found')) {
      console.log('ℹ️  Index already dropped or does not exist');
    } else {
      console.error('❌ Error dropping email index:', error);
      throw error;
    }
  }
}

/**
 * Add unique index on User.phone and fix User.email index
 */
async function addUserPhoneIndex() {
  try {
    console.log('\n📋 Setting up User indexes with partial filters...');
    if (!mongoose.connection.db) {
      throw new Error('Database connection not established');
    }
    const collection = mongoose.connection.db.collection('users');
    
    // Get existing indexes
    const indexes = await collection.indexes();
    console.log('Current User indexes:', indexes.map(idx => idx.name));
    
    // Drop old email index if it exists (without partial filter)
    const oldEmailIndex = indexes.find(idx => idx.name === 'email_1');
    if (oldEmailIndex && !oldEmailIndex.partialFilterExpression) {
      console.log('  Dropping old email_1 index...');
      await collection.dropIndex('email_1');
    }
    
    // Drop old phone index if it exists (without partial filter)
    const oldPhoneIndex = indexes.find(idx => idx.name === 'phone_1');
    if (oldPhoneIndex && !oldPhoneIndex.partialFilterExpression) {
      console.log('  Dropping old phone_1 index...');
      await collection.dropIndex('phone_1');
    }
    
    // Create new email index with partial filter
    const emailIndexExists = indexes.some(idx => 
      idx.name === 'email_1' && idx.partialFilterExpression
    );
    if (!emailIndexExists) {
      await collection.createIndex(
        { email: 1 }, 
        { 
          unique: true,
          partialFilterExpression: { email: { $exists: true, $type: 'string' } }
        }
      );
      console.log('✅ Added unique index on User.email with partial filter');
    }
    
    // Create new phone index with partial filter
    const phoneIndexExists = indexes.some(idx => 
      idx.name === 'phone_1' && idx.partialFilterExpression
    );
    if (!phoneIndexExists) {
      await collection.createIndex(
        { phone: 1 }, 
        { 
          unique: true,
          partialFilterExpression: { phone: { $exists: true, $type: 'string' } }
        }
      );
      console.log('✅ Added unique index on User.phone with partial filter');
    }
    
    if (emailIndexExists && phoneIndexExists) {
      console.log('ℹ️  User indexes already correctly configured');
    }
  } catch (error: any) {
    console.error('❌ Error setting up User indexes:', error);
    throw error;
  }
}

/**
 * Main migration function
 */
async function main() {
  try {
    console.log('🚀 Starting migration to shared contacts model...\n');
    console.log('This migration only removes database constraints and indexes.');
    console.log('Student-User linking happens automatically during student creation.\n');
    
    await connectDB();
    
    // Step 1: Drop old unique index on Student.email
    await dropEmailIndex();
    
    // Step 2: Setup User indexes with partial filters (allows multiple null emails/phones)
    await addUserPhoneIndex();
    
    console.log('\n✅ Migration completed!');
    console.log('\nℹ️  Notes:');
    console.log('- New students will automatically get studentCode and userId');
    console.log('- Siblings can now share the same email/phone');
    console.log('- Multiple users can have null email or null phone (not duplicates)');
    console.log('- Users are automatically created and linked during student creation');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as migrateToSharedContacts };
