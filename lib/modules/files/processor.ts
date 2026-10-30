import "server-only";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { getObjectBuffer, uploadBufferToStorage } from "@/lib/platform/r2";

const log = scoped("modules.files.processor");
const execFileAsync = promisify(execFile);

/**
 * Inspects a PPTX file to extract its slide dimensions, orientation, and slide count.
 */
export async function inspectPptx(buffer: Buffer): Promise<{
  slideCount: number;
  orientation: "LANDSCAPE" | "PORTRAIT";
  width: number;
  height: number;
} | null> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const presXmlStr = await zip.file("ppt/presentation.xml")?.async("string");
    if (!presXmlStr) return null;

    const match =
      presXmlStr.match(/<[a-zA-Z0-9:]*sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/i) ||
      presXmlStr.match(/<[a-zA-Z0-9:]*sldSz[^>]*cy="(\d+)"[^>]*cx="(\d+)"/i);

    let width = 1920;
    let height = 1080;
    if (match) {
      const cx = parseInt(match[1], 10);
      const cy = parseInt(match[2], 10);
      width = cx;
      height = cy;
    }

    const orientation: "LANDSCAPE" | "PORTRAIT" = width >= height ? "LANDSCAPE" : "PORTRAIT";

    const slideFiles = Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/i.test(name)
    );

    return {
      slideCount: Math.max(1, slideFiles.length),
      orientation,
      width,
      height,
    };
  } catch (err) {
    log.warn("Failed to inspect PPTX presentation structure", { err });
    return null;
  }
}

/**
 * Attempts to convert a PPTX/PPT presentation buffer to PDF using headless LibreOffice if available.
 */
async function convertPptxToPdf(buffer: Buffer): Promise<Buffer | null> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pptx-conv-"));
  const inputPath = path.join(tmpDir, "input.pptx");

  try {
    await fs.writeFile(inputPath, buffer);

    const binaryCandidates = [
      "libreoffice",
      "soffice",
      "/usr/bin/libreoffice",
      "/usr/bin/soffice",
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ];

    let converted = false;
    for (const bin of binaryCandidates) {
      try {
        await execFileAsync(
          bin,
          [
            "--headless",
            "--invisible",
            "--nodefault",
            "--nofirststartwizard",
            "--nolockcheck",
            "--nologo",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
            tmpDir,
            inputPath,
          ],
          { timeout: 30000 }
        );
        converted = true;
        break;
      } catch {
        // Try next candidate
      }
    }

    if (converted) {
      const outputPath = path.join(tmpDir, "input.pdf");
      const pdfBuffer = await fs.readFile(outputPath);
      return pdfBuffer;
    }
    return null;
  } catch (convErr) {
    log.warn("LibreOffice conversion unavailable or failed", {
      error: convErr instanceof Error ? convErr.message : String(convErr),
    });
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

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
 * Renders each page of a PDF document into a lightweight WebP preview image.
 * Yields an array of uploaded storage keys and total preview size.
 */
async function processPdfPages(
  fileId: string,
  originalBuffer: Buffer
): Promise<{
  pageKeys: string[];
  firstPageUrl: string;
  totalSize: number;
  totalPages: number;
  orientation: "LANDSCAPE" | "PORTRAIT";
} | null> {
  try {
    const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(originalBuffer));
    const totalPages = pdf.numPages;
    const pagesToRender = Math.min(totalPages, 30);

    const firstPage = await pdf.getPage(1);
    const firstVp = firstPage.getViewport({ scale: 1 });
    const orientation: "LANDSCAPE" | "PORTRAIT" =
      firstVp.width >= firstVp.height ? "LANDSCAPE" : "PORTRAIT";

    const pageKeys: string[] = [];
    let firstPageUrl = "";
    let totalSize = 0;

    for (let p = 1; p <= pagesToRender; p++) {
      const pageImage = await renderPageAsImage(pdf, p, {
        canvasImport: () => import("@napi-rs/canvas"),
        width: orientation === "LANDSCAPE" ? 1440 : 1000,
        format: "png",
      });

      const webpBuffer = await sharp(Buffer.from(pageImage as Uint8Array))
        .webp({ quality: 55, effort: 4 })
        .toBuffer();

      const pageKey = `hosted-files/previews/${fileId}-page-${p}.webp`;
      const uploadRes = await uploadBufferToStorage({
        key: pageKey,
        buffer: webpBuffer,
        contentType: "image/webp",
      });

      if (uploadRes) {
        pageKeys.push(uploadRes.fileKey);
        if (p === 1) {
          firstPageUrl = uploadRes.publicUrl;
        }
        totalSize += webpBuffer.length;
      }
    }

    if (pageKeys.length > 0) {
      return {
        pageKeys,
        firstPageUrl,
        totalSize,
        totalPages,
        orientation,
      };
    }
    return null;
  } catch (pdfErr) {
    log.warn("Failed to render PDF pages into images, will fallback to badge preview", {
      fileId,
      error: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
    });
    return null;
  }
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
    const isPresentation =
      file.mimeType.includes("presentation") ||
      file.mimeType.includes("powerpoint") ||
      file.originalFilename.toLowerCase().endsWith(".pptx") ||
      file.originalFilename.toLowerCase().endsWith(".ppt");

    // Only skip processing if it is NOT a presentation configured for viewing
    if (!isPresentation || file.displayMode === "DIRECT_RAW") {
      return { success: true };
    }
  }

  await prisma.hostedFile.update({
    where: { id: fileId },
    data: { lowResStatus: "PENDING" },
  });

  try {
    const previewMime = "image/webp";
    const previewExtension = "webp";

    const isImage = file.mimeType.startsWith("image/") && !file.mimeType.includes("svg");
    const isPdf = file.mimeType === "application/pdf";
    const isPresentation =
      file.mimeType.includes("presentation") ||
      file.mimeType.includes("powerpoint") ||
      file.originalFilename.toLowerCase().endsWith(".pptx") ||
      file.originalFilename.toLowerCase().endsWith(".ppt");

    if (isImage) {
      const originalBuffer = await getObjectBuffer(file.fileKey);
      if (!originalBuffer) {
        throw new Error(`Could not fetch original buffer for key ${file.fileKey}`);
      }

      const imgMeta = await sharp(originalBuffer).metadata();
      const orientation: "LANDSCAPE" | "PORTRAIT" =
        (imgMeta.width || 1) >= (imgMeta.height || 1) ? "LANDSCAPE" : "PORTRAIT";

      // Downsample and compress image to high-efficiency WebP
      const previewBuffer = await sharp(originalBuffer)
        .rotate() // auto-orient based on EXIF
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 40, effort: 4 })
        .toBuffer();

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
          pageCount: 1,
          previewPages: [uploadRes.fileKey],
          orientation,
        },
      });

      log.info("Low-res image preview generated successfully", {
        fileId,
        originalSize: file.fileSize,
        previewSize: previewBuffer.length,
        orientation,
      });

      return { success: true };
    }

    if (isPresentation) {
      const originalBuffer = await getObjectBuffer(file.fileKey);
      if (!originalBuffer) {
        throw new Error(`Could not fetch original buffer for key ${file.fileKey}`);
      }

      const pptxInfo = await inspectPptx(originalBuffer);
      const orientation: "LANDSCAPE" | "PORTRAIT" = pptxInfo?.orientation || "LANDSCAPE";

      // Convert presentation to PDF via headless LibreOffice if available
      const convertedPdf = await convertPptxToPdf(originalBuffer);
      if (convertedPdf) {
        const pdfResult = await processPdfPages(file.id, convertedPdf);
        if (pdfResult) {
          await prisma.hostedFile.update({
            where: { id: fileId },
            data: {
              lowResKey: pdfResult.pageKeys[0],
              lowResUrl: pdfResult.firstPageUrl,
              lowResSize: pdfResult.totalSize,
              lowResStatus: "READY",
              pageCount: pdfResult.totalPages,
              previewPages: pdfResult.pageKeys,
              orientation,
            },
          });

          log.info("Presentation slide previews generated successfully", {
            fileId,
            slideCount: pdfResult.totalPages,
            renderedSlides: pdfResult.pageKeys.length,
            totalPreviewSize: pdfResult.totalSize,
            orientation,
          });

          return { success: true };
        }
      }

      // If conversion tool is unavailable or failed, create SVG badge with slide metadata
      const svgBuffer = generateDocumentPreviewSvg(
        file.title,
        "application/vnd.ms-powerpoint",
        file.fileSize
      );
      const previewBuffer = await sharp(svgBuffer).webp({ quality: 80 }).toBuffer();
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
          pageCount: pptxInfo?.slideCount || 1,
          previewPages: [uploadRes.fileKey],
          orientation,
        },
      });

      return { success: true };
    }

    if (isPdf) {
      const originalBuffer = await getObjectBuffer(file.fileKey);
      if (!originalBuffer) {
        throw new Error(`Could not fetch original buffer for key ${file.fileKey}`);
      }

      const pdfResult = await processPdfPages(file.id, originalBuffer);
      if (pdfResult) {
        await prisma.hostedFile.update({
          where: { id: fileId },
          data: {
            lowResKey: pdfResult.pageKeys[0],
            lowResUrl: pdfResult.firstPageUrl,
            lowResSize: pdfResult.totalSize,
            lowResStatus: "READY",
            pageCount: pdfResult.totalPages,
            previewPages: pdfResult.pageKeys,
            orientation: pdfResult.orientation,
          },
        });

        log.info("PDF page previews generated successfully", {
          fileId,
          pageCount: pdfResult.totalPages,
          renderedPages: pdfResult.pageKeys.length,
          totalPreviewSize: pdfResult.totalSize,
          orientation: pdfResult.orientation,
        });

        return { success: true };
      }
    }

    // Fallback for generic documents or unrenderable PDFs: Generate SVG badge
    const svgBuffer = generateDocumentPreviewSvg(file.title, file.mimeType, file.fileSize);
    const previewBuffer = await sharp(svgBuffer).webp({ quality: 80 }).toBuffer();
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
        pageCount: 1,
        previewPages: [uploadRes.fileKey],
      },
    });

    log.info("Document fallback preview generated successfully", {
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
