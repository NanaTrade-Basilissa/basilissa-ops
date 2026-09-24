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

const { sendEmail } = await import("@/lib/platform/email");

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
});

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
