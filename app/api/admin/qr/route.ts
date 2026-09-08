import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { requirePermission } from "@/lib/modules/identity/server";
import { getEnv } from "@/lib/platform/env";

export async function GET(request: NextRequest) {
  // proxy.ts already blocks unauthenticated requests to /api/admin/*; this
  // is the authoritative check per the defense-in-depth auth pattern.
  await requirePermission("branch:read");

  const feedbackUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/feedback`;
  const png = await QRCode.toBuffer(feedbackUrl, {
    type: "png",
    width: 640,
    margin: 2,
    color: { dark: "#2b1109", light: "#ffffff" },
  });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const filename = "basilissa-general-qr.png";

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=0, must-revalidate",
      ...(download ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
    },
  });
}
