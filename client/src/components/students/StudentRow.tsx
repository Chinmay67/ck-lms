import { Pencil, Phone, Mail, Calendar, ExternalLink, AlertTriangle, Power, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

const StudentRow = ({ student, isSelected, onSelect, onEdit, onToggleActive }: StudentRowProps) => {
  const navigate = useNavigate();
  const handleWhatsAppReminder = () => {
    sendWhatsAppReminder(student.studentName, student.phone, 'Chess Klub');
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

  const getCourseDisplayName = () => {
    if (typeof student.courseId === 'object' && student.courseId?.displayName) return student.courseId.displayName;
    if (student.stage) return student.stage.charAt(0).toUpperCase() + student.stage.slice(1);
    if (student.stageNumber) return `Stage ${student.stageNumber}`;
    return '-';
  };

  const getStageDisplayName = () => {
    if (typeof student.courseId === 'object') {
      const stage = student.courseId?.stages?.find((s) => s.stageNumber === student.stageNumber);
      if (stage) return stage.stageName;
    }
    if (student.stage) return student.stage.charAt(0).toUpperCase() + student.stage.slice(1);
    return student.stageNumber ? `Stage ${student.stageNumber}` : '-';
  };

  const getLevelDisplayName = () => {
    const level = student.levelNumber ?? student.level ?? student.skillLevel;
    return level ? `Level ${level}` : '-';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <tr className={`group/row relative hover:bg-surface-hover transition-colors ${!student.isActive ? 'opacity-50' : ''}`}>
      {/* Checkbox */}
      <td className="px-4 py-3 w-10">
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
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {student.studentName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <button
                onClick={() => navigate(`/students/${student._id}`)}
                className="font-semibold text-text-primary text-sm truncate hover:text-primary-400 transition-colors text-left"
                title={`Open ${student.studentName}'s profile`}
              >
                {student.studentName}
              </button>
              {!student.isActive && (
                <Badge variant="default" size="sm" className="flex-shrink-0">Inactive</Badge>
              )}
              {student.hasOverdueFees && student.isActive && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-error-600/15 text-red-400 rounded text-[10px] font-medium whitespace-nowrap flex-shrink-0">
                  <AlertTriangle className="w-2.5 h-2.5" />
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
              <Mail className="mr-1.5 text-text-tertiary flex-shrink-0 w-3 h-3" />
              <span className="truncate">{student.email}</span>
            </div>
          )}
          {student.phone && (
            <div className="flex items-center text-xs text-text-secondary truncate" title={student.phone}>
              <Phone className="mr-1.5 text-text-tertiary flex-shrink-0 w-3 h-3" />
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
        <div className="text-sm text-text-primary font-medium truncate" title={getCourseDisplayName()}>
          {getCourseDisplayName()}
        </div>
        <div className="text-xs text-text-tertiary truncate" title={getStageDisplayName()}>
          {getStageDisplayName()}
        </div>
      </td>

      {/* Level */}
      <td className="px-4 py-3 w-28 min-w-[90px]">
        <div className="flex-shrink-0 inline-block">
          <Badge variant={getBadgeVariant(student.stage)} className="whitespace-nowrap">
            {getLevelDisplayName()}
          </Badge>
        </div>
      </td>

      {/* Joined Date */}
      <td className="px-4 py-3 w-36 min-w-[120px]">
        <div className="flex items-center text-xs text-text-secondary whitespace-nowrap" title={formatDate(student.enrollmentDate)}>
          <Calendar className="mr-1.5 text-text-tertiary flex-shrink-0 w-3 h-3" />
          <span className="truncate">{formatDate(student.enrollmentDate)}</span>
        </div>
      </td>

      {/* Actions */}
      <td className="px-3 py-3 w-32 min-w-[120px]">
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => navigate(`/students/${student._id}`)}
            title="Open profile"
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-primary-400 hover:bg-primary-600/15 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          {student.hasOverdueFees && isValidWhatsAppPhone(student.phone) && (
            <button
              onClick={handleWhatsAppReminder}
              title="WhatsApp reminder"
              className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-accent-400 hover:bg-accent-600/15 transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onEdit(student)}
            title="Edit student"
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-primary-400 hover:bg-primary-600/15 transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {onToggleActive && (
            <button
              onClick={() => onToggleActive(student._id)}
              title={student.isActive ? 'Deactivate' : 'Activate'}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                student.isActive
                  ? 'text-text-tertiary hover:text-secondary-400 hover:bg-secondary-600/15'
                  : 'text-text-tertiary hover:text-primary-400 hover:bg-primary-600/15'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

export default StudentRow;
