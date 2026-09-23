import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/email")>();
  return {
    ...actual,
    sendEmail: mockSendEmail,
  };
});

vi.mock("@/lib/platform/env", () => ({
  getEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://test.basilissa.com",
    RESEND_API_KEY: "re_test_123",
    RESEND_FROM_EMAIL: "notifications@basilissa.com",
  }),
  isEmailConfigured: () => true,
}));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    branchFeedbackRecipient: {
      findMany: vi.fn().mockResolvedValue([{ email: "manager@basilissa.com", enabled: true }]),
    },
    branch: { findUnique: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

const { getEmailLogoUrl, renderEmailLogo, EMAIL_LOGO_CID } = await import("@/lib/platform/email");
const { sendFeedbackNotification } = await import("@/lib/modules/feedback/notifications");
const { handlePasswordResetSend } = await import("@/lib/modules/identity/jobs");
const { handleAssessmentInvitationSend } = await import("@/lib/modules/assessments/jobs");
const { handleAptitudeInvitationSend } = await import("@/lib/modules/aptitude/jobs");

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ status: "sent", id: "msg_test" });
});

describe("email logo helpers", () => {
  it("resolves the absolute logo URL using NEXT_PUBLIC_APP_URL", () => {
    expect(getEmailLogoUrl()).toBe("https://test.basilissa.com/bsa-logo-icon.png");
  });

  it("renders email-client safe HTML image tag with inline CID and dimensions", () => {
    const html = renderEmailLogo(36);
    expect(html).toContain(`src="cid:${EMAIL_LOGO_CID}"`);
    expect(html).toContain('alt="Basilissa"');
    expect(html).toContain('width="36"');
    expect(html).toContain('height="36"');
    expect(html).toContain("border-radius:8px");
  });
});

describe("transactional email templates contain Basilissa logo", () => {
  it("includes logo in customer feedback notification email", async () => {
    await sendFeedbackNotification({
      submissionId: "sub_100",
      branchId: "branch_1",
      branchName: "Spintex Branch",
      submittedAt: new Date("2026-09-22T12:00:00Z"),
      overallScore: 4.8,
      answers: [{ questionText: "Food quality", score: 5, label: "Excellent" }],
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const { html } = mockSendEmail.mock.calls[0]![0];
    expect(html).toContain(`cid:${EMAIL_LOGO_CID}`);
    expect(html).toContain('alt="Basilissa"');
    expect(html).toContain("Basilissa");
    expect(html).toContain("Ghana");
  });

  it("includes logo in staff account invite email", async () => {
    await handlePasswordResetSend({
      email: "newstaff@basilissa.com",
      token: "invite_tok_123",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      purpose: "INVITE",
      name: "Kwame Asante",
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const { html } = mockSendEmail.mock.calls[0]![0];
    expect(html).toContain(`cid:${EMAIL_LOGO_CID}`);
    expect(html).toContain('alt="Basilissa"');
    expect(html).toContain("Your Basilissa account");
  });

  it("includes logo in staff password reset email", async () => {
    await handlePasswordResetSend({
      email: "staff@basilissa.com",
      token: "reset_tok_123",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      purpose: "RESET",
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const { html } = mockSendEmail.mock.calls[0]![0];
    expect(html).toContain(`cid:${EMAIL_LOGO_CID}`);
    expect(html).toContain('alt="Basilissa"');
    expect(html).toContain("Set a new password");
  });

  it("includes logo in assessment invitation email", async () => {
    await handleAssessmentInvitationSend({
      email: "candidate@example.com",
      token: "assess_tok_123",
      expiresAt: new Date(Date.now() + 7200_000).toISOString(),
      assessmentTitle: "Kitchen Safety Assessment",
      inviteeName: "Abena Mensah",
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const { html } = mockSendEmail.mock.calls[0]![0];
    expect(html).toContain(`cid:${EMAIL_LOGO_CID}`);
    expect(html).toContain('alt="Basilissa"');
    expect(html).toContain("Basilissa Assessment");
  });

  it("includes logo in aptitude test invitation email", async () => {
    await handleAptitudeInvitationSend({
      email: "candidate@example.com",
      token: "aptitude_tok_123",
      expiresAt: new Date(Date.now() + 7200_000).toISOString(),
      testTitle: "Logical Reasoning Test",
      candidateName: "Yaw Boateng",
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const { html } = mockSendEmail.mock.calls[0]![0];
    expect(html).toContain(`cid:${EMAIL_LOGO_CID}`);
    expect(html).toContain('alt="Basilissa"');
    expect(html).toContain("Basilissa Aptitude Test");
  });
});
