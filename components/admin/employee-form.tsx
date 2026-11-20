"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { FormState } from "@/lib/platform/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DEPARTMENT_OPTIONS } from "@/lib/modules/employees/constants";

export type EmployeeValues = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  department?: string;
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  hireDate: string;
};

export function EmployeeForm({
  action,
  defaultValues,
  submitLabel,
  onSuccess,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: EmployeeValues;
  submitLabel: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, undefined);
  const errors = state?.fieldErrors ?? {};
  const [odooJobTitles, setOdooJobTitles] = useState<string[]>([]);
  const [odooDepartments, setOdooDepartments] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/odoo/catalog")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.ok) return;
        if (Array.isArray(data.jobTitles)) {
          setOdooJobTitles(data.jobTitles.map((j: { name: string }) => j.name));
        }
        if (Array.isArray(data.departments)) {
          setOdooDepartments(data.departments.map((d: { name: string }) => d.name));
        }
      })
      .catch(() => {
        // fallback to defaults
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state?.success) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="max-w-lg space-y-5" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="employeeCode">Employee code</Label>
        <Input
          id="employeeCode"
          name="employeeCode"
          required
          defaultValue={defaultValues?.employeeCode}
          placeholder="E001"
        />
        <p className="text-xs text-muted-foreground">
          Basilissa&rsquo;s own identifier. It stays the same whatever Odoo later calls
          this person, so it is what everything else references.
        </p>
        {errors.employeeCode && <p className="text-xs text-destructive">{errors.employeeCode}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required defaultValue={defaultValues?.firstName} />
          {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" required defaultValue={defaultValues?.lastName} />
          {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">
          Email <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaultValues?.email}
          aria-describedby="email-hint"
        />
        <p id="email-hint" className="text-xs text-muted-foreground">
          Not a login. Most staff never get one. This is how things like an assessment
          invitation reach them.
        </p>
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">
          Phone <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input id="phone" name="phone" type="tel" defaultValue={defaultValues?.phone} />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="jobTitle">Job title</Label>
          {odooJobTitles.length > 0 ? (
            <NativeSelect id="jobTitle" name="jobTitle" defaultValue={defaultValues?.jobTitle ?? ""}>
              <option value="">Select job title...</option>
              {defaultValues?.jobTitle && !odooJobTitles.includes(defaultValues.jobTitle) && (
                <option value={defaultValues.jobTitle}>{defaultValues.jobTitle}</option>
              )}
              {odooJobTitles.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <Input id="jobTitle" name="jobTitle" defaultValue={defaultValues?.jobTitle} placeholder="e.g. Cook, Frontliner" />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="department">Department</Label>
          <NativeSelect id="department" name="department" defaultValue={defaultValues?.department ?? ""}>
            <option value="">Select department...</option>
            {defaultValues?.department &&
              !(odooDepartments.length > 0
                ? odooDepartments.includes(defaultValues.department)
                : DEPARTMENT_OPTIONS.some((d) => d.id === defaultValues.department)) && (
                <option value={defaultValues.department}>{defaultValues.department}</option>
              )}
            {odooDepartments.length > 0
              ? odooDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))
              : DEPARTMENT_OPTIONS.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.label}
                  </option>
                ))}
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" name="status" defaultValue={defaultValues?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="TERMINATED">Terminated</option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Only active employees can clock in. The record is kept either way, so
            attendance history stays attributable.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hireDate">Hire date</Label>
          <Input id="hireDate" name="hireDate" type="date" defaultValue={defaultValues?.hireDate} />
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {submitLabel}
      </Button>
    </form>
  );
}
