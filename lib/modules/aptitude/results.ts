import "server-only";
import type { Prisma, AptitudeTestStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";

/** HR-side reading. Behind `aptitude:read`, so selecting correctness is safe
 * and the point: HR needs to see which answer was right next to what was
 * given. */

export async function listAptitudeTests() {
  return prisma.aptitudeTest.findMany({
    where: { deletedAt: null },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      status: true,
      showScoreToCandidate: true,
      timeLimitMinutes: true,
      createdAt: true,
      publishedAt: true,
      _count: { select: { invitations: true, sections: true } },
    },
  });
}

export async function listAptitudeTestsPaginated(params?: {
  search?: string;
  status?: AptitudeTestStatus;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = params?.pageSize ?? 10;
  const where: Prisma.AptitudeTestWhereInput = {
    deletedAt: null,
    ...(params?.status ? { status: params.status } : {}),
    ...(params?.search ? { title: { contains: params.search, mode: "insensitive" } } : {}),
  };

  const [tests, total] = await Promise.all([
    prisma.aptitudeTest.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        status: true,
        showScoreToCandidate: true,
        timeLimitMinutes: true,
        createdAt: true,
        publishedAt: true,
        _count: { select: { invitations: true, sections: true } },
      },
    }),
    prisma.aptitudeTest.count({ where }),
  ]);

  return {
    tests,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAptitudeTestForEditing(testId: string) {
  return prisma.aptitudeTest.findFirst({
    where: { id: testId, deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      showScoreToCandidate: true,
      passMarkPercent: true,
      timeLimitMinutes: true,
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
          timeLimitMinutes: true,
          questions: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              kind: true,
              text: true,
              points: true,
              required: true,
              order: true,
              options: { orderBy: { order: "asc" }, select: { id: true, text: true, isCorrect: true } },
            },
          },
        },
      },
    },
  });
}

/** Who was invited, and where each of them got to. */
export async function listInvitations(testId: string) {
  return prisma.aptitudeInvitation.findMany({
    where: { testId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      candidateName: true,
      candidateEmail: true,
      expiresAt: true,
      openedAt: true,
      revokedAt: true,
      createdAt: true,
      attempt: {
        select: {
          id: true,
          startedAt: true,
          submittedAt: true,
          scoredPoints: true,
          maxPoints: true,
          identityMismatch: true,
          declaredName: true,
          autoSubmitted: true,
        },
      },
    },
  });
}

export async function listInvitationsPaginated(testId: string, params?: { page?: number; pageSize?: number }) {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = params?.pageSize ?? 10;
  const where: Prisma.AptitudeInvitationWhereInput = {
    testId,
    NOT: {
      isPublic: true,
      openedAt: null,
      attempt: null,
    },
  };

  const [invitations, total] = await Promise.all([
    prisma.aptitudeInvitation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        candidateName: true,
        candidateEmail: true,
        expiresAt: true,
        openedAt: true,
        revokedAt: true,
        createdAt: true,
        attempt: {
          select: {
            id: true,
            startedAt: true,
            submittedAt: true,
            scoredPoints: true,
            maxPoints: true,
            identityMismatch: true,
            declaredName: true,
            autoSubmitted: true,
          },
        },
      },
    }),
    prisma.aptitudeInvitation.count({ where }),
  ]);

  return {
    invitations,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** One candidate's answers next to the answer key. Reads the SNAPSHOTTED
 * points, never recomputes — see Assessments' `getResponseDetail` for why. */
export async function getAttemptDetail(attemptId: string) {
  const attempt = await prisma.aptitudeAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      declaredName: true,
      declaredEmail: true,
      identityMismatch: true,
      startedAt: true,
      submittedAt: true,
      deadlineAt: true,
      autoSubmitted: true,
      tabAbsences: true,
      scoredPoints: true,
      maxPoints: true,
      invitation: {
        select: {
          candidateName: true,
          candidateEmail: true,
          test: {
            select: {
              id: true,
              title: true,
              passMarkPercent: true,
              sections: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  title: true,
                  timeLimitMinutes: true,
                  questions: {
                    orderBy: { order: "asc" },
                    select: {
                      id: true,
                      kind: true,
                      text: true,
                      points: true,
                      options: { orderBy: { order: "asc" }, select: { id: true, text: true, isCorrect: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      answers: {
        select: { questionId: true, selectedOptionIds: true, text: true, awardedPoints: true, possiblePoints: true },
      },
    },
  });
  if (!attempt) return null;

  const byQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));

  return {
    ...attempt,
    sections: attempt.invitation.test.sections.map((section) => ({
      id: section.id,
      title: section.title,
      timeLimitMinutes: section.timeLimitMinutes,
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

/** High-level counts and recent activity for the Aptitude Tests landing page. */
export async function aptitudeOverview() {
  const [statusCounts, totalInvitations, totalSubmitted, recentTests, recentActivity] = await Promise.all([
    prisma.aptitudeTest.groupBy({ where: { deletedAt: null }, by: ["status"], _count: { _all: true } }),
    prisma.aptitudeInvitation.count(),
    prisma.aptitudeAttempt.count({ where: { submittedAt: { not: null } } }),
    prisma.aptitudeTest.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, status: true, createdAt: true },
    }),
    prisma.aptitudeAttempt.findMany({
      where: { submittedAt: { not: null } },
      orderBy: { submittedAt: "desc" },
      take: 5,
      select: {
        id: true,
        submittedAt: true,
        autoSubmitted: true,
        invitation: { select: { candidateName: true, test: { select: { id: true, title: true } } } },
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
    recentTests,
    recentActivity,
  };
}

/** Headline numbers for the invitation list. */
export async function aptitudeTestSummary(testId: string) {
  const [invited, submitted, scores] = await Promise.all([
    prisma.aptitudeInvitation.count({
      where: {
        testId,
        NOT: {
          isPublic: true,
          openedAt: null,
          attempt: null,
        },
      },
    }),
    prisma.aptitudeAttempt.count({ where: { invitation: { testId }, submittedAt: { not: null } } }),
    prisma.aptitudeAttempt.findMany({
      where: { invitation: { testId }, submittedAt: { not: null } },
      select: { scoredPoints: true, maxPoints: true },
    }),
  ]);

  const scorable = scores.filter((s) => (s.maxPoints ?? 0) > 0);
  const averagePercent =
    scorable.length === 0
      ? null
      : Math.round(scorable.reduce((sum, s) => sum + (s.scoredPoints! / s.maxPoints!) * 100, 0) / scorable.length);

  return { invited, submitted, averagePercent };
}
