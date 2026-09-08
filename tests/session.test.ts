import { describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

// session.ts reaches for Prisma at module load; nothing here exercises the
// database side, so a bare stub keeps the import graph satisfied.
vi.mock("@/lib/platform/prisma", () => ({ prisma: {} }));

const { decrypt } = await import("@/lib/modules/identity/server");

// SESSION_SECRET is set in tests/setup.ts before any test runs.
function getKey() {
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

function signToken(claims: Record<string, unknown>, subject = "user_1") {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(getKey());
}

describe("decrypt (session cookie verification)", () => {
  it("returns the pointer claims for a validly-signed, unexpired token", async () => {
    const token = await signToken({ sid: "sess_1", sv: 3 }, "user_1");

    expect(await decrypt(token)).toEqual({
      userId: "user_1",
      sessionId: "sess_1",
      sessionVersion: 3,
    });
  });

  it("returns null for an expired token", async () => {
    const token = await new SignJWT({ sid: "sess_1", sv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_1")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(getKey());

    expect(await decrypt(token)).toBeNull();
  });

  it("returns null for a token signed with the wrong secret", async () => {
    const wrongKey = new TextEncoder().encode("a-completely-different-secret-value-32chars");
    const token = await new SignJWT({ sid: "sess_1", sv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(wrongKey);

    expect(await decrypt(token)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await decrypt("not-a-jwt")).toBeNull();
  });

  it("returns null for undefined (no cookie present)", async () => {
    expect(await decrypt(undefined)).toBeNull();
  });

  // A token missing any pointer cannot be resolved against the sessions table,
  // and must never be treated as partially valid.
  it("returns null when a required claim is missing or the wrong type", async () => {
    expect(await decrypt(await signToken({ sv: 0 }))).toBeNull();
    expect(await decrypt(await signToken({ sid: "sess_1" }))).toBeNull();
    expect(await decrypt(await signToken({ sid: "sess_1", sv: "3" }))).toBeNull();

    const noSubject = await new SignJWT({ sid: "sess_1", sv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(getKey());
    expect(await decrypt(noSubject)).toBeNull();
  });

  // The old cookie shape carried {adminId, email, name} and no subject. After
  // the identity migration those tokens must stop resolving rather than be
  // half-understood.
  it("returns null for a pre-migration admin token", async () => {
    const legacy = await new SignJWT({
      adminId: "admin_1",
      email: "admin@basilissa.gh",
      name: "Basilissa Admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(getKey());

    expect(await decrypt(legacy)).toBeNull();
  });
});
