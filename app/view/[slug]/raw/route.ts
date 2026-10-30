import { NextResponse } from "next/server";
import { resolvePublicFileBySlug } from "@/lib/modules/files/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const data = await resolvePublicFileBySlug(slug);

  if (!data) {
    return new NextResponse("File not found or private", { status: 404 });
  }

  // HTTP 302 redirect directly to the signed high-res storage URL
  return NextResponse.redirect(data.highResResolvedUrl, 302);
}
