"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import {
  UploadCloud,
  FileText,
  FileImage,
  Loader2,
  X,
  Lock,
  Globe,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { NativeSelect } from "@/components/ui/native-select";
import type { HostedFileDisplayMode, HostedFileItem } from "@/lib/modules/files/constants";
import { createHostedFileAction } from "@/lib/modules/files/actions";

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (file: HostedFileItem) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function FileUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: FileUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [customSlug, setCustomSlug] = useState("");
  const [displayMode, setDisplayMode] = useState<HostedFileDisplayMode>("IN_APP_VIEWER");
  const [generateLowRes, setGenerateLowRes] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const resetForm = () => {
    setSelectedFile(null);
    setTitle("");
    setIsPublic(false);
    setCustomSlug("");
    setDisplayMode("IN_APP_VIEWER");
    setGenerateLowRes(true);
    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    setTitle(nameWithoutExt);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please choose a file to upload");
      return;
    }

    const fileTitle = title.trim() || selectedFile.name;
    setUploading(true);
    setUploadProgress(10);

    try {
      // Step 1: Request presigned upload URL
      const presignRes = await fetch("/api/admin/files/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: selectedFile.type || "application/octet-stream",
        }),
      });

      const presignData = await presignRes.json();

      if (!presignRes.ok) {
        throw new Error(presignData.error || "Failed to initialize upload.");
      }

      setUploadProgress(30);

      // If presigned S3/R2 upload is configured and available
      if (presignData.configured && !presignData.useFallback && presignData.uploadUrl) {
        // Direct browser PUT to object storage with progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presignData.uploadUrl, true);
          xhr.setRequestHeader("Content-Type", selectedFile.type || "application/octet-stream");

          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              const pct = Math.round(30 + (evt.loaded / evt.total) * 50);
              setUploadProgress(pct);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Storage PUT failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Direct upload network error."));
          xhr.send(selectedFile);
        });

        setUploadProgress(85);

        // Register file record in database
        const recordRes = await createHostedFileAction({
          title: fileTitle,
          originalFilename: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          fileSize: selectedFile.size,
          fileKey: presignData.fileKey,
          fileUrl: presignData.publicUrl,
          isPublic,
          customSlug: isPublic && customSlug.trim() ? customSlug.trim() : undefined,
          displayMode,
          generateLowRes,
        });

        if (!recordRes.success) {
          throw new Error(recordRes.error);
        }

        setUploadProgress(100);
        toast.success("File uploaded and hosted successfully!");
        onUploaded(recordRes.data);
        resetForm();
        onOpenChange(false);
      } else {
        // Server multipart fallback
        setUploadProgress(40);
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("title", fileTitle);
        formData.append("isPublic", String(isPublic));
        if (isPublic && customSlug.trim()) {
          formData.append("customSlug", customSlug.trim());
        }
        formData.append("displayMode", displayMode);
        formData.append("generateLowRes", String(generateLowRes));

        const fallbackRes = await fetch("/api/admin/files/upload-fallback", {
          method: "POST",
          body: formData,
        });

        const fallbackData = await fallbackRes.json();
        if (!fallbackRes.ok || !fallbackData.success) {
          throw new Error(fallbackData.error || "Upload fallback failed");
        }

        setUploadProgress(100);
        toast.success("File uploaded and hosted successfully!");
        onUploaded(fallbackData.file);
        resetForm();
        onOpenChange(false);
      }
    } catch (err) {
      console.error("Upload error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const isImage = selectedFile?.type.startsWith("image/");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!uploading) {
          if (!v) resetForm();
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-amber-500" />
            Upload & Host File
          </DialogTitle>
          <DialogDescription>
            Files default to secure private access. Configure public access, vanity slug, and progressive optimization below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File Picker / Drop Zone */}
          {!selectedFile ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.[0]) {
                  handleFileChange(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border hover:border-muted-foreground/50 hover:bg-muted/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 mb-3">
                <UploadCloud className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                Click to browse or drag and drop file here
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Images (PNG, JPG, WebP), PDFs, and Documents up to 100MB
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                  {isImage ? <FileImage className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatBytes(selectedFile.size)} &middot; {selectedFile.type || "file"}
                  </p>
                </div>
              </div>
              {!uploading && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {/* Title Field */}
          {selectedFile && (
            <div className="space-y-1.5">
              <Label htmlFor="file-title" className="text-xs font-medium">
                Display Title
              </Label>
              <Input
                id="file-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give this file a descriptive name"
                disabled={uploading}
                className="text-xs"
              />
            </div>
          )}

          {/* Privacy & Access Control Toggle */}
          <div className="rounded-xl border p-4 space-y-3 bg-card">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  {isPublic ? (
                    <Globe className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Lock className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-xs font-semibold">
                    {isPublic ? "Public File" : "Private File (Default)"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isPublic
                    ? "Generates a public vanity URL accessible without signing in."
                    : "Zero-trust: Only authenticated administrators can access this file."}
                </p>
              </div>
              <Switch
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={uploading}
              />
            </div>

            {/* Public File Configuration */}
            {isPublic && (
              <div className="pt-2 border-t space-y-3">
                {/* Custom Slug */}
                <div className="space-y-1">
                  <Label htmlFor="custom-slug" className="text-xs font-medium">
                    Custom Slug (Optional)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground select-none">
                      /view/
                    </span>
                    <Input
                      id="custom-slug"
                      value={customSlug}
                      onChange={(e) =>
                        setCustomSlug(
                          e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")
                        )
                      }
                      placeholder="leave blank to auto-generate"
                      disabled={uploading}
                      className="pl-16 font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Display Mode */}
                <div className="space-y-1">
                  <Label htmlFor="display-mode" className="text-xs font-medium">
                    Display Mode
                  </Label>
                  <NativeSelect
                    id="display-mode"
                    value={displayMode}
                    onChange={(e) =>
                      setDisplayMode(e.target.value as HostedFileDisplayMode)
                    }
                    disabled={uploading}
                    className="text-xs"
                  >
                    <option value="IN_APP_VIEWER">
                      In-App Viewer (Branded Mode with Controls)
                    </option>
                    <option value="RENDER_AS_PAGE">
                      Render as a Page (Clean Full Screen Asset, No Header/Footer)
                    </option>
                    <option value="DIRECT_RAW">
                      Direct File Access (Raw Stream / Inline Download)
                    </option>
                  </NativeSelect>
                  <p className="text-[10px] text-muted-foreground">
                    Render as a Page displays the asset edge-to-edge full screen; In-App Viewer adds branded Basilissa navigation controls.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Progressive Preview Toggle */}
          <div className="flex items-center justify-between rounded-xl border p-4 bg-card">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold">
                  Generate Low-Res Preview for Fast Loading
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Instantly displays a lightweight compressed version while the high-res file loads seamlessly in the background.
              </p>
            </div>
            <Switch
              checked={generateLowRes}
              onChange={(e) => setGenerateLowRes(e.target.checked)}
              disabled={uploading}
            />
          </div>

          {/* Progress Indicator */}
          {uploading && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading and optimizing asset...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Hosting...
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                Upload & Host File
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
