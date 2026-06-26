export interface CourseLevel {
  levelNumber: number;
  feeAmount: number;
  durationMonths?: number;       // legacy
  durationMonthsMin?: number;
  durationMonthsMax?: number;
  approximateHours: number;
  description?: string;
}

export interface CourseStage {
  stageNumber: number;
  stageName: string;
  levels: CourseLevel[];
}

export interface Course {
  _id?: string;
  id?: string;
  courseName: string;
  displayName: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
  stages?: CourseStage[];
  levels: CourseLevel[];
  numberOfLevels?: number;
  numberOfStages?: number;
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
  durationMonthsMin?: number;
  durationMonthsMax?: number;
  approximateHours: number;
  description?: string;
}
