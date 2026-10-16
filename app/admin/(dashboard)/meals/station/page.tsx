import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { prisma } from "@/lib/platform/prisma";
import { getLiveServingStation } from "@/lib/modules/meals/service";
import { LiveStationScreen } from "@/components/admin/meals/live-station-screen";

export const metadata: Metadata = { title: "Kitchen Serving Station" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ branchId?: string }>;

export default async function StationPage({ searchParams }: { searchParams: SearchParams }) {
  const { scope } = await requireAnyBranchPermission("meals:read");
  const raw = await searchParams;

  const branchFilter =
    scope.kind === "branches"
      ? { id: { in: scope.branchIds } }
      : scope.kind === "none"
        ? { id: { in: [] } }
        : undefined;

  const branches = await prisma.branch.findMany({
    where: { ...branchFilter, isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  if (branches.length === 0) {
    notFound();
  }

  const selectedBranch =
    branches.find((b) => b.id === raw.branchId) ?? branches[0]!;

  const stationData = await getLiveServingStation(selectedBranch.id);

  return (
    <LiveStationScreen
      branchId={selectedBranch.id}
      initialData={stationData}
    />
  );
}
