import type { Metadata } from "next";
import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { requireAuth } from "@/lib/modules/identity/server";
import { logout } from "@/lib/modules/identity/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "No access" };
export const dynamic = "force-dynamic";

/**
 * Deliberately outside the `(dashboard)` route group.
 *
 * This is where the admin shell sends someone it has just refused. Inside the
 * group it would be refused too, and the redirect would loop forever.
 */
export default async function NoAccessPage() {
  const actor = await requireAuth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldOff className="size-5" />
            You do not have access to the admin area
          </CardTitle>
          {/*
            Says plainly that the sign-in worked. Bouncing someone to a login
            form they just completed reads as a broken session, and they retry
            the same credentials instead of asking for the access they need.
          */}
          <CardDescription className="text-xs">
            Signed in as {actor.email}. This account lacks admin portal access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Contact an administrator to request access for this account.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Go to the main site
            </Link>
            <form action={logout}>
              <Button type="submit" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
