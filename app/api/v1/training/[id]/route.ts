import { NextResponse, type NextRequest } from "next/server";
import { authenticateTrainingMobileRequest } from "../auth";
import { prisma } from "@/lib/platform/prisma";
import { hashInvitationToken, issueInvitation } from "@/lib/modules/assessments/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateTrainingMobileRequest(request, "training-course-detail");
  if (!auth.ok) {
    return auth.response;
  }

  const { id: courseId } = await params;
  const isRetake = request.nextUrl.searchParams.get("retake") === "true";

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

    let quizAttemptToken = assignment.quizAttemptToken;
    let quizUrl: string | null = null;

    if (assignment.course.quizAssessment) {
      const assessmentId = assignment.course.quizAssessment.id;
      let needsNewAttempt = isRetake || !quizAttemptToken;

      if (quizAttemptToken && !isRetake) {
        const existing = await prisma.assessmentInvitation.findUnique({
          where: { tokenHash: hashInvitationToken(quizAttemptToken) },
          select: {
            revokedAt: true,
            response: { select: { submittedAt: true } },
          },
        });

        // If existing attempt was already submitted, or revoked, need a new attempt unless passed
        if (!existing || existing.revokedAt || existing.response?.submittedAt) {
          needsNewAttempt = !assignment.quizPassed;
        }
      }

      if (needsNewAttempt) {
        const emp = await prisma.employee.findUnique({
          where: { id: auth.employeeId },
          select: { firstName: true, lastName: true, phone: true, email: true },
        });

        const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : "Staff Member";

        const outcome = await issueInvitation(
          {
            assessmentId,
            employeeId: auth.employeeId,
            name: empName,
            email: emp?.email ?? null,
            isPublic: false,
          },
          { userId: null, email: null, role: null }
        );

        if (outcome.ok) {
          quizAttemptToken = outcome.invitation.token;
          await prisma.$transaction([
            prisma.assessmentInvitation.update({
              where: { id: outcome.invitation.invitationId },
              data: { openedAt: new Date() },
            }),
            prisma.assessmentResponse.create({
              data: {
                invitationId: outcome.invitation.invitationId,
                declaredName: empName,
                declaredEmail: emp?.email ?? null,
                declaredPhone: emp?.phone ?? null,
              },
            }),
            prisma.trainingAssignment.update({
              where: { id: assignment.id },
              data: { quizAttemptToken: outcome.invitation.token },
            }),
          ]);
        }
      }

      if (quizAttemptToken) {
        quizUrl = `/assessment/${encodeURIComponent(quizAttemptToken)}`;
      } else if (assignment.course.quizAssessment.publicLinkToken) {
        quizUrl = `/assessment/public/${assignment.course.quizAssessment.publicLinkToken}`;
      }
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
              quizUrl,
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
