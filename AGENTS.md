<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CRITICAL: Production Is Live — Database Safety Rules

This application is **live in production** with real staff and real operational data.

1. **Always inspect the active database target FIRST** before running any migration, seed, Prisma command, or SQL/script that reads or modifies data.
   - Verify whether `DATABASE_URL` in `.env` / `.env.local` points to the **local Docker Postgres (`localhost:5432`)** or the **production Neon database (`neon.tech`)**.
2. **NEVER run any write, migration, seed, reset, or cleanup against the production database without explicit user instruction** stating that the change should be applied to production.
3. **Default to the local Docker database** for development, schema testing, and verification.
4. **Before any explicitly approved production database mutation**:
   - Run a read-only preview (`SELECT` / `COUNT`) first to verify the exact scope of affected rows.
   - Wrap multi-step changes in an atomic transaction (`BEGIN; ... COMMIT;` or `prisma.$transaction`).
   - Never run destructive resets (`prisma migrate reset`, `db push --force-reset`, `TRUNCATE`, or broad `DELETE` without a narrow `WHERE` clause) on production.

