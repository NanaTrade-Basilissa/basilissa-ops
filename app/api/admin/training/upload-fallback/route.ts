import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/modules/identity/server";
import { isR2Configured, uploadBufferToStorage } from "@/lib/platform/r2";

export async function POST(req: Request) {
  try {
    const actor = await requirePermission("training:write");
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const courseId = (formData.get("courseId") as string) || "general";

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

    // If Neon Object Storage or R2 is configured, save directly to cloud storage
    if (isR2Configured()) {
      let mediaCategory = "documents";
      if (file.type.startsWith("video/")) {
        mediaCategory = "videos";
      } else if (file.type.startsWith("image/")) {
        mediaCategory = "images";
      }

      const key = `training/${mediaCategory}/${courseId}/${fileName}`;
      const storageResult = await uploadBufferToStorage({
        key,
        buffer,
        contentType: file.type || "application/octet-stream",
      });

      if (storageResult) {
        return NextResponse.json({
          success: true,
          publicUrl: storageResult.publicUrl,
          fileKey: storageResult.fileKey,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });
      }
    }

    // Local disk fallback when storage credentials are not present
    const uploadDir = join(process.cwd(), "public", "uploads", "training", courseId);
    await mkdir(uploadDir, { recursive: true });

    const filePath = join(uploadDir, fileName);
    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/training/${courseId}/${fileName}`;
    const fileKey = `local/training/${courseId}/${fileName}`;

    return NextResponse.json({
      success: true,
      publicUrl,
      fileKey,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
