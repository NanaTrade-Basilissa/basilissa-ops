import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { requirePermission } from "@/lib/modules/identity/server";
import { listTrainingCourses, getTrainingCategories } from "@/lib/modules/training/queries";
import { TrainingHubClient } from "@/components/admin/training/training-hub-client";

export const metadata: Metadata = {
  title: "Training Hub | Basilissa Admin",
  description: "Manage employee training modules, video lessons, SOP documents, and compliance tracking.",
};

export const dynamic = "force-dynamic";

export default async function TrainingHubPage() {
  await requirePermission("training:read");

  const [courses, categories] = await Promise.all([
    listTrainingCourses(),
    getTrainingCategories(),
  ]);

  return (
    <div className="space-y-6 min-w-0 max-w-full pb-10">
      {/* Page Title & Breadcrumb Header */}
      <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Staff Training Hub</h1>
            <p className="text-xs text-muted-foreground">
              Create video courses, SOPs, and learning materials accessible on employee mobile devices.
            </p>
          </div>
        </div>
      </div>

      <TrainingHubClient
        initialCourses={courses}
        categories={categories}
      />
    </div>
  );
}
