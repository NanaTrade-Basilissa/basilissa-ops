"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import {
  UploadCloud,
  FileText,
  FileImage,
  Presentation,
  Loader2,
  X,
  Lock,
  Globe,
  Sparkles,
  AlertCircle,
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
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);
  const startTimeRef = useRef<number>(0);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [customSlug, setCustomSlug] = useState("");
  const [displayMode, setDisplayMode] = useState<HostedFileDisplayMode>("IN_APP_VIEWER");
  const [generateLowRes, setGenerateLowRes] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [uploadDetailText, setUploadDetailText] = useState("");
  const [uploadSpeedText, setUploadSpeedText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isImage = Boolean(selectedFile?.type.startsWith("image/"));
  const isPresentation = Boolean(
    selectedFile &&
      (selectedFile.type.includes("presentation") ||
        selectedFile.type.includes("powerpoint") ||
        selectedFile.name.toLowerCase().endsWith(".pptx") ||
        selectedFile.name.toLowerCase().endsWith(".ppt"))
  );

  const resetForm = () => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
      activeXhrRef.current = null;
    }
    setSelectedFile(null);
    setTitle("");
    setIsPublic(false);
    setCustomSlug("");
    setDisplayMode("IN_APP_VIEWER");
    setGenerateLowRes(true);
    setUploading(false);
    setUploadProgress(0);
    setUploadStatusText("");
    setUploadDetailText("");
    setUploadSpeedText("");
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCancel = () => {
    if (uploading) {
      if (activeXhrRef.current) {
        activeXhrRef.current.abort();
        activeXhrRef.current = null;
      }
      setUploading(false);
      setUploadProgress(0);
      setUploadStatusText("");
      setUploadDetailText("");
      setUploadSpeedText("");
      toast.info("Upload cancelled.");
    } else {
      resetForm();
      onOpenChange(false);
    }
  };

  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    setUploadError(null);
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    setTitle(nameWithoutExt);
  };

  /**
   * Resilient upload via server streaming fallback.
   * Tracks upload progress smoothly through an XMLHttpRequest.
   */
  const uploadViaFallback = async (fileToUpload: File, fileTitle: string): Promise<HostedFileItem> => {
    return new Promise<HostedFileItem>((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("title", fileTitle);
      formData.append("isPublic", String(isPublic));
      if (isPublic && customSlug.trim()) {
        formData.append("customSlug", customSlug.trim());
      }
      formData.append("displayMode", displayMode);
      formData.append("generateLowRes", String(generateLowRes));

      const xhr = new XMLHttpRequest();
      activeXhrRef.current = xhr;
      xhr.open("POST", "/api/admin/files/upload-fallback", true);
      xhr.timeout = 300000; // 5 minutes

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          const loaded = evt.loaded;
          const total = evt.total;
          const pct = Math.min(92, Math.max(5, Math.round(5 + (loaded / total) * 87)));
          setUploadProgress(pct);
          setUploadDetailText(`${formatBytes(loaded)} / ${formatBytes(total)}`);

          const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
          if (elapsedSec > 0.5 && loaded > 0) {
            const bps = loaded / elapsedSec;
            const remainingBytes = Math.max(0, total - loaded);
            const etaSec = Math.ceil(remainingBytes / bps);
            setUploadSpeedText(`${formatBytes(bps)}/s · ~${etaSec}s left`);
          }
        }
      };

      xhr.onload = () => {
        activeXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success && data.file) {
              resolve(data.file);
            } else {
              reject(new Error(data.error || "Upload fallback failed."));
            }
          } catch {
            reject(new Error("Invalid response from server upload."));
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.error || `Server upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(`Server upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        activeXhrRef.current = null;
        reject(new Error("Server upload network error. Please verify your connection."));
      };

      xhr.ontimeout = () => {
        activeXhrRef.current = null;
        reject(new Error("Server upload timed out. Connection speed is too slow for this asset size."));
      };

      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please choose a file to upload");
      return;
    }

    const fileTitle = title.trim() || selectedFile.name;
    setUploadError(null);
    setUploading(true);
    setUploadProgress(5);
    setUploadStatusText("Requesting upload authorization...");
    setUploadDetailText(`0 B / ${formatBytes(selectedFile.size)}`);
    setUploadSpeedText("");
    startTimeRef.current = Date.now();

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

      // Step 2: Direct S3/R2 upload or seamless fallback
      if (presignData.configured && !presignData.useFallback && presignData.uploadUrl) {
        let directSuccess = false;
        try {
          setUploadStatusText("Uploading directly to object storage...");
          startTimeRef.current = Date.now();

          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            activeXhrRef.current = xhr;
            xhr.open("PUT", presignData.uploadUrl, true);
            xhr.timeout = 180000; // 3 minutes timeout for direct PUT
            xhr.setRequestHeader("Content-Type", selectedFile.type || "application/octet-stream");

            xhr.upload.onprogress = (evt) => {
              if (evt.lengthComputable && evt.total > 0) {
                const loaded = evt.loaded;
                const total = evt.total;
                const pct = Math.min(92, Math.max(5, Math.round(5 + (loaded / total) * 87)));
                setUploadProgress(pct);
                setUploadDetailText(`${formatBytes(loaded)} / ${formatBytes(total)}`);

                const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
                if (elapsedSec > 0.5 && loaded > 0) {
                  const bps = loaded / elapsedSec;
                  const remainingBytes = Math.max(0, total - loaded);
                  const etaSec = Math.ceil(remainingBytes / bps);
                  setUploadSpeedText(`${formatBytes(bps)}/s · ~${etaSec}s left`);
                }
              }
            };

            xhr.onload = () => {
              activeXhrRef.current = null;
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`Storage PUT failed with status ${xhr.status}`));
              }
            };

            xhr.onerror = () => {
              activeXhrRef.current = null;
              reject(new Error("Direct upload network error."));
            };

            xhr.ontimeout = () => {
              activeXhrRef.current = null;
              reject(new Error("Direct upload timed out."));
            };

            xhr.send(selectedFile);
          });

          directSuccess = true;
        } catch (directErr) {
          console.warn("Direct storage PUT failed, falling back to server stream:", directErr);
          setUploadStatusText("Direct upload blocked by network. Streaming via secure gateway...");
          setUploadSpeedText("");
          startTimeRef.current = Date.now();

          const fallbackFile = await uploadViaFallback(selectedFile, fileTitle);
          setUploadProgress(100);
          setUploadStatusText("File hosted successfully!");
          toast.success("File uploaded and hosted successfully!");
          onUploaded(fallbackFile);
          resetForm();
          onOpenChange(false);
          return;
        }

        if (directSuccess) {
          setUploadProgress(95);
          setUploadStatusText("Finalizing asset record...");
          setUploadSpeedText("");

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
          setUploadStatusText("File hosted successfully!");
          toast.success("File uploaded and hosted successfully!");
          onUploaded(recordRes.data);
          resetForm();
          onOpenChange(false);
        }
      } else {
        // Direct cloud upload not configured, use server upload directly
        setUploadStatusText("Uploading to application server...");
        startTimeRef.current = Date.now();
        const fallbackFile = await uploadViaFallback(selectedFile, fileTitle);
        setUploadProgress(100);
        setUploadStatusText("File hosted successfully!");
        toast.success("File uploaded and hosted successfully!");
        onUploaded(fallbackFile);
        resetForm();
        onOpenChange(false);
      }
    } catch (err) {
      console.error("Upload error:", err);
      const msg = err instanceof Error ? err.message : "Failed to upload file";
      setUploadError(msg);
      toast.error(msg);
      setUploadProgress(0);
      setUploadStatusText("");
      setUploadDetailText("");
      setUploadSpeedText("");
    } finally {
      setUploading(false);
      activeXhrRef.current = null;
    }
  };

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
                Images, PDFs, and PowerPoint Presentations (.pptx) up to 100MB
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                  {isImage ? (
                    <FileImage className="h-5 w-5" />
                  ) : isPresentation ? (
                    <Presentation className="h-5 w-5" />
                  ) : (
                    <FileText className="h-5 w-5" />
                  )}
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
                  {isPresentation
                    ? "Pre-render Slides for TV Auto-Slide & Instant Display"
                    : "Generate Low-Res Preview for Fast Loading"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isPresentation
                  ? "Pre-renders slide images so the slideshow auto-advances smoothly on restaurant TVs with zero buffering."
                  : "Instantly displays a lightweight compressed version while the high-res file loads seamlessly in the background."}
              </p>
            </div>
            <Switch
              checked={generateLowRes}
              onChange={(e) => setGenerateLowRes(e.target.checked)}
              disabled={uploading}
            />
          </div>

          {/* Error Banner if upload failed */}
          {uploadError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Upload Failed</p>
                <p className="mt-0.5 text-[11px] text-red-400/90">{uploadError}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUpload}
                className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/20"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Progress Indicator */}
          {uploading && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-foreground truncate max-w-[280px]">
                  {uploadStatusText || "Uploading asset..."}
                </span>
                <span className="font-mono text-xs font-bold text-amber-500 shrink-0">
                  {uploadProgress}%
                </span>
              </div>
              <Progress
                value={uploadProgress}
                className="h-2.5 bg-muted/70"
                indicatorClassName="bg-amber-500 transition-all duration-200"
              />
              <div className="flex justify-between items-center text-[11px] text-muted-foreground font-mono">
                <span>{uploadDetailText}</span>
                <span>{uploadSpeedText}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
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