import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Domain modules under `lib/modules/`. Each exposes a fixed set of public
 * entry files; everything else in the folder is private to that module.
 *
 * The allowlist below is the set of entry-point *names* a module may expose.
 * A module uses whichever apply; nothing requires it to have all of them.
 *
 *   constants      client-safe values and types
 *   validation     Zod schemas (client-safe)
 *   authorization  pure permission rules, no I/O          (identity)
 *   policy         pure calculation rules, no I/O         (attendance)
 *   assurance      pure trust ranking, no I/O             (attendance)
 *   events         pure event rules, no I/O               (attendance)
 *   server         server-only domain logic
 *   actions        Server Actions ("use server")
 *
 * The pure-rules entries — authorization, policy, assurance, events — are the
 * places where being wrong is expensive rather than annoying, so they are kept
 * free of I/O and importable on their own for exhaustive testing. What is
 * genuinely private is the other kind of file: services, repositories and
 * anything importing `server-only`, all reached through `server`.
 *
 * NOTE: this list has now grown three times, once per pure-rules file added.
 * If it keeps growing, invert the convention — mark private files by
 * convention (an `internal/` folder) rather than enumerating public ones.
 * Tracked in docs/architecture/open-decisions.md.
 *
 * See lib/modules/feedback/server.ts for why modules use several entry files
 * rather than one `index.ts` barrel.
 */
const MODULES = ["identity", "feedback", "branches", "questions", "attendance", "employees", "assessments", "aptitude"];
const PUBLIC_ENTRIES = [
  "constants",
  "validation",
  "authorization",
  "policy",
  "assurance",
  "providers",
  "scoring",
  "events",
  "geofence",
  "schedule",
  "projection",
  "manual",
  "corrections",
  "queries",
  // Bulk-import row resolution (employees): pure given DB state as plain
  // data, so it's importable on its own for exhaustive testing too.
  "import",
  // Background work. The worker imports this and never `server`, which
  // re-exports request-scoped code that cannot load outside a request.
  "jobs",
  "server",
  "actions",
];

/** Deep-import patterns for one module: anything that is not a public entry. */
function privatePatternsFor(moduleName) {
  return [
    {
      group: [
        `@/lib/modules/${moduleName}/*`,
        ...PUBLIC_ENTRIES.map((entry) => `!@/lib/modules/${moduleName}/${entry}`),
      ],
      message:
        `"${moduleName}" is a domain module. Import one of its public entry points ` +
        `(${PUBLIC_ENTRIES.join(", ")}) instead of reaching into its internals. ` +
        `If you need something that is not exported, add it to that module's entry file.`,
    },
  ];
}

/**
 * One config block per module, plus one for everything outside `lib/modules`.
 * Each source file matches exactly one block, so the `no-restricted-imports`
 * key is never overwritten by a later block.
 */
const moduleBoundaries = [
  // Code outside any module may not reach into any module's internals.
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    ignores: ["lib/modules/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: MODULES.flatMap(privatePatternsFor) },
      ],
    },
  },
  // Inside module X, X's own files are reached relatively; every *other*
  // module is still restricted to its public entry points.
  ...MODULES.map((moduleName) => ({
    files: [`lib/modules/${moduleName}/**/*.ts`, `lib/modules/${moduleName}/**/*.tsx`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...MODULES.filter((other) => other !== moduleName).flatMap(privatePatternsFor),
            {
              group: [`@/lib/modules/${moduleName}/*`],
              message:
                `Import files inside the "${moduleName}" module relatively (e.g. "./service") ` +
                `rather than through the "@/" alias, so the module stays movable.`,
            },
          ],
        },
      ],
    },
  })),
  // Platform services are shared infrastructure and must not depend on any
  // domain module — that direction of dependency is what keeps them reusable.
  {
    files: ["lib/platform/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/modules/*", "@/lib/modules/**"],
              message:
                "lib/platform is shared infrastructure and must not import from a domain module. " +
                "Invert the dependency: have the module call into the platform service.",
            },
          ],
        },
      ],
    },
  },
];

/**
 * The codebase marks a deliberately unused parameter with a leading underscore.
 * A Server Action's `_prevState` is required by useActionState's contract and
 * is often genuinely unused; the default rule only forgives that when a LATER
 * parameter is used, so an action whose last two parameters are both unused
 * was reported. Honour the convention the code already follows.
 */
const unusedVars = [
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...moduleBoundaries,
  ...unusedVars,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
