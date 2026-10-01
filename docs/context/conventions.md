# Conventions

How code here is written, and why. Match the surrounding code; where this page
and the code disagree, say so and fix one of them.

The invariants that are expensive to break are also in
[`CLAUDE.md`](../../CLAUDE.md). This page is the longer form.

## Layering and module boundaries

```
app/ and components/   ->   lib/modules/<domain>   ->   lib/platform
UI and HTTP only            domain logic                 infrastructure
```

- **`lib/platform` never imports a module.** Platform is reusable by every
  module precisely because it knows no domain. ESLint fails the build.
- **Across modules, import public entry files only** (`constants`, `validation`,
  `authorization`, `server`, `actions`, `jobs`, and the pure-rules names listed in
  `PUBLIC_ENTRIES` in `eslint.config.mjs`). Never a module's internals. If you
  need something that is not exported, add it to the entry file.
- **Inside a module, import siblings relatively** (`./service`), never through
  the `@/lib/modules/<self>/...` alias, so a module stays movable.
- **Why several entry files and not one barrel:** a single `index.ts` cannot
  straddle the server and client split. Re-exporting a module that imports
  `server-only` would break every Client Component that just wants a constant.
  Server Actions are never re-exported through a barrel; that breaks the
  client-to-action binding React relies on.
- **The worker imports only `*/jobs`.** Never `*/server`.
- **New module?** Add its name to `MODULES` in `eslint.config.mjs`, or its
  boundaries are not enforced (that is the current state of `devices`).
- The allowlist of entry names has grown three times (register C5). If you must
  extend it again, that is the trigger to invert it.

## Purity

Logic that decides **what people are paid or whether a test is passed** is a pure
function: no Prisma, no `Date.now()` hidden inside, no network. That is why it can
be tested exhaustively and why a bug is fixed by replaying.

Pure today: `authorization`, `policy`, `assurance`, `events`, `schedule`,
`projection`, `manual`, `corrections`, `overtime-auth`, `geofence` maths,
`providers`, assessment and aptitude `scoring`, employee `import` row resolution.

Pattern: a pure file holds the rules and takes its inputs as arguments (including
`now`); a sibling does the I/O (`policy.ts` and `policy-repository.ts`;
`projection.ts` and `settle.ts`). Keep the split sharp when you add to either.

## Time, dates, numbers

- **Minutes are integers** in anything wage-adjacent. No floats.
- **Calendar days** are `YYYY-MM-DD` keys, and `DATE` columns hold that day at UTC
  midnight. Convert with the helpers in `lib/platform/date.ts`
  (`dateKeyInZone`, `zonedMinutesToUtc`, `shiftDateKey`), never ad hoc.
- **Decide "which day" in the branch's time zone**, not the server's and not the
  user's. Default `Africa/Accra`.
- Pass `now` into functions that need it. Tests then need no clock mocking.

## Server Actions and pages

- Mark action files `"use server"`; only async functions may be exported from them.
- **Every action re-checks its permission** (and feature flag), validates with a
  Zod schema from the module's `validation`, returns a `FormState`
  (`lib/platform/forms.ts`) for `useActionState`, and revalidates the affected
  path. See [auth-and-permissions](./auth-and-permissions.md#the-shape-of-a-server-action).
- **Every admin page applies its own guard.** The layout is not a boundary.
- Record audit **inside the same transaction** as the change.
- Do not trust a submitted `branchId`: re-check it against the actor's scope.

## Errors and logging

- Use `scoped("area.subarea")` from `lib/platform/logger.ts`; structured fields,
  not interpolated strings: `log.warn("rejected", { employeeId, reason })`. Pass
  an `Error` as a field and the logger unwraps it.
- Do not log secrets, tokens, OTPs, full phone numbers, or message bodies.
- **Audit throws, email does not.** `recordAudit` failing must fail the
  operation (an unrecorded wage change is worse than a retry). `sendEmail`
  returns a result and the caller decides. `recordAuditBestEffort` exists for
  events worth noticing that must not break the flow they observe (a failed
  sign-in, where throwing would hand an attacker a denial of service); never use
  it for anything a person could later dispute. Choose deliberately for new
  infrastructure code, and say which in its docblock.
- Return typed result objects (`{ ok: false, error: "CODE", message }`) from
  domain functions that have expected failures. Throw for the unexpected.

## Data access

- Prisma through `lib/platform/prisma.ts` only.
- **Pass the transaction client** (`tx`) through helpers that take part in one
  (`enqueue`, `recordAudit`, `isCoveringAt` all accept it).
- **Branch-scoped reads** take a `BranchScope`; `none` returns empty without
  querying. Never fall back to unfiltered.
- Constrain and paginate list queries.
- Events and audit are append-only in the database. Do not write code that
  assumes it can fix a row afterwards.

## UI

- **shadcn/ui is the component system.** Check `components/ui/` first; if the
  component exists in shadcn and is not installed, install it
  (`pnpm dlx shadcn@latest add <name>`) and compose it. Do not hand-roll dialogs,
  dropdowns, tables, tabs, tooltips, sheets, comboboxes or date pickers.
- Extend a component with a variant (see `badge.tsx` rating variants) rather than
  forking it.
- **Installing can overwrite** project-specific extensions. Run
  `pnpm dlx shadcn@latest diff <name>` first for heavily used files (`button`,
  `card`, `table`, `badge`).
- `cn` comes from the `cn` package; `lib/utils.ts` re-exports it so
  `@/lib/utils` keeps working.
- Prefer a **shadcn block** over building a screen from scratch when one fits;
  `components/app-sidebar.tsx` is the reference for adapting one.
- Brand tokens (colours, radius, sidebar and chart variables) live in
  `app/globals.css`. A rebrand never touches component code.
- Tables: TanStack Table with the shared `data-table.tsx`. Toasts: sonner.
- Hiding a control is **convenience, not authorisation**.
- Server Components by default; add `"use client"` only where state or effects
  need it.

## The assessment answer key

It must never reach the browser. A Server Component serialises the props it
passes to the client, so one careless `include` would publish the answers to
anyone with developer tools, and nothing would look wrong. Everything a taking page
renders comes from `loadForTaking` in `lib/modules/assessments/taking.ts`, whose
`select` lists are written out longhand and never include `isCorrect`;
`tests/assessment-answer-key.test.ts` asserts the string never appears there (the
aptitude equivalent is `aptitude-answer-key.test.ts`). Never use `include` or a
spread on taker-facing queries, and do not add a field to a taker-facing type
without checking it cannot leak scoring.

## Comments

The codebase documents **why** at length: module docblocks, the reason a rule
exists, the bug that taught it. Keep that.

- Say why, not what. A reader can see what the code does.
- Name the failure a rule prevents ("that fall-through was the bug week-by-week
  rotas kept hitting").
- A `TODO` needs a trigger or a register entry, not a wish.
- Do not narrate the task you are on in a comment; comments describe the code
  as it will exist.

## Naming

- Files: `kebab-case.ts`. Components: `PascalCase` exports from kebab-case files.
- Permissions: `resource:action` lower case.
- Job types: `UPPER_SNAKE` constants exported from the module's `jobs.ts`.
- Tests: `tests/<subject>.test.ts`, named for the subject, not the ticket.
- Commits: `type(scope): summary`, imperative, scope is the area
  (`attendance`, `shifts`, `nav`, `auth`).

## Dependencies

The default answer to new infrastructure is **no**. Before adding a service,
answer the five questions in the
[ADR guide](../architecture/decisions/README.md): what problem, why Postgres or
the app cannot solve it, correctness or optimisation, what happens when it is
down, what it costs to run. A new npm library follows the same spirit: prefer
what is installed (shadcn, TanStack, Zod, date helpers in `platform/date.ts`).

## Documentation is part of the change

Update the register, the relevant context page and the HANDOVER in the same
commit as the work. See [docs/README.md](../README.md#rules-for-keeping-these-true).
