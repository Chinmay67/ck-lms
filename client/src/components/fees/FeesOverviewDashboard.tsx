import { useState, useEffect } from 'react';
import type { FeeStats, FeeRecord } from '../../types/student';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FaUsers, FaCheckCircle, FaClock, FaExclamationTriangle, FaHourglassHalf, FaUpload } from 'react-icons/fa';
import { BulkFeeUploadModal } from './BulkFeeUploadModal';

const FeesOverviewDashboard = () => {
  const [stats, setStats] = useState<FeeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);

  useEffect(() => {
    fetchFeeStats();
  }, []);

  const fetchFeeStats = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ success: boolean; data: FeeStats }>('/fees/stats');
      if (response.data.success && response.data.data) {
        setStats(response.data.data);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch fee statistics');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'INR') => {
    return `${currency} ${(amount ?? 0).toLocaleString()}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'text-accent-600 bg-accent-50';
      case 'upcoming':
        return 'text-secondary-600 bg-secondary-50';
      case 'overdue':
        return 'text-red-600 bg-red-50';
      case 'partially_paid':
        return 'text-primary-600 bg-primary-50';
      default:
        return 'text-text-tertiary bg-primary-50';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-surface rounded-xl shadow-navy border border-border">
        <div className="animate-spin rounded-full h-10 w-10 md:h-12 md:w-12 border-b-2 border-primary-600"></div>
        <p className="mt-4 text-sm text-text-secondary">Loading fee statistics...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8 md:py-12 bg-surface rounded-xl shadow-navy border border-border">
        <FaExclamationTriangle className="w-10 h-10 md:w-12 md:h-12 text-warning-500 mx-auto mb-3" />
        <p className="text-text-secondary text-sm md:text-base">Unable to load fee statistics.</p>
        <button
          onClick={fetchFeeStats}
          className="mt-4 px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-glow transition-all text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-bold text-text-primary">Fees Overview</h2>
        <div className="flex gap-2 md:gap-3 w-full sm:w-auto">
          <button
            onClick={() => setShowBulkUploadModal(true)}
            className="flex-1 sm:flex-initial px-3 md:px-4 py-2 bg-gradient-secondary text-white rounded-xl hover:shadow-gold transition-all btn-hover flex items-center justify-center gap-2 text-sm md:text-base"
          >
            <FaUpload className="text-sm md:text-base" />
            <span className="hidden sm:inline">Bulk Upload</span>
            <span className="sm:hidden">Upload</span>
          </button>
          <button
            onClick={fetchFeeStats}
            className="flex-1 sm:flex-initial px-3 md:px-4 py-2 bg-gradient-primary text-white rounded-xl hover:shadow-glow transition-all btn-hover text-sm md:text-base"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Bulk Upload Modal */}
      <BulkFeeUploadModal
        isOpen={showBulkUploadModal}
        onClose={() => setShowBulkUploadModal(false)}
        onSuccess={() => {
          setShowBulkUploadModal(false);
          fetchFeeStats();
          toast.success('Fees uploaded successfully!');
        }}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
        <div className="bg-surface rounded-xl shadow-navy p-4 md:p-5 border-l-4 border-primary-600 hover:shadow-lg transition-all duration-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm font-medium text-text-secondary mb-1">Total Students</p>
              <p className="text-xl md:text-2xl lg:text-3xl font-bold text-text-primary">
                {stats.totalStudents}
              </p>
            </div>
            <div className="p-2.5 md:p-3 bg-primary-100 rounded-xl flex-shrink-0">
              <FaUsers className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-primary-600" />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-navy p-4 md:p-5 border-l-4 border-accent-600 hover:shadow-lg transition-all duration-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm font-medium text-text-secondary mb-1">Fees Paid</p>
              <p className="text-xl md:text-2xl lg:text-3xl font-bold text-text-primary">
                {stats.paidStudents}
              </p>
              <p className="text-[10px] md:text-xs text-accent-600 font-medium mt-1.5 truncate">
                {formatCurrency(stats.totalCollected)}
              </p>
            </div>
            <div className="p-2.5 md:p-3 bg-accent-100 rounded-xl flex-shrink-0">
              <FaCheckCircle className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-accent-600" />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-navy p-4 md:p-5 border-l-4 border-secondary-600 hover:shadow-lg transition-all duration-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm font-medium text-text-secondary mb-1">Upcoming</p>
              <p className="text-xl md:text-2xl lg:text-3xl font-bold text-text-primary">
                {stats.upcomingStudents}
              </p>
              <p className="text-[10px] md:text-xs text-secondary-600 font-medium mt-1.5 truncate">
                {formatCurrency(stats.totalUpcoming)}
              </p>
            </div>
            <div className="p-2.5 md:p-3 bg-secondary-100 rounded-xl flex-shrink-0">
              <FaClock className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-secondary-600" />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-navy p-4 md:p-5 border-l-4 border-error-600 hover:shadow-lg transition-all duration-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm font-medium text-text-secondary mb-1">Overdue</p>
              <p className="text-xl md:text-2xl lg:text-3xl font-bold text-text-primary">
                {stats.overdueStudentsCount}
              </p>
              <p className="text-[10px] md:text-xs text-error-600 font-medium mt-1.5 truncate">
                {formatCurrency(stats.totalOverdue)}
              </p>
            </div>
            <div className="p-2.5 md:p-3 bg-error-100 rounded-xl flex-shrink-0">
              <FaExclamationTriangle className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-error-600" />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-navy p-4 md:p-5 border-l-4 border-warning-600 hover:shadow-lg transition-all duration-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm font-medium text-text-secondary mb-1">Partially Paid</p>
              <p className="text-xl md:text-2xl lg:text-3xl font-bold text-text-primary">
                {stats.partiallyPaidStudents}
              </p>
              <p className="text-[10px] md:text-xs text-warning-600 font-medium mt-1.5 truncate">
                {formatCurrency(stats.totalPartiallyPaid)}
              </p>
            </div>
            <div className="p-2.5 md:p-3 bg-warning-100 rounded-xl flex-shrink-0">
              <FaHourglassHalf className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-warning-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Stage Breakdown */}
      <div className="bg-surface rounded-xl shadow-navy p-4 md:p-6 border border-border">
        <h3 className="text-base md:text-lg font-bold text-text-primary mb-4 md:mb-5 flex items-center gap-2">
          <div className="w-1 h-5 md:h-6 bg-gradient-primary rounded-full"></div>
          Stage-wise Breakdown
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {Object.entries(stats.stageBreakdown).map(([stage, data]) => (
            <div key={stage} className="border border-border rounded-xl p-4 md:p-5 bg-surface-alt hover:shadow-md transition-all duration-200">
              <h4 className="font-bold text-text-primary mb-3 capitalize text-sm md:text-base flex items-center gap-2">
                <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
                {stage}
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs md:text-sm text-text-secondary">Total Students:</span>
                  <span className="text-xs md:text-sm font-bold text-text-primary">{data.students}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs md:text-sm text-text-secondary">Fees Paid:</span>
                  <span className="text-xs md:text-sm font-bold text-accent-600">{data.paidStudents}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs md:text-sm text-text-secondary">Collected:</span>
                  <span className="text-xs md:text-sm font-semibold text-accent-600 truncate">
                    {formatCurrency(data.collected)}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs md:text-sm text-text-secondary">Upcoming:</span>
                  <span className="text-xs md:text-sm font-semibold text-secondary-600 truncate">
                    {formatCurrency(data.upcoming)}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs md:text-sm text-text-secondary">Overdue:</span>
                  <span className="text-xs md:text-sm font-semibold text-error-600 truncate">
                    {formatCurrency(data.overdue)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Recent Payments */}
        <div className="bg-surface rounded-xl shadow-navy p-4 md:p-6 border border-border">
          <h3 className="text-base md:text-lg font-bold text-text-primary mb-4 md:mb-5 flex items-center gap-2">
            <div className="w-1 h-5 md:h-6 bg-gradient-to-b from-accent-500 to-accent-600 rounded-full"></div>
            Recent Payments
          </h3>
          <div className="space-y-0 max-h-64 md:max-h-96 overflow-y-auto custom-scrollbar">
            {stats.recentPayments.length > 0 ? (
              stats.recentPayments.map((payment , _) => (
                <div key={payment._id} className="border-b border-border py-3 last:border-b-0 hover:bg-accent-50/30 -mx-2 px-2 rounded-lg transition-colors duration-150">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-text-primary text-sm md:text-base truncate">{payment.studentName}</p>
                      <p className="text-xs md:text-sm text-text-secondary capitalize mt-0.5">
                        {payment.stage} - Level {payment.level}
                      </p>
                      <p className="text-xs text-text-tertiary truncate mt-0.5">{payment.feeMonth}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-accent-600 text-sm md:text-base whitespace-nowrap">
                        {formatCurrency(payment.paidAmount)}
                      </p>
                      <span className={`inline-block px-2 py-0.5 text-[10px] md:text-xs font-semibold rounded-full mt-1 ${getStatusColor(payment.status)}`}>
                        {getStatusLabel(payment.status)}
                      </span>
                      {payment.paymentDate && (
                        <p className="text-[10px] md:text-xs text-text-tertiary mt-1">
                          {new Date(payment.paymentDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <FaCheckCircle className="w-10 h-10 text-text-tertiary mx-auto mb-2 opacity-50" />
                <p className="text-text-secondary text-sm">No recent payments found</p>
              </div>
            )}
          </div>
        </div>

        {/* Overdue Students */}
        <div className="bg-surface rounded-xl shadow-navy p-4 md:p-6 border border-border">
          <h3 className="text-base md:text-lg font-bold text-text-primary mb-4 md:mb-5 flex items-center gap-2">
            <div className="w-1 h-5 md:h-6 bg-gradient-to-b from-error-500 to-error-600 rounded-full"></div>
            Overdue Students
          </h3>
          <div className="space-y-0 max-h-64 md:max-h-96 overflow-y-auto custom-scrollbar">
            {stats.overdueStudents.length > 0 ? (
              stats.overdueStudents.map((student, index) => (
                <div key={`${student.studentId}-${index}`} className="border-b border-border py-3 last:border-b-0 hover:bg-error-50/30 -mx-2 px-2 rounded-lg transition-colors duration-150">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-text-primary text-sm md:text-base truncate">{student.studentName}</p>
                      <p className="text-xs md:text-sm text-text-secondary capitalize mt-0.5">
                        {student.stage} - Level {student.level}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <FaExclamationTriangle className="w-3 h-3 text-error-500" />
                        <p className="text-xs text-error-600 font-medium">
                          {student.overdueMonths} month{student.overdueMonths > 1 ? 's' : ''} overdue
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-error-600 text-sm md:text-base whitespace-nowrap">
                        {formatCurrency(student.overdueAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <FaCheckCircle className="w-10 h-10 text-accent-500 mx-auto mb-2" />
                <p className="text-text-secondary text-sm">No overdue students! 🎉</p>
                <p className="text-text-tertiary text-xs mt-1">All fees are up to date</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeesOverviewDashboard;
