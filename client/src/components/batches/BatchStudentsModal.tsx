import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import type { Batch, EligibleStudent } from '../../types/batch';
import type { Student } from '../../types/student';
import { BatchAPI } from '../../services/api';
import StudentSelectorModal from './StudentSelectorModal';
import BatchTransferConfirmModal from './BatchTransferConfirmModal';

interface BatchStudentsModalProps {
  batch: Batch;
  onClose: () => void;
  onStudentsUpdated?: () => void;
}

const BatchStudentsModal: React.FC<BatchStudentsModalProps> = ({ batch, onClose, onStudentsUpdated }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStudentSelector, setShowStudentSelector] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [pendingStudents, setPendingStudents] = useState<EligibleStudent[]>([]);
  const [studentsToTransfer, setStudentsToTransfer] = useState<EligibleStudent[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchStudents();
  }, [batch.id]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const response = await BatchAPI.getBatchStudents(batch.id);
      if (response.success && response.data) {
        setStudents(response.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  // Handle student selector confirm
  const handleStudentSelectorConfirm = (selectedStudents: EligibleStudent[], toTransfer: EligibleStudent[]) => {
    setPendingStudents(selectedStudents);
    setStudentsToTransfer(toTransfer);
    setShowStudentSelector(false);
    
    // If there are students to transfer, show confirmation dialog
    if (toTransfer.length > 0) {
      setShowTransferConfirm(true);
    } else {
      // No transfers, proceed directly
      performBulkAssignment(selectedStudents);
    }
  };

  // Perform bulk assignment
  const performBulkAssignment = async (studentsToAdd: EligibleStudent[]) => {
    if (studentsToAdd.length === 0) return;
    
    setIsAssigning(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const studentIds = studentsToAdd.map(s => s._id);
      const response = await BatchAPI.bulkAssignStudents(batch.id, studentIds);
      
      if (response.success && response.data) {
        setSuccessMessage(`Successfully added ${response.data.assignedCount} student(s) to ${batch.batchName}`);
        await fetchStudents();
        onStudentsUpdated?.();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to assign students');
    } finally {
      setIsAssigning(false);
      setShowTransferConfirm(false);
      setPendingStudents([]);
      setStudentsToTransfer([]);
    }
  };

  // Handle transfer confirmation
  const handleTransferConfirm = () => {
    performBulkAssignment(pendingStudents);
  };

  // Handle remove student
  const handleRemoveStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to remove ${studentName} from this batch?`)) {
      return;
    }
    
    setRemovingStudentId(studentId);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const response = await BatchAPI.removeStudentFromBatch(studentId);
      
      if (response.success) {
        setSuccessMessage(`${studentName} has been removed from the batch`);
        await fetchStudents();
        onStudentsUpdated?.();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove student');
    } finally {
      setRemovingStudentId(null);
    }
  };

  // Clear messages after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'beginner': return 'bg-blue-100 text-blue-800';
      case 'intermediate': return 'bg-purple-100 text-purple-800';
      case 'advanced': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        title={`${batch.batchName} - Students (${students.length}${batch.maxStudents ? `/${batch.maxStudents}` : ''})`}
        size="lg"
      >
        <div className="space-y-4">
          {/* Success Message */}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {successMessage}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Batch Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Batch Code:</span>
                <span className="ml-2 font-medium">{batch.batchCode}</span>
              </div>
              <div>
                <span className="text-gray-600">Stage/Level:</span>
                <Badge className={getStageColor(batch.stage)}>{batch.stage} {batch.level}</Badge>
              </div>
              <div>
                <span className="text-gray-600">Capacity:</span>
                <span className="ml-2 font-medium">
                  {students.length}{batch.maxStudents ? ` / ${batch.maxStudents}` : ' (unlimited)'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Status:</span>
                <Badge className={
                  batch.status === 'active' ? 'bg-green-100 text-green-800' :
                  batch.status === 'ended' ? 'bg-gray-100 text-gray-800' :
                  'bg-yellow-100 text-yellow-800'
                }>
                  {batch.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* Add Students Button */}
          {batch.status === 'active' && (
            <div className="flex justify-end">
              <Button 
                variant="primary" 
                size="sm"
                onClick={() => setShowStudentSelector(true)}
                disabled={isAssigning}
              >
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Students
                </span>
              </Button>
            </div>
          )}

          {/* Students List */}
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading students...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-600">No students enrolled in this batch yet.</p>
              {batch.status === 'active' && (
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => setShowStudentSelector(true)}
                >
                  Add your first student
                </Button>
              )}
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    {batch.status === 'active' && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {students.map((student) => (
                    <tr key={student._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {student.studentName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{student.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{student.phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={
                          student.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }>
                          {student.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      {batch.status === 'active' && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleRemoveStudent(student._id, student.studentName)}
                            disabled={removingStudentId === student._id}
                          >
                            {removingStudentId === student._id ? (
                              <span className="flex items-center gap-1">
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Removing...
                              </span>
                            ) : (
                              'Remove'
                            )}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Student Selector Modal */}
      {showStudentSelector && (
        <StudentSelectorModal
          batch={{ ...batch, currentStudentCount: students.length }}
          onClose={() => setShowStudentSelector(false)}
          onConfirm={handleStudentSelectorConfirm}
        />
      )}

      {/* Transfer Confirmation Modal */}
      {showTransferConfirm && (
        <BatchTransferConfirmModal
          targetBatch={batch}
          studentsToTransfer={studentsToTransfer}
          totalStudentsToAdd={pendingStudents.length}
          onConfirm={handleTransferConfirm}
          onCancel={() => {
            setShowTransferConfirm(false);
            setPendingStudents([]);
            setStudentsToTransfer([]);
          }}
          isLoading={isAssigning}
        />
      )}
    </>
  );
};

export default BatchStudentsModal;
