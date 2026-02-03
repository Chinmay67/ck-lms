import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import FeeRecord from '../src/models/FeeRecord.js';
import Student from '../src/models/Student.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

interface AnalysisResult {
  activeStudentsShouldBeInactive: Array<{
    studentId: string;
    studentName: string;
    phone: string;
    status: string;
    reason: string;
    lastPaymentDate?: Date;
    totalFees: number;
    paidFees: number;
    unpaidFees: number;
  }>;
  paidFeesShowingUnpaid: Array<{
    feeId: string;
    studentName: string;
    feeMonth: string;
    feeAmount: number;
    paidAmount: number;
    paymentDate: Date | null;
    computedStatus: string;
    issue: string;
  }>;
  feesWithPaymentDateButNoPaidAmount: Array<{
    feeId: string;
    studentName: string;
    feeMonth: string;
    paymentDate: Date;
    paidAmount: number;
    feeAmount: number;
  }>;
  studentsWithMixedStatus: Array<{
    studentId: string;
    studentName: string;
    status: string;
    hasPaidFees: boolean;
    hasUnpaidFees: boolean;
    totalFeesCount: number;
  }>;
}

async function analyzeFeeAndStudentStatus(): Promise<void> {
  try {
    console.log('🔍 Comprehensive Fee & Student Status Analysis');
    console.log('============================================================\n');

    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI not found in environment variables');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const results: AnalysisResult = {
      activeStudentsShouldBeInactive: [],
      paidFeesShowingUnpaid: [],
      feesWithPaymentDateButNoPaidAmount: [],
      studentsWithMixedStatus: []
    };

    // 1. Check for active students who should be inactive
    console.log('🔍 Analyzing active students who might need to be inactive...\n');
    
    const activeStudents = await Student.find({ status: 'active' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    for (const student of activeStudents) {
      const studentFees = await FeeRecord.find({ studentId: student._id });
      
      if (studentFees.length === 0) {
        // No fees at all - might be new or should be inactive
        continue;
      }

      const totalFees = studentFees.length;
      const paidFees = studentFees.filter(f => f.paidAmount >= f.feeAmount).length;
      const unpaidFees = totalFees - paidFees;
      
      // Get last payment date
      const paidRecords = studentFees.filter(f => f.paymentDate && f.paidAmount >= f.feeAmount);
      const lastPaymentDate = paidRecords.length > 0 
        ? paidRecords.sort((a, b) => (b.paymentDate?.getTime() || 0) - (a.paymentDate?.getTime() || 0))[0].paymentDate
        : undefined;

      // Check if all fees are marked as "discontinued" or similar
      const allDiscontinued = studentFees.every(f => {
        const status = computeFeeStatus(f, today);
        return status === 'paid'; // In your system, discontinued students might have all fees marked as paid
      });

      // Reasons a student should be inactive:
      // 1. No payment in last 3 months and has overdue fees
      // 2. All fees are overdue (none paid, all old)
      // 3. Student has only old paid fees but no recent activity

      const hasRecentPayment = lastPaymentDate && lastPaymentDate >= threeMonthsAgo;
      const hasOverdueFees = studentFees.some(f => {
        const status = computeFeeStatus(f, today);
        return status === 'overdue';
      });

      const allFeesOld = studentFees.every(f => f.dueDate < threeMonthsAgo);

      let shouldBeInactive = false;
      let reason = '';

      if (!hasRecentPayment && hasOverdueFees && unpaidFees >= 3) {
        shouldBeInactive = true;
        reason = `No payment in 3+ months, ${unpaidFees} overdue fees`;
      } else if (allFeesOld && unpaidFees === totalFees) {
        shouldBeInactive = true;
        reason = 'All fees are old and unpaid (likely discontinued)';
      } else if (!hasRecentPayment && allDiscontinued && lastPaymentDate && lastPaymentDate < threeMonthsAgo) {
        shouldBeInactive = true;
        reason = 'All fees paid but no activity in 3+ months (likely completed/discontinued)';
      }

      if (shouldBeInactive) {
        results.activeStudentsShouldBeInactive.push({
          studentId: student._id.toString(),
          studentName: student.studentName,
          phone: student.phone || '',
          status: 'active',
          reason,
          lastPaymentDate: lastPaymentDate || undefined,
          totalFees,
          paidFees,
          unpaidFees
        });
      }
    }

    // 2. Check for fees with paidAmount >= feeAmount but not showing as "paid"
    console.log('🔍 Checking for paid fees showing as unpaid...\n');
    
    const allFees = await FeeRecord.find();
    
    for (const fee of allFees) {
      const computedStatus = computeFeeStatus(fee, today);
      
      // Issue 1: Has full payment but status is not "paid"
      if (fee.paidAmount >= fee.feeAmount && computedStatus !== 'paid') {
        results.paidFeesShowingUnpaid.push({
          feeId: fee._id.toString(),
          studentName: fee.studentName,
          feeMonth: fee.feeMonth,
          feeAmount: fee.feeAmount,
          paidAmount: fee.paidAmount,
          paymentDate: fee.paymentDate || null,
          computedStatus,
          issue: `Full payment recorded (₹${fee.paidAmount} >= ₹${fee.feeAmount}) but status is "${computedStatus}" instead of "paid"`
        });
      }
      
      // Issue 2: Has payment date but paidAmount is 0
      if (fee.paymentDate && fee.paidAmount === 0) {
        results.feesWithPaymentDateButNoPaidAmount.push({
          feeId: fee._id.toString(),
          studentName: fee.studentName,
          feeMonth: fee.feeMonth,
          paymentDate: fee.paymentDate,
          paidAmount: fee.paidAmount,
          feeAmount: fee.feeAmount
        });
      }
    }

    // 3. Check for students with mixed status (has both paid and unpaid fees)
    console.log('🔍 Analyzing students with mixed payment status...\n');
    
    for (const student of activeStudents) {
      const studentFees = await FeeRecord.find({ studentId: student._id });
      
      if (studentFees.length === 0) continue;

      const hasPaidFees = studentFees.some(f => f.paidAmount >= f.feeAmount);
      const hasUnpaidFees = studentFees.some(f => f.paidAmount < f.feeAmount && f.dueDate < today);

      if (!hasPaidFees && hasUnpaidFees && studentFees.length > 2) {
        results.studentsWithMixedStatus.push({
          studentId: student._id.toString(),
          studentName: student.studentName,
          status: 'active',
          hasPaidFees,
          hasUnpaidFees,
          totalFeesCount: studentFees.length
        });
      }
    }

    // Print Results
    console.log('\n============================================================');
    console.log('📊 ANALYSIS RESULTS');
    console.log('============================================================\n');

    console.log(`1️⃣  Active Students Who Should Be Inactive: ${results.activeStudentsShouldBeInactive.length}`);
    if (results.activeStudentsShouldBeInactive.length > 0) {
      console.log('\n   Students:');
      results.activeStudentsShouldBeInactive.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.studentName} (${s.phone})`);
        console.log(`      Status: ${s.status}`);
        console.log(`      Reason: ${s.reason}`);
        console.log(`      Last Payment: ${s.lastPaymentDate ? s.lastPaymentDate.toLocaleDateString() : 'Never'}`);
        console.log(`      Fees: ${s.paidFees}/${s.totalFees} paid, ${s.unpaidFees} unpaid`);
        console.log('');
      });
    }

    console.log(`\n2️⃣  Paid Fees Showing as Unpaid: ${results.paidFeesShowingUnpaid.length}`);
    if (results.paidFeesShowingUnpaid.length > 0) {
      console.log('\n   Fee Records:');
      results.paidFeesShowingUnpaid.forEach((f, i) => {
        console.log(`   ${i + 1}. ${f.studentName} - ${f.feeMonth}`);
        console.log(`      Fee: ₹${f.feeAmount}, Paid: ₹${f.paidAmount}`);
        console.log(`      Payment Date: ${f.paymentDate ? f.paymentDate.toLocaleDateString() : 'None'}`);
        console.log(`      Computed Status: ${f.computedStatus}`);
        console.log(`      Issue: ${f.issue}`);
        console.log('');
      });
    }

    console.log(`\n3️⃣  Fees with Payment Date but No Paid Amount: ${results.feesWithPaymentDateButNoPaidAmount.length}`);
    if (results.feesWithPaymentDateButNoPaidAmount.length > 0) {
      console.log('\n   Fee Records:');
      results.feesWithPaymentDateButNoPaidAmount.forEach((f, i) => {
        console.log(`   ${i + 1}. ${f.studentName} - ${f.feeMonth}`);
        console.log(`      Payment Date: ${f.paymentDate.toLocaleDateString()}`);
        console.log(`      Paid Amount: ₹${f.paidAmount} (should be ₹${f.feeAmount})`);
        console.log('');
      });
    }

    console.log(`\n4️⃣  Active Students Never Paid Anything: ${results.studentsWithMixedStatus.length}`);
    if (results.studentsWithMixedStatus.length > 0) {
      console.log('\n   Students:');
      results.studentsWithMixedStatus.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.studentName}`);
        console.log(`      Status: ${s.status}`);
        console.log(`      Total Fees: ${s.totalFeesCount}`);
        console.log(`      Has Paid Fees: ${s.hasPaidFees ? 'Yes' : 'No'}`);
        console.log(`      Has Unpaid Fees: ${s.hasUnpaidFees ? 'Yes' : 'No'}`);
        console.log('');
      });
    }

    console.log('\n============================================================');
    console.log('📋 SUMMARY');
    console.log('============================================================');
    console.log(`Total Issues Found: ${
      results.activeStudentsShouldBeInactive.length +
      results.paidFeesShowingUnpaid.length +
      results.feesWithPaymentDateButNoPaidAmount.length +
      results.studentsWithMixedStatus.length
    }`);
    console.log('');
    console.log('💡 Next Steps:');
    console.log('   1. Review the students who should be inactive');
    console.log('   2. Fix paid fees showing as unpaid (this is the main status bug)');
    console.log('   3. Update fees with payment date but no paid amount');
    console.log('   4. Decide on status for students who never paid');
    console.log('============================================================\n');

    await mongoose.disconnect();
    console.log('✅ Analysis completed successfully!');

  } catch (error) {
    console.error('❌ Error during analysis:', error);
    process.exit(1);
  }
}

// Helper function to compute fee status (matches the virtual getter logic)
function computeFeeStatus(fee: any, now: Date): string {
  // Check if fully paid first (regardless of paymentDate for robustness)
  if (fee.paidAmount >= fee.feeAmount) {
    return 'paid';
  }
  
  // Check if partially paid (has paymentDate but not fully paid)
  if (fee.paymentDate && fee.paidAmount > 0 && fee.paidAmount < fee.feeAmount) {
    return 'partially_paid';
  }
  
  // No payment made - check if overdue or upcoming
  if (!fee.paymentDate || fee.paidAmount === 0) {
    return fee.dueDate < now ? 'overdue' : 'upcoming';
  }
  
  // Fallback
  return fee.dueDate < now ? 'overdue' : 'upcoming';
}

// Run the analysis
analyzeFeeAndStudentStatus();
