"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { ScheduleExceptionType } from "@prisma/client";
import {
  saveScheduleOverride,
  clearScheduleOverride,
  type ScheduleOverrideState,
} from "@/lib/modules/attendance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function ScheduleOverrideForm({
  employeeId,
  employeeName,
  branchId,
  dateKey,
  formattedDate,
  currentShiftId,
  currentShiftName,
  isException,
  exceptionId,
  exceptionType,
  exceptionReason,
  shifts,
  onClose,
}: {
  employeeId: string;
  employeeName: string;
  branchId: string;
  dateKey: string;
  formattedDate: string;
  currentShiftId: string | null;
  currentShiftName: string | null;
  isException: boolean;
  exceptionId?: string;
  exceptionType?: ScheduleExceptionType;
  exceptionReason?: string;
  shifts: { id: string; name: string; startMinute: number; endMinute: number }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const formId = useId();

  const [type, setType] = useState<ScheduleExceptionType>(
    exceptionType ?? (currentShiftId ? ScheduleExceptionType.SHIFT_CHANGE : ScheduleExceptionType.EXTRA_SHIFT),
  );
  const [shiftId, setShiftId] = useState<string>(currentShiftId ?? (shifts[0]?.id || ""));
  const [reason, setReason] = useState<string>(exceptionReason ?? "");

  const [saveState, saveAction, isSaving] = useActionState<ScheduleOverrideState, FormData>(
    saveScheduleOverride,
    undefined,
  );
  const [clearState, clearAction, isClearing] = useActionState<ScheduleOverrideState, FormData>(
    clearScheduleOverride,
    undefined,
  );

  useEffect(() => {
    if (saveState?.saved || clearState?.saved) {
      router.refresh();
      const timer = setTimeout(() => {
        onClose();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [saveState?.saved, clearState?.saved, router, onClose]);

  const isPending = isSaving || isClearing;

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" />
          Schedule override
        </DialogTitle>
        <DialogDescription>
          {employeeName} · {formattedDate}
        </DialogDescription>
      </DialogHeader>

      {saveState?.error && (
        <Alert variant="destructive">
          <AlertDescription>{saveState.error}</AlertDescription>
        </Alert>
      )}

      {clearState?.error && (
        <Alert variant="destructive">
          <AlertDescription>{clearState.error}</AlertDescription>
        </Alert>
      )}

      {(saveState?.saved || clearState?.saved) && (
        <Alert>
          <CheckCircle2 className="size-4 text-emerald-600" />
          <AlertDescription className="text-emerald-800 dark:text-emerald-200">
            {saveState?.saved || clearState?.saved}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
        <div className="text-muted-foreground">Standard / Current Schedule:</div>
        <div className="font-medium text-foreground">
          {currentShiftName ? currentShiftName : "Not scheduled"}
          {isException && (
            <span className="ml-2 text-amber-600 dark:text-amber-400 font-normal">
              (currently has an override)
            </span>
          )}
        </div>
      </div>

      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="branchId" value={branchId} />
        <input type="hidden" name="dateKey" value={dateKey} />

        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-type`}>Override action</Label>
          <NativeSelect
            id={`${formId}-type`}
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as ScheduleExceptionType)}
            className="w-full"
          >
            <option value={ScheduleExceptionType.DAY_OFF}>Day off (Leave / Swap given away)</option>
            <option value={ScheduleExceptionType.SHIFT_CHANGE}>Change shift for this day</option>
            <option value={ScheduleExceptionType.EXTRA_SHIFT}>Extra shift (Cover / Overtime)</option>
          </NativeSelect>
        </div>

        {type !== ScheduleExceptionType.DAY_OFF && (
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-shift`}>Select shift</Label>
            <NativeSelect
              id={`${formId}-shift`}
              name="shiftId"
              required
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              className="w-full"
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-reason`}>
            Reason <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${formId}-reason`}
            name="reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Covering for Sarah / Personal leave / Requested swap"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          {isException && exceptionId ? (
            <form action={clearAction}>
              <input type="hidden" name="exceptionId" value={exceptionId} />
              <input type="hidden" name="branchId" value={branchId} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={isPending}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 px-2"
              >
                <Trash2 className="size-3.5" />
                Remove override
              </Button>
            </form>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isSaving && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Save override
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function ScheduleOverrideDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  branchId,
  dateKey,
  formattedDate,
  currentShiftId,
  currentShiftName,
  isException,
  exceptionId,
  exceptionType,
  exceptionReason,
  shifts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  branchId: string;
  dateKey: string;
  formattedDate: string;
  currentShiftId: string | null;
  currentShiftName: string | null;
  isException: boolean;
  exceptionId?: string;
  exceptionType?: ScheduleExceptionType;
  exceptionReason?: string;
  shifts: { id: string; name: string; startMinute: number; endMinute: number }[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <ScheduleOverrideForm
            key={`${employeeId}-${dateKey}`}
            employeeId={employeeId}
            employeeName={employeeName}
            branchId={branchId}
            dateKey={dateKey}
            formattedDate={formattedDate}
            currentShiftId={currentShiftId}
            currentShiftName={currentShiftName}
            isException={isException}
            exceptionId={exceptionId}
            exceptionType={exceptionType}
            exceptionReason={exceptionReason}
            shifts={shifts}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
