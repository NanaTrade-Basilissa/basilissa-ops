import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { verifyDeviceToken } from "@/lib/modules/attendance/server";
import { isR2Configured, uploadBufferToStorage } from "@/lib/platform/r2";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const tokenVerification = verifyDeviceToken(bearerToken);

  if (!tokenVerification.ok) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: tokenVerification.message },
      { status: 401 }
    );
  }

  const { employeeId } = tokenVerification.payload;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "NO_FILE", message: "No file provided" }, { status: 400 });
    }

    let mimeType = file.type || "application/octet-stream";
    if (!mimeType || mimeType === "application/octet-stream") {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf") mimeType = "application/pdf";
      else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
      else if (ext === "png") mimeType = "image/png";
      else if (ext === "webp") mimeType = "image/webp";
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        {
          ok: false,
          error: "INVALID_FILE_TYPE",
          message: "Doctor's report must be a PDF document or image (JPG, PNG, WEBP).",
        },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const sanitizedBase = file.name
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .slice(0, 60);
    const uniqueSuffix = randomUUID().slice(0, 8);
    const key = `leave-attachments/${employeeId}/${Date.now()}-${uniqueSuffix}-${sanitizedBase}`;

    if (!isR2Configured()) {
      return NextResponse.json(
        {
          ok: false,
          error: "STORAGE_NOT_CONFIGURED",
          message: "Object storage is not configured for file uploads.",
        },
        { status: 500 }
      );
    }

    const result = await uploadBufferToStorage({
      key,
      buffer,
      contentType: mimeType,
    });

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "UPLOAD_FAILED", message: "Failed to store medical attachment." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      publicUrl: result.publicUrl,
      fileKey: result.fileKey,
      fileName: file.name,
      mimeType,
    });
  } catch (err) {
    console.error("Medical report upload error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Failed to upload file",
      },
      { status: 500 }
    );
  }
}
