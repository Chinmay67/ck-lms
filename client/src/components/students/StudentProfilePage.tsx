import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, BookOpen, Receipt, Wallet,
  Phone, Mail, MapPin, Calendar, Users, Edit2,
  AlertTriangle, ToggleLeft, ToggleRight, Trash2, History, MoreHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminStudentsAPI, AdminFeesAPI } from '../../services/api';
import type { StudentUpdate } from '../../types/student';
import LoadingSpinner from '../ui/LoadingSpinner';
import Button from '../ui/Button';
import EnrollmentTimeline from './EnrollmentTimeline';
import InvoicesTab from './InvoicesTab';
import CreditsTab from './CreditsTab';
import StudentModal from './StudentModal';
import AuditHistoryTab from './AuditHistoryTab';

type Tab = 'profile' | 'enrollment' | 'invoices' | 'credits' | 'history';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'profile',    label: 'Profile',     icon: User },
  { id: 'enrollment', label: 'Enrollment',  icon: BookOpen },
  { id: 'invoices',   label: 'Invoices',    icon: Receipt },
  { id: 'credits',    label: 'Credits',     icon: Wallet },
  { id: 'history',    label: 'History',     icon: History },
];

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" />
      <div>
        <div className="text-text-tertiary text-xs">{label}</div>
        <div className="text-text-primary mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium
      ${isActive ? 'bg-accent-400/15 text-accent-400' : 'bg-text-tertiary/15 text-text-tertiary'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accent-400' : 'bg-text-tertiary'}`} />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [creditBalance, setCreditBalance] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [profileRes, creditsRes] = await Promise.all([
        AdminStudentsAPI.get(id),
        AdminFeesAPI.getStudentCredits(id),
      ]);
      if (profileRes.success && profileRes.data) {
        setStudent(profileRes.data.student ?? profileRes.data);
        setEnrollments(profileRes.data.enrollments ?? []);
        setInvoices(profileRes.data.invoices ?? profileRes.data.feeRecords ?? []);
      }
      if (creditsRes.success && creditsRes.data) {
        setCredits(creditsRes.data.credits ?? []);
        setCreditBalance(creditsRes.data.creditBalance ?? 0);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Failed to load student');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleToggleActive() {
    if (!id) return;
    setTogglingActive(true);
    try {
      await AdminStudentsAPI.toggleActive(id);
      toast.success(student?.isActive ? 'Student deactivated' : 'Student activated');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Failed to toggle status');
    } finally { setTogglingActive(false); }
  }

  async function handleDelete() {
    if (!id) return;
    try {
      await AdminStudentsAPI.delete(id);
      toast.success('Student deleted');
      navigate('/students');
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Delete failed');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="w-8 h-8 text-error-600" />
        <p className="text-text-secondary text-sm">Student not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/students')}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </div>
    );
  }

  const activeEnrollment = enrollments.find((e: any) => e.endDate === null);
  const stageName = student.courseId?.stages?.find((s: any) => s.stageNumber === student.stageNumber)?.stageName;
  const stageLabel = stageName
    ? `${stageName} (Stage ${student.stageNumber})`
    : student.stageNumber ? `Stage ${student.stageNumber}` : null;
  const overdueCount = invoices.filter((inv: any) => !inv.isVoid && inv.status === 'overdue').length;

  const handleProfileSubmit = async (studentData: StudentUpdate): Promise<string | void> => {
    if (!id) return 'Student ID is missing';
    try {
      const courseId = (studentData as any).courseId;
      const stageNumber = (studentData as any).stageNumber;
      const levelNumber = (studentData as any).levelNumber;
      const monthlyFee = (studentData as any).monthlyFee;
      const originalCourseId = typeof student.courseId === 'object'
        ? student.courseId?._id ?? student.courseId?.id ?? null
        : student.courseId ?? null;
      const originalBatchId = typeof student.batchId === 'object'
        ? student.batchId?._id ?? student.batchId?.id ?? null
        : student.batchId ?? null;
      const nextBatchId = studentData.batchId ? String(studentData.batchId) : null;
      const academicChanged =
        courseId !== originalCourseId ||
        stageNumber !== student.stageNumber ||
        levelNumber !== student.levelNumber;
      const batchChanged = nextBatchId !== originalBatchId;

      if (academicChanged && courseId && stageNumber != null && levelNumber != null && monthlyFee) {
        const response = await AdminStudentsAPI.upgrade(id, {
          courseId,
          stageNumber: Number(stageNumber),
          levelNumber: Number(levelNumber),
          monthlyFee: Number(monthlyFee),
          batchId: nextBatchId ?? undefined,
          discountType: (studentData as any).discountType ?? 'none',
          discountPct: (studentData as any).discountType === 'percentage' ? Number((studentData as any).discountValue ?? 0) : 0,
          discountAmount: (studentData as any).discountType === 'fixed' ? Number((studentData as any).discountValue ?? 0) : 0,
          discountReason: (studentData as any).discountReason ?? '',
        });
        if (!response.success) return (response as any).error || 'Failed to update enrollment';
      } else if (batchChanged) {
        const response = await AdminStudentsAPI.changeBatch(id, { newBatchId: nextBatchId });
        if (!response.success) return (response as any).error || 'Failed to change batch';
      }

      const personalFields: Record<string, any> = {};
      const allowed = ['studentName', 'parentName', 'phone', 'email', 'dob', 'address', 'alternatePhone', 'alternateEmail', 'referredBy'];
      allowed.forEach((key) => {
        if ((studentData as any)[key] !== undefined) personalFields[key] = (studentData as any)[key];
      });
      if (Object.keys(personalFields).length > 0) {
        const response = await AdminStudentsAPI.update(id, personalFields);
        if (!response.success) return (response as any).error || 'Failed to update student info';
      }

      toast.success('Student updated successfully');
      setShowEditModal(false);
      await load();
    } catch (error: any) {
      return error?.response?.data?.error ?? error.message ?? 'Failed to update student';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-0 animate-fade-in">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate('/students')}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-text-primary truncate">{student.studentName}</h1>
            {student.studentCode && (
              <span className="text-xs font-mono text-text-tertiary bg-surface-alt border border-white/7 px-1.5 py-0.5 rounded">
                {student.studentCode}
              </span>
            )}
            <StatusBadge isActive={student.isActive} />
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-error-600/15 text-error-400 text-xs font-medium">
                <AlertTriangle className="w-3 h-3" />
                {overdueCount} overdue
              </span>
            )}
          </div>
          {stageLabel && (
            <div className="text-xs text-text-tertiary mt-0.5">
              {stageLabel}{student.levelNumber ? ` · Level ${student.levelNumber}` : ''}
              {student.batchId && ` · ${(student.batchId as any).batchName ?? ''}`}
            </div>
          )}
        </div>
        <div className="relative flex items-center gap-2 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={() => setShowEditModal(true)}>
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button size="sm" variant="primary" onClick={() => setActiveTab('invoices')}>
            <Receipt className="w-3.5 h-3.5" /> Record Payment
          </Button>
          <button
            onClick={() => setShowMoreMenu((open) => !open)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="More actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showMoreMenu && (
            <div className="absolute right-0 top-10 z-20 w-48 rounded-lg border border-white/10 bg-surface-alt shadow-navy-lg py-1">
              <button
                onClick={() => { setShowMoreMenu(false); handleToggleActive(); }}
                disabled={togglingActive}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-50"
              >
                {student.isActive ? <ToggleRight className="w-4 h-4 text-accent-400" /> : <ToggleLeft className="w-4 h-4" />}
                {student.isActive ? 'Deactivate student' : 'Activate student'}
              </button>
              <button
                onClick={() => { setShowMoreMenu(false); setShowDeleteConfirm(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-error-400 hover:bg-error-600/15"
              >
                <Trash2 className="w-4 h-4" />
                Delete student
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <div className="flex gap-0.5 bg-surface-alt border border-white/7 rounded-lg p-1 mb-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          // Badge counts
          const badge = tab.id === 'invoices' && overdueCount > 0 ? overdueCount
            : tab.id === 'credits' && creditBalance > 0 ? null
            : null;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
                ${isActive
                  ? 'bg-surface shadow-navy text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-hover'
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              {badge != null && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-error-600 text-white text-[10px] font-bold">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      <div className="bg-surface border border-white/7 rounded-lg px-5 py-4">

        {/* Profile tab */}
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <InfoRow icon={User}     label="Full name"      value={student.studentName} />
            <InfoRow icon={Users}    label="Parent / Guardian" value={student.parentName} />
            <InfoRow icon={Phone}    label="Phone"          value={student.phone} />
            <InfoRow icon={Mail}     label="Email"          value={student.email} />
            <InfoRow icon={Phone}    label="Alt. phone"     value={student.alternatePhone} />
            <InfoRow icon={Mail}     label="Alt. email"     value={student.alternateEmail} />
            <InfoRow icon={Calendar} label="Date of birth"  value={student.dob} />
            <InfoRow icon={Calendar} label="Enrolled on"    value={student.enrollmentDate
              ? new Date(student.enrollmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
              : undefined} />
            <InfoRow icon={MapPin}   label="Address"        value={student.address} />
            <InfoRow icon={Users}    label="Referred by"    value={student.referredBy} />

            {activeEnrollment && (
              <div className="col-span-full mt-2 pt-3 border-t border-white/7">
                <div className="text-xs text-text-tertiary mb-3 uppercase tracking-wide font-medium">Current enrollment</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Monthly fee', value: `₹${(activeEnrollment.monthlyFee ?? 0).toLocaleString('en-IN')}` },
                    { label: 'Gross fee', value: `₹${(activeEnrollment.grossFee ?? 0).toLocaleString('en-IN')}` },
                    { label: 'Discount', value: activeEnrollment.discountType !== 'none'
                      ? (activeEnrollment.discountType === 'percentage'
                        ? `${activeEnrollment.discountPct}%`
                        : `₹${activeEnrollment.discountAmount}`)
                      : 'None' },
                    { label: 'Since', value: new Date(activeEnrollment.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-surface-alt border border-white/7 rounded-lg px-3 py-2">
                      <div className="text-xs text-text-tertiary">{label}</div>
                      <div className="text-sm font-medium text-text-primary mt-0.5">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Enrollment tab */}
        {activeTab === 'enrollment' && (
          <EnrollmentTimeline
            enrollments={enrollments}
            studentId={id!}
            isActive={student.isActive}
            onAction={load}
          />
        )}

        {/* Invoices tab */}
        {activeTab === 'invoices' && (
          <InvoicesTab
            studentId={id!}
            enrollmentId={activeEnrollment?._id ?? null}
            invoices={invoices}
            onRefresh={load}
          />
        )}

        {/* Credits tab */}
        {activeTab === 'credits' && (
          <CreditsTab
            studentId={id!}
            creditBalance={creditBalance}
            credits={credits}
            onRefresh={load}
          />
        )}

        {/* History tab */}
        {activeTab === 'history' && (
          <AuditHistoryTab studentId={id!} />
        )}
      </div>

      {/* ── Edit modal ──────────────────────────────────────────── */}
      {showEditModal && (
        <StudentModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          mode="edit"
          student={student}
          onSubmit={handleProfileSubmit}
        />
      )}

      {/* ── Delete confirm ──────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-surface border border-white/10 rounded-lg shadow-navy-lg w-full max-w-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Delete student?</h3>
            <p className="text-sm text-text-secondary">
              This will permanently delete <span className="text-text-primary font-medium">{student.studentName}</span> and all their records. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
