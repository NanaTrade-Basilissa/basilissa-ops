import { NextResponse, type NextRequest } from "next/server";
import { authenticateTrainingMobileRequest } from "../../auth";
import { prisma } from "@/lib/platform/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateTrainingMobileRequest(request, "training-progress");
  if (!auth.ok) {
    return auth.response;
  }

  const { id: courseId } = await params;

  try {
    const body = await request.json();
    const { materialId, isCompleted = true, watchedSeconds } = body;

    if (!materialId) {
      return NextResponse.json({ ok: false, error: "materialId is required" }, { status: 400 });
    }

    const assignment = await prisma.trainingAssignment.findUnique({
      where: {
        courseId_employeeId: {
          courseId,
          employeeId: auth.employeeId,
        },
      },
      include: {
        course: {
          include: {
            materials: true,
          },
        },
        progress: true,
      },
    });

    if (!assignment) {
      return NextResponse.json({ ok: false, error: "Course assignment not found" }, { status: 404 });
    }

    const now = new Date();

    // 1. Upsert material progress
    await prisma.trainingProgress.upsert({
      where: {
        assignmentId_materialId: {
          assignmentId: assignment.id,
          materialId,
        },
      },
      create: {
        assignmentId: assignment.id,
        materialId,
        isCompleted: Boolean(isCompleted),
        completedAt: isCompleted ? now : null,
        watchedSeconds: typeof watchedSeconds === "number" ? watchedSeconds : 0,
      },
      update: {
        isCompleted: Boolean(isCompleted),
        completedAt: isCompleted ? now : undefined,
        watchedSeconds: typeof watchedSeconds === "number" ? watchedSeconds : undefined,
      },
    });

    // 2. Check if all materials in course are now completed
    const allProgress = await prisma.trainingProgress.findMany({
      where: { assignmentId: assignment.id },
    });

    const totalMaterials = assignment.course.materials.length;
    const completedCount = allProgress.filter((p) => p.isCompleted).length;
    const allCompleted = totalMaterials > 0 && completedCount >= totalMaterials;

    const newStatus = allCompleted ? "COMPLETED" : "IN_PROGRESS";

    await prisma.trainingAssignment.update({
      where: { id: assignment.id },
      data: {
        status: newStatus,
        startedAt: assignment.startedAt ?? now,
        completedAt: allCompleted ? now : null,
      },
    });

    return NextResponse.json({
      ok: true,
      status: newStatus,
      completedCount,
      totalMaterials,
      allCompleted,
    });
  } catch (error) {
    console.error("Failed to update training progress:", error);
    return NextResponse.json(
      { ok: false, error: "PROGRESS_UPDATE_FAILED", message: "Failed to record training progress." },
      { status: 500 }
    );
  }
}
