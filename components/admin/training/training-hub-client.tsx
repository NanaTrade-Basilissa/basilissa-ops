"use client";

import { useState, useMemo } from "react";
import {
  CheckCircle2,
  FileCheck,
  FolderOpen,
  GraduationCap,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";
import { FilterBar } from "@/components/admin/filter-bar";
import { StatCard } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CourseCard } from "./course-card";
import { CourseCreateDialog } from "./course-create-dialog";
import type { TrainingCourseListItem } from "@/lib/modules/training/types";

export function TrainingHubClient({
  initialCourses = [],
  categories = [],
  assessments = [],
}: {
  initialCourses: TrainingCourseListItem[];
  categories: string[];
  assessments?: { id: string; title: string; status: string }[];
}) {
  const [courses, setCourses] = useState<TrainingCourseListItem[]>(initialCourses);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  const stats = useMemo(() => {
    const total = courses.length;
    const published = courses.filter((c) => c.status === "PUBLISHED").length;
    const totalAssigned = courses.reduce((acc, c) => acc + c.assignedCount, 0);
    const totalCompleted = courses.reduce((acc, c) => acc + c.completedCount, 0);
    const overallRate = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

    return { total, published, totalAssigned, totalCompleted, overallRate };
  }, [courses]);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      if (selectedStatus !== "ALL" && course.status !== selectedStatus) {
        return false;
      }
      if (selectedCategory !== "ALL" && course.category !== selectedCategory) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = course.title.toLowerCase().includes(q);
        const matchesDesc = (course.description || "").toLowerCase().includes(q);
        const matchesCat = course.category.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesCat) return false;
      }
      return true;
    });
  }, [courses, search, selectedCategory, selectedStatus]);

  function handleCourseDeleted(deletedId: string) {
    setCourses((prev) => prev.filter((c) => c.id !== deletedId));
  }

  const hasFilters = Boolean(search.trim() || selectedCategory !== "ALL" || selectedStatus !== "ALL");

  return (
    <div className="space-y-6">
      {/* Standardized KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard
          label="Total Modules"
          value={String(stats.total)}
          subtext={`${stats.published} active courses`}
          icon={GraduationCap}
          tone="default"
        />
        <StatCard
          label="Published"
          value={String(stats.published)}
          subtext="Visible on mobile app"
          icon={FileCheck}
          tone="good"
        />
        <StatCard
          label="Staff Assignments"
          value={String(stats.totalAssigned)}
          subtext={`${stats.totalCompleted} completed`}
          icon={Users}
          tone="info"
        />
        <StatCard
          label="Completion Rate"
          value={`${stats.overallRate}%`}
          subtext="Company-wide average"
          icon={CheckCircle2}
          tone="brand"
        />
      </div>

      {/* Unified Filter Bar + Courses Grid */}
      <div className="space-y-4">
        <FilterBar
          hasActiveFilters={selectedCategory !== "ALL" || selectedStatus !== "ALL"}
          search={
            <div className="relative w-full shrink-0 sm:w-64 md:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search courses or topics..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>
          }
          filters={
            <>
              <NativeSelect
                aria-label="Filter by category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-9 text-xs"
                containerClassName="w-full sm:w-fit sm:min-w-[150px] sm:shrink-0"
              >
                <option value="ALL">All categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </NativeSelect>

              <NativeSelect
                aria-label="Filter by status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="h-9 text-xs"
                containerClassName="w-full sm:w-fit sm:min-w-[130px] sm:shrink-0"
              >
                <option value="ALL">All statuses</option>
                <option value="PUBLISHED">Active</option>
                <option value="DRAFT">Drafts</option>
                <option value="ARCHIVED">Archived</option>
              </NativeSelect>

              {hasFilters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setSelectedCategory("ALL");
                    setSelectedStatus("ALL");
                  }}
                  className="h-9 gap-1.5 text-xs"
                  title="Reset filters"
                >
                  <RotateCcw className="size-3.5" />
                  Reset
                </Button>
              )}
            </>
          }
        />

        {filteredCourses.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onDeleted={() => handleCourseDeleted(course.id)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-card ring-1 ring-foreground/10">
            <Empty className="border-0 py-12">
              <EmptyMedia variant="icon">
                <FolderOpen className="size-5" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No training courses found</EmptyTitle>
                <EmptyDescription>
                  {hasFilters
                    ? "No courses match your filter criteria. Try adjusting your search or resetting the filters."
                    : "No courses have been created yet. Create your first course to upload videos, SOPs, and train staff on mobile."}
                </EmptyDescription>
              </EmptyHeader>
              {!hasFilters && (
                <EmptyContent>
                  <CourseCreateDialog existingCategories={categories} assessments={assessments} />
                </EmptyContent>
              )}
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}
