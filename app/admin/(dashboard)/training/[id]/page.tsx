import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  GraduationCap,
  FileText,
  Users,
  Clock,
  Send,
  Trash2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission } from "@/lib/modules/identity/server";
import { getTrainingCourse, getCourseAssignments } from "@/lib/modules/training/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseMaterialsUploader } from "@/components/admin/training/course-materials-uploader";
import { CourseMaterialsList } from "@/components/admin/training/course-materials-list";
import { CourseAssignmentsTable } from "@/components/admin/training/course-assignments-table";
import { CourseEditDialog } from "@/components/admin/training/course-edit-dialog";
import { CourseHeaderActions } from "@/components/admin/training/course-header-actions";

export const metadata: Metadata = {
  title: "Course Details | Training Hub",
};

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("training:read");
  const { id } = await params;

  const [course, assignments, rawEmployees] = await Promise.all([
    getTrainingCourse(id),
    getCourseAssignments(id),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        jobTitle: true,
        branchAssignments: {
          where: { isPrimary: true },
          select: { branch: { select: { name: true } } },
        },
      },
      orderBy: { firstName: "asc" },
    }),
  ]);

  if (!course) {
    notFound();
  }

  const availableEmployees = rawEmployees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName}`,
    code: e.employeeCode,
    jobTitle: e.jobTitle,
    branchName: e.branchAssignments[0]?.branch?.name ?? "Unassigned",
  }));

  const statusMap = {
    PUBLISHED: { label: "Active", className: "bg-emerald-600 text-white" },
    DRAFT: { label: "Draft", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
    ARCHIVED: { label: "Archived", className: "bg-muted text-muted-foreground" },
  };

  const statusInfo = statusMap[course.status] ?? statusMap.DRAFT;

  return (
    <div className="space-y-6 min-w-0 max-w-full pb-12">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/admin/training"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-3.5" />
          Back to Training Hub
        </Link>
        <span>/</span>
        <span className="truncate max-w-xs font-medium text-foreground">
          {course.title}
        </span>
      </div>

      {/* Course Header Banner */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.className}`}>
                {statusInfo.label}
              </span>
              <Badge variant="outline" className="text-xs">
                {course.category}
              </Badge>
              {course.isMandatory && (
                <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                  Mandatory
                </Badge>
              )}
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {course.title}
            </h1>

            {course.description && (
              <p className="max-w-3xl text-xs text-muted-foreground leading-relaxed">
                {course.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
              <div className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                <span>Est. {course.estimatedMinutes} mins</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FileText className="size-3.5" />
                <span>{course.materials.length} lesson material{course.materials.length === 1 ? "" : "s"}</span>
              </div>
              {course.dueDays && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  <span>Due in {course.dueDays} days</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <CourseEditDialog course={course} />
            <CourseHeaderActions
              courseId={course.id}
              courseTitle={course.title}
              status={course.status}
              materialsCount={course.materials.length}
            />
          </div>
        </div>

        {/* Quick Assignment Statistics Bar */}
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border/70 pt-4 sm:grid-cols-4 sm:gap-4">
          <div>
            <span className="text-[11px] text-muted-foreground">Assigned Staff</span>
            <p className="text-xl font-bold">{course.assignmentsSummary.total}</p>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground">Completed</span>
            <p className="text-xl font-bold text-emerald-600">
              {course.assignmentsSummary.completed}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground">In Progress</span>
            <p className="text-xl font-bold text-blue-600">
              {course.assignmentsSummary.inProgress}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground">Overdue</span>
            <p className="text-xl font-bold text-amber-600">
              {course.assignmentsSummary.overdue}
            </p>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="materials" className="space-y-4">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="materials" className="gap-2 text-xs">
            <FileText className="size-3.5" />
            Course Materials ({course.materials.length})
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2 text-xs">
            <Users className="size-3.5" />
            Assigned Staff & Compliance ({assignments.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Materials (Upload & List) */}
        <TabsContent value="materials" className="space-y-6">
          <CourseMaterialsUploader courseId={course.id} />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Course Materials ({course.materials.length})
              </h3>
              <span className="text-xs text-muted-foreground">
                Delivered in this order on mobile app
              </span>
            </div>
            <CourseMaterialsList materials={course.materials} />
          </div>
        </TabsContent>

        {/* Tab 2: Assignments & Compliance */}
        <TabsContent value="assignments" className="space-y-4">
          <CourseAssignmentsTable
            courseId={course.id}
            assignments={assignments}
            totalMaterials={course.materials.length}
            availableEmployees={availableEmployees}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
