import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Pencil, Plus, Trash2, UserCheck, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminLeadsAPI } from '../../services/api';
import type { Lead, LeadStatus, LeadSource } from '../../types/lead';
import {
  ALL_LEAD_STATUSES,
  ALL_LEAD_SOURCES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  LEAD_SOURCE_LABELS,
  MUTABLE_LEAD_STATUSES,
} from '../../types/lead';
import Card from '../ui/Card';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner';
import LeadModal from './LeadModal';
import ConvertLeadModal from './ConvertLeadModal';

// ─── Status badge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${LEAD_STATUS_COLORS[status]}`}>
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Overdue helper ───────────────────────────────────────────────

function isOverdue(lead: Lead): boolean {
  if (!lead.followUpDate) return false;
  if (lead.status === 'converted' || lead.status === 'dropped') return false;
  return new Date(lead.followUpDate) < new Date();
}

function hasConvertedStudent(lead: Lead): boolean {
  return Boolean(lead.convertedStudentId);
}

function statusOptionsFor(lead: Lead): LeadStatus[] {
  if (hasConvertedStudent(lead)) return ['converted'];
  return lead.status === 'converted'
    ? ['converted', ...MUTABLE_LEAD_STATUSES]
    : MUTABLE_LEAD_STATUSES;
}

// ─── Main component ───────────────────────────────────────────────

const LeadsList = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const itemsPerPage = 20;

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'all'>('all');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);

  // Inline status update state
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // ─ Fetch ───────────────────────────────────────────────────────

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await AdminLeadsAPI.list({
        page: currentPage,
        limit: itemsPerPage,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
      });
      if (res.success && res.data) {
        setLeads(res.data.data);
        setTotalPages(res.data.pagination.totalPages);
        setTotalLeads(res.data.pagination.totalItems);
      }
    } catch {
      setError('Failed to load leads. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, statusFilter, sourceFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, sourceFilter]);

  // ─ Handlers ────────────────────────────────────────────────────

  const handleCreate = () => {
    setEditingLead(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const handleEdit = (lead: Lead) => {
    setEditingLead(lead);
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleConverted = () => {
    setConvertLead(null);
    fetchLeads();
  };

  const handleModalSubmit = async (data: Partial<Lead>) => {
    if (modalMode === 'create') {
      const res = await AdminLeadsAPI.create(data as any);
      if (res.success) {
        toast.success('Lead added successfully');
        setModalOpen(false);
        fetchLeads();
      } else {
        toast.error((res as any).error || 'Failed to create lead');
        throw new Error();
      }
    } else if (editingLead) {
      const id = editingLead.id || editingLead._id;
      const res = await AdminLeadsAPI.update(id, data as any);
      if (res.success) {
        toast.success('Lead updated');
        setModalOpen(false);
        fetchLeads();
      } else {
        toast.error((res as any).error || 'Failed to update lead');
        throw new Error();
      }
    }
  };

  const handleStatusChange = async (lead: Lead, status: LeadStatus) => {
    const id = lead.id || lead._id;
    setUpdatingStatus(id);
    try {
      const res = await AdminLeadsAPI.updateStatus(id, status);
      if (res.success) {
        setLeads((prev) =>
          prev.map((l) => (l.id === id || l._id === id) ? { ...l, status } : l),
        );
        toast.success(`Status updated to "${LEAD_STATUS_LABELS[status]}"`);
      } else {
        toast.error('Failed to update status');
      }
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleDelete = async (lead: Lead) => {
    if (!window.confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return;
    const id = lead.id || lead._id;
    try {
      const res = await AdminLeadsAPI.delete(id);
      if (res.success) {
        toast.success('Lead deleted');
        fetchLeads();
      } else {
        toast.error('Failed to delete lead');
      }
    } catch {
      toast.error('Failed to delete lead');
    }
  };

  // ─ Helpers ─────────────────────────────────────────────────────

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getCourseDisplay = (lead: Lead): string => {
    if (!lead.interestedCourseId) return lead.interestedStageName || '—';
    const course =
      typeof lead.interestedCourseId === 'object'
        ? (lead.interestedCourseId as any).displayName
        : lead.interestedCourseId;
    return lead.interestedStageName ? `${course} › ${lead.interestedStageName}` : course;
  };

  // ─ Render ───────────────────────────────────────────────────────

  if (error) {
    return (
      <Card className="text-center py-12">
        <p className="text-error-600 font-medium mb-2">Error Loading Leads</p>
        <p className="text-text-secondary text-sm mb-4">{error}</p>
        <Button onClick={fetchLeads}>Try Again</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact toolbar */}
      <div className="bg-surface rounded-lg border border-white/7 p-3 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div className="flex flex-1 flex-col sm:flex-row gap-3 sm:items-center">
            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, email or child name…"
              className="h-9 w-full sm:max-w-sm px-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface-alt text-text-primary"
            />
            <span className="h-9 inline-flex items-center px-3 rounded-lg border border-white/8 text-xs text-text-secondary whitespace-nowrap">
              Total: <span className="font-semibold text-text-primary">{totalLeads}</span> leads
            </span>
          </div>
          <Button onClick={handleCreate} variant="primary" size="sm" className="h-9 whitespace-nowrap">
            <Plus className="w-4 h-4" />
            Add Lead
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* Status pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${statusFilter === 'all' ? 'bg-primary-600 text-white border-primary-500' : 'bg-white/6 text-text-secondary border-white/10 hover:bg-white/10 hover:text-text-primary'}`}
            >
              All
            </button>
            {ALL_LEAD_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? 'ring-1 ring-primary-400 ' + LEAD_STATUS_COLORS[s] : LEAD_STATUS_COLORS[s] + ' opacity-75 hover:opacity-100'}`}
              >
                {LEAD_STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Source filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary font-medium whitespace-nowrap">Source:</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as LeadSource | 'all')}
              className="px-3 py-1.5 text-xs border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All sources</option>
              {ALL_LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</option>
              ))}
            </select>

            {(search || statusFilter !== 'all' || sourceFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setStatusFilter('all'); setSourceFilter('all'); }}
                className="text-xs text-error-400 hover:text-error-300 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <Card className="py-12">
          <LoadingSpinner size="xl" className="py-8" />
          <p className="text-center text-text-secondary mt-4 text-sm">Loading leads…</p>
        </Card>
      ) : leads.length === 0 ? (
        <Card className="py-12 text-center">
          <UserCheck className="w-12 h-12 text-text-tertiary mx-auto mb-3 opacity-40" />
          <p className="text-text-secondary font-medium">No leads found</p>
          <p className="text-text-tertiary text-sm mt-1">
            {search || statusFilter !== 'all' || sourceFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Click "Add Lead" to record your first enquiry'}
          </p>
        </Card>
      ) : (
        <Card padding="none">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-alt">
                <tr>
                  {['Contact', 'Child', 'Interest', 'Source', 'Status', 'Follow-up', 'Notes', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {leads.map((lead) => {
                  const id = lead.id || lead._id;
                  const overdue = isOverdue(lead);
                  const isConverted = hasConvertedStudent(lead);
                  return (
                    <tr key={id} className={`hover:bg-surface-hover transition-colors ${overdue ? 'bg-error-600/10' : ''}`}>
                      {/* Contact */}
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="font-semibold text-text-primary text-sm truncate">{lead.name}</p>
                        {lead.phone && <p className="text-xs text-text-secondary">{lead.phone}</p>}
                        {lead.email && <p className="text-xs text-text-tertiary truncate">{lead.email}</p>}
                      </td>
                      {/* Child */}
                      <td className="px-4 py-3 max-w-[140px]">
                        {lead.childName ? (
                          <>
                            <p className="text-sm text-text-primary truncate">{lead.childName}</p>
                            {lead.childAge != null && (
                              <p className="text-xs text-text-secondary">{lead.childAge} yrs</p>
                            )}
                          </>
                        ) : (
                          <span className="text-text-tertiary text-xs">—</span>
                        )}
                      </td>
                      {/* Interest */}
                      <td className="px-4 py-3 max-w-[160px]">
                        <p className="text-sm text-text-primary truncate">{getCourseDisplay(lead)}</p>
                      </td>
                      {/* Source */}
                      <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                        {LEAD_SOURCE_LABELS[lead.source]}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead, e.target.value as LeadStatus)}
                          disabled={updatingStatus === id || isConverted}
                          className={`text-xs font-medium rounded-lg px-2 py-1 focus:ring-2 focus:ring-primary-500 cursor-pointer ${LEAD_STATUS_COLORS[lead.status]} disabled:opacity-60`}
                        >
                          {statusOptionsFor(lead).map((s) => (
                            <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </td>
                      {/* Follow-up */}
                      <td className={`px-4 py-3 text-xs whitespace-nowrap ${overdue ? 'text-error-400 font-semibold' : 'text-text-secondary'}`}>
                        {formatDate(lead.followUpDate)}
                        {overdue && <AlertTriangle className="ml-1 inline-block w-3 h-3" />}
                      </td>
                      {/* Notes */}
                      <td className="px-4 py-3 max-w-[200px]">
                        {lead.notes ? (
                          <p className="text-xs text-text-secondary line-clamp-2">{lead.notes}</p>
                        ) : (
                          <span className="text-text-tertiary text-xs">—</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(lead)}
                            className="p-1.5 text-text-tertiary hover:text-primary-300 hover:bg-primary-600/15 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {!isConverted && (
                            <button
                              onClick={() => setConvertLead(lead)}
                              className="inline-flex items-center gap-1.5 px-2 py-1.5 text-accent-300 bg-accent-600/15 hover:bg-accent-600/25 rounded-lg transition-colors text-xs font-medium"
                              title="Convert to student"
                            >
                              <UserPlus className="w-4 h-4" />
                              Convert
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(lead)}
                            className="p-1.5 text-text-tertiary hover:text-error-400 hover:bg-error-600/15 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border">
            {leads.map((lead) => {
              const id = lead.id || lead._id;
              const overdue = isOverdue(lead);
              const isConverted = hasConvertedStudent(lead);
              return (
                <div key={id} className={`p-4 space-y-3 ${overdue ? 'bg-error-600/10' : ''}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-semibold text-text-primary">{lead.name}</p>
                      {lead.phone && <p className="text-xs text-text-secondary">{lead.phone}</p>}
                      {lead.email && <p className="text-xs text-text-tertiary">{lead.email}</p>}
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>

                  {(lead.childName || lead.interestedCourseId || lead.interestedStageName) && (
                    <div className="text-sm space-y-0.5">
                      {lead.childName && (
                        <p className="text-text-secondary">
                          Child: <span className="text-text-primary font-medium">{lead.childName}</span>
                          {lead.childAge != null && ` (${lead.childAge} yrs)`}
                        </p>
                      )}
                      {(lead.interestedCourseId || lead.interestedStageName) && (
                        <p className="text-text-secondary">
                          Interest: <span className="text-text-primary">{getCourseDisplay(lead)}</span>
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="text-text-tertiary">{LEAD_SOURCE_LABELS[lead.source]}</span>
                    {lead.followUpDate && (
                      <span className={overdue ? 'text-error-400 font-semibold inline-flex items-center gap-1' : 'text-text-secondary'}>
                        Follow-up: {formatDate(lead.followUpDate)}{overdue && <AlertTriangle className="w-3 h-3" />}
                      </span>
                    )}
                  </div>

                  {lead.notes && (
                    <p className="text-xs text-text-secondary line-clamp-2">{lead.notes}</p>
                  )}

                  <div className="flex items-center gap-2">
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead, e.target.value as LeadStatus)}
                      disabled={updatingStatus === id || isConverted}
                      className={`text-xs font-medium rounded-lg px-2 py-1 focus:ring-2 focus:ring-primary-500 ${LEAD_STATUS_COLORS[lead.status]}`}
                    >
                      {statusOptionsFor(lead).map((s) => (
                        <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <button onClick={() => handleEdit(lead)} className="p-1.5 text-text-tertiary hover:text-primary-300 hover:bg-primary-600/15 rounded-lg" title="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {!isConverted && (
                      <button onClick={() => setConvertLead(lead)} className="inline-flex items-center gap-1.5 px-2 py-1.5 text-accent-300 bg-accent-600/15 hover:bg-accent-600/25 rounded-lg text-xs font-medium" title="Convert to student">
                        <UserPlus className="w-4 h-4" />
                        Convert
                      </button>
                    )}
                    <button onClick={() => handleDelete(lead)} className="p-1.5 text-text-tertiary hover:text-error-400 hover:bg-error-600/15 rounded-lg" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-4 border-t border-border flex items-center justify-between gap-4">
              <span className="text-sm text-text-secondary">
                Page {currentPage} of {totalPages} · {totalLeads} total
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-surface-hover transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-surface-hover transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Modal */}
      <LeadModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
        lead={editingLead}
        mode={modalMode}
      />
      <ConvertLeadModal
        isOpen={!!convertLead}
        lead={convertLead}
        onClose={() => setConvertLead(null)}
        onConverted={handleConverted}
      />
    </div>
  );
};

export default LeadsList;
