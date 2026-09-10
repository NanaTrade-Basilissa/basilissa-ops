/**
 * Attendance module — server-only public entry point. See the entry-point
 * convention documented in `lib/modules/feedback/server.ts`.
 */
export * from "./policy-repository";
export * from "./assurance";
export * from "./providers";
export * from "./events";
export * from "./schedule";
export * from "./projection";
export * from "./settle";
export * from "./ingest";
export * from "./corrections";
export * from "./correction-service";
export * from "./auto-close";
export * from "./queries";
export * from "./overtime-auth";
export * from "./geofence";
export * from "./mobile";
export * from "./mobile-auth";
