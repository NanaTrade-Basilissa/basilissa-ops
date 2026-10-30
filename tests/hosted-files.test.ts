import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HostedFile } from "@prisma/client";
import {
  isReservedSlug,
  SLUG_REGEX,
  slugSchema,
  createFileRecordSchema,
} from "@/lib/modules/files/validation";
import {
  isSlugAvailable,
  generateUniqueSlug,
  deleteHostedFile,
  resolvePublicFileBySlug,
} from "@/lib/modules/files/server";
import { prisma } from "@/lib/platform/prisma";
import { deleteFromStorage } from "@/lib/platform/r2";

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    hostedFile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/platform/env", () => ({
  getEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://ops.basilissagh.com",
  }),
}));

vi.mock("@/lib/platform/r2", () => ({
  createPresignedDownloadUrl: vi.fn().mockResolvedValue("https://s3.example.com/download"),
  deleteFromStorage: vi.fn().mockResolvedValue(true),
  resolveStorageUrl: vi.fn().mockImplementation((url) => Promise.resolve(url)),
  getObjectBuffer: vi.fn(),
  uploadBufferToStorage: vi.fn(),
}));

describe("Hosted Files - Validation & Slugs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enforces valid slug syntax via SLUG_REGEX", () => {
    expect(SLUG_REGEX.test("my-doc")).toBe(true);
    expect(SLUG_REGEX.test("q1-review-2026")).toBe(true);
    expect(SLUG_REGEX.test("simple")).toBe(true);

    // Invalid formats
    expect(SLUG_REGEX.test("-leading-hyphen")).toBe(false);
    expect(SLUG_REGEX.test("trailing-hyphen-")).toBe(false);
    expect(SLUG_REGEX.test("double--hyphens")).toBe(false);
    expect(SLUG_REGEX.test("UPPERCASE")).toBe(false);
    expect(SLUG_REGEX.test("spaces in slug")).toBe(false);
    expect(SLUG_REGEX.test("special@chars!")).toBe(false);
  });

  it("identifies reserved system slugs", () => {
    expect(isReservedSlug("admin")).toBe(true);
    expect(isReservedSlug("api")).toBe(true);
    expect(isReservedSlug("view")).toBe(true);
    expect(isReservedSlug("auth")).toBe(true);
    expect(isReservedSlug("login")).toBe(true);
    expect(isReservedSlug("not-reserved-custom-slug")).toBe(false);
  });

  it("rejects reserved slugs through slugSchema validation", () => {
    const valid = slugSchema.safeParse("custom-report-2026");
    expect(valid.success).toBe(true);

    const reserved = slugSchema.safeParse("admin");
    expect(reserved.success).toBe(false);
    if (!reserved.success) {
      expect(reserved.error.issues[0]?.message).toContain("reserved");
    }
  });

  it("checks slug availability correctly against database", async () => {
    // 1. Reserved slug
    const resReserved = await isSlugAvailable("admin");
    expect(resReserved.available).toBe(false);
    expect(resReserved.reason).toContain("reserved system path");

    // 2. Invalid syntax
    const resInvalid = await isSlugAvailable("INVALID SLUG");
    expect(resInvalid.available).toBe(false);

    // 3. Already taken slug
    vi.mocked(prisma.hostedFile.findUnique).mockResolvedValueOnce({
      id: "file-existing",
    } as unknown as HostedFile);

    const resTaken = await isSlugAvailable("active-campaign");
    expect(resTaken.available).toBe(false);
    expect(resTaken.reason).toContain("already claimed");

    // 4. Same file claiming its own slug
    vi.mocked(prisma.hostedFile.findUnique).mockResolvedValueOnce({
      id: "file-123",
    } as unknown as HostedFile);

    const resSelf = await isSlugAvailable("active-campaign", "file-123");
    expect(resSelf.available).toBe(true);

    // 5. Unclaimed slug
    vi.mocked(prisma.hostedFile.findUnique).mockResolvedValueOnce(null);
    const resFree = await isSlugAvailable("brand-guidelines");
    expect(resFree.available).toBe(true);
  });

  it("generates URL-safe unique slugs", async () => {
    vi.mocked(prisma.hostedFile.findUnique).mockResolvedValueOnce(null);

    const slug = await generateUniqueSlug("Basilissa Ghana HR Policies 2026");
    expect(slug).toBeDefined();
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(slug.startsWith("basilissa-ghana-hr-policies-2026")).toBe(true);
  });

  it("supports RENDER_AS_PAGE display mode preference", () => {
    const result = createFileRecordSchema.safeParse({
      title: "Main Restaurant Menu",
      originalFilename: "menu_q4_2026.pdf",
      mimeType: "application/pdf",
      fileSize: 2048576,
      fileKey: "hosted-files/originals/123-menu.pdf",
      fileUrl: "https://s3.example.com/hosted-files/originals/123-menu.pdf",
      displayMode: "RENDER_AS_PAGE",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayMode).toBe("RENDER_AS_PAGE");
    }
  });

  it("validates file create schema with correct defaults", () => {
    const result = createFileRecordSchema.safeParse({
      title: "Menu Brochure",
      originalFilename: "menu_2026.pdf",
      mimeType: "application/pdf",
      fileSize: 1048576,
      fileKey: "hosted-files/originals/123-menu.pdf",
      fileUrl: "https://s3.example.com/hosted-files/originals/123-menu.pdf",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isPublic).toBe(false); // Zero-trust private by default!
      expect(result.data.displayMode).toBe("IN_APP_VIEWER");
      expect(result.data.generateLowRes).toBe(true);
    }
  });

  it("purges both original asset and low-res copies from storage upon delete", async () => {
    vi.mocked(prisma.hostedFile.findUnique).mockResolvedValueOnce({
      id: "file-purge-1",
      fileKey: "hosted-files/originals/file-purge-1.png",
      lowResKey: "hosted-files/previews/file-purge-1-lowres.webp",
      slug: "brand-logo",
    } as unknown as HostedFile);

    vi.mocked(prisma.hostedFile.delete).mockResolvedValueOnce({
      id: "file-purge-1",
    } as unknown as HostedFile);

    const deleted = await deleteHostedFile("file-purge-1");
    expect(deleted).toBe(true);

    expect(deleteFromStorage).toHaveBeenCalledWith("hosted-files/originals/file-purge-1.png");
    expect(deleteFromStorage).toHaveBeenCalledWith("hosted-files/previews/file-purge-1-lowres.webp");
    expect(prisma.hostedFile.delete).toHaveBeenCalledWith({ where: { id: "file-purge-1" } });
  });

  it("resolves public files and refuses private files at public route", async () => {
    // 1. Private file should resolve to null (404)
    vi.mocked(prisma.hostedFile.findUnique).mockResolvedValueOnce({
      id: "private-1",
      slug: "secret-doc",
      isPublic: false,
    } as unknown as HostedFile);

    const privateRes = await resolvePublicFileBySlug("secret-doc");
    expect(privateRes).toBeNull();

    // 2. Public file resolves and triggers view count increment
    vi.mocked(prisma.hostedFile.findUnique).mockResolvedValueOnce({
      id: "public-1",
      title: "Public Brochure",
      originalFilename: "brochure.pdf",
      mimeType: "application/pdf",
      fileSize: 500000,
      fileKey: "hosted-files/originals/brochure.pdf",
      fileUrl: "https://s3.example.com/brochure.pdf",
      isPublic: true,
      slug: "public-brochure",
      displayMode: "IN_APP_VIEWER",
      generateLowRes: true,
      lowResKey: "hosted-files/previews/brochure-lowres.webp",
      lowResUrl: "https://s3.example.com/brochure-lowres.webp",
      lowResSize: 45000,
      lowResStatus: "READY",
      uploadedById: "user-1",
      uploadedBy: { id: "user-1", name: "Admin", email: "admin@basilissa.com" },
      viewsCount: 10,
      lastViewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as HostedFile & { uploadedBy: { id: string; name: string; email: string } });

    vi.mocked(prisma.hostedFile.update).mockResolvedValueOnce({} as unknown as HostedFile);

    const publicRes = await resolvePublicFileBySlug("public-brochure");
    expect(publicRes).not.toBeNull();
    expect(publicRes?.file.slug).toBe("public-brochure");
    expect(publicRes?.file.displayMode).toBe("IN_APP_VIEWER");
    expect(publicRes?.highResResolvedUrl).toBe("https://s3.example.com/brochure.pdf");
    expect(publicRes?.lowResResolvedUrl).toBe("https://s3.example.com/brochure-lowres.webp");
    expect(prisma.hostedFile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "public-1" },
        data: expect.objectContaining({ viewsCount: { increment: 1 } }),
      })
    );
  });

  it("inspects PPTX orientation and slide count accurately", async () => {
    const { inspectPptx } = await import("@/lib/modules/files/processor");
    const JSZip = (await import("jszip")).default;

    // 1. Landscape 16:9 presentation mock (cx > cy)
    const landscapeZip = new JSZip();
    landscapeZip.file(
      "ppt/presentation.xml",
      `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`
    );
    landscapeZip.file("ppt/slides/slide1.xml", `<p:sld/>`);
    landscapeZip.file("ppt/slides/slide2.xml", `<p:sld/>`);
    landscapeZip.file("ppt/slides/slide3.xml", `<p:sld/>`);

    const landscapeBuf = await landscapeZip.generateAsync({ type: "nodebuffer" });
    const landscapeRes = await inspectPptx(landscapeBuf);

    expect(landscapeRes).not.toBeNull();
    expect(landscapeRes?.orientation).toBe("LANDSCAPE");
    expect(landscapeRes?.slideCount).toBe(3);

    // 2. Portrait presentation mock (cy > cx, vertical menu board)
    const portraitZip = new JSZip();
    portraitZip.file(
      "ppt/presentation.xml",
      `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="6858000" cy="12192000"/></p:presentation>`
    );
    portraitZip.file("ppt/slides/slide1.xml", `<p:sld/>`);
    portraitZip.file("ppt/slides/slide2.xml", `<p:sld/>`);

    const portraitBuf = await portraitZip.generateAsync({ type: "nodebuffer" });
    const portraitRes = await inspectPptx(portraitBuf);

    expect(portraitRes).not.toBeNull();
    expect(portraitRes?.orientation).toBe("PORTRAIT");
    expect(portraitRes?.slideCount).toBe(2);
  });
});
