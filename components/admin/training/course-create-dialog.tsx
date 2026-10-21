"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Sparkles, BookOpen, GraduationCap } from "lucide-react";
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
import { createCourseAction } from "@/lib/modules/training/actions";

const DEFAULT_CATEGORIES = [
  "General",
  "Food Safety & Hygiene",
  "Customer Service",
  "Kitchen & Food Prep",
  "Service Operations",
  "Health & Safety",
  "Onboarding",
  "Management & Leadership",
];

export function CourseCreateDialog({
  existingCategories = [],
  assessments = [],
  triggerButton,
}: {
  existingCategories?: string[];
  assessments?: { id: string; title: string; status: string }[];
  triggerButton?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [customCategory, setCustomCategory] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("15");
  const [dueDays, setDueDays] = useState("7");
  const [isMandatory, setIsMandatory] = useState(true);
  const [targetAll, setTargetAll] = useState(true);
  const [quizAssessmentId, setQuizAssessmentId] = useState("");
  const [passScorePercent, setPassScorePercent] = useState("80");

  const allCategories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...existingCategories])
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please provide a course title.");
      return;
    }

    setLoading(true);
    try {
      const selectedCategory =
        category === "CUSTOM"
          ? customCategory.trim() || "General"
          : category;

      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("description", description.trim());
      formData.set("category", selectedCategory);
      formData.set("estimatedMinutes", estimatedMinutes || "15");
      formData.set("isMandatory", isMandatory ? "true" : "false");
      formData.set("dueDays", dueDays || "7");
      formData.set("targetAll", targetAll ? "true" : "false");
      if (quizAssessmentId) {
        formData.set("quizAssessmentId", quizAssessmentId);
        formData.set("passScorePercent", passScorePercent || "80");
      }

      const res = await createCourseAction(formData);

      if (!res.success) {
        toast.error(res.error || "Failed to create course");
        return;
      }

      if (!res.data) {
        toast.error("Failed to create course");
        return;
      }

      toast.success("Training course created successfully!");
      setOpen(false);
      resetForm();
      router.push(`/admin/training/${res.data.id}`);
    } catch (err) {
      toast.error("An unexpected error occurred while creating the course.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setCategory("General");
    setCustomCategory("");
    setEstimatedMinutes("15");
    setDueDays("7");
    setIsMandatory(true);
    setTargetAll(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          triggerButton ? (
            (triggerButton as React.ReactElement)
          ) : (
            <Button className="gap-2 shadow-sm">
              <Plus className="size-4" />
              Create Training Course
            </Button>
          )
        }
      />
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <BookOpen className="size-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Create New Training Course
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Set up a training module and upload videos, PDFs, or pictures for employees.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-xs font-medium">
                Course Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g., Food Hygiene & Safety Protocol 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-medium">
                Description & Learning Objectives
              </Label>
              <Textarea
                id="description"
                placeholder="Briefly describe what staff will learn from this course..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="category" className="text-xs font-medium">
                  Category
                </Label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="CUSTOM">+ New Category...</option>
                </select>
              </div>

              {category === "CUSTOM" && (
                <div className="space-y-1.5">
                  <Label htmlFor="customCategory" className="text-xs font-medium">
                    New Category Name
                  </Label>
                  <Input
                    id="customCategory"
                    placeholder="Enter category"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="h-9"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="estimatedMinutes" className="text-xs font-medium">
                  Est. Duration (minutes)
                </Label>
                <Input
                  id="estimatedMinutes"
                  type="number"
                  min="1"
                  max="600"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dueDays" className="text-xs font-medium">
                  Due in Days (after assignment)
                </Label>
                <Input
                  id="dueDays"
                  type="number"
                  min="1"
                  max="365"
                  value={dueDays}
                  onChange={(e) => setDueDays(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {/* Attached Assessment / Quiz Section */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="quizAssessmentId" className="text-xs font-semibold flex items-center gap-1.5">
                  <GraduationCap className="size-3.5 text-primary" />
                  Attach Assessment / Quiz (Optional)
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Select an existing assessment. Staff will take this quiz after completing lesson materials.
                </p>
              </div>

              <select
                id="quizAssessmentId"
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
                  <Label htmlFor="passScorePercent" className="text-xs font-medium">
                    Pass Mark Percentage (%)
                  </Label>
                  <Input
                    id="passScorePercent"
                    type="number"
                    min="1"
                    max="100"
                    value={passScorePercent}
                    onChange={(e) => setPassScorePercent(e.target.value)}
                    className="h-9 w-32"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Staff must score at least this percentage to pass the training module.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium">Mandatory Training</div>
                  <div className="text-[11px] text-muted-foreground">
                    Required for all targeted staff. Highlighted in mobile app.
                  </div>
                </div>
                <Switch
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                />
              </div>

              <div className="flex items-center justify-between border-t border-border/50 pt-2.5">
                <div>
                  <div className="text-xs font-medium">Target All Active Employees</div>
                  <div className="text-[11px] text-muted-foreground">
                    Automatically assigned to all current and future branch staff.
                  </div>
                </div>
                <Switch
                  checked={targetAll}
                  onChange={(e) => setTargetAll(e.target.checked)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="size-4 animate-spin" />}
              Create & Add Materials
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
