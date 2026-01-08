export interface CourseLevel {
  levelNumber: number;
  feeAmount: number;
  durationMonths: number;
  approximateHours: number;
  description?: string;
}

export interface Course {
  _id?: string;
  id?: string;
  courseName: string;
  displayName: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
  levels: CourseLevel[];
  numberOfLevels?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseFormData {
  courseName: string;
  displayName: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface LevelFormData {
  levelNumber: number;
  feeAmount: number;
  durationMonths: number;
  approximateHours: number;
  description?: string;
}
