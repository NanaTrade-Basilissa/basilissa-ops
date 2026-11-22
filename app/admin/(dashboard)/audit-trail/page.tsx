import type { Metadata } from "next";
import { requirePermission, listAuditLogs } from "@/lib/modules/identity/server";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { PageHeader, PageShell } from "@/components/admin/page-shell";

export const metadata: Metadata = { title: "Audit Trail" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission("audit:read");
  const sp = await searchParams;

  const page = Number(first(sp.page)) || 1;
  const pageSize = Number(first(sp.pageSize)) || 20;

  const auditData = await listAuditLogs({
    search: first(sp.search),
    action: first(sp.action),
    entityType: first(sp.entityType),
    actorEmail: first(sp.actorEmail),
    startDate: first(sp.startDate),
    endDate: first(sp.endDate),
    page,
    pageSize,
  });

  return (
    <PageShell>
      <PageHeader
        title="Audit Trail"
        description="Track administrative changes, sign-ins, and automated system events across the platform."
      />
      <AuditLogTable data={auditData} />
    </PageShell>
  );
}
