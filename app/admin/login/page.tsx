import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/modules/identity/server";
import { AuthShell } from "@/components/admin/auth-shell";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Admin sign in" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await verifySession();
  if (session) {
    redirect("/admin");
  }

  const passwordWasReset = (await searchParams).reset === "1";

  return (
    <AuthShell>
      <LoginForm passwordWasReset={passwordWasReset} />
    </AuthShell>
  );
}
