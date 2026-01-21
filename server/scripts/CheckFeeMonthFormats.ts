import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import FeeRecord from '../src/models/FeeRecord.js';

async function checkFeeMonthFormats() {
  try {
    console.log('\n🔍 Connecting to MongoDB...\n');
    
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/lms';
    await mongoose.connect(mongoUri);
    
    console.log('✅ Connected to MongoDB\n');
    console.log('📊 Fetching all fee records...\n');

    // Get all fee records with student info
    const feeRecords = await FeeRecord.find({})
      .select('studentId studentName feeMonth dueDate createdAt')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`📝 Total fee records found: ${feeRecords.length}\n`);

    // Group by month format patterns
    const formatGroups: Record<string, any[]> = {};
    
    feeRecords.forEach(record => {
      const monthFormat = record.feeMonth;
      
      if (!formatGroups[monthFormat]) {
        formatGroups[monthFormat] = [];
      }
      
      formatGroups[monthFormat].push(record);
    });

    console.log('=' .repeat(80));
    console.log('MONTH FORMAT ANALYSIS');
    console.log('='.repeat(80));

    // Sort by count descending
    const sortedFormats = Object.entries(formatGroups)
      .sort((a, b) => b[1].length - a[1].length);

    sortedFormats.forEach(([format, records]) => {
      console.log(`\n📅 Format: "${format}"`);
      console.log(`   Count: ${records.length} records`);
      console.log(`   Sample records:`);
      
      records.slice(0, 3).forEach((record, idx) => {
        console.log(`     ${idx + 1}. Student: ${record.studentName}`);
        console.log(`        ID: ${record.studentId}`);
        console.log(`        Due Date: ${record.dueDate}`);
        console.log(`        Created: ${record.createdAt}`);
      });
    });

    console.log('\n' + '='.repeat(80));
    console.log('UNIQUE MONTH FORMATS:');
    console.log('='.repeat(80));
    
    const uniqueFormats = Object.keys(formatGroups).sort();
    uniqueFormats.forEach(format => {
      console.log(`  - "${format}" (${formatGroups[format].length} records)`);
    });

    // Identify problematic formats
    console.log('\n' + '='.repeat(80));
    console.log('POTENTIAL ISSUES:');
    console.log('='.repeat(80));

    const issues: string[] = [];
    
    uniqueFormats.forEach(format => {
      // Check for typos like "janauary"
      if (format.toLowerCase().includes('janauary')) {
        issues.push(`❌ Typo found: "${format}" should be "January" (${formatGroups[format].length} records)`);
      }
      
      // Check for YYYY-M format
      if (/^\d{4}-\d{1,2}$/.test(format)) {
        issues.push(`⚠️  Numeric format: "${format}" - should be standardized (${formatGroups[format].length} records)`);
      }
      
      // Check for inconsistent casing
      const normalized = format.charAt(0).toUpperCase() + format.slice(1).toLowerCase();
      if (format !== normalized && format.length > 3) {
        issues.push(`⚠️  Casing issue: "${format}" - should be "${normalized}" (${formatGroups[format].length} records)`);
      }
    });

    if (issues.length === 0) {
      console.log('✅ No obvious issues found!');
    } else {
      issues.forEach(issue => console.log(issue));
    }

    console.log('\n' + '='.repeat(80));
    console.log('RECOMMENDATIONS:');
    console.log('='.repeat(80));
    console.log('1. Standardize to format: "January 2026", "February 2026", etc.');
    console.log('2. Fix typos like "janauary" -> "January"');
    console.log('3. Convert numeric formats like "2026-1" -> "January 2026"');
    console.log('='.repeat(80));

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
checkFeeMonthFormats();
