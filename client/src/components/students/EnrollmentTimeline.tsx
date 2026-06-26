import { useState } from 'react';
import {
  PauseCircle, LogOut, Activity,
  ChevronDown, ChevronUp, Lock, Unlock, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminStudentsAPI } from '../../services/api';
import Button from '../ui/Button';

export interface Enrollment {
  _id: string;
  studentId: string;
  batchId?: { _id: string; batchName: string; batchCode: string } | null;
  courseId?: { _id: string; displayName: string } | null;
  stageNumber: number;
  levelNumber: number;
  grossFee: number;
  monthlyFee: number;
  discountType: 'none' | 'percentage' | 'fixed';
  discountPct: number;
  discountAmount: number;
  discountReason?: string;
  feeGrandfathered: boolean;
  feeNote?: string;
  feeOverridden: boolean;
  startDate: string;
  endDate: string | null;
  endReason: 'upgraded' | 'batch_change' | 'fee_change' | 'left' | 'inactive' | 'paused' | null;
  pausedUntil?: string | null;
  isActive?: boolean;
}

interface EnrollmentTimelineProps {
  enrollments: Enrollment[];
  studentId: string;
  isActive: boolean;
  onAction: () => void; // refresh callback
}

const END_REASON_META: Record<string, { label: string; color: string; dotColor: string }> = {
  upgraded:     { label: 'Upgraded',     color: 'text-primary-400',    dotColor: 'bg-primary-400' },
  fee_change:   { label: 'Fee change',   color: 'text-secondary-400',  dotColor: 'bg-secondary-400' },
  batch_change: { label: 'Batch change', color: 'text-text-secondary', dotColor: 'bg-text-secondary' },
  paused:       { label: 'Paused',       color: 'text-warning-500',    dotColor: 'bg-warning-500' },
  left:         { label: 'Left',         color: 'text-error-600',      dotColor: 'bg-error-600' },
  inactive:     { label: 'Inactive',     color: 'text-text-tertiary',  dotColor: 'bg-text-tertiary' },
};

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtFee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

// ── Action modals (inline, minimal) ─────────────────────────────

function ConfirmModal({
  title, message, confirmLabel, onConfirm, onCancel, danger = false,
  children,
}: {
  title: string; message: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-surface border border-white/10 rounded-xl shadow-navy-lg w-full max-w-md p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary">{message}</p>
        {children}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export default function EnrollmentTimeline({ enrollments, studentId, isActive, onAction }: EnrollmentTimelineProps) {
  const [expanded, setExpanded] = useState<string | null>(enrollments[0]?._id ?? null);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<
    | { type: 'pause'; pausedUntil: string }
    | { type: 'resume' }
    | { type: 'leave' }
    | { type: 'grandfather'; grandfathered: boolean }
    | null
  >(null);

  async function runAction(fn: () => Promise<any>, successMsg: string) {
    setLoading(true);
    setDialog(null);
    try {
      await fn();
      toast.success(successMsg);
      onAction();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e.message ?? 'Action failed');
    } finally {
      setLoading(false);
    }
  }

  const active = enrollments.find((e) => e.endDate === null);
  const lastPaused = enrollments.find((e) => e.endReason === 'paused');
  const canResume = !isActive && !!lastPaused && !active;

  return (
    <div className="space-y-3">
      {/* Action bar */}
      {active && (
        <div className="flex flex-wrap gap-2 pb-3 border-b border-white/7">
          <Button
            size="sm" variant="outline"
            onClick={() => setDialog({ type: 'pause', pausedUntil: '' })}
            disabled={loading}
          >
            <PauseCircle className="w-3.5 h-3.5" /> Pause
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => setDialog({ type: 'leave' })}
            disabled={loading}
          >
            <LogOut className="w-3.5 h-3.5" /> Mark as left
          </Button>
          <Button
            size="sm"
            variant={active.feeGrandfathered ? 'secondary' : 'outline'}
            onClick={() => setDialog({ type: 'grandfather', grandfathered: !active.feeGrandfathered })}
            disabled={loading}
          >
            {active.feeGrandfathered
              ? <><Unlock className="w-3.5 h-3.5" /> Un-grandfather fee</>
              : <><Lock className="w-3.5 h-3.5" /> Grandfather fee</>}
          </Button>
        </div>
      )}
      {canResume && (
        <div className="flex gap-2 pb-3 border-b border-white/7">
          <Button size="sm" variant="primary" onClick={() => setDialog({ type: 'resume' })} disabled={loading}>
            <Activity className="w-3.5 h-3.5" /> Resume enrollment
          </Button>
        </div>
      )}

      {/* Timeline */}
      {enrollments.length === 0 && (
        <p className="text-sm text-text-tertiary py-6 text-center">No enrollment history yet.</p>
      )}
      <div className="relative">
        {/* Vertical line */}
        {enrollments.length > 1 && (
          <div className="absolute left-[11px] top-4 bottom-4 w-px bg-white/7" />
        )}
        <div className="space-y-2">
          {enrollments.map((enr) => {
            const isOpen = enr.endDate === null;
            const meta = enr.endReason ? END_REASON_META[enr.endReason] : null;
            const isExpanded = expanded === enr._id;
            const hasDiscount = enr.discountType !== 'none' && (enr.discountPct > 0 || enr.discountAmount > 0);

            return (
              <div key={enr._id} className="relative pl-7">
                {/* Dot */}
                <span
                  className={`absolute left-0 top-3.5 w-[11px] h-[11px] rounded-full border-2 border-background z-10
                    ${isOpen
                      ? 'bg-accent-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                      : (meta?.dotColor ?? 'bg-text-tertiary')
                    }`}
                />

                <div
                  className={`rounded-lg border transition-colors cursor-pointer
                    ${isOpen
                      ? 'border-accent-400/20 bg-accent-400/5'
                      : 'border-white/7 bg-surface-alt hover:border-white/12'
                    }`}
                >
                  {/* Header row */}
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                    onClick={() => setExpanded(isExpanded ? null : enr._id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${isOpen ? 'text-text-primary' : 'text-text-secondary'}`}>
                          Stage {enr.stageNumber} / Level {enr.levelNumber}
                        </span>
                        {isOpen && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent-400/15 text-accent-400 text-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
                            Active
                          </span>
                        )}
                        {enr.feeGrandfathered && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-secondary-600/20 text-secondary-400 text-xs">
                            <Lock className="w-2.5 h-2.5" /> Grandfathered
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-text-secondary">
                          {fmt(enr.startDate)} → {enr.endDate ? fmt(enr.endDate) : 'present'}
                        </span>
                        {meta && (
                          <span className={`text-xs ${meta.color}`}>· {meta.label}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-text-primary">{fmtFee(enr.monthlyFee)}/mo</div>
                      {hasDiscount && (
                        <div className="text-xs text-text-tertiary line-through">{fmtFee(enr.grossFee)}</div>
                      )}
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
                      : <ChevronDown className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
                    }
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-white/7 pt-2.5 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div>
                        <span className="text-text-tertiary">Batch</span>
                        <div className="text-text-secondary mt-0.5">
                          {enr.batchId ? `${enr.batchId.batchName} (${enr.batchId.batchCode})` : '—'}
                        </div>
                      </div>
                      <div>
                        <span className="text-text-tertiary">Gross fee</span>
                        <div className="text-text-secondary mt-0.5">{fmtFee(enr.grossFee)}</div>
                      </div>
                      {hasDiscount && (
                        <>
                          <div>
                            <span className="text-text-tertiary">Discount</span>
                            <div className="text-text-secondary mt-0.5">
                              {enr.discountType === 'percentage'
                                ? `${enr.discountPct}% off`
                                : `₹${enr.discountAmount} off`}
                            </div>
                          </div>
                          {enr.discountReason && (
                            <div>
                              <span className="text-text-tertiary">Reason</span>
                              <div className="text-text-secondary mt-0.5">{enr.discountReason}</div>
                            </div>
                          )}
                        </>
                      )}
                      {enr.feeOverridden && (
                        <div className="col-span-2 flex items-center gap-1 text-warning-500">
                          <AlertCircle className="w-3 h-3" />
                          Fee manually overridden (differs from course rate)
                        </div>
                      )}
                      {enr.feeNote && (
                        <div className="col-span-2">
                          <span className="text-text-tertiary">Note</span>
                          <div className="text-text-secondary mt-0.5 italic">"{enr.feeNote}"</div>
                        </div>
                      )}
                      {enr.endReason === 'paused' && enr.pausedUntil && (
                        <div className="col-span-2">
                          <span className="text-text-tertiary">Expected return</span>
                          <div className="text-warning-500 mt-0.5">{fmt(enr.pausedUntil)}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dialogs */}
      {dialog?.type === 'pause' && (
        <ConfirmModal
          title="Pause enrollment"
          message="Student will be marked inactive. No new invoices should be generated while paused."
          confirmLabel="Pause"
          onCancel={() => setDialog(null)}
          onConfirm={() => runAction(
            () => AdminStudentsAPI.pause(studentId, { pausedUntil: dialog.pausedUntil || new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0] }),
            'Enrollment paused',
          )}
        >
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Expected return date</label>
            <input
              type="date"
              value={dialog.pausedUntil}
              onChange={(e) => setDialog({ type: 'pause', pausedUntil: e.target.value })}
              className="w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500"
            />
          </div>
        </ConfirmModal>
      )}
      {dialog?.type === 'resume' && (
        <ConfirmModal
          title="Resume enrollment"
          message="A new enrollment will be created from today, copying the last paused enrollment's course, level, and fee."
          confirmLabel="Resume"
          onCancel={() => setDialog(null)}
          onConfirm={() => runAction(
            () => AdminStudentsAPI.resume(studentId, {}),
            'Enrollment resumed',
          )}
        />
      )}
      {dialog?.type === 'leave' && (
        <ConfirmModal
          title="Mark as left"
          message="This will permanently close the enrollment. The student record is kept for history. This cannot be undone — use Pause instead if they may return."
          confirmLabel="Mark as left"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => runAction(
            () => AdminStudentsAPI.leave(studentId, {}),
            'Student marked as left',
          )}
        />
      )}
      {dialog?.type === 'grandfather' && (
        <ConfirmModal
          title={dialog.grandfathered ? 'Grandfather fee' : 'Remove grandfather'}
          message={dialog.grandfathered
            ? 'This student will be excluded from the fee divergence report. Their fee is intentionally different from the current course rate.'
            : 'This student will appear in the fee divergence report again if their fee differs from the current course rate.'}
          confirmLabel={dialog.grandfathered ? 'Grandfather' : 'Remove'}
          onCancel={() => setDialog(null)}
          onConfirm={() => runAction(
            () => AdminStudentsAPI.grandfather(studentId, { grandfathered: dialog.grandfathered }),
            dialog.grandfathered ? 'Fee grandfathered' : 'Grandfather removed',
          )}
        />
      )}
    </div>
  );
}
