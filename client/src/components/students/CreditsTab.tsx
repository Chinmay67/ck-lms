import { useState } from 'react';
import { PlusCircle, TrendingDown, TrendingUp, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminFeesAPI } from '../../services/api';
import Button from '../ui/Button';

interface CreditEntry {
  _id: string;
  type: 'credit_added' | 'credit_used' | 'credit_refund' | 'credit_adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  processedAt: string;
}

interface CreditsTabProps {
  studentId: string;
  creditBalance: number;
  credits: CreditEntry[];
  onRefresh: () => void;
}

const TYPE_META = {
  credit_added:      { label: 'Added',      color: 'text-accent-400',    icon: TrendingUp,   sign: '+' },
  credit_used:       { label: 'Used',        color: 'text-error-600',     icon: TrendingDown, sign: '−' },
  credit_refund:     { label: 'Refund',      color: 'text-accent-400',    icon: TrendingUp,   sign: '+' },
  credit_adjustment: { label: 'Adjustment',  color: 'text-text-secondary',icon: RefreshCw,    sign: '±' },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CreditsTab({ studentId, creditBalance, credits, onRefresh }: CreditsTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!amount || parseFloat(amount) <= 0) return toast.error('Enter a valid amount');
    if (!description.trim()) return toast.error('Description is required');
    setLoading(true);
    try {
      await AdminFeesAPI.addCredit(studentId, { amount: parseFloat(amount), description });
      toast.success('Credit added');
      setShowAdd(false); setAmount(''); setDescription('');
      onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Failed to add credit');
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      {/* Balance card */}
      <div className="flex items-center justify-between bg-surface-alt border border-white/7 rounded-xl px-4 py-3">
        <div>
          <div className="text-xs text-text-tertiary">Available credit balance</div>
          <div className={`text-2xl font-bold mt-0.5 ${creditBalance > 0 ? 'text-accent-400' : 'text-text-secondary'}`}>
            ₹{creditBalance.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-text-tertiary mt-0.5">
            Applied automatically to future invoices
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
          <PlusCircle className="w-3.5 h-3.5" /> Add credit
        </Button>
      </div>

      {/* Add credit form */}
      {showAdd && (
        <div className="bg-surface-alt border border-white/10 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-text-primary">Add credit</h4>
          <div>
            <label className="text-xs text-text-secondary">Amount (₹) *</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
              className="mt-1 w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Description *</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Advance payment, goodwill"
              className="mt-1 w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary-500" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" size="sm" isLoading={loading} onClick={handleAdd}>Add</Button>
          </div>
        </div>
      )}

      {/* Ledger */}
      {credits.length === 0 ? (
        <div className="text-center py-10 text-sm text-text-tertiary">No credit transactions yet.</div>
      ) : (
        <div className="space-y-1">
          {credits.map((entry) => {
            const meta = TYPE_META[entry.type] ?? TYPE_META.credit_adjustment;
            const Icon = meta.icon;
            const isPositive = entry.amount >= 0;

            return (
              <div key={entry._id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-alt border border-white/7">
                <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary truncate">{entry.description}</div>
                  <div className="text-xs text-text-tertiary">{fmtDate(entry.processedAt)}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-sm font-semibold ${isPositive ? 'text-accent-400' : 'text-error-600'}`}>
                    {meta.sign}₹{Math.abs(entry.amount).toLocaleString('en-IN')}
                  </div>
                  <div className="text-xs text-text-tertiary">bal ₹{entry.balanceAfter.toLocaleString('en-IN')}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
