/**
 * Idempotent database seed.
 *
 * Safe to run repeatedly: `pnpm prisma db seed` / `docker compose exec app pnpm prisma db seed`.
 * - Admin account: created once from SEED_ADMIN_* env vars, as a User with a
 *   SUPER_ADMIN/GLOBAL role assignment. If a user with that email already
 *   exists, its password is left untouched so a later in-app password change
 *   is never silently reverted by a redeploy/reseed.
 * - Questions and branches: upserted by their unique key (order / slug), so
 *   re-running updates content instead of creating duplicates.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { FEEDBACK_QUESTIONS } from "../lib/modules/feedback/constants";
import { SAMPLE_BRANCHES } from "./seed-data";

const prisma = new PrismaClient();

/** Grants SUPER_ADMIN at global scope, idempotently. */
async function grantSuperAdmin(userId: string) {
  await prisma.roleAssignment.upsert({
    // scopeId is "" rather than null for GLOBAL — see the schema comment on
    // RoleAssignment for why the unique constraint depends on it.
    where: {
      userId_role_scopeType_scopeId: {
        userId,
        role: "SUPER_ADMIN",
        scopeType: "GLOBAL",
        scopeId: "",
      },
    },
    update: {},
    create: { userId, role: "SUPER_ADMIN", scopeType: "GLOBAL", scopeId: "" },
  });
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "marketing@basilissagh.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME ?? "Basilissa Admin";

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  });

  if (existing) {
    // Never overwrite a changed password on redeploy/reseed. Only keep the
    // display name in sync, which is safe to update.
    if (existing.name !== name) {
      await prisma.user.update({ where: { email }, data: { name } });
    }
    // Re-asserted every run: an admin who somehow lost their grant would
    // otherwise be locked out with no way back in.
    await grantSuperAdmin(existing.id);
    console.log(`admin user already exists, left password untouched: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name, passwordHash, passwordChangedAt: new Date() },
    select: { id: true },
  });
  await grantSuperAdmin(user.id);
  console.log(`created admin user with SUPER_ADMIN/GLOBAL: ${email}`);
}

/**
 * Creates the global attendance policy if none exists.
 *
 * Only ever creates: policy versions are superseded, never updated, so a
 * reseed must not touch a version someone has since put in place. Everything
 * is left provisional until an authorised person confirms it against real
 * employment terms — the values here are placeholders, not decisions.
 */
async function seedAttendancePolicy() {
  const existing = await prisma.attendancePolicy.findFirst({
    where: { branchId: null },
    select: { id: true },
  });

  if (existing) {
    console.log("global attendance policy already exists, left untouched");
    return;
  }

  await prisma.attendancePolicy.create({
    // Column defaults carry the values; naming them here too would create a
    // second place for them to drift.
    data: { branchId: null, isProvisional: true },
  });
  console.log("created global attendance policy (PROVISIONAL — confirm with HR)");
}

async function seedQuestions() {
  for (const question of FEEDBACK_QUESTIONS) {
    await prisma.question.upsert({
      where: { order: question.order },
      update: { text: question.text, isActive: true },
      create: { ...question, isActive: true },
    });
  }
  console.log(`seeded ${FEEDBACK_QUESTIONS.length} questions`);
}

async function seedBranches() {
  for (const branch of SAMPLE_BRANCHES) {
    await prisma.branch.upsert({
      where: { slug: branch.slug },
      update: { name: branch.name, location: branch.location },
      create: { ...branch, isActive: true },
    });
  }
  console.log(`seeded ${SAMPLE_BRANCHES.length} branches`);
}

async function main() {
  await seedAdmin();
  await seedAttendancePolicy();
  await seedQuestions();
  await seedBranches();
}

main()
  .catch((error) => {
    console.error("seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
