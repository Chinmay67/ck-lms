import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { AdminBatchesAPI, AdminLeadsAPI, CourseAPI } from '../../services/api';
import type { Batch } from '../../types/batch';
import type { Course } from '../../types/course';
import type { Lead } from '../../types/lead';

interface ConvertLeadModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onConverted: () => void;
}

const selectCls =
  'w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all text-sm';

function getLeadCourseId(lead: Lead | null): string {
  if (!lead?.interestedCourseId) return '';
  if (typeof lead.interestedCourseId === 'string') return lead.interestedCourseId;
  return lead.interestedCourseId._id;
}

export default function ConvertLeadModal({ isOpen, lead, onClose, onConverted }: ConvertLeadModalProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    studentName: '',
    parentName: '',
    phone: '',
    email: '',
    enrollmentDate: new Date().toISOString().split('T')[0],
    courseId: '',
    stageNumber: '',
    levelNumber: '',
    batchId: '',
    monthlyFee: '',
    createFirstFeeRecord: true,
  });

  const selectedCourse = useMemo(
    () => courses.find((course) => (course.id || course._id) === form.courseId) ?? null,
    [courses, form.courseId],
  );
  const selectedStage = selectedCourse?.stages?.find((stage) => stage.stageNumber === Number(form.stageNumber)) ?? null;
  const selectedLevel = selectedStage?.levels?.find((level) => level.levelNumber === Number(form.levelNumber)) ?? null;

  useEffect(() => {
    if (!isOpen) return;
    setLoadingCourses(true);
    CourseAPI.getCourses(true)
      .then((res) => {
        if (res.success && res.data) setCourses(res.data);
      })
      .catch(() => toast.error('Failed to load courses'))
      .finally(() => setLoadingCourses(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !lead) return;
    setForm({
      studentName: lead.childName ?? '',
      parentName: lead.name ?? '',
      phone: lead.phone ?? '',
      email: lead.email ?? '',
      enrollmentDate: new Date().toISOString().split('T')[0],
      courseId: getLeadCourseId(lead),
      stageNumber: '',
      levelNumber: '',
      batchId: '',
      monthlyFee: '',
      createFirstFeeRecord: true,
    });
  }, [isOpen, lead]);

  useEffect(() => {
    if (!selectedCourse || !lead?.interestedStageName || form.stageNumber) return;
    const matchedStage = selectedCourse.stages?.find(
      (stage) => stage.stageName.toLowerCase() === lead.interestedStageName?.toLowerCase(),
    );
    if (matchedStage) {
      const firstLevel = matchedStage.levels[0];
      setForm((prev) => ({
        ...prev,
        stageNumber: String(matchedStage.stageNumber),
        levelNumber: firstLevel ? String(firstLevel.levelNumber) : '',
        monthlyFee: firstLevel ? String(firstLevel.feeAmount) : prev.monthlyFee,
      }));
    }
  }, [form.stageNumber, lead?.interestedStageName, selectedCourse]);

  useEffect(() => {
    if (!selectedLevel) return;
    setForm((prev) => ({ ...prev, monthlyFee: String(selectedLevel.feeAmount) }));
  }, [selectedLevel]);

  useEffect(() => {
    if (!form.courseId || !form.stageNumber || !form.levelNumber) {
      setBatches([]);
      return;
    }
    setLoadingBatches(true);
    AdminBatchesAPI.list({
      courseId: form.courseId,
      stageNumber: Number(form.stageNumber),
      levelNumber: Number(form.levelNumber),
      status: 'active',
    })
      .then((res) => {
        if (res.success && res.data) setBatches(res.data);
      })
      .catch(() => toast.error('Failed to load batches'))
      .finally(() => setLoadingBatches(false));
  }, [form.courseId, form.stageNumber, form.levelNumber]);

  const handleCourseChange = (courseId: string) => {
    setForm((prev) => ({
      ...prev,
      courseId,
      stageNumber: '',
      levelNumber: '',
      batchId: '',
      monthlyFee: '',
    }));
  };

  const handleStageChange = (stageNumber: string) => {
    const stage = selectedCourse?.stages?.find((item) => item.stageNumber === Number(stageNumber));
    const firstLevel = stage?.levels?.[0];
    setForm((prev) => ({
      ...prev,
      stageNumber,
      levelNumber: firstLevel ? String(firstLevel.levelNumber) : '',
      batchId: '',
      monthlyFee: firstLevel ? String(firstLevel.feeAmount) : '',
    }));
  };

  const handleLevelChange = (levelNumber: string) => {
    const level = selectedStage?.levels?.find((item) => item.levelNumber === Number(levelNumber));
    setForm((prev) => ({
      ...prev,
      levelNumber,
      batchId: '',
      monthlyFee: level ? String(level.feeAmount) : prev.monthlyFee,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lead) return;
    const leadId = lead.id || lead._id;
    if (!form.studentName.trim()) return toast.error('Student name is required');
    if (!form.phone.trim() && !form.email.trim()) return toast.error('Phone or email is required');
    if (!form.courseId || !form.stageNumber || !form.levelNumber || !form.monthlyFee) {
      return toast.error('Course, stage, level and fee are required');
    }

    setSubmitting(true);
    try {
      const res = await AdminLeadsAPI.convert(leadId, {
        studentName: form.studentName.trim(),
        parentName: form.parentName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        enrollmentDate: form.enrollmentDate,
        courseId: form.courseId,
        stageNumber: Number(form.stageNumber),
        levelNumber: Number(form.levelNumber),
        batchId: form.batchId || undefined,
        monthlyFee: Number(form.monthlyFee),
        createFirstFeeRecord: !!form.batchId && form.createFirstFeeRecord,
        firstMonthFee: Number(form.monthlyFee),
      });
      if (res.success) {
        toast.success('Lead converted to student');
        onConverted();
      } else {
        toast.error((res as any).error || 'Failed to convert lead');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'Failed to convert lead');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Convert Lead" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Student Name *"
            value={form.studentName}
            onChange={(e) => setForm((prev) => ({ ...prev, studentName: e.target.value }))}
            required
          />
          <Input
            label="Parent Name"
            value={form.parentName}
            onChange={(e) => setForm((prev) => ({ ...prev, parentName: e.target.value }))}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          <Input
            label="Enrollment Date"
            type="date"
            value={form.enrollmentDate}
            onChange={(e) => setForm((prev) => ({ ...prev, enrollmentDate: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Course *</label>
            <select
              value={form.courseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              className={selectCls}
              disabled={loadingCourses}
              required
            >
              <option value="">Select course</option>
              {courses.map((course) => (
                <option key={course.id || course._id} value={course.id || course._id}>
                  {course.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Stage *</label>
            <select
              value={form.stageNumber}
              onChange={(e) => handleStageChange(e.target.value)}
              className={selectCls}
              disabled={!selectedCourse}
              required
            >
              <option value="">Select stage</option>
              {(selectedCourse?.stages ?? []).map((stage) => (
                <option key={stage.stageNumber} value={stage.stageNumber}>
                  {stage.stageName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Level *</label>
            <select
              value={form.levelNumber}
              onChange={(e) => handleLevelChange(e.target.value)}
              className={selectCls}
              disabled={!selectedStage}
              required
            >
              <option value="">Select level</option>
              {(selectedStage?.levels ?? []).map((level) => (
                <option key={level.levelNumber} value={level.levelNumber}>
                  Level {level.levelNumber}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Monthly Fee *"
            type="number"
            value={form.monthlyFee}
            onChange={(e) => setForm((prev) => ({ ...prev, monthlyFee: e.target.value }))}
            required
          />
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-text-primary mb-1">Batch</label>
            <select
              value={form.batchId}
              onChange={(e) => setForm((prev) => ({ ...prev, batchId: e.target.value }))}
              className={selectCls}
              disabled={!form.levelNumber || loadingBatches}
            >
              <option value="">No batch yet</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batchName} ({batch.batchCode})
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.batchId && (
          <label className="inline-flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={form.createFirstFeeRecord}
              onChange={(e) => setForm((prev) => ({ ...prev, createFirstFeeRecord: e.target.checked }))}
              className="rounded border-border text-primary-600 focus:ring-primary-500"
            />
            Create first invoice
          </label>
        )}

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-white/7">
          <Button type="button" variant="ghost" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={submitting}>
            {submitting ? 'Converting...' : 'Convert'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
