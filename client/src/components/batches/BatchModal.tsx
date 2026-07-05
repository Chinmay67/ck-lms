import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import type { Batch, CreateBatchData, UpdateBatchData, ScheduleEntry } from '../../types/batch';
import type { Course } from '../../types/course';
import { BatchAPI, CourseAPI } from '../../services/api';
import { DAY_NAMES } from '../../types/batch';

interface BatchModalProps {
  batch: Batch | null;
  onClose: () => void;
  onSuccess: () => void;
}

const BatchModal: React.FC<BatchModalProps> = ({ batch, onClose, onSuccess }) => {
  const isEdit = !!batch;

  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);

  const [formData, setFormData] = useState<{
    batchName: string;
    batchCode: string;
    courseId: string;
    stageNumber: number | '';
    levelNumber: number | '';
    maxStudents: number | null;
    schedule: ScheduleEntry[];
    status: string;
    startDate: string;
    endDate: string;
    description: string;
  }>({
    batchName: batch?.batchName || '',
    batchCode: batch?.batchCode || '',
    courseId: (batch as any)?.courseId?._id ?? (batch as any)?.courseId ?? '',
    stageNumber: (batch as any)?.stageNumber ?? '',
    levelNumber: (batch as any)?.levelNumber ?? '',
    maxStudents: batch?.maxStudents || null,
    schedule: batch?.schedule || [],
    status: batch?.status || 'draft',
    startDate: batch?.startDate ? new Date(batch.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    endDate: batch?.endDate ? new Date(batch.endDate).toISOString().split('T')[0] : '',
    description: batch?.description || '',
  });

  const selectedCourse = courses.find((c) => (c.id || c._id) === formData.courseId) ?? null;
  const selectedStage = selectedCourse?.stages?.find((s) => s.stageNumber === Number(formData.stageNumber)) ?? null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load courses on mount
  useEffect(() => {
    setLoadingCourses(true);
    CourseAPI.getCourses(true)
      .then((res) => { if (res.success && res.data) setCourses(res.data); })
      .catch(console.error)
      .finally(() => setLoadingCourses(false));
  }, []);

  const handleInputChange = (field: string, value: any) => {
    if (field === 'courseId') {
      setFormData((prev) => ({ ...prev, courseId: value, stageNumber: '', levelNumber: '' }));
    } else if (field === 'stageNumber') {
      setFormData((prev) => ({ ...prev, stageNumber: value ? Number(value) : '', levelNumber: '' }));
    } else {
      setFormData((prev: any) => ({ ...prev, [field]: value }));
    }
  };

  const addScheduleItem = () => {
    setFormData((prev) => ({ ...prev, schedule: [...prev.schedule, { dayOfWeek: 1, startTime: '10:00' }] }));
  };

  const updateScheduleItem = (index: number, field: keyof ScheduleEntry, value: any) => {
    const updated = [...formData.schedule];
    updated[index] = { ...updated[index], [field]: value };
    setFormData((prev) => ({ ...prev, schedule: updated }));
  };

  const removeScheduleItem = (index: number) => {
    setFormData((prev) => ({ ...prev, schedule: prev.schedule.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.courseId) { setError('Please select a course'); return; }
    if (!formData.stageNumber) { setError('Please select a stage'); return; }
    if (!formData.levelNumber) { setError('Please select a level'); return; }

    setLoading(true);
    try {
      const payload = {
        batchName: formData.batchName,
        batchCode: formData.batchCode,
        courseId: formData.courseId,
        stageNumber: Number(formData.stageNumber),
        levelNumber: Number(formData.levelNumber),
        maxStudents: formData.maxStudents == null ? null : Number(formData.maxStudents),
        schedule: formData.schedule,
        status: formData.status,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
        description: formData.description,
      };

      let response;
      if (isEdit && batch) {
        const { courseId: _cid, stageNumber: _sn, levelNumber: _ln, ...updatePayload } = payload;
        response = await BatchAPI.updateBatch(batch.id, updatePayload as UpdateBatchData);
      } else {
        response = await BatchAPI.createBatch(payload as unknown as CreateBatchData);
      }

      if (response.success) {
        onSuccess();
      } else {
        setError((response as any).error || 'Operation failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isEdit ? 'Edit Batch' : 'Create New Batch'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-error-600/10 border border-red-200 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Batch Name *
            </label>
            <Input
              type="text"
              value={formData.batchName}
              onChange={(e) => handleInputChange('batchName', e.target.value)}
              required
              placeholder="e.g., Morning Batch A"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Batch Code *
            </label>
            <Input
              type="text"
              value={formData.batchCode}
              onChange={(e) => handleInputChange('batchCode', e.target.value)}
              required
              placeholder="e.g., BEG1-2024"
              disabled={isEdit}
            />
          </div>
        </div>

        {/* Program, Stage, Level */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Program *</label>
            <select
              className="w-full border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
              value={formData.courseId}
              onChange={(e) => handleInputChange('courseId', e.target.value)}
              required
              disabled={isEdit}
            >
              <option value="">{loadingCourses ? 'Loading…' : 'Select program'}</option>
              {courses.map((c) => (
                <option key={c.id || c._id} value={c.id || c._id}>{c.displayName}</option>
              ))}
            </select>
            {isEdit && <p className="text-xs text-text-tertiary mt-1">Program cannot be changed after creation.</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Stage *</label>
            <select
              className="w-full border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
              value={formData.stageNumber}
              onChange={(e) => handleInputChange('stageNumber', e.target.value)}
              required
              disabled={!selectedCourse || isEdit}
            >
              <option value="">Select stage</option>
              {(selectedCourse?.stages ?? []).map((s) => (
                <option key={s.stageNumber} value={s.stageNumber}>{s.stageName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Level *</label>
            <select
              className="w-full border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
              value={formData.levelNumber}
              onChange={(e) => handleInputChange('levelNumber', e.target.value ? Number(e.target.value) : '')}
              required
              disabled={!selectedStage || isEdit}
            >
              <option value="">Select level</option>
              {(selectedStage?.levels ?? []).map((l) => (
                <option key={l.levelNumber} value={l.levelNumber}>
                  Level {l.levelNumber} — ₹{l.feeAmount.toLocaleString()}/mo
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Capacity and Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Max Students
            </label>
            <Input
              type="number"
              value={formData.maxStudents || ''}
              onChange={(e) => handleInputChange('maxStudents', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Leave empty for unlimited"
              min="1"
            />
            <p className="text-xs text-text-tertiary mt-1">Leave empty for unlimited capacity</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Status *
            </label>
            <select
              className="w-full border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-400"
              value={formData.status}
              onChange={(e) => handleInputChange('status', e.target.value)}
              required
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
            </select>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Start Date *
            </label>
            <Input
              type="date"
              value={formData.startDate}
              onChange={(e) => handleInputChange('startDate', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              End Date
            </label>
            <Input
              type="date"
              value={formData.endDate || ''}
              onChange={(e) => handleInputChange('endDate', e.target.value)}
            />
            <p className="text-xs text-text-tertiary mt-1">Leave empty for ongoing batch</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Description
          </label>
          <textarea
            className="w-full border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-400"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            rows={3}
            placeholder="Optional description for this batch"
          />
        </div>

        {/* Schedule */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-xs font-medium text-text-secondary">
              Schedule
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addScheduleItem}
            >
              Add Session
            </Button>
          </div>

          {formData.schedule.length === 0 ? (
            <p className="text-sm text-text-tertiary text-center py-4 bg-surface-alt rounded-lg">
              No schedule set. Click "Add Session" to add class timings.
            </p>
          ) : (
            <div className="space-y-2">
              {formData.schedule.map((item, index) => (
                <div key={index} className="flex gap-2 items-center bg-surface-alt p-3 rounded-lg">
                  <select
                    className="flex-1 border border-white/10 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
                    value={item.dayOfWeek}
                    onChange={(e) => updateScheduleItem(index, 'dayOfWeek', parseInt(e.target.value))}
                  >
                    {Object.entries(DAY_NAMES).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>

                  <Input
                    type="time"
                    value={item.startTime}
                    onChange={(e) => updateScheduleItem(index, 'startTime', e.target.value)}
                    className="flex-1"
                  />

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => removeScheduleItem(index)}
                    className="text-red-600 hover:text-red-400"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading}
          >
            {loading ? 'Saving...' : (isEdit ? 'Update Batch' : 'Create Batch')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default BatchModal;
