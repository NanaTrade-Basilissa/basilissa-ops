import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/modules/identity/server";
import { AuthShell } from "@/components/admin/auth-shell";
import { ForgotPasswordForm } from "@/components/admin/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  // Someone already signed in does not need this, and letting them request a
  // link would be a way to have one sent to an address they are borrowing.
  if (await verifySession()) redirect("/admin/security");

  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
