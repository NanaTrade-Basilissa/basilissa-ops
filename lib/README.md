# `lib/` layout

Three layers, with dependencies allowed in one direction only:

```
app/ · components/          UI and HTTP. No business rules.
        │
        ▼
lib/modules/<domain>/       Domain logic. May use lib/platform.
        │                   May use another module's PUBLIC ENTRY POINTS only.
        ▼
lib/platform/               Shared infrastructure. May NOT import a module.
```

## `lib/platform/`

Infrastructure with no domain knowledge: `prisma`, `env`, `date`, `jobs`, `audit`,
`email`, `sms`, `push`, `slack`, `rate-limit`, `forms`, `constants`. Reusable by
every module, which is exactly why it must never import one — that dependency
direction is enforced by ESLint.

## `lib/modules/<domain>/`

Each domain module exposes a **fixed set of entry files**. Everything else in
the folder is private.

| Entry | Contents | Safe in a Client Component |
| --- | --- | --- |
| `constants` | Values and types | yes |
| `validation` | Zod schemas | yes |
| `authorization` | Pure permission rules, no I/O | see note |
| `server` | Server-only domain logic | no |
| `actions` | Server Actions (`"use server"`) | imported directly |

> `authorization` is pure and has no `server-only` guard, so it is testable and
> composable anywhere. It currently imports Prisma's generated enums, which
> makes it server-side in practice. If a Client Component ever needs a
> permission check — to hide a nav item, say — extract those enum values first,
> and remember that hiding UI is convenience, not authorisation.

Several entry files rather than one `index.ts` barrel, because a single barrel
cannot straddle the server/client split: re-exporting a module that imports
`server-only` would break every Client Component that just wants a constant.
Server Actions are never re-exported through a barrel either — that breaks the
client-to-action binding React relies on.

Inside a module, import siblings **relatively** (`./service`), so the module
stays movable. Across modules, use the `@/` alias and a public entry point.

Current modules: `identity`, `attendance`, `employees`, `branches`, `devices`,
`feedback`, `questions`, `assessments`, `aptitude`. `devices` is not yet in
`MODULES` in `eslint.config.mjs`, so its boundaries are not enforced.

The entry-file list above is the common set. The full allowlist, including the
pure-rules entries (`policy`, `assurance`, `providers`, `scoring`, `events`,
`geofence`, `schedule`, `projection`, `manual`, `corrections`, `queries`,
`import`) and `jobs`, is `PUBLIC_ENTRIES` in `eslint.config.mjs`. `jobs` is the
only entry the worker may import.

More: [`docs/context/codebase-map.md`](../docs/context/codebase-map.md) and
[`docs/context/conventions.md`](../docs/context/conventions.md).

## Enforcement

`eslint.config.mjs` fails the build on:

- reaching into another module's private files,
- absolute `@/lib/modules/<self>/…` imports from inside that same module,
- any import of `@/lib/modules/*` from `lib/platform/`.

Adding a module means adding its name to `MODULES` in that file.
