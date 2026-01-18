import { FaEdit, FaPhone, FaEnvelope, FaCalendar, FaMoneyBillWave, FaExclamationTriangle, FaPowerOff, FaWhatsapp } from 'react-icons/fa';
import Badge from '../ui/Badge';
import { type Student } from '../../types/student';
import { sendWhatsAppReminder, isValidWhatsAppPhone } from '../../utils/whatsapp';

interface StudentRowProps {
  student: Student;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (student: Student) => void;
  onFees?: (student: Student) => void;
  onToggleActive?: (id: string) => void;
}

const StudentRow = ({ student, isSelected, onSelect, onEdit, onFees, onToggleActive }: StudentRowProps) => {
  const handleWhatsAppReminder = () => {
    sendWhatsAppReminder(student.studentName, student.phone, 'GyanVibe');
  };
  const getBadgeVariant = (category?: string) => {
    switch (category) {
      case 'beginner':
        return 'success';
      case 'intermediate':
        return 'warning';
      case 'advanced':
        return 'danger';
      default:
        return 'default';
    }
  };

  const getCourseDisplayName = (stage?: string) => {
    if (!stage) return '-';
    return stage.charAt(0).toUpperCase() + stage.slice(1);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <tr className={`hover:bg-surface-hover transition-colors border-b border-border ${!student.isActive ? 'bg-surface opacity-60' : ''}`}>
      {/* Checkbox */}
      <td className="px-4 py-3 w-12">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(student._id)}
          className="w-4 h-4 text-primary-600 border-border rounded focus:ring-primary-500 cursor-pointer flex-shrink-0"
        />
      </td>

      {/* Student Name */}
      <td className="px-4 py-3 w-64 min-w-[200px] max-w-[280px]">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-primary rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {student.studentName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-semibold text-text-primary text-sm truncate" title={student.studentName}>
                {student.studentName}
              </span>
              {!student.isActive && (
                <Badge variant="default" size="sm" className="flex-shrink-0">Inactive</Badge>
              )}
              {student.hasOverdueFees && student.isActive && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-error-100 text-error-700 rounded-full text-[10px] font-medium whitespace-nowrap flex-shrink-0">
                  <FaExclamationTriangle size={9} />
                  <span>Overdue</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Contact */}
      <td className="px-4 py-3 w-56 min-w-[180px] max-w-[240px]">
        <div className="space-y-1">
          {student.email && (
            <div className="flex items-center text-xs text-text-primary truncate" title={student.email}>
              <FaEnvelope className="mr-1.5 text-text-tertiary flex-shrink-0" size={11} />
              <span className="truncate">{student.email}</span>
            </div>
          )}
          {student.phone && (
            <div className="flex items-center text-xs text-text-secondary truncate" title={student.phone}>
              <FaPhone className="mr-1.5 text-text-tertiary flex-shrink-0" size={11} />
              <span className="truncate">{student.phone}</span>
            </div>
          )}
          {!student.email && !student.phone && (
            <div className="text-xs text-text-tertiary italic">
              No contact info
            </div>
          )}
        </div>
      </td>

      {/* Course */}
      <td className="px-4 py-3 w-32 min-w-[100px]">
        <div className="text-sm text-text-primary font-medium truncate" title={getCourseDisplayName(student.stage)}>
          {getCourseDisplayName(student.stage)}
        </div>
      </td>

      {/* Level */}
      <td className="px-4 py-3 w-28 min-w-[90px]">
        <div className="flex-shrink-0 inline-block">
          <Badge variant={getBadgeVariant(student.stage)} className="whitespace-nowrap">
            {student.level ? `Level ${student.level}` : '-'}
          </Badge>
        </div>
      </td>

      {/* Joined Date */}
      <td className="px-4 py-3 w-36 min-w-[120px]">
        <div className="flex items-center text-xs text-text-secondary whitespace-nowrap" title={formatDate(student.createdAt)}>
          <FaCalendar className="mr-1.5 text-text-tertiary flex-shrink-0" size={11} />
          <span className="truncate">{formatDate(student.createdAt)}</span>
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 w-40 min-w-[140px]">
        <div className="flex items-center gap-1.5 justify-end">
          {onFees && (
            <button
              onClick={() => onFees(student)}
              className="p-1.5 text-success-600 hover:bg-success-50 rounded-lg transition-all flex-shrink-0"
              title="View fees"
            >
              <FaMoneyBillWave size={14} />
            </button>
          )}
          {student.hasOverdueFees && isValidWhatsAppPhone(student.phone) && (
            <button
              onClick={handleWhatsAppReminder}
              className="p-1.5 text-success-500 hover:bg-success-50 rounded-lg transition-all flex-shrink-0"
              title="Send WhatsApp reminder"
            >
              <FaWhatsapp size={14} />
            </button>
          )}
          <button
            onClick={() => onEdit(student)}
            className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-lg transition-all flex-shrink-0"
            title="Edit student"
          >
            <FaEdit size={14} />
          </button>
          {onToggleActive && (
            <button
              onClick={() => onToggleActive(student._id)}
              className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${
                student.isActive
                  ? 'text-warning-600 hover:bg-warning-50'
                  : 'text-primary-600 hover:bg-primary-50'
              }`}
              title={student.isActive ? 'Deactivate student' : 'Activate student'}
            >
              <FaPowerOff size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

export default StudentRow;
