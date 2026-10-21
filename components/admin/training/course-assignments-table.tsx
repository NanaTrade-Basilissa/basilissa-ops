"use client";

import { useState, useMemo } from "react";
import {
  Users,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Loader2,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { assignCourseEmployeesAction } from "@/lib/modules/training/actions";
import { cn } from "@/lib/utils";

export type AssignmentRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  jobTitle: string;
  branchName: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  assignedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  dueAt: Date | null;
  quizScore: number | null;
  quizPassed: boolean | null;
  completedMaterialsCount: number;
};

export type AvailableEmployee = {
  id: string;
  name: string;
  code: string;
  jobTitle: string | null;
  branchName: string;
};

export function CourseAssignmentsTable({
  courseId,
  assignments,
  totalMaterials,
  availableEmployees = [],
  onAssigned,
}: {
  courseId: string;
  assignments: AssignmentRow[];
  totalMaterials: number;
  availableEmployees?: AvailableEmployee[];
  onAssigned?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Assignment Modal State
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  // Filtered rows
  const filtered = useMemo(() => {
    return assignments.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = row.employeeName.toLowerCase().includes(q);
        const matchesCode = row.employeeCode.toLowerCase().includes(q);
        const matchesBranch = row.branchName.toLowerCase().includes(q);
        const matchesJob = row.jobTitle.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesBranch && !matchesJob) return false;
      }
      return true;
    });
  }, [assignments, search, statusFilter]);

  // Employees not yet assigned
  const unassignedEmployees = useMemo(() => {
    const assignedIds = new Set(assignments.map((a) => a.employeeId));
    return availableEmployees.filter((emp) => !assignedIds.has(emp.id));
  }, [availableEmployees, assignments]);

  const filteredUnassigned = useMemo(() => {
    if (!assignSearch.trim()) return unassignedEmployees;
    const q = assignSearch.toLowerCase();
    return unassignedEmployees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        e.branchName.toLowerCase().includes(q)
    );
  }, [unassignedEmployees, assignSearch]);

  async function handleAssignSubmit() {
    if (selectedEmpIds.length === 0) {
      toast.error("Please select at least one employee.");
      return;
    }

    setAssigning(true);
    try {
      const res = await assignCourseEmployeesAction({
        courseId,
        employeeIds: selectedEmpIds,
      });

      if (res.success) {
        toast.success(res.message || "Employees assigned successfully!");
        setAssignOpen(false);
        setSelectedEmpIds([]);
        onAssigned?.();
      } else {
        toast.error(res.error || "Failed to assign employees.");
      }
    } catch {
      toast.error("Error assigning employees.");
    } finally {
      setAssigning(false);
    }
  }

  function toggleEmployee(id: string) {
    setSelectedEmpIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function selectAllFiltered() {
    const allFilteredIds = filteredUnassigned.map((e) => e.id);
    setSelectedEmpIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
  }

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search staff, branch, or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="OVERDUE">Overdue</option>
          </select>
        </div>

        {/* Assign Button & Dialog */}
        <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
          <DialogTrigger
            render={
              <Button size="sm" className="gap-1.5 text-xs">
                <Plus className="size-3.5" />
                Assign More Staff
              </Button>
            }
          />
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                Assign Employees to Training Course
              </DialogTitle>
              <DialogDescription className="text-xs">
                Select employees who need to complete this module on their mobile app.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter available employees..."
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  className="h-9 pl-9 text-xs"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {selectedEmpIds.length} employee{selectedEmpIds.length === 1 ? "" : "s"} selected
                </span>
                {filteredUnassigned.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-primary hover:underline font-medium"
                  >
                    Select All ({filteredUnassigned.length})
                  </button>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                {filteredUnassigned.length > 0 ? (
                  filteredUnassigned.map((emp) => {
                    const isSelected = selectedEmpIds.includes(emp.id);
                    return (
                      <div
                        key={emp.id}
                        onClick={() => toggleEmployee(emp.id)}
                        className={`flex cursor-pointer items-center justify-between p-2.5 text-xs transition-colors hover:bg-muted/50 ${
                          isSelected ? "bg-primary/5" : ""
                        }`}
                      >
                        <div>
                          <p className="font-semibold">{emp.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {emp.code} • {emp.jobTitle || "Staff"} • {emp.branchName}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="size-4 rounded border-input text-primary accent-primary"
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No unassigned employees found.
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssignOpen(false)}
                disabled={assigning}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAssignSubmit}
                disabled={assigning || selectedEmpIds.length === 0}
                className="gap-2"
              >
                {assigning && <Loader2 className="size-3.5 animate-spin" />}
                Assign ({selectedEmpIds.length})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Assigned Date</th>
              <th className="px-4 py-3">Completed Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.length > 0 ? (
              filtered.map((row) => {
                const percent =
                  totalMaterials > 0
                    ? Math.round((row.completedMaterialsCount / totalMaterials) * 100)
                    : 0;

                return (
                  <tr key={row.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{row.employeeName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.employeeCode} • {row.jobTitle}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.branchName}</td>
                    <td className="px-4 py-3">
                      {row.status === "COMPLETED" && (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-2 py-0.5">
                          Completed
                        </Badge>
                      )}
                      {row.status === "IN_PROGRESS" && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-[10px] px-2 py-0.5">
                          In Progress
                        </Badge>
                      )}
                      {row.status === "NOT_STARTED" && (
                        <Badge variant="outline" className="text-muted-foreground text-[10px] px-2 py-0.5">
                          Not Started
                        </Badge>
                      )}
                      {row.status === "OVERDUE" && (
                        <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                          Overdue
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={percent} className="h-1.5 w-20" />
                        <span className="font-medium text-muted-foreground text-[11px]">
                          {row.completedMaterialsCount}/{totalMaterials}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(row.assignedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.completedAt ? new Date(row.completedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No employee assignments found for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
