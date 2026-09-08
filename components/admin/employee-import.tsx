"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import {
  commitEmployeeImport,
  previewEmployeeImport,
  type EmployeeImportCounts,
  type EmployeeImportResult,
  type ResolvedImportRow,
} from "@/lib/modules/employees/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_LABEL: Record<ResolvedImportRow["status"], string> = {
  ready: "ready",
  duplicate: "already exists",
  manual: "needs manual entry",
  blocked: "blocked",
};

const STATUS_VARIANT: Record<ResolvedImportRow["status"], "default" | "secondary" | "outline" | "destructive"> = {
  ready: "default",
  duplicate: "secondary",
  manual: "outline",
  blocked: "destructive",
};

function CountsSummary({ counts }: { counts: EmployeeImportCounts }) {
  return (
    <p className="text-sm text-muted-foreground">
      {counts.total} rows: <strong className="text-foreground">{counts.ready} ready to import</strong>
      {counts.duplicate > 0 && `, ${counts.duplicate} already on record`}
      {counts.manual > 0 && `, ${counts.manual} need manual entry`}
      {counts.blocked > 0 && `, ${counts.blocked} blocked`}.
    </p>
  );
}

function ProblemRows({ rows }: { rows: ResolvedImportRow[] }) {
  const problems = rows.filter((row) => row.status !== "ready");
  if (problems.length === 0) return null;

  return (
    <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Row</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Why</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {problems.map((row) => (
            <TableRow key={row.rowNumber}>
              <TableCell className="text-xs text-muted-foreground">{row.rowNumber}</TableCell>
              <TableCell>{row.employeeName}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{row.department}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{row.issues.join(" ")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EmployeeImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ rows: ResolvedImportRow[]; counts: EmployeeImportCounts } | null>(null);
  const [result, setResult] = useState<EmployeeImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function handlePreview() {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const response = await previewEmployeeImport(formData);
      if ("error" in response) {
        setError(response.error);
        return;
      }
      setPreview(response);
    });
  }

  function handleConfirm() {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const response = await commitEmployeeImport(formData);
      if ("error" in response) {
        setError(response.error);
        return;
      }
      setResult(response);
    });
  }

  return (
    <div className="max-w-3xl space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            Created {result.counts.ready} employees.
            {result.counts.duplicate > 0 && ` ${result.counts.duplicate} were already on record and skipped.`}
            {(result.counts.manual > 0 || result.counts.blocked > 0) &&
              " See below for rows that still need attention."}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="import-file">Employee export (.xlsx)</Label>
          <Input id="import-file" type="file" accept=".xlsx" onChange={handleFileChange} />
          <p className="text-xs text-muted-foreground">
            Expects the same columns as an Odoo &ldquo;hr.employee&rdquo; export: Department,
            Employee Name, Job Position, Work Email, Work Phone. Department decides the branch —
            a department that names a branch (e.g. &ldquo;Achimota Branch Management&rdquo;) is
            assigned there; anything else goes to Head Office.
          </p>
        </div>
      )}

      {!result && (
        <div className="flex gap-2">
          <Button type="button" onClick={handlePreview} disabled={!file || isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Preview
          </Button>
          {preview && preview.counts.ready > 0 && (
            <Button type="button" variant="outline" onClick={handleConfirm} disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Confirm import ({preview.counts.ready})
            </Button>
          )}
        </div>
      )}

      {preview && !result && (
        <div className="space-y-3">
          <CountsSummary counts={preview.counts} />
          <ProblemRows rows={preview.rows} />
        </div>
      )}

      {result && <ProblemRows rows={result.problemRows} />}
    </div>
  );
}
