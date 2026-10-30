import "server-only";
import sharp from "sharp";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { getObjectBuffer, uploadBufferToStorage } from "@/lib/platform/r2";

const log = scoped("modules.files.processor");

/**
 * Generates an SVG placeholder preview for PDF/Office documents
 * showing the document icon, file title, and metadata cleanly.
 */
function generateDocumentPreviewSvg(title: string, mimeType: string, fileSize: number): Buffer {
  const sizeKb = Math.round(fileSize / 1024);
  const sizeLabel = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
  const typeLabel = mimeType.includes("pdf") ? "PDF DOCUMENT" : "DOCUMENT";
  const safeTitle = title.replace(/[<>&"']/g, "").slice(0, 48);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000" fill="none">
    <rect width="800" height="1000" fill="#F4F4F5"/>
    <rect x="60" y="60" width="680" height="880" rx="16" fill="#FFFFFF" stroke="#E4E4E7" stroke-width="2"/>
    
    <!-- Top Document Accent Header -->
    <path d="M60 76C60 67.1634 67.1634 60 76 60H724C732.837 60 740 67.1634 740 76V160H60V76Z" fill="#18181B"/>
    <text x="100" y="118" fill="#EFCE02" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" letter-spacing="1">${typeLabel}</text>
    <text x="700" y="118" text-anchor="end" fill="#A1A1AA" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="500">${sizeLabel}</text>
    
    <!-- Document Graphic / Icon -->
    <g transform="translate(340, 360)">
      <rect x="0" y="0" width="120" height="150" rx="8" fill="#F4F4F5" stroke="#D4D4D8" stroke-width="3"/>
      <path d="M80 0 L120 40 L80 40 Z" fill="#E4E4E7"/>
      <line x1="24" y1="50" x2="96" y2="50" stroke="#A1A1AA" stroke-width="4" stroke-linecap="round"/>
      <line x1="24" y1="75" x2="96" y2="75" stroke="#A1A1AA" stroke-width="4" stroke-linecap="round"/>
      <line x1="24" y1="100" x2="68" y2="100" stroke="#A1A1AA" stroke-width="4" stroke-linecap="round"/>
    </g>

    <!-- Title and Loading Indication -->
    <text x="400" y="580" text-anchor="middle" fill="#18181B" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="600">${safeTitle}</text>
    <text x="400" y="620" text-anchor="middle" fill="#71717A" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="400">Progressive Preview &#183; Streaming high-res document...</text>
  </svg>`;

  return Buffer.from(svg);
}

/**
 * Asynchronously processes a hosted file to generate a low-resolution / lightweight preview asset.
 * Runs in the background without blocking initial upload.
 */
export async function processLowResPreview(fileId: string): Promise<{ success: boolean; error?: string }> {
  const file = await prisma.hostedFile.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return { success: false, error: "File not found" };
  }

  if (!file.generateLowRes) {
    return { success: true };
  }

  await prisma.hostedFile.update({
    where: { id: fileId },
    data: { lowResStatus: "PENDING" },
  });

  try {
    let previewBuffer: Buffer | null = null;
    const previewMime = "image/webp";
    const previewExtension = "webp";

    const isImage = file.mimeType.startsWith("image/") && !file.mimeType.includes("svg");

    if (isImage) {
      const originalBuffer = await getObjectBuffer(file.fileKey);
      if (!originalBuffer) {
        throw new Error(`Could not fetch original buffer for key ${file.fileKey}`);
      }

      // Downsample and compress image to high-efficiency WebP
      previewBuffer = await sharp(originalBuffer)
        .rotate() // auto-orient based on EXIF
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 40, effort: 4 })
        .toBuffer();
    } else {
      // Document / PDF: Generate an optimized vector/raster preview badge
      const svgBuffer = generateDocumentPreviewSvg(file.title, file.mimeType, file.fileSize);
      previewBuffer = await sharp(svgBuffer).webp({ quality: 80 }).toBuffer();
    }

    const previewKey = `hosted-files/previews/${file.id}-lowres.${previewExtension}`;

    const uploadRes = await uploadBufferToStorage({
      key: previewKey,
      buffer: previewBuffer,
      contentType: previewMime,
    });

    if (!uploadRes) {
      throw new Error("Failed to upload preview buffer to storage");
    }

    await prisma.hostedFile.update({
      where: { id: fileId },
      data: {
        lowResKey: uploadRes.fileKey,
        lowResUrl: uploadRes.publicUrl,
        lowResSize: previewBuffer.length,
        lowResStatus: "READY",
      },
    });

    log.info("Low-res preview generated successfully", {
      fileId,
      originalSize: file.fileSize,
      previewSize: previewBuffer.length,
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error("Failed to generate low-res preview", { fileId, error });
    await prisma.hostedFile.update({
      where: { id: fileId },
      data: { lowResStatus: "FAILED" },
    });
    return { success: false, error: errorMsg };
  }
}
