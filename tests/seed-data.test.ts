import { describe, expect, it } from "vitest";
import { FEEDBACK_QUESTIONS, FEEDBACK_QUESTION_COUNT } from "@/lib/modules/feedback/constants";
import { SAMPLE_BRANCHES } from "@/prisma/seed-data";
import { branchSlugSchema } from "@/lib/modules/branches/validation";

/**
 * The seed script (prisma/seed.ts) upserts questions by `order` and
 * branches by `slug`. Idempotency — running the seed twice must never
 * create duplicates — depends entirely on those keys being unique and
 * stable, which is what this file checks. Full end-to-end idempotency
 * (seeding twice against a real database and asserting row counts don't
 * change) is exercised manually as part of the Docker verification flow
 * documented in the README, since it needs a live Postgres instance.
 */
describe("seed data — questions", () => {
  it("has exactly five questions", () => {
    expect(FEEDBACK_QUESTIONS).toHaveLength(FEEDBACK_QUESTION_COUNT);
    expect(FEEDBACK_QUESTIONS).toHaveLength(5);
  });

  it("has sequential, unique order values starting at 1", () => {
    const orders = FEEDBACK_QUESTIONS.map((q) => q.order).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5]);
  });

  it("has no open-ended/blank question text", () => {
    for (const question of FEEDBACK_QUESTIONS) {
      expect(question.text.trim().length).toBeGreaterThan(0);
      expect(question.text.trim().endsWith("?")).toBe(true);
    }
  });
});

describe("seed data — branches", () => {
  it("has at least one branch to seed", () => {
    expect(SAMPLE_BRANCHES.length).toBeGreaterThan(0);
  });

  // Asserts the shape rather than a hardcoded list: branches change as
  // Basilissa opens and closes locations, but every slug must stay valid.
  // A seed slug that createBranch would reject means the two paths disagree
  // about what a slug is — which is how "West-hills-mall" got in.
  it("gives every branch a slug the app would accept", () => {
    for (const branch of SAMPLE_BRANCHES) {
      const result = branchSlugSchema.safeParse(branch.slug);
      expect(result.success, `invalid seed slug: ${branch.slug}`).toBe(true);
    }
  });

  it("has unique slugs (the seed's upsert key)", () => {
    const slugs = SAMPLE_BRANCHES.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every branch a non-empty name and location", () => {
    for (const branch of SAMPLE_BRANCHES) {
      expect(branch.name.trim().length).toBeGreaterThan(0);
      expect(branch.location.trim().length).toBeGreaterThan(0);
    }
  });
});
