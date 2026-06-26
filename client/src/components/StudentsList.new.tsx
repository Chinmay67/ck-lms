import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Plus, UserCheck, Users, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import { StudentsAPI, AdminStudentsAPI } from '../services/api';
import type { Student, StudentUpdate } from '../types/student';
import Button from './ui/Button';
import LoadingSpinner from './ui/LoadingSpinner';
import Modal from './ui/Modal';
import SearchBar from './students/SearchBar';
import FilterPanel from './students/FilterPanel';
import StudentsTable from './students/StudentsTable';
import Pagination from './students/Pagination';
import StudentModal from './students/StudentModal';
import BulkActionsBar from './students/BulkActionsBar';
import ExportButton from './students/ExportButton';
import StudentFeesTab from './fees/StudentFeesTab';
import FeePaymentModal from './fees/FeePaymentModal';
import AddCreditModal from './fees/AddCreditModal';

const getRefId = (value: Student['courseId'] | Student['batchId'] | undefined): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value._id ?? value.id ?? null;
};

const StudentsList = () => {
  // State management
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStudents, setTotalStudents] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Selection state
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [feesStudent, setFeesStudent] = useState<Student | null>(null);
  const [showFeesModal, setShowFeesModal] = useState(false);
  const [showFeePaymentAfterCreate, setShowFeePaymentAfterCreate] = useState(false);
  const [showCreditModalAfterCreate, setShowCreditModalAfterCreate] = useState(false);
  const [newlyCreatedStudent, setNewlyCreatedStudent] = useState<Student | null>(null);

  // Fetch students
  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await StudentsAPI.getStudents({
        page: currentPage,
        limit: itemsPerPage,
        search: searchQuery,
        stage: selectedCourse !== 'all' ? selectedCourse : undefined,
        isActive: selectedStatus !== 'all' ? selectedStatus === 'active' : undefined,
      });

      if (response.success && response.data) {
        setStudents(response.data.data);
        setTotalPages(response.data.pagination.totalPages);
        setTotalStudents(response.data.pagination.totalItems);
      }
    } catch (err) {
      setError('Failed to fetch students. Please try again.');
      toast.error('Failed to load students');
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, searchQuery, selectedCourse, selectedStatus]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Search handler
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1); // Reset to first page on search
  }, []);

  // Filter handlers
  const handleCourseChange = (course: string) => {
    setSelectedCourse(course);
    setCurrentPage(1); // Reset to first page on filter
  };

  const handleStatusChange = (status: 'all' | 'active' | 'inactive') => {
    setSelectedStatus(status);
    setCurrentPage(1); // Reset to first page on filter
  };

  const handleClearFilters = () => {
    setSelectedCourse('all');
    setSelectedStatus('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Pagination handlers
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1);
  };

  // Selection handlers
  const handleSelectStudent = (id: string) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map((s) => s._id));
    }
  };

  const handleClearSelection = () => {
    setSelectedStudents([]);
  };

  // CRUD handlers
  const handleCreateStudent = () => {
    setModalMode('create');
    setEditingStudent(null);
    setIsModalOpen(true);
  };

  const handleEditStudent = (student: Student) => {
    setModalMode('edit');
    setEditingStudent(student);
    setIsModalOpen(true);
  };

  const handleSubmitStudent = async (studentData: StudentUpdate): Promise<string | void> => {
    try {
      if (modalMode === 'create') {
        const courseId = (studentData as any).courseId;
        const stageNumber = (studentData as any).stageNumber;
        const levelNumber = (studentData as any).levelNumber;
        const monthlyFee = (studentData as any).monthlyFee;

        if (!courseId || stageNumber == null || levelNumber == null || !monthlyFee) {
          return 'Please fill in all required academic fields (course, stage, level, fee)';
        }

        const nextBatchId = getRefId(studentData.batchId);
        const hasBatch = !!nextBatchId;
        const response = await AdminStudentsAPI.create({
          studentName: studentData.studentName!,
          parentName: studentData.parentName,
          phone: studentData.phone,
          email: studentData.email,
          dob: studentData.dob,
          address: studentData.address,
          referredBy: studentData.referredBy,
          enrollmentDate: studentData.enrollmentDate,
          courseId,
          stageNumber: Number(stageNumber),
          levelNumber: Number(levelNumber),
          batchId: nextBatchId ?? undefined,
          monthlyFee: Number(monthlyFee),
          discountType: (studentData as any).discountType ?? 'none',
          discountPct: (studentData as any).discountType === 'percentage' ? Number((studentData as any).discountValue ?? 0) : 0,
          discountAmount: (studentData as any).discountType === 'fixed' ? Number((studentData as any).discountValue ?? 0) : 0,
          discountReason: (studentData as any).discountReason ?? '',
          createFirstFeeRecord: !!hasBatch,
          firstMonthFee: Number(monthlyFee),
        });

        if (response.success && response.data) {
          toast.success('Student created successfully!');
          setIsModalOpen(false);
          const createdStudent = (response.data as any).student || response.data;
          setNewlyCreatedStudent(createdStudent);
          if (hasBatch) {
            setShowFeePaymentAfterCreate(true);
          } else {
            setShowCreditModalAfterCreate(true);
          }
          fetchStudents();
        } else {
          return (response as any).error || (response as any).message || 'Failed to create student';
        }

      } else if (editingStudent) {
        const studentId = (editingStudent as any).id || editingStudent._id;
        const courseId = (studentData as any).courseId;
        const stageNumber = (studentData as any).stageNumber;
        const levelNumber = (studentData as any).levelNumber;
        const monthlyFee = (studentData as any).monthlyFee;
        const originalCourseId = typeof editingStudent.courseId === 'object'
          ? (editingStudent.courseId as any)?._id ?? null
          : editingStudent.courseId ?? null;
        const originalBatchId = getRefId(editingStudent.batchId);
        const nextBatchId = getRefId(studentData.batchId);
        const academicChanged =
          courseId !== originalCourseId ||
          stageNumber !== editingStudent.stageNumber ||
          levelNumber !== editingStudent.levelNumber;
        const batchChanged = nextBatchId !== originalBatchId;

        if (academicChanged && courseId && stageNumber != null && levelNumber != null && monthlyFee) {
          const response = await AdminStudentsAPI.upgrade(studentId, {
            courseId,
            stageNumber: Number(stageNumber),
            levelNumber: Number(levelNumber),
            monthlyFee: Number(monthlyFee),
            batchId: nextBatchId ?? undefined,
            discountType: (studentData as any).discountType ?? 'none',
            discountPct: (studentData as any).discountType === 'percentage' ? Number((studentData as any).discountValue ?? 0) : 0,
            discountAmount: (studentData as any).discountType === 'fixed' ? Number((studentData as any).discountValue ?? 0) : 0,
            discountReason: (studentData as any).discountReason ?? '',
          });
          if (!response.success) {
            return (response as any).error || 'Failed to upgrade student';
          }
        } else if (batchChanged) {
          const response = await AdminStudentsAPI.changeBatch(studentId, { newBatchId: nextBatchId });
          if (!response.success) {
            return (response as any).error || 'Failed to change batch';
          }
        }

        const personalFields: Record<string, any> = {};
        const allowed = ['studentName', 'parentName', 'phone', 'email', 'dob', 'address', 'alternatePhone', 'alternateEmail', 'referredBy'];
        allowed.forEach((k) => { if ((studentData as any)[k] !== undefined) personalFields[k] = (studentData as any)[k]; });

        if (Object.keys(personalFields).length > 0) {
          const response = await AdminStudentsAPI.update(studentId, personalFields);
          if (!response.success) {
            return (response as any).error || 'Failed to update student info';
          }
        }

        toast.success('Student updated successfully!');
        setIsModalOpen(false);
        fetchStudents();
      }
    } catch (err: any) {
      return err.response?.data?.error || err.message || 'Failed to save student';
    }
  };

  const handleFeePaymentSuccess = () => {
    setShowFeePaymentAfterCreate(false);
    setShowCreditModalAfterCreate(false);
    setNewlyCreatedStudent(null);
    fetchStudents();
  };

  const handleSkipFeePayment = () => {
    setShowFeePaymentAfterCreate(false);
    setShowCreditModalAfterCreate(false);
    setNewlyCreatedStudent(null);
    toast('You can record fees/credits later from the student list', { icon: 'ℹ️' });
  };

  const handleViewFees = (student: Student) => {
    setFeesStudent(student);
    setShowFeesModal(true);
  };

  const handleToggleActiveStatus = async (id: string) => {
    try {
      const response = await StudentsAPI.toggleStudentActiveStatus(id);
      if (response.success) {
        const student = students.find(s => s._id === id);
        const newStatus = !student?.isActive;
        toast.success(`Student ${newStatus ? 'activated' : 'deactivated'} successfully!`);
        fetchStudents();
      } else {
        toast.error(response.message || 'Failed to update student status');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update student status');
      console.error('Error toggling student status:', err);
    }
  };

  // Bulk actions
  const handleBulkExport = () => {
    const selectedStudentData = students.filter((s) =>
      selectedStudents.includes(s._id)
    );

    // Use ExportButton logic
    const csvContent = exportStudentsToCSV(selectedStudentData);
    downloadCSV(csvContent, `selected-students-${new Date().toISOString().split('T')[0]}.csv`);
    toast.success(`Exported ${selectedStudents.length} students`);
  };

  // Helper functions for export
  const exportStudentsToCSV = (data: Student[]) => {
    const headers = ['Name', 'Email', 'Phone', 'Skills', 'Skill Level', 'Joined Date'];
    const rows = data.map((s) => [
      s.studentName,
      s.email,
      s.phone || '',
      s.combinedSkill || '',
      s.skillCategory || '',
      new Date(s.createdAt).toLocaleDateString(),
    ]);
    return [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const visibleActive = students.filter((student) => student.isActive).length;
  const visibleInactive = students.filter((student) => !student.isActive).length;
  const visibleOverdue = students.filter((student) => student.isActive && student.hasOverdueFees).length;
  const activeFilterCount = Number(!!searchQuery) + Number(selectedCourse !== 'all') + Number(selectedStatus !== 'all');
  const kpis = [
    { label: 'Total', value: totalStudents, icon: Users, tone: 'text-primary-300 bg-primary-600/15 border-primary-500/20' },
    { label: 'Visible active', value: visibleActive, icon: UserCheck, tone: 'text-success-400 bg-success-600/15 border-success-500/20' },
    { label: 'Visible inactive', value: visibleInactive, icon: UserX, tone: 'text-text-tertiary bg-white/6 border-white/10' },
    { label: 'Visible overdue', value: visibleOverdue, icon: AlertTriangle, tone: 'text-error-400 bg-error-600/15 border-error-500/20' },
  ];

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-surface rounded-lg border border-white/7">
        <p className="text-sm font-medium text-text-secondary mb-3">{error}</p>
        <Button onClick={fetchStudents} variant="outline" size="sm">Try Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page toolbar — single flat row, no Card wrapper */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0">
          <SearchBar onSearch={handleSearch} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          <FilterPanel
            selectedCourse={selectedCourse}
            onCourseChange={handleCourseChange}
            selectedStatus={selectedStatus}
            onStatusChange={handleStatusChange}
            onClearFilters={handleClearFilters}
          />
          <span className="h-9 inline-flex items-center px-3 text-xs text-text-tertiary whitespace-nowrap rounded-lg border border-white/8 bg-surface">
            {activeFilterCount ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''}` : 'No filters'}
          </span>
          <ExportButton students={students} />
          <Button onClick={handleCreateStudent} variant="primary" size="sm" className="h-9 whitespace-nowrap">
            <Plus className="w-4 h-4" />
            <span>Add Student</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-surface rounded-lg border border-white/7 px-3 py-2.5 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${kpi.tone}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-text-primary leading-5">{kpi.value}</div>
                <div className="text-[11px] text-text-tertiary uppercase tracking-wide truncate">{kpi.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Students Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 bg-surface rounded-lg border border-white/7">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm text-text-secondary">Loading students…</p>
        </div>
      ) : (
        <div className="bg-surface rounded-lg border border-white/7 overflow-hidden">
          <StudentsTable
            students={students}
            selectedStudents={selectedStudents}
            onSelectStudent={handleSelectStudent}
            onSelectAll={handleSelectAll}
            onEdit={handleEditStudent}
            onFees={handleViewFees}
            onToggleActive={handleToggleActiveStatus}
          />
          {students.length > 0 && (
            <div className="px-4 py-3 border-t border-white/7">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                totalItems={totalStudents}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            </div>
          )}
        </div>
      )}

      {/* Student Modal */}
      <StudentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitStudent}
        student={editingStudent}
        mode={modalMode}
      />

      {/* Fees Modal */}
      <Modal
        isOpen={showFeesModal}
        onClose={() => setShowFeesModal(false)}
        title="Student Fees"
        size="xl"
      >
        {feesStudent && (
          <StudentFeesTab student={feesStudent} />
        )}
      </Modal>

      {/* Fee Payment Modal after Student Creation (with batch) */}
      <FeePaymentModal
        isOpen={showFeePaymentAfterCreate}
        onClose={handleSkipFeePayment}
        student={newlyCreatedStudent}
        onSuccess={handleFeePaymentSuccess}
      />

      {/* Credit Modal after Student Creation (without batch) */}
      <AddCreditModal
        isOpen={showCreditModalAfterCreate}
        onClose={handleSkipFeePayment}
        student={newlyCreatedStudent}
        onSuccess={handleFeePaymentSuccess}
      />

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedStudents.length}
        onExport={handleBulkExport}
        onClearSelection={handleClearSelection}
      />
    </div>
  );
};

export default StudentsList;
