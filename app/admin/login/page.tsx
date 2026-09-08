import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/modules/identity/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-4">
      <div className="mb-8">
        <Logo size="lg" />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Admin dashboard</CardTitle>
          <CardDescription>Sign in to view feedback analytics and manage branches.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm passwordWasReset={passwordWasReset} />
        </CardContent>
      </Card>
    </div>
  );
}
