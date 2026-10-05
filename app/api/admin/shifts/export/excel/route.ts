import { type NextRequest, NextResponse } from "next/server";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { buildRotaWorkbook, getWeeklyBranchSchedule } from "@/lib/modules/employees/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/shifts/export/excel?branchId=&week=YYYY-MM-DD
 *
 * The weekly rota for one branch as an Excel file. `week` is the Monday.
 * Needs `schedule:read`, the same as viewing the rota, and the branch must be one
 * the caller may see: an out-of-scope or unknown branch answers 404, the same as a
 * branch that does not exist, so ids cannot be probed.
 */
export async function GET(request: NextRequest) {
  const { actor, scope } = await requireAnyBranchPermission("schedule:read");

  const params = new URL(request.url).searchParams;
  const branchId = params.get("branchId") ?? "";
  const week = params.get("week") ?? "";
  if (!branchId || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ ok: false, error: "A branch and a week (YYYY-MM-DD) are required." }, { status: 400 });
  }

  const data = await getWeeklyBranchSchedule(scope, branchId, week);
  if (!data) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const buffer = await buildRotaWorkbook(data, { exportedBy: actor.email, generatedAt: new Date() });
  const slug = data.branchName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "branch";

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="basilissa-rota-${slug}-${week}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
