import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/modules/identity/server";

export async function POST(req: Request) {
  try {
    const actor = await requirePermission("training:create");
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
    console.error("Fallback upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
