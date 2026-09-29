import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { PLAY_LISTING } from "@/lib/platform/play-listing";

// Public compliance page for the Google Play Data safety form. No auth, no
// data access, nothing dynamic: it is statically rendered. The proxy only
// guards /admin and /api/admin, so this path needs no allow-list entry.
//
// Every value still in [square brackets] is awaiting a real answer from the
// business. They are all here, in one place, so filling them in is one edit.
// See open-decisions.md, A6.
const DETAILS = {
  ...PLAY_LISTING,
  requestContact: "your manager, HR, or info@basilissagh.com",
  completionDays: "15 working days",
};

const DESCRIPTION =
  "How Basilissa employees can request deletion of their Employee App account and data, what is deleted, and what is kept.";

export const metadata: Metadata = {
  title: "Delete your account",
  description: DESCRIPTION,
  alternates: { canonical: "/delete-account" },
  openGraph: { title: "Delete your account", description: DESCRIPTION },
};

export default function DeleteAccountPage() {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="flex items-center justify-center border-b border-border/60 bg-background px-4 py-4">
        <Logo />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        <article className="space-y-8 rounded-xl border border-border/60 bg-background p-5 leading-relaxed sm:p-8">
          <div className="space-y-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Delete your Basilissa Employee App account
            </h1>
            <p className="text-muted-foreground">
              {DETAILS.appName} by {DETAILS.developerName}
            </p>
          </div>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold">Who this applies to</h2>
            <p>
              This page is for employees who use the app to clock in and out. Your account was
              created by your employer or manager, and you sign in with your phone number and an
              SMS one-time code (OTP).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold">How to request deletion</h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>
                Contact {DETAILS.requestContact} and ask for your account to be deleted.
              </li>
              <li>
                Include your registered phone number and your full name, so we can verify that the
                request is yours.
              </li>
              <li>
                We will confirm the request and complete it within {DETAILS.completionDays}.
              </li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold">What is deleted</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>Your profile information (name and phone number)</li>
              <li>Your registered device and its push notification token</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold">What is kept, and for how long</h2>
            <p>
              Attendance and shift records are kept indefinitely for legal and audit
              reasons, so they are not removed when your account is deleted.
            </p>
            <p>
              Anonymous analytics and crash data held by Google Firebase is not linked to your
              account. It expires on Google&apos;s standard retention schedule.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold">Contact</h2>
            <p>Questions about deleting your account: {DETAILS.supportContact}</p>
            <p>
              See also our{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
