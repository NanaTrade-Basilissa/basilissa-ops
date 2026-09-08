import "server-only";
import { notFound } from "next/navigation";
import { isFeatureEnabled, type FeatureName } from "./features";

/**
 * Refuses a page or Server Action when its feature is off in this deployment.
 *
 * Separate from `features.ts` purely so the worker can read flag state without
 * importing `next/navigation`, which does not survive a plain Node process.
 *
 * `notFound()` rather than a "coming soon" page: a URL that renders anything is
 * a URL someone bookmarks, links to, and later reports as broken. As far as
 * this deployment is concerned the route does not exist, and that is what it
 * should say.
 *
 * Call it in pages AND in the Server Actions behind them. A Server Action is
 * reachable by direct POST without the page, so gating only the page leaves
 * the mutation open — the same mistake the `requireAdmin` migration fixed for
 * permissions.
 */
export function requireFeature(name: FeatureName): void {
  if (!isFeatureEnabled(name)) notFound();
}
