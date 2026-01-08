import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { type Student } from '../../types/student';

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (student: Partial<Student>) => void;
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
    batch: 'Not Assigned',
    referredBy: '',
    enrollmentDate: new Date().toISOString().split('T')[0],
  });

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
        batch: student.batch || 'Not Assigned',
        referredBy: student.referredBy || '',
        enrollmentDate: student.enrollmentDate ? new Date(student.enrollmentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      });
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
        batch: 'Not Assigned',
        referredBy: '',
        enrollmentDate: new Date().toISOString().split('T')[0],
      });
    }
  }, [student, mode, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <Input
              label="Email *"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
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

            <Input
              label="Batch"
              name="batch"
              value={formData.batch}
              onChange={handleChange}
              placeholder="e.g., 2024-A, Jan 2025, Morning Batch"
            />

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
          <Button type="submit" variant="primary" className="w-full sm:w-auto">
            {mode === 'create' ? 'Add Student' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default StudentModal;
