import { NextResponse } from "next/server";
import { prisma } from "@/lib/platform/prisma";
import { requireAuth } from "@/lib/modules/identity/server";

export async function GET() {
  await requireAuth();

  const [jobTitles, departments] = await Promise.all([
    prisma.odooJobTitle.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, odooId: true, name: true },
    }),
    prisma.odooDepartment.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, odooId: true, name: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    jobTitles,
    departments,
  });
}
