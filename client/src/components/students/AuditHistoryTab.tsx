import { useEffect, useState } from 'react';
import {
  BookOpen,
  CreditCard,
  FileText,
  History,
  Import,
  Receipt,
  Wallet,
} from 'lucide-react';
import { AdminStudentsAPI } from '../../services/api';
import LoadingSpinner from '../ui/LoadingSpinner';

type AuditCategory = 'all' | 'fees' | 'payments' | 'credits' | 'enrollment' | 'imports';

interface AuditEvent {
  id: string;
  occurredAt: string;
  category: Exclude<AuditCategory, 'all'>;
  action: string;
  title: string;
  description?: string;
  amount?: number;
  actor?: { id: string; name?: string; email?: string };
  source?: 'manual' | 'import' | 'billing' | 'payment';
  related?: {
    invoiceId?: string;
    paymentTransactionId?: string;
    enrollmentId?: string;
    creditLedgerId?: string;
    allocationId?: string;
  };
  metadata?: Record<string, unknown>;
}

interface AuditHistoryTabProps {
  studentId: string;
}

const FILTERS: Array<{ id: AuditCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'fees', label: 'Fees' },
  { id: 'payments', label: 'Payments' },
  { id: 'credits', label: 'Credits' },
  { id: 'enrollment', label: 'Enrollment' },
  { id: 'imports', label: 'Imports' },
];

const CATEGORY_META: Record<Exclude<AuditCategory, 'all'>, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = {
  fees: { label: 'Fees', icon: Receipt, color: 'text-primary-400', bg: 'bg-primary-400/10' },
  payments: { label: 'Payments', icon: CreditCard, color: 'text-accent-400', bg: 'bg-accent-400/10' },
  credits: { label: 'Credits', icon: Wallet, color: 'text-secondary-400', bg: 'bg-secondary-400/10' },
  enrollment: { label: 'Enrollment', icon: BookOpen, color: 'text-info-400', bg: 'bg-info-400/10' },
  imports: { label: 'Imports', icon: Import, color: 'text-warning-500', bg: 'bg-warning-500/10' },
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(amount?: number) {
  if (amount === undefined || amount === null) return null;
  const sign = amount < 0 ? '-' : '';
  return `${sign}₹${Math.abs(amount).toLocaleString('en-IN')}`;
}

function shortId(value?: string) {
  if (!value) return null;
  return value.length > 8 ? value.slice(-8) : value;
}

function sourceLabel(source?: string) {
  if (!source) return null;
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export default function AuditHistoryTab({ studentId }: AuditHistoryTabProps) {
  const [category, setCategory] = useState<AuditCategory>('all');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [counts, setCounts] = useState<Record<AuditCategory, number>>({
    all: 0,
    fees: 0,
    payments: 0,
    credits: 0,
    enrollment: 0,
    imports: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    AdminStudentsAPI.getAuditHistory(studentId, { category })
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setEvents(res.data.events ?? []);
          setCounts({
            all: res.data.categories?.all ?? 0,
            fees: res.data.categories?.fees ?? 0,
            payments: res.data.categories?.payments ?? 0,
            credits: res.data.categories?.credits ?? 0,
            enrollment: res.data.categories?.enrollment ?? 0,
            imports: res.data.categories?.imports ?? 0,
          });
        } else {
          setError((res as any).error ?? 'Failed to load history');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.error ?? 'Failed to load history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [category, studentId]);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-5 px-5 py-2 bg-surface/95 backdrop-blur border-b border-white/7 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = category === filter.id;
          return (
            <button
              key={filter.id}
              onClick={() => {
                if (filter.id === category) return;
                setLoading(true);
                setError(null);
                setCategory(filter.id);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? 'bg-primary-600 text-white border-primary-500'
                  : 'bg-surface-alt text-text-secondary border-white/8 hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              {filter.label}
              <span className={`ml-1 ${active ? 'text-white/80' : 'text-text-tertiary'}`}>
                {counts[filter.id]}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-center py-10">
          <FileText className="w-8 h-8 mx-auto text-error-600 mb-2" />
          <p className="text-sm text-error-600">{error}</p>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12">
          <History className="w-10 h-10 mx-auto text-text-tertiary opacity-40 mb-3" />
          <p className="text-sm text-text-secondary">No history events found.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[17px] top-4 bottom-4 w-px bg-white/7" />
          <div className="space-y-3">
            {events.map((event) => {
              const meta = CATEGORY_META[event.category];
              const Icon = meta.icon;
              const amount = formatAmount(event.amount);
              const actor = event.actor?.name || event.actor?.email;
              const source = sourceLabel(event.source);
              const relatedIds = [
                ['Invoice', event.related?.invoiceId],
                ['Payment', event.related?.paymentTransactionId],
                ['Credit', event.related?.creditLedgerId],
                ['Enrollment', event.related?.enrollmentId],
              ].filter(([, value]) => value);

              return (
                <div key={event.id} className="relative pl-11">
                  <div className={`absolute left-0 top-1.5 w-9 h-9 rounded-full ${meta.bg} flex items-center justify-center border border-white/7`}>
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                  </div>
                  <div className="bg-surface-alt border border-white/7 rounded-lg px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-text-primary">{event.title}</p>
                          <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${meta.bg} ${meta.color}`}>
                            {meta.label}
                          </span>
                          {source && (
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-text-tertiary">
                              {source}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-xs text-text-secondary mt-1">{event.description}</p>
                        )}
                      </div>
                      {amount && (
                        <div className={`text-sm font-semibold whitespace-nowrap ${event.amount! < 0 ? 'text-error-600' : 'text-text-primary'}`}>
                          {amount}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-text-tertiary">
                      <span>{formatDate(event.occurredAt)}</span>
                      {actor && <span>By {actor}</span>}
                      {relatedIds.map(([label, value]) => (
                        <span key={`${label}-${value}`}>{label} #{shortId(value)}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
