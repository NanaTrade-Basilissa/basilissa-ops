/**
 * Shared helpers for `useActionState`-style Server Action results. Extracted
 * from the per-module action files, which each had an identical copy.
 */

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

type ZodLikeError = { issues: { path: (string | number)[]; message: string }[] };

/** First error message per top-level field, keyed for rendering next to inputs. */
export function fieldErrorsFrom(error: ZodLikeError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
