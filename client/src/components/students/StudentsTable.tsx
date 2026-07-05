import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import StudentRow from './StudentRow';
import type { Student } from '../../types/student';

interface StudentsTableProps {
  students: Student[];
  selectedStudents: string[];
  onSelectStudent: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (student: Student) => void;
  onFees?: (student: Student) => void;
  onToggleActive?: (id: string) => void;
}

type SortField = 'studentName' | 'email' | 'createdAt' | 'stage';
type SortDirection = 'asc' | 'desc';

const StudentsTable = ({
  students,
  selectedStudents,
  onSelectStudent,
  onSelectAll,
  onEdit,
  onFees,
  onToggleActive,
}: StudentsTableProps) => {
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-text-tertiary" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-primary-600" /> : <ArrowDown className="w-3.5 h-3.5 text-primary-600" />;
  };

  const sortedStudents = [...students].sort((a, b) => {
    let aValue: string | number = '';
    let bValue: string | number = '';

    switch (sortField) {
      case 'studentName':
        aValue = a.studentName.toLowerCase();
        bValue = b.studentName.toLowerCase();
        break;
      case 'email':
        aValue = a.email?.toLowerCase() || '';
        bValue = b.email?.toLowerCase() || '';
        break;
      case 'createdAt':
        aValue = new Date(a.createdAt).getTime();
        bValue = new Date(b.createdAt).getTime();
        break;
      case 'stage':
        aValue = a.stageNumber ?? ({ beginner: 1, intermediate: 2, advanced: 3 }[a.stage || 'beginner']);
        bValue = b.stageNumber ?? ({ beginner: 1, intermediate: 2, advanced: 3 }[b.stage || 'beginner']);
        break;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const allSelected = students.length > 0 && selectedStudents.length === students.length;
  const someSelected = selectedStudents.length > 0 && selectedStudents.length < students.length;

  const checkScrollPosition = () => {
    const container = scrollContainerRef.current;
    if (container) {
      setShowLeftScroll(container.scrollLeft > 0);
      setShowRightScroll(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    }
  };

  useEffect(() => {
    checkScrollPosition();
    window.addEventListener('resize', checkScrollPosition);
    return () => window.removeEventListener('resize', checkScrollPosition);
  }, [students]);

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (container) {
      const scrollAmount = 300;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="relative">
      {/* Scroll indicators */}
      {showLeftScroll && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-surface-alt hover:bg-surface-hover border border-white/10 shadow-navy-lg rounded-r-lg p-2.5 transition-all hidden md:block"
          aria-label="Scroll left"
        >
          <ChevronLeft className="text-text-secondary w-4 h-4" />
        </button>
      )}
      {showRightScroll && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-surface-alt hover:bg-surface-hover border border-white/10 shadow-navy-lg rounded-l-lg p-2.5 transition-all hidden md:block"
          aria-label="Scroll right"
        >
          <ChevronRight className="text-text-secondary w-4 h-4" />
        </button>
      )}

      {/* Desktop Table */}
      <div
        ref={scrollContainerRef}
        className="hidden md:block overflow-x-auto"
        onScroll={checkScrollPosition}
      >
        <table className="min-w-full divide-y divide-white/7 bg-surface">
          <thead className="bg-surface-alt sticky top-0 z-10 backdrop-blur-sm">
            <tr>
              <th className="px-4 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={onSelectAll}
                  className="w-4 h-4 rounded border-white/20 bg-surface-hover text-primary-500 focus:ring-primary-400 focus:ring-offset-0 cursor-pointer accent-primary-500"
                />
              </th>

              <th className="px-4 py-3 text-left min-w-[200px]">
                <button
                  onClick={() => handleSort('studentName')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-text-tertiary uppercase tracking-wide hover:text-text-primary transition-colors"
                >
                  Student Name
                  {getSortIcon('studentName')}
                </button>
              </th>

              <th className="px-4 py-3 text-left min-w-[180px]">
                <button
                  onClick={() => handleSort('email')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-text-tertiary uppercase tracking-wide hover:text-text-primary transition-colors"
                >
                  Contact
                  {getSortIcon('email')}
                </button>
              </th>

              <th className="px-4 py-3 text-left min-w-[110px]">
                <button
                  onClick={() => handleSort('stage')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-text-tertiary uppercase tracking-wide hover:text-text-primary transition-colors"
                >
                  Stage
                  {getSortIcon('stage')}
                </button>
              </th>

              <th className="px-4 py-3 text-left min-w-[80px]">
                <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Level</span>
              </th>

              <th className="px-4 py-3 text-left min-w-[120px]">
                <button
                  onClick={() => handleSort('createdAt')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-text-tertiary uppercase tracking-wide hover:text-text-primary transition-colors"
                >
                  Joined
                  {getSortIcon('createdAt')}
                </button>
              </th>

              <th className="px-3 py-3 text-right min-w-[120px]">
                <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wide sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5">
            {sortedStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <p className="text-sm font-medium text-text-secondary">No students found</p>
                  <p className="text-xs mt-1 text-text-tertiary">Try adjusting your search or filters</p>
                </td>
              </tr>
            ) : (
              sortedStudents.map((student) => {
                const studentId = (student as any).id || student._id;
                return (
                  <StudentRow
                    key={studentId}
                    student={student}
                    isSelected={selectedStudents.includes(studentId)}
                    onSelect={onSelectStudent}
                    onEdit={onEdit}
                    onFees={onFees}
                    onToggleActive={onToggleActive}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {sortedStudents.length === 0 ? (
          <div className="bg-surface rounded-lg border border-white/7 p-8 text-center">
            <p className="text-sm font-medium text-text-secondary">No students found</p>
            <p className="text-xs mt-1 text-text-tertiary">Try adjusting your search or filters</p>
          </div>
        ) : (
          sortedStudents.map((student) => {
            const studentId = (student as any).id || student._id;
            const isSelected = selectedStudents.includes(studentId);
            const stageName = typeof student.courseId === 'object'
              ? student.courseId?.stages?.find((stage) => stage.stageNumber === student.stageNumber)?.stageName
              : null;
            const levelName = student.levelNumber ?? student.level ?? student.skillLevel;
            const batchName = typeof student.batchId === 'object'
              ? student.batchId?.batchName || student.batchId?.batchCode
              : student.batch || '—';
            return (
              <div
                key={studentId}
                className={`bg-surface rounded-lg border border-white/7 p-4 space-y-3 ${!student.isActive ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/7">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onSelectStudent(studentId)}
                      className="w-4 h-4 rounded border-white/20 bg-surface-hover accent-primary-500"
                    />
                    <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                      {student.studentName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-text-primary text-sm">{student.studentName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {!student.isActive && (
                          <span className="px-1.5 py-0.5 bg-white/6 text-text-tertiary rounded text-xs">Inactive</span>
                        )}
                        {student.hasOverdueFees && student.isActive && (
                          <span className="px-1.5 py-0.5 bg-error-600/15 text-red-400 rounded text-xs">Overdue</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm">
                  {student.email && (
                    <div className="flex justify-between">
                      <span className="text-text-tertiary text-xs">Email</span>
                      <span className="text-text-secondary text-xs truncate ml-2">{student.email}</span>
                    </div>
                  )}
                  {student.phone && (
                    <div className="flex justify-between">
                      <span className="text-text-tertiary text-xs">Phone</span>
                      <span className="text-text-secondary text-xs">{student.phone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-text-tertiary text-xs">Stage / Level</span>
                    <span className="text-text-secondary text-xs">
                      {stageName ?? (student.stageNumber ? `Stage ${student.stageNumber}` : '—')}
                      {levelName ? ` · Level ${levelName}` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary text-xs">Batch</span>
                    <span className="text-text-secondary text-xs truncate ml-3">{batchName}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/7">
                  <button onClick={() => navigate(`/students/${studentId}`)} className="py-1.5 px-3 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-500 transition-colors">Open Profile</button>
                  {onFees && (
                    <button onClick={() => onFees(student)} className="py-1.5 px-3 bg-accent-600/15 text-accent-400 rounded-lg text-xs font-medium hover:bg-accent-600/25 transition-colors">Fees</button>
                  )}
                  <button onClick={() => onEdit(student)} className="py-1.5 px-3 bg-white/6 text-text-secondary rounded-lg text-xs font-medium hover:bg-white/10 hover:text-text-primary transition-colors">Edit</button>
                  {onToggleActive && (
                    <button
                      onClick={() => onToggleActive(studentId)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${student.isActive ? 'bg-secondary-600/15 text-secondary-400 hover:bg-secondary-600/25' : 'bg-primary-600/15 text-primary-300 hover:bg-primary-600/25'}`}
                    >
                      {student.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default StudentsTable;
