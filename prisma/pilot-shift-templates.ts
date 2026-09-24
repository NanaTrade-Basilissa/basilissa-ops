/**
 * Creates the four pilot shift templates. Safe to re-run: a template that
 * already exists with the same times is left alone, and one with the same name
 * but different times stops the run rather than being overwritten.
 *
 *   tsx prisma/pilot-shift-templates.ts           # dry run
 *   tsx prisma/pilot-shift-templates.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { PILOT_SHIFT_TEMPLATES, assertSafeDatabase, isApply } from "./pilot-data";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const SYSTEM = { actorUserId: null, actorEmail: null, actorRole: "SYSTEM" };

async function main() {
  assertSafeDatabase();

  for (const template of Object.values(PILOT_SHIFT_TEMPLATES)) {
    const existing = await prisma.shift.findFirst({ where: { name: template.name, branchId: null } });

    if (existing) {
      const same =
        existing.startMinute === template.startMinute &&
        existing.endMinute === template.endMinute &&
        existing.unpaidBreakMinutes === template.unpaidBreakMinutes;
      if (!same) {
        throw new Error(`"${template.name}" exists with different times (${existing.id}). Resolve by hand.`);
      }
      console.log(`exists   ${template.name}  ${existing.id}`);
      continue;
    }

    if (!isApply()) {
      console.log(`create   ${template.name}`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({ data: { ...template, branchId: null } });
      await tx.auditLog.create({
        data: {
          ...SYSTEM,
          action: "shift.created",
          entityType: "Shift",
          entityId: shift.id,
          after: { ...template, isActive: true },
          metadata: { source: "prisma/pilot-shift-templates.ts" },
        },
      });
      console.log(`created  ${template.name}  ${shift.id}`);
    });
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
