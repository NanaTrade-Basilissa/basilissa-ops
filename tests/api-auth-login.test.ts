import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { POST as postLogin } from "@/lib/../app/api/v1/auth/login/route";
import { GET as getMe } from "@/lib/../app/api/v1/auth/me/route";
import { POST as postLogout } from "@/lib/../app/api/v1/auth/logout/route";
import { prisma } from "@/lib/platform/prisma";
import * as identityServer from "@/lib/modules/identity/server";

vi.mock("@/lib/platform/audit", () => ({
  recordAuditBestEffort: vi.fn().mockResolvedValue(undefined),
  recordAudit: vi.fn().mockResolvedValue(undefined),
  SYSTEM_ACTOR: { userId: null, email: null, role: "SYSTEM" },
}));

describe("API External Authentication (/api/v1/auth/*)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const testPassword = "ValidPassword123!";
  const testPasswordHash = bcrypt.hashSync(testPassword, 10);

  const activeUser = {
    id: "user_test_123",
    name: "Kwame Mensah",
    email: "kwame@basilissa.com",
    passwordHash: testPasswordHash,
    status: "ACTIVE",
    sessionVersion: 1,
    roleAssignments: [
      {
        role: "BRANCH_MANAGER",
        scopeType: "BRANCH",
        scopeId: "branch_spintex_01",
      },
    ],
    customRole: null,
  };

  describe("POST /api/v1/auth/login", () => {
    it("returns 400 when body is invalid or missing email", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "some-password" }),
      });
      const res = await postLogin(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    it("returns 401 on non-existent user", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "unknown@basilissa.com", password: "Password123!" }),
      });
      const res = await postLogin(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CREDENTIALS");
    });

    it("returns 401 on incorrect password", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(activeUser as never);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "kwame@basilissa.com", password: "WrongPassword!" }),
      });
      const res = await postLogin(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CREDENTIALS");
    });

    it("returns 401 on inactive/suspended user", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        ...activeUser,
        status: "SUSPENDED",
      } as never);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "kwame@basilissa.com", password: testPassword }),
      });
      const res = await postLogin(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("ACCOUNT_INACTIVE");
    });

    it("returns 401 MFA_REQUIRED when MFA is enabled and no mfaCode provided", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(activeUser as never);
      vi.spyOn(identityServer, "hasMfaEnabled").mockResolvedValueOnce(true);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "kwame@basilissa.com", password: testPassword }),
      });
      const res = await postLogin(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("MFA_REQUIRED");
    });

    it("returns 401 INVALID_MFA_CODE when incorrect mfaCode provided", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(activeUser as never);
      vi.spyOn(identityServer, "hasMfaEnabled").mockResolvedValueOnce(true);
      vi.spyOn(identityServer, "verifyMfaChallenge").mockResolvedValueOnce({
        ok: false,
        reason: "INVALID_CODE",
      });

      const req = new NextRequest("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "kwame@basilissa.com",
          password: testPassword,
          mfaCode: "000000",
        }),
      });
      const res = await postLogin(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("INVALID_MFA_CODE");
    });

    it("returns 200 with Bearer token, expiresAt, and user profile on successful login", async () => {
      vi.spyOn(prisma.user, "findUnique")
        .mockResolvedValueOnce(activeUser as never) // login query
        .mockResolvedValueOnce({ sessionVersion: 1 } as never); // createApiSession query
      vi.spyOn(prisma.user, "update").mockResolvedValueOnce(activeUser as never);
      vi.spyOn(prisma.session, "create").mockResolvedValueOnce({ id: "session_new_123" } as never);
      vi.spyOn(identityServer, "hasMfaEnabled").mockResolvedValueOnce(false);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "kwame@basilissa.com",
          password: testPassword,
          clientName: "trello_app",
        }),
      });
      const res = await postLogin(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.expiresAt).toBeDefined();
      expect(data.user.id).toBe("user_test_123");
      expect(data.user.email).toBe("kwame@basilissa.com");
      expect(data.user.roles).toContain("BRANCH_MANAGER");
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/auth/me");
      const res = await getMe(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("MISSING_TOKEN");
    });

    it("returns 401 when session token is invalid or expired", async () => {
      vi.spyOn(identityServer, "verifySessionToken").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/me", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      const res = await getMe(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("returns 200 with user profile when token is valid", async () => {
      vi.spyOn(identityServer, "verifySessionToken").mockResolvedValueOnce({
        sessionId: "session_valid_123",
        user: {
          id: "user_test_123",
          name: "Kwame Mensah",
          email: "kwame@basilissa.com",
          status: "ACTIVE",
          assignments: [
            {
              role: "BRANCH_MANAGER",
              scopeType: "BRANCH",
              scopeId: "branch_spintex_01",
            },
          ],
          customRole: null,
        },
      });

      const req = new NextRequest("http://localhost:3000/api/v1/auth/me", {
        headers: { Authorization: "Bearer valid-token" },
      });
      const res = await getMe(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.user.email).toBe("kwame@basilissa.com");
      expect(data.sessionId).toBe("session_valid_123");
      expect(data.expiresAt).toBeDefined();
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
      });
      const res = await postLogout(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("MISSING_TOKEN");
    });

    it("returns 200 and revokes session on valid token", async () => {
      vi.spyOn(identityServer, "verifySessionToken").mockResolvedValueOnce({
        sessionId: "session_to_revoke_123",
        user: {
          id: "user_test_123",
          name: "Kwame Mensah",
          email: "kwame@basilissa.com",
          status: "ACTIVE",
          assignments: [],
          customRole: null,
        },
      });
      const revokeSpy = vi.spyOn(identityServer, "revokeSessionById").mockResolvedValueOnce(true);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
      });
      const res = await postLogout(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(revokeSpy).toHaveBeenCalledWith("session_to_revoke_123");
    });
  });
});
