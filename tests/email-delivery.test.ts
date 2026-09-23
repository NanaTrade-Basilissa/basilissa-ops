import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The bug this covers was invisible by construction: `sendEmail` swallowed
 * every failure, so the notification job returned normally and the queue
 * recorded SUCCEEDED while nothing had been delivered. The metric that would
 * have revealed it was the one reporting success.
 */

const resend = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "msg_1" }, error: null }) as unknown),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resend.send };
  },
}));

const env = vi.hoisted(() => ({ configured: true }));

vi.mock("@/lib/platform/env", () => ({
  getEnv: () => ({
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "noreply@basilissa.gh",
    NEXT_PUBLIC_APP_URL: "https://example.test",
  }),
  isEmailConfigured: () => env.configured,
}));

const { sendEmail } = await import("@/lib/platform/email");

const message = { to: ["ops@basilissa.gh"], subject: "New feedback", html: "<p>hi</p>" };

beforeEach(() => {
  resend.send.mockReset();
  resend.send.mockResolvedValue({ data: { id: "msg_1" }, error: null });
  env.configured = true;
});

describe("a successful send", () => {
  it("reports sent, with the provider's id for tracing", async () => {
    expect(await sendEmail(message)).toEqual({ status: "sent", id: "msg_1" });
  });

  it("formats the sender display name as Basilissa", async () => {
    await sendEmail(message);
    expect(resend.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Basilissa <noreply@basilissa.gh>",
      }),
    );
  });

  it("attaches inline logo when referenced via CID in HTML", async () => {
    await sendEmail({
      to: ["candidate@basilissa.gh"],
      subject: "Test Invite",
      html: '<p><img src="cid:basilissa-logo" alt="Basilissa" /></p>',
    });

    expect(resend.send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: "bsa-logo-icon.png",
            contentType: "image/png",
            inlineContentId: "basilissa-logo",
          }),
        ],
      }),
    );
  });
});

describe("outcomes that are not failures", () => {
  // Running without a Resend account is a supported deployment, not a fault.
  it("skips when email is not configured, without calling the provider", async () => {
    env.configured = false;
    expect(await sendEmail(message)).toEqual({ status: "skipped", reason: "not_configured" });
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("skips when nobody is configured to receive it", async () => {
    expect(await sendEmail({ ...message, to: [] })).toEqual({
      status: "skipped",
      reason: "no_recipients",
    });
    expect(resend.send).not.toHaveBeenCalled();
  });
});

describe("classifying a provider rejection", () => {
  async function reject(name: string) {
    resend.send.mockResolvedValue({ data: null, error: { name, message: name } });
    return sendEmail(message);
  }

  it("gives up on a request that can never be accepted", async () => {
    for (const name of ["validation_error", "invalid_parameter", "missing_required_field"]) {
      expect(await reject(name)).toMatchObject({ status: "failed", retryable: false });
    }
  });

  it("retries the provider's own bad minute", async () => {
    for (const name of ["internal_server_error", "application_error", "rate_limit_exceeded"]) {
      expect(await reject(name)).toMatchObject({ status: "failed", retryable: true });
    }
  });

  /*
    Credentials are configuration, and a human can correct configuration while
    attempts remain. Classifying them permanent would throw away a message that
    a five-minute fix would have delivered.
  */
  it("retries a credential problem rather than discarding the message", async () => {
    for (const name of ["missing_api_key", "invalid_api_Key", "invalid_from_address"]) {
      expect(await reject(name)).toMatchObject({ status: "failed", retryable: true });
    }
  });

  // Unrecognised codes appear when the provider adds one. Erring towards a
  // retry wastes attempts; erring the other way loses mail.
  it("treats an unfamiliar error as retryable", async () => {
    expect(await reject("some_code_invented_next_year")).toMatchObject({
      status: "failed",
      retryable: true,
    });
  });
});

describe("a thrown error", () => {
  it("is retryable, being about the network rather than the message", async () => {
    resend.send.mockRejectedValue(new Error("ECONNRESET"));
    expect(await sendEmail(message)).toMatchObject({ status: "failed", retryable: true });
  });

  // The contract the callers rely on: this reports, it does not throw.
  it("never escapes to the caller", async () => {
    resend.send.mockRejectedValue(new Error("boom"));
    await expect(sendEmail(message)).resolves.toBeDefined();
  });
});
