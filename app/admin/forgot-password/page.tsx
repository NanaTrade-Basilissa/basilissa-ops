import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/modules/identity/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
import { ForgotPasswordForm } from "@/components/admin/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  // Someone already signed in does not need this, and letting them request a
  // link would be a way to have one sent to an address they are borrowing.
  if (await verifySession()) redirect("/admin/security");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-4">
      <div className="mb-8">
        <Logo size="lg" />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Forgotten password</CardTitle>
          <CardDescription>
            Give us the address you sign in with and we will send a link to set a new
            password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
