import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logger, scoped, setBaseFields, setErrorSink } from "@/lib/platform/logger";

/** Captures the JSON object written for the last log call at each level. */
function captureLines() {
  const lines: { stream: "log" | "warn" | "error"; payload: Record<string, unknown> }[] = [];
  const parse = (stream: "log" | "warn" | "error") => (raw: unknown) => {
    lines.push({ stream, payload: JSON.parse(String(raw)) });
  };
  vi.spyOn(console, "log").mockImplementation(parse("log"));
  vi.spyOn(console, "warn").mockImplementation(parse("warn"));
  vi.spyOn(console, "error").mockImplementation(parse("error"));
  return lines;
}

beforeEach(() => {
  setBaseFields({});
  setErrorSink(null);
  process.env.LOG_LEVEL = "debug";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

describe("structured output", () => {
  it("writes one JSON object with level, message and timestamp", () => {
    const lines = captureLines();
    logger.info("branch created", { branchId: "b1" });

    expect(lines).toHaveLength(1);
    expect(lines[0].payload).toMatchObject({
      level: "info",
      message: "branch created",
      branchId: "b1",
    });
    expect(typeof lines[0].payload.ts).toBe("string");
  });

  it("sends warnings and errors to the matching console stream", () => {
    const lines = captureLines();
    logger.warn("slow");
    logger.error("broken");

    expect(lines.map((l) => l.stream)).toEqual(["warn", "error"]);
  });

  it("attaches base fields to every line", () => {
    const lines = captureLines();
    setBaseFields({ worker: "worker-1" });
    logger.info("tick");

    expect(lines[0].payload.worker).toBe("worker-1");
  });

  it("namespaces scoped loggers", () => {
    const lines = captureLines();
    scoped("email").warn("no recipients");

    expect(lines[0].payload).toMatchObject({ scope: "email", message: "no recipients" });
  });
});

/**
 * The motivating bug: `JSON.stringify(new Error("boom"))` is `{}`, because
 * message and stack are non-enumerable. Logging an error object directly
 * records that something failed while discarding what and where.
 */
describe("error unwrapping", () => {
  it("keeps the name and message that JSON.stringify would discard", () => {
    const lines = captureLines();
    logger.error("job failed", { error: new Error("connection refused") });

    expect(lines[0].payload.error).toMatchObject({
      name: "Error",
      message: "connection refused",
    });
  });

  it("proves the bug it exists to prevent", () => {
    expect(JSON.stringify(new Error("boom"))).toBe("{}");
  });

  it("includes a nested cause", () => {
    const lines = captureLines();
    logger.error("outer", {
      error: new Error("wrapper", { cause: new Error("root cause") }),
    });

    expect(lines[0].payload.error).toMatchObject({
      cause: { message: "root cause" },
    });
  });
});

/**
 * Over-broad by design. A redacted field that did not need redacting costs
 * nothing; the reverse sits in a log aggregator forever.
 */
describe("redaction", () => {
  it("redacts anything whose key looks sensitive, case-insensitively", () => {
    const lines = captureLines();
    logger.info("config", {
      DATABASE_URL: "postgresql://user:pass@host/db",
      sessionToken: "abc",
      passwordHash: "$2b$12$xxx",
      Authorization: "Bearer xyz",
      apiKey: "re_live_123",
      branchId: "b1",
    });

    const payload = lines[0].payload;
    expect(payload.DATABASE_URL).toBe("[redacted]");
    expect(payload.sessionToken).toBe("[redacted]");
    expect(payload.passwordHash).toBe("[redacted]");
    expect(payload.Authorization).toBe("[redacted]");
    expect(payload.apiKey).toBe("[redacted]");
    // Non-sensitive fields must survive, or the logs are useless.
    expect(payload.branchId).toBe("b1");
  });

  it("redacts nested values too", () => {
    const lines = captureLines();
    logger.info("nested", { config: { db: { DATABASE_URL: "postgres://secret" } } });

    expect(lines[0].payload).toMatchObject({
      config: { db: { DATABASE_URL: "[redacted]" } },
    });
  });

  it("truncates deep nesting rather than recursing without bound", () => {
    const lines = captureLines();
    logger.info("deep", { a: { b: { c: { d: { e: { f: "too far" } } } } } });

    expect(JSON.stringify(lines[0].payload)).toContain("[truncated]");
  });
});

describe("level filtering", () => {
  it("drops lines below the configured level", () => {
    process.env.LOG_LEVEL = "warn";
    const lines = captureLines();

    logger.debug("noise");
    logger.info("noise");
    logger.warn("kept");
    logger.error("kept");

    expect(lines.map((l) => l.payload.message)).toEqual(["kept", "kept"]);
  });
});

describe("error sink", () => {
  it("forwards errors, and only errors, to the sink", () => {
    captureLines();
    const sink = vi.fn();
    setErrorSink(sink);

    logger.info("fine");
    logger.warn("hmm");
    logger.error("broken", { jobId: "j1" });

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toBe("broken");
  });

  // A failing error tracker must never become the thing that breaks the
  // request it was reporting on.
  it("survives a sink that throws", () => {
    captureLines();
    setErrorSink(() => {
      throw new Error("sentry is down");
    });

    expect(() => logger.error("broken")).not.toThrow();
  });
});
