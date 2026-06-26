import { useState, useEffect } from 'react';
import type { FeeStats } from '../../types/student';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Users, CheckCircle2, Clock, AlertTriangle, Hourglass } from 'lucide-react';

const FeesOverviewDashboard = () => {
  const [stats, setStats] = useState<FeeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeeStats();
  }, []);

  const fetchFeeStats = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ success: boolean; data: any }>('/v2/dashboard');
      if (response.data.success && response.data.data) {
        const dashboard = response.data.data;
        const stageBD = dashboard?.stageBreakdown ?? {};
        setStats({
          totalCollected: dashboard?.fees?.totalCollected ?? 0,
          totalUpcoming: dashboard?.fees?.totalOutstanding ?? 0,
          totalOverdue: dashboard?.fees?.totalOverdue ?? 0,
          totalPartiallyPaid: dashboard?.fees?.totalPartiallyPaid ?? 0,
          totalStudents: (dashboard?.students?.active ?? 0) + (dashboard?.students?.inactive ?? 0),
          paidStudents: dashboard?.fees?.paidStudents ?? 0,
          upcomingStudents: dashboard?.fees?.upcomingStudents ?? 0,
          overdueStudentsCount: dashboard?.overdueStudents?.length ?? 0,
          partiallyPaidStudents: dashboard?.fees?.partialStudents ?? 0,
          stageBreakdown: {
            beginner: stageBD.beginner ?? { collected: 0, upcoming: 0, overdue: 0, students: 0, paidStudents: 0 },
            intermediate: stageBD.intermediate ?? { collected: 0, upcoming: 0, overdue: 0, students: 0, paidStudents: 0 },
            advanced: stageBD.advanced ?? { collected: 0, upcoming: 0, overdue: 0, students: 0, paidStudents: 0 },
          },
          recentPayments: dashboard?.recentPayments ?? [],
          overdueStudents: dashboard?.overdueStudents ?? [],
        });
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-surface rounded-lg border border-white/7">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
        <p className="mt-4 text-sm text-text-secondary">Loading fee statistics…</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 bg-surface rounded-lg border border-white/7">
        <AlertTriangle className="w-10 h-10 text-secondary-500 mx-auto mb-3" />
        <p className="text-text-secondary text-sm">Unable to load fee statistics.</p>
        <button
          onClick={fetchFeeStats}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-500 transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  const totalStudents = stats.totalStudents || 1; // avoid /0

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={fetchFeeStats}
          className="px-3 py-2 bg-surface-alt border border-white/10 text-text-secondary rounded-lg text-sm hover:border-white/20 hover:text-text-primary transition-all"
        >
          Refresh
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            label: 'Total Students',
            value: stats.totalStudents,
            sub: null,
            icon: <Users className="w-4 h-4" />,
            accent: 'border-l-primary-500',
            iconColor: 'text-primary-400',
            bar: null,
          },
          {
            label: 'Fees Paid',
            value: stats.paidStudents,
            sub: formatCurrency(stats.totalCollected),
            icon: <CheckCircle2 className="w-4 h-4" />,
            accent: 'border-l-accent-500',
            iconColor: 'text-accent-400',
            bar: { pct: Math.round((stats.paidStudents / totalStudents) * 100), color: 'bg-accent-500' },
          },
          {
            label: 'Upcoming',
            value: stats.upcomingStudents,
            sub: formatCurrency(stats.totalUpcoming),
            icon: <Clock className="w-4 h-4" />,
            accent: 'border-l-secondary-500',
            iconColor: 'text-secondary-400',
            bar: { pct: Math.round((stats.upcomingStudents / totalStudents) * 100), color: 'bg-secondary-500' },
          },
          {
            label: 'Overdue',
            value: stats.overdueStudentsCount,
            sub: formatCurrency(stats.totalOverdue),
            icon: <AlertTriangle className="w-4 h-4" />,
            accent: 'border-l-red-500',
            iconColor: 'text-red-400',
            bar: { pct: Math.round((stats.overdueStudentsCount / totalStudents) * 100), color: 'bg-red-500' },
          },
          {
            label: 'Partial',
            value: stats.partiallyPaidStudents,
            sub: formatCurrency(stats.totalPartiallyPaid),
            icon: <Hourglass className="w-4 h-4" />,
            accent: 'border-l-warning-500',
            iconColor: 'text-secondary-400',
            bar: { pct: Math.round((stats.partiallyPaidStudents / totalStudents) * 100), color: 'bg-secondary-400' },
          },
        ].map((card) => (
          <div key={card.label} className={`bg-surface rounded-lg border border-white/7 p-4 border-l-2 ${card.accent} flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-tertiary">{card.label}</p>
              <span className={card.iconColor + ' opacity-50'}>{card.icon}</span>
            </div>
            <p className="text-2xl font-bold text-text-primary leading-none">{card.value}</p>
            {card.sub && <p className={`text-xs font-medium ${card.iconColor}`}>{card.sub}</p>}
            {card.bar && (
              <div className="w-full h-1 bg-white/7 rounded-full overflow-hidden mt-auto">
                <div
                  className={`h-full rounded-full ${card.bar.color} opacity-70 transition-all duration-500`}
                  style={{ width: `${Math.min(card.bar.pct, 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stage breakdown — horizontal bar chart */}
      <div className="bg-surface rounded-lg border border-white/7 p-5">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-4">Stage Breakdown</h3>
        <div className="space-y-4">
          {Object.entries(stats.stageBreakdown).map(([stage, data]) => {
            const total = (data.collected + data.upcoming + data.overdue) || 1;
            const collectedPct = Math.round((data.collected / total) * 100);
            const upcomingPct = Math.round((data.upcoming / total) * 100);
            const overduePct = Math.max(0, 100 - collectedPct - upcomingPct);
            return (
              <div key={stage} className="flex items-center gap-4">
                <span className="text-xs text-text-secondary capitalize w-24 flex-shrink-0">{stage}</span>
                <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-white/7 gap-px">
                  <div className="bg-accent-500/70 transition-all duration-500" style={{ width: `${collectedPct}%` }} />
                  <div className="bg-secondary-500/50 transition-all duration-500" style={{ width: `${upcomingPct}%` }} />
                  <div className="bg-red-500/60 transition-all duration-500" style={{ width: `${overduePct}%` }} />
                </div>
                <div className="flex gap-3 text-xs flex-shrink-0">
                  <span className="text-accent-400">{formatCurrency(data.collected)}</span>
                  <span className="text-text-tertiary">{data.students} students</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 pt-3 border-t border-white/7">
          {[
            { color: 'bg-accent-500/70', label: 'Collected' },
            { color: 'bg-secondary-500/50', label: 'Upcoming' },
            { color: 'bg-red-500/60', label: 'Overdue' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${l.color}`} />
              <span className="text-xs text-text-tertiary">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Payments */}
        <div className="bg-surface rounded-lg border border-white/7 p-5">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-4">Recent Payments</h3>
          <div className="space-y-0 max-h-72 overflow-y-auto custom-scrollbar">
            {stats.recentPayments.length > 0 ? (
              stats.recentPayments.map((payment) => (
                <div key={payment._id} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-b-0 gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-accent-600/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-accent-400">
                        {payment.studentName?.charAt(0)?.toUpperCase() ?? '?'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{payment.studentName}</p>
                      {payment.paymentDate && (
                        <p className="text-xs text-text-tertiary">
                          {new Date(payment.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          {payment.paymentMethod && ` · ${payment.paymentMethod}`}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-accent-400 flex-shrink-0">{formatCurrency(payment.amount)}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 className="w-8 h-8 text-text-tertiary mx-auto mb-2 opacity-20" />
                <p className="text-text-tertiary text-xs">No recent payments</p>
              </div>
            )}
          </div>
        </div>

        {/* Overdue Students */}
        <div className="bg-surface rounded-lg border border-white/7 p-5">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-4">Overdue Students</h3>
          <div className="space-y-0 max-h-72 overflow-y-auto custom-scrollbar">
            {stats.overdueStudents.length > 0 ? (
              stats.overdueStudents.map((student, index) => (
                <div key={`${student.studentId}-${index}`} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-b-0 gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-1.5 h-7 rounded-full bg-red-500/70 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{student.studentName}</p>
                      {(student.stageNumber || student.levelNumber) && (
                        <p className="text-xs text-text-tertiary">
                          {student.stageNumber ? `Stage ${student.stageNumber}` : ''}{student.levelNumber ? ` · L${student.levelNumber}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-red-400 flex-shrink-0">{formatCurrency(student.overdueAmount)}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 className="w-8 h-8 text-text-tertiary mx-auto mb-2 opacity-20" />
                <p className="text-text-tertiary text-xs">No overdue students</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeesOverviewDashboard;
