/**
 * Structured logging.
 *
 * Every log line is one JSON object on stdout/stderr. That is deliberately the
 * whole transport: Vercel, Railway, Docker and a plain server all collect
 * stdout, so nothing here assumes a platform (ADR 0001) and nothing costs
 * money. Adding a hosted error tracker later means implementing one function
 * (`setErrorSink`) rather than touching call sites.
 *
 * Why replace scattered `console.error` at all:
 *   - a consistent shape is searchable; ad-hoc strings are not
 *   - errors were being logged as objects, which serialise to `{}` in most
 *     log collectors, silently losing the message and stack
 *   - secrets leaked easily, because the thing being logged on failure is
 *     usually the thing that failed, and that often holds credentials
 *
 * No `server-only` guard: this is used by the worker, by route handlers, and
 * potentially by Client Components, and it touches nothing server-specific.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

export type LogFields = Record<string, unknown>;

/**
 * Field names whose values are never printed.
 *
 * Matched case-insensitively as substrings, so `DATABASE_URL`, `sessionToken`
 * and `passwordHash` are all caught without listing every variant. Over-broad
 * on purpose: a redacted field that did not need redacting costs nothing, and
 * the reverse ends up in a log aggregator forever.
 */
const REDACT_PATTERNS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "credential",
  "database_url",
  "connectionstring",
];

function shouldRedact(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Errors are unwrapped rather than passed through.
 *
 * `JSON.stringify(new Error("boom"))` is `{}` — message and stack are
 * non-enumerable. Logging an error object directly therefore records that
 * something failed while discarding what and where, which is the opposite of
 * useful.
 */
function serialiseError(error: Error): LogFields {
  return {
    name: error.name,
    message: error.message,
    ...(process.env.NODE_ENV !== "production" ? { stack: error.stack } : {}),
    ...(error.cause instanceof Error
      ? { cause: { name: error.cause.name, message: error.cause.message } }
      : {}),
  };
}

function sanitise(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return serialiseError(value);
  if (value === null || typeof value !== "object") return value;
  // Guard against cycles and pathological nesting without a full cycle check.
  if (depth >= 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitise(item, depth + 1));

  const output: LogFields = {};
  for (const [key, entry] of Object.entries(value as LogFields)) {
    output[key] = shouldRedact(key) ? "[redacted]" : sanitise(entry, depth + 1);
  }
  return output;
}

/**
 * Optional sink for errors, for a hosted tracker. Kept behind a setter so the
 * vendor choice stays a deployment decision rather than an import in every
 * module — and so no vendor is required at all.
 */
type ErrorSink = (message: string, fields: LogFields) => void;
let errorSink: ErrorSink | null = null;

export function setErrorSink(sink: ErrorSink | null): void {
  errorSink = sink;
}

/** Fields attached to every subsequent line, e.g. the worker's id. */
let baseFields: LogFields = {};

export function setBaseFields(fields: LogFields): void {
  baseFields = fields;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel()]) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(sanitise({ ...baseFields, ...fields }) as LogFields),
  };

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  if (level === "error" && errorSink) {
    try {
      errorSink(message, payload);
    } catch {
      // A failing error tracker must never become the thing that breaks the
      // request it was reporting on.
    }
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};

/** Namespaced logger, so a subsystem does not repeat itself on every line. */
export function scoped(scope: string) {
  return {
    debug: (message: string, fields?: LogFields) => emit("debug", message, { scope, ...fields }),
    info: (message: string, fields?: LogFields) => emit("info", message, { scope, ...fields }),
    warn: (message: string, fields?: LogFields) => emit("warn", message, { scope, ...fields }),
    error: (message: string, fields?: LogFields) => emit("error", message, { scope, ...fields }),
  };
}
