import { NextResponse, type NextRequest } from "next/server";
import { feedbackSubmissionSchema } from "@/lib/modules/feedback/validation";
import { submitFeedback, type SubmitFeedbackFailure } from "@/lib/modules/feedback/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";

// Generous but real: this endpoint is hit by every customer at a branch,
// often from the same shared wifi IP, so the limit protects against
// scripted abuse rather than genuine foot traffic.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// The domain layer returns a reason; HTTP status codes are this file's job.
const STATUS_BY_FAILURE: Record<SubmitFeedbackFailure, number> = {
  BRANCH_NOT_FOUND: 404,
  BRANCH_INACTIVE: 403,
  QUESTION_SET_CHANGED: 409,
};

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`feedback-submit:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString() },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = feedbackSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid submission", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await submitFeedback(parsed.data);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: STATUS_BY_FAILURE[result.reason] });
  }

  // 200 for an idempotent replay, 201 when this request created the row.
  return NextResponse.json(result.submission, { status: result.created ? 201 : 200 });
}
