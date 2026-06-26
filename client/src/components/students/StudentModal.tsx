import { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { type Student, type StudentUpdate } from '../../types/student';
import { type Batch } from '../../types/batch';
import { type Course } from '../../types/course';
import { CourseAPI, AdminBatchesAPI } from '../../services/api';

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (student: StudentUpdate) => Promise<string | void>;
  student?: Student | null;
  mode: 'create' | 'edit';
}

const StudentModal = ({ isOpen, onClose, onSubmit, student, mode }: StudentModalProps) => {
  const [formData, setFormData] = useState<Partial<Student> & { monthlyFee?: number; grossFee?: number; discountType?: 'none' | 'percentage' | 'fixed'; discountValue?: number; discountReason?: string }>({
    studentName: '',
    email: '',
    phone: '',
    dob: '',
    parentName: '',
    alternatePhone: '',
    alternateEmail: '',
    address: '',
    courseId: null,
    stageNumber: null,
    levelNumber: null,
    batchId: null,
    referredBy: '',
    enrollmentDate: new Date().toISOString().split('T')[0],
    monthlyFee: 0,
    grossFee: 0,
    discountType: 'none',
    discountValue: 0,
    discountReason: '',
  });

  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Track originals for edit mode change detection
  const [originalCourseId, setOriginalCourseId] = useState<string | null>(null);
  const [originalStageNumber, setOriginalStageNumber] = useState<number | null>(null);
  const [originalLevelNumber, setOriginalLevelNumber] = useState<number | null>(null);

  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<(Partial<Student> & { monthlyFee?: number }) | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Debounce timeout ref
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived: selected course object
  const selectedCourse = courses.find((c) => (c.id || c._id) === formData.courseId) ?? null;
  const selectedStage = selectedCourse?.stages?.find((s) => s.stageNumber === formData.stageNumber) ?? null;
  const selectedLevel = selectedStage?.levels.find((l) => l.levelNumber === formData.levelNumber) ?? null;

  // Fetch courses on open
  useEffect(() => {
    if (!isOpen) return;
    setLoadingCourses(true);
    CourseAPI.getCourses(true)
      .then((res) => { if (res.success && res.data) setCourses(res.data); })
      .catch(console.error)
      .finally(() => setLoadingCourses(false));
  }, [isOpen]);

  // Fetch batches when courseId/stageNumber/levelNumber change (debounced)
  useEffect(() => {
    if (!isOpen) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(async () => {
      if (!formData.courseId || formData.stageNumber == null || formData.levelNumber == null) {
        setBatches([]);
        return;
      }
      try {
        setLoadingBatches(true);
        const res = await AdminBatchesAPI.list({
          courseId: formData.courseId as string,
          stageNumber: formData.stageNumber as number,
          levelNumber: formData.levelNumber as number,
          status: 'active',
        });
        setBatches(res.success && res.data ? res.data : []);
      } catch { setBatches([]); }
      finally { setLoadingBatches(false); }
    }, 300);
    return () => { if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current); };
  }, [isOpen, formData.courseId, formData.stageNumber, formData.levelNumber]);

  // Init form on open
  useEffect(() => {
    if (mode === 'edit' && student) {
      const cId = typeof student.courseId === 'object' ? (student.courseId as any)?._id ?? (student.courseId as any)?.id ?? null : student.courseId ?? null;
      const bId = typeof student.batchId === 'object' ? (student.batchId as any)?._id ?? (student.batchId as any)?.id ?? null : student.batchId ?? null;
      setFormData({
        studentName: student.studentName,
        email: student.email ?? '',
        phone: student.phone ?? '',
        dob: student.dob ?? '',
        parentName: student.parentName ?? '',
        alternatePhone: student.alternatePhone ?? '',
        alternateEmail: student.alternateEmail ?? '',
        address: student.address ?? '',
        courseId: cId,
        stageNumber: student.stageNumber ?? null,
        levelNumber: student.levelNumber ?? null,
        batchId: bId,
        referredBy: student.referredBy ?? '',
        enrollmentDate: student.enrollmentDate
          ? new Date(student.enrollmentDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        monthlyFee: 0,
      });
      setOriginalCourseId(cId);
      setOriginalStageNumber(student.stageNumber ?? null);
      setOriginalLevelNumber(student.levelNumber ?? null);
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
        courseId: null,
        stageNumber: null,
        levelNumber: null,
        batchId: null,
        referredBy: '',
        enrollmentDate: new Date().toISOString().split('T')[0],
        monthlyFee: 0,
      });
      setOriginalCourseId(null);
      setOriginalStageNumber(null);
      setOriginalLevelNumber(null);
    }
    setShowConfirmDialog(false);
    setPendingFormData(null);
    setBatches([]);
    setFormError(null);
  }, [student, mode, isOpen]);

  // Auto-fill monthlyFee and grossFee when level selected
  useEffect(() => {
    if (selectedLevel) {
      setFormData((prev) => ({
        ...prev,
        monthlyFee: selectedLevel.feeAmount,
        grossFee: selectedLevel.feeAmount,
        discountType: 'none',
        discountValue: 0,
      }));
    }
  }, [selectedLevel?.feeAmount]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'courseId') {
      setFormData((prev) => ({ ...prev, courseId: value || null, stageNumber: null, levelNumber: null, batchId: null, monthlyFee: 0 }));
    } else if (name === 'stageNumber') {
      setFormData((prev) => ({ ...prev, stageNumber: value ? parseInt(value) : null, levelNumber: null, batchId: null, monthlyFee: 0 }));
    } else if (name === 'levelNumber') {
      setFormData((prev) => ({ ...prev, levelNumber: value ? parseInt(value) : null, batchId: null }));
    } else if (name === 'monthlyFee') {
      const nextFee = parseFloat(value) || 0;
      setFormData((prev) => ({
        ...prev,
        monthlyFee: nextFee,
        discountType: 'none',
        discountValue: 0,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Check if course/stage/level changed from original (edit mode)
  const hasStageLevelChanged = (): boolean => {
    if (mode !== 'edit') return false;
    return (
      formData.courseId !== originalCourseId ||
      formData.stageNumber !== originalStageNumber ||
      formData.levelNumber !== originalLevelNumber
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.email && !formData.phone) {
      setFormError('Please provide at least one contact method (email or phone)');
      return;
    }
    if (!formData.courseId) {
      setFormError('Please select a course');
      return;
    }
    if (formData.stageNumber == null) {
      setFormError('Please select a stage');
      return;
    }
    if (formData.levelNumber == null) {
      setFormError('Please select a level');
      return;
    }

    if (hasStageLevelChanged()) {
      setPendingFormData(formData);
      setShowConfirmDialog(true);
      return;
    }

    const err = await onSubmit(formData);
    if (err) setFormError(err);
    // Modal closes only when parent's async handler succeeds (no error returned)
  };

  const handleConfirmStageLevelChange = async () => {
    if (pendingFormData) {
      const err = await onSubmit(pendingFormData);
      if (err) setFormError(err);
      // Modal closes only when parent's async handler succeeds
    }
    setShowConfirmDialog(false);
    setPendingFormData(null);
  };

  const handleCancelStageLevelChange = () => {
    setShowConfirmDialog(false);
    setPendingFormData(null);
  };

  const stageLabel = selectedStage?.stageName ?? (formData.stageNumber != null ? `Stage ${formData.stageNumber}` : null);
  const originalStageName = courses
    .flatMap((c) => c.stages ?? [])
    .find((s) => s.stageNumber === originalStageNumber)?.stageName ?? (originalStageNumber != null ? `Stage ${originalStageNumber}` : null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Add New Student' : 'Edit Student'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
        {/* Inline error banner */}
        {formError && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-error-600/10 border border-error-600/20 rounded-lg">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <p className="text-sm text-red-400">{formError}</p>
          </div>
        )}
        {/* Personal Information */}
        <div>
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 md:mb-4 pb-2 border-b border-white/7">Personal Information</h4>
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
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 md:mb-4 pb-2 border-b border-white/7">Contact Information</h4>
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
              className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-surface text-text-primary placeholder:text-text-tertiary transition-all"
            />
          </div>
        </div>

        {/* Academic Information */}
        <div>
          <h4 className="text-base md:text-lg font-semibold text-text-primary mb-3 md:mb-4 pb-2 border-b border-white/7">Academic Information</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">

            {/* Course */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-text-primary mb-1">Course *</label>
              <select
                name="courseId"
                value={typeof formData.courseId === 'string' ? formData.courseId : ''}
                onChange={handleChange}
                required
                disabled={loadingCourses || mode === 'edit'}
                className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all disabled:opacity-60"
              >
                <option value="">{loadingCourses ? 'Loading courses…' : 'Select a course'}</option>
                {courses.map((c) => (
                  <option key={c.id || c._id} value={c.id || c._id}>{c.displayName}</option>
                ))}
              </select>
              {mode === 'edit' && (
                <p className="text-xs text-text-tertiary mt-1">Course cannot be changed here — use the upgrade flow.</p>
              )}
            </div>

            {/* Stage */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Stage *</label>
              <select
                name="stageNumber"
                value={formData.stageNumber ?? ''}
                onChange={handleChange}
                required
                disabled={!selectedCourse}
                className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all disabled:opacity-60"
              >
                <option value="">Select a stage</option>
                {(selectedCourse?.stages ?? []).map((s) => (
                  <option key={s.stageNumber} value={s.stageNumber}>{s.stageName}</option>
                ))}
              </select>
            </div>

            {/* Level */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Level *</label>
              <select
                name="levelNumber"
                value={formData.levelNumber ?? ''}
                onChange={handleChange}
                required
                disabled={!selectedStage}
                className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all disabled:opacity-60"
              >
                <option value="">Select a level</option>
                {(selectedStage?.levels ?? []).map((l) => (
                  <option key={l.levelNumber} value={l.levelNumber}>Level {l.levelNumber} — ₹{l.feeAmount.toLocaleString()}/month</option>
                ))}
              </select>
            </div>

            {/* Monthly Fee (editable override) */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Monthly Fee (₹) *
              </label>
              <input
                type="number"
                name="monthlyFee"
                value={formData.monthlyFee ?? ''}
                onChange={handleChange}
                required
                min={0}
                placeholder="Auto-filled from level"
                className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all"
              />
              {/* Override warning: fee was manually changed from the course level rate */}
              {formData.grossFee != null && formData.monthlyFee != null &&
               formData.monthlyFee !== formData.grossFee &&
               (formData.discountType ?? 'none') === 'none' ? (
                <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                  Fee overridden — course rate is ₹{(formData.grossFee ?? 0).toLocaleString()}. This will be flagged on the enrollment.
                </p>
              ) : (
                <p className="text-xs text-text-tertiary mt-1">Auto-filled from level; override if a custom rate applies.</p>
              )}
            </div>

            {/* Discount */}
            <div className="sm:col-span-2 border border-white/10 rounded-lg p-3 space-y-3 bg-surface-alt">
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Discount (optional)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Type</label>
                  <select
                    value={formData.discountType ?? 'none'}
                    onChange={(e) => {
                      const nextType = e.target.value as 'none' | 'percentage' | 'fixed';
                      setFormData((prev) => ({
                        ...prev,
                        discountType: nextType,
                        discountValue: 0,
                        monthlyFee: prev.grossFee ?? prev.monthlyFee ?? 0,
                      }));
                    }}
                    className="w-full h-9 bg-surface border border-white/10 rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-400"
                  >
                    <option value="none">No discount</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed amount (₹)</option>
                  </select>
                </div>
                {formData.discountType !== 'none' && (
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      {formData.discountType === 'percentage' ? 'Discount %' : 'Discount ₹'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={formData.discountType === 'percentage' ? 100 : undefined}
                      value={formData.discountValue ?? ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const gross = formData.grossFee ?? formData.monthlyFee ?? 0;
                        const effective = formData.discountType === 'percentage'
                          ? Math.round(gross * (1 - val / 100))
                          : Math.max(0, gross - val);
                        setFormData((prev) => ({ ...prev, discountValue: val, monthlyFee: effective }));
                      }}
                      placeholder={formData.discountType === 'percentage' ? 'e.g. 10' : 'e.g. 500'}
                      className="w-full h-9 bg-surface border border-white/10 rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                    {(formData.discountValue ?? 0) > 0 && (
                      <p className="text-xs text-accent-400 mt-1">
                        Effective fee: ₹{(formData.monthlyFee ?? 0).toLocaleString()}/mo
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Reason</label>
                  <input
                    type="text"
                    value={formData.discountReason ?? ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, discountReason: e.target.value }))}
                    placeholder="e.g. Sibling discount, Scholarship"
                    className="w-full h-9 bg-surface border border-white/10 rounded-lg px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-400"
                  />
                </div>
              </div>
            </div>

            {/* Batch */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Batch</label>
              <select
                name="batchId"
                value={typeof formData.batchId === 'string' ? formData.batchId : ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, batchId: e.target.value || null }))}
                disabled={!formData.levelNumber}
                className="w-full px-3 md:px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all disabled:opacity-60"
              >
                <option value="">Not Assigned</option>
                {loadingBatches ? (
                  <option disabled>Loading batches…</option>
                ) : batches.length === 0 && formData.levelNumber ? (
                  <option disabled>No active batches for this stage/level</option>
                ) : (
                  batches.map((b: any) => (
                    <option key={b.id || b._id} value={b.id || b._id}>
                      {b.batchName} ({b.batchCode})
                      {b.maxStudents ? ` — ${b.activeStudentCount ?? b.currentStudentCount ?? 0}/${b.maxStudents} students` : ''}
                    </option>
                  ))
                )}
              </select>
              {!formData.batchId && (
                <p className="text-xs text-secondary-400 mt-1 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  💡 No batch: payments will be stored as credits until a batch is assigned.
                </p>
              )}
            </div>

            {/* Referred By */}
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
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 pt-4 border-t border-white/7">
          <Button type="button" variant="ghost" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="primary" 
            className="w-full sm:w-auto"
          >
            {mode === 'create' ? 'Add Student' : 'Save Changes'}
          </Button>
        </div>
      </form>

      {/* Confirmation Dialog for Stage/Level Change */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Confirm Stage/Level Change</h3>
            </div>

            <div className="mb-6 space-y-4">
              <p className="text-sm text-text-secondary">
                You are changing the student from{' '}
                <span className="font-semibold">{originalStageName} Level {originalLevelNumber}</span> to{' '}
                <span className="font-semibold">{stageLabel} Level {formData.levelNumber}</span>.
              </p>

              <div className="rounded-lg p-3 border bg-primary-600/10 border-blue-200">
                <p className="text-xs font-medium text-primary-300">Progression update</p>
                <p className="text-xs mt-1 text-primary-300">
                  Historical invoices stay unchanged. The current enrollment will close and a new active enrollment will start with the selected course stage, level, fee, and batch.
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
                Confirm Progression
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default StudentModal;
