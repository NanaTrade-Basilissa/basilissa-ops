import "server-only";
import { prisma } from "@/lib/platform/prisma";

/**
 * HR-side reading. Everything here is behind `assessment:read`, so selecting
 * correctness is not only safe but the point: HR needs to see which answer was
 * right alongside the one that was given.
 */

export async function listAssessments() {
  return prisma.assessment.findMany({
    where: { deletedAt: null },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      status: true,
      showScoreToTaker: true,
      createdAt: true,
      publishedAt: true,
      _count: { select: { invitations: true, sections: true } },
    },
  });
}

/** The authoring view: structure and answer key. */
export async function getAssessmentForEditing(assessmentId: string) {
  return prisma.assessment.findFirst({
    where: { id: assessmentId, deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      showScoreToTaker: true,
      passMarkPercent: true,
      invitationsExpire: true,
      invitationTtlHours: true,
      publicLinkEnabled: true,
      publicLinkToken: true,
      publicLinkNameMode: true,
      publicLinkEmailMode: true,
      publishedAt: true,
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          order: true,
          questions: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              kind: true,
              text: true,
              points: true,
              required: true,
              order: true,
              options: {
                orderBy: { order: "asc" },
                select: { id: true, text: true, isCorrect: true },
              },
            },
          },
        },
      },
    },
  });
}

/** Who was invited, and where each of them got to. */
export async function listInvitations(assessmentId: string) {
  return prisma.assessmentInvitation.findMany({
    where: { assessmentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      inviteeName: true,
      inviteeEmail: true,
      employeeId: true,
      expiresAt: true,
      openedAt: true,
      revokedAt: true,
      createdAt: true,
      response: {
        select: {
          id: true,
          startedAt: true,
          submittedAt: true,
          scoredPoints: true,
          maxPoints: true,
          identityMismatch: true,
          declaredName: true,
        },
      },
    },
  });
}

/**
 * One person's answers next to the answer key.
 *
 * Reads the SNAPSHOTTED points from the answer rows rather than recomputing.
 * Recomputing would quietly restate somebody's result if a question's wording
 * had been corrected since, and a result that changes on its own is not one.
 */
export async function getResponseDetail(responseId: string) {
  const response = await prisma.assessmentResponse.findUnique({
    where: { id: responseId },
    select: {
      id: true,
      declaredName: true,
      declaredEmail: true,
      identityMismatch: true,
      startedAt: true,
      submittedAt: true,
      scoredPoints: true,
      maxPoints: true,
      invitation: {
        select: {
          inviteeName: true,
          inviteeEmail: true,
          assessment: {
            select: {
              id: true,
              title: true,
              passMarkPercent: true,
              sections: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  title: true,
                  questions: {
                    orderBy: { order: "asc" },
                    select: {
                      id: true,
                      kind: true,
                      text: true,
                      points: true,
                      options: {
                        orderBy: { order: "asc" },
                        select: { id: true, text: true, isCorrect: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      answers: {
        select: {
          questionId: true,
          selectedOptionIds: true,
          text: true,
          awardedPoints: true,
          possiblePoints: true,
        },
      },
    },
  });
  if (!response) return null;

  const byQuestion = new Map(response.answers.map((a) => [a.questionId, a]));

  return {
    ...response,
    sections: response.invitation.assessment.sections.map((section) => ({
      id: section.id,
      title: section.title,
      questions: section.questions.map((question) => {
        const answer = byQuestion.get(question.id);
        const selected = new Set(answer?.selectedOptionIds ?? []);
        return {
          id: question.id,
          kind: question.kind,
          text: question.text,
          points: question.points,
          answered: Boolean(answer),
          writtenAnswer: answer?.text ?? null,
          awardedPoints: answer?.awardedPoints ?? null,
          possiblePoints: answer?.possiblePoints ?? null,
          options: question.options.map((option) => ({
            id: option.id,
            text: option.text,
            isCorrect: option.isCorrect,
            chosen: selected.has(option.id),
          })),
        };
      }),
    })),
  };
}

/**
 * High-level counts and recent activity for the Assessments landing page.
 *
 * Deliberately real numbers, not placeholders: everything here is a plain
 * count or a short recent list against tables that already exist, so there
 * is nothing to fake and nothing here should be treated as provisional.
 */
export async function assessmentOverview() {
  const [statusCounts, totalInvitations, totalSubmitted, recentAssessments, recentActivity] =
    await Promise.all([
      prisma.assessment.groupBy({ where: { deletedAt: null }, by: ["status"], _count: { _all: true } }),
      prisma.assessmentInvitation.count(),
      prisma.assessmentResponse.count({ where: { submittedAt: { not: null } } }),
      prisma.assessment.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, status: true, createdAt: true },
      }),
      prisma.assessmentResponse.findMany({
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        take: 5,
        select: {
          id: true,
          submittedAt: true,
          invitation: {
            select: {
              inviteeName: true,
              assessment: { select: { id: true, title: true } },
            },
          },
        },
      }),
    ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));

  return {
    total: statusCounts.reduce((sum, s) => sum + s._count._all, 0),
    draft: byStatus.DRAFT ?? 0,
    published: byStatus.PUBLISHED ?? 0,
    closed: byStatus.CLOSED ?? 0,
    totalInvitations,
    totalSubmitted,
    recentAssessments,
    recentActivity,
  };
}

/** Headline numbers for the invitation list. */
export async function assessmentSummary(assessmentId: string) {
  const [invited, submitted, scores] = await Promise.all([
    prisma.assessmentInvitation.count({ where: { assessmentId } }),
    prisma.assessmentResponse.count({
      where: { invitation: { assessmentId }, submittedAt: { not: null } },
    }),
    prisma.assessmentResponse.findMany({
      where: { invitation: { assessmentId }, submittedAt: { not: null } },
      select: { scoredPoints: true, maxPoints: true },
    }),
  ]);

  const scorable = scores.filter((s) => (s.maxPoints ?? 0) > 0);
  const averagePercent =
    scorable.length === 0
      ? null
      : Math.round(
          scorable.reduce((sum, s) => sum + (s.scoredPoints! / s.maxPoints!) * 100, 0) /
            scorable.length,
        );

  return { invited, submitted, averagePercent };
}
