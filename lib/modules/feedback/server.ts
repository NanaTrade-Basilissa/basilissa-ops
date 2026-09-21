/**
 * Feedback module — server-only public entry point.
 *
 * Modules expose a fixed set of entry files rather than one barrel, because a
 * single `index.ts` cannot straddle the server/client split: re-exporting
 * `service.ts` (which imports `server-only`) would break every Client
 * Component that just wants the rating scale.
 *
 * Public entry points for every module:
 *   constants   client-safe values and types
 *   validation  Zod schemas (client-safe)
 *   server      server-only domain logic  ← this file
 *   actions     Server Actions ("use server"; never re-exported through a
 *               barrel, which would break the client-to-action binding)
 *
 * Everything else in the folder is private. Enforced by the module-boundary
 * rule in eslint.config.mjs.
 */
export * from "./service";
export * from "./scoping";
export * from "./analytics";
export * from "./notifications";
export * from "./jobs";
export * from "./recipients";
