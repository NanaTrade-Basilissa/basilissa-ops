import "server-only";
import Holidays from "date-holidays";
import { HolidaySource, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { settleDay } from "./settle";

/**
 * Public holidays: the stored list, and pre-filling it from the bundled Ghana
 * calendar. See the `PublicHoliday` model for why the list lives in the
 * database rather than being read from the calendar at runtime.
 */

type Reader = Pick<typeof prisma, "publicHoliday"> | Prisma.TransactionClient;

/** A DATE column holds the calendar day at UTC midnight, so no conversion. */
const toDate = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);
const toKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Every holiday date, as the set schedule resolution takes.
 *
 * All of them rather than a window: the table holds about fifteen rows a year,
 * and a date window at each of the places that resolve schedules is one more
 * thing to get subtly wrong around midnight and overnight shifts.
 */
export async function loadHolidayKeys(tx: Reader = prisma): Promise<Set<string>> {
  const rows = await tx.publicHoliday.findMany({ select: { date: true } });
  return new Set(rows.map((row) => toKey(row.date)));
}

export type PublicHolidayRow = {
  id: string;
  dateKey: string;
  name: string;
  source: HolidaySource;
  confirmed: boolean;
};

export async function listPublicHolidays(year: number): Promise<PublicHolidayRow[]> {
  const rows = await prisma.publicHoliday.findMany({
    where: { date: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) } },
    orderBy: { date: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    dateKey: toKey(row.date),
    name: row.name,
    source: row.source,
    confirmed: row.confirmed,
  }));
}

export type CalendarHoliday = { dateKey: string; name: string; estimated: boolean };

/**
 * Ghana's public holidays for a year, as the calendar package computes them.
 *
 * Only `public` holidays, so observances such as Easter Sunday are left out.
 * Weekend substitutes are kept: Ghana observes them on the Monday. Dates set by
 * the Islamic calendar are flagged as estimates, because the real date follows
 * the government's announcement and can move by a day.
 */
export function ghanaCalendarHolidays(year: number): CalendarHoliday[] {
  const calendar = new Holidays("GH");
  const seen = new Set<string>();
  const result: CalendarHoliday[] = [];

  for (const holiday of calendar.getHolidays(year)) {
    if (holiday.type !== "public") continue;
    const dateKey = holiday.date.slice(0, 10);
    // One row per date: the table is unique on date, and two holidays on one
    // day are still one day off.
    if (seen.has(dateKey)) continue;
    seen.add(dateKey);
    result.push({
      dateKey,
      name: holiday.name,
      estimated: /Shawwal|Dhu al-Hijjah|Ramadan|Muharram|Rabi/i.test(holiday.rule),
    });
  }

  return result;
}

/**
 * Adds the calendar's holidays for a year that are not already in the list.
 * Existing dates are left exactly as they are, so a correction HR has made is
 * never overwritten by re-running this.
 */
export async function importCalendarHolidays(
  year: number,
  actor: AuditActor & { userId: string | null },
): Promise<{ added: number; skipped: number; affectedDates: string[] }> {
  const calendar = ghanaCalendarHolidays(year);

  return prisma.$transaction(async (tx) => {
    const existing = await loadHolidayKeys(tx);
    const toAdd = calendar.filter((holiday) => !existing.has(holiday.dateKey));

    if (toAdd.length > 0) {
      await tx.publicHoliday.createMany({
        data: toAdd.map((holiday) => ({
          date: toDate(holiday.dateKey),
          name: holiday.name,
          source: HolidaySource.CALENDAR,
          confirmed: !holiday.estimated,
          createdBy: actor.userId,
        })),
      });
    }

    await recordAudit(
      {
        actor,
        action: "holiday.calendar_imported",
        entityType: "PublicHoliday",
        entityId: String(year),
        metadata: { year, added: toAdd.map((h) => h.dateKey), skipped: calendar.length - toAdd.length },
      },
      tx,
    );

    return {
      added: toAdd.length,
      skipped: calendar.length - toAdd.length,
      affectedDates: toAdd.map((h) => h.dateKey),
    };
  });
}

export type HolidayInput = { dateKey: string; name: string; confirmed: boolean };

export class DuplicateHolidayError extends Error {
  constructor(dateKey: string) {
    super(`There is already a holiday on ${dateKey}.`);
  }
}

/** Creates or updates one holiday. `id` null creates. */
export async function saveHoliday(
  id: string | null,
  input: HolidayInput,
  actor: AuditActor & { userId: string | null },
): Promise<{ affectedDates: string[] }> {
  return prisma.$transaction(async (tx) => {
    const clash = await tx.publicHoliday.findUnique({ where: { date: toDate(input.dateKey) } });
    if (clash && clash.id !== id) throw new DuplicateHolidayError(input.dateKey);

    const data = { date: toDate(input.dateKey), name: input.name, confirmed: input.confirmed };

    if (id) {
      const before = await tx.publicHoliday.findUniqueOrThrow({ where: { id } });
      await tx.publicHoliday.update({ where: { id }, data });
      await recordAudit(
        {
          actor,
          action: "holiday.updated",
          entityType: "PublicHoliday",
          entityId: id,
          before: { dateKey: toKey(before.date), name: before.name, confirmed: before.confirmed },
          after: input,
        },
        tx,
      );
      return { affectedDates: [...new Set([toKey(before.date), input.dateKey])] };
    } else {
      const created = await tx.publicHoliday.create({
        data: { ...data, source: HolidaySource.MANUAL, createdBy: actor.userId },
      });
      await recordAudit(
        { actor, action: "holiday.created", entityType: "PublicHoliday", entityId: created.id, after: input },
        tx,
      );
      return { affectedDates: [input.dateKey] };
    }
  });
}

export async function deleteHoliday(id: string, actor: AuditActor): Promise<{ affectedDates: string[] }> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.publicHoliday.delete({ where: { id } });
    await recordAudit(
      {
        actor,
        action: "holiday.deleted",
        entityType: "PublicHoliday",
        entityId: id,
        before: { dateKey: toKey(before.date), name: before.name, confirmed: before.confirmed },
      },
      tx,
    );
    return { affectedDates: [toKey(before.date)] };
  });
}

/**
 * Recalculates attendance already recorded on these dates. Adding a holiday
 * after the fact changes who was scheduled that day, and so who was late or
 * worked overtime; days that are never recalculated would keep the old answer.
 * Dates with nothing recorded need no work: absence is not stored, it is the
 * lack of a day for someone scheduled.
 */
export async function resettleDates(dateKeys: string[]): Promise<number> {
  if (dateKeys.length === 0) return 0;
  const days = await prisma.attendanceDay.findMany({
    where: { workDate: { in: dateKeys.map(toDate) } },
    select: { employeeId: true, branchId: true, workDate: true },
  });
  for (const day of days) {
    await settleDay(day.employeeId, day.branchId, toKey(day.workDate));
  }
  return days.length;
}
