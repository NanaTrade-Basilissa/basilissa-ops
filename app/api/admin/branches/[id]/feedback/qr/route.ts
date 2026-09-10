import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/platform/prisma";
import { requireBranchPermission } from "@/lib/modules/identity/server";
import { getEnv } from "@/lib/platform/env";

type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  // proxy.ts already blocks unauthenticated requests to /api/admin/*; this
  // is the authoritative check per the defense-in-depth auth pattern.
  const { id } = await params;
  await requireBranchPermission("branch:read", id);

  const branch = await prisma.branch.findUnique({ where: { id }, select: { slug: true, name: true } });
  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const feedbackUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/feedback?branch=${branch.slug}`;
  const png = await QRCode.toBuffer(feedbackUrl, {
    type: "png",
    width: 640,
    margin: 2,
    color: { dark: "#2b1109", light: "#ffffff" },
  });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const filename = `basilissa-${branch.slug}-qr.png`;

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=0, must-revalidate",
      ...(download ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
    },
  });
}
