@AGENTS.md

# Basilissa Operations Platform

A customer feedback system being grown into an operations platform: employee
attendance with geofencing and biometrics, HR assessments, and eventual Odoo
ERP synchronisation. Next.js 16, React 19, Postgres 16, Prisma 6.

## Read these before changing anything

The code is not the state of this project. These are:

| File | What it holds |
| --- | --- |
| `docs/architecture/open-decisions.md` | **Start here.** Every provisional value, deferral, known gap and unknown, with why. Red items are blocked on the user. |
| `docs/HANDOVER.md` | Where the work stopped, and **the one task to start on**, specified. |
| `docs/architecture/decisions/` | ADRs — decisions that are expensive to reverse. 0001 runtime topology and portability, 0002 no Redis. |
| `docs/architecture/implementation-plan.md` | Phases 0-8, and which unknowns gate each. |
| `docs/architecture/attendance-platform.md` | The architecture assessment the plan came from. |

Update the register in the same commit as the work. An entry that says
"not built" about something you just built is worse than no entry.

## Gates

```
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four, to completion, before every commit. **Check real exit codes.** Piping
a gate through `tail` gives you tail's exit status, which is how a commit with
failing lint got merged here once.

## Invariants that are easy to break

- **A Server Action is reachable by direct POST.** Gating the page is a
  convenience; the action is the boundary. Every action re-checks its
  permission, and its feature flag if it has one.
- **A Next.js layout is not a security boundary.** It does not re-run on every
  client-side navigation. Every page under `app/admin/(dashboard)/` applies its
  own `requirePermission`; the layout gates chrome only. `tests/mfa-enforcement.test.ts`
  fails if a page is left relying on it.
- **`requirePermission(p)` with no resource demands a GLOBAL grant.** Naming no
  branch must never widen access. Use `requireBranchPermission(p, branchId)`
  for one branch.
- **The worker imports only `@/lib/modules/*/jobs`, never `*/server`.** The
  `server` barrels reach `next/navigation` and React's client context, which
  kills a plain Node process at startup. This has already happened once.
- **Module boundaries are ESLint-enforced.** Import a module's public entry
  points only (`constants`, `validation`, `server`, `jobs`, `actions`, …), never
  its internals. Add to the entry file rather than reaching in.
- **`attendance_events`, `attendance_corrections` and `audit_logs` are
  append-only**, enforced by Postgres triggers. UPDATE and DELETE are refused.
- **Payroll- and result-affecting logic is pure.** Scoring, projection, policy
  resolution, assurance — no I/O, so they are exhaustively testable. Keep it
  that way.
- **The assessment answer key must never reach the browser.** See the note at
  the top of `lib/modules/assessments/taking.ts`.

## UI components: shadcn/ui, standardised

[shadcn/ui](https://ui.shadcn.com/) is this project's UI component system —
not one option among several. Before building any UI, check whether a
shadcn/ui component or block already fits:

- **Never hand-roll a component shadcn/ui already provides** — dialogs,
  dropdowns, tables, tabs, tooltips, sheets, comboboxes, date pickers, empty
  states, and so on. Install it (`pnpm dlx shadcn@latest add <name>`) and
  compose it, the same way `components/ui/*` already does. Extend an
  installed component with a project-specific variant (see `badge.tsx`'s
  `rating*` variants) rather than forking it into a parallel implementation.
- **Prefer a block over building a screen from scratch** when one fits
  (`dashboard-01`, `login-02`, and the rest at ui.shadcn.com/blocks) — adapt
  its structure to this app's actual routes, data and auth rather than
  copying its demo content verbatim. `components/app-sidebar.tsx` is the
  reference: real shadcn `Sidebar` primitives, our own nav data and session.
- **Installing overwrites some `components/ui/*` files.** Run
  `pnpm dlx shadcn@latest diff <name>` first if a file the app depends on
  heavily (`button`, `card`, `table`, `badge`, …) is flagged, and check for
  project-specific extensions before accepting the overwrite — the CLI has no
  idea `badge.tsx` carries `ratingBadgeVariant`.
- **The `cn` helper is the `cn` npm package** (`lib/utils.ts` re-exports it),
  not a hand-rolled `clsx`+`tailwind-merge` combo — every generated shadcn
  file imports `cn` from `"cn"` directly, and `lib/utils.ts` exists only so
  the rest of the app can keep importing `@/lib/utils` unchanged.
- **Don't introduce a second component library** to solve something shadcn
  already covers, and don't leave a shadcn primitive uninstalled-and-hand-
  copied because pulling in the real thing felt like more setup.
- This project's brand tokens (colours, radius, sidebar/chart variables) live
  in `app/globals.css` and every shadcn component already reads them — a
  rebrand or a new shadcn install never requires touching component code, only
  those CSS variables.

## Verifying database-bound work

Unit tests do not cover anything whose correctness lives in a transaction, a
constraint or a trigger. Verify those against real Postgres:

```bash
docker compose exec -T postgres psql -U basilissa -d postgres -c "create database basilissa_verify;"
DATABASE_URL="postgresql://basilissa:basilissa_password@localhost:5432/basilissa_verify" \
  ./node_modules/.bin/prisma migrate deploy
DATABASE_URL="...basilissa_verify" ./node_modules/.bin/tsx --conditions=react-server scratch-check.ts
docker compose exec -T postgres psql -U basilissa -d postgres -c "drop database basilissa_verify;"
```

A **scratch database**, not the dev one, because append-only tables cannot be
cleaned up afterwards. `--conditions=react-server` is required or `server-only`
throws. Delete scratch scripts when done.

For auth changes, use a **real authenticated session** — mint one by inserting
a `sessions` row and signing a JWT with `SESSION_SECRET`. Unauthenticated
`curl` redirects at the outermost gate and exercises none of the code being
changed; it passes no matter what is broken.

Use throwaway accounts (`*@basilissa.invalid`), never the real admin, and
verify the cleanup actually happened.

## Local environment

- `docker compose up -d` — Postgres on 5432, app on `${APP_PORT:-3000}` (3001
  here), worker. Containers run `NODE_ENV=production`.
- Env precedence: `.env` then `.env.local` overriding it, for the app, the
  Prisma CLI and compose alike. Put local values in `.env.local`.
- Attendance, scheduling, policy editor, and aptitude tests are fully live across all environments.
- Rebuild after changing code the container runs: `docker compose build app worker`.
  There is no bind mount — the image has a baked copy.

## Git

Features branch from `develop`. `main` only ever receives merges from
`develop`, `--ff-only`, so the two stay identical and there is one migration
chain. Never branch a feature from `main`.

Commit or push only when asked.

## Production

**Do not touch the production database.** Migrations against Neon are run by
the user. `prisma migrate deploy` is the only safe command — `migrate dev` can
reset and `db push` bypasses the migration history.

Nothing is deployed automatically: `build` is plain `next build`, so migrating
and deploying are separate acts, in that order.
