"use client";

import { useState, useRef } from "react";
import {
  UploadCloud,
  FileVideo,
  FileImage,
  FileText,
  Loader2,
  X,
  FileUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { addCourseMaterialAction } from "@/lib/modules/training/actions";
import type { TrainingMaterialType } from "@prisma/client";

const ALLOWED_MIME_TYPES = [
  // Videos
  "video/mp4",
  "video/quicktime",
  "video/webm",
  // Pictures
  "image/jpeg",
  "image/png",
  "image/webp",
  // PDFs
  "application/pdf",
];

function getMaterialTypeFromMime(mime: string): TrainingMaterialType {
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("image/")) return "IMAGE";
  return "PDF";
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function CourseMaterialsUploader({
  courseId,
  onUploaded,
}: {
  courseId: string;
  onUploaded?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  function handleFileSelected(file: File) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error(
        `Unsupported format (${file.type || "unknown"}). Please select an MP4, MOV, WEBM video, PNG/JPG/WEBP image, or PDF document.`
      );
      return;
    }

    // Limit check (e.g. 500MB)
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error("File is too large. Maximum file size allowed is 500MB.");
      return;
    }

    setSelectedFile(file);
    // Auto-fill title from clean filename
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  }

  async function handleUpload() {
    if (!selectedFile) return;
    if (!title.trim()) {
      toast.error("Please enter a title for this material.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const type = getMaterialTypeFromMime(selectedFile.type);

      // 1. Request presigned upload URL from API
      const presignedRes = await fetch("/api/admin/training/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type,
          fileSize: selectedFile.size,
        }),
      });

      if (!presignedRes.ok) {
        throw new Error("Failed to initialize upload session.");
      }

      const presignedData = await presignedRes.json();

      let finalFileUrl = "";
      let finalFileKey = "";

      if (presignedData.useFallback) {
        // Fallback for local dev when R2 is not configured
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("courseId", courseId);

        const fallbackRes = await fetch("/api/admin/training/upload-fallback", {
          method: "POST",
          body: formData,
        });

        if (!fallbackRes.ok) throw new Error("Fallback upload failed.");
        const fallbackData = await fallbackRes.json();
        finalFileUrl = fallbackData.fileUrl;
        finalFileKey = fallbackData.fileKey;
        setUploadProgress(100);
      } else {
        // Direct upload to Cloudflare R2 with XMLHttpRequest for real progress
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presignedData.uploadUrl, true);
          xhr.setRequestHeader("Content-Type", selectedFile.type);

          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              const percent = Math.round((evt.loaded / evt.total) * 100);
              setUploadProgress(percent);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`R2 upload rejected with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Network error during R2 upload."));
          xhr.onabort = () => reject(new Error("Upload aborted."));

          xhr.send(selectedFile);
        });

        finalFileUrl = presignedData.publicUrl;
        finalFileKey = presignedData.fileKey;
      }

      // 2. Persist material record in database via Server Action
      const actionRes = await addCourseMaterialAction({
        courseId,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        fileUrl: finalFileUrl,
        fileKey: finalFileKey,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type,
      });

      if (!actionRes.success) {
        throw new Error(actionRes.error || "Failed to save material in database.");
      }

      toast.success(`"${title}" uploaded successfully and added to course!`);
      resetState();
      onUploaded?.();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to upload material. Please try again.";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }

  function resetState() {
    setSelectedFile(null);
    setTitle("");
    setDescription("");
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const fileTypeIcon = selectedFile ? (
    selectedFile.type.startsWith("video/") ? (
      <FileVideo className="size-8 text-blue-500" />
    ) : selectedFile.type.startsWith("image/") ? (
      <FileImage className="size-8 text-emerald-500" />
    ) : (
      <FileText className="size-8 text-red-500" />
    )
  ) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div>
          <h2 className="text-sm font-semibold">Upload Training Material</h2>
          <p className="text-xs text-muted-foreground">
            Add videos, pictures, or PDF SOP documents (stored securely in Cloudflare R2).
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">MP4</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">MOV</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">PNG</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">JPG</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">PDF</span>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelected(e.target.files[0]);
          }
        }}
      />

      {!selectedFile ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all ${
            isDragging
              ? "border-primary bg-primary/5 scale-[0.99]"
              : "border-border/80 hover:border-primary/50 hover:bg-muted/30"
          }`}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
            <UploadCloud className="size-6" />
          </div>
          <p className="text-sm font-medium">
            Drag and drop your training material here, or{" "}
            <span className="text-primary underline">browse file</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Supports High-Definition Videos (MP4, MOV), Standard SOP Guidelines (PDF), and Recipe / Prep Photos (JPG, PNG). Up to 500MB.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 p-3">
            <div className="flex items-center gap-3">
              {fileTypeIcon}
              <div>
                <p className="text-xs font-semibold">{selectedFile.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatBytes(selectedFile.size)} • {selectedFile.type || "file"}
                </p>
              </div>
            </div>
            {!uploading && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={resetState}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="materialTitle" className="text-xs font-medium">
                Lesson / Document Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="materialTitle"
                placeholder="e.g. Lesson 1: Proper Hand Washing & Glove Usage"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploading}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="materialDesc" className="text-xs font-medium">
                Description / Instructions (optional)
              </Label>
              <Textarea
                id="materialDesc"
                placeholder="Key takeaways or instructions for employees viewing this material..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={uploading}
                rows={2}
                className="text-xs resize-none"
              />
            </div>
          </div>

          {uploading && (
            <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-primary">
                  <Loader2 className="size-3.5 animate-spin" />
                  Streaming file directly to Cloudflare R2...
                </span>
                <span className="font-semibold text-primary">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-1.5" />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetState}
              disabled={uploading}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleUpload}
              disabled={uploading || !title.trim()}
              className="gap-2 text-xs"
            >
              {uploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FileUp className="size-3.5" />
                  Upload to Course
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
