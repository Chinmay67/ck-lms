import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import type { Student, FeeRecord } from '../../types/student';
import type { Course } from '../../types/course';
import { FeesAPI, CourseAPI } from '../../services/api';
import toast from 'react-hot-toast';

interface FeePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  onSuccess: () => void;
  editingFee?: FeeRecord | null;
}

interface MonthData {
  feeMonth: string;
  dueDate: string;
}

const FeePaymentModal = ({ isOpen, onClose, student, onSuccess, editingFee }: FeePaymentModalProps) => {
  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [numMonths, setNumMonths] = useState(1);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online' | 'card' | 'upi' | 'other'>('cash');
  const [transactionId, setTransactionId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [months, setMonths] = useState<MonthData[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [partialAmount, setPartialAmount] = useState('');
  const [payableFees, setPayableFees] = useState<{
    overdue: FeeRecord[];
    nextUpcoming: FeeRecord | null;
  }>({ overdue: [], nextUpcoming: null });

  useEffect(() => {
    if (isOpen && student) {
      fetchFeeConfig();
      fetchPayableFees();
      if (editingFee) {
        setIsEditMode(true);
        setPaymentDate(editingFee.paymentDate ? new Date(editingFee.paymentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        setPaymentMethod(editingFee.paymentMethod || 'cash');
        setTransactionId(editingFee.transactionId || '');
        setRemarks(editingFee.remarks || '');
        setNumMonths(1);
        setMonths([{
          feeMonth: editingFee.feeMonth,
          dueDate: editingFee.dueDate
        }]);
      } else {
        setIsEditMode(false);
      }
    }
  }, [isOpen, student, editingFee]);

  useEffect(() => {
    if (!isEditMode && (payableFees.overdue.length > 0 || payableFees.nextUpcoming)) {
      updateMonthsFromPayableFees();
    }
  }, [numMonths, payableFees, isEditMode]);

  const fetchFeeConfig = async () => {
    if (!student) return;
    try {
      const stage = student.stage || student.skillCategory;
      if (!stage) return;
      
      const response = await CourseAPI.getCourseByName(stage);
      if (response.success && response.data) {
        setCourse(response.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch course configuration:', error);
      toast.error(error.message || 'Failed to fetch course configuration');
    }
  };

  const fetchPayableFees = async () => {
    if (!student) return;
    
    const studentId = (student as any)?.id || student?._id;
    if (!studentId) return;
    
    try {
      const response = await FeesAPI.getPayableFees(studentId);
      if (response.success && response.data) {
        setPayableFees({
          overdue: response.data.overdue || [],
          nextUpcoming: response.data.nextUpcoming || null
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch payable fees:', error);
      toast.error('Failed to load payable fees');
    }
  };

  const updateMonthsFromPayableFees = () => {
    // Combine overdue and next upcoming into a single array
    const allPayableFees: FeeRecord[] = [
      ...payableFees.overdue,
      ...(payableFees.nextUpcoming ? [payableFees.nextUpcoming] : [])
    ];
    
    if (allPayableFees.length === 0) return;
    
    const selectedMonths = allPayableFees.slice(0, Math.min(numMonths, allPayableFees.length));
    const newMonths: MonthData[] = selectedMonths.map(fee => ({
      feeMonth: fee.feeMonth,
      dueDate: new Date(fee.dueDate).toISOString().split('T')[0]
    }));
    
    setMonths(newMonths);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!student || !course) {
      toast.error('Missing required information');
      return;
    }

    // Get the correct student ID (check both id and _id fields)
    const studentId = (student as any)?.id || student?._id;
    if (!studentId) {
      toast.error('Student ID is missing');
      return;
    }

    // Validate months array
    if (!isEditMode && (!months || months.length === 0)) {
      toast.error('Please select months to pay for');
      return;
    }

    setLoading(true);
    try {
      if (isEditMode && editingFee) {
        // Update existing fee record
        const response = await FeesAPI.updateFee(editingFee._id, {
          paymentDate,
          paymentMethod,
          transactionId: transactionId || undefined,
          remarks: remarks || undefined
        });

        if (response.success) {
          toast.success('Payment details updated successfully');
          onSuccess();
          handleClose();
        }
      } else {
        // Create new fee record(s)
        const response = await FeesAPI.recordBulkPayment({
          studentId,
          months,
          paymentDate,
          paymentMethod,
          transactionId: transactionId || undefined,
          remarks: remarks || undefined,
          ...(isPartialPayment && { paidAmount: parseFloat(partialAmount) })
        });

        if (response.success) {
          toast.success(`Payment recorded for ${months.length} month(s)`);
          onSuccess();
          handleClose();
        }
      }
    } catch (error: any) {
      console.error('Failed to record payment:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setNumMonths(1);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('cash');
    setTransactionId('');
    setRemarks('');
    setMonths([]);
    setIsEditMode(false);
    setIsPartialPayment(false);
    setPartialAmount('');
    onClose();
  };

  const totalAmount = course && course.levels.length > 0 ? course.levels[0].feeAmount * numMonths : 0;
  const actualAmount = isPartialPayment && partialAmount ? parseFloat(partialAmount) : totalAmount;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditMode ? "Edit Fee Payment Details" : "Record Fee Payment"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
        {/* Student Info */}
        <div className="bg-primary-50 p-3 md:p-4 rounded-xl border border-primary-100">
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 pb-2 border-b border-primary-100">Student Information</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 text-xs md:text-sm">
            <div>
              <span className="text-text-secondary">Name:</span>
              <span className="ml-2 font-medium text-text-primary">{student?.studentName}</span>
            </div>
            <div>
              <span className="text-text-secondary">Stage:</span>
              <span className="ml-2 font-medium text-text-primary capitalize">{student?.stage || student?.skillCategory}</span>
            </div>
            <div>
              <span className="text-text-secondary">Level:</span>
              <span className="ml-2 font-medium text-text-primary">{student?.level || student?.skillLevel}</span>
            </div>
            <div>
              <span className="text-text-secondary">Enrolled:</span>
              <span className="ml-2 font-medium text-text-primary">
                {student?.enrollmentDate ? new Date(student.enrollmentDate).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Details */}
        <div>
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 md:mb-4 pb-2 border-b border-primary-100">Payment Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {!isEditMode && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Number of Months *
                </label>
                <input
                  type="number"
                  value={numMonths}
                  onChange={(e) => {
                    const totalPayable = payableFees.overdue.length + (payableFees.nextUpcoming ? 1 : 0);
                    setNumMonths(Math.min(Math.max(1, parseInt(e.target.value) || 1), totalPayable, 6));
                  }}
                  min="1"
                  max={Math.min(payableFees.overdue.length + (payableFees.nextUpcoming ? 1 : 0), 6)}
                  className="w-full px-3 md:px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all"
                  required
                  disabled={payableFees.overdue.length === 0 && !payableFees.nextUpcoming}
                />
                <p className="text-xs text-text-tertiary mt-1">
                  {payableFees.overdue.length === 0 && !payableFees.nextUpcoming
                    ? 'No payable fees available' 
                    : `${payableFees.overdue.length + (payableFees.nextUpcoming ? 1 : 0)} month(s) available to pay (${payableFees.overdue.length} overdue)`}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Payment Date *
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 md:px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 md:px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all"
                required
              >
                <option value="cash">Cash</option>
                <option value="online">Online Transfer</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-text-primary mb-1">
                Transaction ID
              </label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="Enter transaction ID"
                className="w-full px-3 md:px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary placeholder:text-text-tertiary transition-all"
              />
              <p className="text-xs text-text-tertiary mt-1">
                Required for online payments. Same ID can only be used for consecutive months.
              </p>
            </div>
          </div>

          <div className="mt-3 md:mt-4">
            <label className="block text-sm font-medium text-text-primary mb-1">
              Remarks
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Any additional notes..."
              className="w-full px-3 md:px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary placeholder:text-text-tertiary transition-all"
            />
          </div>

          {!isEditMode && (
            <div className="mt-3 md:mt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={isPartialPayment}
                  onChange={(e) => setIsPartialPayment(e.target.checked)}
                  className="rounded border-border text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm font-medium text-text-primary">
                  Partial Payment
                </span>
              </label>
              {isPartialPayment && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Amount Paid *
                  </label>
                  <input
                    type="number"
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    min="1"
                    max={totalAmount}
                    step="0.01"
                    placeholder="Enter amount paid"
                    className="w-full px-3 md:px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary placeholder:text-text-tertiary transition-all"
                    required
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    Total due: INR {totalAmount.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fee Summary */}
        <div className="bg-primary-50 p-3 md:p-4 rounded-xl border border-primary-100">
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3">Fee Summary</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-text-secondary">Fee per month:</span>
              <span className="font-medium text-text-primary">
                INR {course && course.levels.length > 0 ? course.levels[0].feeAmount.toLocaleString() : 0}
              </span>
            </div>
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-text-secondary">Number of months:</span>
              <span className="font-medium text-text-primary">{numMonths}</span>
            </div>
            <div className="border-t border-primary-200 pt-2 mt-2">
              <div className="flex justify-between">
                <span className="font-semibold text-text-primary text-sm md:text-base">
                  {isPartialPayment ? 'Amount Paid:' : 'Total Amount:'}
                </span>
                <span className="font-bold text-base md:text-lg text-primary-600">
                  INR {actualAmount.toLocaleString()}
                </span>
              </div>
              {isPartialPayment && (
                <div className="flex justify-between text-xs md:text-sm text-text-secondary mt-1">
                  <span>Remaining:</span>
                  <span className="text-text-primary font-medium">INR {(totalAmount - actualAmount).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Months Breakdown */}
        {months.length > 0 && (
          <div>
            <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 pb-2 border-b border-primary-100">
              {isEditMode ? 'Month Being Edited' : 'Months to be Paid'}
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {months.map((month, index) => (
                <div key={index} className="flex justify-between items-center bg-primary-50 px-3 py-2 rounded-lg border border-primary-100">
                  <span className="text-xs md:text-sm text-text-primary font-medium">{month.feeMonth}</span>
                  <span className="text-xs md:text-sm font-semibold text-primary-600">
                    INR {course && course.levels.length > 0 ? course.levels[0].feeAmount.toLocaleString() : 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 pt-4 border-t border-primary-100">
          <Button type="button" variant="ghost" onClick={handleClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading} className="w-full sm:w-auto">
            {loading ? 'Saving...' : (isEditMode ? 'Update Payment' : 'Record Payment')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default FeePaymentModal;
