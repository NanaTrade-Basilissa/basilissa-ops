import { describe, expect, it, vi } from "vitest";
import { Role, ScopeType, UserStatus } from "@prisma/client";
import {
  parseEmailJobPayload,
  retryEmailJob,
  resendEmailJob,
  cancelEmailJob,
} from "@/lib/modules/identity/server";
import type { Actor } from "@/lib/modules/identity/authorization";
import { prisma } from "@/lib/platform/prisma";
import * as jobsModule from "@/lib/platform/jobs";
import * as auditModule from "@/lib/platform/audit";

function makeActor(role: Role, status: UserStatus = UserStatus.ACTIVE): Actor {
  return {
    userId: "user_test",
    name: "Test User",
    email: "test@basilissa.invalid",
    status,
    assignments: [
      {
        role,
        scopeType: ScopeType.GLOBAL,
        scopeId: "",
      },
    ],
  };
}

describe("parseEmailJobPayload", () => {
  it("formats feedback.notify payload", () => {
    const parsed = parseEmailJobPayload("feedback.notify", { submissionId: "sub_123456" });
    expect(parsed.typeLabel).toBe("Feedback Alert");
    expect(parsed.recipient).toBe("Configured Notification Emails");
    expect(parsed.subject).toBe("New Feedback Submission (sub_123456)");
  });

  it("formats identity.password_reset_send for reset", () => {
    const parsed = parseEmailJobPayload("identity.password_reset_send", {
      email: "user@example.com",
      purpose: "RESET",
    });
    expect(parsed.typeLabel).toBe("Password Reset");
    expect(parsed.recipient).toBe("user@example.com");
    expect(parsed.subject).toBe("Password Reset Link");
  });

  it("formats identity.password_reset_send for invite with name", () => {
    const parsed = parseEmailJobPayload("identity.password_reset_send", {
      email: "newuser@example.com",
      purpose: "INVITE",
      name: "Kwame Mensah",
    });
    expect(parsed.typeLabel).toBe("Account Invite");
    expect(parsed.recipient).toBe("newuser@example.com");
    expect(parsed.subject).toBe("Account Invitation for Kwame Mensah");
  });

  it("formats assessments.invitation_send", () => {
    const parsed = parseEmailJobPayload("assessments.invitation_send", {
      email: "staff@example.com",
      assessmentTitle: "Q3 Safety Assessment",
      inviteeName: "Ama Osei",
    });
    expect(parsed.typeLabel).toBe("Assessment Invite");
    expect(parsed.recipient).toBe("staff@example.com");
    expect(parsed.subject).toBe("Assessment: Q3 Safety Assessment (Ama Osei)");
  });

  it("formats aptitude.invitation_send", () => {
    const parsed = parseEmailJobPayload("aptitude.invitation_send", {
      email: "candidate@example.com",
      testTitle: "Cashier Aptitude Screen",
      inviteeName: "Kofi Boateng",
    });
    expect(parsed.typeLabel).toBe("Aptitude Invite");
    expect(parsed.recipient).toBe("candidate@example.com");
    expect(parsed.subject).toBe("Aptitude Test: Cashier Aptitude Screen (Kofi Boateng)");
  });

  it("handles null or unexpected payload safely", () => {
    const parsed = parseEmailJobPayload("unknown.job", null);
    expect(parsed.typeLabel).toBe("unknown.job");
    expect(parsed.recipient).toBe("System");
    expect(parsed.subject).toBe("Job: unknown.job");
  });
});

describe("email job controls — permissions and execution", () => {
  it("refuses retry from a non-super-admin", async () => {
    const hrActor = makeActor(Role.HR);
    const result = await retryEmailJob("job_1", hrActor);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only Super Admins");
  });

  it("refuses resend from a non-super-admin", async () => {
    const adminActor = makeActor(Role.ADMINISTRATOR);
    const result = await resendEmailJob("job_1", adminActor);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only Super Admins");
  });

  it("refuses cancel from a non-super-admin", async () => {
    const managerActor = makeActor(Role.BRANCH_MANAGER);
    const result = await cancelEmailJob("job_1", managerActor);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only Super Admins");
  });

  it("allows super admin to retry a dead job", async () => {
    const superAdmin = makeActor(Role.SUPER_ADMIN);

    vi.spyOn(prisma.job, "findUnique").mockResolvedValueOnce({
      id: "job_dead_1",
      type: "identity.password_reset_send",
      status: "DEAD",
      payload: { email: "test@example.com" },
      attempts: 5,
      maxAttempts: 5,
      runAt: new Date(),
      lastError: "Failed 5 times",
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
    });

    const updateSpy = vi.spyOn(prisma.job, "update").mockResolvedValue({} as never);
    const auditSpy = vi.spyOn(auditModule, "recordAudit").mockResolvedValueOnce(undefined);

    const result = await retryEmailJob("job_dead_1", superAdmin);
    expect(result.success).toBe(true);

    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: "job_dead_1" },
      data: expect.objectContaining({
        status: "PENDING",
        attempts: 0,
      }),
    });
    // Kept, so the worker treats the run as a retry and checks before resending.
    expect(updateSpy.mock.calls[0]![0].data).not.toHaveProperty("lastError");

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "email_queue.retry",
        entityId: "job_dead_1",
      }),
    );
  });

  it("allows super admin to resend an email job by enqueueing a fresh job", async () => {
    const superAdmin = makeActor(Role.SUPER_ADMIN);

    vi.spyOn(prisma.job, "findUnique").mockResolvedValueOnce({
      id: "job_succeeded_1",
      type: "assessments.invitation_send",
      status: "SUCCEEDED",
      payload: { email: "invitee@example.com" },
      attempts: 1,
      maxAttempts: 5,
      runAt: new Date(),
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
    });

    const enqueueSpy = vi.spyOn(jobsModule, "enqueue").mockResolvedValueOnce("job_new_2");
    const auditSpy = vi.spyOn(auditModule, "recordAudit").mockResolvedValueOnce(undefined);

    const result = await resendEmailJob("job_succeeded_1", superAdmin);
    expect(result.success).toBe(true);
    expect(result.newJobId).toBe("job_new_2");

    expect(enqueueSpy).toHaveBeenCalledWith("assessments.invitation_send", { email: "invitee@example.com" });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "email_queue.resend",
        entityId: "job_new_2",
      }),
    );
  });

  it("allows super admin to cancel a pending email job", async () => {
    const superAdmin = makeActor(Role.SUPER_ADMIN);

    vi.spyOn(prisma.job, "findUnique").mockResolvedValueOnce({
      id: "job_pending_1",
      type: "feedback.notify",
      status: "PENDING",
      payload: { submissionId: "sub_1" },
      attempts: 0,
      maxAttempts: 5,
      runAt: new Date(),
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    });

    const updateSpy = vi.spyOn(prisma.job, "update").mockResolvedValue({} as never);
    const auditSpy = vi.spyOn(auditModule, "recordAudit").mockResolvedValueOnce(undefined);

    const result = await cancelEmailJob("job_pending_1", superAdmin);
    expect(result.success).toBe(true);

    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: "job_pending_1" },
      data: expect.objectContaining({
        status: "DEAD",
        lastError: expect.stringContaining("Cancelled by Super Admin"),
      }),
    });

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "email_queue.cancel",
        entityId: "job_pending_1",
      }),
    );
  });

  it("refuses to cancel a job that is not pending", async () => {
    const superAdmin = makeActor(Role.SUPER_ADMIN);

    vi.spyOn(prisma.job, "findUnique").mockResolvedValueOnce({
      id: "job_succeeded_1",
      type: "feedback.notify",
      status: "SUCCEEDED",
      payload: { submissionId: "sub_1" },
      attempts: 1,
      maxAttempts: 5,
      runAt: new Date(),
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
    });

    const result = await cancelEmailJob("job_succeeded_1", superAdmin);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot cancel a job with status SUCCEEDED");
  });
});
