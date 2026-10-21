"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Clock,
  FileCheck2,
  Users,
  MoreVertical,
  Play,
  FileText,
  Trash2,
  Archive,
  Send,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  publishCourseAction,
  deleteCourseAction,
  updateCourseStatusAction,
} from "@/lib/modules/training/actions";
import type { TrainingCourseListItem } from "@/lib/modules/training/types";
import { cn } from "@/lib/utils";

export function CourseCard({
  course,
  onDeleted,
}: {
  course: TrainingCourseListItem;
  onDeleted?: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handlePublish() {
    if (course.materialsCount === 0) {
      toast.error("Please upload at least one video, picture, or PDF material before publishing.");
      return;
    }

    setPublishing(true);
    try {
      const res = await publishCourseAction(course.id);
      if (res.success) {
        toast.success(res.message || "Course published and assigned to employees!");
      } else {
        toast.error(res.error || "Failed to publish course");
      }
    } catch {
      toast.error("Error publishing course");
    } finally {
      setPublishing(false);
    }
  }

  async function handleArchive() {
    try {
      const newStatus = course.status === "ARCHIVED" ? "DRAFT" : "ARCHIVED";
      const res = await updateCourseStatusAction(course.id, newStatus);
      if (res.success) {
        toast.success(newStatus === "ARCHIVED" ? "Course archived" : "Course restored to draft");
      } else {
        toast.error(res.error || "Failed to update status");
      }
    } catch {
      toast.error("Error updating status");
    }
  }

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete "${course.title}"? All materials and progress will be permanently removed.`)) {
      return;
    }

    setDeleting(true);
    try {
      const res = await deleteCourseAction(course.id);
      if (res.success) {
        toast.success("Course deleted successfully.");
        onDeleted?.();
      } else {
        toast.error(res.error || "Failed to delete course");
      }
    } catch {
      toast.error("Error deleting course");
    } finally {
      setDeleting(false);
    }
  }

  const statusBadgeMap = {
    PUBLISHED: { label: "Active", variant: "default" as const, className: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    DRAFT: { label: "Draft", variant: "secondary" as const, className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
    ARCHIVED: { label: "Archived", variant: "outline" as const, className: "text-muted-foreground" },
  };

  const statusInfo = statusBadgeMap[course.status] ?? statusBadgeMap.DRAFT;

  return (
    <div className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
      {/* Top row */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs font-normal bg-muted/40">
              {course.category}
            </Badge>
            <Badge variant={statusInfo.variant} className={cn("text-[11px] px-2 py-0.5", statusInfo.className)}>
              {statusInfo.label}
            </Badge>
            {course.isMandatory && (
              <Badge variant="destructive" className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0">
                Required
              </Badge>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground">
                  <MoreVertical className="size-4" />
                  <span className="sr-only">Course options</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  window.location.href = `/admin/training/${course.id}`;
                }}
                className="cursor-pointer"
              >
                <ExternalLink className="mr-2 size-4" />
                View & Edit
              </DropdownMenuItem>
              {course.status !== "PUBLISHED" && (
                <DropdownMenuItem onClick={handlePublish} disabled={publishing} className="cursor-pointer text-emerald-600 focus:text-emerald-600">
                  <Send className="mr-2 size-4" />
                  Publish to Staff
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleArchive} className="cursor-pointer">
                <Archive className="mr-2 size-4" />
                {course.status === "ARCHIVED" ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={deleting}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Title & Description */}
        <Link href={`/admin/training/${course.id}`} className="mt-3 block group-hover:text-primary transition-colors">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {course.title}
          </h3>
        </Link>
        {course.description ? (
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
            {course.description}
          </p>
        ) : (
          <p className="mt-1.5 text-xs italic text-muted-foreground/60">
            No description provided.
          </p>
        )}
      </div>

      {/* Stats and metadata */}
      <div className="mt-5 space-y-4 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <FileText className="size-3.5 text-primary/70" />
            <span>{course.materialsCount} material{course.materialsCount === 1 ? "" : "s"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-muted-foreground" />
            <span>~{course.estimatedMinutes} mins</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="size-3.5 text-muted-foreground" />
            <span>{course.assignedCount} assigned</span>
          </div>
        </div>

        {/* Completion Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] font-medium text-muted-foreground">Completion Rate</span>
            <span className="font-semibold text-foreground">
              {course.completionRatePercent}%
            </span>
          </div>
          <Progress
            value={course.completionRatePercent}
            className="h-1.5 bg-muted"
          />
        </div>

        {/* Footer Action */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground">
            {course.completedCount} of {course.assignedCount} completed
          </span>
          <Link
            href={`/admin/training/${course.id}`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-8 gap-1 text-xs")}
          >
            Manage Hub
            <ExternalLink className="size-3 ml-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
