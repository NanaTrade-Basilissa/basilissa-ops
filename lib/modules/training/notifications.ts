import "server-only";

import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { createInboxNotifications } from "@/lib/platform/inbox";
import { sendEmployeePushNotification } from "@/lib/platform/push";
import { sendEmail, renderEmailLogo, escapeHtml } from "@/lib/platform/email";
import { getEnv } from "@/lib/platform/env";

const log = scoped("training:notifications");

export type TrainingAssignmentNoticeInput = {
  courseId: string;
  courseTitle: string;
  employeeIds: string[];
  dueAt?: Date | null;
  category?: string;
  estimatedMinutes?: number;
};

/**
 * Dispatches multi-channel notifications when training is assigned:
 * 1. In-App Notification (inbox row)
 * 2. Mobile Push Notification (FCM / Expo)
 * 3. Email Notification (if the employee has an email on file)
 *
 * SMS is intentionally omitted.
 */
export async function notifyTrainingAssignment({
  courseId,
  courseTitle,
  employeeIds,
  dueAt,
  category,
  estimatedMinutes,
}: TrainingAssignmentNoticeInput): Promise<{
  inboxCount: number;
  pushCount: number;
  emailCount: number;
}> {
  if (employeeIds.length === 0) {
    return { inboxCount: 0, pushCount: 0, emailCount: 0 };
  }

  // 1. Fetch employee details
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });

  if (employees.length === 0) {
    return { inboxCount: 0, pushCount: 0, emailCount: 0 };
  }

  const dueDateFormatted = dueAt
    ? dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : undefined;

  // 2. In-App Notification (Inbox)
  let inboxCount = 0;
  try {
    inboxCount = await createInboxNotifications(
      employees.map((emp) => ({
        employeeId: emp.id,
        kind: "TRAINING_ASSIGNED",
        title: `New Training: ${courseTitle}`,
        body: `You have been assigned "${courseTitle}".${
          dueDateFormatted ? ` Due by ${dueDateFormatted}.` : ""
        } Please complete this module in your Training Hub.`,
        data: {
          courseId,
          type: "training_assignment",
        },
      }))
    );
    log.info("Created in-app training notifications", { courseId, count: inboxCount });
  } catch (err) {
    log.error("Failed to create in-app notifications for training assignment", { courseId, error: err });
  }

  // 3. Mobile Push Notifications
  let pushCount = 0;
  for (const emp of employees) {
    try {
      const res = await sendEmployeePushNotification(emp.id, {
        title: "New Training Assigned 🎓",
        body: `"${courseTitle}" has been assigned to you.${
          dueDateFormatted ? ` Due by ${dueDateFormatted}.` : ""
        } Tap to open.`,
        data: {
          courseId,
          kind: "TRAINING_ASSIGNED",
        },
        priority: "high",
      });
      pushCount += res.dispatched;
    } catch (err) {
      log.warn("Push notification failed for employee", { employeeId: emp.id, error: err });
    }
  }

  // 4. Email Notifications (only if employee has an email address)
  let emailCount = 0;
  const employeesWithEmail = employees.filter((e) => Boolean(e.email?.trim()));

  for (const emp of employeesWithEmail) {
    try {
      const email = emp.email!.trim();
      const fullName = `${emp.firstName} ${emp.lastName}`.trim();
      const appUrl = getEnv().NEXT_PUBLIC_APP_URL || "https://ops.basilissagh.com";

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Training Course Assigned</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f8fafc;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1e293b;padding:24px 32px;text-align:left;">
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    ${renderEmailLogo(36)}
                  </td>
                  <td align="right" style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">
                    Training Hub
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 12px 0;font-size:20px;font-weight:700;color:#0f172a;">
                Hello ${escapeHtml(emp.firstName)},
              </h2>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:22px;color:#475569;">
                A new training course has been assigned to you by the HR & Operations team. Please review the course materials and complete the lessons on your Basilissa staff mobile app.
              </p>

              <!-- Course Detail Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;border-radius:12px;padding:20px;margin-bottom:24px;">
                <tr>
                  <td>
                    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">
                      Course Title
                    </div>
                    <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:12px;">
                      ${escapeHtml(courseTitle)}
                    </div>

                    ${
                      category
                        ? `<div style="font-size:12px;color:#475569;margin-bottom:4px;">
                            <strong>Category:</strong> ${escapeHtml(category)}
                           </div>`
                        : ""
                    }
                    ${
                      estimatedMinutes
                        ? `<div style="font-size:12px;color:#475569;margin-bottom:4px;">
                            <strong>Estimated Duration:</strong> ~${estimatedMinutes} minutes
                           </div>`
                        : ""
                    }
                    ${
                      dueDateFormatted
                        ? `<div style="font-size:12px;color:#dc2626;font-weight:600;margin-top:8px;">
                            📅 Due Date: ${escapeHtml(dueDateFormatted)}
                           </div>`
                        : ""
                    }
                  </td>
                </tr>
              </table>

              <!-- Call to Action -->
              <p style="margin:0 0 24px 0;font-size:13px;line-height:20px;color:#64748b;">
                Open your <strong>Basilissa Staff Mobile App</strong> on your phone and tap on <strong>Profile &rarr; Staff Training Hub</strong> to start the lessons.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:600;">
                      Open Basilissa Staff
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                &copy; ${new Date().getFullYear()} Basilissa Ghana. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();

      const sendResult = await sendEmail({
        to: [email],
        from: "Basilissa Training <training@basilissagh.com>",
        recipientName: fullName,
        subject: `New Training Assigned: ${courseTitle}`,
        html,
        context: {
          courseId,
          employeeId: emp.id,
        },
      });

      if (sendResult.status === "sent") {
        emailCount++;
      }
    } catch (err) {
      log.warn("Failed to send training email to employee", { employeeId: emp.id, error: err });
    }
  }

  log.info("Dispatched training assignment notices", {
    courseId,
    totalEmployees: employees.length,
    inboxCount,
    pushCount,
    emailCount,
  });

  return { inboxCount, pushCount, emailCount };
}
