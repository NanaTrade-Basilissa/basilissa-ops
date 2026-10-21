"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Archive, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  publishCourseAction,
  deleteCourseAction,
  updateCourseStatusAction,
} from "@/lib/modules/training/actions";
import type { TrainingCourseStatus } from "@prisma/client";

export function CourseHeaderActions({
  courseId,
  courseTitle,
  status,
  materialsCount,
}: {
  courseId: string;
  courseTitle: string;
  status: TrainingCourseStatus;
  materialsCount: number;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handlePublish() {
    if (materialsCount === 0) {
      toast.error("Please upload at least one video, picture, or PDF material before publishing.");
      return;
    }

    setPublishing(true);
    try {
      const res = await publishCourseAction(courseId);
      if (res.success) {
        toast.success(res.message || "Course published and assigned to employees!");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to publish course.");
      }
    } catch {
      toast.error("Error publishing course.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleArchive() {
    try {
      const newStatus = status === "ARCHIVED" ? "DRAFT" : "ARCHIVED";
      const res = await updateCourseStatusAction(courseId, newStatus);
      if (res.success) {
        toast.success(newStatus === "ARCHIVED" ? "Course archived." : "Course restored to draft.");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to update status.");
      }
    } catch {
      toast.error("Error updating course status.");
    }
  }

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete "${courseTitle}"? All uploaded materials and employee progress will be permanently deleted.`)) {
      return;
    }

    setDeleting(true);
    try {
      const res = await deleteCourseAction(courseId);
      if (res.success) {
        toast.success("Course deleted successfully.");
        router.push("/admin/training");
      } else {
        toast.error(res.error || "Failed to delete course.");
      }
    } catch {
      toast.error("Error deleting course.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status !== "PUBLISHED" ? (
        <Button
          size="sm"
          onClick={handlePublish}
          disabled={publishing}
          className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {publishing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Publish Course
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={handleArchive}
          className="gap-1.5 text-xs"
        >
          <Archive className="size-3.5" />
          Archive
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={handleDelete}
        disabled={deleting}
        className="size-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </Button>
    </div>
  );
}
