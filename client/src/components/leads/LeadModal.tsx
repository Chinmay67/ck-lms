import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import type { Lead, LeadStatus, LeadSource } from '../../types/lead';
import { ALL_LEAD_SOURCES, LEAD_STATUS_LABELS, LEAD_SOURCE_LABELS, MUTABLE_LEAD_STATUSES } from '../../types/lead';
import type { Course } from '../../types/course';
import { CourseAPI } from '../../services/api';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Lead>) => Promise<void>;
  lead?: Lead | null;
  mode: 'create' | 'edit';
}

const selectCls =
  'w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary transition-all text-sm';

const sectionTitle = 'text-base font-semibold text-text-primary mb-3 pb-2 border-b border-white/7';

const LeadModal = ({ isOpen, onClose, onSubmit, lead, mode }: LeadModalProps) => {
  const [submitting, setSubmitting] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);

  const blank = {
    name: '',
    phone: '',
    email: '',
    childName: '',
    childAge: '' as string | number,
    interestedCourseId: '',
    interestedStageName: '',
    source: 'other' as LeadSource,
    status: 'new' as LeadStatus,
    notes: '',
    followUpDate: '',
  };

  const [form, setForm] = useState(blank);

  // Selected course object — to derive stages dropdown
  const selectedCourse = courses.find(
    (c) => (c.id || c._id) === form.interestedCourseId,
  ) ?? null;
  const statusOptions = form.status === 'converted'
    ? (['converted'] as LeadStatus[])
    : MUTABLE_LEAD_STATUSES;

  // Load courses once on open
  useEffect(() => {
    if (!isOpen) return;
    CourseAPI.getCourses(true)
      .then((res) => { if (res.success && res.data) setCourses(res.data); })
      .catch(console.error);
  }, [isOpen]);

  // Populate form when editing
  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && lead) {
      const courseId =
        typeof lead.interestedCourseId === 'object' && lead.interestedCourseId
          ? (lead.interestedCourseId as any)._id ?? ''
          : (lead.interestedCourseId as string) ?? '';
      setForm({
        name: lead.name,
        phone: lead.phone ?? '',
        email: lead.email ?? '',
        childName: lead.childName ?? '',
        childAge: lead.childAge ?? '',
        interestedCourseId: courseId,
        interestedStageName: lead.interestedStageName ?? '',
        source: lead.source,
        status: lead.status,
        notes: lead.notes ?? '',
        followUpDate: lead.followUpDate
          ? new Date(lead.followUpDate).toISOString().split('T')[0]
          : '',
      });
    } else {
      setForm(blank);
    }
  }, [isOpen, lead, mode]);

  // When course changes, clear stage name if not valid
  const handleCourseChange = (courseId: string) => {
    setForm((prev) => ({ ...prev, interestedCourseId: courseId, interestedStageName: '' }));
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.phone.trim() && !form.email.trim()) {
      alert('Please provide at least one contact method (phone or email)');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        childName: form.childName.trim() || undefined,
        childAge: form.childAge !== '' ? Number(form.childAge) : undefined,
        interestedCourseId: form.interestedCourseId || undefined,
        interestedStageName: form.interestedStageName.trim() || undefined,
        source: form.source,
        status: form.status,
        notes: form.notes.trim() || undefined,
        followUpDate: form.followUpDate || undefined,
      } as Partial<Lead>);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'Add New Lead' : 'Edit Lead'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Contact */}
        <div>
          <h4 className={sectionTitle}>Contact Information</h4>
          <p className="text-xs text-text-secondary mb-3">At least one of phone or email is required</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Input
                label="Contact Name *"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="Parent / guardian name"
              />
            </div>
            <Input
              label="Phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="+91-9876543210"
            />
            <Input
              label="Email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="parent@example.com"
            />
          </div>
        </div>

        {/* Child */}
        <div>
          <h4 className={sectionTitle}>Child Information</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Child's Name"
              name="childName"
              value={form.childName}
              onChange={handleChange}
              placeholder="Name of the child"
            />
            <Input
              label="Child's Age"
              name="childAge"
              type="number"
              value={form.childAge === '' ? '' : String(form.childAge)}
              onChange={handleChange}
              placeholder="e.g., 10"
            />
          </div>
        </div>

        {/* Interest */}
        <div>
          <h4 className={sectionTitle}>Interest & Source</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Interested Course</label>
              <select
                name="interestedCourseId"
                value={form.interestedCourseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                className={selectCls}
              >
                <option value="">Not specified</option>
                {courses.map((c) => (
                  <option key={c.id || c._id} value={c.id || c._id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Interested Stage</label>
              {selectedCourse && (selectedCourse.stages ?? []).length > 0 ? (
                <select
                  name="interestedStageName"
                  value={form.interestedStageName}
                  onChange={handleChange}
                  className={selectCls}
                >
                  <option value="">Not specified</option>
                  {(selectedCourse.stages ?? []).map((s) => (
                    <option key={s.stageNumber} value={s.stageName}>
                      {s.stageName}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  name="interestedStageName"
                  value={form.interestedStageName}
                  onChange={handleChange}
                  placeholder="e.g., Beginner"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Source</label>
              <select name="source" value={form.source} onChange={handleChange} className={selectCls}>
                {ALL_LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Status</label>
              <select name="status" value={form.status} onChange={handleChange} className={selectCls} disabled={form.status === 'converted'}>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Follow-up & Notes */}
        <div>
          <h4 className={sectionTitle}>Follow-up & Notes</h4>
          <div className="space-y-3">
            <Input
              label="Follow-up Date"
              name="followUpDate"
              type="date"
              value={form.followUpDate}
              onChange={handleChange}
            />
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Notes / Requirements
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                placeholder="Any specific requirements, questions asked, or relevant context…"
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface text-text-primary placeholder:text-text-tertiary transition-all text-sm"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-white/7">
          <Button type="button" variant="ghost" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={submitting}>
            {submitting ? 'Saving…' : mode === 'create' ? 'Add Lead' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default LeadModal;
