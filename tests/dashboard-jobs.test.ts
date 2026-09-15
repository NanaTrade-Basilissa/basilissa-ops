import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role, ScopeType, UserStatus } from "@prisma/client";
import {
  retryEmailJobAction,
  resendEmailJobAction,
  cancelEmailJobAction,
} from "@/lib/modules/identity/actions";
import * as dalModule from "@/lib/modules/identity/dal";
import * as emailQueueModule from "@/lib/modules/identity/email-queue";
import { isSuperAdmin, type Actor } from "@/lib/modules/identity/authorization";
import { revalidatePath } from "next/cache";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function makeActor(role: Role, status: UserStatus = UserStatus.ACTIVE): Actor {
  return {
    userId: "user_test_id",
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

describe("Dashboard Jobs: Super Admin Visibility and Actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(revalidatePath).mockReset();
  });

  describe("isSuperAdmin role gating", () => {
    it("returns true for active super admin", () => {
      const actor = makeActor(Role.SUPER_ADMIN);
      expect(isSuperAdmin(actor)).toBe(true);
    });

    it("returns false for non-super-admin roles", () => {
      expect(isSuperAdmin(makeActor(Role.BRANCH_MANAGER))).toBe(false);
      expect(isSuperAdmin(makeActor(Role.AREA_MANAGER))).toBe(false);
      expect(isSuperAdmin(makeActor(Role.ADMINISTRATOR))).toBe(false);
      expect(isSuperAdmin(makeActor(Role.HR))).toBe(false);
    });

    it("returns false for suspended super admin", () => {
      const actor = makeActor(Role.SUPER_ADMIN, UserStatus.SUSPENDED);
      expect(isSuperAdmin(actor)).toBe(false);
    });
  });

  describe("retryEmailJobAction", () => {
    it("revalidates both email-queue and admin dashboard on success", async () => {
      const superAdmin = makeActor(Role.SUPER_ADMIN);
      vi.spyOn(dalModule, "requirePermission").mockResolvedValue(superAdmin as never);
      vi.spyOn(emailQueueModule, "retryEmailJob").mockResolvedValue({ success: true });

      const result = await retryEmailJobAction("job_123");

      expect(result.success).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith("/admin/email-queue");
      expect(revalidatePath).toHaveBeenCalledWith("/admin");
    });

    it("does not revalidate if retry fails", async () => {
      const superAdmin = makeActor(Role.SUPER_ADMIN);
      vi.spyOn(dalModule, "requirePermission").mockResolvedValue(superAdmin as never);
      vi.spyOn(emailQueueModule, "retryEmailJob").mockResolvedValue({
        success: false,
        error: "Job not found",
      });

      const result = await retryEmailJobAction("job_missing");

      expect(result.success).toBe(false);
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("resendEmailJobAction", () => {
    it("revalidates both email-queue and admin dashboard on success", async () => {
      const superAdmin = makeActor(Role.SUPER_ADMIN);
      vi.spyOn(dalModule, "requirePermission").mockResolvedValue(superAdmin as never);
      vi.spyOn(emailQueueModule, "resendEmailJob").mockResolvedValue({
        success: true,
        newJobId: "job_456",
      });

      const result = await resendEmailJobAction("job_123");

      expect(result.success).toBe(true);
      expect(result.newJobId).toBe("job_456");
      expect(revalidatePath).toHaveBeenCalledWith("/admin/email-queue");
      expect(revalidatePath).toHaveBeenCalledWith("/admin");
    });

    it("does not revalidate if resend fails", async () => {
      const superAdmin = makeActor(Role.SUPER_ADMIN);
      vi.spyOn(dalModule, "requirePermission").mockResolvedValue(superAdmin as never);
      vi.spyOn(emailQueueModule, "resendEmailJob").mockResolvedValue({
        success: false,
        error: "Job not found",
      });

      const result = await resendEmailJobAction("job_missing");

      expect(result.success).toBe(false);
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("cancelEmailJobAction", () => {
    it("revalidates both email-queue and admin dashboard on success", async () => {
      const superAdmin = makeActor(Role.SUPER_ADMIN);
      vi.spyOn(dalModule, "requirePermission").mockResolvedValue(superAdmin as never);
      vi.spyOn(emailQueueModule, "cancelEmailJob").mockResolvedValue({ success: true });

      const result = await cancelEmailJobAction("job_123");

      expect(result.success).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith("/admin/email-queue");
      expect(revalidatePath).toHaveBeenCalledWith("/admin");
    });

    it("does not revalidate if cancellation fails", async () => {
      const superAdmin = makeActor(Role.SUPER_ADMIN);
      vi.spyOn(dalModule, "requirePermission").mockResolvedValue(superAdmin as never);
      vi.spyOn(emailQueueModule, "cancelEmailJob").mockResolvedValue({
        success: false,
        error: "Cannot cancel completed job",
      });

      const result = await cancelEmailJobAction("job_done");

      expect(result.success).toBe(false);
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
