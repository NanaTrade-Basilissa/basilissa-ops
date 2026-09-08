/**
 * Demo data generator: creates realistic sample feedback submissions across
 * every active branch, spread over the last 60 days, for exercising the
 * admin dashboard's charts and filters.
 *
 * Not part of `prisma db seed` (prisma/seed.ts) on purpose — that seed is
 * the one that runs on every deploy and must stay idempotent (admin/
 * questions/branches only). This script always appends a fresh batch of
 * submissions and is meant to be run manually, once, against a dev/demo
 * database: `pnpm db:seed:feedback`.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MIN_PER_BRANCH = 25;
const MAX_PER_BRANCH = 55;
const DAYS_BACK = 60;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Skews toward 4-5 with occasional dips, and a per-branch bias so branches
 * don't all average the same (useful for "highest/lowest rated" widgets). */
function weightedScore(branchBias: number): number {
  const weights = [1, 2, 5, 10, 14].map((w, i) => (i + 1 <= 3 ? w : w * branchBias));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let score = 1; score <= 5; score++) {
    roll -= weights[score - 1];
    if (roll <= 0) return score;
  }
  return 5;
}

/** More recent days get more submissions, so the trend chart has a shape. */
function randomRecentDate(): Date {
  const daysAgo = Math.floor(DAYS_BACK * Math.pow(Math.random(), 1.6));
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(randomInt(7, 21), randomInt(0, 59), randomInt(0, 59), 0);
  return date;
}

async function main() {
  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  const questions = await prisma.question.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
  });

  if (branches.length === 0 || questions.length === 0) {
    console.error("no active branches/questions found — run `pnpm db:seed` first");
    process.exitCode = 1;
    return;
  }

  let created = 0;

  for (const branch of branches) {
    const branchBias = 0.6 + Math.random() * 1.2; // ~0.6 (grumpier) to ~1.8 (happier)
    const count = randomInt(MIN_PER_BRANCH, MAX_PER_BRANCH);

    for (let i = 0; i < count; i++) {
      const scores = questions.map(() => weightedScore(branchBias));
      const overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const submittedAt = randomRecentDate();

      await prisma.feedbackSubmission.create({
        data: {
          submissionToken: crypto.randomUUID(),
          branchId: branch.id,
          overallScore,
          submittedAt,
          createdAt: submittedAt,
          answers: {
            create: questions.map((question, i) => ({
              questionId: question.id,
              score: scores[i],
            })),
          },
        },
      });
      created++;
    }

    console.log(`seeded ${count} submissions for ${branch.name}`);
  }

  console.log(`done — created ${created} feedback submissions across ${branches.length} branches`);
}

main()
  .catch((error) => {
    console.error("feedback seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
