import { NextResponse, type NextRequest } from "next/server";
import { authenticateTrainingMobileRequest } from "../auth";
import { prisma } from "@/lib/platform/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateTrainingMobileRequest(request, "training-course-detail");
  if (!auth.ok) {
    return auth.response;
  }

  const { id: courseId } = await params;

  try {
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
            materials: {
              orderBy: { order: "asc" },
            },
            quizAssessment: {
              select: {
                id: true,
                title: true,
                description: true,
                publicLinkToken: true,
                publicLinkEnabled: true,
              },
            },
          },
        },
        progress: true,
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { ok: false, error: "COURSE_NOT_ASSIGNED", message: "This course is not assigned to you." },
        { status: 404 }
      );
    }

    const progressMap = new Map(assignment.progress.map((p) => [p.materialId, p]));

    return NextResponse.json({
      ok: true,
      assignment: {
        id: assignment.id,
        status: assignment.status,
        dueAt: assignment.dueAt,
        startedAt: assignment.startedAt,
        completedAt: assignment.completedAt,
        quizScore: assignment.quizScore,
        quizPassed: assignment.quizPassed,
      },
      course: {
        id: assignment.course.id,
        title: assignment.course.title,
        description: assignment.course.description,
        category: assignment.course.category,
        estimatedMinutes: assignment.course.estimatedMinutes,
        isMandatory: assignment.course.isMandatory,
        quizAssessmentId: assignment.course.quizAssessmentId,
        passScorePercent: assignment.course.passScorePercent ?? 80,
        quizAssessment: assignment.course.quizAssessment
          ? {
              id: assignment.course.quizAssessment.id,
              title: assignment.course.quizAssessment.title,
              description: assignment.course.quizAssessment.description,
              publicLinkToken: assignment.course.quizAssessment.publicLinkToken,
            }
          : null,
        materials: assignment.course.materials.map((m) => {
          const prog = progressMap.get(m.id);
          return {
            id: m.id,
            title: m.title,
            description: m.description,
            type: m.type,
            fileUrl: m.fileUrl,
            fileSize: m.fileSize,
            mimeType: m.mimeType,
            durationSeconds: m.durationSeconds,
            order: m.order,
            isCompleted: prog?.isCompleted ?? false,
            watchedSeconds: prog?.watchedSeconds ?? 0,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Failed to load course details:", error);
    return NextResponse.json(
      { ok: false, error: "COURSE_FETCH_FAILED", message: "Failed to load course details." },
      { status: 500 }
    );
  }
}
