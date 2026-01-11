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
  const [numMonths, setNumMonths] = useState(1);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online' | 'card' | 'upi' | 'other'>('cash');
  const [transactionId, setTransactionId] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (isOpen && student) {
      fetchFeeConfig();
      // Reset form
      setNumMonths(1);
      setPaymentDate(new Date().toISOString().split('T')[0]);
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
    return getFeeAmount() * numMonths;
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
      const response = await CreditAPI.createCredit({
        studentId,
        amount,
        description: `Advance payment for ${numMonths} month(s) - stored as credit until batch is assigned`,
        paymentMethod,
        transactionId: transactionId || undefined,
        remarks: remarks || undefined,
      });

      if (response.success) {
        toast.success(`Credit of ₹${amount.toLocaleString()} added successfully!`);
        onSuccess();
        onClose();
      } else {
        throw new Error(response.error || 'Failed to add credit');
      }
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

        {/* Number of Months */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Months
          </label>
          <select
            value={numMonths}
            onChange={(e) => setNumMonths(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
              <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>

        {/* Total Amount Display */}
        <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-primary-700 font-medium">Total Credit Amount:</span>
            <span className="text-2xl font-bold text-primary-700">₹{totalAmount.toLocaleString()}</span>
          </div>
          <p className="text-xs text-primary-600 mt-1">
            {numMonths} month{numMonths > 1 ? 's' : ''} × ₹{feeAmount.toLocaleString()} = ₹{totalAmount.toLocaleString()}
          </p>
        </div>

        {/* Payment Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Date
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

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
