import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readMfaPendingUserId } from "@/lib/modules/identity/server";
import { submitMfaChallenge } from "@/lib/modules/identity/actions";
import { AuthShell } from "@/components/admin/auth-shell";
import { MfaChallengeForm } from "@/components/admin/mfa-challenge-form";

export const metadata: Metadata = { title: "Two-step verification" };
export const dynamic = "force-dynamic";

export default async function MfaChallengePage() {
  // A pending token proves only that the password step succeeded. Without one
  // there is nothing to complete, so this page is not reachable by guessing
  // the URL.
  const pending = await readMfaPendingUserId();
  if (!pending) redirect("/admin/login");

  return (
    <AuthShell>
      <MfaChallengeForm action={submitMfaChallenge} />
    </AuthShell>
  );
}
