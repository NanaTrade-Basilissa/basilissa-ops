import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/modules/identity/server";
import { createPresignedUploadUrl, isR2Configured } from "@/lib/platform/r2";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const actor = await requirePermission("files:write");
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const rawFileName = (body.fileName || body.filename || "").trim();
    const contentType = (body.fileType || body.contentType || "application/octet-stream").trim();

    if (!rawFileName) {
      return NextResponse.json({ error: "fileName is required" }, { status: 400 });
    }

    const sanitizedBase = rawFileName
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .slice(0, 80);
    const uniqueSuffix = randomUUID().slice(0, 8);
    const key = `hosted-files/originals/${Date.now()}-${uniqueSuffix}-${sanitizedBase}`;

    if (!isR2Configured()) {
      return NextResponse.json({
        configured: false,
        useFallback: true,
        fileKey: key,
      });
    }

    const presigned = await createPresignedUploadUrl({
      key,
      contentType,
      expiresInSeconds: 3600, // 1 hour
    });

    if (!presigned) {
      return NextResponse.json({ error: "Failed to generate presigned upload URL" }, { status: 500 });
    }

    return NextResponse.json({
      configured: true,
      useFallback: false,
      uploadUrl: presigned.uploadUrl,
      publicUrl: presigned.publicUrl,
      fileKey: presigned.fileKey,
      expiresInSeconds: presigned.expiresInSeconds,
    });
  } catch (error) {
    console.error("Error generating presigned file upload URL:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
