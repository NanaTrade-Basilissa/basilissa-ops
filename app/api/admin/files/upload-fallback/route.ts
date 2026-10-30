import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/modules/identity/server";
import { isR2Configured, uploadBufferToStorage } from "@/lib/platform/r2";
import { createHostedFile } from "@/lib/modules/files/server";
import type { HostedFileDisplayMode } from "@/lib/modules/files/constants";

export async function POST(req: Request) {
  try {
    const actor = await requirePermission("files:write");
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || (file?.name ?? "Untitled File");
    const isPublic = formData.get("isPublic") === "true";
    const customSlug = (formData.get("customSlug") as string) || undefined;
    const displayMode = (formData.get("displayMode") as HostedFileDisplayMode) || "IN_APP_VIEWER";
    const generateLowRes = formData.get("generateLowRes") !== "false";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const sanitizedBase = file.name
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .slice(0, 80);
    const uniqueSuffix = randomUUID().slice(0, 8);
    const fileName = `${Date.now()}-${uniqueSuffix}-${sanitizedBase}`;

    let fileKey = `hosted-files/originals/${fileName}`;
    let fileUrl = "";

    if (isR2Configured()) {
      const storageResult = await uploadBufferToStorage({
        key: fileKey,
        buffer,
        contentType: file.type || "application/octet-stream",
      });

      if (!storageResult) {
        return NextResponse.json({ error: "Failed to upload file to cloud storage" }, { status: 500 });
      }

      fileKey = storageResult.fileKey;
      fileUrl = storageResult.publicUrl;
    } else {
      if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        return NextResponse.json(
          {
            error:
              "Object storage credentials are missing in Vercel. Please configure AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_BUCKET_NAME.",
          },
          { status: 500 }
        );
      }

      const uploadDir = join(process.cwd(), "public", "uploads", "hosted-files");
      await mkdir(uploadDir, { recursive: true });

      const filePath = join(uploadDir, fileName);
      await writeFile(filePath, buffer);

      fileUrl = `/uploads/hosted-files/${fileName}`;
      fileKey = `local/hosted-files/${fileName}`;
    }

    const hostedFile = await createHostedFile({
      title,
      originalFilename: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      fileKey,
      fileUrl,
      isPublic,
      customSlug,
      displayMode,
      generateLowRes,
      uploadedById: actor.userId,
    });

    return NextResponse.json({
      success: true,
      file: hostedFile,
    });
  } catch (error) {
    console.error("Hosted file upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
