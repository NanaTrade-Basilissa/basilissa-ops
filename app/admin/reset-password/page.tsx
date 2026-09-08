import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/modules/identity/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-4">
      <div className="mb-8">
        <Logo size="lg" />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Set a new password</CardTitle>
          <CardDescription>
            {token
              ? "Choose something you have not used elsewhere."
              : "This link is missing its token, so it cannot be used."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Links can be cut short by email clients. Copying the whole address from
                the email usually fixes it; otherwise request a new one.
              </p>
              <Link href="/admin/forgot-password" className={buttonVariants({ className: "w-full" })}>
                Request a new link
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
