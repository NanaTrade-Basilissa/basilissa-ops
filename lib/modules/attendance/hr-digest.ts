import "server-only";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { sendEmail, escapeHtml, renderEmailLogo } from "@/lib/platform/email";
import { getEnv } from "@/lib/platform/env";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { scoped } from "@/lib/platform/logger";

const log = scoped("attendance.hr-digest");

export type DigestBranchRow = {
  branchId: string;
  branchName: string;
  clockedIn: number;
  noPunches: number;
  autoClosed: number;
  missingClockOut: number;
  late: number;
  needsReview: number;
};

export type DigestMetrics = {
  workDateKey: string;
  clockedIn: number;
  noPunches: number;
  autoClosed: number;
  missingClockOut: number;
  late: number;
  avgLateMinutes: number;
  needsReview: number;
  unscheduled: number;
  branches: DigestBranchRow[];
};

export type HrDigestSummary = {
  workDateKey: string;
  recipientsExamined: number;
  sent: number;
  skipped: number;
  failed: number;
};

/**
 * Computes attendance digest metrics for a given workDateKey, optionally scoped
 * to a subset of branches.
 */
function summarizeForScope(
  workDateKey: string,
  allDays: Array<{
    branchId: string;
    status: string;
    actualIn: Date | null;
    actualOut: Date | null;
    lateMinutes: number;
    flags: string[];
  }>,
  branchMap: Map<string, string>,
  scopedBranchIds: string[] | null,
): DigestMetrics {
  const days =
    scopedBranchIds && scopedBranchIds.length > 0
      ? allDays.filter((d) => scopedBranchIds.includes(d.branchId))
      : allDays;

  let clockedIn = 0;
  let noPunches = 0;
  let autoClosed = 0;
  let missingClockOut = 0;
  let late = 0;
  let lateMinutesSum = 0;
  let needsReview = 0;
  let unscheduled = 0;

  const byBranch = new Map<string, DigestBranchRow>();

  for (const d of days) {
    const branchName = branchMap.get(d.branchId) ?? "Unknown Branch";
    let row = byBranch.get(d.branchId);
    if (!row) {
      row = {
        branchId: d.branchId,
        branchName,
        clockedIn: 0,
        noPunches: 0,
        autoClosed: 0,
        missingClockOut: 0,
        late: 0,
        needsReview: 0,
      };
      byBranch.set(d.branchId, row);
    }

    const hasIn = d.actualIn != null;
    const hasOut = d.actualOut != null;

    if (hasIn) {
      clockedIn += 1;
      row.clockedIn += 1;
    }
    if (!hasIn && !hasOut) {
      noPunches += 1;
      row.noPunches += 1;
    }
    if (d.flags.includes("AUTO_CLOSED")) {
      autoClosed += 1;
      row.autoClosed += 1;
    }
    if (d.flags.includes("MISSING_CLOCK_OUT")) {
      missingClockOut += 1;
      row.missingClockOut += 1;
    }
    if (d.flags.includes("UNSCHEDULED")) {
      unscheduled += 1;
    }
    if (d.lateMinutes > 0) {
      late += 1;
      lateMinutesSum += d.lateMinutes;
      row.late += 1;
    }
    if (d.status === "NEEDS_REVIEW") {
      needsReview += 1;
      row.needsReview += 1;
    }
  }

  const branches = [...byBranch.values()].sort(
    (a, b) => b.needsReview - a.needsReview || b.clockedIn - a.clockedIn,
  );

  return {
    workDateKey,
    clockedIn,
    noPunches,
    autoClosed,
    missingClockOut,
    late,
    avgLateMinutes: late > 0 ? Math.round(lateMinutesSum / late) : 0,
    needsReview,
    unscheduled,
    branches,
  };
}

function renderDigestHtml(
  recipientName: string,
  metrics: DigestMetrics,
  appUrl: string,
): string {
  const reviewAllUrl = `${appUrl}/admin/attendance?tab=review&startDate=${metrics.workDateKey}&endDate=${metrics.workDateKey}&datePreset=custom`;
  const reviewEmptyUrl = `${appUrl}/admin/attendance?tab=review&flag=NO_PUNCHES&startDate=${metrics.workDateKey}&endDate=${metrics.workDateKey}&datePreset=custom`;
  const reviewAutoClosedUrl = `${appUrl}/admin/attendance?tab=review&flag=AUTO_CLOSED&startDate=${metrics.workDateKey}&endDate=${metrics.workDateKey}&datePreset=custom`;
  const dailyUrl = `${appUrl}/admin/attendance?date=${metrics.workDateKey}`;

  const branchRowsHtml =
    metrics.branches.length > 0
      ? metrics.branches
          .map(
            (b) => `
          <tr>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;font-weight:600;">${escapeHtml(b.branchName)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;text-align:right;">${b.clockedIn}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:${b.noPunches > 0 ? "#b45309" : "#6b7280"};text-align:right;">${b.noPunches}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:${b.autoClosed > 0 ? "#b45309" : "#6b7280"};text-align:right;">${b.autoClosed}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:${b.late > 0 ? "#b45309" : "#6b7280"};text-align:right;">${b.late}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:${b.needsReview > 0 ? "#dc2626" : "#059669"};font-weight:600;text-align:right;">${b.needsReview}</td>
          </tr>`,
          )
          .join("")
      : `<tr><td colspan="6" style="padding:12px;font-size:13px;color:#6b7280;text-align:center;">No attendance records for this date.</td></tr>`;

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#ffffff;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="44" valign="middle">${renderEmailLogo(36)}</td>
                    <td valign="middle" style="padding-left:10px;">
                      <div style="font-size:16px;font-weight:700;color:#111827;">Daily Attendance Digest</div>
                      <div style="font-size:12px;color:#6b7280;">Summary for ${escapeHtml(metrics.workDateKey)} (Accra)</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 24px;">
                <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;">
                  Hi ${escapeHtml(recipientName)},<br/>
                  Here is yesterday&rsquo;s attendance summary so your team can review exceptions and missed punches.
                </p>

                <!-- KPI Grid -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                  <tr>
                    <td width="25%" style="padding:4px;">
                      <div style="background:#f3f4f6;border-radius:8px;padding:12px;text-align:center;">
                        <div style="font-size:20px;font-weight:700;color:#111827;">${metrics.clockedIn}</div>
                        <div style="font-size:11px;color:#6b7280;margin-top:2px;">Clocked In</div>
                      </div>
                    </td>
                    <td width="25%" style="padding:4px;">
                      <div style="background:#fef3c7;border-radius:8px;padding:12px;text-align:center;">
                        <div style="font-size:20px;font-weight:700;color:#92400e;">${metrics.noPunches}</div>
                        <div style="font-size:11px;color:#92400e;margin-top:2px;">No Punches</div>
                      </div>
                    </td>
                    <td width="25%" style="padding:4px;">
                      <div style="background:#fef3c7;border-radius:8px;padding:12px;text-align:center;">
                        <div style="font-size:20px;font-weight:700;color:#92400e;">${metrics.autoClosed}</div>
                        <div style="font-size:11px;color:#92400e;margin-top:2px;">Auto-Closed</div>
                      </div>
                    </td>
                    <td width="25%" style="padding:4px;">
                      <div style="background:${metrics.needsReview > 0 ? "#fee2e2" : "#d1fae5"};border-radius:8px;padding:12px;text-align:center;">
                        <div style="font-size:20px;font-weight:700;color:${metrics.needsReview > 0 ? "#991b1b" : "#065f46"};">${metrics.needsReview}</div>
                        <div style="font-size:11px;color:${metrics.needsReview > 0 ? "#991b1b" : "#065f46"};margin-top:2px;">Needs Review</div>
                      </div>
                    </td>
                  </tr>
                </table>

                <ul style="margin:0 0 20px;padding-left:18px;font-size:13px;color:#374151;line-height:1.7;">
                  <li><strong>${metrics.noPunches}</strong> scheduled record(s) had <strong>no punches at all</strong> (empty in/out).</li>
                  <li><strong>${metrics.autoClosed}</strong> shift(s) missed clock-out and were <strong>auto-closed</strong> by the system.</li>
                  <li><strong>${metrics.missingClockOut}</strong> shift(s) still have a <strong>missing clock-out</strong>.</li>
                  <li><strong>${metrics.late}</strong> staff arrived late${metrics.late > 0 ? ` (avg ${metrics.avgLateMinutes}m late)` : ""}.</li>
                </ul>

                <!-- Branch Breakdown -->
                <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;margin-bottom:8px;">
                  Branch Breakdown
                </div>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:collapse;margin-bottom:20px;">
                  <thead>
                    <tr style="background:#f9fafb;">
                      <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:left;">Branch</th>
                      <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:right;">In</th>
                      <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:right;">Empty</th>
                      <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:right;">Auto</th>
                      <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:right;">Late</th>
                      <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:right;">Review</th>
                    </tr>
                  </thead>
                  <tbody>${branchRowsHtml}</tbody>
                </table>

                <!-- Action Links -->
                <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                  <tr>
                    <td style="padding-right:8px;padding-bottom:8px;">
                      <a href="${reviewAllUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 16px;border-radius:8px;">
                        Open Review Queue
                      </a>
                    </td>
                    <td style="padding-right:8px;padding-bottom:8px;">
                      <a href="${dailyUrl}" style="display:inline-block;background:#f3f4f6;color:#111827;text-decoration:none;font-size:13px;font-weight:600;padding:10px 14px;border-radius:8px;border:1px solid #d1d5db;">
                        Daily Attendance
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:8px 0 0;font-size:12px;color:#6b7280;">
                  Quick filters:
                  <a href="${reviewEmptyUrl}" style="color:#2563eb;text-decoration:underline;">Empty punches (${metrics.noPunches})</a> ·
                  <a href="${reviewAutoClosedUrl}" style="color:#2563eb;text-decoration:underline;">Auto-closed (${metrics.autoClosed})</a>
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;">
                Sent automatically by Basilissa Operations every morning at 07:00 GMT.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Sends the morning HR Daily Attendance Digest summarizing yesterday's
 * attendance exceptions to all active HR/Admin users (respecting branch scope).
 */
export async function runHrDailyAttendanceDigest(
  now: Date = new Date(),
  overrideDateKey?: string,
): Promise<HrDigestSummary> {
  const todayKey = dateKeyInZone(now, DISPLAY_TIMEZONE);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
  const yesterdayDate = new Date(todayDate.getTime() - 86_400_000);
  const workDateKey = overrideDateKey ?? yesterdayDate.toISOString().slice(0, 10);
  const workDate = new Date(`${workDateKey}T00:00:00.000Z`);

  const [branches, days, users] = await Promise.all([
    prisma.branch.findMany({ select: { id: true, name: true } }),
    prisma.attendanceDay.findMany({
      where: { workDate },
      select: {
        branchId: true,
        status: true,
        actualIn: true,
        actualOut: true,
        lateMinutes: true,
        flags: true,
      },
    }),
    prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        OR: [
          {
            roleAssignments: {
              some: {
                validTo: null,
                role: { in: [Role.SUPER_ADMIN, Role.ADMINISTRATOR, Role.HR] },
              },
            },
          },
          {
            customRole: {
              permissions: {
                some: {
                  permission: {
                    key: { in: ["attendance:read", "attendance:write"] },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        scopedBranchIds: true,
      },
    }),
  ]);

  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.email) {
      skipped += 1;
      continue;
    }

    const scopedBranches =
      user.scopedBranchIds && user.scopedBranchIds.length > 0 ? user.scopedBranchIds : null;

    const metrics = summarizeForScope(workDateKey, days, branchMap, scopedBranches);
    const subject = `Daily Attendance Digest (${workDateKey}) — ${metrics.needsReview} to review, ${metrics.noPunches} empty`;
    const html = renderDigestHtml(user.name || "Team", metrics, appUrl);

    const res = await sendEmail({
      to: [user.email],
      from: "Basilissa HR",
      subject,
      html,
      idempotencyKey: `hr-daily-digest:${workDateKey}:${user.id}`,
      context: { workDateKey, userId: user.id },
    });

    if (res.status === "sent") sent += 1;
    else if (res.status === "skipped") skipped += 1;
    else failed += 1;
  }

  log.info("HR daily attendance digest completed", {
    workDateKey,
    recipientsExamined: users.length,
    sent,
    skipped,
    failed,
  });

  return {
    workDateKey,
    recipientsExamined: users.length,
    sent,
    skipped,
    failed,
  };
}
