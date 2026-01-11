import React, { useState, useEffect } from 'react';
import { FaExclamationTriangle, FaRedo } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { BatchAPI } from '../../services/api';
import type { Batch, BatchStats, BatchFilters } from '../../types/batch';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { DAY_NAMES, STAGE_OPTIONS, LEVEL_OPTIONS, STATUS_OPTIONS } from '../../types/batch';
import BatchModal from './BatchModal';
import BatchStudentsModal from './BatchStudentsModal';
import { getErrorMessage, isNetworkError, showErrorToast } from '../../utils/errorHandler';

export const BatchManagementPanel: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [stats, setStats] = useState<BatchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<BatchFilters>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [isStudentsModalOpen, setIsStudentsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'network' | 'server' | 'general'>('general');

  useEffect(() => {
    fetchBatches();
    fetchStats();
  }, [filters]);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await BatchAPI.getBatches(filters);
      if (response.success && response.data) {
        setBatches(response.data);
      } else {
        setError(response.error || 'Unable to load batches');
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

  const fetchStats = async () => {
    try {
      const response = await BatchAPI.getBatchStats();
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (err) {
      // Silently fail - stats are supplementary
      console.error('Failed to fetch batch stats:', getErrorMessage(err));
    }
  };

  const handleRetry = () => {
    setError(null);
    fetchBatches();
    fetchStats();
  };

  const handleCreateBatch = () => {
    setSelectedBatch(null);
    setIsModalOpen(true);
  };

  const handleEditBatch = (batch: Batch) => {
    setSelectedBatch(batch);
    setIsModalOpen(true);
  };

  const handleViewStudents = (batch: Batch) => {
    setSelectedBatch(batch);
    setIsStudentsModalOpen(true);
  };

  const handleEndBatch = async (batchId: string) => {
    if (!confirm('Are you sure you want to end this batch? This action cannot be undone. Students will remain in the batch but no new students can be enrolled.')) {
      return;
    }

    try {
      const response = await BatchAPI.endBatch(batchId);
      if (response.success) {
        toast.success('Batch ended successfully');
        fetchBatches();
        fetchStats();
      }
    } catch (err: any) {
      showErrorToast(err, 'Failed to end batch');
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Are you sure you want to delete this batch? This action cannot be undone. You can only delete batches that have no students assigned.')) {
      return;
    }

    try {
      const response = await BatchAPI.deleteBatch(batchId);
      if (response.success) {
        toast.success('Batch deleted successfully');
        fetchBatches();
        fetchStats();
      }
    } catch (err: any) {
      showErrorToast(err, 'Failed to delete batch');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'ended': return 'bg-gray-100 text-gray-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'beginner': return 'bg-blue-100 text-blue-800';
      case 'intermediate': return 'bg-purple-100 text-purple-800';
      case 'advanced': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatSchedule = (batch: Batch) => {
    if (!batch.schedule || batch.schedule.length === 0) {
      return 'No schedule set';
    }
    return batch.schedule
      .map(s => `${DAY_NAMES[s.dayOfWeek]} ${s.startTime}`)
      .join(', ');
  };

  // Loading state
  if (loading && batches.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Batch Management</h2>
            <p className="text-gray-600 mt-1">Loading batches...</p>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-900 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  // Error state with retry
  if (error && batches.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Batch Management</h2>
            <p className="text-gray-600 mt-1">Manage student batches, schedules, and capacity</p>
          </div>
        </div>
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className={`mb-4 p-4 rounded-full ${errorType === 'network' ? 'bg-orange-100' : 'bg-red-100'}`}>
              <FaExclamationTriangle className={`h-8 w-8 ${errorType === 'network' ? 'text-orange-500' : 'text-red-500'}`} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {errorType === 'network' ? 'Connection Error' : 'Unable to Load Batches'}
            </h3>
            <p className="text-gray-600 max-w-md mb-4">
              {error}
            </p>
            <Button onClick={handleRetry}>
              <FaRedo className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Batch Management</h2>
          <p className="text-gray-600 mt-1">Manage student batches, schedules, and capacity</p>
        </div>
        <Button onClick={handleCreateBatch}>
          Create New Batch
        </Button>
      </div>

      {/* Error banner (when there's data but refresh failed) */}
      {error && batches.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center">
            <FaExclamationTriangle className="h-5 w-5 text-yellow-500 mr-3" />
            <span className="text-yellow-700">{error}</span>
          </div>
          <button onClick={handleRetry} className="text-yellow-700 hover:text-yellow-800 font-medium">
            Retry
          </button>
        </div>
      )}

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-sm text-gray-600">Total Batches</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.totalBatches}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-600">Active Batches</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{stats.activeBatches}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-600">Total Enrolled</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{stats.totalEnrolled}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-600">Utilization Rate</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {stats.utilizationRate !== null ? `${Math.round(stats.utilizationRate)}%` : 'N/A'}
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as any || undefined })}
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.stage || ''}
              onChange={(e) => setFilters({ ...filters, stage: e.target.value as any || undefined })}
            >
              <option value="">All Stages</option>
              {STAGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.level || ''}
              onChange={(e) => setFilters({ ...filters, level: e.target.value ? parseInt(e.target.value) : undefined })}
            >
              <option value="">All Levels</option>
              {LEVEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Batches List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading batches...</p>
        </div>
      ) : error ? (
        <Card className="p-6">
          <p className="text-red-600">{error}</p>
        </Card>
      ) : batches.length === 0 ? (
        <EmptyState
          title="No batches found"
          description="Create your first batch to get started"
          action={
            <Button onClick={handleCreateBatch}>
              Create Batch
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {batches.map((batch) => (
            <Card key={batch.id} className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{batch.batchName}</h3>
                  <p className="text-sm text-gray-600">{batch.batchCode}</p>
                </div>
                <Badge className={getStatusColor(batch.status)}>
                  {batch.status}
                </Badge>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm">
                  <span className="text-gray-600 w-24">Stage/Level:</span>
                  <Badge className={getStageColor(batch.stage)}>
                    {batch.stage} {batch.level}
                  </Badge>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-gray-600 w-24">Students:</span>
                  <span className="text-gray-900 font-medium">
                    {batch.currentStudentCount || 0}
                    {batch.maxStudents && ` / ${batch.maxStudents}`}
                    {!batch.maxStudents && ' (unlimited)'}
                  </span>
                </div>
                <div className="flex items-start text-sm">
                  <span className="text-gray-600 w-24">Schedule:</span>
                  <span className="text-gray-900 flex-1">{formatSchedule(batch)}</span>
                </div>
                {batch.description && (
                  <div className="flex items-start text-sm">
                    <span className="text-gray-600 w-24">Description:</span>
                    <span className="text-gray-900 flex-1">{batch.description}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleViewStudents(batch)}
                >
                  View Students
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleEditBatch(batch)}
                >
                  Edit
                </Button>
                {batch.status === 'active' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEndBatch(batch.id)}
                  >
                    End Batch
                  </Button>
                )}
                {batch.status === 'draft' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDeleteBatch(batch.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modals */}
      {isModalOpen && (
        <BatchModal
          batch={selectedBatch}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedBatch(null);
          }}
          onSuccess={() => {
            fetchBatches();
            fetchStats();
            setIsModalOpen(false);
            setSelectedBatch(null);
          }}
        />
      )}

      {isStudentsModalOpen && selectedBatch && (
        <BatchStudentsModal
          batch={selectedBatch}
          onClose={() => {
            setIsStudentsModalOpen(false);
            setSelectedBatch(null);
          }}
          onStudentsUpdated={() => {
            fetchBatches();
            fetchStats();
          }}
        />
      )}
    </div>
  );
};

export default BatchManagementPanel;
