import { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { type Student, type StudentUpdate } from '../../types/student';
import { type Batch } from '../../types/batch';
import { BatchAPI } from '../../services/api';

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (student: StudentUpdate) => void;
  student?: Student | null;
  mode: 'create' | 'edit';
}

const StudentModal = ({ isOpen, onClose, onSubmit, student, mode }: StudentModalProps) => {
  const [formData, setFormData] = useState<Partial<Student>>({
    studentName: '',
    email: '',
    phone: '',
    dob: '',
    parentName: '',
    alternatePhone: '',
    alternateEmail: '',
    address: '',
    stage: 'beginner',
    level: 1,
    batchId: null,
    batch: 'Not Assigned',
    referredBy: '',
    enrollmentDate: new Date().toISOString().split('T')[0],
  });

  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  
  // Track original stage/level for edit mode to detect changes
  const [originalStage, setOriginalStage] = useState<string | null>(null);
  const [originalLevel, setOriginalLevel] = useState<number | null>(null);
  
  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<Partial<Student> | null>(null);
  const [changeType, setChangeType] = useState<'progression' | 'correction'>('progression');
  
  // Debounce timeout ref
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch batches filtered by stage/level with debouncing
  const fetchBatchesForStageLevel = async (stage: string, level: number) => {
    try {
      setLoadingBatches(true);
      const response = await BatchAPI.getAvailableBatches(
        stage as 'beginner' | 'intermediate' | 'advanced',
        level
      );
      if (response.success && response.data) {
        setBatches(response.data);
      } else {
        setBatches([]);
      }
    } catch (err) {
      console.error('Failed to fetch batches:', err);
      setBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  // Debounced effect to fetch batches when stage/level changes
  useEffect(() => {
    if (!isOpen) return;
    
    // Clear previous timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Debounce the fetch call by 300ms
    debounceTimeoutRef.current = setTimeout(() => {
      if (formData.stage && formData.level) {
        fetchBatchesForStageLevel(formData.stage, formData.level as number);
      }
    }, 300);
    
    // Cleanup on unmount
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [isOpen, formData.stage, formData.level]);

  useEffect(() => {
    if (student && mode === 'edit') {
      setFormData({
        studentName: student.studentName,
        email: student.email,
        phone: student.phone || '',
        dob: student.dob || '',
        parentName: student.parentName || '',
        alternatePhone: student.alternatePhone || '',
        alternateEmail: student.alternateEmail || '',
        address: student.address || '',
        stage: student.stage || 'beginner',
        level: student.level || 1,
        batchId: student.batchId || null,
        batch: student.batch || 'Not Assigned',
        referredBy: student.referredBy || '',
        enrollmentDate: student.enrollmentDate ? new Date(student.enrollmentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      });
      // Store original values for change detection
      setOriginalStage(student.stage || 'beginner');
      setOriginalLevel(student.level || 1);
    } else {
      setFormData({
        studentName: '',
        email: '',
        phone: '',
        dob: '',
        parentName: '',
        alternatePhone: '',
        alternateEmail: '',
        address: '',
        stage: 'beginner',
        level: 1,
        batchId: null,
        batch: 'Not Assigned',
        referredBy: '',
        enrollmentDate: new Date().toISOString().split('T')[0],
      });
      // Reset original values for create mode
      setOriginalStage(null);
      setOriginalLevel(null);
    }
    // Reset confirmation dialog state
    setShowConfirmDialog(false);
    setPendingFormData(null);
    setChangeType('progression');
  }, [student, mode, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // If stage or level changes, clear the batch selection
    if (name === 'stage' || name === 'level') {
      setFormData((prev) => ({ 
        ...prev, 
        [name]: name === 'level' ? parseInt(value) : value,
        batchId: null,
        batch: 'Not Assigned'
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Check if stage or level has changed from original (edit mode only)
  const hasStageLevelChanged = (): boolean => {
    if (mode !== 'edit' || originalStage === null || originalLevel === null) {
      return false;
    }
    return formData.stage !== originalStage || formData.level !== originalLevel;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate: Must have at least email OR phone
    if (!formData.email && !formData.phone) {
      alert('Please provide at least one contact method (email or phone)');
      return;
    }
    
    // If stage/level changed in edit mode, show confirmation dialog
    if (hasStageLevelChanged()) {
      setPendingFormData(formData);
      setShowConfirmDialog(true);
      return;
    }
    
    onSubmit(formData);
    onClose();
  };

  const handleConfirmStageLevelChange = () => {
    if (pendingFormData) {
      // Include changeType in the form data
      onSubmit({ ...pendingFormData, changeType });
      onClose();
    }
    setShowConfirmDialog(false);
    setPendingFormData(null);
    setChangeType('progression');
  };

  const handleCancelStageLevelChange = () => {
    setShowConfirmDialog(false);
    setPendingFormData(null);
    setChangeType('progression');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Add New Student' : 'Edit Student'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
        {/* Personal Information */}
        <div>
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 md:mb-4 pb-2 border-b border-primary-100">Personal Information</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <Input
              label="Student Name *"
              name="studentName"
              value={formData.studentName}
              onChange={handleChange}
              required
              placeholder="Enter full name"
            />

            <Input
              label="Date of Birth"
              name="dob"
              type="date"
              value={formData.dob}
              onChange={handleChange}
            />

            <Input
              label="Enrollment Date *"
              name="enrollmentDate"
              type="date"
              value={formData.enrollmentDate}
              onChange={handleChange}
              required
            />

            <Input
              label="Parent Name"
              name="parentName"
              value={formData.parentName}
              onChange={handleChange}
              placeholder="Enter parent/guardian name"
            />
          </div>
        </div>

        {/* Contact Information */}
        <div>
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 md:mb-4 pb-2 border-b border-primary-100">Contact Information</h4>
          <p className="text-sm text-text-secondary mb-3">At least one contact method (email or phone) is required</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <Input
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="student@example.com"
            />

            <Input
              label="Phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+91-9876543210"
            />

            <Input
              label="Alternate Email"
              name="alternateEmail"
              type="email"
              value={formData.alternateEmail}
              onChange={handleChange}
              placeholder="alternate@example.com"
            />

            <Input
              label="Alternate Phone"
              name="alternatePhone"
              type="tel"
              value={formData.alternatePhone}
              onChange={handleChange}
              placeholder="+91-9876543211"
            />
          </div>

          <div className="mt-3 md:mt-4 sm:col-span-2">
            <label className="block text-sm font-medium text-text-primary mb-1">
              Address
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows={3}
              placeholder="Enter full address"
              className="w-full px-3 md:px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-text-primary placeholder:text-text-tertiary transition-all"
            />
          </div>
        </div>

        {/* Academic Information */}
        <div>
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 md:mb-4 pb-2 border-b border-primary-100">Academic Information</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Stage *
              </label>
              <select
                name="stage"
                value={formData.stage}
                onChange={handleChange}
                required
                className="w-full px-3 md:px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-text-primary transition-all"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Level *
              </label>
              <select
                name="level"
                value={formData.level}
                onChange={handleChange}
                required
                className="w-full px-3 md:px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-text-primary transition-all"
              >
                <option value={1}>Level 1</option>
                <option value={2}>Level 2</option>
                <option value={3}>Level 3</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Batch
              </label>
              <select
                name="batchId"
                value={formData.batchId || ''}
                onChange={handleChange}
                className="w-full px-3 md:px-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-text-primary transition-all"
              >
                <option value="">Not Assigned</option>
                {loadingBatches ? (
                  <option disabled>Loading batches...</option>
                ) : batches.length === 0 ? (
                  <option disabled>No compatible batches for {formData.stage} Level {formData.level}</option>
                ) : (
                  batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batchName} ({batch.batchCode})
                      {batch.maxStudents && ` (${batch.currentStudentCount || 0}/${batch.maxStudents})`}
                    </option>
                  ))
                )}
              </select>
              {/* Info message about credits when no batch is selected */}
              {!formData.batchId && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    <span className="font-medium">💡 No batch selected:</span> Fee records won't be generated until a batch is assigned. Any payments received will be stored as <span className="font-semibold">credits</span> and automatically applied when the student joins a batch.
                  </p>
                </div>
              )}
              {/* Warning when stage/level changed but no batch selected - only show if student had a batch before */}
              {hasStageLevelChanged() && !formData.batchId && !!student?.batchId && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700">
                    <span className="font-medium">⚠️ Batch required:</span> When changing stage or level, you must select a compatible batch. Upcoming unpaid fees will be deleted and new fees will be generated.
                  </p>
                </div>
              )}
            </div>

            <Input
              label="Referred By"
              name="referredBy"
              value={formData.referredBy}
              onChange={handleChange}
              placeholder="e.g., Friend, Online Ad, School Program"
            />
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 pt-4 border-t border-primary-100">
          <Button type="button" variant="ghost" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="primary" 
            className="w-full sm:w-auto"
            disabled={hasStageLevelChanged() && !formData.batchId && !!student?.batchId}
          >
            {mode === 'create' ? 'Add Student' : 'Save Changes'}
          </Button>
        </div>
      </form>

      {/* Confirmation Dialog for Stage/Level Change */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Confirm Stage/Level Change</h3>
            </div>

            <div className="mb-6 space-y-4">
              <p className="text-sm text-gray-600">
                You are changing the student from <span className="font-semibold">{originalStage} Level {originalLevel}</span> to <span className="font-semibold">{formData.stage} Level {formData.level}</span>.
              </p>

              {/* Change Type Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-900">
                  What type of change is this?
                </label>

                <div className="space-y-3">
                  {/* Progression Option */}
                  <label className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    changeType === 'progression'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="changeType"
                      value="progression"
                      checked={changeType === 'progression'}
                      onChange={(e) => setChangeType(e.target.value as 'progression')}
                      className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">Student Progression</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        Student completed {originalStage} Level {originalLevel} and is moving to the next level
                      </p>
                      <ul className="text-xs text-gray-500 mt-2 space-y-1">
                        <li>✓ Keeps all paid fees (student correctly paid for previous level)</li>
                        <li>✓ Deletes only unpaid upcoming fees</li>
                        <li>✓ Generates new fees at new level rate</li>
                      </ul>
                    </div>
                  </label>

                  {/* Correction Option */}
                  <label className={`relative flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    changeType === 'correction'
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="changeType"
                      value="correction"
                      checked={changeType === 'correction'}
                      onChange={(e) => setChangeType(e.target.value as 'correction')}
                      className="mt-1 h-4 w-4 text-amber-600 border-gray-300 focus:ring-amber-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">Data Correction</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          Use with caution
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        Student was assigned wrong course/level from the start
                      </p>
                      <ul className="text-xs text-gray-500 mt-2 space-y-1">
                        <li>✓ Converts all paid fees to student credits</li>
                        <li>✓ Deletes all upcoming fees (paid and unpaid)</li>
                        <li>✓ Generates new fees at correct rate</li>
                        <li>✓ Auto-applies credits to new fees</li>
                      </ul>
                    </div>
                  </label>
                </div>
              </div>

              {/* Warning Box */}
              <div className={`rounded-lg p-3 border ${
                changeType === 'progression'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <p className={`text-xs font-medium ${
                  changeType === 'progression' ? 'text-blue-800' : 'text-amber-800'
                }`}>
                  {changeType === 'progression' ? 'Note:' : 'Important:'}
                </p>
                <p className={`text-xs mt-1 ${
                  changeType === 'progression' ? 'text-blue-700' : 'text-amber-700'
                }`}>
                  {changeType === 'progression'
                    ? 'Historical fees remain unchanged. Only future unpaid fees will be adjusted.'
                    : 'If student has paid for future months at the wrong rate, those amounts will be converted to credits and reapplied. Student may owe a difference if new rate is higher.'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancelStageLevelChange}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmStageLevelChange}
              >
                Confirm {changeType === 'progression' ? 'Progression' : 'Correction'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default StudentModal;
