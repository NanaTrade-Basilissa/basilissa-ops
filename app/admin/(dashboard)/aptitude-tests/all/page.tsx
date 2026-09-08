import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Plus, Timer } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { requireFeature } from "@/lib/platform/features-guard";
import { listAptitudeTests } from "@/lib/modules/aptitude/server";
import { STATUS_LABEL } from "@/lib/modules/aptitude/constants";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAccraDateTime } from "@/lib/platform/date";

export const metadata: Metadata = { title: "All aptitude tests" };
export const dynamic = "force-dynamic";

export default async function AllAptitudeTestsPage() {
  requireFeature("aptitude");
  const actor = await requirePermission("aptitude:read");
  const canWrite = can(actor, "aptitude:write");
  const tests = await listAptitudeTests();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/aptitude-tests"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to overview
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">All aptitude tests</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Timed screening tests for job candidates.
          </p>
        </div>
        {canWrite && (
          <Link href="/admin/aptitude-tests/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-4" /> New test
          </Link>
        )}
      </div>

      {tests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Timer className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing here yet. A test is a set of sections, each with its own questions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sections</TableHead>
              <TableHead>Invited</TableHead>
              <TableHead>Timer</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tests.map((test) => (
              <TableRow key={test.id}>
                <TableCell>
                  <Link
                    href={`/admin/aptitude-tests/${test.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {test.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={test.status === "PUBLISHED" ? "default" : "outline"}>
                    {STATUS_LABEL[test.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{test._count.sections}</TableCell>
                <TableCell className="text-sm">{test._count.invitations}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {test.timeLimitMinutes ? `${test.timeLimitMinutes} min` : "untimed"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatAccraDateTime(test.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
