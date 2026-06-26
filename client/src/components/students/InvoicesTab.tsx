import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, MinusCircle, Ban, CreditCard, Scissors, Trash2, Plus, Edit3, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminFeesAPI } from '../../services/api';
import Button from '../ui/Button';

export interface Invoice {
  _id: string;
  id?: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  invoiceMonth: string;
  dueDate: string;
  amount: number;
  allocatedAmount: number;
  waivedAmount: number;
  isVoid: boolean;
  status?: 'upcoming' | 'paid' | 'overdue' | 'partially_paid' | 'void';
  balanceDue?: number;
  paymentTransactionId?: string;
  transactionId?: string;
  paymentMethod?: string;
  paymentDate?: string;
  paymentRemarks?: string;
  isPaymentReversed?: boolean;
}

interface InvoicesTabProps {
  studentId: string;
  enrollmentId?: string | null;
  invoices: Invoice[];
  onRefresh: () => void;
}

function fmtMonth(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}
function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtFee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

const STATUS_META = {
  paid:          { icon: CheckCircle2,  color: 'text-accent-400',     bg: 'bg-accent-400/10',     label: 'Paid',          border: 'border-l-transparent' },
  upcoming:      { icon: Clock,         color: 'text-primary-400',    bg: 'bg-primary-400/10',    label: 'Upcoming',      border: 'border-l-primary-400/40' },
  overdue:       { icon: AlertTriangle, color: 'text-error-600',      bg: 'bg-error-600/10',      label: 'Overdue',       border: 'border-l-error-600' },
  partially_paid:{ icon: MinusCircle,   color: 'text-secondary-400',  bg: 'bg-secondary-400/10',  label: 'Partial',       border: 'border-l-secondary-400' },
  void:          { icon: Ban,           color: 'text-text-tertiary',  bg: 'bg-transparent',       label: 'Void',          border: 'border-l-transparent' },
};

// ── Tiny inline modal ──────────────────────────────────────────────

function ActionPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-xl shadow-navy-lg w-full max-w-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function InvoicesTab({ studentId, enrollmentId, invoices, onRefresh }: InvoicesTabProps) {
  const [action, setAction] = useState<{
    type: 'pay' | 'waive' | 'correct' | 'void' | 'reverse' | 'create';
    invoice?: Invoice;
  } | null>(null);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'online' | 'card' | 'other'>('cash');
  const [loading, setLoading] = useState(false);

  // New invoice fields
  const [newInvoiceMonth, setNewInvoiceMonth] = useState('');
  const [newInvoiceAmount, setNewInvoiceAmount] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  function reset() { setAction(null); setAmount(''); setReason(''); }

  async function handlePay(inv: Invoice) {
    if (!amount || parseFloat(amount) <= 0) return toast.error('Enter a valid amount');
    setLoading(true);
    try {
      await AdminFeesAPI.processPayment({
        studentId,
        amount: parseFloat(amount),
        feeRecordIds: [inv._id],
        paymentMethod,
      });
      toast.success('Payment recorded');
      reset(); onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Payment failed');
    } finally { setLoading(false); }
  }

  async function handleWaive(inv: Invoice) {
    if (!amount || parseFloat(amount) <= 0) return toast.error('Enter waive amount');
    if (!reason.trim()) return toast.error('Reason is required');
    setLoading(true);
    try {
      await AdminFeesAPI.waive(inv._id, { waivedAmount: parseFloat(amount), reason });
      toast.success('Amount waived');
      reset(); onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Waive failed');
    } finally { setLoading(false); }
  }

  async function handleCorrect(inv: Invoice) {
    if (!amount || parseFloat(amount) < 0) return toast.error('Enter corrected amount');
    setLoading(true);
    try {
      await AdminFeesAPI.correctAmount(inv._id, { feeAmount: parseFloat(amount), reason });
      toast.success('Amount corrected');
      reset(); onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Correction failed');
    } finally { setLoading(false); }
  }

  async function handleVoid(inv: Invoice) {
    if (!reason.trim()) return toast.error('Void reason is required');
    setLoading(true);
    try {
      await AdminFeesAPI.delete(inv._id);
      toast.success('Invoice voided');
      reset(); onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Void failed');
    } finally { setLoading(false); }
  }

  async function handleReverse(inv: Invoice) {
    if (!inv.paymentTransactionId) return toast.error('No payment transaction found');
    if (!reason.trim()) return toast.error('Reversal reason is required');
    setLoading(true);
    try {
      await AdminFeesAPI.reversePayment(inv.paymentTransactionId, reason);
      toast.success('Payment reversed');
      reset(); onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Reversal failed');
    } finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!enrollmentId) return toast.error('No active enrollment');
    if (!newInvoiceMonth) return toast.error('Invoice month is required');
    setLoading(true);
    try {
      await AdminFeesAPI.create({
        studentId,
        enrollmentId,
        feeMonth: new Date(newInvoiceMonth).toISOString(),
        feeAmount: newInvoiceAmount ? parseFloat(newInvoiceAmount) : 0,
        dueDate: newDueDate || undefined,
      });
      toast.success('Invoice created');
      reset(); setNewInvoiceMonth(''); setNewInvoiceAmount(''); setNewDueDate('');
      onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Create failed');
    } finally { setLoading(false); }
  }

  const nonVoid = invoices.filter((i) => !i.isVoid);
  const totalOutstanding = nonVoid.reduce((s, i) => s + Math.max(0, i.amount - i.allocatedAmount - (i.waivedAmount ?? 0)), 0);
  const totalOverdue = nonVoid.filter((i) => i.status === 'overdue').reduce((s, i) => s + Math.max(0, i.amount - i.allocatedAmount - (i.waivedAmount ?? 0)), 0);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Outstanding', value: fmtFee(totalOutstanding), color: 'text-text-primary' },
          { label: 'Overdue', value: fmtFee(totalOverdue), color: totalOverdue > 0 ? 'text-error-600' : 'text-text-primary' },
          { label: 'Invoices', value: nonVoid.length.toString(), color: 'text-text-primary' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface-alt border border-white/7 rounded-lg px-3 py-2.5">
            <div className="text-xs text-text-tertiary">{label}</div>
            <div className={`text-base font-semibold mt-0.5 ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setAction({ type: 'create' })}>
          <Plus className="w-3.5 h-3.5" /> New invoice
        </Button>
      </div>

      {/* Invoice rows */}
      {invoices.length === 0 ? (
        <div className="text-center py-10 text-sm text-text-tertiary">No invoices yet.</div>
      ) : (
        <div className="space-y-1.5">
          {invoices.map((inv) => {
            const balance = Math.max(0, inv.amount - inv.allocatedAmount - (inv.waivedAmount ?? 0));
            const statusKey = (inv.isVoid ? 'void' : inv.status) as keyof typeof STATUS_META;
            const meta = STATUS_META[statusKey] ?? STATUS_META.upcoming;
            const StatusIcon = meta.icon;

            return (
              <div
                key={inv._id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/7 border-l-2 ${meta.border}
                  ${inv.isVoid ? 'opacity-40' : 'bg-surface-alt'}`}
              >
                {/* Status icon */}
                <StatusIcon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />

                {/* Month + due */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary">{fmtMonth(inv.invoiceMonth)}</div>
                  <div className="text-xs text-text-tertiary">Due {fmtDate(inv.dueDate)}</div>
                </div>

                {/* Amounts */}
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <div className="text-xs text-text-tertiary">
                    {fmtFee(inv.allocatedAmount)} paid
                    {(inv.waivedAmount ?? 0) > 0 && ` · ${fmtFee(inv.waivedAmount ?? 0)} waived`}
                  </div>
                </div>

                {/* Total + balance */}
                <div className="text-right flex-shrink-0 w-20">
                  <div className="text-sm font-medium text-text-primary">{fmtFee(inv.amount)}</div>
                  {balance > 0 && !inv.isVoid && (
                    <div className={`text-xs ${meta.color}`}>{fmtFee(balance)} due</div>
                  )}
                </div>

                {/* Actions */}
                {!inv.isVoid && (
                  <div className="flex gap-1 flex-shrink-0">
                    {balance > 0 && (
                      <button
                        onClick={() => { setAction({ type: 'pay', invoice: inv }); setAmount(balance.toString()); }}
                        className="p-1.5 rounded hover:bg-accent-400/10 text-accent-400 hover:text-accent-300 transition-colors"
                        title="Record payment"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {balance > 0 && (
                      <button
                        onClick={() => { setAction({ type: 'waive', invoice: inv }); setAmount(''); }}
                        className="p-1.5 rounded hover:bg-secondary-400/10 text-text-tertiary hover:text-secondary-400 transition-colors"
                        title="Waive amount"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {inv.allocatedAmount === 0 && (
                      <button
                        onClick={() => { setAction({ type: 'correct', invoice: inv }); setAmount(inv.amount.toString()); setReason(''); }}
                        className="p-1.5 rounded hover:bg-primary-400/10 text-text-tertiary hover:text-primary-400 transition-colors"
                        title="Correct amount"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {inv.paymentTransactionId && !inv.isPaymentReversed && (
                      <button
                        onClick={() => { setAction({ type: 'reverse', invoice: inv }); setReason(''); }}
                        className="p-1.5 rounded hover:bg-secondary-400/10 text-text-tertiary hover:text-secondary-400 transition-colors"
                        title="Reverse payment"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {inv.allocatedAmount === 0 && (
                      <button
                        onClick={() => { setAction({ type: 'void', invoice: inv }); setReason(''); }}
                        className="p-1.5 rounded hover:bg-error-600/10 text-text-tertiary hover:text-error-600 transition-colors"
                        title="Void invoice"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action panels */}
      {action?.type === 'pay' && action.invoice && (
        <ActionPanel title={`Record payment — ${fmtMonth(action.invoice.invoiceMonth)}`} onClose={reset}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-secondary">Amount (₹)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number"
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-xs text-text-secondary">Payment method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500">
                {['cash','upi','online','card','other'].map((m) => (
                  <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
              <Button variant="primary" size="sm" isLoading={loading} onClick={() => handlePay(action.invoice!)}>Record</Button>
            </div>
          </div>
        </ActionPanel>
      )}
      {action?.type === 'waive' && action.invoice && (
        <ActionPanel title={`Waive — ${fmtMonth(action.invoice.invoiceMonth)}`} onClose={reset}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-secondary">Amount to waive (₹)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number"
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-xs text-text-secondary">Reason *</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} type="text" placeholder="e.g. Scholarship, hardship"
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
              <Button variant="secondary" size="sm" isLoading={loading} onClick={() => handleWaive(action.invoice!)}>Waive</Button>
            </div>
          </div>
        </ActionPanel>
      )}
      {action?.type === 'correct' && action.invoice && (
        <ActionPanel title={`Correct amount — ${fmtMonth(action.invoice.invoiceMonth)}`} onClose={reset}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-secondary">Correct amount (₹)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number"
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-xs text-text-secondary">Reason</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} type="text" placeholder="e.g. Fee entered incorrectly"
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
              <Button variant="primary" size="sm" isLoading={loading} onClick={() => handleCorrect(action.invoice!)}>Save</Button>
            </div>
          </div>
        </ActionPanel>
      )}
      {action?.type === 'void' && action.invoice && (
        <ActionPanel title={`Void invoice — ${fmtMonth(action.invoice.invoiceMonth)}`} onClose={reset}>
          <p className="text-xs text-text-secondary">Cannot be undone. Invoice must have no payments.</p>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs text-text-secondary">Reason *</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} type="text" placeholder="e.g. Created in error"
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
              <Button variant="danger" size="sm" isLoading={loading} onClick={() => handleVoid(action.invoice!)}>Void</Button>
            </div>
          </div>
        </ActionPanel>
      )}
      {action?.type === 'reverse' && action.invoice && (
        <ActionPanel title={`Reverse payment — ${fmtMonth(action.invoice.invoiceMonth)}`} onClose={reset}>
          <p className="text-xs text-text-secondary">
            This reverses the linked payment transaction and restores invoice balances. A reason is required for the audit trail.
          </p>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs text-text-secondary">Reason *</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} type="text" placeholder="e.g. Duplicate entry, wrong student"
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
              <Button variant="danger" size="sm" isLoading={loading} onClick={() => handleReverse(action.invoice!)}>Reverse</Button>
            </div>
          </div>
        </ActionPanel>
      )}
      {action?.type === 'create' && (
        <ActionPanel title="Create invoice" onClose={reset}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-secondary">Invoice month *</label>
              <input type="month" value={newInvoiceMonth} onChange={(e) => setNewInvoiceMonth(e.target.value)}
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-xs text-text-secondary">Amount (₹) — leave blank to use enrollment fee</label>
              <input type="number" value={newInvoiceAmount} onChange={(e) => setNewInvoiceAmount(e.target.value)} placeholder="Auto from enrollment"
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-xs text-text-secondary">Due date (optional)</label>
              <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)}
                className="mt-1 w-full bg-surface-alt border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
              <Button variant="primary" size="sm" isLoading={loading} onClick={handleCreate}>Create</Button>
            </div>
          </div>
        </ActionPanel>
      )}
    </div>
  );
}
