export type HostedFileDisplayMode = "IN_APP_VIEWER" | "DIRECT_RAW" | "RENDER_AS_PAGE";
export type LowResPreviewStatus = "NONE" | "PENDING" | "READY" | "FAILED";

export const RESERVED_SLUGS: readonly string[] = [
  "admin",
  "api",
  "view",
  "auth",
  "login",
  "logout",
  "reset-password",
  "forgot-password",
  "delete-account",
  "docs",
  "api-docs",
  "support",
  "privacy",
  "feedback",
  "feedbacks",
  "aptitude",
  "assessment",
  "training",
  "attendance",
  "meals",
  "devices",
  "employees",
  "branches",
  "settings",
  "security",
  "roles",
  "users",
  "payroll",
  "leave",
  "shifts",
  "holidays",
  "jobs",
  "email-queue",
  "announcements",
  "iclock",
  "favicon",
  "static",
  "public",
  "health",
  "v1",
] as const;

export type HostedFileItem = {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  fileKey: string;
  fileUrl: string;
  isPublic: boolean;
  slug: string | null;
  displayMode: HostedFileDisplayMode;
  generateLowRes: boolean;
  lowResKey: string | null;
  lowResUrl: string | null;
  lowResSize: number | null;
  lowResStatus: LowResPreviewStatus;
  pageCount?: number | null;
  previewPages?: string[] | null;
  orientation?: "LANDSCAPE" | "PORTRAIT" | null;
  uploadedById: string;
  uploaderName: string;
  uploaderEmail: string;
  viewsCount: number;
  lastViewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  publicUrl: string | null;
  authenticatedDownloadUrl?: string | null;
};
