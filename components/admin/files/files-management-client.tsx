"use client";

import { useState, useTransition, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createColumnHelper } from "@tanstack/react-table";
import {
  UploadCloud,
  FileText,
  FileImage,
  FolderUp,
  Globe,
  HardDrive,
  Lock,
  Copy,
  Check,
  CheckCircle2,
  Download,
  Trash2,
  RefreshCw,
  RotateCcw,
  Eye,
  Search,
  Loader2,
  LayoutTemplate,
  AlertTriangle,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { FilterBar } from "@/components/admin/filter-bar";
import { InspectorSheet } from "@/components/admin/inspector-sheet";
import { PageHeader, PageShell } from "@/components/admin/page-shell";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { TableRowActions } from "@/components/admin/table-row-actions";
import type { HostedFileDisplayMode, HostedFileItem } from "@/lib/modules/files/constants";
import {
  deleteHostedFileAction,
  getPrivateDownloadUrlAction,
  regenerateLowResAction,
  toggleFilePrivacyAction,
  updateFileDisplayModeAction,
  updateFileSlugAction,
} from "@/lib/modules/files/actions";
import { SLUG_REGEX } from "@/lib/modules/files/validation";
import { cn } from "@/lib/utils";
import { FileUploadDialog } from "./file-upload-dialog";

interface FilesManagementClientProps {
  initialFiles: HostedFileItem[];
  canWrite: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatStorage(bytes: number): string {
  if (bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb > 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, HostedFileItem>();

export function FilesManagementClient({
  initialFiles,
  canWrite,
}: FilesManagementClientProps) {
  const router = useRouter();
  const [files, setFiles] = useState<HostedFileItem[]>(initialFiles);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVisibility, setFilterVisibility] = useState<"ALL" | "PUBLIC" | "PRIVATE">("ALL");

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [inspectedFileId, setInspectedFileId] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<HostedFileItem | null>(null);
  const [draftSlug, setDraftSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inspectedFile = useMemo(
    () => (inspectedFileId ? files.find((f) => f.id === inspectedFileId) ?? null : null),
    [files, inspectedFileId],
  );

  useEffect(() => {
    setDraftSlug(inspectedFile?.slug ?? "");
    setSlugError(null);
  }, [inspectedFile?.id, inspectedFile?.slug]);

  const isSlugDirty = Boolean(
    inspectedFile?.isPublic &&
      draftSlug.trim() !== (inspectedFile.slug ?? ""),
  );

  const handleSaveSlug = () => {
    if (!inspectedFile || !canWrite) return;
    const trimmed = draftSlug.trim();
    if (!SLUG_REGEX.test(trimmed)) {
      setSlugError("Use 3–64 lowercase letters, numbers, or hyphens.");
      return;
    }
    setSlugError(null);

    startTransition(async () => {
      const res = await updateFileSlugAction({
        fileId: inspectedFile.id,
        slug: trimmed,
      });
      if (res.success) {
        updateFileInState(res.data);
        toast.success("Public link updated");
        router.refresh();
      } else {
        setSlugError(res.error || "Failed to update link");
        toast.error(res.error || "Failed to update link");
      }
    });
  };

  const updateFileInState = useCallback((updated: HostedFileItem) => {
    setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, []);

  const removeFileFromState = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setInspectedFileId((curr) => (curr === id ? null : curr));
  }, []);

  const publicCount = useMemo(() => files.filter((f) => f.isPublic).length, [files]);
  const privateCount = files.length - publicCount;
  const totalStorage = useMemo(
    () => files.reduce((acc, f) => acc + f.fileSize + (f.lowResSize || 0), 0),
    [files],
  );
  const totalViews = useMemo(
    () => files.reduce((acc, f) => acc + f.viewsCount, 0),
    [files],
  );

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      if (filterVisibility === "PUBLIC" && !file.isPublic) return false;
      if (filterVisibility === "PRIVATE" && file.isPublic) return false;

      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = file.title.toLowerCase().includes(q);
        const matchName = file.originalFilename.toLowerCase().includes(q);
        const matchSlug = file.slug ? file.slug.toLowerCase().includes(q) : false;
        return matchTitle || matchName || matchSlug;
      }

      return true;
    });
  }, [files, filterVisibility, searchQuery]);

  const handleTogglePrivacy = useCallback(
    (file: HostedFileItem, nextPublic: boolean) => {
      if (!canWrite) return;

      startTransition(async () => {
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, isPublic: nextPublic } : f)),
        );

        const res = await toggleFilePrivacyAction({
          fileId: file.id,
          isPublic: nextPublic,
        });

        if (res.success) {
          updateFileInState(res.data);
          toast.success(
            nextPublic
              ? `File published with vanity link /view/${res.data.slug}`
              : "File switched to private zero-trust access",
          );
        } else {
          updateFileInState(file);
          toast.error(res.error || "Failed to toggle visibility");
        }
      });
    },
    [canWrite, updateFileInState],
  );

  const handleDisplayModeChange = useCallback(
    (file: HostedFileItem, mode: HostedFileDisplayMode) => {
      if (!canWrite) return;

      startTransition(async () => {
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, displayMode: mode } : f)),
        );

        const res = await updateFileDisplayModeAction({
          fileId: file.id,
          displayMode: mode,
        });

        if (res.success) {
          updateFileInState(res.data);
          toast.success(
            mode === "IN_APP_VIEWER"
              ? "Display mode set to In-App Viewer"
              : mode === "RENDER_AS_PAGE"
                ? "Display mode set to Render as Page"
                : "Display mode set to Direct Raw Access",
          );
        } else {
          updateFileInState(file);
          toast.error(res.error || "Failed to update display mode");
        }
      });
    },
    [canWrite, updateFileInState],
  );

  const handleRegenerateLowRes = useCallback(
    (file: HostedFileItem) => {
      if (!canWrite) return;

      startTransition(async () => {
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, lowResStatus: "PENDING" } : f)),
        );

        const res = await regenerateLowResAction(file.id);
        if (res.success) {
          toast.success("Low-res preview generation triggered");
        } else {
          toast.error(res.error || "Failed to trigger preview generation");
        }
      });
    },
    [canWrite],
  );

  const handleCopyLink = useCallback(async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success("Public link copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  }, []);

  const handleDownloadPrivate = useCallback(async (file: HostedFileItem) => {
    setDownloadingId(file.id);
    try {
      const res = await getPrivateDownloadUrlAction(file.id);
      if (res.success) {
        const link = document.createElement("a");
        link.href = res.data;
        link.download = file.originalFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        toast.error(res.error || "Failed to get download URL");
      }
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const handleConfirmDelete = () => {
    if (!deletingFile || !canWrite) return;

    startTransition(async () => {
      const fileId = deletingFile.id;
      const res = await deleteHostedFileAction(fileId);

      if (res.success) {
        removeFileFromState(fileId);
        toast.success("File and all preview copies permanently purged from storage.");
        setDeletingFile(null);
      } else {
        toast.error(res.error || "Failed to purge file");
      }
    });
  };

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "file",
          header: "File",
          cell: ({ row }) => {
            const file = row.original;
            const isImage = file.mimeType.startsWith("image/");
            return (
              <div className="flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
                  {isImage ? (
                    <FileImage className="size-4 text-primary" />
                  ) : (
                    <FileText className="size-4 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <div className="min-w-0 max-w-[220px] sm:max-w-[280px]">
                  <p className="truncate font-medium text-foreground">{file.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {file.originalFilename} &middot; {formatBytes(file.fileSize)}
                  </p>
                </div>
              </div>
            );
          },
        }),
        columnHelper.display({
          id: "access",
          header: "Access",
          cell: ({ row }) => {
            const file = row.original;
            return (
              <StatusBadge tone={file.isPublic ? "good" : "neutral"} dot>
                {file.isPublic ? "Public" : "Private"}
              </StatusBadge>
            );
          },
        }),
        columnHelper.display({
          id: "slug",
          header: "Vanity Link",
          cell: ({ row }) => {
            const file = row.original;
            if (!file.isPublic || !file.slug) {
              return <span className="text-xs text-muted-foreground">&mdash;</span>;
            }
            return (
              <span className="inline-block max-w-[180px] truncate rounded-md border border-border/70 bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-foreground">
                /view/{file.slug}
              </span>
            );
          },
        }),
        columnHelper.display({
          id: "preview",
          header: "Fast Preview",
          cell: ({ row }) => {
            const file = row.original;
            if (file.lowResStatus === "READY") {
              return (
                <StatusBadge tone="good">
                  <CheckCircle2 className="size-3" />
                  Ready{file.lowResSize ? ` (${formatBytes(file.lowResSize)})` : ""}
                </StatusBadge>
              );
            }
            if (file.lowResStatus === "PENDING") {
              return (
                <StatusBadge tone="warning">
                  <Loader2 className="size-3 animate-spin" />
                  In Queue
                </StatusBadge>
              );
            }
            if (file.lowResStatus === "FAILED") {
              return (
                <StatusBadge tone="critical">
                  <AlertTriangle className="size-3" />
                  Failed
                </StatusBadge>
              );
            }
            return <StatusBadge tone="neutral">None</StatusBadge>;
          },
        }),
        columnHelper.accessor("viewsCount", {
          header: () => <div className="text-right">Views</div>,
          cell: (info) => (
            <div className="text-right font-mono text-xs tabular-nums text-muted-foreground">
              {info.getValue()}
            </div>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => {
            const file = row.original;
            return (
              <div data-prevent-row-click>
                <TableRowActions
                  actions={[
                    file.isPublic && file.slug
                      ? {
                          id: "copy",
                          label: "Copy public link",
                          icon: Copy,
                          onClick: () =>
                            handleCopyLink(file.publicUrl || `/view/${file.slug}`, file.id),
                        }
                      : null,
                    file.isPublic && file.slug
                      ? {
                          id: "open",
                          label: "Open viewer",
                          icon: Globe,
                          href: `/view/${file.slug}`,
                        }
                      : {
                          id: "download",
                          label: downloadingId === file.id ? "Downloading..." : "Download file",
                          icon: Download,
                          disabled: downloadingId === file.id,
                          onClick: () => handleDownloadPrivate(file),
                        },
                    canWrite
                      ? {
                          id: "delete",
                          label: "Purge file",
                          icon: Trash2,
                          variant: "destructive",
                          onClick: () => setDeletingFile(file),
                        }
                      : null,
                  ]}
                />
              </div>
            );
          },
        }),
      ]),
    [canWrite, downloadingId, handleCopyLink, handleDownloadPrivate],
  );

  return (
    <PageShell>
      <PageHeader
        title="Hosted Files"
        description="Zero-trust file hosting with custom vanity URLs, display modes, and progressive dual-resolution viewing."
        actions={
          canWrite ? (
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setUploadDialogOpen(true)}
            >
              <UploadCloud className="size-4" />
              <span>Upload File</span>
            </Button>
          ) : undefined
        }
      />

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        <StatCard
          label="Total Files"
          value={files.length}
          icon={FolderUp}
          subtext="Active assets in storage"
        />
        <StatCard
          label="Public Links"
          value={publicCount}
          icon={Globe}
          tone="good"
          subtext="Live with vanity slugs"
        />
        <StatCard
          label="Private Files"
          value={privateCount}
          icon={Lock}
          tone="info"
          subtext="Restricted to admins"
        />
        <StatCard
          label="Storage & Views"
          value={formatStorage(totalStorage)}
          icon={HardDrive}
          tone="brand"
          subtext={`${totalViews} total views tracked`}
        />
      </div>

      {/* Unified Filter Bar */}
      <FilterBar
        hasActiveFilters={filterVisibility !== "ALL"}
        search={
          <div className="relative w-full sm:w-64 md:w-72 shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, filename, or slug..."
              className="h-9 pl-8 text-xs"
            />
          </div>
        }
        filters={
          <>
            <NativeSelect
              id="files-visibility-filter"
              value={filterVisibility}
              onChange={(e) =>
                setFilterVisibility(e.target.value as "ALL" | "PUBLIC" | "PRIVATE")
              }
              className="h-9 text-xs"
              containerClassName="w-full sm:w-fit sm:min-w-[140px] sm:shrink-0"
            >
              <option value="ALL">All files ({files.length})</option>
              <option value="PUBLIC">Public ({publicCount})</option>
              <option value="PRIVATE">Private ({privateCount})</option>
            </NativeSelect>

            {(searchQuery || filterVisibility !== "ALL") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs"
                onClick={() => {
                  setSearchQuery("");
                  setFilterVisibility("ALL");
                }}
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            )}
          </>
        }
      />

      {/* Unified DataTable */}
      <DataTable
        columns={columns}
        data={filteredFiles}
        ariaLabel="Hosted files"
        pageSize={20}
        emptyMessage={
          searchQuery
            ? "No hosted files match your search criteria."
            : "Upload your first file to start hosting assets."
        }
        emptyAction={
          canWrite && !searchQuery ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setUploadDialogOpen(true)}>
              <UploadCloud className="size-3.5" />
              Upload File
            </Button>
          ) : undefined
        }
        onRowClick={(file) => setInspectedFileId(file.id)}
      />

      {/* File Inspector Side Sheet */}
      <InspectorSheet
        open={Boolean(inspectedFile)}
        onOpenChange={(open) => !open && setInspectedFileId(null)}
        title={inspectedFile?.title ?? "File Details"}
        description={
          inspectedFile
            ? `${inspectedFile.originalFilename} · ${formatBytes(inspectedFile.fileSize)}`
            : undefined
        }
        badge={
          inspectedFile ? (
            <StatusBadge tone={inspectedFile.isPublic ? "good" : "neutral"} dot>
              {inspectedFile.isPublic ? "Public" : "Private"}
            </StatusBadge>
          ) : undefined
        }
        footer={
          inspectedFile ? (
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setInspectedFileId(null)}
              >
                Close
              </Button>
              {canWrite && inspectedFile.isPublic && (
                <Button
                  type="button"
                  size="sm"
                  disabled={!isSlugDirty || isPending}
                  onClick={handleSaveSlug}
                >
                  {isPending && <Loader2 className="size-3.5 animate-spin" />}
                  Save changes
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {inspectedFile && (
          <div className="space-y-5 text-sm">
            {/* Access & Inline Vanity Link */}
            <div className="space-y-4 rounded-xl border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Public Access</p>
                  <p className="text-xs text-muted-foreground">
                    Allow anyone with the vanity link to view this file.
                  </p>
                </div>
                <Switch
                  checked={inspectedFile.isPublic}
                  onChange={(e) => handleTogglePrivacy(inspectedFile, e.target.checked)}
                  disabled={!canWrite || isPending}
                />
              </div>

              {inspectedFile.isPublic && inspectedFile.slug ? (
                <div className="space-y-4 border-t border-border/60 pt-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="inspector-vanity-slug"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Public Link
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex min-w-0 flex-1 items-center rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                        <span className="shrink-0 select-none border-r border-border/70 bg-muted/50 px-2.5 py-2 font-mono text-xs text-muted-foreground">
                          /view/
                        </span>
                        <Input
                          id="inspector-vanity-slug"
                          value={draftSlug}
                          onChange={(e) => {
                            const sanitized = e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, "-")
                              .replace(/-{2,}/g, "-");
                            setDraftSlug(sanitized);
                            setSlugError(null);
                          }}
                          disabled={!canWrite || isPending}
                          placeholder="custom-file-link"
                          className="h-8 border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
                        onClick={() =>
                          handleCopyLink(
                            inspectedFile.publicUrl || `/view/${inspectedFile.slug}`,
                            inspectedFile.id,
                          )
                        }
                      >
                        {copiedId === inspectedFile.id ? (
                          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        Copy
                      </Button>
                    </div>
                    {slugError && (
                      <p className="text-xs text-destructive">{slugError}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Public Display Mode
                    </label>
                    <NativeSelect
                      value={inspectedFile.displayMode}
                      onChange={(e) =>
                        handleDisplayModeChange(
                          inspectedFile,
                          e.target.value as HostedFileDisplayMode,
                        )
                      }
                      disabled={!canWrite || isPending}
                      className="h-9 text-xs"
                    >
                      <option value="IN_APP_VIEWER">In-App Viewer</option>
                      <option value="RENDER_AS_PAGE">Render as Page</option>
                      <option value="DIRECT_RAW">Direct Raw Access</option>
                    </NativeSelect>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Link
                      href={`/view/${inspectedFile.slug}`}
                      target="_blank"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5 text-xs")}
                    >
                      <Eye className="size-3.5" />
                      Open Viewer
                    </Link>
                    <Link
                      href={`/view/${inspectedFile.slug}?view=page`}
                      target="_blank"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5 text-xs")}
                    >
                      <LayoutTemplate className="size-3.5" />
                      Render as Page
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="border-t border-border/60 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => handleDownloadPrivate(inspectedFile)}
                    disabled={downloadingId === inspectedFile.id}
                  >
                    {downloadingId === inspectedFile.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    Download Private File
                  </Button>
                </div>
              )}
            </div>

            {/* Fast Preview & Stats */}
            <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">Fast Preview Copy</p>
                  <p className="text-xs text-muted-foreground">
                    Progressive low-res asset for instant mobile loading.
                  </p>
                </div>
                {canWrite && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => handleRegenerateLowRes(inspectedFile)}
                    disabled={isPending}
                  >
                    <RefreshCw className="size-3" />
                    Regenerate
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Preview Status</p>
                  <p className="mt-1 font-medium text-foreground">{inspectedFile.lowResStatus}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Views</p>
                  <p className="mt-1 font-mono font-medium tabular-nums text-foreground">
                    {inspectedFile.viewsCount}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Original Size</p>
                  <p className="mt-1 font-mono text-foreground">{formatBytes(inspectedFile.fileSize)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">MIME Type</p>
                  <p className="mt-1 truncate font-mono text-foreground">{inspectedFile.mimeType}</p>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            {canWrite && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                <div>
                  <p className="text-xs font-semibold text-destructive">Danger Zone</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete this file and release its vanity link.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeletingFile(inspectedFile)}
                >
                  <Trash2 className="size-3.5" />
                  Purge
                </Button>
              </div>
            )}
          </div>
        )}
      </InspectorSheet>

      {/* Upload Dialog */}
      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUploaded={(newFile) => {
          setFiles((prev) => [newFile, ...prev]);
          router.refresh();
        }}
      />

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={Boolean(deletingFile)}
        onOpenChange={(v) => {
          if (!v) setDeletingFile(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-5" />
              Purge Hosted File
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{" "}
              <strong className="text-foreground">{deletingFile?.title}</strong>? This action
              cannot be undone. Both the original asset and all generated low-res preview copies
              will be permanently purged from object storage, and any claimed vanity slug will be released.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isPending}
              className="bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Purge Asset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
