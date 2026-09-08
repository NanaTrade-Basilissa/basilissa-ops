import { loadEnvConfig } from "@next/env";

/**
 * Loads `.env.local` / `.env` for the worker, with the same precedence Next.js
 * and prisma.config.ts use.
 *
 * MUST BE IMPORTED FIRST, before anything that reaches for `DATABASE_URL`.
 * ES module imports are evaluated in order but hoisted above statements, so a
 * `loadEnvConfig()` call at the top of index.ts would still run *after* the
 * Prisma client module had been evaluated. A side-effect module imported ahead
 * of it is the only ordering that is guaranteed rather than incidental.
 *
 * In a container this finds no files and does nothing, which is correct: no
 * `.env*` ships in the image and the platform supplies the environment
 * directly. Nothing here overrides an already-set variable.
 */
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
  info: () => {},
  error: (...args: unknown[]) => console.error(...args),
});
