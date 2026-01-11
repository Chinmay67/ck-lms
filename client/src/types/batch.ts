export interface ScheduleEntry {
  dayOfWeek: number; // 0-6 (0=Sunday, 6=Saturday)
  startTime: string; // HH:MM format (24-hour)
}

export interface Batch {
  id: string;
  batchName: string;
  batchCode: string;
  stage: 'beginner' | 'intermediate' | 'advanced';
  level: 1 | 2 | 3;
  maxStudents: number | null;
  schedule: ScheduleEntry[];
  status: 'active' | 'ended' | 'draft';
  startDate: string;
  endDate: string | null;
  description: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  currentStudentCount?: number;
  isAvailable?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBatchData {
  batchName: string;
  batchCode: string;
  stage: 'beginner' | 'intermediate' | 'advanced';
  level: 1 | 2 | 3;
  maxStudents: number | null;
  schedule: ScheduleEntry[];
  status: 'active' | 'ended' | 'draft';
  startDate: string;
  endDate?: string | null;
  description?: string;
}

export interface UpdateBatchData {
  batchName?: string;
  batchCode?: string;
  stage?: 'beginner' | 'intermediate' | 'advanced';
  level?: 1 | 2 | 3;
  maxStudents?: number | null;
  schedule?: ScheduleEntry[];
  status?: 'active' | 'ended' | 'draft';
  startDate?: string;
  endDate?: string | null;
  description?: string;
}

export interface BatchStats {
  totalBatches: number;
  activeBatches: number;
  endedBatches: number;
  draftBatches: number;
  totalCapacity: number | null;
  totalEnrolled: number;
  batchesAtCapacity: number;
  utilizationRate: number | null;
}

export interface ScheduleConflict {
  batchId: string;
  batchName: string;
  dayOfWeek: number;
  dayName: string;
  startTime: string;
}

export interface ScheduleValidationResult {
  hasConflict: boolean;
  conflicts: ScheduleConflict[];
}

export interface BatchFilters {
  status?: 'active' | 'ended' | 'draft';
  stage?: 'beginner' | 'intermediate' | 'advanced';
  level?: number;
}

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

export const STAGE_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' }
];

export const LEVEL_OPTIONS = [
  { value: 1, label: 'Level 1' },
  { value: 2, label: 'Level 2' },
  { value: 3, label: 'Level 3' }
];

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'ended', label: 'Ended' }
];

// Eligible student for batch assignment (includes current batch info)
export interface EligibleStudent {
  _id: string;
  studentName: string;
  email: string;
  phone?: string;
  stage: 'beginner' | 'intermediate' | 'advanced';
  level: 1 | 2 | 3;
  isActive: boolean;
  currentBatchId: string | null;
  currentBatchName: string | null;
  isAssigned: boolean;
}

// Result of bulk assignment operation
export interface BulkAssignResult {
  success: boolean;
  assignedCount: number;
  results: Array<{
    studentId: string;
    studentName: string;
    success: boolean;
    error?: string;
    previousBatch?: string;
  }>;
}
