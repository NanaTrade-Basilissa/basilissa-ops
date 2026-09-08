import "server-only";
import { z } from "zod";

/**
 * Validates server-side environment variables the first time they're actually
 * needed at request time (not at module import), so a `next build` with no
 * runtime secrets present (as in the builder stage of the Docker image) never
 * fails on missing configuration.
 *
 * REQUIRED vs OPTIONAL
 * --------------------
 * Only variables the application genuinely cannot run without are required.
 * That distinction matters more than it looks: `getEnv()` validates everything
 * at once, so one over-strict entry takes down every feature that reads *any*
 * variable. An unset email key used to break sign-in, because sessions read
 * `SESSION_SECRET` through this same object.
 *
 * The rule: if the feature degrades gracefully, its configuration is optional.
 * Email already does — `sendEmail` never throws and a failed notification
 * cannot fail a customer's submission, it only fails the background job that
 * retries it — so requiring its key contradicted the design.
 */

/**
 * Marks a variable optional, treating an empty value as absent.
 *
 * `KEY=` in a .env file is not configuration; it is a variable someone
 * commented out badly. Without this, `z.string().optional()` accepts the empty
 * string as a real value and the failure surfaces much later, somewhere less
 * obvious.
 */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

const envSchema = z.object({
  // Required: nothing works without these.
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters (openssl rand -base64 32)"),
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL"),

  // Optional: email is best-effort by design. Unset means notifications are
  // skipped with a warning, and everything else carries on.
  RESEND_API_KEY: optional(z.string()),
  RESEND_FROM_EMAIL: optional(z.string().email("RESEND_FROM_EMAIL must be a valid email address")),
  FEEDBACK_NOTIFICATION_EMAILS: optional(z.string()),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables:\n${issues}\n\nCopy .env.example to .env and fill in the values.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Parsed, trimmed, de-duplicated notification recipient list. Empty if unset. */
export function getNotificationEmails(): string[] {
  const { FEEDBACK_NOTIFICATION_EMAILS } = getEnv();
  if (!FEEDBACK_NOTIFICATION_EMAILS) return [];

  return Array.from(
    new Set(
      FEEDBACK_NOTIFICATION_EMAILS.split(",")
        .map((email) => email.trim())
        .filter(Boolean),
    ),
  );
}

/** Whether outbound email is configured at all. */
export function isEmailConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}
