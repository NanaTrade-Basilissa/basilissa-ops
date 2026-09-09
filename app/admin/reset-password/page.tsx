import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/modules/identity/server";
import { AuthShell } from "@/components/admin/auth-shell";
import { ResetPasswordForm } from "@/components/admin/reset-password-form";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Set a new password",
  // A reset link should never end up in a search index or a referrer.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await verifySession()) redirect("/admin/security");

  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";

  /*
    The token is NOT checked here, only its presence. Validating it on render
    would mean the page tells you whether a token is real before anyone types a
    password — a free oracle for guessing. The one place it is tested is the
    action, which is rate limited.
  */
  return (
    <AuthShell>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Set a new password</h1>
            <p className="text-sm text-balance text-muted-foreground">
              This link is missing its token, so it cannot be used.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Links can be cut short by email clients. Copying the whole address from
            the email usually fixes it; otherwise request a new one.
          </p>
          <Link href="/admin/forgot-password" className={buttonVariants({ size: "lg", className: "w-full" })}>
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
