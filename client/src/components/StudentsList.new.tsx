import { useState, useEffect, useCallback } from 'react';
import { FaPlus, FaUsers, FaUpload } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { StudentsAPI, FeesAPI } from '../services/api';
import type { Student } from '../types/student';
import Card from './ui/Card';
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
import BulkUploadModal from './students/BulkUploadModal';

const StudentsList = () => {
  // State management
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_overdueStudents, setOverdueStudents] = useState<Record<string, boolean>>({});

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
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [feesStudent, setFeesStudent] = useState<Student | null>(null);
  const [showFeesModal, setShowFeesModal] = useState(false);
  const [showFeePaymentAfterCreate, setShowFeePaymentAfterCreate] = useState(false);
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

  const fetchOverdueStatus = useCallback(async () => {
    try {
      const response = await FeesAPI.getStudentsOverdueStatus();
      if (response.success && response.data) {
        setOverdueStudents(response.data);
      }
    } catch (err) {
      console.error('Error fetching overdue status:', err);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
    fetchOverdueStatus();
  }, [fetchStudents, fetchOverdueStatus]);

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

  const handleSubmitStudent = async (studentData: Partial<Student>) => {
    try {
      if (modalMode === 'create') {
        const response = await StudentsAPI.createStudent(studentData);
        if (response.success && response.data) {
          toast.success('Student created successfully!');
          setIsModalOpen(false);
          // Show fee payment modal for new student
          setNewlyCreatedStudent(response.data);
          setShowFeePaymentAfterCreate(true);
        } else {
          toast.error(response.message || 'Failed to create student');
          return;
        }
      } else if (editingStudent) {
        const response = await StudentsAPI.updateStudent(editingStudent._id, studentData);
        if (response.success) {
          toast.success('Student updated successfully!');
          setIsModalOpen(false);
        } else {
          toast.error(response.message || 'Failed to update student');
          return;
        }
      }
      fetchStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save student');
      console.error('Error saving student:', err);
    }
  };

  const handleFeePaymentSuccess = () => {
    setShowFeePaymentAfterCreate(false);
    setNewlyCreatedStudent(null);
    fetchStudents();
    fetchOverdueStatus();
  };

  const handleSkipFeePayment = () => {
    setShowFeePaymentAfterCreate(false);
    setNewlyCreatedStudent(null);
    toast('You can record fees later from the student list', { icon: 'ℹ️' });
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

  if (error) {
    return (
      <Card className="text-center py-12">
        <div className="text-red-600">
          <p className="text-lg font-medium">Error Loading Students</p>
          <p className="text-sm mt-2">{error}</p>
          <Button onClick={fetchStudents} className="mt-4">
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <Card>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center shadow-md">
              <FaUsers className="text-white text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Students Management</h1>
              <p className="text-sm text-gray-600 mt-1">
                Manage and track all your students in one place
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <ExportButton students={students} />
            <Button onClick={() => setIsBulkUploadModalOpen(true)} variant="secondary">
              <FaUpload />
              Bulk Upload
            </Button>
            <Button onClick={handleCreateStudent} variant="primary">
              <FaPlus />
              Add Student
            </Button>
          </div>
        </div>
      </Card>

      {/* Search and Filters */}
      <Card>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <SearchBar onSearch={handleSearch} />
            <div className="text-sm text-gray-600">
              Total: <span className="font-semibold text-gray-900">{totalStudents}</span> students
            </div>
          </div>
          <FilterPanel
            selectedCourse={selectedCourse}
            onCourseChange={handleCourseChange}
            selectedStatus={selectedStatus}
            onStatusChange={handleStatusChange}
            onClearFilters={handleClearFilters}
          />
        </div>
      </Card>

      {/* Students Table */}
      {loading ? (
        <Card className="py-12">
          <LoadingSpinner size="xl" className="py-8" />
          <p className="text-center text-gray-600 mt-4">Loading students...</p>
        </Card>
      ) : (
        <Card padding="none">
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
            <div className="px-6 pb-6">
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
        </Card>
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

      {/* Fee Payment Modal after Student Creation */}
      <FeePaymentModal
        isOpen={showFeePaymentAfterCreate}
        onClose={handleSkipFeePayment}
        student={newlyCreatedStudent}
        onSuccess={handleFeePaymentSuccess}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={isBulkUploadModalOpen}
        onClose={() => setIsBulkUploadModalOpen(false)}
        onSuccess={fetchStudents}
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
