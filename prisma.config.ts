import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration — and, more importantly, the place where the Prisma
 * CLI is taught the same environment precedence the application already uses.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Next.js loads `.env.local` ahead of `.env`, so `next dev` already prefers
 * local settings. The Prisma CLI does not: on its own it reads `.env` and
 * nothing else. That split means `pnpm db:migrate`, `pnpm db:seed` and
 * `pnpm db:studio` can point at a completely different database than the app
 * you are running — and since `.env` is the production file here, the
 * difference is "your laptop" versus "the live database".
 *
 * `loadEnvConfig` is Next's own loader (the docs recommend it for exactly this
 * case: "a root config file for an ORM or test runner"), so the CLI and the
 * app resolve variables identically instead of approximately.
 *
 * Precedence, highest first:
 *   1. real process environment  (CI, Vercel, docker compose `environment:`)
 *   2. .env.development.local    (NODE_ENV=development)
 *   3. .env.local                ← local overrides live here
 *   4. .env.development
 *   5. .env                      ← committed defaults / production
 *
 * Nothing here overwrites a variable that is already set, so a value injected
 * by the platform always wins over a file. That is what keeps `migrate deploy`
 * inside the container correct: no `.env*` file ships in the image, and the
 * compose/hosting environment supplies `DATABASE_URL` directly.
 */

const isProduction = process.env.NODE_ENV === "production";
const targetEnvFile = process.env.PRISMA_ENV_FILE;

if (targetEnvFile) {
  // Explicit env file requested (e.g. .env for production deploy).
  // Do NOT call Next's loadEnvConfig, which forces .env.local ahead of .env.
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(path.resolve(process.cwd(), targetEnvFile));
    } catch (err) {
      console.warn(`[prisma] Could not load ${targetEnvFile}:`, err);
    }
  }
} else {
  loadEnvConfig(process.cwd(), !isProduction, {
    // Next's loader logs "Environments: .env.local, .env" at info level. Route
    // it through a quieter channel and add the resolved target, so every Prisma
    // command states which database it is about to touch.
    info: () => {},
    error: (...args: unknown[]) => console.error(...args),
  });
}

/**
 * Host and database only — never the credentials. Printed so that running a
 * migration against the wrong database is a visible mistake rather than a
 * silent one.
 */
function describeTarget(url: string | undefined): string {
  if (!url) return "DATABASE_URL is not set";
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname}`;
  } catch {
    return "unparseable DATABASE_URL";
  }
}

if (!isProduction || targetEnvFile) {
  console.log(`[prisma] database target: ${describeTarget(process.env.DATABASE_URL)}${targetEnvFile ? ` (from ${targetEnvFile})` : ""}`);
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    // Moved off the deprecated `package.json#prisma.seed`, which Prisma 7
    // removes. One source of truth for how the seed runs.
    //
    // Explicit path to the binary, not a bare `tsx`. Prisma spawns this
    // command directly, so it only inherits a PATH containing
    // node_modules/.bin when something upstream added it — `pnpm prisma db
    // seed` does, `./node_modules/.bin/prisma db seed` does not. The
    // Dockerfile and the compose `seed` service both invoke Prisma by path,
    // so a bare `tsx` fails there with a bare ENOENT and no hint why.
    seed: "./node_modules/.bin/tsx prisma/seed.ts",
  },
});
