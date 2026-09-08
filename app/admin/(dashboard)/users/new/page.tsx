import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/modules/identity/server";
import { createUserAccount } from "@/lib/modules/identity/actions";
import { isEmailConfigured } from "@/lib/platform/env";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "New user" };
export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requirePermission("user:write");

  return (
    <div className="max-w-xl space-y-4">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to users
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New user</CardTitle>
          <CardDescription>
            Creates an account and sends them a link to choose their own password. You will
            not see or set it: an administrator who knows somebody&rsquo;s password makes
            everything that person does deniable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/*
            Whether email works decides what happens after submitting, so the
            form is told up front rather than surprising anyone with a link to
            copy.
          */}
          <CreateUserForm action={createUserAccount} emailConfigured={isEmailConfigured()} />
        </CardContent>
      </Card>
    </div>
  );
}
