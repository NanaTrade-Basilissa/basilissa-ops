import "server-only";
import { Prisma, type NotificationKind } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";

const log = scoped("inbox");

/**
 * The staff inbox: a durable record of every notice an employee was sent.
 *
 * Push is best effort. A phone that was off, a dismissed banner or a reinstalled
 * app loses it for good, and there is nothing to read again later. The inbox is
 * what makes a notice findable afterwards and what "unread" is counted from, so
 * anything staff must be able to find again writes a row here first, and the push
 * only points at it.
 *
 * No domain knowledge, so it lives in platform and every module may use it.
 * `data` carries ids only, never personal content.
 */

export type InboxInput = {
  employeeId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  announcementId?: string;
};

type Writer = Pick<typeof prisma, "notification"> | Prisma.TransactionClient;

/**
 * Writes many inbox rows. Idempotent for announcements: the
 * `(employeeId, announcementId)` unique index plus `skipDuplicates` means a retry
 * adds nothing. Pass `tx` so the rows commit with the change that caused them.
 */
export async function createInboxNotifications(inputs: InboxInput[], tx?: Writer): Promise<number> {
  if (inputs.length === 0) return 0;
  const client = tx ?? prisma;
  const result = await client.notification.createMany({
    data: inputs.map((input) => ({
      employeeId: input.employeeId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      data: input.data,
      announcementId: input.announcementId,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * For notices that are a courtesy on top of something that already happened (a
 * leave decision, a shift reminder). A failure here must not undo the decision it
 * describes, so it is logged and swallowed. Announcements do not use this: for
 * them the inbox row is part of the send and goes in its transaction.
 */
export async function recordInboxNotification(input: InboxInput): Promise<void> {
  try {
    await createInboxNotifications([input]);
  } catch (error) {
    log.error("failed to write inbox notification", {
      employeeId: input.employeeId,
      kind: input.kind,
      error,
    });
  }
}

export type InboxKindFilter = "all" | "announcement";

export type InboxItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Prisma.JsonValue | null;
  announcementId: string | null;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
};

export const INBOX_DEFAULT_LIMIT = 30;
export const INBOX_MAX_LIMIT = 100;

function kindWhere(filter: InboxKindFilter): Prisma.NotificationWhereInput {
  return filter === "announcement" ? { kind: "ANNOUNCEMENT" } : {};
}

/**
 * One page of an employee's inbox, newest first. Always scoped to the employee
 * the caller is authenticated as; there is no way to name another.
 *
 * Keyset pagination on `(createdAt, id)`: `cursor` is the id of the last item of
 * the previous page. Stable while new items arrive, which an offset is not.
 */
export async function listInbox(
  employeeId: string,
  options: { kind?: InboxKindFilter; limit?: number; cursor?: string | null } = {},
): Promise<{ items: InboxItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? INBOX_DEFAULT_LIMIT) || INBOX_DEFAULT_LIMIT, 1), INBOX_MAX_LIMIT);

  const rows = await prisma.notification.findMany({
    where: { employeeId, ...kindWhere(options.kind ?? "all") },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      data: true,
      announcementId: true,
      readAt: true,
      createdAt: true,
    },
  });

  const page = rows.slice(0, limit);
  return {
    items: page.map((row) => ({ ...row, read: row.readAt !== null })),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}

/** The badge. Counted per kind so each tab can show its own. */
export async function countUnread(
  employeeId: string,
): Promise<{ total: number; announcements: number }> {
  const [total, announcements] = await Promise.all([
    prisma.notification.count({ where: { employeeId, readAt: null } }),
    prisma.notification.count({ where: { employeeId, readAt: null, kind: "ANNOUNCEMENT" } }),
  ]);
  return { total, announcements };
}

/**
 * Marks one notice read. Idempotent: reading twice keeps the first read time.
 * Returns false when the id is not the employee's, which the caller reports as
 * not found rather than forbidden, so ids cannot be probed.
 */
export async function markInboxRead(employeeId: string, id: string, now = new Date()): Promise<boolean> {
  const owned = await prisma.notification.findFirst({ where: { id, employeeId }, select: { id: true } });
  if (!owned) return false;
  await prisma.notification.updateMany({ where: { id, employeeId, readAt: null }, data: { readAt: now } });
  return true;
}

/** Marks everything read, optionally only announcements. Returns how many changed. */
export async function markAllInboxRead(
  employeeId: string,
  kind: InboxKindFilter = "all",
  now = new Date(),
): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { employeeId, readAt: null, ...kindWhere(kind) },
    data: { readAt: now },
  });
  return result.count;
}
