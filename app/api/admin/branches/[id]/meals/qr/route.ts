import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/platform/prisma";
import { requireBranchPermission } from "@/lib/modules/identity/server";

type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  await requireBranchPermission("meals:read", id);

  const branch = await prisma.branch.findUnique({
    where: { id },
    select: { slug: true, name: true },
  });
  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  // Deep-link schema recognized by the employee mobile app
  const qrTarget = `basilissa://meals/claim?branch=${branch.slug}`;

  const png = await QRCode.toBuffer(qrTarget, {
    type: "png",
    width: 640,
    margin: 2,
    color: { dark: "#18181b", light: "#ffffff" },
  });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const filename = `basilissa-meal-claim-${branch.slug}.png`;

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=0, must-revalidate",
      ...(download ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
    },
  });
}
