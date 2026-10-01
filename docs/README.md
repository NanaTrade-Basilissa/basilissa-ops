# Documentation index

This folder is the project's memory. The code says what the system does today;
these documents say **why**, **what is not finished**, and **what is easy to
break**. If you are an engineer or an AI agent picking up work, start here.

## How the docs are layered

Context is loaded in layers, most general first, so that a task pulls in what it
needs and nothing else.

| Layer | Where | Loaded | Holds |
| --- | --- | --- | --- |
| 0. Always-on | [`CLAUDE.md`](../CLAUDE.md) | every agent session | Gates, invariants, pointers. Kept short on purpose. |
| 1. Orientation | [`docs/context/`](./context/) | at the start of a task | How the system fits together: map, vocabulary, rules, recipes. |
| 2. State | [`HANDOVER.md`](./HANDOVER.md), [`open-decisions.md`](./architecture/open-decisions.md) | before changing anything | Where work stopped, what is provisional, what is blocked. |
| 3. Reasoning | [`docs/architecture/`](./architecture/) | when a decision looks odd | ADRs, the architecture assessment, the phase plan. |
| 4. Source | the code | last | What actually happens. Module docblocks explain intent. |

The code is not the state of the project. Layers 1 to 3 are.

## I am about to...

| Task | Read, in order |
| --- | --- |
| Start any work | [open-decisions](./architecture/open-decisions.md) (skim the red items), then [HANDOVER](./HANDOVER.md) |
| Find where something lives | [codebase-map](./context/codebase-map.md) |
| Understand a term (assurance, canonical, cover shift, work date) | [domain-glossary](./context/domain-glossary.md) |
| Touch a table, a migration, or a trigger | [data-model](./context/data-model.md), then [workflows: migrations](./context/workflows.md#add-a-migration) |
| Add or change a permission, page guard or Server Action | [auth-and-permissions](./context/auth-and-permissions.md) |
| Change attendance, scheduling, pay-affecting logic | [attendance-pipeline](./context/attendance-pipeline.md), then the [architecture assessment](./architecture/attendance-platform.md) |
| Send an email, SMS, push or add a background job | [background-work-and-notifications](./context/background-work-and-notifications.md) |
| Add an admin page, a mobile endpoint, or a module | [workflows](./context/workflows.md) |
| Write code that matches the codebase | [conventions](./context/conventions.md) |
| Run, verify or deploy | [environments-and-deploy](./context/environments-and-deploy.md), [testing-and-verification](./context/testing-and-verification.md) |
| Question a decision (no Redis, Vercel plus worker) | [ADRs](./architecture/decisions/README.md) |
| Plan a feature | [announcements spec](./specs/announcements.md) is the worked example; [implementation-plan](./architecture/implementation-plan.md) for the phase it belongs to |

## Map of this folder

```
docs/
  README.md                         this file
  HANDOVER.md                       where work stopped; the next task
  context/                          layer 1: orientation (this is the context-engineering set)
    system-overview.md              what the system is, who uses it, runtime topology
    codebase-map.md                 directory map, modules, entry points, task to file
    domain-glossary.md              the vocabulary, with where each term lives in code
    data-model.md                   models grouped by domain, immutability, constraints
    auth-and-permissions.md         roles, scopes, the guards and when to use which
    attendance-pipeline.md          capture to payroll-facing day, step by step
    background-work-and-notifications.md   job queue, worker, cron, email/SMS/push/Slack
    conventions.md                  module boundaries, purity, actions, naming, style
    workflows.md                    recipes for the common changes
    testing-and-verification.md     the gates, test layout, verifying against real Postgres
    environments-and-deploy.md      env vars, Docker, Vercel, worker, migrations
  architecture/                     layer 3: reasoning
    open-decisions.md               the register: provisional values, deferrals, gaps
    implementation-plan.md          phases 0 to 8 and what gates each
    attendance-platform.md          the architecture assessment the plan came from
    device-investigation-findings.md   ZKTeco K40 Pro measurements
    decisions/                      ADRs
  specs/                            feature specs written before building
  integrations/                     third-party setup guides
```

## Rules for keeping these true

1. **Update docs in the same commit as the work.** A doc that says "not built"
   about something you just built is worse than no doc.
2. **One home per fact.** If a value lives in code (a permission list, an enum,
   a default), the doc names the file instead of copying the value. Copies rot.
   Orientation docs describe *shape and reasons*; the code holds *values*.
3. **Every claim that could go stale points at its source** (`file:line` is too
   brittle, so use the file and the symbol name).
4. **The register shrinks.** When an open decision closes, delete its entry
   rather than marking it done. See the top of
   [open-decisions](./architecture/open-decisions.md).
5. **An ADR is for decisions that are expensive to reverse.** Everything
   provisional goes in the register instead.
6. **Facts that are not in the repo** (a business rule from a conversation, an
   unknown about production) go in the register with who owns the answer.
7. **No secrets, no real staff data, no production URLs with credentials** in
   any document.

When a doc and the code disagree, the code is right about behaviour and the doc
is right about intent. Resolve the disagreement in the same change: fix the
code if the intent was right, fix the doc if the intent changed.
