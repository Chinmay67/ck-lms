import React, { useState, useEffect } from 'react';
import { FaUpload, FaExclamationTriangle, FaRedo } from 'react-icons/fa';
import { StudentsAPI, FeesAPI } from '../services/api';
import type { Student, StudentFilters } from '../types/student';
import StudentModal from './students/StudentModal';
import BulkUploadModal from './students/BulkUploadModal';
import FeePaymentModal from './fees/FeePaymentModal';
import AddCreditModal from './fees/AddCreditModal';
import toast from 'react-hot-toast';
import { getErrorMessage, isNetworkError, showErrorToast } from '../utils/errorHandler';

const StudentsList: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'network' | 'server' | 'general'>('general');
  const [overdueStudents, setOverdueStudents] = useState<Record<string, boolean>>({});
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10,
    hasNext: false,
    hasPrev: false,
  });
  
  const [filters, setFilters] = useState<StudentFilters>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    search: '',
  });

  const [searchInput, setSearchInput] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [newlyCreatedStudent, setNewlyCreatedStudent] = useState<Student | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  const fetchStudents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await StudentsAPI.getStudents(filters);
      
      if (response.success && response.data) {
        setStudents(response.data.data);
        setPagination(response.data.pagination);
      } else {
        setError(response.error || 'Unable to load students. Please try again.');
        setErrorType('server');
      }
    } catch (err: any) {
      if (isNetworkError(err)) {
        setError('Unable to connect to the server. Please check your internet connection.');
        setErrorType('network');
      } else {
        setError(getErrorMessage(err));
        setErrorType('server');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchOverdueStatus = async () => {
    try {
      const response = await FeesAPI.getStudentsOverdueStatus();
      if (response.success && response.data) {
        setOverdueStudents(response.data);
      }
    } catch (err: any) {
      // Silently fail - this is supplementary data
      console.error('Error fetching overdue status:', getErrorMessage(err));
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchOverdueStatus();
  }, [filters]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ ...filters, search: searchInput, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage });
  };

  const handleSortChange = (sortBy: string) => {
    const newSortOrder = filters.sortBy === sortBy && filters.sortOrder === 'asc' ? 'desc' : 'asc';
    setFilters({ ...filters, sortBy, sortOrder: newSortOrder, page: 1 });
  };

  const getSkillLevelBadge = (skillCategory?: string, skillLevel?: number) => {
    if (!skillCategory) return (
      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
        —
      </span>
    );
    
    const colors: Record<string, string> = {
      beginner: 'bg-green-50 text-green-700',
      intermediate: 'bg-yellow-50 text-yellow-700',
      advanced: 'bg-red-50 text-red-700',
    };
    
    const colorClass = colors[skillCategory] || 'bg-gray-50 text-gray-700';
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
        {skillCategory.charAt(0).toUpperCase() + skillCategory.slice(1)} {skillLevel && `L${skillLevel}`}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleAddStudent = () => {
    setSelectedStudent(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleEditStudent = (student: Student) => {
    setSelectedStudent(student);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (studentData: Partial<Student>) => {
    try {
      if (modalMode === 'create') {
        const response = await StudentsAPI.createStudent(studentData);
        toast.success(`Student "${studentData.studentName}" created successfully!`);
        
        // Refresh the list
        await fetchStudents();
        setIsModalOpen(false);
        
        // Open appropriate modal based on batch assignment
        if (response.success && response.data) {
          // The response may contain { student, initialFees } or just the student
          const createdStudent = (response.data as any).student || response.data;
          setNewlyCreatedStudent(createdStudent);
          
          // Check if student has a batch assigned
          if (studentData.batchId) {
            // Has batch - open fee payment modal
            setIsFeeModalOpen(true);
          } else {
            // No batch - open credit modal
            setIsCreditModalOpen(true);
          }
        }
      } else if (selectedStudent) {
        await StudentsAPI.updateStudent(selectedStudent._id, studentData);
        toast.success(`Student "${studentData.studentName || selectedStudent.studentName}" updated successfully!`);
        
        // Refresh the list
        await fetchStudents();
        setIsModalOpen(false);
      }
    } catch (err: any) {
      console.error('Error saving student:', err);
      showErrorToast(err, modalMode === 'create' ? 'Failed to create student' : 'Failed to update student');
    }
  };

  const handleFeeModalClose = () => {
    setIsFeeModalOpen(false);
    setNewlyCreatedStudent(null);
  };

  const handleCreditModalClose = () => {
    setIsCreditModalOpen(false);
    setNewlyCreatedStudent(null);
  };

  const handleCreditPaymentSuccess = () => {
    toast.success('Credit payment recorded successfully');
    fetchStudents(); // Refresh to show updated status
  };

  const handleFeePaymentSuccess = () => {
    toast.success('Fee payment recorded successfully');
    fetchStudents(); // Refresh to show updated fee status
    fetchOverdueStatus(); // Refresh overdue status
  };

  const handleRetry = () => {
    setError(null);
    fetchStudents();
    fetchOverdueStatus();
  };

  if (loading && !error) {
    return (
      <div className="min-h-screen bg-white">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-900 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  // Error state with retry option
  if (error && students.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        <div className="flex flex-col items-center justify-center h-64 p-6">
          <div className={`mb-4 p-4 rounded-full ${errorType === 'network' ? 'bg-orange-100' : 'bg-red-100'}`}>
            <FaExclamationTriangle className={`h-8 w-8 ${errorType === 'network' ? 'text-orange-500' : 'text-red-500'}`} />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {errorType === 'network' ? 'Connection Error' : 'Unable to Load Students'}
          </h2>
          <p className="text-gray-600 text-center max-w-md mb-4">
            {error}
          </p>
          <button
            onClick={handleRetry}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
          >
            <FaRedo className="mr-2 h-4 w-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Students</h1>
              <p className="mt-1 text-sm text-gray-500">
                {pagination.totalItems} students total
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleAddStudent}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
              >
                <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Student
              </button>
              <button
                onClick={() => setIsBulkUploadModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
              >
                <FaUpload className="h-5 w-5 mr-2" />
                Bulk Upload
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {/* Search and Controls */}
        <div className="mb-6">
          <div className="flex items-center space-x-4">
            <form onSubmit={handleSearch} className="flex-1 max-w-md">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <button
                    type="submit"
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>
            
            {filters.search && (
              <button
                onClick={() => {
                  setSearchInput('');
                  setFilters({ ...filters, search: '', page: 1 });
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            )}

            <div className="text-sm text-gray-500">
              {students.length} of {pagination.totalItems} students
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSortChange('studentName')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Name</span>
                      {filters.sortBy === 'studentName' && (
                        <span className="text-gray-900">
                          {filters.sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSortChange('email')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Email</span>
                      {filters.sortBy === 'email' && (
                        <span className="text-gray-900">
                          {filters.sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Parent
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Skill Level
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSortChange('createdAt')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Joined</span>
                      {filters.sortBy === 'createdAt' && (
                        <span className="text-gray-900">
                          {filters.sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {students.map((student, index) => (
                  <tr key={student._id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{student.studentName}</span>
                          {overdueStudents[student._id] && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                              Overdue
                            </span>
                          )}
                        </div>
                        {student.dob && (
                          <div className="text-sm text-gray-500">DOB: {student.dob}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{student.email}</div>
                      {student.alternateEmail && (
                        <div className="text-xs text-gray-500">{student.alternateEmail}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {student.phone || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {student.parentName || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getSkillLevelBadge(student.skillCategory, student.skillLevel)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(student.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEditStudent(student)}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {students.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="text-sm text-gray-500">
              {filters.search ? 'No students found matching your search.' : 'No students found.'}
            </div>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center">
              <p className="text-sm text-gray-700">
                Showing{' '}
                <span className="font-medium">{((pagination.currentPage - 1) * pagination.itemsPerPage) + 1}</span>
                {' '}to{' '}
                <span className="font-medium">
                  {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)}
                </span>
                {' '}of{' '}
                <span className="font-medium">{pagination.totalItems}</span>
                {' '}results
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={!pagination.hasPrev}
                className="relative inline-flex items-center px-3 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(7, pagination.totalPages) }, (_, i) => {
                  let pageNum;
                  if (pagination.totalPages <= 7) {
                    pageNum = i + 1;
                  } else {
                    if (pagination.currentPage <= 4) {
                      pageNum = i + 1;
                    } else if (pagination.currentPage >= pagination.totalPages - 3) {
                      pageNum = pagination.totalPages - 6 + i;
                    } else {
                      pageNum = pagination.currentPage - 3 + i;
                    }
                  }

                  if (pageNum <= pagination.totalPages && pageNum >= 1) {
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`relative inline-flex items-center px-3 py-2 border text-sm font-medium ${
                          pageNum === pagination.currentPage
                            ? 'z-10 bg-gray-900 border-gray-900 text-white'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                  return null;
                })}
              </div>
              
              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={!pagination.hasNext}
                className="relative inline-flex items-center px-3 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student Modal */}
      <StudentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        student={selectedStudent}
        mode={modalMode}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={isBulkUploadModalOpen}
        onClose={() => setIsBulkUploadModalOpen(false)}
        onSuccess={fetchStudents}
      />

      {/* Fee Payment Modal for newly created students with batch */}
      <FeePaymentModal
        isOpen={isFeeModalOpen}
        onClose={handleFeeModalClose}
        student={newlyCreatedStudent}
        onSuccess={handleFeePaymentSuccess}
      />

      {/* Credit Modal for newly created students without batch */}
      <AddCreditModal
        isOpen={isCreditModalOpen}
        onClose={handleCreditModalClose}
        student={newlyCreatedStudent}
        onSuccess={handleCreditPaymentSuccess}
      />
    </div>
  );
};

export default StudentsList;
