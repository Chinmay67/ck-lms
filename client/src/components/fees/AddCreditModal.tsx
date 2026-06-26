import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import type { Student } from '../../types/student';
import type { Course } from '../../types/course';
import { CreditAPI, CourseAPI, AdminStudentsAPI } from '../../services/api';
import toast from 'react-hot-toast';

interface AddCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  onSuccess: () => void;
}

const AddCreditModal = ({ isOpen, onClose, student, onSuccess }: AddCreditModalProps) => {
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [activeEnrollment, setActiveEnrollment] = useState<any>(null);
  const [credits, setCredits] = useState<Array<{
    dueDate: string;
    paidDate: string;
    amount: number;
  }>>([{ dueDate: '', paidDate: new Date().toISOString().split('T')[0], amount: 0 }]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online' | 'card' | 'upi' | 'other'>('cash');
  const [transactionId, setTransactionId] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (isOpen && student) {
      setActiveEnrollment(null);
      setCourse(null);
      setCredits([{ dueDate: '', paidDate: new Date().toISOString().split('T')[0], amount: 0 }]);
      setPaymentMethod('cash');
      setTransactionId('');
      setRemarks('');
      fetchFeeConfig();
    }
  }, [isOpen, student]);

  // Once enrollment/course is loaded, set the default credit amount
  useEffect(() => {
    const fee = getEffectiveFeeAmount();
    if (fee > 0) {
      setCredits((prev) => {
        // Only update the first row if it's still at its default (0 or unchanged)
        if (prev.length === 1 && (prev[0].amount === 0 || prev[0].amount === fee)) {
          return [{ ...prev[0], amount: fee }];
        }
        return prev;
      });
    }
  }, [activeEnrollment, course]);

  const fetchFeeConfig = async () => {
    if (!student) return;
    const studentId = (student as any).id || student._id;

    // Fetch active enrollment first — it has the discounted monthlyFee
    try {
      const enrollRes = await AdminStudentsAPI.getEnrollments(studentId);
      if (enrollRes.success && enrollRes.data) {
        const list: any[] = Array.isArray(enrollRes.data) ? enrollRes.data : (enrollRes.data as any).data ?? [];
        const active = list.find((e: any) => !e.endDate);
        if (active) setActiveEnrollment(active);
      }
    } catch {
      // enrollment fetch failed, fall back to course
    }

    // Also fetch course for display / fallback
    try {
      const courseId = (student as any).courseId?._id || (student as any).courseId;
      if (courseId) {
        const response = await CourseAPI.getCourseById(courseId);
        if (response.success && response.data) {
          setCourse(response.data);
          return;
        }
      }
      const stage = student.stage || student.skillCategory;
      if (!stage) return;
      const response = await CourseAPI.getCourseByName(stage);
      if (response.success && response.data) {
        setCourse(response.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch course configuration:', error);
    }
  };

  // Gross fee from course level (pre-discount)
  const getGrossFeeAmount = (): number => {
    if (!course || !student) return 0;
    const studentLevel = student.levelNumber ?? student.level ?? student.skillLevel ?? 1;
    const levelConfig = course.levels?.find(l => l.levelNumber === studentLevel) || course.levels?.[0];
    return levelConfig?.feeAmount || 0;
  };

  // Effective fee: enrollment's monthlyFee (post-discount) if available, else gross
  const getEffectiveFeeAmount = (): number => {
    if (activeEnrollment?.monthlyFee) return activeEnrollment.monthlyFee;
    return getGrossFeeAmount();
  };

  // Legacy alias used by addCreditRow
  const getFeeAmount = getEffectiveFeeAmount;

  const getTotalAmount = (): number => {
    return credits.reduce((sum, credit) => sum + (credit.amount || 0), 0);
  };

  const addCreditRow = () => {
    const feeAmt = getFeeAmount();
    setCredits([...credits, { dueDate: '', paidDate: new Date().toISOString().split('T')[0], amount: feeAmt }]);
  };

  const removeCreditRow = (index: number) => {
    if (credits.length > 1) {
      setCredits(credits.filter((_, i) => i !== index));
    }
  };

  const updateCreditRow = (index: number, field: 'dueDate' | 'paidDate' | 'amount', value: string | number) => {
    const updated = [...credits];
    updated[index] = { ...updated[index], [field]: value };
    setCredits(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!student) return;

    const studentId = (student as any)?.id || student?._id;
    if (!studentId) {
      setFormError('Invalid student — please close and re-open');
      return;
    }

    const amount = getTotalAmount();
    if (amount <= 0) {
      setFormError('Please enter a valid amount greater than zero');
      return;
    }

    setLoading(true);
    try {
      for (const credit of credits) {
        if (!credit.paidDate) {
          setFormError('Paid date is required for all credit rows');
          setLoading(false);
          return;
        }
        await CreditAPI.createCredit({
          studentId,
          amount: credit.amount,
          description: `Payment${credit.dueDate ? ` for ${credit.dueDate}` : ''} - stored as credit until batch is assigned`,
          paymentMethod,
          transactionId: transactionId || undefined,
          remarks: remarks || undefined,
          dueDate: credit.dueDate || undefined,
          paidDate: credit.paidDate,
        });
      }
      toast.success(`${credits.length} credit${credits.length > 1 ? 's' : ''} of ₹${amount.toLocaleString()} added successfully!`);
      onSuccess();
      onClose();
    } catch (error: any) {
      setFormError(error.response?.data?.error || error.message || 'Failed to add credit — please try again');
    } finally {
      setLoading(false);
    }
  };

  if (!student) return null;

  const totalAmount = getTotalAmount();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Credit Payment"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-error-600/10 border border-error-600/20 rounded-lg">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <p className="text-sm text-red-400">{formError}</p>
          </div>
        )}
        {/* Info Banner */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 text-lg">💡</span>
            <div className="text-sm text-amber-700">
              <p className="font-medium">No batch assigned</p>
              <p className="mt-1">
                This student is not yet assigned to a batch. The payment will be stored as a <strong>credit</strong> and will be automatically applied to fee records when the student joins a batch.
              </p>
            </div>
          </div>
        </div>

        {/* Student Info */}
        <div className="p-3 bg-surface-alt rounded-lg">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-text-tertiary">Student:</span>
              <span className="ml-2 font-medium">{student.studentName}</span>
            </div>
            <div>
              <span className="text-text-tertiary">Stage:</span>
              <span className="ml-2 font-medium capitalize">
                {student.stage || (student.stageNumber ? `Stage ${student.stageNumber}` : student.skillCategory) || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-text-tertiary">Level:</span>
              <span className="ml-2 font-medium">{student.levelNumber ?? student.level ?? student.skillLevel ?? 1}</span>
            </div>
            <div>
              <span className="text-text-tertiary">Monthly Fee:</span>
              <span className="ml-2 font-medium">₹{getEffectiveFeeAmount().toLocaleString()}</span>
              {activeEnrollment && activeEnrollment.discountType && activeEnrollment.discountType !== 'none' && (
                <span className="ml-2 text-xs text-emerald-400">
                  ({activeEnrollment.discountType === 'percentage'
                    ? `-${activeEnrollment.discountPct}%`
                    : `-₹${activeEnrollment.discountAmount?.toLocaleString()}`
                  } discount applied)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Credit Entries */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-medium text-text-secondary">
              Credit Entries
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCreditRow}
            >
              + Add Entry
            </Button>
          </div>

          {credits.map((credit, index) => (
            <div key={index} className="p-3 border border-white/10 rounded-lg space-y-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-text-tertiary">Entry {index + 1}</span>
                {credits.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCreditRow(index)}
                    className="text-red-500 hover:text-red-400 text-xs"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Due Date (Optional)</label>
                  <input
                    type="date"
                    value={credit.dueDate}
                    onChange={(e) => updateCreditRow(index, 'dueDate', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-white/10 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-secondary mb-1">Paid Date *</label>
                  <input
                    type="date"
                    value={credit.paidDate}
                    onChange={(e) => updateCreditRow(index, 'paidDate', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-white/10 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-secondary mb-1">Amount *</label>
                  <input
                    type="number"
                    value={credit.amount}
                    onChange={(e) => updateCreditRow(index, 'amount', parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 text-sm border border-white/10 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                    min="0"
                    step="1"
                    required
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Total Amount Display */}
        <div className="p-4 bg-primary-600/10 border border-primary-200 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-primary-300 font-medium">Total Credit Amount:</span>
            <span className="text-2xl font-bold text-primary-300">₹{totalAmount.toLocaleString()}</span>
          </div>
          <p className="text-xs text-primary-600 mt-1">
            {credits.length} entr{credits.length > 1 ? 'ies' : 'y'} totaling ₹{totalAmount.toLocaleString()}
          </p>
        </div>

        {/* Payment Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="w-full px-3 h-9 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="online">Online Transfer</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Transaction ID */}
        {paymentMethod !== 'cash' && (
          <Input
            label="Transaction ID"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="Enter transaction reference"
          />
        )}

        {/* Remarks */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Remarks (Optional)
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder="Any additional notes..."
            className="w-full px-3 h-9 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || totalAmount <= 0}
          >
            {loading ? 'Processing...' : `Add Credit ₹${totalAmount.toLocaleString()}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddCreditModal;
