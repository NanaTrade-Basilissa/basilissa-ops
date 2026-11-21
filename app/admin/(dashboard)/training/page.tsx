import type { Metadata } from "next";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission } from "@/lib/modules/identity/server";
import { listTrainingCourses, getTrainingCategories } from "@/lib/modules/training/queries";
import { PageHeader, PageShell } from "@/components/admin/page-shell";
import { CourseCreateDialog } from "@/components/admin/training/course-create-dialog";
import { TrainingHubClient } from "@/components/admin/training/training-hub-client";

export const metadata: Metadata = {
  title: "Training Hub | Basilissa Admin",
  description: "Manage employee training modules, video lessons, SOP documents, and compliance tracking.",
};

export const dynamic = "force-dynamic";

export default async function TrainingHubPage() {
  await requirePermission("training:read");

  const [courses, categories, assessments] = await Promise.all([
    listTrainingCourses(),
    getTrainingCategories(),
    prisma.assessment.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true, status: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Training Hub"
        description="Create video courses, SOPs, and learning materials accessible on employee mobile devices."
        actions={<CourseCreateDialog existingCategories={categories} assessments={assessments} />}
      />

      <TrainingHubClient
        initialCourses={courses}
        categories={categories}
        assessments={assessments}
      />
    </PageShell>
  );
}
