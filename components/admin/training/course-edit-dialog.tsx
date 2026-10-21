"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Loader2, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { updateCourseAction } from "@/lib/modules/training/actions";
import type { TrainingCourseDetail } from "@/lib/modules/training/types";

export function CourseEditDialog({
  course,
  assessments = [],
}: {
  course: TrainingCourseDetail;
  assessments?: { id: string; title: string; status: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description || "");
  const [category, setCategory] = useState(course.category);
  const [estimatedMinutes, setEstimatedMinutes] = useState(String(course.estimatedMinutes));
  const [dueDays, setDueDays] = useState(course.dueDays ? String(course.dueDays) : "7");
  const [isMandatory, setIsMandatory] = useState(course.isMandatory);
  const [quizAssessmentId, setQuizAssessmentId] = useState(course.quizAssessmentId || "");
  const [passScorePercent, setPassScorePercent] = useState(
    course.passScorePercent ? String(course.passScorePercent) : "80"
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("description", description.trim());
      formData.set("category", category);
      formData.set("estimatedMinutes", estimatedMinutes || "15");
      formData.set("dueDays", dueDays || "7");
      formData.set("isMandatory", isMandatory ? "true" : "false");
      formData.set("quizAssessmentId", quizAssessmentId || "");
      formData.set("passScorePercent", passScorePercent || "80");

      const res = await updateCourseAction(course.id, formData);
      if (res.success) {
        toast.success("Course details updated successfully.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to update course.");
      }
    } catch {
      toast.error("Error updating course.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Edit2 className="size-3.5" />
            Edit Course
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Edit Course Information
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update course title, objectives, time estimate, and mandatory requirements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="editTitle" className="text-xs font-medium">
                Course Title
              </Label>
              <Input
                id="editTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editDesc" className="text-xs font-medium">
                Description & Objectives
              </Label>
              <Textarea
                id="editDesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Attached Assessment / Quiz Section */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="editQuizAssessmentId" className="text-xs font-semibold flex items-center gap-1.5">
                  <GraduationCap className="size-3.5 text-primary" />
                  Attached Assessment / Quiz
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Attached quiz that employees take after completing training materials.
                </p>
              </div>

              <select
                id="editQuizAssessmentId"
                value={quizAssessmentId}
                onChange={(e) => setQuizAssessmentId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">None (No assessment required)</option>
                {assessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} ({a.status})
                  </option>
                ))}
              </select>

              {quizAssessmentId && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="editPassScore" className="text-xs font-medium">
                    Pass Mark Percentage (%)
                  </Label>
                  <Input
                    id="editPassScore"
                    type="number"
                    min="1"
                    max="100"
                    value={passScorePercent}
                    onChange={(e) => setPassScorePercent(e.target.value)}
                    className="h-9 w-32"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="editCategory" className="text-xs font-medium">
                  Category
                </Label>
                <Input
                  id="editCategory"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editDuration" className="text-xs font-medium">
                  Est. Minutes
                </Label>
                <Input
                  id="editDuration"
                  type="number"
                  min="1"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editDueDays" className="text-xs font-medium">
                  Due Days
                </Label>
                <Input
                  id="editDueDays"
                  type="number"
                  min="1"
                  value={dueDays}
                  onChange={(e) => setDueDays(e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-2.5 mt-auto">
                <div>
                  <div className="text-xs font-medium">Mandatory</div>
                  <div className="text-[10px] text-muted-foreground">Required for staff</div>
                </div>
                <Switch
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading} className="gap-2">
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
