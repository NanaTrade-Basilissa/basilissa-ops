import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readMfaPendingUserId } from "@/lib/modules/identity/server";
import { submitMfaChallenge } from "@/lib/modules/identity/actions";
import { MfaChallengeForm } from "@/components/admin/mfa-challenge-form";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Two-step verification" };
export const dynamic = "force-dynamic";

export default async function MfaChallengePage() {
  // A pending token proves only that the password step succeeded. Without one
  // there is nothing to complete, so this page is not reachable by guessing
  // the URL.
  const pending = await readMfaPendingUserId();
  if (!pending) redirect("/admin/login");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-secondary/40 px-4">
      <Logo />
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-bold">Two-step verification</h1>
          <p className="text-sm text-muted-foreground">
            Your password was accepted. One more step.
          </p>
        </div>
        <MfaChallengeForm action={submitMfaChallenge} />
      </div>
    </main>
  );
}
