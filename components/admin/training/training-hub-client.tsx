"use client";

import { useState, useMemo } from "react";
import {
  GraduationCap,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Users,
  FileCheck,
  FolderOpen,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  // Summary Metrics
  const stats = useMemo(() => {
    const total = courses.length;
    const published = courses.filter((c) => c.status === "PUBLISHED").length;
    const totalAssigned = courses.reduce((acc, c) => acc + c.assignedCount, 0);
    const totalCompleted = courses.reduce((acc, c) => acc + c.completedCount, 0);
    const overallRate = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

    return { total, published, totalAssigned, totalCompleted, overallRate };
  }, [courses]);

  // Filtered List
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

  return (
    <div className="space-y-6">
      {/* Top Header Summary Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <GraduationCap className="size-4 text-primary" />
            Total Modules
          </div>
          <div className="mt-2 text-2xl font-bold">{stats.total}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {stats.published} active courses
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FileCheck className="size-4 text-emerald-600" />
            Published
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">
            {stats.published}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Visible on employee mobile app
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Users className="size-4 text-blue-600" />
            Staff Assignments
          </div>
          <div className="mt-2 text-2xl font-bold">{stats.totalAssigned}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {stats.totalCompleted} completed
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CheckCircle2 className="size-4 text-amber-600" />
            Completion Rate
          </div>
          <div className="mt-2 text-2xl font-bold">{stats.overallRate}%</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Company-wide average
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search courses or topics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="ALL">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Status pills */}
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
              {[
                { id: "ALL", label: "All" },
                { id: "PUBLISHED", label: "Active" },
                { id: "DRAFT", label: "Drafts" },
                { id: "ARCHIVED", label: "Archived" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatus(tab.id)}
                  type="button"
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    selectedStatus === tab.id
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <CourseCreateDialog existingCategories={categories} assessments={assessments} />
        </div>
      </div>

      {/* Courses Grid */}
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
            <FolderOpen className="size-7" />
          </div>
          <h3 className="text-base font-semibold">No training courses found</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {search || selectedCategory !== "ALL" || selectedStatus !== "ALL"
              ? "No courses match your filter criteria. Try adjusting your search query or reset the filters."
              : "No courses have been created yet. Create your first course to upload videos, documents, and train staff on mobile."}
          </p>
          <div className="mt-5">
            <CourseCreateDialog existingCategories={categories} assessments={assessments} />
          </div>
        </div>
      )}
    </div>
  );
}
