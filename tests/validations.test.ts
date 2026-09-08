import { describe, expect, it } from "vitest";
import { feedbackSubmissionSchema } from "@/lib/modules/feedback/validation";
import { adminLoginSchema } from "@/lib/modules/identity/validation";
import { branchInputSchema, branchSlugSchema } from "@/lib/modules/branches/validation";
import { FEEDBACK_QUESTION_COUNT } from "@/lib/modules/feedback/constants";

function validAnswers(count: number = FEEDBACK_QUESTION_COUNT) {
  return Array.from({ length: count }, (_, i) => ({
    questionId: `question-${i + 1}`,
    score: (i % 5) + 1,
  }));
}

describe("feedbackSubmissionSchema", () => {
  it("accepts a well-formed submission with exactly 5 answers", () => {
    const result = feedbackSubmissionSchema.safeParse({
      branchSlug: "east-legon",
      submissionToken: "550e8400-e29b-41d4-a716-446655440000",
      answers: validAnswers(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects incomplete answers (fewer than 5)", () => {
    const result = feedbackSubmissionSchema.safeParse({
      branchSlug: "east-legon",
      submissionToken: "550e8400-e29b-41d4-a716-446655440000",
      answers: validAnswers(3),
    });
    expect(result.success).toBe(false);
  });

  it("rejects too many answers", () => {
    const result = feedbackSubmissionSchema.safeParse({
      branchSlug: "east-legon",
      submissionToken: "550e8400-e29b-41d4-a716-446655440000",
      answers: validAnswers(6),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a score outside 1-5", () => {
    const answers = validAnswers();
    answers[0].score = 6;
    const result = feedbackSubmissionSchema.safeParse({
      branchSlug: "east-legon",
      submissionToken: "550e8400-e29b-41d4-a716-446655440000",
      answers,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer score", () => {
    const answers = validAnswers();
    answers[0].score = 3.5;
    const result = feedbackSubmissionSchema.safeParse({
      branchSlug: "east-legon",
      submissionToken: "550e8400-e29b-41d4-a716-446655440000",
      answers,
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate questionIds", () => {
    const answers = validAnswers();
    answers[1] = { ...answers[0] };
    const result = feedbackSubmissionSchema.safeParse({
      branchSlug: "east-legon",
      submissionToken: "550e8400-e29b-41d4-a716-446655440000",
      answers,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed submissionToken", () => {
    const result = feedbackSubmissionSchema.safeParse({
      branchSlug: "east-legon",
      submissionToken: "not-a-uuid",
      answers: validAnswers(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing branchSlug", () => {
    const result = feedbackSubmissionSchema.safeParse({
      submissionToken: "550e8400-e29b-41d4-a716-446655440000",
      answers: validAnswers(),
    });
    expect(result.success).toBe(false);
  });
});

describe("adminLoginSchema", () => {
  it("accepts a valid email/password pair", () => {
    expect(adminLoginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(adminLoginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(adminLoginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("branchSlugSchema", () => {
  it.each(["east-legon", "accra-mall", "a1"])("accepts %s", (slug) => {
    expect(branchSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(["East Legon", "east_legon", "east legon", "-east", "east-", "a"])(
    "rejects %s",
    (slug) => {
      expect(branchSlugSchema.safeParse(slug).success).toBe(false);
    },
  );
});

describe("branchInputSchema", () => {
  it("accepts a well-formed branch", () => {
    const result = branchInputSchema.safeParse({
      name: "Basilissa Cantonments",
      slug: "cantonments",
      location: "Cantonments Road, Accra",
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a name that is too short", () => {
    const result = branchInputSchema.safeParse({
      name: "A",
      slug: "a-branch",
      location: "Somewhere",
      isActive: true,
    });
    expect(result.success).toBe(false);
  });
});
