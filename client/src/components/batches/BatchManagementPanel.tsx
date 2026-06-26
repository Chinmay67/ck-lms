import React, { useState, useEffect } from 'react';
import { AlertTriangle, Pencil, RotateCcw, Square, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { BatchAPI, AdminCoursesAPI } from '../../services/api';
import type { Batch, BatchStats, BatchFilters } from '../../types/batch';
import type { Course, CourseStage, CourseLevel } from '../../types/course';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { DAY_NAMES, STATUS_OPTIONS } from '../../types/batch';
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

  // Course-driven filter options
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseStages, setCourseStages] = useState<CourseStage[]>([]);
  const [selectedStageNumber, setSelectedStageNumber] = useState<number | ''>('');
  const [selectedLevelNumber, setSelectedLevelNumber] = useState<number | ''>('');

  const selectedStage = courseStages.find((s) => s.stageNumber === selectedStageNumber) ?? null;
  const availableLevels: CourseLevel[] = selectedStage?.levels ?? [];

  // Lookup helpers
  const getCourseDisplayName = (courseId?: string): string => {
    if (!courseId) return '—';
    const c = courses.find((c) => (c.id || c._id) === courseId);
    return c?.displayName ?? '—';
  };

  const getStageName = (courseId: string | undefined, stageNumber: number): string => {
    if (!courseId) return `Stage ${stageNumber}`;
    const c = courses.find((c) => (c.id || c._id) === courseId);
    const stage = c?.stages?.find((s) => s.stageNumber === stageNumber);
    return stage?.stageName ?? `Stage ${stageNumber}`;
  };

  // Load courses on mount
  useEffect(() => {
    AdminCoursesAPI.list()
      .then((res) => {
        if (res.success && res.data && res.data.length > 0) {
          setCourses(res.data);
          const stages = res.data[0].stages ?? [];
          setCourseStages(stages);
        }
      })
      .catch(console.error);
  }, []);

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
      case 'active': return 'success';
      case 'ended':  return 'default';
      case 'draft':  return 'warning';
      default:       return 'default';
    }
  };

  const getStageVariant = (stage: string) => {
    switch (stage) {
      case 'beginner':     return 'info';
      case 'intermediate': return 'warning';
      case 'advanced':     return 'danger';
      default:             return 'default';
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

  if (loading && batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
        <p className="text-text-secondary text-sm mt-4">Loading batches…</p>
      </div>
    );
  }

  if (error && batches.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-text-primary">Batch Management</h2>
        </div>
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className={`mb-4 p-4 rounded-full ${errorType === 'network' ? 'bg-secondary-600/15' : 'bg-error-600/15'}`}>
              <AlertTriangle className={`h-8 w-8 ${errorType === 'network' ? 'text-secondary-400' : 'text-red-400'}`} />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-2">
              {errorType === 'network' ? 'Connection Error' : 'Unable to Load Batches'}
            </h3>
            <p className="text-text-secondary text-sm max-w-md mb-4">{error}</p>
            <Button onClick={handleRetry} variant="outline" size="sm">
              <RotateCcw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface rounded-lg border border-white/7 px-3 py-2.5 flex justify-between items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Batches</h2>
          <p className="text-xs text-text-tertiary">Capacity, schedules, and enrollment groups</p>
        </div>
        <Button onClick={handleCreateBatch} size="sm">
          Create New Batch
        </Button>
      </div>

      {/* Error banner */}
      {error && batches.length > 0 && (
        <div className="bg-secondary-600/10 border border-secondary-600/20 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-secondary-400" />
            <span className="text-secondary-400 text-sm">{error}</span>
          </div>
          <button onClick={handleRetry} className="text-secondary-400 hover:text-secondary-300 text-sm font-medium">Retry</button>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card padding="sm">
            <div className="text-xs text-text-tertiary">Total Batches</div>
            <div className="text-2xl font-bold text-text-primary mt-1">{stats.totalBatches}</div>
          </Card>
          <Card padding="sm">
            <div className="text-xs text-text-tertiary">Active</div>
            <div className="text-2xl font-bold text-accent-400 mt-1">{stats.activeBatches}</div>
          </Card>
          <Card padding="sm">
            <div className="text-xs text-text-tertiary">Total Enrolled</div>
            <div className="text-2xl font-bold text-primary-300 mt-1">{stats.totalEnrolled}</div>
          </Card>
          <Card padding="sm">
            <div className="text-xs text-text-tertiary">Utilization</div>
            <div className="text-2xl font-bold text-secondary-400 mt-1">
              {stats.utilizationRate !== null ? `${Math.round(stats.utilizationRate)}%` : '—'}
            </div>
          </Card>
        </div>
      )}

      <Card padding="sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Status</label>
            <select
              className="w-full h-9 bg-surface-alt border border-white/10 rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-400 hover:border-white/20 transition-colors"
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as any || undefined })}
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Course Stage — dynamic from course */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Course Stage</label>
            <select
              className="w-full h-9 bg-surface-alt border border-white/10 rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-400 hover:border-white/20 transition-colors"
              value={selectedStageNumber}
              onChange={(e) => {
                const sn = e.target.value ? Number(e.target.value) : '';
                setSelectedStageNumber(sn);
                setSelectedLevelNumber('');
                setFilters({ ...filters, stageNumber: sn || undefined, levelNumber: undefined });
              }}
            >
              <option value="">All Stages</option>
              {courseStages.map((s) => (
                <option key={s.stageNumber} value={s.stageNumber}>{s.stageName}</option>
              ))}
            </select>
          </div>

          {/* Level — dynamic from selected stage */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Level</label>
            <select
              className="w-full h-9 bg-surface-alt border border-white/10 rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-400 hover:border-white/20 transition-colors disabled:opacity-40"
              value={selectedLevelNumber}
              disabled={!selectedStageNumber}
              onChange={(e) => {
                const ln = e.target.value ? Number(e.target.value) : '';
                setSelectedLevelNumber(ln);
                setFilters({ ...filters, levelNumber: ln || undefined });
              }}
            >
              <option value="">All Levels</option>
              {availableLevels.map((l) => (
                <option key={l.levelNumber} value={l.levelNumber}>
                  Level {l.levelNumber}{l.feeAmount ? ` — ₹${l.feeAmount.toLocaleString()}/mo` : ''}
                </option>
              ))}
            </select>
            {!selectedStageNumber && (
              <p className="text-xs text-text-tertiary mt-1">Select a stage first</p>
            )}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-40 bg-surface rounded-lg border border-white/7">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          <p className="text-text-tertiary text-sm mt-3">Loading batches…</p>
        </div>
      ) : error ? (
        <div className="bg-surface rounded-lg border border-white/7 p-6 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          title="No batches found"
          description="Create your first batch to get started"
          action={<Button onClick={handleCreateBatch}>Create Batch</Button>}
        />
      ) : (
        <div className="bg-surface rounded-lg border border-white/7 overflow-hidden">
          <table className="min-w-full divide-y divide-white/7">
            <thead className="bg-surface-alt">
              <tr>
                {['Batch', 'Course › Stage › Level', 'Students', 'Schedule', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {batches.map((batch) => (
                <tr key={batch.id} className="group/brow hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-text-primary">{batch.batchName}</p>
                    <p className="text-xs text-text-tertiary mt-0.5">{batch.batchCode}</p>
                  </td>
                  {/* Course › Stage › Level hierarchy */}
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-tertiary">{getCourseDisplayName(batch.courseId)}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant={getStageVariant(batch.stage)} size="sm">
                        {getStageName(batch.courseId, batch.stageNumber)}
                      </Badge>
                      <span className="text-text-tertiary text-xs">›</span>
                      <span className="text-xs font-medium text-text-secondary">Level {batch.levelNumber || batch.level}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-text-secondary">
                      {batch.currentStudentCount || 0}
                      {batch.maxStudents ? `/${batch.maxStudents}` : ''}
                    </span>
                    {batch.maxStudents && (
                      <div className="w-16 h-1 bg-white/7 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-primary-500/60 rounded-full"
                          style={{ width: `${Math.min(100, ((batch.currentStudentCount || 0) / batch.maxStudents) * 100)}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-text-secondary">{formatSchedule(batch)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getStatusColor(batch.status)} dot size="sm">
                      {batch.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => handleViewStudents(batch)}
                        title="View students"
                        className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-primary-400 hover:bg-primary-600/15 transition-all text-xs font-medium"
                      >
                        <Users className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEditBatch(batch)}
                        title="Edit"
                        className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-primary-400 hover:bg-primary-600/15 transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {batch.status === 'active' && (
                        <button
                          onClick={() => handleEndBatch(batch.id)}
                          title="End batch"
                          className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-secondary-400 hover:bg-secondary-600/15 transition-all"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {batch.status === 'draft' && (
                        <button
                          onClick={() => handleDeleteBatch(batch.id)}
                          title="Delete"
                          className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-red-400 hover:bg-error-600/15 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
