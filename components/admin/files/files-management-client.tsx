"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UploadCloud,
  FileText,
  FileImage,
  Globe,
  Lock,
  Copy,
  Check,
  Download,
  Trash2,
  RefreshCw,
  Sparkles,
  Eye,
  Edit3,
  Search,
  Loader2,
  LayoutTemplate,
  AlertTriangle,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import type { HostedFileDisplayMode, HostedFileItem } from "@/lib/modules/files/constants";
import {
  deleteHostedFileAction,
  getPrivateDownloadUrlAction,
  regenerateLowResAction,
  toggleFilePrivacyAction,
  updateFileDisplayModeAction,
} from "@/lib/modules/files/actions";
import { FileUploadDialog } from "./file-upload-dialog";
import { EditSlugDialog } from "./edit-slug-dialog";

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

export function FilesManagementClient({
  initialFiles,
  canWrite,
}: FilesManagementClientProps) {
  const router = useRouter();
  const [files, setFiles] = useState<HostedFileItem[]>(initialFiles);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVisibility, setFilterVisibility] = useState<"ALL" | "PUBLIC" | "PRIVATE">("ALL");

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editingSlugFile, setEditingSlugFile] = useState<HostedFileItem | null>(null);
  const [deletingFile, setDeletingFile] = useState<HostedFileItem | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Optimistic update helpers
  const updateFileInState = (updated: HostedFileItem) => {
    setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  };

  const removeFileFromState = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Filtered files
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

  // Privacy switch handler
  const handleTogglePrivacy = (file: HostedFileItem, nextPublic: boolean) => {
    if (!canWrite) return;

    startTransition(async () => {
      // Optimistic update
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, isPublic: nextPublic } : f))
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
            : "File switched to private zero-trust access"
        );
      } else {
        // Rollback
        updateFileInState(file);
        toast.error(res.error || "Failed to toggle visibility");
      }
    });
  };

  // Display Mode change handler
  const handleDisplayModeChange = (file: HostedFileItem, mode: HostedFileDisplayMode) => {
    if (!canWrite) return;

    startTransition(async () => {
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, displayMode: mode } : f))
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
            : "Display mode set to Direct Raw Stream"
        );
      } else {
        updateFileInState(file);
        toast.error(res.error || "Failed to update display mode");
      }
    });
  };

  // Re-generate low-res preview handler
  const handleRegenerateLowRes = (file: HostedFileItem) => {
    if (!canWrite) return;

    startTransition(async () => {
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, lowResStatus: "PENDING" } : f))
      );

      const res = await regenerateLowResAction(file.id);
      if (res.success) {
        toast.success("Low-res preview generation triggered");
      } else {
        toast.error(res.error || "Failed to trigger preview generation");
      }
    });
  };

  // Copy public slug link
  const handleCopyLink = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success("Public link copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  // Authenticated private download
  const handleDownloadPrivate = async (file: HostedFileItem) => {
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
  };

  // Purge / Delete handler
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

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, filename, or slug..."
              className="pl-9 text-xs"
            />
          </div>

          <div className="flex items-center rounded-lg border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setFilterVisibility("ALL")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filterVisibility === "ALL"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({files.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterVisibility("PUBLIC")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filterVisibility === "PUBLIC"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Public ({files.filter((f) => f.isPublic).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterVisibility("PRIVATE")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filterVisibility === "PRIVATE"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Private ({files.filter((f) => !f.isPublic).length})
            </button>
          </div>
        </div>

        {canWrite && (
          <Button
            onClick={() => setUploadDialogOpen(true)}
            className="gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold shadow-xs"
          >
            <UploadCloud className="h-4 w-4" />
            Upload File
          </Button>
        )}
      </div>

      {/* Files Table / List */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/50 text-muted-foreground font-medium">
              <tr>
                <th className="py-3 px-4">File Name & Title</th>
                <th className="py-3 px-3">Access Status</th>
                <th className="py-3 px-3">Public Vanity Slug</th>
                <th className="py-3 px-3">Display Mode</th>
                <th className="py-3 px-3">Fast Preview</th>
                <th className="py-3 px-3 text-right">Views</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <FileText className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">No files found</p>
                      <p className="text-xs">
                        {searchQuery
                          ? "Try adjusting your search criteria."
                          : "Upload your first file to get started."}
                      </p>
                      {canWrite && !searchQuery && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setUploadDialogOpen(true)}
                          className="mt-2"
                        >
                          <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                          Upload File
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => {
                  const isImage = file.mimeType.startsWith("image/");
                  return (
                    <tr
                      key={file.id}
                      className="transition-colors hover:bg-muted/20"
                    >
                      {/* File Details */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            {isImage ? (
                              <FileImage className="h-4 w-4 text-amber-500" />
                            ) : (
                              <FileText className="h-4 w-4 text-blue-500" />
                            )}
                          </div>
                          <div className="min-w-0 max-w-[220px] sm:max-w-[280px]">
                            <p className="font-semibold text-foreground truncate">
                              {file.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {file.originalFilename} &middot; {formatBytes(file.fileSize)}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Access Status & Switch */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={file.isPublic}
                            onChange={(e) => handleTogglePrivacy(file, e.target.checked)}
                            disabled={!canWrite || isPending}
                          />
                          <span
                            className={`flex items-center gap-1 font-medium ${
                              file.isPublic
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {file.isPublic ? (
                              <>
                                <Globe className="h-3 w-3" />
                                Public
                              </>
                            ) : (
                              <>
                                <Lock className="h-3 w-3" />
                                Private
                              </>
                            )}
                          </span>
                        </div>
                      </td>

                      {/* Public Vanity Slug */}
                      <td className="py-3.5 px-3">
                        {file.isPublic && file.slug ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] text-foreground bg-muted/70 px-2 py-0.5 rounded border">
                              /view/{file.slug}
                            </span>
                            {canWrite && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setEditingSlugFile(file)}
                                title="Edit Custom Slug"
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                handleCopyLink(file.publicUrl || `/view/${file.slug}`, file.id)
                              }
                              title="Copy Public Link"
                            >
                              {copiedId === file.id ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">
                            Private (Disabled)
                          </span>
                        )}
                      </td>

                      {/* Display Mode Selector */}
                      <td className="py-3.5 px-3">
                        {file.isPublic ? (
                          <NativeSelect
                            value={file.displayMode}
                            onChange={(e) =>
                              handleDisplayModeChange(
                                file,
                                e.target.value as HostedFileDisplayMode
                              )
                            }
                            disabled={!canWrite || isPending}
                            className="h-7 text-[11px] max-w-[150px]"
                          >
                            <option value="IN_APP_VIEWER">In-App Viewer</option>
                            <option value="RENDER_AS_PAGE">Render as Page</option>
                            <option value="DIRECT_RAW">Direct Raw Access</option>
                          </NativeSelect>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">&mdash;</span>
                        )}
                      </td>

                      {/* Fast Preview (Low-Res Status) */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {file.lowResStatus === "READY" ? (
                            <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                              <Sparkles className="h-2.5 w-2.5" />
                              Ready
                              {file.lowResSize ? ` (${formatBytes(file.lowResSize)})` : ""}
                            </Badge>
                          ) : file.lowResStatus === "PENDING" ? (
                            <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              In Queue
                            </Badge>
                          ) : file.lowResStatus === "FAILED" ? (
                            <Badge variant="outline" className="text-[10px] gap-1 border-destructive/40 text-destructive bg-destructive/10">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Failed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              None
                            </Badge>
                          )}
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              onClick={() => handleRegenerateLowRes(file)}
                              title={
                                file.lowResStatus === "FAILED"
                                  ? "Retry Fast Preview Generation (Enqueues Background Job)"
                                  : "Regenerate Fast Preview"
                              }
                            >
                              <RefreshCw className="h-2.5 w-2.5" />
                            </Button>
                          )}
                        </div>
                      </td>

                      {/* Views Count */}
                      <td className="py-3.5 px-3 text-right font-mono text-[11px] text-muted-foreground">
                        {file.viewsCount}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {file.isPublic && file.slug ? (
                            <>
                              <Link
                                href={`/view/${file.slug}`}
                                target="_blank"
                                className={buttonVariants({
                                  variant: "outline",
                                  size: "sm",
                                  className: "h-7 px-2 text-[11px] gap-1",
                                })}
                                title="Open Branded In-App Viewer"
                              >
                                <Eye className="h-3 w-3" />
                                View
                              </Link>
                              <Link
                                href={`/view/${file.slug}?view=page`}
                                target="_blank"
                                className={buttonVariants({
                                  variant: "outline",
                                  size: "sm",
                                  className: "h-7 px-2 text-[11px] gap-1 border-[#EFCE02]/50 hover:bg-[#EFCE02]/10",
                                })}
                                title="Render as a Page (Full Screen Asset)"
                              >
                                <LayoutTemplate className="h-3 w-3 text-[#EFCE02]" />
                                Page
                              </Link>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              onClick={() => handleDownloadPrivate(file)}
                              disabled={downloadingId === file.id}
                            >
                              {downloadingId === file.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              Download
                            </Button>
                          )}

                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => setDeletingFile(file)}
                              title="Delete File"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Dialog */}
      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUploaded={(newFile) => {
          setFiles((prev) => [newFile, ...prev]);
          router.refresh();
        }}
      />

      {/* Edit Vanity Slug Dialog */}
      <EditSlugDialog
        file={editingSlugFile}
        open={Boolean(editingSlugFile)}
        onOpenChange={(v) => {
          if (!v) setEditingSlugFile(null);
        }}
        onSuccess={(updated) => {
          updateFileInState(updated);
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
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
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
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Purge Asset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
