import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  assessmentResponse: {
    findUnique: vi.fn(),
  },
  aptitudeAttempt: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: mockPrisma,
}));

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform/email", () => ({
  sendEmail: mockSendEmail,
  escapeHtml: (str: string) => str,
}));

vi.mock("@/lib/platform/env", () => ({
  getEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://example.test",
  }),
}));

const { getHrNotificationEmails } = await import("@/lib/modules/identity/hr-recipients");
const { handleAssessmentNotifyHr } = await import("@/lib/modules/assessments/jobs");
const { handleAptitudeNotifyHr } = await import("@/lib/modules/aptitude/jobs");

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue({ status: "sent", id: "msg_123" });
});

describe("getHrNotificationEmails", () => {
  it("resolves active HR users and test creator", async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { email: "hr1@basilissa.gh" },
      { email: "hr2@basilissa.gh" },
    ]);
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      email: "creator@basilissa.gh",
    });

    const emails = await getHrNotificationEmails("user_creator");
    expect(emails).toEqual(["hr1@basilissa.gh", "hr2@basilissa.gh", "creator@basilissa.gh"]);
  });

  it("falls back to super admins if no HR users are found", async () => {
    mockPrisma.user.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ email: "superadmin@basilissa.gh" }]);

    const emails = await getHrNotificationEmails();
    expect(emails).toEqual(["superadmin@basilissa.gh"]);
  });
});

describe("handleAssessmentNotifyHr", () => {
  it("sends email notification to HR with score and details", async () => {
    mockPrisma.assessmentResponse.findUnique.mockResolvedValue({
      id: "resp_1",
      submittedAt: new Date("2026-09-15T12:00:00Z"),
      declaredName: "Kofi Mensah",
      declaredEmail: "kofi@example.com",
      scoredPoints: 18,
      maxPoints: 20,
      invitation: {
        id: "inv_1",
        inviteeName: "Kofi Mensah",
        inviteeEmail: "kofi@example.com",
        assessment: {
          id: "assess_1",
          title: "Customer Service Assessment",
          passMarkPercent: 75,
          createdBy: "user_hr",
        },
      },
    });

    mockPrisma.user.findMany.mockResolvedValueOnce([
      { email: "hr@basilissa.gh" },
    ]);
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    await handleAssessmentNotifyHr({ responseId: "resp_1" });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const callArgs = mockSendEmail.mock.calls[0]![0];
    expect(callArgs.to).toEqual(["hr@basilissa.gh"]);
    expect(callArgs.subject).toContain("Customer Service Assessment");
    expect(callArgs.subject).toContain("Kofi Mensah");
    expect(callArgs.html).toContain("18 / 20 (90%)");
    expect(callArgs.html).toContain("Passed");
    expect(callArgs.html).toContain("https://example.test/admin/assessments/assess_1/responses/resp_1");
  });
});

describe("handleAptitudeNotifyHr", () => {
  it("sends email notification to HR with auto-submission state and score", async () => {
    mockPrisma.aptitudeAttempt.findUnique.mockResolvedValue({
      id: "attempt_1",
      submittedAt: new Date("2026-09-15T12:00:00Z"),
      autoSubmitted: true,
      declaredName: "Ama Serwaa",
      declaredEmail: "ama@example.com",
      scoredPoints: 12,
      maxPoints: 20,
      invitation: {
        id: "inv_apt_1",
        candidateName: "Ama Serwaa",
        candidateEmail: "ama@example.com",
        test: {
          id: "test_1",
          title: "Numerical Reasoning",
          passMarkPercent: 70,
          createdBy: null,
        },
      },
    });

    mockPrisma.user.findMany.mockResolvedValueOnce([
      { email: "hr@basilissa.gh" },
    ]);

    await handleAptitudeNotifyHr({ attemptId: "attempt_1" });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const callArgs = mockSendEmail.mock.calls[0]![0];
    expect(callArgs.to).toEqual(["hr@basilissa.gh"]);
    expect(callArgs.subject).toContain("Numerical Reasoning");
    expect(callArgs.subject).toContain("Ama Serwaa");
    expect(callArgs.html).toContain("12 / 20 (60%)");
    expect(callArgs.html).toContain("Auto-submitted (time limit expired)");
    expect(callArgs.html).toContain("Did not pass");
    expect(callArgs.html).toContain("https://example.test/admin/aptitude-tests/test_1/attempts/attempt_1");
  });
});
