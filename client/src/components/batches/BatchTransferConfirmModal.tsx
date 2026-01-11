import React from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import type { Batch, EligibleStudent } from '../../types/batch';

interface BatchTransferConfirmModalProps {
  targetBatch: Batch;
  studentsToTransfer: EligibleStudent[];
  totalStudentsToAdd: number;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const BatchTransferConfirmModal: React.FC<BatchTransferConfirmModalProps> = ({
  targetBatch,
  studentsToTransfer,
  totalStudentsToAdd,
  onConfirm,
  onCancel,
  isLoading = false
}) => {
  // Group students by their current batch
  const studentsByBatch = studentsToTransfer.reduce((acc, student) => {
    const batchName = student.currentBatchName || 'Unknown Batch';
    if (!acc[batchName]) {
      acc[batchName] = [];
    }
    acc[batchName].push(student);
    return acc;
  }, {} as Record<string, EligibleStudent[]>);

  const transferCount = studentsToTransfer.length;
  const newAssignmentCount = totalStudentsToAdd - transferCount;

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title="Confirm Student Transfers"
      size="md"
    >
      <div className="space-y-4">
        {/* Warning Icon and Message */}
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h4 className="font-medium text-yellow-800">
              {transferCount} student{transferCount !== 1 ? 's' : ''} will be transferred
            </h4>
            <p className="text-sm text-yellow-700 mt-1">
              The following students are currently assigned to other batches and will be moved to <strong>{targetBatch.batchName}</strong>.
            </p>
          </div>
        </div>

        {/* List of students to transfer grouped by source batch */}
        <div className="max-h-64 overflow-y-auto space-y-3">
          {Object.entries(studentsByBatch).map(([batchName, students]) => (
            <div key={batchName} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">
                  From: <span className="text-gray-900">{batchName}</span>
                </span>
                <span className="text-sm text-gray-500 ml-2">
                  ({students.length} student{students.length !== 1 ? 's' : ''})
                </span>
              </div>
              <ul className="divide-y divide-gray-100">
                {students.map((student) => (
                  <li key={student._id} className="px-4 py-2 flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-600">
                          {student.studentName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {student.studentName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {student.email}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-gray-50 p-3 rounded-lg text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">New assignments:</span>
            <span className="font-medium">{newAssignmentCount} student{newAssignmentCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600">Transfers:</span>
            <span className="font-medium text-yellow-700">{transferCount} student{transferCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex justify-between mt-1 pt-1 border-t border-gray-200">
            <span className="font-medium text-gray-700">Total to add:</span>
            <span className="font-semibold">{totalStudentsToAdd} student{totalStudentsToAdd !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              `Confirm & Transfer`
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default BatchTransferConfirmModal;
