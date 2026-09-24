import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const env = vi.hoisted(() => ({ configured: true }));

vi.mock("@/lib/platform/env", () => ({
  DEFAULT_EMAIL_SERVER_URL: "https://nana-trade-server.vercel.app/email",
  getEnv: () => ({
    EMAIL_SERVER_URL: "https://nana-trade-server.vercel.app/email",
    NEXT_PUBLIC_APP_URL: "https://example.test",
  }),
  isEmailConfigured: () => env.configured,
}));

const deliveries = vi.hoisted(() => ({ rows: new Set<string>(), failRead: false }));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    emailDelivery: {
      findMany: async ({ where }: { where: { key: string; recipient: { in: string[] } } }) => {
        if (deliveries.failRead) throw new Error("db down");
        return where.recipient.in
          .filter((r) => deliveries.rows.has(`${where.key}|${r}`))
          .map((recipient) => ({ recipient }));
      },
      upsert: async ({ create }: { create: { key: string; recipient: string } }) => {
        deliveries.rows.add(`${create.key}|${create.recipient}`);
        return create;
      },
    },
  },
}));

vi.mock("@/lib/platform/slack", () => ({ notifyEmailFailure: async () => {} }));

const { sendEmail, messageIdFor, subjectReference, emailOptionsForJob, EMAIL_GATEWAY_TIMEOUT_MS } = await import(
  "@/lib/platform/email"
);

const message = { to: ["ops@basilissa.gh"], subject: "New feedback", html: "<p>hi</p>" };

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ success: true, message: "Email sent" }),
  });
  env.configured = true;
  deliveries.rows.clear();
  deliveries.failRead = false;
});

const rejection = (status: number, error: string) => ({
  ok: false,
  status,
  statusText: "",
  json: async () => ({ success: false, error }),
});
const bodies = () => mockFetch.mock.calls.map((call) => JSON.parse(call[1].body));

describe("a successful send", () => {
  it("reports sent, with an id for tracing", async () => {
    const result = await sendEmail(message);
    expect(result.status).toBe("sent");
    if (result.status === "sent") {
      expect(result.id).toMatch(/^sent_\d+$/);
    }
  });

  it("sends request to EMAIL_SERVER_URL with json body", async () => {
    await sendEmail(message);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://nana-trade-server.vercel.app/email",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "ops@basilissa.gh",
          from: "Basilissa",
          subject: "New feedback",
          html: "<p>hi</p>",
        }),
      }),
    );
  });

  it("passes dynamic sender display name when provided", async () => {
    await sendEmail({ ...message, from: "Basilissa Spintex" });
    const callArgs = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(callArgs.from).toBe("Basilissa Spintex");
  });

  it("passes template and data, omitting html when template is used", async () => {
    await sendEmail({
      to: ["staff@basilissa.gh"],
      from: "Basilissa Admin",
      recipientName: "Kwame",
      subject: "Set a new password",
      template: "password-reset",
      data: { resetUrl: "https://example.test/reset", expiresIn: "60 minutes" },
      html: "<p>fallback html</p>",
    });

    const callArgs = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(callArgs).toEqual({
      email: "staff@basilissa.gh",
      from: "Basilissa Admin",
      name: "Kwame",
      subject: "Set a new password",
      template: "password-reset",
      data: { resetUrl: "https://example.test/reset", expiresIn: "60 minutes" },
    });
    expect(callArgs.html).toBeUndefined();
  });

  it("sends sequentially to all recipients in the list", async () => {
    await sendEmail({
      ...message,
      to: ["recipient1@basilissa.gh", "recipient2@basilissa.gh"],
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const body1 = JSON.parse(mockFetch.mock.calls[0]![1].body);
    const body2 = JSON.parse(mockFetch.mock.calls[1]![1].body);
    expect(body1.email).toBe("recipient1@basilissa.gh");
    expect(body2.email).toBe("recipient2@basilissa.gh");
  });
});

describe("outcomes that are not failures", () => {
  it("skips when email is not configured, without calling the gateway", async () => {
    env.configured = false;
    expect(await sendEmail(message)).toEqual({ status: "skipped", reason: "not_configured" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips when nobody is configured to receive it", async () => {
    expect(await sendEmail({ ...message, to: [] })).toEqual({
      status: "skipped",
      reason: "no_recipients",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("classifying a provider rejection", () => {
  it("treats HTTP 400 rejection as permanent non-retryable failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ success: false, error: "Recipient email is required" }),
    });

    const result = await sendEmail(message);
    expect(result).toMatchObject({
      status: "failed",
      retryable: false,
      error: expect.any(Error),
    });
  });

  it("treats HTTP 422 rejection as permanent non-retryable failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: async () => ({ success: false, error: "Invalid email syntax" }),
    });

    const result = await sendEmail(message);
    expect(result).toMatchObject({
      status: "failed",
      retryable: false,
    });
  });

  it("retries on HTTP 500 server error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ success: false, error: "SMTP connection failed" }),
    });

    const result = await sendEmail(message);
    expect(result).toMatchObject({
      status: "failed",
      retryable: true,
      error: expect.any(Error),
    });
  });

  it("retries on HTTP 429 rate limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({ success: false, error: "Rate limit exceeded" }),
    });

    const result = await sendEmail(message);
    expect(result).toMatchObject({
      status: "failed",
      retryable: true,
    });
  });
});

describe("a thrown network error", () => {
  it("is retryable, being about the network rather than the message", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await sendEmail(message)).toMatchObject({ status: "failed", retryable: true });
  });

  it("never escapes to the caller", async () => {
    mockFetch.mockRejectedValueOnce(new Error("gateway timeout"));
    await expect(sendEmail(message)).resolves.toBeDefined();
  });
});

describe("one recipient failing", () => {
  const three = { ...message, to: ["a@basilissa.gh", "b@basilissa.gh", "c@basilissa.gh"] };

  it("does not stop the others being sent", async () => {
    mockFetch.mockResolvedValueOnce(rejection(500, "SMTP down"));
    const result = await sendEmail(three);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ status: "failed", retryable: true, failedRecipients: ["a@basilissa.gh"] });
    if (result.status === "failed") expect(String(result.error)).toContain("2 of 3 sent");
  });

  it("is permanent only when every failure is permanent", async () => {
    mockFetch.mockResolvedValueOnce(rejection(422, "550 5.1.1 no such user"));
    expect(await sendEmail(three)).toMatchObject({ status: "failed", retryable: false });

    mockFetch.mockResolvedValueOnce(rejection(422, "550 5.1.1 no such user"));
    mockFetch.mockResolvedValueOnce(rejection(503, "try later"));
    expect(await sendEmail(three)).toMatchObject({ status: "failed", retryable: true });
  });

  it("sends each address once, however it was written", async () => {
    await sendEmail({ ...message, to: ["A@basilissa.gh", " a@basilissa.gh", "a@basilissa.gh"] });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("a send with an idempotency key", () => {
  const key = "job:job123";
  const keyed = { ...message, to: ["a@basilissa.gh", "b@basilissa.gh"], idempotencyKey: key };

  it("on retry, sends only to the recipients who did not get it", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => ({ success: true }) });
    mockFetch.mockResolvedValueOnce(rejection(500, "SMTP down"));
    expect(await sendEmail(keyed)).toMatchObject({ status: "failed", failedRecipients: ["b@basilissa.gh"] });

    mockFetch.mockClear();
    expect(await sendEmail(keyed)).toMatchObject({ status: "sent" });
    expect(bodies().map((b) => b.email)).toEqual(["b@basilissa.gh"]);
  });

  it("sends nothing once everyone has it", async () => {
    await sendEmail(keyed);
    mockFetch.mockClear();
    expect(await sendEmail(keyed)).toMatchObject({ status: "sent" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("gives each copy a stable Message-ID and the subject a stable reference", async () => {
    await sendEmail(keyed);
    const [first, second] = bodies();
    expect(first.messageId).toBe(messageIdFor(key, "a@basilissa.gh"));
    expect(second.messageId).toBe(messageIdFor(key, "b@basilissa.gh"));
    expect(first.messageId).not.toBe(second.messageId);
    expect(first.messageId).toMatch(/^<[0-9a-f]{40}@basilissagh\.com>$/);
    expect(first.subject).toBe(`New feedback · #${subjectReference(key)}`);
    expect(subjectReference(key)).toBe(subjectReference("job:job123"));
    expect(subjectReference(key)).not.toBe(subjectReference("job:job124"));
    expect(first.skipIfSent).toBeUndefined();
  });

  it("sends to everyone rather than no one when the records cannot be read", async () => {
    deliveries.rows.add(`${key}|a@basilissa.gh`);
    deliveries.failRead = true;
    expect(await sendEmail(keyed)).toMatchObject({ status: "sent" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("asks the gateway to check the Sent folder only on a retry", async () => {
    await sendEmail({ ...keyed, skipIfAlreadySent: true });
    expect(bodies().every((b) => b.skipIfSent === true)).toBe(true);
  });

  it("derives job options from the job: key always, Sent check only when retrying", () => {
    expect(emailOptionsForJob(undefined)).toEqual({});
    expect(emailOptionsForJob({ jobId: "j1", retrying: false })).toEqual({ idempotencyKey: "job:j1" });
    expect(emailOptionsForJob({ jobId: "j1", retrying: true })).toEqual({
      idempotencyKey: "job:j1",
      skipIfAlreadySent: true,
    });
  });

  it("leaves messages without a key untouched", async () => {
    await sendEmail(message);
    expect(bodies()[0].messageId).toBeUndefined();
    expect(bodies()[0].subject).toBe("New feedback");
  });
});

describe("a gateway that does not answer", () => {
  it("is abandoned after the timeout, as a retryable failure that says so", async () => {
    vi.useFakeTimers();
    try {
      mockFetch.mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(new Error("This operation was aborted")));
          }),
      );
      const pending = sendEmail(message);
      await vi.advanceTimersByTimeAsync(EMAIL_GATEWAY_TIMEOUT_MS);
      const result = await pending;
      expect(result).toMatchObject({ status: "failed", retryable: true });
      if (result.status === "failed") expect(String(result.error)).toContain("no response from the email gateway");
    } finally {
      vi.useRealTimers();
    }
  });
});
