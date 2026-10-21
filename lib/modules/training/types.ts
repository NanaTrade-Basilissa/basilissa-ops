import type { TrainingCourseStatus, TrainingMaterialType, TrainingAssignmentStatus } from "@prisma/client";

export type TrainingCourseListItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  coverImageUrl: string | null;
  estimatedMinutes: number;
  isMandatory: boolean;
  dueDays: number | null;
  status: TrainingCourseStatus;
  targetAll: boolean;
  targetRoles: string[];
  targetBranchIds: string[];
  materialsCount: number;
  assignedCount: number;
  completedCount: number;
  completionRatePercent: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TrainingMaterialItem = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  type: TrainingMaterialType;
  fileUrl: string;
  fileKey: string;
  fileSize: number | null;
  mimeType: string | null;
  durationSeconds: number | null;
  order: number;
  createdAt: Date;
};

export type TrainingCourseDetail = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  coverImageUrl: string | null;
  estimatedMinutes: number;
  isMandatory: boolean;
  dueDays: number | null;
  status: TrainingCourseStatus;
  targetAll: boolean;
  targetRoles: string[];
  targetBranchIds: string[];
  quizAssessmentId: string | null;
  passScorePercent: number | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  materials: TrainingMaterialItem[];
  assignmentsSummary: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
  };
};

export type CreateCourseInput = {
  title: string;
  description?: string;
  category: string;
  coverImageUrl?: string;
  estimatedMinutes: number;
  isMandatory: boolean;
  dueDays?: number;
  targetAll: boolean;
  targetRoles?: string[];
  targetBranchIds?: string[];
  quizAssessmentId?: string;
  passScorePercent?: number;
};
