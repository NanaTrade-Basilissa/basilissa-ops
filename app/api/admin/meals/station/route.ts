import { NextResponse, type NextRequest } from "next/server";
import { requireBranchPermission } from "@/lib/modules/identity/server";
import { getLiveServingStation, broadcastMealReadyNotification } from "@/lib/modules/meals/service";

export async function GET(request: NextRequest) {
  const branchId = request.nextUrl.searchParams.get("branchId");
  if (!branchId) {
    return NextResponse.json({ ok: false, error: "branchId is required." }, { status: 400 });
  }

  await requireBranchPermission("meals:read", branchId);

  try {
    const data = await getLiveServingStation(branchId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load station feed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const branchId = body.branchId || request.nextUrl.searchParams.get("branchId");
  if (!branchId) {
    return NextResponse.json({ ok: false, error: "branchId is required." }, { status: 400 });
  }

  await requireBranchPermission("meals:read", branchId);

  try {
    const result = await broadcastMealReadyNotification(branchId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to broadcast notification.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
