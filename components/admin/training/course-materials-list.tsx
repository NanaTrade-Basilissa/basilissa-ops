"use client";

import { useState } from "react";
import {
  FileVideo,
  FileImage,
  FileText,
  Play,
  Eye,
  Download,
  Trash2,
  ExternalLink,
  GripVertical,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeCourseMaterialAction } from "@/lib/modules/training/actions";
import type { TrainingMaterialItem } from "@/lib/modules/training/types";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function CourseMaterialsList({
  materials,
  onDeleted,
}: {
  materials: TrainingMaterialItem[];
  onDeleted?: () => void;
}) {
  const [previewMaterial, setPreviewMaterial] = useState<TrainingMaterialItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(material: TrainingMaterialItem) {
    if (!confirm(`Are you sure you want to delete "${material.title}"? The file will be removed from Cloudflare R2.`)) {
      return;
    }

    setDeletingId(material.id);
    try {
      const res = await removeCourseMaterialAction(material.id);
      if (res.success) {
        toast.success("Material deleted from course and R2.");
        onDeleted?.();
      } else {
        toast.error(res.error || "Failed to delete material");
      }
    } catch {
      toast.error("Error deleting material");
    } finally {
      setDeletingId(null);
    }
  }

  if (materials.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
        <p className="text-xs text-muted-foreground">
          No learning materials added yet. Upload a video lesson, presentation image, or SOP PDF above.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {materials.map((item, index) => {
          const isVideo = item.type === "VIDEO";
          const isImage = item.type === "IMAGE";
          const isPdf = item.type === "PDF";

          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3.5 shadow-xs transition-colors hover:border-primary/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>

                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  {isVideo && <FileVideo className="size-5 text-blue-600" />}
                  {isImage && <FileImage className="size-5 text-emerald-600" />}
                  {isPdf && <FileText className="size-5 text-red-600" />}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-xs font-semibold">{item.title}</h4>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                      {item.type}
                    </Badge>
                  </div>
                  {item.description && (
                    <p className="truncate text-[11px] text-muted-foreground mt-0.5">
                      {item.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>{formatBytes(item.fileSize)}</span>
                    {item.durationSeconds && (
                      <span>• {Math.round(item.durationSeconds / 60)} mins</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setPreviewMaterial(item)}
                >
                  {isVideo ? <Play className="size-3" /> : <Eye className="size-3" />}
                  Preview
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDelete(item)}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview Dialog */}
      <Dialog
        open={Boolean(previewMaterial)}
        onOpenChange={(open) => !open && setPreviewMaterial(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center justify-between">
              <span>{previewMaterial?.title}</span>
              <a
                href={previewMaterial?.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-normal text-primary hover:underline flex items-center gap-1"
              >
                Open Original File
                <ExternalLink className="size-3" />
              </a>
            </DialogTitle>
          </DialogHeader>

          <div className="mt-2 flex items-center justify-center overflow-hidden rounded-lg bg-black/95 p-2">
            {previewMaterial?.type === "VIDEO" && (
              <video
                src={previewMaterial.fileUrl}
                controls
                autoPlay
                className="max-h-[70vh] w-full rounded"
              />
            )}

            {previewMaterial?.type === "IMAGE" && (
              <img
                src={previewMaterial.fileUrl}
                alt={previewMaterial.title}
                className="max-h-[70vh] w-auto max-w-full rounded object-contain"
              />
            )}

            {previewMaterial?.type === "PDF" && (
              <iframe
                src={`${previewMaterial.fileUrl}#toolbar=1`}
                title={previewMaterial.title}
                className="h-[70vh] w-full rounded border-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
