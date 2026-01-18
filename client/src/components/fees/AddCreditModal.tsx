import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import type { Student } from '../../types/student';
import type { Course } from '../../types/course';
import { CreditAPI, CourseAPI } from '../../services/api';
import toast from 'react-hot-toast';

interface AddCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  onSuccess: () => void;
}

const AddCreditModal = ({ isOpen, onClose, student, onSuccess }: AddCreditModalProps) => {
  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
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
      fetchFeeConfig();
      // Reset form
      const feeAmt = getFeeAmount();
      setCredits([{ dueDate: '', paidDate: new Date().toISOString().split('T')[0], amount: feeAmt }]);
      setPaymentMethod('cash');
      setTransactionId('');
      setRemarks('');
    }
  }, [isOpen, student]);

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
    }
  };

  const getFeeAmount = (): number => {
    if (!course || !student) return 0;
    const studentLevel = student.level || student.skillLevel || 1;
    const levelConfig = course.levels?.find(l => l.levelNumber === studentLevel) || course.levels?.[0];
    return levelConfig?.feeAmount || 0;
  };

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
    if (!student) return;

    const studentId = (student as any)?.id || student?._id;
    if (!studentId) {
      toast.error('Invalid student ID');
      return;
    }

    const amount = getTotalAmount();
    if (amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      // Create multiple credits
      for (const credit of credits) {
        if (!credit.paidDate) {
          toast.error('Paid date is required for all credits');
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
      console.error('Error adding credit:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to add credit');
    } finally {
      setLoading(false);
    }
  };

  if (!student) return null;

  const feeAmount = getFeeAmount();
  const totalAmount = getTotalAmount();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Credit Payment"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Student:</span>
              <span className="ml-2 font-medium">{student.studentName}</span>
            </div>
            <div>
              <span className="text-gray-500">Stage:</span>
              <span className="ml-2 font-medium capitalize">{student.stage || student.skillCategory || 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-500">Level:</span>
              <span className="ml-2 font-medium">{student.level || student.skillLevel || 1}</span>
            </div>
            <div>
              <span className="text-gray-500">Monthly Fee:</span>
              <span className="ml-2 font-medium">₹{feeAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Credit Entries */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="block text-sm font-medium text-gray-700">
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
            <div key={index} className="p-3 border border-gray-200 rounded-lg space-y-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-gray-500">Entry {index + 1}</span>
                {credits.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCreditRow(index)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Due Date (Optional)</label>
                  <input
                    type="date"
                    value={credit.dueDate}
                    onChange={(e) => updateCreditRow(index, 'dueDate', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Paid Date *</label>
                  <input
                    type="date"
                    value={credit.paidDate}
                    onChange={(e) => updateCreditRow(index, 'paidDate', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Amount *</label>
                  <input
                    type="number"
                    value={credit.amount}
                    onChange={(e) => updateCreditRow(index, 'amount', parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
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
        <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-primary-700 font-medium">Total Credit Amount:</span>
            <span className="text-2xl font-bold text-primary-700">₹{totalAmount.toLocaleString()}</span>
          </div>
          <p className="text-xs text-primary-600 mt-1">
            {credits.length} entr{credits.length > 1 ? 'ies' : 'y'} totaling ₹{totalAmount.toLocaleString()}
          </p>
        </div>

        {/* Payment Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Remarks (Optional)
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder="Any additional notes..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
