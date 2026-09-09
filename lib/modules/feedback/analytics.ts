import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { accraDateKey, addDays, getAccraDayEnd, getAccraDayStart, getAccraWeekStart } from "@/lib/platform/date";
import type { BranchScope } from "@/lib/modules/identity/authorization";

export type DashboardFilters = {
  branchId?: string;
  from?: Date;
  to?: Date;
  /** Rounded overall score, 1-5. */
  rating?: number;
  /** Narrows the question-scoped views (distribution/trend/averages) to one question. */
  questionId?: string;
  /** User's authorised branch scope for constraining queries. */
  scope?: BranchScope;
};

export type RatingBucket = { score: number; count: number };
export type TrendPoint = { date: string; count: number; avgScore: number | null };
export type BranchComparisonRow = {
  branchId: string;
  branchName: string;
  location: string;
  isActive: boolean;
  count: number;
  avgScore: number | null;
};
export type QuestionAverageRow = { questionId: string; order: number; text: string; avgScore: number | null; count: number };
export type RecentSubmissionRow = {
  id: string;
  submittedAt: Date;
  overallScore: number;
  branchId: string;
  branchName: string;
  answers: { questionId: string; questionOrder: number; questionText: string; score: number }[];
};

export type DashboardData = {
  totalSubmissions: number;
  averageOverallScore: number | null;
  todayCount: number;
  weekCount: number;
  bestBranch: BranchComparisonRow | null;
  worstBranch: BranchComparisonRow | null;
  ratingDistribution: RatingBucket[];
  trend: TrendPoint[];
  branchComparison: BranchComparisonRow[];
  questionAverages: QuestionAverageRow[];
  recentSubmissions: RecentSubmissionRow[];
};

function buildSubmissionWhere(filters: {
  branchId?: string;
  from?: Date;
  to?: Date;
  rating?: number;
  scope?: BranchScope;
}): Prisma.FeedbackSubmissionWhereInput {
  const where: Prisma.FeedbackSubmissionWhereInput = {};

  if (filters.scope) {
    switch (filters.scope.kind) {
      case "branches":
        if (filters.branchId) {
          if (filters.scope.branchIds.includes(filters.branchId)) {
            where.branchId = filters.branchId;
          } else {
            where.branchId = { in: [] };
          }
        } else {
          where.branchId = { in: filters.scope.branchIds };
        }
        break;
      case "none":
        where.branchId = { in: [] };
        break;
      case "all":
        if (filters.branchId) where.branchId = filters.branchId;
        break;
    }
  } else if (filters.branchId) {
    where.branchId = filters.branchId;
  }

  if (filters.from || filters.to) {
    where.submittedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  if (filters.rating) {
    where.overallScore = { gte: filters.rating - 0.5, lt: filters.rating + 0.5 };
  }

  return where;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const where = buildSubmissionWhere(filters);
  const nonDateFilters = { branchId: filters.branchId, rating: filters.rating, scope: filters.scope };
  const now = new Date();
  const todayWhere = buildSubmissionWhere({
    ...nonDateFilters,
    from: getAccraDayStart(now),
    to: getAccraDayEnd(now),
  });
  const weekWhere = buildSubmissionWhere({
    ...nonDateFilters,
    from: getAccraWeekStart(now),
    to: getAccraDayEnd(now),
  });

  const trendFrom = filters.from ?? getAccraDayStart(addDays(now, -29));
  const trendTo = filters.to ?? getAccraDayEnd(now);
  const trendWhere = buildSubmissionWhere({ ...nonDateFilters, from: trendFrom, to: trendTo });

  const branchQueryWhere =
    filters.scope?.kind === "branches"
      ? { id: { in: filters.scope.branchIds } }
      : filters.scope?.kind === "none"
        ? { id: { in: [] } }
        : undefined;

  const [
    totalSubmissions,
    avgAgg,
    todayCount,
    weekCount,
    allBranches,
    activeQuestions,
    branchGroups,
    matchingSubmissions,
    trendSubmissions,
  ] = await Promise.all([
    prisma.feedbackSubmission.count({ where }),
    prisma.feedbackSubmission.aggregate({ where, _avg: { overallScore: true } }),
    prisma.feedbackSubmission.count({ where: todayWhere }),
    prisma.feedbackSubmission.count({ where: weekWhere }),
    prisma.branch.findMany({ where: branchQueryWhere, orderBy: { name: "asc" } }),
    prisma.question.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.feedbackSubmission.groupBy({
      by: ["branchId"],
      where,
      _avg: { overallScore: true },
      _count: { _all: true },
    }),
    prisma.feedbackSubmission.findMany({
      where,
      select: { id: true, overallScore: true },
    }),
    prisma.feedbackSubmission.findMany({
      where: trendWhere,
      select: { id: true, submittedAt: true, overallScore: true },
    }),
  ]);

  const submissionIds = matchingSubmissions.map((s) => s.id);

  // --- Rating distribution -------------------------------------------------
  let ratingDistribution: RatingBucket[];
  if (filters.questionId) {
    const answerScores = await prisma.feedbackAnswer.findMany({
      where: { questionId: filters.questionId, submissionId: { in: submissionIds } },
      select: { score: true },
    });
    ratingDistribution = bucketScores(answerScores.map((a) => a.score));
  } else {
    ratingDistribution = bucketScores(matchingSubmissions.map((s) => Math.round(s.overallScore)));
  }

  // --- Per-question averages ------------------------------------------------
  const questionAnswerGroups = await prisma.feedbackAnswer.groupBy({
    by: ["questionId"],
    where: { submissionId: { in: submissionIds } },
    _avg: { score: true },
    _count: { _all: true },
  });
  const questionAvgById = new Map(
    questionAnswerGroups.map((g) => [g.questionId, { avg: g._avg.score, count: g._count._all }]),
  );
  const questionAverages: QuestionAverageRow[] = activeQuestions
    .filter((q) => !filters.questionId || q.id === filters.questionId)
    .map((q) => {
      const row = questionAvgById.get(q.id);
      return {
        questionId: q.id,
        order: q.order,
        text: q.text,
        avgScore: row?.avg != null ? round1(row.avg) : null,
        count: row?.count ?? 0,
      };
    });

  // --- Branch comparison ------------------------------------------------
  const branchGroupById = new Map(branchGroups.map((g) => [g.branchId, g]));
  const branchComparison: BranchComparisonRow[] = allBranches.map((b) => {
    const group = branchGroupById.get(b.id);
    return {
      branchId: b.id,
      branchName: b.name,
      location: b.location,
      isActive: b.isActive,
      count: group?._count._all ?? 0,
      avgScore: group?._avg.overallScore != null ? round1(group._avg.overallScore) : null,
    };
  });
  const ranked = branchComparison.filter((b) => b.count > 0 && b.avgScore != null);
  const bestBranch = ranked.length
    ? ranked.reduce((best, row) => (row.avgScore! > best.avgScore! ? row : best))
    : null;
  const worstBranch = ranked.length
    ? ranked.reduce((worst, row) => (row.avgScore! < worst.avgScore! ? row : worst))
    : null;

  // --- Trend over time (daily buckets) --------------------------------------
  let trend: TrendPoint[];
  if (filters.questionId) {
    const trendAnswers = await prisma.feedbackAnswer.findMany({
      where: { questionId: filters.questionId, submissionId: { in: trendSubmissions.map((s) => s.id) } },
      select: { score: true, submission: { select: { submittedAt: true } } },
    });
    trend = bucketTrend(
      trendAnswers.map((a) => ({ date: a.submission.submittedAt, score: a.score })),
      trendFrom,
      trendTo,
    );
  } else {
    trend = bucketTrend(
      trendSubmissions.map((s) => ({ date: s.submittedAt, score: s.overallScore })),
      trendFrom,
      trendTo,
    );
  }

  // --- Recent submissions ------------------------------------------------
  const recent = await prisma.feedbackSubmission.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    take: 10,
    select: {
      id: true,
      submittedAt: true,
      overallScore: true,
      branch: { select: { id: true, name: true } },
      answers: {
        select: { questionId: true, score: true, question: { select: { order: true, text: true } } },
      },
    },
  });

  const recentSubmissions: RecentSubmissionRow[] = recent.map((s) => ({
    id: s.id,
    submittedAt: s.submittedAt,
    overallScore: s.overallScore,
    branchId: s.branch.id,
    branchName: s.branch.name,
    answers: [...s.answers]
      .sort((a, b) => a.question.order - b.question.order)
      .map((a) => ({
        questionId: a.questionId,
        questionOrder: a.question.order,
        questionText: a.question.text,
        score: a.score,
      })),
  }));

  return {
    totalSubmissions,
    averageOverallScore: avgAgg._avg.overallScore != null ? round1(avgAgg._avg.overallScore) : null,
    todayCount,
    weekCount,
    bestBranch,
    worstBranch,
    ratingDistribution,
    trend,
    branchComparison,
    questionAverages,
    recentSubmissions,
  };
}

export type TrendGranularity = "daily" | "weekly" | "monthly";

/** Used by the branch analytics page's daily/weekly/monthly trend toggle. */
export async function getBranchTrendSeries(
  branchId: string,
  granularity: TrendGranularity,
): Promise<TrendPoint[]> {
  const now = new Date();
  const lookbackDays = granularity === "daily" ? 30 : granularity === "weekly" ? 12 * 7 : 365;
  const from = getAccraDayStart(addDays(now, -lookbackDays));
  const to = getAccraDayEnd(now);

  const rows = await prisma.feedbackSubmission.findMany({
    where: { branchId, submittedAt: { gte: from, lte: to } },
    select: { submittedAt: true, overallScore: true },
    orderBy: { submittedAt: "asc" },
  });

  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const key =
      granularity === "daily"
        ? accraDateKey(row.submittedAt)
        : granularity === "weekly"
          ? accraDateKey(getAccraWeekStart(row.submittedAt))
          : accraDateKey(row.submittedAt).slice(0, 7);
    const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += row.overallScore;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, { sum, count }]) => ({ date, count, avgScore: round1(sum / count) }));
}

export function bucketScores(scores: number[]): RatingBucket[] {
  const counts = new Map<number, number>([1, 2, 3, 4, 5].map((n) => [n, 0]));
  for (const raw of scores) {
    const clamped = Math.min(5, Math.max(1, Math.round(raw)));
    counts.set(clamped, (counts.get(clamped) ?? 0) + 1);
  }
  return [1, 2, 3, 4, 5].map((score) => ({ score, count: counts.get(score) ?? 0 }));
}

export function bucketTrend(rows: { date: Date; score: number }[], from: Date, to: Date): TrendPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>();

  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    buckets.set(accraDateKey(cursor), { sum: 0, count: 0 });
    cursor = addDays(cursor, 1);
  }

  for (const row of rows) {
    const key = accraDateKey(row.date);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.sum += row.score;
      bucket.count += 1;
    }
  }

  return Array.from(buckets.entries()).map(([date, { sum, count }]) => ({
    date,
    count,
    avgScore: count > 0 ? round1(sum / count) : null,
  }));
}
