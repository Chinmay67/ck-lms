import { useState, useRef, useEffect } from 'react';
import { FaSort, FaSortUp, FaSortDown, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
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
    if (sortField !== field) return <FaSort className="text-text-tertiary" />;
    return sortDirection === 'asc' ? <FaSortUp className="text-primary-600" /> : <FaSortDown className="text-primary-600" />;
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
        const stageOrder = { beginner: 1, intermediate: 2, advanced: 3 };
        aValue = stageOrder[a.stage || 'beginner'];
        bValue = stageOrder[b.stage || 'beginner'];
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
      {/* Scroll Indicators */}
      {showLeftScroll && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/95 hover:bg-white shadow-lg rounded-r-lg p-3 transition-all hidden md:block"
          aria-label="Scroll left"
        >
          <FaChevronLeft className="text-primary-600" />
        </button>
      )}
      {showRightScroll && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/95 hover:bg-white shadow-lg rounded-l-lg p-3 transition-all hidden md:block"
          aria-label="Scroll right"
        >
          <FaChevronRight className="text-primary-600" />
        </button>
      )}

      {/* Desktop Table View */}
      <div 
        ref={scrollContainerRef}
        className="hidden md:block overflow-x-auto rounded-xl border border-border shadow-navy"
        onScroll={checkScrollPosition}
      >
        <table 
          className="min-w-full divide-y divide-border bg-surface"
          style={{ minWidth: '1200px' }}
        >
          <thead className="bg-gradient-to-r from-primary-50 to-secondary-50 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left w-12">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={onSelectAll}
                className="w-4 h-4 text-primary-600 border-primary-300 rounded focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
              />
            </th>

            <th className="px-4 py-3 text-left w-64 min-w-[200px] max-w-[280px]">
              <button
                onClick={() => handleSort('studentName')}
                className="flex items-center gap-2 font-bold text-text-primary hover:text-primary-600 transition-colors text-sm"
              >
                Student Name
                {getSortIcon('studentName')}
              </button>
            </th>

            <th className="px-4 py-3 text-left w-56 min-w-[180px] max-w-[240px]">
              <button
                onClick={() => handleSort('email')}
                className="flex items-center gap-2 font-bold text-text-primary hover:text-primary-600 transition-colors text-sm"
              >
                Contact
                {getSortIcon('email')}
              </button>
            </th>

            <th className="px-4 py-3 text-left w-32 min-w-[100px]">
              <button
                onClick={() => handleSort('stage')}
                className="flex items-center gap-2 font-bold text-text-primary hover:text-primary-600 transition-colors text-sm"
              >
                Course
                {getSortIcon('stage')}
              </button>
            </th>

            <th className="px-4 py-3 text-left w-28 min-w-[90px]">
              <span className="font-bold text-text-primary text-sm">Level</span>
            </th>

            <th className="px-4 py-3 text-left w-36 min-w-[120px]">
              <button
                onClick={() => handleSort('createdAt')}
                className="flex items-center gap-2 font-bold text-text-primary hover:text-primary-600 transition-colors text-sm"
              >
                Joined Date
                {getSortIcon('createdAt')}
              </button>
            </th>

            <th className="px-4 py-3 text-right w-40 min-w-[140px]">
              <span className="font-bold text-text-primary text-sm">Actions</span>
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-border">
          {sortedStudents.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center">
                <div className="text-text-secondary">
                  <p className="text-lg font-semibold text-text-primary">No students found</p>
                  <p className="text-sm mt-1">Try adjusting your search or filters</p>
                </div>
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

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {sortedStudents.length === 0 ? (
          <div className="bg-surface rounded-xl border border-primary-100/30 shadow-navy p-8 text-center">
            <p className="text-lg font-semibold text-text-primary">No students found</p>
            <p className="text-sm mt-1 text-text-secondary">Try adjusting your search or filters</p>
          </div>
        ) : (
          sortedStudents.map((student) => {
            const studentId = (student as any).id || student._id;
            const isSelected = selectedStudents.includes(studentId);
            
            return (
              <div 
                key={studentId}
                className={`bg-surface rounded-xl border border-primary-100/30 shadow-navy p-4 space-y-3 ${
                  !student.isActive ? 'bg-gray-50 opacity-60' : ''
                }`}
              >
                {/* Header with checkbox and avatar */}
                <div className="flex items-center justify-between pb-3 border-b border-primary-100/30">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onSelectStudent(studentId)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center text-white font-semibold text-sm">
                      {student.studentName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{student.studentName}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {!student.isActive && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                            Inactive
                          </span>
                        )}
                        {student.hasOverdueFees && student.isActive && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                            Overdue
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Student Details */}
                <div className="space-y-2 text-sm">
                  {student.email && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Email:</span>
                      <span className="text-text-primary font-medium truncate ml-2">{student.email}</span>
                    </div>
                  )}
                  {student.phone && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Phone:</span>
                      <span className="text-text-primary font-medium">{student.phone}</span>
                    </div>
                  )}
                  {!student.email && !student.phone && (
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Contact:</span>
                      <span className="text-text-tertiary italic">No contact info</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Course:</span>
                    <span className="text-text-primary font-medium capitalize">{student.stage || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Level:</span>
                    <span className="text-text-primary font-medium">
                      {student.level ? `Level ${student.level}` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Joined:</span>
                    <span className="text-text-primary font-medium">
                      {new Date(student.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-primary-100/30">
                  {onFees && (
                    <button
                      onClick={() => onFees(student)}
                      className="flex-1 py-2 px-3 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors"
                    >
                      Fees
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(student)}
                    className="flex-1 py-2 px-3 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-100 transition-colors"
                  >
                    Edit
                  </button>
                  {onToggleActive && (
                    <button
                      onClick={() => onToggleActive(studentId)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        student.isActive
                          ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
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
