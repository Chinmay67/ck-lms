export type LeadStatus = 'new' | 'contacted' | 'follow-up' | 'converted' | 'dropped';
export type LeadSource = 'walk-in' | 'referral' | 'online' | 'social-media' | 'phone-call' | 'other';

export interface Lead {
  _id: string;
  id?: string;
  // Contact (parent / guardian)
  name: string;
  phone?: string;
  email?: string;
  // Child info
  childName?: string;
  childAge?: number;
  // Interest
  interestedCourseId?: string | { _id: string; displayName: string; courseName: string } | null;
  interestedStageName?: string;
  // Metadata
  source: LeadSource;
  status: LeadStatus;
  notes?: string;
  followUpDate?: string | null;
  assignedTo?: string | null;
  convertedStudentId?: string | { _id: string; studentName?: string; studentCode?: string } | null;
  convertedAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus | 'all';
  source?: LeadSource | 'all';
  followUpFrom?: string;
  followUpTo?: string;
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  'follow-up': 'Follow-up',
  converted: 'Converted',
  dropped: 'Dropped',
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-primary-600/15 text-primary-300 border border-primary-500/20',
  contacted: 'bg-secondary-600/15 text-secondary-300 border border-secondary-500/20',
  'follow-up': 'bg-accent-600/15 text-accent-300 border border-accent-500/20',
  converted: 'bg-success-600/15 text-success-400 border border-success-500/20',
  dropped: 'bg-white/6 text-text-tertiary border border-white/10',
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  'walk-in': 'Walk-in',
  referral: 'Referral',
  online: 'Online',
  'social-media': 'Social Media',
  'phone-call': 'Phone Call',
  other: 'Other',
};

export const ALL_LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'follow-up', 'converted', 'dropped'];
export const MUTABLE_LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'follow-up', 'dropped'];
export const ALL_LEAD_SOURCES: LeadSource[] = ['walk-in', 'referral', 'online', 'social-media', 'phone-call', 'other'];
