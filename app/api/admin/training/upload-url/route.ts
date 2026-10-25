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

function inferMimeType(fileName: string, providedType?: string): string {
  const normProvided = (providedType || "").trim().toLowerCase();
  if (normProvided && normProvided !== "application/octet-stream" && normProvided !== "binary/octet-stream") {
    return normProvided;
  }
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return normProvided;
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePermission("training:write");
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const rawFileName = (body.fileName || body.filename || "").trim();
    const courseId = body.courseId || "general";

    if (!rawFileName) {
      return NextResponse.json({ error: "fileName is required" }, { status: 400 });
    }

    const fileType = inferMimeType(rawFileName, body.fileType || body.contentType);

    if (!fileType || !ALLOWED_MIME_TYPES.has(fileType.toLowerCase())) {
      return NextResponse.json(
        {
          error: `Unsupported file type "${fileType || "unknown"}". Supported formats: Videos (.mp4, .mov, .webm), Pictures (.jpg, .png, .webp), and PDFs (.pdf).`,
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

    const sanitizedBase = rawFileName
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .slice(0, 80);
    const uniqueSuffix = randomUUID().slice(0, 8);
    const key = `training/${mediaCategory}/${courseId}/${Date.now()}-${uniqueSuffix}-${sanitizedBase}`;

    const r2Configured = isR2Configured();

    if (!r2Configured) {
      const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
      return NextResponse.json({
        configured: false,
        useFallback: true,
        fileKey: key,
        message: isServerless
          ? "Object storage credentials (AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME) are missing in Vercel environment variables."
          : "Object storage credentials (Neon Object Storage or Cloudflare R2) are not yet configured in environment.",
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
      useFallback: false,
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
