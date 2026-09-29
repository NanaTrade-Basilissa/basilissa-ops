import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { PLAY_LISTING } from "@/lib/platform/play-listing";

// Public compliance page for the Google Play listing and Data safety form.
// Static, no auth, no data access. The proxy only guards /admin and
// /api/admin, so this path needs no allow-list entry.
//
// Values still in [square brackets] await a real answer from the business
// and render literally. See open-decisions.md, A6.
const DETAILS = {
  ...PLAY_LISTING,
  lastUpdated: "29 September 2026",
  locationWhen: "only while the app is in use",
  smsProvider: "Hubtel",
  contactDetails: "info@basilissagh.com",
};

const DESCRIPTION =
  "How the Basilissa Employee App collects, uses, shares and protects employee data, and how to request access, correction or deletion.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy Policy", description: DESCRIPTION },
};

const linkClass = "underline underline-offset-4";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="flex items-center justify-center border-b border-border/60 bg-background px-4 py-4">
        <Logo />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        <article className="space-y-8 rounded-xl border border-border/60 bg-background p-5 leading-relaxed sm:p-8">
          <div className="space-y-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Privacy Policy</h1>
            <p className="text-muted-foreground">Last updated: {DETAILS.lastUpdated}</p>
            <p className="text-muted-foreground">
              {DETAILS.appName} by {DETAILS.developerName}
            </p>
          </div>

          <Section title="1. Who we are and who this covers">
            <p>
              {DETAILS.developerName} publishes the {DETAILS.appName} Android app. It is used by
              employees to record their attendance (clocking in and out). Accounts are created by
              the employee&apos;s employer, and this policy covers those employees.
            </p>
            <p>
              The app is not for the general public and is not for children. We do not knowingly
              collect data from anyone under 18.
            </p>
          </Section>

          <Section title="2. Data we collect">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Account information:</strong> your name, phone number, employee ID, and
                your assigned branch and role.
              </li>
              <li>
                <strong>Login:</strong> you sign in with your phone number and a 6-digit one-time
                code sent by SMS. There are no passwords.
              </li>
              <li>
                <strong>Location:</strong> your precise (fine) and approximate location, collected
                when you clock in or out, to check that you are at a branch you are assigned to.
                We collect it {DETAILS.locationWhen}.
              </li>
              <li>
                <strong>Attendance records:</strong> your clock-in and clock-out times, shift
                status, and whether each record has synced.
              </li>
              <li>
                <strong>Device information:</strong> a device identifier, used to tie one account
                to one device, and a push notification token.
              </li>
              <li>
                <strong>Diagnostics and analytics (Google Firebase):</strong> crash reports
                (Crashlytics), app usage events (Analytics), and push messaging (Cloud
                Messaging).
              </li>
            </ul>
          </Section>

          <Section title="3. Why we use it">
            <ul className="list-disc space-y-1 pl-6">
              <li>To verify that attendance happened at the workplace</li>
              <li>To sign you in and keep your account secure</li>
              <li>To prevent device sharing and fraud</li>
              <li>To send you notifications</li>
              <li>To find and fix crashes and to improve the app</li>
            </ul>
          </Section>

          <Section title="4. Who we share it with">
            <ul className="list-disc space-y-2 pl-6">
              <li>The employer or organisation you work for.</li>
              <li>
                Google Firebase, as a service provider. See{" "}
                <a
                  href="https://policies.google.com/privacy"
                  className={linkClass}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google&apos;s Privacy Policy
                </a>
                .
              </li>
              <li>{DETAILS.smsProvider}, our SMS provider, to deliver your login codes by SMS.</li>
            </ul>
            <p>We do not sell personal data.</p>
          </Section>

          <Section title="5. Storage and security">
            <p>
              Data is sent over HTTPS. Login tokens are kept in the device&apos;s secure storage.
              Attendance may be saved in a local database on your device and synced when the
              device is back online.
            </p>
          </Section>

          <Section title="6. Retention">
            <p>
              Attendance records are kept indefinitely, for legal and audit reasons. Profile data is kept
              while you are an active employee, and is then deleted or anonymised.
            </p>
          </Section>

          <Section title="7. Your rights and deleting your account">
            <p>
              You can ask us for access to your data, to correct it, or to delete it. Contact{" "}
              {DETAILS.supportContact}. To delete your account, see{" "}
              <Link href="/delete-account" className={linkClass}>
                how to request account deletion
              </Link>
              .
            </p>
          </Section>

          <Section title="8. Permissions the app requests on Android">
            <ul className="list-disc space-y-1 pl-6">
              <li>
                <strong>Location (fine and coarse):</strong> to check you are at your assigned
                branch when you clock in or out.
              </li>
              <li>
                <strong>Notifications:</strong> to send you shift and attendance alerts.
              </li>
              <li>
                <strong>Network state:</strong> to know whether the device is online, so saved
                attendance can be synced.
              </li>
            </ul>
          </Section>

          <Section title="9. Changes to this policy, and contact">
            <p>
              If we change this policy we will update the date at the top of this page. Questions
              about it: {DETAILS.contactDetails}
            </p>
          </Section>
        </article>
      </main>
    </div>
  );
}
