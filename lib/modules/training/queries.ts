import "server-only";
import { prisma } from "@/lib/platform/prisma";
import type { TrainingCourseListItem, TrainingCourseDetail, TrainingMaterialItem } from "./types";
import type { TrainingCourseStatus } from "@prisma/client";

export async function listTrainingCourses(options: {
  category?: string;
  status?: TrainingCourseStatus;
  search?: string;
} = {}): Promise<TrainingCourseListItem[]> {
  const where: import("@prisma/client").Prisma.TrainingCourseWhereInput = {};

  if (options.category && options.category !== "ALL") {
    where.category = options.category;
  }

  if (options.status) {
    where.status = options.status;
  }

  if (options.search?.trim()) {
    const q = options.search.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }

  const courses = await prisma.trainingCourse.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          materials: true,
          assignments: true,
        },
      },
      assignments: {
        select: {
          status: true,
        },
      },
    },
  });

  return courses.map((course) => {
    const total = course._count.assignments;
    const completed = course.assignments.filter((a) => a.status === "COMPLETED").length;
    const completionRatePercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      category: course.category,
      coverImageUrl: course.coverImageUrl,
      estimatedMinutes: course.estimatedMinutes,
      isMandatory: course.isMandatory,
      dueDays: course.dueDays,
      status: course.status,
      targetAll: course.targetAll,
      targetRoles: course.targetRoles,
      targetBranchIds: course.targetBranchIds,
      materialsCount: course._count.materials,
      assignedCount: total,
      completedCount: completed,
      completionRatePercent,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
  });
}

export async function getTrainingCourse(courseId: string): Promise<TrainingCourseDetail | null> {
  const course = await prisma.trainingCourse.findUnique({
    where: { id: courseId },
    include: {
      materials: {
        orderBy: { order: "asc" },
      },
      assignments: {
        select: {
          status: true,
          dueAt: true,
        },
      },
    },
  });

  if (!course) return null;

  const now = new Date();
  const total = course.assignments.length;
  const completed = course.assignments.filter((a) => a.status === "COMPLETED").length;
  const inProgress = course.assignments.filter((a) => a.status === "IN_PROGRESS").length;
  const notStarted = course.assignments.filter((a) => a.status === "NOT_STARTED").length;
  const overdue = course.assignments.filter((a) => a.dueAt && a.dueAt < now && a.status !== "COMPLETED").length;

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    category: course.category,
    coverImageUrl: course.coverImageUrl,
    estimatedMinutes: course.estimatedMinutes,
    isMandatory: course.isMandatory,
    dueDays: course.dueDays,
    status: course.status,
    targetAll: course.targetAll,
    targetRoles: course.targetRoles,
    targetBranchIds: course.targetBranchIds,
    quizAssessmentId: course.quizAssessmentId,
    passScorePercent: course.passScorePercent,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    publishedAt: course.publishedAt,
    materials: course.materials.map((m) => ({
      id: m.id,
      courseId: m.courseId,
      title: m.title,
      description: m.description,
      type: m.type,
      fileUrl: m.fileUrl,
      fileKey: m.fileKey,
      fileSize: m.fileSize,
      mimeType: m.mimeType,
      durationSeconds: m.durationSeconds,
      order: m.order,
      createdAt: m.createdAt,
    })),
    assignmentsSummary: {
      total,
      completed,
      inProgress,
      notStarted,
      overdue,
    },
  };
}

export async function getTrainingCategories(): Promise<string[]> {
  const categories = await prisma.trainingCourse.findMany({
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  const defaults = ["General", "Food Safety", "Customer Care", "Operations", "Onboarding", "Health & Safety"];
  const set = new Set([...defaults, ...categories.map((c) => c.category)]);
  return Array.from(set);
}

/**
 * Mobile API: Fetch courses assigned to an employee.
 */
export async function getEmployeeCourses(employeeId: string) {
  const assignments = await prisma.trainingAssignment.findMany({
    where: { employeeId },
    include: {
      course: {
        include: {
          materials: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              type: true,
              durationSeconds: true,
              fileSize: true,
              order: true,
            },
          },
        },
      },
      progress: true,
    },
    orderBy: [{ status: "asc" }, { assignedAt: "desc" }],
  });

  return assignments.map((a) => {
    const totalMaterials = a.course.materials.length;
    const completedMaterials = a.progress.filter((p) => p.isCompleted).length;
    const progressPercent = totalMaterials > 0 ? Math.round((completedMaterials / totalMaterials) * 100) : 0;

    return {
      assignmentId: a.id,
      status: a.status,
      assignedAt: a.assignedAt,
      dueAt: a.dueAt,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      quizScore: a.quizScore,
      quizPassed: a.quizPassed,
      progressPercent,
      completedMaterials,
      totalMaterials,
      course: {
        id: a.course.id,
        title: a.course.title,
        description: a.course.description,
        category: a.course.category,
        coverImageUrl: a.course.coverImageUrl,
        estimatedMinutes: a.course.estimatedMinutes,
        isMandatory: a.course.isMandatory,
        materials: a.course.materials,
      },
    };
  });
}

export async function getCourseAssignments(courseId: string) {
  const assignments = await prisma.trainingAssignment.findMany({
    where: { courseId },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          jobTitle: true,
          branchAssignments: {
            where: { isPrimary: true },
            select: { branch: { select: { name: true } } },
          },
        },
      },
      progress: true,
    },
    orderBy: [{ status: "asc" }, { assignedAt: "desc" }],
  });

  return assignments.map((a) => {
    const branchName = a.employee.branchAssignments[0]?.branch?.name ?? "Unassigned";
    return {
      id: a.id,
      employeeId: a.employeeId,
      employeeName: `${a.employee.firstName} ${a.employee.lastName}`,
      employeeCode: a.employee.employeeCode,
      jobTitle: a.employee.jobTitle ?? "Staff",
      branchName,
      status: a.status,
      assignedAt: a.assignedAt,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      dueAt: a.dueAt,
      quizScore: a.quizScore,
      quizPassed: a.quizPassed,
      completedMaterialsCount: a.progress.filter((p) => p.isCompleted).length,
    };
  });
}

