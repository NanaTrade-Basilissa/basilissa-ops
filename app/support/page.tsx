import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { PLAY_LISTING } from "@/lib/platform/play-listing";
import { Mail, Phone, MapPin, Clock, HelpCircle, ShieldCheck, Camera, MapPinOff } from "lucide-react";

export const metadata: Metadata = {
  title: "App Support | Basilissa Staff",
  description: "Official support and help center for the Basilissa Staff mobile application.",
  alternates: { canonical: "/support" },
  openGraph: {
    title: "Basilissa Staff App Support",
    description: "Get help with your Basilissa Staff account, attendance clocking, staff meals, and leave management.",
  },
};

const linkClass = "text-primary underline underline-offset-4 hover:text-primary/80";

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-card p-5 sm:p-6 shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-border/40 pb-3">
        {Icon && <Icon className="size-5 text-primary" />}
        <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      <div className="text-sm leading-relaxed text-muted-foreground space-y-2">{children}</div>
    </section>
  );
}

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/30">
      {/* Navigation Header */}
      <header className="border-b border-border/60 bg-background/95 backdrop-blur px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/delete-account" className="hover:text-foreground transition-colors">
              Delete Account
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="border-b border-border/50 bg-background py-8 sm:py-12 px-4 text-center">
        <div className="mx-auto max-w-2xl space-y-2">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {PLAY_LISTING.appName} Support Center
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Official technical and employee help desk for Basilissa restaurant staff, kitchen crews, and branch teams.
          </p>
        </div>
      </div>

      {/* Main Support Content */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 space-y-8">
        {/* Contact Channels Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-background p-4 text-center space-y-2 shadow-sm">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="size-5" />
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Support</h3>
            <p className="text-sm font-medium text-foreground">info@basilissagh.com</p>
            <a
              href="mailto:info@basilissagh.com?subject=Basilissa%20Staff%20App%20Support%20Request"
              className="inline-block text-xs font-semibold text-primary hover:underline"
            >
              Send an Email &rarr;
            </a>
          </div>

          <div className="rounded-xl border border-border/60 bg-background p-4 text-center space-y-2 shadow-sm">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Phone className="size-5" />
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Direct Telephone</h3>
            <p className="text-sm font-medium text-foreground">+233 30 282 3123</p>
            <span className="text-xs text-muted-foreground">Call our support desk</span>
          </div>

          <div className="rounded-xl border border-border/60 bg-background p-4 text-center space-y-2 shadow-sm">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock className="size-5" />
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Help Desk Hours</h3>
            <p className="text-sm font-medium text-foreground">Mon &ndash; Sat: 7am &ndash; 8pm</p>
            <span className="text-xs text-muted-foreground">GMT (Accra Time)</span>
          </div>

          <div className="rounded-xl border border-border/60 bg-background p-4 text-center space-y-2 shadow-sm">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPin className="size-5" />
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Head Office</h3>
            <p className="text-sm font-medium text-foreground">NANATRADE / Basilissa</p>
            <span className="text-xs text-muted-foreground">Accra, Ghana</span>
          </div>
        </div>

        {/* Knowledgebase & Frequently Asked Questions */}
        <div className="space-y-4">
          <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">
            Frequently Asked Questions
          </h2>

          <Section title="1. Signing In & One-Time Passcodes (OTP)" icon={ShieldCheck}>
            <p>
              The Basilissa Staff app uses passwordless phone verification. Enter your registered mobile number to
              receive a 6-digit one-time code via SMS.
            </p>
            <ul className="list-disc space-y-1.5 pl-5 pt-1">
              <li>
                <strong>Did not receive the SMS code?</strong> Check your mobile cellular reception and ensure you are
                using the exact phone number registered with Basilissa HR. If you recently changed your SIM or number,
                contact HR or email{" "}
                <a href="mailto:info@basilissagh.com" className={linkClass}>
                  info@basilissagh.com
                </a>{" "}
                to update your staff record.
              </li>
              <li>
                <strong>One Device Policy:</strong> Your account is securely locked to your primary smartphone to
                safeguard your attendance and records. If you replace your phone, contact your supervisor or HR for a
                quick device reset.
              </li>
            </ul>
          </Section>

          <Section title="2. Attendance & Geofenced Clock-In" icon={MapPinOff}>
            <p>
              When you tap <strong>Clock In</strong> or <strong>Clock Out</strong>, the app confirms that your device is
              physically within your assigned branch perimeter.
            </p>
            <ul className="list-disc space-y-1.5 pl-5 pt-1">
              <li>
                <strong>&ldquo;Outside Branch Geofence&rdquo; Alert:</strong> Ensure device Location Services are turned
                ON and permission is granted to &ldquo;While Using the App&rdquo; with <strong>Precise Location</strong>{" "}
                enabled. If you are inside a shopping mall (e.g. Accra Mall or West Hills Mall), step near a window or
                door briefly to allow GPS acquisition.
              </li>
              <li>
                <strong>Offline Sync:</strong> If mobile data drops, your clock event is saved locally with a secure
                timestamp and uploaded automatically once connectivity returns.
              </li>
            </ul>
          </Section>

          <Section title="3. Daily Staff Meals (Camera & QR Scanner)" icon={Camera}>
            <p>
              To claim your staff meal portion at the kitchen counter, tap the <strong>Collect Meal</strong> button in
              the Meals tab and scan the official wall QR code.
            </p>
            <ul className="list-disc space-y-1.5 pl-5 pt-1">
              <li>
                <strong>Camera Permission:</strong> Camera access is used solely to scan the kitchen wall QR code. When
                prompted, select &ldquo;Continue&rdquo; and allow camera access.
              </li>
              <li>
                <strong>If camera access was previously disabled:</strong> Go to your iPhone or iPad <strong>Settings &gt;
                Basilissa Staff &gt; Camera</strong> and toggle the switch to ON.
              </li>
            </ul>
          </Section>

          <Section title="4. Annual Leave & Sick Leave Requests" icon={HelpCircle}>
            <p>
              Staff can schedule their annual leave in weekly blocks during the company planning window or request
              emergency sick leave directly from the Leave tab.
            </p>
            <ul className="list-disc space-y-1.5 pl-5 pt-1">
              <li>
                <strong>Probation Policy:</strong> Employees must complete 12 months continuous service before booking
                voluntary annual leave dates.
              </li>
              <li>
                <strong>Medical Certificates:</strong> For sick leave requests lasting more than 1 day, attach a photo or
                PDF of your medical certificate directly in the app.
              </li>
            </ul>
          </Section>

          <Section title="5. Account Deletion & Data Requests" icon={ShieldCheck}>
            <p>
              Employees who have ended their employment or wish to request data correction or account deletion can review
              our formal policy on the{" "}
              <Link href="/delete-account" className={linkClass}>
                Delete Account Page
              </Link>{" "}
              or read our complete{" "}
              <Link href="/privacy" className={linkClass}>
                Privacy Policy
              </Link>.
            </p>
          </Section>
        </div>

        {/* Footer Support Banner */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center space-y-3">
          <h3 className="font-heading text-base font-semibold text-foreground">
            Still need help or encountering a bug?
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Our IT & HR operations team is ready to assist you. Include your Employee Code and Branch name in your
            message for immediate response.
          </p>
          <a
            href="mailto:info@basilissagh.com?subject=Basilissa%20Staff%20App%20Inquiry"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Contact Technical Support
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-background py-6 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} {PLAY_LISTING.developerName}. All rights reserved.</p>
      </footer>
    </div>
  );
}
