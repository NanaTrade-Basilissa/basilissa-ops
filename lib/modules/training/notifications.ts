import "server-only";

import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { createInboxNotifications } from "@/lib/platform/inbox";
import { sendEmployeePushNotification } from "@/lib/platform/push";
import { sendEmail } from "@/lib/platform/email";
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

      const lines: string[] = [
        `Hello ${emp.firstName},`,
        "",
        `A new training course has been assigned to you by the HR & Operations team:`,
        `Course: "${courseTitle}"`,
      ];
      if (category) lines.push(`Category: ${category}`);
      if (estimatedMinutes) lines.push(`Estimated Duration: ~${estimatedMinutes} minutes`);
      if (dueDateFormatted) lines.push(`Due Date: ${dueDateFormatted}`);
      lines.push(
        "",
        `Please open your Basilissa Staff Mobile App, go to the Training Hub, and complete your learning materials and attached assessment.`,
      );

      const sendResult = await sendEmail({
        to: [email],
        from: "Basilissa HR",
        recipientName: fullName,
        subject: `New Training Course: ${courseTitle}`,
        template: "generic",
        data: {
          heading: "NEW TRAINING ASSIGNED",
          message: lines.join("\n"),
          buttonText: "Open Training Hub",
          buttonUrl: `${appUrl}/admin/training`,
          from: "Basilissa HR & Training",
        },
        idempotencyKey: `training-assign:${courseId}:${emp.id}`,
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
