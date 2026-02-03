import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import FeeRecord from '../src/models/FeeRecord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

async function fixPaymentDateWithZeroAmount(): Promise<void> {
  try {
    console.log('🔧 Fix Payment Date with Zero Amount Script');
    console.log('============================================================\n');

    const args = process.argv.slice(2);
    const applyFix = args.includes('--apply');

    if (!applyFix) {
      console.log('⚠️  DRY RUN MODE - No changes will be made');
      console.log('   Use --apply flag to apply fixes\n');
    } else {
      console.log('⚠️  APPLY MODE - Changes will be made to the database!\n');
    }

    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI not found in environment variables');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find fee records with payment date but paidAmount = 0
    const issueRecords = await FeeRecord.find({
      paymentDate: { $ne: null },
      paidAmount: 0
    });

    console.log(`Found ${issueRecords.length} fee records with payment date but paidAmount = 0\n`);

    if (issueRecords.length === 0) {
      console.log('✅ No issues found!');
      await mongoose.disconnect();
      return;
    }

    console.log('📋 Records to fix:');
    console.log('─'.repeat(80));

    for (const record of issueRecords) {
      console.log(`   Student: ${record.studentName}`);
      console.log(`   Fee Month: ${record.feeMonth}`);
      console.log(`   Fee Amount: ₹${record.feeAmount}`);
      console.log(`   Paid Amount: ₹${record.paidAmount} (should be ₹${record.feeAmount})`);
      console.log(`   Payment Date: ${record.paymentDate?.toLocaleDateString()}`);
      console.log(`   Current Status: ${record.status}`);
      console.log('');

      if (applyFix) {
        // Fix: Set paidAmount to feeAmount
        record.paidAmount = record.feeAmount;
        await record.save();
        console.log(`   ✅ Fixed: Set paidAmount = ₹${record.feeAmount}`);
        console.log(`   New Status: ${record.status}`);
        console.log('');
      }
    }

    console.log('─'.repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`   Total records with issue: ${issueRecords.length}`);
    
    if (applyFix) {
      console.log(`   ✅ Fixed: ${issueRecords.length} records`);
      console.log('\n💡 These fees should now show as "paid" instead of "partially_paid"');
    } else {
      console.log(`   💡 Run with --apply flag to fix these ${issueRecords.length} records`);
    }

    console.log('');
    await mongoose.disconnect();
    console.log('✅ Script completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
fixPaymentDateWithZeroAmount();
