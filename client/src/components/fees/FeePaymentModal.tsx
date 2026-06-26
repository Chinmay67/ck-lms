import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import type { Student, FeeRecord } from '../../types/student';
import type { Course } from '../../types/course';
import { FeesAPI, CourseAPI, CreditAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { showErrorToast } from '../../utils/errorHandler';
import { formatFeeMonth } from '../../utils/dateFormatter';

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
  invoiceId?: string;
}

const FeePaymentModal = ({ isOpen, onClose, student, onSuccess, editingFee }: FeePaymentModalProps) => {
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
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
        setRemarks((editingFee as any).paymentRemarks || editingFee.remarks || '');
        setNumMonths(1);
        setMonths([{
          feeMonth: editingFee.feeMonth,
          dueDate: editingFee.dueDate,
          invoiceId: editingFee._id || editingFee.id || undefined,
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
      // Prefer courseId lookup (V2), fall back to stage name (V1)
      const courseId = (student as any).courseId?._id || (student as any).courseId;
      if (courseId) {
        const response = await CourseAPI.getCourseById(courseId);
        if (response.success && response.data) {
          setCourse(response.data);
          return;
        }
      }
      const stage = student.stage || student.skillCategory;
      if (!stage) {
        toast.error('Unable to determine student stage. Please update student details.');
        return;
      }
      const response = await CourseAPI.getCourseByName(stage);
      if (response.success && response.data) {
        setCourse(response.data);
      } else {
        toast.error(`No course configuration found for ${stage}. Please contact administrator.`);
      }
    } catch (error: any) {
      console.error('Failed to fetch course configuration:', error);
      showErrorToast(error, 'Unable to load fee configuration');
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
      showErrorToast(error, 'Unable to load fee information');
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
      dueDate: new Date(fee.dueDate).toISOString().split('T')[0],
      invoiceId: (fee as any)._id || (fee as any).id || undefined,
    }));

    setMonths(newMonths);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!student || !course) {
      setFormError('Missing required information — please close and re-open');
      return;
    }
    const studentId = (student as any)?.id || student?._id;
    if (!studentId) {
      setFormError('Student ID is missing — please close and re-open');
      return;
    }
    const hasNoBatch = !student.batchId && !student.batch;
    setLoading(true);
    try {
      if (isEditMode && editingFee) {
        // Edit mode edits the payment's NON-MONEY metadata only (transactionId,
        // paymentMethod, remarks). Money corrections go through Reverse +
        // re-record. The paymentTransactionId comes from the enriched invoice.
        const paymentTransactionId = (editingFee as any).paymentTransactionId;
        if (!paymentTransactionId) {
          setFormError('No payment to edit on this invoice — record a payment first, or use Reverse to undo one.');
          setLoading(false);
          return;
        }
        const response = await FeesAPI.updatePaymentMetadata(paymentTransactionId, {
          transactionId: transactionId || undefined,
          paymentMethod,
          remarks: remarks || undefined,
        });
        if (response.success) {
          toast.success('Payment details updated successfully');
          onSuccess();
          handleClose();
        } else {
          setFormError((response as any).error || 'Failed to update payment');
        }
      } else if (hasNoBatch) {
        const creditAmount = isPartialPayment && partialAmount ? parseFloat(partialAmount) : getStudentFeeAmount() * numMonths;
        const response = await CreditAPI.createCredit({
          studentId, amount: creditAmount,
          description: `Payment received before batch assignment. ${numMonths} month(s) worth of fees.`,
          paymentMethod, remarks: remarks || undefined
        });
        if (response.success) {
          toast.success(`Credit of ₹${creditAmount.toLocaleString()} created for ${student.studentName}.`);
          onSuccess();
          handleClose();
        } else {
          setFormError((response as any).error || 'Failed to create credit');
        }
      } else {
        if (!months || months.length === 0) {
          setFormError('Please select at least one month to record payment for');
          setLoading(false);
          return;
        }
        const response = await FeesAPI.recordBulkPayment({
          studentId, months, paymentDate, paymentMethod,
          transactionId: transactionId || undefined,
          remarks: remarks || undefined,
          // The cash collected is the post-discount amount (or an explicit
          // partial override). The discount is sent separately so the server
          // applies it as a per-invoice waiver on the selected months.
          paidAmount: actualAmount,
          ...(discountValue > 0 && {
            discountType,
            discountValue,
            discountReason: discountReason || undefined,
          }),
        });
        if (response.success) {
          const monthNames = months.map(m => formatFeeMonth(m.feeMonth)).join(', ');
          toast.success(`Payment recorded for ${monthNames}`);
          onSuccess();
          handleClose();
        } else {
          setFormError((response as any).error || 'Failed to record payment');
        }
      }
    } catch (error: any) {
      setFormError(error.response?.data?.error || error.message || 'Unable to record payment — please try again');
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
    setDiscountType('percentage');
    setDiscountValue(0);
    setDiscountReason('');
    onClose();
  };

  // Helper: get fee amount for the student's actual level (not hardcoded levels[0])
  const getStudentFeeAmount = (): number => {
    if (!course || course.levels.length === 0) return 0;
    const studentLevel = student?.levelNumber ?? student?.level ?? student?.skillLevel ?? 1;
    const levelConfig = course.levels.find(l => l.levelNumber === studentLevel) || course.levels[0];
    return levelConfig?.feeAmount || 0;
  };

  const feePerMonth = getStudentFeeAmount();
  const grossTotal = feePerMonth * numMonths;
  // Discount applies to the gross invoiced total; the waived portion is
  // forgiven (a waiver), the remainder is what the parent pays in cash.
  const discountWaived = discountValue > 0
    ? (discountType === 'percentage'
        ? Math.round((grossTotal * discountValue) / 100)
        : Math.min(discountValue, grossTotal))
    : 0;
  const discountedTotal = Math.max(0, grossTotal - discountWaived);
  // The cash collected: the discounted total, unless the admin overrides with
  // an explicit partial amount (which must be ≤ discounted total).
  const totalAmount = discountedTotal;
  const actualAmount = isPartialPayment && partialAmount ? parseFloat(partialAmount) : totalAmount;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditMode ? "Edit Fee Payment Details" : "Record Fee Payment"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
        {formError && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-error-600/10 border border-error-600/20 rounded-lg">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <p className="text-sm text-red-400">{formError}</p>
          </div>
        )}
        {/* Student Info */}
        <div className="bg-primary-600/10 p-3 md:p-4 rounded-lg border border-primary-500/20">
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 pb-2 border-b border-white/7">Student Information</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 text-xs md:text-sm">
            <div>
              <span className="text-text-secondary">Name:</span>
              <span className="ml-2 font-medium text-text-primary">{student?.studentName}</span>
            </div>
            <div>
              <span className="text-text-secondary">Stage:</span>
              <span className="ml-2 font-medium text-text-primary capitalize">
                {student?.stage || (student?.stageNumber ? `Stage ${student.stageNumber}` : student?.skillCategory)}
              </span>
            </div>
            <div>
              <span className="text-text-secondary">Level:</span>
              <span className="ml-2 font-medium text-text-primary">{student?.levelNumber ?? student?.level ?? student?.skillLevel}</span>
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
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 md:mb-4 pb-2 border-b border-white/7">Payment Details</h4>
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
                  className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all"
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
                className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all"
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
                className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all"
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
                className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary placeholder:text-text-tertiary transition-all"
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
              className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary placeholder:text-text-tertiary transition-all"
            />
          </div>

          {!isEditMode && (
            <div className="mt-3 md:mt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={isPartialPayment && numMonths === 1}
                  onChange={(e) => {
                    setIsPartialPayment(e.target.checked);
                    if (e.target.checked) { setDiscountValue(0); }
                  }}
                  className="rounded border-border text-primary-600 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={numMonths > 1 || discountValue > 0}
                />
                <span className={`ml-2 text-sm font-medium ${numMonths > 1 ? 'text-text-tertiary' : 'text-text-primary'}`}>
                  Partial Payment {numMonths > 1 && '(only for single month)'}
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
                    className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary placeholder:text-text-tertiary transition-all"
                    required
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    Total due: INR {totalAmount.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Discount Section */}
          {!isEditMode && (
            <div className="mt-3 md:mt-4 p-3 bg-accent-600/10 rounded-lg border border-accent-500/20">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-sm font-semibold text-text-primary">Discount</h5>
                <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
                  <button
                    type="button"
                    onClick={() => setDiscountType('percentage')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${discountType === 'percentage' ? 'bg-accent-600 text-white' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${discountType === 'fixed' ? 'bg-accent-600 text-white' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    ₹
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">
                    {discountType === 'percentage' ? 'Discount %' : 'Discount Amount (₹)'}
                  </label>
                  <input
                    type="number"
                    value={discountValue || ''}
                    onChange={(e) => {
                      const v = Math.max(0, parseFloat(e.target.value) || 0);
                      setDiscountValue(discountType === 'percentage' ? Math.min(100, v) : v);
                    }}
                    min="0"
                    max={discountType === 'percentage' ? 100 : undefined}
                    step="1"
                    placeholder="0"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 bg-surface text-text-primary placeholder:text-text-tertiary transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">
                    Reason
                  </label>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="e.g. 3-month advance"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 bg-surface text-text-primary placeholder:text-text-tertiary transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fee Summary */}
        <div className="bg-primary-600/10 p-3 md:p-4 rounded-lg border border-primary-500/20">
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3">Fee Summary</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-text-secondary">Fee per month:</span>
              <span className="font-medium text-text-primary">
                INR {feePerMonth.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-text-secondary">Number of months:</span>
              <span className="font-medium text-text-primary">{numMonths}</span>
            </div>
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-text-secondary">Gross total:</span>
              <span className="font-medium text-text-primary">
                INR {grossTotal.toLocaleString()}
              </span>
            </div>
            {discountWaived > 0 && (
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-text-secondary">
                  Discount {discountType === 'percentage' ? `(${discountValue}%)` : ''}:
                </span>
                <span className="font-medium text-accent-400">
                  -INR {discountWaived.toLocaleString()}
                </span>
              </div>
            )}
            {discountWaived > 0 && (
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-text-secondary">Discounted total:</span>
                <span className="font-medium text-text-primary">
                  INR {discountedTotal.toLocaleString()}
                </span>
              </div>
            )}
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
            <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 pb-2 border-b border-white/7">
              {isEditMode ? 'Month Being Edited' : 'Months to be Paid'}
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {months.map((month, index) => (
                <div key={index} className="flex justify-between items-center bg-primary-600/10 px-3 py-2 rounded-lg border border-white/7">
                  <span className="text-xs md:text-sm text-text-primary font-medium">{formatFeeMonth(month.feeMonth)}</span>
                  <span className="text-xs md:text-sm font-semibold text-primary-600">
                    INR {feePerMonth.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 pt-4 border-t border-white/7">
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
