import { NextResponse, type NextRequest } from "next/server";
import { SESSION_DURATION_MS } from "@/lib/modules/identity/constants";
import { verifySessionToken } from "@/lib/modules/identity/server";

export async function GET(request: NextRequest) {
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
        message: "Invalid, expired, or revoked session token",
      },
      { status: 401 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        status: session.user.status,
        roles: session.user.assignments.map((ra) => ra.role),
        roleAssignments: session.user.assignments,
        permissions: session.user.customRole?.permissions ?? [],
      },
      sessionId: session.sessionId,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    },
    { status: 200 },
  );
}
