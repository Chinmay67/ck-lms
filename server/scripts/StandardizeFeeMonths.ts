import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import FeeRecord from '../src/models/FeeRecord.js';

/**
 * Convert month name format to YYYY-MM format
 * Examples:
 * - "January 2026" -> "2026-01"
 * - "December 2025" -> "2025-12"
 * - "2026-01" -> "2026-01" (already in correct format)
 */
function convertToStandardFormat(feeMonth: string): string | null {
  // If already in YYYY-MM format, return as is
  if (/^\d{4}-\d{2}$/.test(feeMonth)) {
    return feeMonth;
  }

  // Month name mapping
  const months: Record<string, string> = {
    'january': '01',
    'february': '02',
    'march': '03',
    'april': '04',
    'may': '05',
    'june': '06',
    'july': '07',
    'august': '08',
    'september': '09',
    'october': '10',
    'november': '11',
    'december': '12'
  };

  // Try to parse "Month YYYY" format
  const match = feeMonth.match(/^(\w+)\s+(\d{4})$/);
  if (match) {
    const monthName = match[1].toLowerCase();
    const year = match[2];
    
    if (months[monthName]) {
      return `${year}-${months[monthName]}`;
    }
  }

  console.warn(`⚠️  Could not parse month format: "${feeMonth}"`);
  return null;
}

/**
 * Main migration function
 */
async function standardizeFeeMonths() {
  try {
    console.log('\n🔄 Starting Fee Month Standardization Migration\n');
    console.log('=' .repeat(80));
    
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/lms';
    await mongoose.connect(mongoUri);
    
    console.log('✅ Connected to MongoDB\n');

    // Get all fee records
    const allFees = await FeeRecord.find({}).lean();
    console.log(`📊 Total fee records found: ${allFees.length}\n`);

    // Group by student and month for duplicate detection
    interface StudentMonthKey {
      studentId: string;
      standardMonth: string;
    }
    
    const monthGroups = new Map<string, any[]>();
    const conversions: Array<{ oldFormat: string; newFormat: string; count: number }> = [];
    const conversionMap = new Map<string, number>();

    // First pass: analyze and group
    console.log('🔍 Analyzing fee records...\n');
    
    for (const fee of allFees) {
      const standardMonth = convertToStandardFormat(fee.feeMonth);
      
      if (!standardMonth) {
        console.error(`❌ Failed to convert: ${fee.feeMonth} for student ${fee.studentName}`);
        continue;
      }

      // Track conversions
      if (fee.feeMonth !== standardMonth) {
        const key = `${fee.feeMonth}→${standardMonth}`;
        conversionMap.set(key, (conversionMap.get(key) || 0) + 1);
      }

      // Group by student + month for duplicate detection
      const groupKey = `${fee.studentId}_${standardMonth}`;
      
      if (!monthGroups.has(groupKey)) {
        monthGroups.set(groupKey, []);
      }
      monthGroups.get(groupKey)!.push({ ...fee, standardMonth });
    }

    // Display conversion summary
    console.log('📋 Conversion Summary:');
    console.log('-'.repeat(80));
    for (const [key, count] of conversionMap.entries()) {
      const [oldFormat, newFormat] = key.split('→');
      console.log(`  "${oldFormat}" → "${newFormat}": ${count} records`);
    }
    console.log('');

    // Second pass: handle duplicates and updates
    let duplicatesRemoved = 0;
    let recordsUpdated = 0;
    const recordsToDelete: any[] = [];
    const recordsToUpdate: Array<{ id: any; newMonth: string }> = [];

    console.log('🔍 Checking for duplicates...\n');

    for (const [groupKey, records] of monthGroups.entries()) {
      if (records.length > 1) {
        console.log(`⚠️  Found ${records.length} records for group: ${groupKey}`);
        
        // Sort by: paid records first, then by most recent createdAt
        records.sort((a, b) => {
          // Prioritize paid records
          const aPaid = a.paidAmount > 0;
          const bPaid = b.paidAmount > 0;
          if (aPaid !== bPaid) return bPaid ? 1 : -1;
          
          // Then by creation date (most recent first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        // Keep the first one, delete the rest
        const toKeep = records[0];
        const toDelete = records.slice(1);
        
        console.log(`  ✅ Keeping: ${toKeep.studentName} - ${toKeep.feeMonth} (Paid: ${toKeep.paidAmount}, Created: ${new Date(toKeep.createdAt).toISOString()})`);
        
        // Add to update list if format needs changing
        if (toKeep.feeMonth !== toKeep.standardMonth) {
          recordsToUpdate.push({ id: toKeep._id, newMonth: toKeep.standardMonth });
        }

        // Mark others for deletion
        for (const duplicate of toDelete) {
          console.log(`  ❌ Deleting: ${duplicate.studentName} - ${duplicate.feeMonth} (Paid: ${duplicate.paidAmount}, Created: ${new Date(duplicate.createdAt).toISOString()})`);
          recordsToDelete.push(duplicate._id);
        }
        
        duplicatesRemoved += toDelete.length;
        console.log('');
      } else {
        // Single record - just check if it needs format update
        const record = records[0];
        if (record.feeMonth !== record.standardMonth) {
          recordsToUpdate.push({ id: record._id, newMonth: record.standardMonth });
        }
      }
    }

    // Execute deletions
    if (recordsToDelete.length > 0) {
      console.log(`\n🗑️  Deleting ${recordsToDelete.length} duplicate records...`);
      const deleteResult = await FeeRecord.deleteMany({ _id: { $in: recordsToDelete } });
      console.log(`✅ Deleted ${deleteResult.deletedCount} duplicate records\n`);
    }

    // Execute updates
    if (recordsToUpdate.length > 0) {
      console.log(`\n📝 Updating ${recordsToUpdate.length} records to standardized format...`);
      
      for (const update of recordsToUpdate) {
        await FeeRecord.updateOne(
          { _id: update.id },
          { $set: { feeMonth: update.newMonth } }
        );
        recordsUpdated++;
      }
      
      console.log(`✅ Updated ${recordsUpdated} records\n`);
    }

    // Final verification
    console.log('\n' + '='.repeat(80));
    console.log('✅ MIGRATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`  Records Updated:  ${recordsUpdated}`);
    console.log(`  Duplicates Removed: ${duplicatesRemoved}`);
    console.log(`  Total Changes:    ${recordsUpdated + duplicatesRemoved}`);
    console.log('='.repeat(80));

    // Verify standardization
    console.log('\n🔍 Verifying standardization...\n');
    const remainingFees = await FeeRecord.find({}).select('feeMonth').lean();
    const nonStandardFormats = remainingFees.filter(f => !/^\d{4}-\d{2}$/.test(f.feeMonth));
    
    if (nonStandardFormats.length === 0) {
      console.log('✅ All fee records are now in standardized YYYY-MM format!\n');
    } else {
      console.log(`⚠️  Warning: ${nonStandardFormats.length} records still have non-standard format:`);
      nonStandardFormats.slice(0, 10).forEach(f => {
        console.log(`   - ${f.feeMonth}`);
      });
      console.log('');
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB\n');

  } catch (error) {
    console.error('\n❌ Migration Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the migration
standardizeFeeMonths();
