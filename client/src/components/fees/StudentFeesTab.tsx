import { useState, useEffect } from 'react';
import type { Student, FeeRecord, StudentCredit, CreditSummary } from '../../types/student';
import type { Course } from '../../types/course';
import { FeesAPI, CourseAPI, CreditAPI } from '../../services/api';
import toast from 'react-hot-toast';
import FeePaymentModal from './FeePaymentModal';
import AddCreditModal from './AddCreditModal';
import { formatFeeMonth } from '../../utils/dateFormatter';

interface StudentFeesTabProps {
  student: Student;
}

const StudentFeesTab = ({ student }: StudentFeesTabProps) => {
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [_course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeRecord | null>(null);

  const [payableFees, setPayableFees] = useState<{
    overdue: FeeRecord[];
    nextUpcoming: FeeRecord | null;
  }>({ overdue: [], nextUpcoming: null });
  const [credits, setCredits] = useState<StudentCredit[]>([]);
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null);

  useEffect(() => {
    // Use id field instead of _id (student objects use 'id' not '_id')
    const studentId = (student as any)?.id || student?._id;
    if (!studentId) {
      setLoading(false);
      return;
    }
    
    fetchStudentFees(studentId);
    fetchPayableFees(studentId);
    fetchFeeConfig();
    fetchCredits(studentId);
  }, [student]);

  const fetchStudentFees = async (studentId: string) => {
    // Add timeout to prevent indefinite loading
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 10000);
    });

    try {
      setLoading(true);
      setError(null);
      
      const response = await Promise.race([
        FeesAPI.getStudentFees(studentId),
        timeoutPromise
      ]) as any;
      
      if (response.success && response.data) {
        setFees(response.data);
      } else {
        setFees([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch student fees:', error);
      // Don't show error toast for 404 - just means no fees yet
      if (error.response?.status !== 404) {
        const errorMessage = error.message === 'Request timeout' 
          ? 'Request timed out. Please try again.' 
          : (error.response?.data?.error || error.message || 'Failed to fetch student fees');
        setError(errorMessage);
        toast.error(errorMessage);
      }
      setFees([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayableFees = async (studentId: string) => {
    try {
      const response = await FeesAPI.getPayableFees(studentId);
      if (response.success && response.data) {
        setPayableFees({
          overdue: response.data.overdue || [],
          nextUpcoming: response.data.nextUpcoming || null
        });
      } else {
        setPayableFees({ overdue: [], nextUpcoming: null });
      }
    } catch (error: any) {
      console.error('Failed to fetch payable fees:', error);
      setPayableFees({ overdue: [], nextUpcoming: null });
    }
  };

  const fetchFeeConfig = async () => {
    try {
      const stage = student.stage || student.skillCategory;
      if (!stage) {
        console.warn('No stage found for student:', (student as any)?.id || student._id);
        return;
      }
      
      const response = await CourseAPI.getCourseByName(stage);
      if (response.success && response.data) {
        setCourse(response.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch course config:', error);
      // Don't show error for course config - it's optional for viewing fees
    }
  };

  const fetchCredits = async (studentId: string) => {
    try {
      const response = await CreditAPI.getStudentCredits(studentId);
      if (response.success && response.data) {
        setCredits(response.data);
      }

      const summaryResponse = await CreditAPI.getCreditSummary(studentId);
      if (summaryResponse.success && summaryResponse.data) {
        setCreditSummary(summaryResponse.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch credits:', error);
      // Don't show error for credits - it's optional
    }
  };

  const handlePaymentSuccess = () => {
    const studentId = (student as any)?.id || student._id;
    if (studentId) {
      fetchStudentFees(studentId);
      fetchPayableFees(studentId);
      fetchCredits(studentId);
    }
    setEditingFee(null);
    setShowPaymentModal(false);
    setShowCreditModal(false);
  };

  const handleEditFee = (fee: FeeRecord) => {
    setEditingFee(fee);
    setShowPaymentModal(true);
  };

  const formatCurrency = (amount: number, currency: string = 'INR') => {
    return `${currency} ${amount.toLocaleString()}`;
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'upcoming':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'partially_paid':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Get overdue and next upcoming from payable fees
  const overdueFees = payableFees.overdue;
  const nextUpcomingFee = payableFees.nextUpcoming;

  // Show error only if there's an actual error from API, not just missing student ID
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-red-500 mb-3">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-red-600 font-medium mb-2">Error Loading Fees</p>
        <p className="text-gray-500 text-sm mb-4">{error}</p>
        <button
          onClick={() => {
            const studentId = (student as any)?.id || student?._id;
            if (studentId) {
              fetchStudentFees(studentId);
              fetchFeeConfig();
            }
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // If no student ID, show a message (check both id and _id)
  if (!(student as any)?.id && !student?._id) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-gray-400 mb-3">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <p className="text-gray-600 font-medium mb-2">No Student Selected</p>
        <p className="text-gray-500 text-sm">Please select a student to view fees</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-600 mt-3">Loading fee information...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Student Info */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-2">Student Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Name:</span>
            <span className="ml-2 font-medium">{student.studentName}</span>
          </div>
          <div>
            <span className="text-gray-600">Stage:</span>
            <span className="ml-2 font-medium capitalize">{student.stage || student.skillCategory}</span>
          </div>
          <div>
            <span className="text-gray-600">Level:</span>
            <span className="ml-2 font-medium">{student.level || student.skillLevel}</span>
          </div>
          <div>
            <span className="text-gray-600">Enrolled:</span>
            <span className="ml-2 font-medium">
              {formatDate(student.enrollmentDate)}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            // Check if student has batch assigned
            const hasBatch = student.batchId && student.batchId !== '';
            if (hasBatch) {
              setShowPaymentModal(true);
            } else {
              setShowCreditModal(true);
            }
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {student.batchId ? 'Record Payment' : 'Add Credit'}
        </button>
      </div>

      {/* Overdue Fees */}
      {overdueFees.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6 border-2 border-red-200">
          <h3 className="text-lg font-semibold text-red-700 mb-4 flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            Overdue Fees
          </h3>
          <div className="space-y-2">
            {overdueFees.map((fee, index) => (
              <div key={fee._id || `overdue-${index}`} className="flex justify-between items-center bg-red-50 px-4 py-3 rounded-lg border-l-4 border-red-500">
                <div>
                  <p className="font-medium text-gray-900">{formatFeeMonth(fee.feeMonth)}</p>
                  <p className="text-sm text-red-600">Overdue: {formatDate(fee.dueDate)}</p>
                  {fee.status === 'partially_paid' && (
                    <p className="text-xs text-orange-600">Partially Paid - {formatCurrency(fee.paidAmount)} paid</p>
                  )}
                </div>
                <span className="font-semibold text-red-700">
                  {formatCurrency(fee.feeAmount - fee.paidAmount, 'INR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Upcoming Fee */}
      {nextUpcomingFee && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📅 Next Upcoming Fee</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center bg-blue-50 px-4 py-3 rounded-lg border-l-4 border-blue-500">
              <div>
                <p className="font-medium text-gray-900">{formatFeeMonth(nextUpcomingFee.feeMonth)}</p>
                <p className="text-sm text-gray-600">Due: {formatDate(nextUpcomingFee.dueDate)}</p>
              </div>
              <span className="font-semibold text-blue-700">
                {formatCurrency(nextUpcomingFee.feeAmount, 'INR')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Active Credits */}
      {creditSummary && creditSummary.totalRemaining > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6 border-2 border-green-200">
          <h3 className="text-lg font-semibold text-green-700 mb-4 flex items-center gap-2">
            <span className="text-2xl">💰</span>
            Active Credits
          </h3>
          <div className="bg-green-50 p-4 rounded-lg mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Total Balance:</span>
              <span className="text-2xl font-bold text-green-700">
                {formatCurrency(creditSummary.totalRemaining)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
              <div>
                <span>Total Received:</span>
                <span className="ml-2 font-medium">{formatCurrency(creditSummary.totalPaid)}</span>
              </div>
              <div>
                <span>Total Used:</span>
                <span className="ml-2 font-medium">{formatCurrency(creditSummary.totalUsed)}</span>
              </div>
            </div>
          </div>
          {credits.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Credit History</h4>
              {credits.map((credit) => (
                <div key={credit._id} className="flex justify-between items-center bg-white px-4 py-3 rounded-lg border border-green-200">
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(credit.createdAt)} - Payment Received
                      </p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        credit.status === 'active' ? 'bg-green-100 text-green-800' : 
                        credit.status === 'used' ? 'bg-gray-100 text-gray-600' : 
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {credit.status === 'used' ? 'Used' : credit.status === 'expired' ? 'Expired' : 'Active'}
                      </span>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-gray-600">
                      <span>Received: {formatCurrency(credit.amountPaid)}</span>
                      <span>Used: {formatCurrency(credit.amountUsed)}</span>
                      <span className="font-medium text-green-700">Balance: {formatCurrency(credit.remainingCredit)}</span>
                    </div>
                    {credit.notes && (
                      <p className="text-xs text-gray-500 mt-1">{credit.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment History */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h3>
        {fees.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Month
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paid
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transaction ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fees.map((fee) => (
                  <tr key={fee._id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatFeeMonth(fee.feeMonth)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(fee.dueDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(fee.status)}`}>
                        {getStatusLabel(fee.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(fee.feeAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(fee.paidAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {fee.paymentDate ? formatDate(fee.paymentDate) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {fee.transactionId || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleEditFee(fee)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">No payment history found</p>
        )}
      </div>

      {/* Payment Modal */}
      <FeePaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setEditingFee(null);
        }}
        student={student}
        onSuccess={handlePaymentSuccess}
        editingFee={editingFee}
      />

      {/* Credit Modal for students without batch */}
      <AddCreditModal
        isOpen={showCreditModal}
        onClose={() => setShowCreditModal(false)}
        student={student}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
};

export default StudentFeesTab;
