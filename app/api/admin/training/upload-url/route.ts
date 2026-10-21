import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/modules/identity/server";
import { createPresignedUploadUrl, isR2Configured } from "@/lib/platform/r2";

const ALLOWED_MIME_TYPES = new Set([
  // Videos
  "video/mp4",
  "video/quicktime", // .mov
  "video/webm",
  // Pictures
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // PDF Documents
  "application/pdf",
]);

export async function POST(req: Request) {
  try {
    const actor = await requirePermission("training:create");
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { fileName, fileType, courseId } = body;

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json({ error: "fileName is required" }, { status: 400 });
    }

    if (!fileType || !ALLOWED_MIME_TYPES.has(fileType.toLowerCase())) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Supported formats: Videos (.mp4, .mov, .webm), Pictures (.jpg, .png, .webp), and PDFs (.pdf).",
        },
        { status: 400 }
      );
    }

    // Determine category folder
    let mediaCategory = "documents";
    if (fileType.startsWith("video/")) {
      mediaCategory = "videos";
    } else if (fileType.startsWith("image/")) {
      mediaCategory = "images";
    }

    const sanitizedBase = fileName
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .slice(0, 80);
    const uniqueSuffix = randomUUID().slice(0, 8);
    const key = `training/${mediaCategory}/${courseId || "general"}/${Date.now()}-${uniqueSuffix}-${sanitizedBase}`;

    const r2Configured = isR2Configured();

    if (!r2Configured) {
      return NextResponse.json({
        configured: false,
        fileKey: key,
        message: "Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME) are not yet configured in environment.",
      });
    }

    const presigned = await createPresignedUploadUrl({
      key,
      contentType: fileType,
      expiresInSeconds: 3600, // 1 hour window
    });

    if (!presigned) {
      return NextResponse.json({ error: "Failed to generate presigned upload URL" }, { status: 500 });
    }

    return NextResponse.json({
      configured: true,
      uploadUrl: presigned.uploadUrl,
      publicUrl: presigned.publicUrl,
      fileKey: presigned.fileKey,
      expiresInSeconds: presigned.expiresInSeconds,
    });
  } catch (error) {
    console.error("Error generating presigned upload URL:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
