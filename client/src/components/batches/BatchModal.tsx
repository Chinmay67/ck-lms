import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import type { Batch, CreateBatchData, UpdateBatchData, ScheduleEntry } from '../../types/batch';
import { BatchAPI } from '../../services/api';
import { DAY_NAMES, STAGE_OPTIONS, LEVEL_OPTIONS } from '../../types/batch';

interface BatchModalProps {
  batch: Batch | null;
  onClose: () => void;
  onSuccess: () => void;
}

const BatchModal: React.FC<BatchModalProps> = ({ batch, onClose, onSuccess }) => {
  const isEdit = !!batch;
  
  const [formData, setFormData] = useState<CreateBatchData | UpdateBatchData>({
    batchName: batch?.batchName || '',
    batchCode: batch?.batchCode || '',
    stage: batch?.stage || 'beginner',
    level: batch?.level || 1,
    maxStudents: batch?.maxStudents || null,
    schedule: batch?.schedule || [],
    status: batch?.status || 'draft',
    startDate: batch?.startDate ? new Date(batch.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    endDate: batch?.endDate ? new Date(batch.endDate).toISOString().split('T')[0] : '',
    description: batch?.description || ''
  });

  const [scheduleItems, setScheduleItems] = useState<ScheduleEntry[]>(
    batch?.schedule || []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const addScheduleItem = () => {
    setScheduleItems([...scheduleItems, { dayOfWeek: 1, startTime: '10:00' }]);
  };

  const updateScheduleItem = (index: number, field: keyof ScheduleEntry, value: any) => {
    const updated = [...scheduleItems];
    updated[index] = { ...updated[index], [field]: value };
    setScheduleItems(updated);
  };

  const removeScheduleItem = (index: number) => {
    setScheduleItems(scheduleItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        ...formData,
        schedule: scheduleItems,
        maxStudents: formData.maxStudents === null || formData.maxStudents === undefined ? null : Number(formData.maxStudents),
        endDate: formData.endDate || null
      };

      let response;
      if (isEdit && batch) {
        response = await BatchAPI.updateBatch(batch.id, payload as UpdateBatchData);
      } else {
        response = await BatchAPI.createBatch(payload as CreateBatchData);
      }

      if (response.success) {
        onSuccess();
      } else {
        setError(response.error || 'Operation failed');
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
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
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

        {/* Stage and Level */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stage *
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.stage}
              onChange={(e) => handleInputChange('stage', e.target.value)}
              required
            >
              {STAGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Level *
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.level}
              onChange={(e) => handleInputChange('level', parseInt(e.target.value))}
              required
            >
              {LEVEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Capacity and Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Students
            </label>
            <Input
              type="number"
              value={formData.maxStudents || ''}
              onChange={(e) => handleInputChange('maxStudents', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="Leave empty for unlimited"
              min="1"
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty for unlimited capacity</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status *
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <Input
              type="date"
              value={formData.endDate || ''}
              onChange={(e) => handleInputChange('endDate', e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty for ongoing batch</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            rows={3}
            placeholder="Optional description for this batch"
          />
        </div>

        {/* Schedule */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium text-gray-700">
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

          {scheduleItems.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
              No schedule set. Click "Add Session" to add class timings.
            </p>
          ) : (
            <div className="space-y-2">
              {scheduleItems.map((item, index) => (
                <div key={index} className="flex gap-2 items-center bg-gray-50 p-3 rounded-lg">
                  <select
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
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
