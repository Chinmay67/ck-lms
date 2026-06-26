import { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Lock, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminCoursesAPI } from '../../services/api';
import Button from '../ui/Button';

interface DivergentEnrollment {
  enrollmentId: string;
  student: {
    _id: string;
    studentName: string;
    phone?: string;
    studentCode?: string;
  };
  stageNumber: number;
  levelNumber: number;
  enrollmentFee: number;   // grossFee on enrollment
  effectiveFee: number;    // monthlyFee (after discount)
  currentCourseFee: number;
  feeDelta: number;
  enrollmentStartDate: string;
}

type Decision = 'upgrade' | 'keep' | null;

interface Props {
  courseId: string;
  stageNum: number;
  levelNum: number;
  oldFee: number;
  newFee: number;
  onClose: () => void;
}

export default function FeeDivergencePanel({ courseId, stageNum, levelNum, oldFee, newFee, onClose }: Props) {
  const [enrollments, setEnrollments] = useState<DivergentEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [effectiveDate, setEffectiveDate] = useState<string>(() => {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return next.toISOString().split('T')[0];
  });
  const [grandfatherNote, setGrandfatherNote] = useState('Kept on previous fee rate');
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    AdminCoursesAPI.getFeeDivergence(courseId)
      .then((res) => {
        if (res.success && res.data) {
          // Only show diverged students at this specific stage+level
          const relevant = (res.data.enrollments ?? []).filter(
            (e: DivergentEnrollment) => e.stageNumber === stageNum && e.levelNumber === levelNum,
          );
          setEnrollments(relevant);
          // Default all to 'upgrade'
          const init: Record<string, Decision> = {};
          relevant.forEach((e: DivergentEnrollment) => { init[e.enrollmentId] = 'upgrade'; });
          setDecisions(init);
        }
      })
      .catch(() => toast.error('Failed to load diverged students'))
      .finally(() => setLoading(false));
  }, [courseId, stageNum, levelNum]);

  function setAll(d: Decision) {
    const next: Record<string, Decision> = {};
    enrollments.forEach((e) => { next[e.enrollmentId] = d; });
    setDecisions(next);
  }

  async function applyDecisions() {
    const upgradeIds = enrollments
      .filter((e) => decisions[e.enrollmentId] === 'upgrade')
      .map((e) => e.student._id);
    const keepIds = enrollments
      .filter((e) => decisions[e.enrollmentId] === 'keep')
      .map((e) => e.student._id);

    if (upgradeIds.length === 0 && keepIds.length === 0) {
      return toast.error('Make a decision for at least one student');
    }

    setApplying(true);
    try {
      const res = await AdminCoursesAPI.bulkApplyFee(courseId, stageNum, levelNum, {
        upgradeStudentIds: upgradeIds,
        grandfatherStudentIds: keepIds,
        effectiveDate,
        grandfatherNote: keepIds.length > 0 ? grandfatherNote : undefined,
      });
      setResult(res.data);
      if (res.data?.summary?.failedCount === 0) {
        toast.success(`Applied to ${res.data.summary.upgradedCount + res.data.summary.grandfatheredCount} students`);
      } else {
        toast.error(`${res.data?.summary?.failedCount} student(s) failed — see details below`);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Bulk apply failed');
    } finally {
      setApplying(false);
    }
  }

  const feeDir = newFee > oldFee ? 'up' : 'down';
  const decidedCount = Object.values(decisions).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={!applying ? onClose : undefined} />
      <div className="relative w-full sm:max-w-2xl bg-surface border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-navy-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/7 flex-shrink-0">
          <div className={`p-1.5 rounded-lg ${feeDir === 'up' ? 'bg-secondary-400/15' : 'bg-primary-400/15'}`}>
            {feeDir === 'up'
              ? <TrendingUp className="w-4 h-4 text-secondary-400" />
              : <TrendingDown className="w-4 h-4 text-primary-400" />}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-text-primary">
              Fee updated — Stage {stageNum} / Level {levelNum}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-text-secondary">
              <span className="line-through text-text-tertiary">₹{oldFee.toLocaleString('en-IN')}</span>
              <ArrowRight className="w-3 h-3" />
              <span className={feeDir === 'up' ? 'text-secondary-400 font-medium' : 'text-primary-400 font-medium'}>
                ₹{newFee.toLocaleString('en-IN')}
              </span>
              <span className="text-text-tertiary">· {enrollments.length} students on old fee</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500" />
            </div>
          ) : result ? (
            // Results view
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Upgraded', value: result.summary?.upgradedCount ?? 0, color: 'text-accent-400' },
                  { label: 'Grandfathered', value: result.summary?.grandfatheredCount ?? 0, color: 'text-secondary-400' },
                  { label: 'Failed', value: result.summary?.failedCount ?? 0, color: result.summary?.failedCount > 0 ? 'text-error-600' : 'text-text-tertiary' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-surface-alt border border-white/7 rounded-lg px-3 py-2.5">
                    <div className={`text-xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-text-tertiary mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              {(result.failed ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs text-text-tertiary font-medium uppercase tracking-wide">Failures</div>
                  {result.failed.map((f: any) => (
                    <div key={f.studentId} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-error-600/10 border border-error-600/20 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-error-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-text-secondary font-mono">{f.studentId}</span>
                        <span className="text-error-600 ml-1">— {f.error}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : enrollments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <CheckCircle2 className="w-8 h-8 text-accent-400" />
              <p className="text-sm text-text-secondary">All students are already on the current fee. No action needed.</p>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {/* Bulk select */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-tertiary">Select all:</span>
                <button onClick={() => setAll('upgrade')}
                  className="px-2 py-0.5 rounded bg-accent-400/10 text-accent-400 hover:bg-accent-400/20 transition-colors">
                  → Apply new fee
                </button>
                <button onClick={() => setAll('keep')}
                  className="px-2 py-0.5 rounded bg-secondary-400/10 text-secondary-400 hover:bg-secondary-400/20 transition-colors">
                  Keep on old fee
                </button>
              </div>

              {/* Student list */}
              <div className="space-y-1.5">
                {enrollments.map((enr) => {
                  const dec = decisions[enr.enrollmentId];
                  const hasDiscount = enr.effectiveFee !== enr.enrollmentFee;
                  // If upgraded, new effective = newFee with discount preserved
                  const newEffective = hasDiscount
                    ? `≈ ₹${Math.round(newFee * enr.effectiveFee / enr.enrollmentFee).toLocaleString('en-IN')}`
                    : `₹${newFee.toLocaleString('en-IN')}`;

                  return (
                    <div key={enr.enrollmentId}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors
                        ${dec === 'upgrade' ? 'border-accent-400/20 bg-accent-400/5'
                          : dec === 'keep' ? 'border-secondary-400/20 bg-secondary-400/5'
                          : 'border-white/7 bg-surface-alt'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{enr.student.studentName}</div>
                        <div className="text-xs text-text-tertiary">
                          Currently ₹{enr.effectiveFee.toLocaleString('en-IN')}/mo
                          {hasDiscount && ` (discounted from ₹${enr.enrollmentFee.toLocaleString('en-IN')})`}
                          {dec === 'upgrade' && <span className="text-accent-400 ml-1">→ {newEffective}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => setDecisions((d) => ({ ...d, [enr.enrollmentId]: 'upgrade' }))}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                            ${dec === 'upgrade'
                              ? 'bg-accent-400 text-white'
                              : 'text-text-tertiary border border-white/10 hover:border-accent-400/40 hover:text-accent-400'}`}
                        >
                          Apply
                        </button>
                        <button
                          onClick={() => setDecisions((d) => ({ ...d, [enr.enrollmentId]: 'keep' }))}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                            ${dec === 'keep'
                              ? 'bg-secondary-400 text-white'
                              : 'text-text-tertiary border border-white/10 hover:border-secondary-400/40 hover:text-secondary-400'}`}
                        >
                          <Lock className="w-2.5 h-2.5" /> Keep
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && !loading && enrollments.length > 0 && (
          <div className="px-5 py-4 border-t border-white/7 flex-shrink-0 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-text-secondary">Effective date (start of month)</label>
                <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)}
                  className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
              </div>
              {Object.values(decisions).includes('keep') && (
                <div className="flex-1">
                  <label className="text-xs text-text-secondary">Grandfather note</label>
                  <input type="text" value={grandfatherNote} onChange={(e) => setGrandfatherNote(e.target.value)}
                    className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary">{decidedCount} of {enrollments.length} students decided</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose} disabled={applying}>Skip</Button>
                <Button variant="primary" size="sm" isLoading={applying} onClick={applyDecisions}
                  disabled={decidedCount === 0}>
                  Apply decisions
                </Button>
              </div>
            </div>
          </div>
        )}
        {result && (
          <div className="px-5 py-4 border-t border-white/7 flex-shrink-0 flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}
