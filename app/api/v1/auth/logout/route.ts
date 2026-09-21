import { NextResponse, type NextRequest } from "next/server";
import { recordAuditBestEffort } from "@/lib/platform/audit";
import { revokeSessionById, verifySessionToken } from "@/lib/modules/identity/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: "MISSING_TOKEN",
        message: "Bearer token is required in Authorization header",
      },
      { status: 401 },
    );
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED",
        message: "Invalid or already revoked session token",
      },
      { status: 401 },
    );
  }

  await revokeSessionById(session.sessionId);

  await recordAuditBestEffort({
    actor: { userId: session.user.id, email: session.user.email, role: null },
    action: "user.signed_out",
    entityType: "User",
    entityId: session.user.id,
    metadata: { channel: "api_v1", sessionId: session.sessionId },
  });

  return NextResponse.json(
    {
      ok: true,
      message: "Signed out successfully",
    },
    { status: 200 },
  );
}
