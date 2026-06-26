import axios from 'axios';
import type { Student, ApiResponse, PaginatedResponse, StudentFilters } from '../types/student';
import type { Course, CourseFormData, LevelFormData } from '../types/course';
import type { Batch, CreateBatchData, UpdateBatchData, BatchStats, BatchFilters, EligibleStudent, BulkAssignResult } from '../types/batch';

import { env } from '../config/env';
import { parseError, getErrorMessage } from '../utils/errorHandler';

// Auth token management
const TOKEN_KEY = 'auth_token';

export const TokenManager = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  removeToken: (): void => localStorage.removeItem(TOKEN_KEY),
  hasToken: (): boolean => !!localStorage.getItem(TOKEN_KEY),
};

// Create axios instance with base configuration
const api = axios.create({
  baseURL: env.API_BASE_URL,
  timeout: env.REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = TokenManager.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (import.meta.env.DEV) {
      console.log(`Making ${config.method?.toUpperCase()} request to: ${config.url}`);
    }
    return config;
  },
  (error) => {
    console.error('Request error:', getErrorMessage(error));
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors with meaningful messages
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const parsed = parseError(error);

    // Log error for debugging
    console.error('API Error:', {
      message: parsed.message,
      errorCode: parsed.errorCode,
      statusCode: parsed.statusCode,
      url: error.config?.url,
      method: error.config?.method,
    });

    // Handle 401 Unauthorized - token expired or invalid
    if (parsed.statusCode === 401 || parsed.isAuthError) {
      TokenManager.removeToken();
    }

    // Enhance the error object with parsed message
    if (error.response?.data) {
      error.response.data.parsedMessage = parsed.message;
    }

    return Promise.reject(error);
  }
);

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'superadmin';
  isActive?: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
}

const STAGE_NAME_BY_NUMBER: Record<number, 'beginner' | 'intermediate' | 'advanced'> = {
  1: 'beginner',
  2: 'intermediate',
  3: 'advanced',
};

const STAGE_NUMBER_BY_NAME: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

function normalizeCourseForLegacyUi(course: any): any {
  if (!course) return course;
  return {
    ...course,
    levels: course.levels ?? course.stages?.flatMap((stage: any) => stage.levels ?? []) ?? [],
  };
}

function normalizeBatchForLegacyUi(batch: any): any {
  if (!batch) return batch;
  return {
    ...batch,
    id: batch.id ?? batch._id,
    stage: batch.stage ?? STAGE_NAME_BY_NUMBER[batch.stageNumber] ?? 'beginner',
    level: batch.level ?? batch.levelNumber ?? 1,
    currentStudentCount: batch.currentStudentCount ?? batch.activeStudentCount ?? 0,
  };
}

export class AuthAPI {
  // Login
  static async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
    const response = await api.post('/auth/login', credentials);
    if (response.data.success && response.data.data.token) {
      TokenManager.setToken(response.data.data.token);
    }
    return response.data;
  }

  // Register
  static async register(data: RegisterData): Promise<ApiResponse<AuthResponse>> {
    const response = await api.post('/auth/register', data);
    if (response.data.success && response.data.data.token) {
      TokenManager.setToken(response.data.data.token);
    }
    return response.data;
  }

  // Get current user
  static async getCurrentUser(): Promise<ApiResponse<User>> {
    const response = await api.get('/auth/me');
    return response.data;
  }

  // Logout
  static logout(): void {
    TokenManager.removeToken();
  }

  // Check if user is authenticated
  static isAuthenticated(): boolean {
    return TokenManager.hasToken();
  }
}

export class StudentsAPI {
  // Get all students with pagination and filters
  static async getStudents(filters: StudentFilters = {}): Promise<ApiResponse<PaginatedResponse<Student>>> {
    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
    if (filters.search) params.append('search', filters.search);
    if (filters.stage) {
      const stageNum = STAGE_NUMBER_BY_NAME[filters.stage];
      if (stageNum) params.append('stageNumber', stageNum.toString());
    }
    if (filters.isActive !== undefined) params.append('isActive', filters.isActive.toString());

    const response = await api.get(`/v2/students?${params.toString()}`);
    return response.data;
  }

  // Get student by ID
  static async getStudentById(id: string): Promise<ApiResponse<Student>> {
    const response = await api.get(`/v2/students/${id}`);
    return response.data;
  }

  // Get student by email — searches via V2 students endpoint
  static async getStudentByEmail(email: string): Promise<ApiResponse<Student>> {
    const response = await api.get(`/v2/students?search=${encodeURIComponent(email)}&limit=1`);
    const first = response.data?.data?.data?.[0] ?? null;
    return { ...response.data, data: first };
  }

  // Get student statistics
  static async getStudentStats(): Promise<ApiResponse> {
    const response = await api.get('/v2/dashboard');
    return response.data;
  }

  // Create new student
  static async createStudent(studentData: Partial<Student>): Promise<ApiResponse<Student>> {
    const response = await api.post('/v2/students', studentData);
    return response.data;
  }

  // Update student
  static async updateStudent(id: string, studentData: Partial<Student>): Promise<ApiResponse<Student>> {
    const response = await api.put(`/v2/students/${id}`, studentData);
    return response.data;
  }

  // Delete student
  static async deleteStudent(id: string): Promise<ApiResponse> {
    const response = await api.delete(`/v2/students/${id}`);
    return response.data;
  }

  // Toggle student active/inactive status
  static async toggleStudentActiveStatus(id: string): Promise<ApiResponse<Student>> {
    const response = await api.patch(`/v2/students/${id}/toggle-active`);
    return response.data;
  }
}

export class FeesAPI {
  // Get all fees with filters
  static async getFees(filters: any = {}): Promise<ApiResponse> {
    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.status) params.append('status', filters.status);
    if (filters.stage) params.append('search', filters.stage);
    if (filters.studentId) params.append('studentId', filters.studentId);
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

    const response = await api.get(`/v2/fees?${params.toString()}`);
    return response.data;
  }

  // Get fees for a specific student
  static async getStudentFees(studentId: string): Promise<ApiResponse> {
    const response = await api.get(`/v2/students/${studentId}`);
    if (response.data?.success && response.data?.data?.invoices) {
      response.data.data = response.data.data.invoices.map((invoice: any) => ({
        ...invoice,
        _id: invoice._id || invoice.id,
        feeMonth: invoice.invoiceMonth,
        feeAmount: invoice.amount,
        paidAmount: invoice.allocatedAmount,
        remainingAmount: invoice.balanceDue,
      }));
    }
    return response.data;
  }

  // Get overdue fees
  static async getOverdueFees(): Promise<ApiResponse> {
    const response = await api.get('/v2/fees?status=overdue');
    return response.data;
  }

  // Get fee statistics
  static async getFeeStats(): Promise<ApiResponse> {
    const response = await api.get('/v2/dashboard');
    return response.data;
  }

  // Record bulk payment for multiple months
  static async recordBulkPayment(data: {
    studentId: string;
    months: Array<{ feeMonth: string; dueDate: string }>;
    paymentDate: string;
    paymentMethod: string;
    transactionId?: string;
    remarks?: string;
    paidAmount?: number;
    discountType?: 'percentage' | 'fixed';
    discountValue?: number;
    discountReason?: string;
    idempotencyKey?: string;
  }): Promise<ApiResponse> {
    // Generate a per-submission idempotency key so a double-click or network
    // retry of THIS submission is rejected server-side as a duplicate, while a
    // genuinely separate payment (e.g. the same transactionId reused for a
    // sibling, or a multi-month payment recorded as one submission) is allowed.
    // The key is derived here, not from transactionId, so reused transaction
    // IDs across distinct submissions are not treated as duplicates.
    const idempotencyKey = data.idempotencyKey ?? crypto.randomUUID();
    const response = await api.post('/v2/fees/payment', {
      studentId: data.studentId,
      amount: data.paidAmount ?? 0,
      invoiceIds: data.months?.map((m: any) => m.invoiceId || m.feeRecordId).filter(Boolean) ?? [],
      paymentMethod: data.paymentMethod,
      transactionId: data.transactionId,
      remarks: data.remarks,
      idempotencyKey,
      ...(data.discountType && data.discountValue !== undefined && {
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountReason: data.discountReason,
      }),
    });
    return response.data;
  }

  // Edit a payment's NON-MONEY metadata (transactionId, paymentMethod, remarks).
  // Each change is appended to an audit trail server-side. Money corrections go
  // through reverse + re-record, not this endpoint.
  static async updatePaymentMetadata(paymentTransactionId: string, data: {
    transactionId?: string;
    paymentMethod?: string;
    remarks?: string;
    note?: string;
  }): Promise<ApiResponse> {
    const response = await api.patch(`/v2/fees/payment/${paymentTransactionId}`, data);
    return response.data;
  }

  // Correct fee amount on unpaid record (admin)
  static async correctFeeAmount(feeId: string, data: {
    feeAmount: number;
    reason?: string;
  }): Promise<ApiResponse> {
    const response = await api.patch(`/v2/fees/${feeId}/correct-amount`, data);
    return response.data;
  }

  // Delete fee record
  static async deleteFee(feeId: string): Promise<ApiResponse> {
    const response = await api.delete(`/v2/fees/${feeId}`);
    return response.data;
  }

  // Reverse a payment (undoes allocations + claws back excess credit; audit-safe)
  static async reversePayment(paymentTransactionId: string, reason: string): Promise<ApiResponse> {
    const response = await api.post(`/v2/fees/payment/${paymentTransactionId}/reverse`, { reason });
    return response.data;
  }

  // Get overdue status for all students
  static async getStudentsOverdueStatus(): Promise<ApiResponse<Record<string, boolean>>> {
    const response = await api.get('/v2/students?overdueOnly=true&limit=1000');
    const map: Record<string, boolean> = {};
    response.data?.data?.data?.forEach((student: any) => {
      map[student._id || student.id] = true;
    });
    return { success: true, data: map, timestamp: new Date().toISOString() };
  }

  // Get payable fees for a student (overdue + one next pending)
  static async getPayableFees(studentId: string): Promise<ApiResponse> {
    const response = await api.get(`/v2/students/${studentId}`);
    const invoices = (response.data?.data?.invoices ?? []).map((invoice: any) => ({
      ...invoice,
      _id: invoice._id || invoice.id,
      feeMonth: invoice.invoiceMonth,
      feeAmount: invoice.amount,
      paidAmount: invoice.allocatedAmount,
      remainingAmount: invoice.balanceDue,
    }));
    return {
      success: true,
      data: {
        overdue: invoices.filter((invoice: any) => invoice.status === 'overdue'),
        nextUpcoming: invoices.find((invoice: any) => invoice.status === 'upcoming') ?? null,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export class CourseAPI {
  // Get all courses
  static async getCourses(activeOnly: boolean = false): Promise<ApiResponse<Course[]>> {
    const params = activeOnly ? '?activeOnly=true' : '';
    const response = await api.get(`/v2/courses${params}`);
    if (response.data?.success) response.data.data = response.data.data.map(normalizeCourseForLegacyUi);
    return response.data;
  }

  // Get course by ID
  static async getCourseById(id: string): Promise<ApiResponse<Course>> {
    const response = await api.get(`/v2/courses/${id}`);
    if (response.data?.success) response.data.data = normalizeCourseForLegacyUi(response.data.data);
    return response.data;
  }

  // Get course by name
  static async getCourseByName(courseName: string): Promise<ApiResponse<Course>> {
    const response = await api.get('/v2/courses');
    if (response.data?.success) {
      response.data.data = normalizeCourseForLegacyUi(response.data.data.find((course: any) => course.courseName === courseName || course.displayName === courseName));
    }
    return response.data;
  }

  // Create course
  static async createCourse(data: CourseFormData & { levels?: LevelFormData[] }): Promise<ApiResponse<Course>> {
    const response = await api.post('/v2/courses', data);
    return response.data;
  }

  // Update course
  static async updateCourse(id: string, data: Partial<CourseFormData>): Promise<ApiResponse<Course>> {
    const response = await api.put(`/v2/courses/${id}`, data);
    return response.data;
  }

  // Delete course
  static async deleteCourse(id: string): Promise<ApiResponse> {
    const response = await api.delete(`/v2/courses/${id}`);
    return response.data;
  }

  // Add level to course
  static async addLevel(courseId: string, data: LevelFormData): Promise<ApiResponse<Course>> {
    const response = await api.post(`/v2/courses/${courseId}/stages/1/levels`, data);
    return response.data;
  }

  // Update level in course
  static async updateLevel(courseId: string, levelNumber: number, data: Partial<LevelFormData>): Promise<ApiResponse<Course>> {
    const response = await api.put(`/v2/courses/${courseId}/stages/1/levels/${levelNumber}`, data);
    return response.data;
  }

  // Remove level from course
  static async removeLevel(courseId: string, levelNumber: number): Promise<ApiResponse<Course>> {
    const response = await api.delete(`/v2/courses/${courseId}/stages/1/levels/${levelNumber}`);
    return response.data;
  }
}

export class CreditAPI {
  // Get student credits
  static async getStudentCredits(studentId: string): Promise<ApiResponse> {
    const response = await api.get(`/v2/fees/student/${studentId}/credits`);
    return response.data;
  }

  // Get credit summary for a student
  static async getCreditSummary(studentId: string): Promise<ApiResponse> {
    const response = await api.get(`/v2/fees/student/${studentId}/credits`);
    const credits = response.data?.data?.credits ?? [];
    const balance = response.data?.data?.creditBalance ?? 0;
    return {
      success: true,
      data: { totalCredits: credits.length, activeCredits: credits.length, usedCredits: 0, expiredCredits: 0, totalPaid: balance, totalUsed: 0, totalRemaining: balance },
      timestamp: new Date().toISOString(),
    };
  }

  // Create credit for student
  static async createCredit(data: {
    studentId: string;
    amount: number;
    description: string;
    paymentMethod?: string;
    transactionId?: string;
    remarks?: string;
    dueDate?: string;
    paidDate?: string;
    idempotencyKey?: string;
  }): Promise<ApiResponse> {
    // Per-submission idempotency key — protects against double-click / retry of
    // THIS credit row (same mechanism as recordBulkPayment). Each row in a
    // multi-credit submit gets its own key.
    const idempotencyKey = data.idempotencyKey ?? crypto.randomUUID();
    const response = await api.post(`/v2/fees/student/${data.studentId}/credits`, { ...data, idempotencyKey });
    return response.data;
  }

}

export class BatchAPI {
  // Get all batches with filters
  static async getBatches(filters: BatchFilters = {}): Promise<ApiResponse<Batch[]>> {
    const params = new URLSearchParams();

    if (filters.status) params.append('status', filters.status);
    if (filters.stageNumber !== undefined) params.append('stageNumber', filters.stageNumber.toString());
    if (filters.levelNumber !== undefined) params.append('levelNumber', filters.levelNumber.toString());
    // legacy fallback
    if (filters.level && filters.levelNumber === undefined) params.append('levelNumber', filters.level.toString());

    const response = await api.get(`/v2/batches?${params.toString()}`);
    if (response.data?.success) response.data.data = response.data.data.map(normalizeBatchForLegacyUi);
    return response.data;
  }

  // Get batch by ID
  static async getBatchById(id: string): Promise<ApiResponse<Batch>> {
    const response = await api.get(`/v2/batches?${new URLSearchParams({ id }).toString()}`);
    if (response.data?.success) response.data.data = normalizeBatchForLegacyUi(response.data.data?.[0]);
    return response.data;
  }

  // Get available batches for a stage and level
  static async getAvailableBatches(stage: 'beginner' | 'intermediate' | 'advanced', level: number): Promise<ApiResponse<Batch[]>> {
    const stageNumber = STAGE_NUMBER_BY_NAME[stage] ?? 1;
    const response = await api.get(`/v2/batches?status=active&stageNumber=${stageNumber}&levelNumber=${level}`);
    if (response.data?.success) response.data.data = response.data.data.map(normalizeBatchForLegacyUi);
    return response.data;
  }

  // Get batch statistics
  static async getBatchStats(): Promise<ApiResponse<BatchStats>> {
    const response = await api.get('/v2/batches');
    const batches = response.data?.data ?? [];
    return {
      success: true,
      data: {
        totalBatches: batches.length,
        activeBatches: batches.filter((b: any) => b.status === 'active').length,
        endedBatches: batches.filter((b: any) => b.status === 'ended').length,
        draftBatches: batches.filter((b: any) => b.status === 'draft').length,
        totalCapacity: null,
        totalEnrolled: batches.reduce((sum: number, b: any) => sum + (b.activeStudentCount ?? 0), 0),
        batchesAtCapacity: 0,
        utilizationRate: null,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Get students in a batch via V2 students list filtered by batchId
  static async getBatchStudents(batchId: string): Promise<ApiResponse<Student[]>> {
    const response = await api.get(`/v2/students?batchId=${batchId}&limit=1000`);
    const students = response.data?.data?.data ?? [];
    return { success: response.data?.success ?? false, data: students, timestamp: response.data?.timestamp ?? new Date().toISOString() };
  }

  // Create new batch
  static async createBatch(data: CreateBatchData): Promise<ApiResponse<Batch>> {
    const response = await api.post('/v2/batches', data);
    return response.data;
  }

  // Update batch
  static async updateBatch(id: string, data: UpdateBatchData): Promise<ApiResponse<Batch>> {
    const response = await api.put(`/v2/batches/${id}`, data);
    return response.data;
  }

  // End batch
  static async endBatch(id: string): Promise<ApiResponse<Batch>> {
    const response = await api.patch(`/v2/batches/${id}/end`);
    return response.data;
  }

  // Delete batch
  static async deleteBatch(id: string): Promise<ApiResponse> {
    const response = await api.delete(`/v2/batches/${id}`);
    return response.data;
  }

  // Assign student to batch via enrollment change-batch
  static async assignStudentToBatch(studentId: string, batchId: string): Promise<ApiResponse<Student>> {
    const response = await api.post(`/v2/students/${studentId}/enrollments/change-batch`, { newBatchId: batchId });
    return response.data;
  }

  // Remove student from batch by clearing their active enrollment's batch
  static async removeStudentFromBatch(studentId: string): Promise<ApiResponse<Student>> {
    const response = await api.post(`/v2/students/${studentId}/enrollments/change-batch`, { newBatchId: null });
    return response.data;
  }

  // Get eligible students for a batch (same stageNumber/levelNumber, active)
  static async getEligibleStudents(batchId: string, stageNumber: number, levelNumber: number): Promise<ApiResponse<EligibleStudent[]>> {
    const response = await api.get(`/v2/students?stageNumber=${stageNumber}&levelNumber=${levelNumber}&isActive=true&limit=1000`);
    const students: any[] = response.data?.data?.data ?? [];
    const eligibleStudents: EligibleStudent[] = students.map((s) => {
      const currentBatchId = typeof s.batchId === 'object' ? s.batchId?._id?.toString() ?? null : s.batchId ?? null;
      return {
        _id: s._id || s.id,
        studentName: s.studentName,
        email: s.email ?? '',
        phone: s.phone,
        stage: STAGE_NAME_BY_NUMBER[s.stageNumber ?? 1] ?? 'beginner',
        level: (s.levelNumber ?? 1) as 1 | 2 | 3,
        isActive: s.isActive,
        currentBatchId,
        currentBatchName: typeof s.batchId === 'object' ? s.batchId?.batchName ?? null : null,
        isAssigned: currentBatchId === batchId,
      };
    });
    return { success: response.data?.success ?? false, data: eligibleStudents, timestamp: response.data?.timestamp ?? new Date().toISOString() };
  }

  // Bulk assign students to batch via individual enrollment change-batch calls
  static async bulkAssignStudents(batchId: string, studentIds: string[]): Promise<ApiResponse<BulkAssignResult>> {
    const results: BulkAssignResult['results'] = [];
    let assignedCount = 0;
    await Promise.all(
      studentIds.map(async (studentId) => {
        try {
          await api.post(`/v2/students/${studentId}/enrollments/change-batch`, { newBatchId: batchId });
          results.push({ studentId, studentName: '', success: true });
          assignedCount++;
        } catch (err: any) {
          results.push({ studentId, studentName: '', success: false, error: err.response?.data?.error ?? 'Failed to assign' });
        }
      }),
    );
    return {
      success: assignedCount > 0,
      data: { success: assignedCount > 0, assignedCount, results },
      timestamp: new Date().toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// V2 Admin API
// All endpoints under /api/v2/* — require auth token
// ─────────────────────────────────────────────────────────────────

export class AdminDashboardAPI {
  static async getStats(): Promise<ApiResponse> {
    const response = await api.get('/v2/dashboard');
    return response.data;
  }
}

export class AdminStudentsAPI {
  static async list(filters: {
    page?: number;
    limit?: number;
    search?: string;
    courseId?: string;
    stageNumber?: number;
    levelNumber?: number;
    batchId?: string;
    isActive?: boolean | 'all';
    overdueOnly?: boolean;
  } = {}): Promise<ApiResponse> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.courseId) params.append('courseId', filters.courseId);
    if (filters.stageNumber !== undefined) params.append('stageNumber', filters.stageNumber.toString());
    if (filters.levelNumber !== undefined) params.append('levelNumber', filters.levelNumber.toString());
    if (filters.batchId) params.append('batchId', filters.batchId);
    if (filters.isActive !== undefined && filters.isActive !== 'all') params.append('isActive', String(filters.isActive));
    if (filters.overdueOnly) params.append('overdueOnly', 'true');
    const response = await api.get(`/v2/students?${params}`);
    return response.data;
  }

  static async get(studentId: string): Promise<ApiResponse> {
    const response = await api.get(`/v2/students/${studentId}`);
    return response.data;
  }

  static async getAuditHistory(studentId: string, filters: { category?: string } = {}): Promise<ApiResponse> {
    const params = new URLSearchParams();
    if (filters.category && filters.category !== 'all') params.append('category', filters.category);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await api.get(`/v2/students/${studentId}/audit-history${suffix}`);
    return response.data;
  }

  static async create(data: {
    studentName: string;
    parentName?: string;
    phone?: string;
    email?: string;
    dob?: string;
    address?: string;
    referredBy?: string;
    enrollmentDate?: string;
    courseId: string;
    stageNumber: number;
    levelNumber: number;
    batchId?: string;
    monthlyFee: number;
    discountType?: 'none' | 'percentage' | 'fixed';
    discountPct?: number;
    discountAmount?: number;
    discountReason?: string;
    createFirstFeeRecord?: boolean;
    firstMonthFee?: number;
    firstMonthDueDate?: string;
  }): Promise<ApiResponse> {
    const response = await api.post('/v2/students', data);
    return response.data;
  }

  static async update(studentId: string, data: {
    studentName?: string;
    parentName?: string;
    phone?: string;
    email?: string;
    dob?: string;
    address?: string;
    alternatePhone?: string;
    alternateEmail?: string;
    referredBy?: string;
  }): Promise<ApiResponse> {
    const response = await api.put(`/v2/students/${studentId}`, data);
    return response.data;
  }

  static async toggleActive(studentId: string): Promise<ApiResponse> {
    const response = await api.patch(`/v2/students/${studentId}/toggle-active`);
    return response.data;
  }

  static async delete(studentId: string): Promise<ApiResponse> {
    const response = await api.delete(`/v2/students/${studentId}`);
    return response.data;
  }

  // Enrollment lifecycle
  static async getEnrollments(studentId: string): Promise<ApiResponse> {
    const response = await api.get(`/v2/students/${studentId}/enrollments`);
    return response.data;
  }

  static async upgrade(studentId: string, data: {
    courseId: string;
    stageNumber: number;
    levelNumber: number;
    monthlyFee: number;
    upgradeDate?: string;
    batchId?: string;
    discountType?: 'none' | 'percentage' | 'fixed';
    discountPct?: number;
    discountAmount?: number;
    discountReason?: string;
  }): Promise<ApiResponse> {
    const response = await api.post(`/v2/students/${studentId}/enrollments/upgrade`, data);
    return response.data;
  }

  static async changeBatch(studentId: string, data: { newBatchId: string | null; changeDate?: string }): Promise<ApiResponse> {
    const response = await api.post(`/v2/students/${studentId}/enrollments/change-batch`, data);
    return response.data;
  }

  static async pause(studentId: string, data: { pausedUntil: string; pauseDate?: string }): Promise<ApiResponse> {
    const response = await api.post(`/v2/students/${studentId}/enrollments/pause`, data);
    return response.data;
  }

  static async resume(studentId: string, data: { resumeDate?: string }): Promise<ApiResponse> {
    const response = await api.post(`/v2/students/${studentId}/enrollments/resume`, data);
    return response.data;
  }

  static async leave(studentId: string, data: { leaveDate?: string }): Promise<ApiResponse> {
    const response = await api.post(`/v2/students/${studentId}/enrollments/leave`, data);
    return response.data;
  }

  static async grandfather(studentId: string, data: { grandfathered: boolean; note?: string }): Promise<ApiResponse> {
    const response = await api.patch(`/v2/students/${studentId}/enrollments/grandfather`, data);
    return response.data;
  }
}

export class AdminCoursesAPI {
  static async list(): Promise<ApiResponse> {
    const response = await api.get('/v2/courses');
    if (response.data?.success) response.data.data = response.data.data.map(normalizeCourseForLegacyUi);
    return response.data;
  }

  static async create(data: { courseName: string; displayName: string; description?: string; displayOrder?: number }): Promise<ApiResponse> {
    const response = await api.post('/v2/courses', data);
    return response.data;
  }

  static async update(courseId: string, data: { displayName?: string; description?: string; displayOrder?: number; isActive?: boolean }): Promise<ApiResponse> {
    const response = await api.put(`/v2/courses/${courseId}`, data);
    return response.data;
  }

  static async delete(courseId: string): Promise<ApiResponse> {
    const response = await api.delete(`/v2/courses/${courseId}`);
    return response.data;
  }

  static async addStage(courseId: string, data: { stageNumber: number; stageName: string }): Promise<ApiResponse> {
    const response = await api.post(`/v2/courses/${courseId}/stages`, data);
    return response.data;
  }

  static async updateStage(courseId: string, stageNum: number, data: { stageName: string }): Promise<ApiResponse> {
    const response = await api.put(`/v2/courses/${courseId}/stages/${stageNum}`, data);
    return response.data;
  }

  static async deleteStage(courseId: string, stageNum: number): Promise<ApiResponse> {
    const response = await api.delete(`/v2/courses/${courseId}/stages/${stageNum}`);
    return response.data;
  }

  static async addLevel(courseId: string, stageNum: number, data: {
    levelNumber: number;
    feeAmount: number;
    durationMonthsMin?: number;
    durationMonthsMax?: number;
    approximateHours?: number;
    description?: string;
  }): Promise<ApiResponse> {
    const response = await api.post(`/v2/courses/${courseId}/stages/${stageNum}/levels`, data);
    return response.data;
  }

  static async updateLevel(courseId: string, stageNum: number, levelNum: number, data: {
    feeAmount?: number;
    durationMonthsMin?: number;
    durationMonthsMax?: number;
    approximateHours?: number;
    description?: string;
  }): Promise<ApiResponse> {
    const response = await api.put(`/v2/courses/${courseId}/stages/${stageNum}/levels/${levelNum}`, data);
    return response.data;
  }

  static async deleteLevel(courseId: string, stageNum: number, levelNum: number): Promise<ApiResponse> {
    const response = await api.delete(`/v2/courses/${courseId}/stages/${stageNum}/levels/${levelNum}`);
    return response.data;
  }

  static async getLevelFeeHistory(courseId: string, stageNum: number, levelNum: number): Promise<ApiResponse> {
    const response = await api.get(`/v2/courses/${courseId}/stages/${stageNum}/levels/${levelNum}/fee-history`);
    return response.data;
  }

  static async getFeeDivergence(courseId: string): Promise<ApiResponse> {
    const response = await api.get(`/v2/courses/${courseId}/fee-divergence`);
    return response.data;
  }

  static async bulkApplyFee(
    courseId: string,
    stageNum: number,
    levelNum: number,
    data: {
      upgradeStudentIds: string[];
      grandfatherStudentIds: string[];
      effectiveDate?: string;
      grandfatherNote?: string;
    },
  ): Promise<ApiResponse> {
    const response = await api.post(
      `/v2/courses/${courseId}/stages/${stageNum}/levels/${levelNum}/bulk-apply-fee`,
      data,
    );
    return response.data;
  }
}

export class AdminBatchesAPI {
  static async list(filters: { courseId?: string; stageNumber?: number; levelNumber?: number; status?: string } = {}): Promise<ApiResponse> {
    const params = new URLSearchParams();
    if (filters.courseId) params.append('courseId', filters.courseId);
    if (filters.stageNumber !== undefined) params.append('stageNumber', filters.stageNumber.toString());
    if (filters.levelNumber !== undefined) params.append('levelNumber', filters.levelNumber.toString());
    if (filters.status) params.append('status', filters.status);
    const response = await api.get(`/v2/batches?${params}`);
    if (response.data?.success) response.data.data = response.data.data.map(normalizeBatchForLegacyUi);
    return response.data;
  }
}

export class AdminFeesAPI {
  static async list(filters: {
    page?: number;
    limit?: number;
    studentId?: string;
    status?: 'upcoming' | 'paid' | 'overdue' | 'partially_paid';
    courseId?: string;
    stageNumber?: number;
    levelNumber?: number;
    monthFrom?: string;
    monthTo?: string;
  } = {}): Promise<ApiResponse> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.studentId) params.append('studentId', filters.studentId);
    if (filters.status) params.append('status', filters.status);
    if (filters.courseId) params.append('courseId', filters.courseId);
    if (filters.stageNumber !== undefined) params.append('stageNumber', filters.stageNumber.toString());
    if (filters.levelNumber !== undefined) params.append('levelNumber', filters.levelNumber.toString());
    if (filters.monthFrom) params.append('monthFrom', filters.monthFrom);
    if (filters.monthTo) params.append('monthTo', filters.monthTo);
    const response = await api.get(`/v2/fees?${params}`);
    return response.data;
  }

  static async create(data: {
    studentId: string;
    enrollmentId: string;
    feeMonth: string;
    feeAmount: number;
    dueDate?: string;
    remarks?: string;
  }): Promise<ApiResponse> {
    const response = await api.post('/v2/fees', {
      studentId: data.studentId,
      enrollmentId: data.enrollmentId,
      invoiceMonth: data.feeMonth,
      amount: data.feeAmount > 0 ? data.feeAmount : undefined,
      dueDate: data.dueDate,
      remarks: data.remarks,
    });
    return response.data;
  }

  static async processPayment(data: {
    studentId: string;
    amount: number;
    feeRecordIds: string[];
    paymentMethod: 'cash' | 'online' | 'card' | 'upi' | 'other';
    transactionId?: string;
  }): Promise<ApiResponse> {
    const response = await api.post('/v2/fees/payment', data);
    return response.data;
  }

  static async reversePayment(paymentTransactionId: string, reason: string): Promise<ApiResponse> {
    const response = await api.post(`/v2/fees/payment/${paymentTransactionId}/reverse`, { reason });
    return response.data;
  }

  static async correctAmount(feeRecordId: string, data: { feeAmount: number; reason?: string }): Promise<ApiResponse> {
    const response = await api.patch(`/v2/fees/${feeRecordId}/correct-amount`, data);
    return response.data;
  }

  static async waive(feeRecordId: string, data: { waivedAmount: number; reason: string }): Promise<ApiResponse> {
    const response = await api.post(`/v2/fees/${feeRecordId}/waive`, data);
    return response.data;
  }

  static async delete(feeRecordId: string): Promise<ApiResponse> {
    const response = await api.delete(`/v2/fees/${feeRecordId}`);
    return response.data;
  }

  static async getStudentCredits(studentId: string): Promise<ApiResponse> {
    const response = await api.get(`/v2/fees/student/${studentId}/credits`);
    return response.data;
  }

  static async addCredit(studentId: string, data: {
    amount: number;
    description: string;
    paymentMethod?: 'cash' | 'online' | 'card' | 'upi' | 'other';
    transactionId?: string;
  }): Promise<ApiResponse> {
    const response = await api.post(`/v2/fees/student/${studentId}/credits`, data);
    return response.data;
  }
}

export class AdminLeadsAPI {
  static async list(filters: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    source?: string;
    followUpFrom?: string;
    followUpTo?: string;
  } = {}): Promise<ApiResponse> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.source && filters.source !== 'all') params.append('source', filters.source);
    if (filters.followUpFrom) params.append('followUpFrom', filters.followUpFrom);
    if (filters.followUpTo) params.append('followUpTo', filters.followUpTo);
    const response = await api.get(`/v2/leads?${params}`);
    return response.data;
  }

  static async get(id: string): Promise<ApiResponse> {
    const response = await api.get(`/v2/leads/${id}`);
    return response.data;
  }

  static async create(data: {
    name: string;
    phone?: string;
    email?: string;
    childName?: string;
    childAge?: number;
    interestedCourseId?: string;
    interestedStageName?: string;
    source?: string;
    status?: string;
    notes?: string;
    followUpDate?: string;
  }): Promise<ApiResponse> {
    const response = await api.post('/v2/leads', data);
    return response.data;
  }

  static async update(id: string, data: Partial<{
    name: string;
    phone: string;
    email: string;
    childName: string;
    childAge: number;
    interestedCourseId: string | null;
    interestedStageName: string;
    source: string;
    status: string;
    notes: string;
    followUpDate: string | null;
  }>): Promise<ApiResponse> {
    const response = await api.put(`/v2/leads/${id}`, data);
    return response.data;
  }

  static async updateStatus(id: string, status: string): Promise<ApiResponse> {
    const response = await api.patch(`/v2/leads/${id}/status`, { status });
    return response.data;
  }

  static async convert(id: string, data: {
    studentName: string;
    parentName?: string;
    phone?: string;
    email?: string;
    dob?: string;
    address?: string;
    referredBy?: string;
    enrollmentDate?: string;
    courseId: string;
    stageNumber: number;
    levelNumber: number;
    batchId?: string;
    monthlyFee: number;
    discountType?: 'none' | 'percentage' | 'fixed';
    discountPct?: number;
    discountAmount?: number;
    discountReason?: string;
    createFirstFeeRecord?: boolean;
    firstMonthFee?: number;
    firstMonthDueDate?: string;
  }): Promise<ApiResponse> {
    const response = await api.post(`/v2/leads/${id}/convert`, data);
    return response.data;
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await api.delete(`/v2/leads/${id}`);
    return response.data;
  }
}

export default api;
