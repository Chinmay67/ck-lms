import axios from 'axios';
import type { Student, ApiResponse, PaginatedResponse, StudentFilters } from '../types/student';
import type { Course, CourseFormData, LevelFormData } from '../types/course';
import { getMockPaginatedStudents } from '../mocks/students';

// Toggle between mock and real API
const USE_MOCK_DATA = false; // Set to false to use real backend

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
  baseURL: 'http://localhost:3000/api',
  timeout: 10000,
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
    console.log(`Making ${config.method?.toUpperCase()} request to: ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    
    // Handle 401 Unauthorized - token expired or invalid
    if (error.response?.status === 401) {
      TokenManager.removeToken();
      // Redirect to login page
      window.location.href = '/login';
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
    window.location.href = '/login';
  }

  // Check if user is authenticated
  static isAuthenticated(): boolean {
    return TokenManager.hasToken();
  }
}

export class StudentsAPI {
  // Get all students with pagination and filters
  static async getStudents(filters: StudentFilters = {}): Promise<ApiResponse<PaginatedResponse<Student>>> {
    // Use mock data if enabled
    if (USE_MOCK_DATA) {
      return new Promise((resolve) => {
        setTimeout(() => {
          const mockData = getMockPaginatedStudents(
            filters.page || 1,
            filters.limit || 10,
            filters.search
          );
          const mockResponse: ApiResponse<PaginatedResponse<Student>> = {
            success: true,
            data: mockData.data,
            timestamp: new Date().toISOString(),
          };
          resolve(mockResponse);
        }, 300); // Simulate network delay
      });
    }

    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
    if (filters.search) params.append('search', filters.search);
    if (filters.stage) params.append('stage', filters.stage);
    if (filters.isActive !== undefined) params.append('isActive', filters.isActive.toString());

    const response = await api.get(`/students?${params.toString()}`);
    return response.data;
  }

  // Get student by ID
  static async getStudentById(id: string): Promise<ApiResponse<Student>> {
    const response = await api.get(`/students/${id}`);
    return response.data;
  }

  // Get student by email
  static async getStudentByEmail(email: string): Promise<ApiResponse<Student>> {
    const response = await api.get(`/students/email/${email}`);
    return response.data;
  }

  // Get student statistics
  static async getStudentStats(): Promise<ApiResponse> {
    const response = await api.get('/students/stats');
    return response.data;
  }

  // Create new student
  static async createStudent(studentData: Partial<Student>): Promise<ApiResponse<Student>> {
    const response = await api.post('/students', studentData);
    return response.data;
  }

  // Update student
  static async updateStudent(id: string, studentData: Partial<Student>): Promise<ApiResponse<Student>> {
    const response = await api.put(`/students/${id}`, studentData);
    return response.data;
  }

  // Delete student
  static async deleteStudent(id: string): Promise<ApiResponse> {
    const response = await api.delete(`/students/${id}`);
    return response.data;
  }

  // Toggle student active/inactive status
  static async toggleStudentActiveStatus(id: string): Promise<ApiResponse<Student>> {
    const response = await api.patch(`/students/${id}/toggle-active`);
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
    if (filters.stage) params.append('stage', filters.stage);
    if (filters.studentId) params.append('studentId', filters.studentId);
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

    const response = await api.get(`/fees?${params.toString()}`);
    return response.data;
  }

  // Get fees for a specific student
  static async getStudentFees(studentId: string): Promise<ApiResponse> {
    const response = await api.get(`/fees/student/${studentId}`);
    return response.data;
  }

  // Get overdue fees
  static async getOverdueFees(): Promise<ApiResponse> {
    const response = await api.get('/fees/overdue');
    return response.data;
  }

  // Get fee statistics
  static async getFeeStats(): Promise<ApiResponse> {
    const response = await api.get('/fees/stats');
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
  }): Promise<ApiResponse> {
    const response = await api.post('/fees/bulk-payment', data);
    return response.data;
  }

  // Update fee record
  static async updateFee(feeId: string, data: {
    paymentDate?: string;
    paymentMethod?: string;
    transactionId?: string;
    remarks?: string;
  }): Promise<ApiResponse> {
    const response = await api.put(`/fees/${feeId}`, data);
    return response.data;
  }

  // Delete fee record
  static async deleteFee(feeId: string): Promise<ApiResponse> {
    const response = await api.delete(`/fees/${feeId}`);
    return response.data;
  }

  // Get overdue status for all students
  static async getStudentsOverdueStatus(): Promise<ApiResponse<Record<string, boolean>>> {
    const response = await api.get('/fees/students-overdue-status');
    return response.data;
  }

  // Get payable fees for a student (overdue + one next pending)
  static async getPayableFees(studentId: string): Promise<ApiResponse> {
    const response = await api.get(`/fees/payable/${studentId}`);
    return response.data;
  }

  // Download fees template
  static async downloadFeesTemplate(): Promise<Blob> {
    const response = await api.get('/fees/download-template', { 
      responseType: 'blob' 
    });
    return response.data;
  }

  // Bulk upload fees from Excel
  static async bulkUploadFees(file: File): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/fees/bulk-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }
}

export class CourseAPI {
  // Get all courses
  static async getCourses(activeOnly: boolean = false): Promise<ApiResponse<Course[]>> {
    const params = activeOnly ? '?activeOnly=true' : '';
    const response = await api.get(`/courses${params}`);
    return response.data;
  }

  // Get course by ID
  static async getCourseById(id: string): Promise<ApiResponse<Course>> {
    const response = await api.get(`/courses/${id}`);
    return response.data;
  }

  // Get course by name
  static async getCourseByName(courseName: string): Promise<ApiResponse<Course>> {
    const response = await api.get(`/courses/name/${courseName}`);
    return response.data;
  }

  // Create course
  static async createCourse(data: CourseFormData & { levels?: LevelFormData[] }): Promise<ApiResponse<Course>> {
    const response = await api.post('/courses', data);
    return response.data;
  }

  // Update course
  static async updateCourse(id: string, data: Partial<CourseFormData>): Promise<ApiResponse<Course>> {
    const response = await api.put(`/courses/${id}`, data);
    return response.data;
  }

  // Delete course
  static async deleteCourse(id: string): Promise<ApiResponse> {
    const response = await api.delete(`/courses/${id}`);
    return response.data;
  }

  // Add level to course
  static async addLevel(courseId: string, data: LevelFormData): Promise<ApiResponse<Course>> {
    const response = await api.post(`/courses/${courseId}/levels`, data);
    return response.data;
  }

  // Update level in course
  static async updateLevel(courseId: string, levelNumber: number, data: Partial<LevelFormData>): Promise<ApiResponse<Course>> {
    const response = await api.put(`/courses/${courseId}/levels/${levelNumber}`, data);
    return response.data;
  }

  // Remove level from course
  static async removeLevel(courseId: string, levelNumber: number): Promise<ApiResponse<Course>> {
    const response = await api.delete(`/courses/${courseId}/levels/${levelNumber}`);
    return response.data;
  }
}

export default api;
