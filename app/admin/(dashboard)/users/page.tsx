import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, UserPlus } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import {
  MFA_REQUIRED_ROLES,
  can,
  requirePermission,
} from "@/lib/modules/identity/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAccraDateTime } from "@/lib/platform/date";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await requirePermission("user:read");
  const canWrite = can(actor, "user:write");

  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      lastLoginAt: true,
      mfaEnabledAt: true,
      roleAssignments: {
        where: { OR: [{ validTo: null }, { validTo: { gt: new Date() } }] },
        select: { role: true, scopeType: true, scopeId: true },
      },
      _count: { select: { mfaRecoveryCodes: { where: { usedAt: null } } } },
    },
  });

  const branchIds = users.flatMap((user) =>
    user.roleAssignments.filter((a) => a.scopeType === "BRANCH").map((a) => a.scopeId),
  );
  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, name: true },
  });
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const missingMfa = users.filter(
    (user) =>
      user.mfaEnabledAt === null &&
      user.roleAssignments.some((a) => MFA_REQUIRED_ROLES.includes(a.role)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Users</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Accounts that can sign in. Most staff need an employee record and no user account
            at all: someone who only ever punches a terminal never signs in to anything.
          </p>
        </div>
        {canWrite && (
          <Link href="/admin/users/new" className={buttonVariants({ size: "sm" })}>
            <UserPlus className="size-4" /> New user
          </Link>
        )}
      </div>

      {missingMfa.length > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>
            {missingMfa.length} {missingMfa.length === 1 ? "account needs" : "accounts need"}{" "}
            two-step verification
          </AlertTitle>
          <AlertDescription>
            They can sign in but cannot reach anything privileged until they set it up.
            Nobody is locked out. They are sent to the security page instead.
          </AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Two-step</TableHead>
            <TableHead>Last signed in</TableHead>
            {canWrite && <TableHead className="sr-only">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const requires = user.roleAssignments.some((a) => MFA_REQUIRED_ROLES.includes(a.role));
            const enabled = user.mfaEnabledAt !== null;

            return (
              <TableRow key={user.id}>
                <TableCell>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {user.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{user.email}</span>
                  {user.status !== "ACTIVE" && (
                    <Badge variant="destructive" className="mt-1 text-xs">
                      {user.status.toLowerCase()}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {user.roleAssignments.length === 0 ? (
                    <span className="text-muted-foreground">None</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {user.roleAssignments.map((assignment, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {assignment.role.toLowerCase().replace(/_/g, " ")}
                          {assignment.scopeType === "BRANCH" &&
                            ` · ${branchName.get(assignment.scopeId) ?? "branch"}`}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {enabled ? (
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="size-4" />
                      on
                      <span className="text-xs text-muted-foreground">
                        ({user._count.mfaRecoveryCodes} codes left)
                      </span>
                    </span>
                  ) : requires ? (
                    <Badge variant="destructive">required, not set up</Badge>
                  ) : (
                    <span className="text-muted-foreground">off</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.lastLoginAt ? formatAccraDateTime(user.lastLoginAt) : "Never"}
                </TableCell>
                {canWrite && (
                  <TableCell>
                    <Link
                      href={`/admin/users/${user.id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Manage
                    </Link>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
