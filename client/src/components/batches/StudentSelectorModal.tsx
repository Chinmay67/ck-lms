import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input from '../ui/Input';
import type { Batch, EligibleStudent } from '../../types/batch';
import { BatchAPI } from '../../services/api';

interface StudentSelectorModalProps {
  batch: Batch;
  onClose: () => void;
  onConfirm: (selectedStudents: EligibleStudent[], studentsToTransfer: EligibleStudent[]) => void;
}

const StudentSelectorModal: React.FC<StudentSelectorModalProps> = ({ batch, onClose, onConfirm }) => {
  const [students, setStudents] = useState<EligibleStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchEligibleStudents();
  }, [batch.id]);

  const fetchEligibleStudents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await BatchAPI.getEligibleStudents(batch.id);
      if (response.success && response.data) {
        setStudents(response.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch eligible students');
    } finally {
      setLoading(false);
    }
  };

  // Filter students based on search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    
    const query = searchQuery.toLowerCase();
    return students.filter(student => 
      student.studentName.toLowerCase().includes(query) ||
      student.email.toLowerCase().includes(query) ||
      (student.phone && student.phone.includes(query))
    );
  }, [students, searchQuery]);

  // Separate unassigned and assigned students
  const unassignedStudents = useMemo(() => 
    filteredStudents.filter(s => !s.isAssigned), 
    [filteredStudents]
  );
  
  const assignedStudents = useMemo(() => 
    filteredStudents.filter(s => s.isAssigned), 
    [filteredStudents]
  );

  // Calculate available slots
  const currentCount = batch.currentStudentCount || 0;
  const maxStudents = batch.maxStudents;
  const availableSlots = maxStudents ? maxStudents - currentCount : Infinity;
  const selectedCount = selectedIds.size;
  const exceedsCapacity = selectedCount > availableSlots;

  // Toggle selection
  const toggleSelection = (studentId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  // Select all unassigned (visible in current filter)
  const selectAllUnassigned = () => {
    const newSet = new Set(selectedIds);
    unassignedStudents.forEach(s => newSet.add(s._id));
    setSelectedIds(newSet);
  };

  // Clear all selections
  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Handle confirm
  const handleConfirm = () => {
    const selectedStudents = students.filter(s => selectedIds.has(s._id));
    const studentsToTransfer = selectedStudents.filter(s => s.isAssigned);
    onConfirm(selectedStudents, studentsToTransfer);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Add Students to ${batch.batchName}`}
      size="xl"
    >
      <div className="space-y-4">
        {/* Capacity Info */}
        <div className="bg-gray-50 p-3 rounded-lg flex items-center justify-between">
          <div className="text-sm">
            <span className="text-gray-600">Current capacity:</span>
            <span className="ml-2 font-semibold">
              {currentCount}{maxStudents ? ` / ${maxStudents}` : ' (unlimited)'}
            </span>
          </div>
          <div className={`text-sm font-medium ${exceedsCapacity ? 'text-red-600' : 'text-green-600'}`}>
            {selectedCount} selected
            {maxStudents && (
              <span className="text-gray-500 ml-1">
                • {availableSlots === Infinity ? '∞' : availableSlots} slot{availableSlots !== 1 ? 's' : ''} available
              </span>
            )}
          </div>
        </div>

        {exceedsCapacity && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
            ⚠️ Selection exceeds available capacity. Please select at most {availableSlots} student{availableSlots !== 1 ? 's' : ''}.
          </div>
        )}

        {/* Search and Actions */}
        <div className="flex gap-3 items-center">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={selectAllUnassigned}
            disabled={unassignedStudents.length === 0}
          >
            Select All Unassigned
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={clearSelection}
            disabled={selectedIds.size === 0}
          >
            Clear
          </Button>
        </div>

        {/* Students List */}
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading eligible students...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-600">
              {searchQuery 
                ? 'No students match your search criteria.' 
                : 'No eligible students found for this batch\'s stage and level.'}
            </p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="w-12 px-4 py-3 text-left">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Batch
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Unassigned students first */}
                {unassignedStudents.map((student) => (
                  <tr 
                    key={student._id} 
                    className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(student._id) ? 'bg-blue-50' : ''}`}
                    onClick={() => toggleSelection(student._id)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(student._id)}
                        onChange={() => toggleSelection(student._id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {student.studentName}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{student.email}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{student.phone || '-'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge className="bg-green-100 text-green-800">
                        Unassigned
                      </Badge>
                    </td>
                  </tr>
                ))}
                
                {/* Divider if both sections have items */}
                {unassignedStudents.length > 0 && assignedStudents.length > 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-2 bg-gray-100">
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        Students in other batches (will be transferred)
                      </span>
                    </td>
                  </tr>
                )}
                
                {/* Assigned students */}
                {assignedStudents.map((student) => (
                  <tr 
                    key={student._id} 
                    className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(student._id) ? 'bg-yellow-50' : ''}`}
                    onClick={() => toggleSelection(student._id)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(student._id)}
                        onChange={() => toggleSelection(student._id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {student.studentName}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{student.email}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{student.phone || '-'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge className="bg-yellow-100 text-yellow-800">
                        In: {student.currentBatchName}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''} found
            {searchQuery && ` matching "${searchQuery}"`}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleConfirm}
              disabled={selectedIds.size === 0 || exceedsCapacity}
            >
              Add {selectedIds.size} Student{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default StudentSelectorModal;
