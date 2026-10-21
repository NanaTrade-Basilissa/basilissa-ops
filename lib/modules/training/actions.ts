"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission } from "@/lib/modules/identity/server";
import { deleteFromR2 } from "@/lib/platform/r2";
import { notifyTrainingAssignment } from "./notifications";
import type { TrainingMaterialType } from "@prisma/client";

export type ActionResponse<T = unknown> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string };

/**
 * Creates a new training course.
 */
export async function createCourseAction(formData: FormData): Promise<ActionResponse<{ id: string }>> {
  try {
    const actor = await requirePermission("training:create");
    if (!actor) return { success: false, error: "Unauthorized" };

    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const category = String(formData.get("category") ?? "General").trim() || "General";
    const estimatedMinutes = parseInt(String(formData.get("estimatedMinutes") ?? "15"), 10) || 15;
    const isMandatory = formData.get("isMandatory") === "true" || formData.get("isMandatory") === "on";
    const dueDaysRaw = formData.get("dueDays");
    const dueDays = dueDaysRaw ? parseInt(String(dueDaysRaw), 10) : null;
    const targetAll = formData.get("targetAll") !== "false";
    const coverImageUrl = String(formData.get("coverImageUrl") ?? "").trim() || null;
    const quizAssessmentId = String(formData.get("quizAssessmentId") ?? "").trim() || null;
    const passScorePercentRaw = formData.get("passScorePercent");
    const passScorePercent = passScorePercentRaw ? parseInt(String(passScorePercentRaw), 10) : 80;

    if (!title) {
      return { success: false, error: "Course title is required." };
    }

    if (quizAssessmentId) {
      const assessment = await prisma.assessment.findUnique({
        where: { id: quizAssessmentId },
        select: { id: true, publicLinkToken: true, publicLinkEnabled: true },
      });
      if (assessment && (!assessment.publicLinkToken || !assessment.publicLinkEnabled)) {
        await prisma.assessment.update({
          where: { id: quizAssessmentId },
          data: {
            publicLinkEnabled: true,
            publicLinkToken: assessment.publicLinkToken || randomBytes(24).toString("base64url"),
          },
        });
      }
    }

    const course = await prisma.trainingCourse.create({
      data: {
        title,
        description,
        category,
        estimatedMinutes,
        isMandatory,
        dueDays,
        targetAll,
        coverImageUrl,
        quizAssessmentId,
        passScorePercent,
        createdById: actor.userId,
      },
      select: { id: true },
    });

    revalidatePath("/admin/training");
    return { success: true, data: { id: course.id } };
  } catch (error) {
    console.error("createCourseAction error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create course" };
  }
}

/**
 * Updates an existing training course's metadata.
 */
export async function updateCourseAction(courseId: string, formData: FormData): Promise<ActionResponse> {
  try {
    const actor = await requirePermission("training:update");
    if (!actor) return { success: false, error: "Unauthorized" };

    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const category = String(formData.get("category") ?? "General").trim() || "General";
    const estimatedMinutes = parseInt(String(formData.get("estimatedMinutes") ?? "15"), 10) || 15;
    const isMandatory = formData.get("isMandatory") === "true" || formData.get("isMandatory") === "on";
    const dueDaysRaw = formData.get("dueDays");
    const dueDays = dueDaysRaw ? parseInt(String(dueDaysRaw), 10) : null;
    const targetAll = formData.get("targetAll") !== "false";
    const coverImageUrl = String(formData.get("coverImageUrl") ?? "").trim() || null;
    const quizAssessmentId = String(formData.get("quizAssessmentId") ?? "").trim() || null;
    const passScorePercentRaw = formData.get("passScorePercent");
    const passScorePercent = passScorePercentRaw ? parseInt(String(passScorePercentRaw), 10) : 80;

    if (!title) {
      return { success: false, error: "Course title is required." };
    }

    if (quizAssessmentId) {
      const assessment = await prisma.assessment.findUnique({
        where: { id: quizAssessmentId },
        select: { id: true, publicLinkToken: true, publicLinkEnabled: true },
      });
      if (assessment && (!assessment.publicLinkToken || !assessment.publicLinkEnabled)) {
        await prisma.assessment.update({
          where: { id: quizAssessmentId },
          data: {
            publicLinkEnabled: true,
            publicLinkToken: assessment.publicLinkToken || randomBytes(24).toString("base64url"),
          },
        });
      }
    }

    await prisma.trainingCourse.update({
      where: { id: courseId },
      data: {
        title,
        description,
        category,
        estimatedMinutes,
        isMandatory,
        dueDays,
        targetAll,
        coverImageUrl,
        quizAssessmentId,
        passScorePercent,
      },
    });

    revalidatePath("/admin/training");
    revalidatePath(`/admin/training/${courseId}`);
    return { success: true };
  } catch (error) {
    console.error("updateCourseAction error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update course" };
  }
}

/**
 * Adds an uploaded material (stored in Cloudflare R2) to a training course.
 */
export async function addCourseMaterialAction({
  courseId,
  title,
  description,
  type,
  fileUrl,
  fileKey,
  fileSize,
  mimeType,
  durationSeconds,
}: {
  courseId: string;
  title: string;
  description?: string;
  type: TrainingMaterialType;
  fileUrl: string;
  fileKey: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
}): Promise<ActionResponse> {
  try {
    const actor = await requirePermission("training:update");
    if (!actor) return { success: false, error: "Unauthorized" };

    const highestOrder = await prisma.trainingMaterial.findFirst({
      where: { courseId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const nextOrder = (highestOrder?.order ?? -1) + 1;

    await prisma.trainingMaterial.create({
      data: {
        courseId,
        title,
        description: description || null,
        type,
        fileUrl,
        fileKey,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        durationSeconds: durationSeconds || null,
        order: nextOrder,
      },
    });

    revalidatePath(`/admin/training/${courseId}`);
    return { success: true };
  } catch (error) {
    console.error("addCourseMaterialAction error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to add material" };
  }
}

/**
 * Removes a material from a course and deletes its asset from Cloudflare R2.
 */
export async function removeCourseMaterialAction(materialId: string): Promise<ActionResponse> {
  try {
    const actor = await requirePermission("training:update");
    if (!actor) return { success: false, error: "Unauthorized" };

    const material = await prisma.trainingMaterial.findUnique({
      where: { id: materialId },
      select: { id: true, courseId: true, fileKey: true },
    });

    if (!material) {
      return { success: false, error: "Material not found" };
    }

    // 1. Delete from database
    await prisma.trainingMaterial.delete({
      where: { id: materialId },
    });

    // 2. Delete from Cloudflare R2
    if (material.fileKey && !material.fileKey.startsWith("local/")) {
      await deleteFromR2(material.fileKey).catch((err) => {
        console.warn("Failed to delete R2 object:", err);
      });
    }

    revalidatePath(`/admin/training/${material.courseId}`);
    return { success: true };
  } catch (error) {
    console.error("removeCourseMaterialAction error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to remove material" };
  }
}

/**
 * Publishes a training course and auto-generates assignments for target employees.
 */
export async function publishCourseAction(courseId: string): Promise<ActionResponse> {
  try {
    const actor = await requirePermission("training:publish");
    if (!actor) return { success: false, error: "Unauthorized" };

    const course = await prisma.trainingCourse.findUnique({
      where: { id: courseId },
      include: {
        materials: true,
      },
    });

    if (!course) return { success: false, error: "Course not found" };
    if (course.materials.length === 0) {
      return { success: false, error: "Cannot publish course without any training materials. Please upload at least one video, picture, or PDF." };
    }

    // Find target employees
    const employeeWhere: import("@prisma/client").Prisma.EmployeeWhereInput = {
      status: "ACTIVE",
    };

    if (!course.targetAll && course.targetBranchIds.length > 0) {
      employeeWhere.branchAssignments = {
        some: {
          branchId: { in: course.targetBranchIds },
          isPrimary: true,
        },
      };
    }

    const targetEmployees = await prisma.employee.findMany({
      where: employeeWhere,
      select: { id: true },
    });

    const now = new Date();
    const dueAt = course.dueDays ? new Date(now.getTime() + course.dueDays * 86400000) : null;

    await prisma.$transaction(async (tx) => {
      // 1. Update course status
      await tx.trainingCourse.update({
        where: { id: courseId },
        data: {
          status: "PUBLISHED",
          publishedAt: now,
        },
      });

      // 2. Assign to target employees who don't already have this assignment
      for (const emp of targetEmployees) {
        await tx.trainingAssignment.upsert({
          where: {
            courseId_employeeId: {
              courseId,
              employeeId: emp.id,
            },
          },
          create: {
            courseId,
            employeeId: emp.id,
            status: "NOT_STARTED",
            assignedAt: now,
            dueAt,
          },
          update: {
            dueAt,
          },
        });
      }
    });

    // Multi-channel notifications: In-app inbox + Push notification + Email
    const targetEmployeeIds = targetEmployees.map((e) => e.id);
    notifyTrainingAssignment({
      courseId,
      courseTitle: course.title,
      employeeIds: targetEmployeeIds,
      dueAt,
      category: course.category,
      estimatedMinutes: course.estimatedMinutes,
    }).catch((err) => console.warn("Background training notice failed:", err));

    revalidatePath("/admin/training");
    revalidatePath(`/admin/training/${courseId}`);
    return { success: true, message: `Course published and assigned to ${targetEmployees.length} employees.` };
  } catch (error) {
    console.error("publishCourseAction error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to publish course" };
  }
}

/**
 * Deletes or archives a training course.
 */
export async function deleteCourseAction(courseId: string): Promise<ActionResponse> {
  try {
    const actor = await requirePermission("training:delete");
    if (!actor) return { success: false, error: "Unauthorized" };

    const materials = await prisma.trainingMaterial.findMany({
      where: { courseId },
      select: { fileKey: true },
    });

    // Delete course (cascades materials and assignments in DB)
    await prisma.trainingCourse.delete({
      where: { id: courseId },
    });

    // Clean up R2 objects
    for (const m of materials) {
      if (m.fileKey && !m.fileKey.startsWith("local/")) {
        deleteFromR2(m.fileKey).catch(console.warn);
      }
    }

    revalidatePath("/admin/training");
    return { success: true };
  } catch (error) {
    console.error("deleteCourseAction error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete course" };
  }
}

/**
 * Changes status of a course to ARCHIVED or DRAFT.
 */
export async function updateCourseStatusAction(
  courseId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
): Promise<ActionResponse> {
  try {
    const actor = await requirePermission("training:publish");
    if (!actor) return { success: false, error: "Unauthorized" };

    await prisma.trainingCourse.update({
      where: { id: courseId },
      data: { status },
    });

    revalidatePath("/admin/training");
    revalidatePath(`/admin/training/${courseId}`);
    return { success: true };
  } catch (error) {
    console.error("updateCourseStatusAction error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update course status" };
  }
}

/**
 * Manually assigns employees to a course.
 */
export async function assignCourseEmployeesAction({
  courseId,
  employeeIds,
}: {
  courseId: string;
  employeeIds: string[];
}): Promise<ActionResponse> {
  try {
    const actor = await requirePermission("training:assign");
    if (!actor) return { success: false, error: "Unauthorized" };

    const course = await prisma.trainingCourse.findUnique({
      where: { id: courseId },
      select: { title: true, dueDays: true, category: true, estimatedMinutes: true },
    });

    if (!course) return { success: false, error: "Course not found" };

    const now = new Date();
    const dueAt = course.dueDays ? new Date(now.getTime() + course.dueDays * 86400000) : null;

    for (const empId of employeeIds) {
      await prisma.trainingAssignment.upsert({
        where: {
          courseId_employeeId: {
            courseId,
            employeeId: empId,
          },
        },
        create: {
          courseId,
          employeeId: empId,
          status: "NOT_STARTED",
          assignedAt: now,
          dueAt,
        },
        update: {},
      });
    }

    // Multi-channel notifications: In-app inbox + Push notification + Email
    notifyTrainingAssignment({
      courseId,
      courseTitle: course.title,
      employeeIds,
      dueAt,
      category: course.category,
      estimatedMinutes: course.estimatedMinutes,
    }).catch((err) => console.warn("Background training notice failed:", err));

    revalidatePath(`/admin/training/${courseId}`);
    return { success: true, message: `Successfully assigned ${employeeIds.length} employee(s).` };
  } catch (error) {
    console.error("assignCourseEmployeesAction error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to assign employees" };
  }
}

