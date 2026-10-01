import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { dateKeyInZone, shiftDateKey } from "@/lib/platform/date";
import { punchFallsInCoverShift } from "./schedule";

type Reader = Pick<typeof prisma, "scheduleException" | "branch"> | Prisma.TransactionClient;

/**
 * True when the person has a cover shift at this branch whose window contains
 * the punch. This is the only way a punch is accepted at a branch the person
 * is not assigned to.
 *
 * Looks at the local date and the one before it, because an overnight cover
 * shift's clock-out lands on the next calendar day.
 */
export async function isCoveringAt(
  employeeId: string,
  branchId: string,
  occurredAt: Date,
  tx: Reader = prisma,
): Promise<boolean> {
  const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { timezone: true } });
  const timeZone = branch?.timezone ?? "Africa/Accra";
  const localKey = dateKeyInZone(occurredAt, timeZone);
  const candidates = [shiftDateKey(localKey, -1), localKey, shiftDateKey(localKey, 1)];

  const covers = await tx.scheduleException.findMany({
    where: {
      employeeId,
      branchId,
      date: { in: candidates.map((key) => new Date(`${key}T00:00:00.000Z`)) },
      shiftId: { not: null },
    },
    select: {
      date: true,
      shift: {
        select: { id: true, name: true, startMinute: true, endMinute: true, unpaidBreakMinutes: true, offOnPublicHolidays: true },
      },
    },
  });

  return covers.some(
    (cover) =>
      cover.shift !== null &&
      punchFallsInCoverShift(occurredAt, { dateKey: cover.date.toISOString().slice(0, 10), shift: cover.shift }, timeZone),
  );
}
