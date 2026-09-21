import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/platform/prisma";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";
import { recordAuditBestEffort } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { apiLoginSchema } from "@/lib/modules/identity/validation";
import {
  createApiSession,
  hasMfaEnabled,
  verifyMfaChallenge,
} from "@/lib/modules/identity/server";

const log = scoped("api.auth.login");
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Constant-time dummy hash comparison against non-existent users
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("no-such-user-placeholder-password", 10);

async function recordSignInFailure(
  attemptedEmail: string,
  userId: string | null,
  reason: string,
): Promise<void> {
  await recordAuditBestEffort({
    actor: { userId: null, email: null, role: null },
    action: "user.sign_in_failed",
    entityType: "User",
    entityId: userId ?? "unknown",
    metadata: { attemptedEmail, reason, channel: "api_v1" },
  });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`api-login:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    await recordSignInFailure("unknown", null, "RATE_LIMITED");
    return NextResponse.json(
      {
        ok: false,
        error: "RATE_LIMITED",
        message: "Too many login attempts. Please wait a moment before trying again.",
      },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString() },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON", message: "Malformed JSON payload" },
      { status: 400 },
    );
  }

  const parsed = apiLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid login payload",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { email, password, mfaCode, clientName } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      status: true,
      roleAssignments: {
        where: {
          validFrom: { lte: new Date() },
          OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
        },
        select: { role: true, scopeType: true, scopeId: true },
      },
      customRole: {
        select: {
          id: true,
          name: true,
          permissions: {
            select: {
              permission: { select: { key: true } },
            },
          },
        },
      },
    },
  });

  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    await recordSignInFailure(email, user?.id ?? null, user ? "BAD_PASSWORD" : "NO_SUCH_USER");
    return NextResponse.json(
      { ok: false, error: "INVALID_CREDENTIALS", message: "Invalid email or password" },
      { status: 401 },
    );
  }

  if (user.status !== "ACTIVE") {
    await recordSignInFailure(email, user.id, `STATUS_${user.status}`);
    return NextResponse.json(
      { ok: false, error: "ACCOUNT_INACTIVE", message: "Invalid email or password" },
      { status: 401 },
    );
  }

  const userHasMfa = await hasMfaEnabled(user.id);
  if (userHasMfa) {
    if (!mfaCode) {
      return NextResponse.json(
        {
          ok: false,
          error: "MFA_REQUIRED",
          message: "Multi-factor authentication code is required",
        },
        { status: 401 },
      );
    }

    const mfaResult = await verifyMfaChallenge(user.id, mfaCode, {
      userId: user.id,
      email: user.email,
      role: null,
    });

    if (!mfaResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "INVALID_MFA_CODE",
          message: "Invalid multi-factor authentication code",
        },
        { status: 401 },
      );
    }
  }

  const userAgent = request.headers.get("user-agent") ?? undefined;
  const { token, expiresAt, sessionId } = await createApiSession(user.id, userAgent);

  await prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch((error) => log.error("failed to record lastLoginAt", { error }));

  await recordAuditBestEffort({
    actor: { userId: user.id, email: user.email, role: null },
    action: "user.signed_in",
    entityType: "User",
    entityId: user.id,
    metadata: {
      client: clientName ?? "external_api",
      channel: "api_v1",
      sessionId,
    },
  });

  const permissions = user.customRole
    ? user.customRole.permissions.map((p) => p.permission.key)
    : [];

  return NextResponse.json(
    {
      ok: true,
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        roles: user.roleAssignments.map((ra) => ra.role),
        roleAssignments: user.roleAssignments,
        permissions,
      },
    },
    { status: 200 },
  );
}
