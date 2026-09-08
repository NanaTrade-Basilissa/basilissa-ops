import type { AuditActor } from "@/lib/platform/audit";
import type { Actor } from "./authorization";

/**
 * Maps a signed-in actor onto the fields the audit log stores.
 *
 * The direction matters: identity depends on platform, never the reverse. The
 * audit writer therefore takes plain fields, and this is the one place that
 * knows how to produce them from a session.
 */
export function auditActorFrom(actor: Actor): AuditActor {
  return {
    userId: actor.userId,
    email: actor.email,
    // Every role held at the time, not just one. A person may act while
    // holding several, and which of them "authorised" an action is a
    // judgement best left to whoever reads the trail later.
    role: actor.assignments.map((assignment) => assignment.role).sort().join(",") || null,
  };
}
