"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  overtimeMinutes: initialOvertimeMinutes,
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
  overtimeMinutes?: number;
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

  // Overtime preset state: "30" | "60" | "120" | "custom"
  const defaultOt = initialOvertimeMinutes ?? 60;
  const [otPreset, setOtPreset] = useState<"30" | "60" | "120" | "custom">(
    defaultOt === 30 ? "30" : defaultOt === 60 ? "60" : defaultOt === 120 ? "120" : "custom",
  );
  const [overtimeMinutes, setOvertimeMinutes] = useState<number>(defaultOt);

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
      toast.success(saveState?.saved || clearState?.saved);
      router.refresh();
      const timer = setTimeout(() => {
        onClose();
      }, 500);
      return () => clearTimeout(timer);
    } else if (saveState?.error || clearState?.error) {
      toast.error(saveState?.error || clearState?.error);
    }
  }, [saveState, clearState, router, onClose]);

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
            onChange={(e) => {
              const nextType = e.target.value as ScheduleExceptionType;
              setType(nextType);
              if (nextType === ScheduleExceptionType.OVERTIME && (!reason || reason.startsWith("Scheduled Overtime"))) {
                setReason("Scheduled Overtime: 1 hour");
              }
            }}
            className="w-full"
          >
            <option value={ScheduleExceptionType.DAY_OFF}>Day off (Leave / Swap given away)</option>
            <option value={ScheduleExceptionType.OVERTIME}>Overtime (Extra hours)</option>
            <option value={ScheduleExceptionType.SHIFT_CHANGE}>Change shift for this day</option>
            <option value={ScheduleExceptionType.EXTRA_SHIFT}>Extra shift (Cover other branch/shift)</option>
          </NativeSelect>
        </div>

        {type === ScheduleExceptionType.OVERTIME && (
          <div className="space-y-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                Overtime Duration
              </Label>
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {overtimeMinutes >= 60
                  ? `${overtimeMinutes / 60} hour${overtimeMinutes / 60 > 1 ? "s" : ""}`
                  : `${overtimeMinutes} mins`}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <Button
                type="button"
                size="sm"
                variant={otPreset === "30" ? "default" : "outline"}
                className={`text-xs ${
                  otPreset === "30" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-500/30"
                }`}
                onClick={() => {
                  setOtPreset("30");
                  setOvertimeMinutes(30);
                  if (!reason || reason.startsWith("Scheduled Overtime")) {
                    setReason("Scheduled Overtime: 30 minutes");
                  }
                }}
              >
                30 mins
              </Button>
              <Button
                type="button"
                size="sm"
                variant={otPreset === "60" ? "default" : "outline"}
                className={`text-xs ${
                  otPreset === "60" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-500/30"
                }`}
                onClick={() => {
                  setOtPreset("60");
                  setOvertimeMinutes(60);
                  if (!reason || reason.startsWith("Scheduled Overtime")) {
                    setReason("Scheduled Overtime: 1 hour");
                  }
                }}
              >
                1 hour
              </Button>
              <Button
                type="button"
                size="sm"
                variant={otPreset === "120" ? "default" : "outline"}
                className={`text-xs ${
                  otPreset === "120" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-500/30"
                }`}
                onClick={() => {
                  setOtPreset("120");
                  setOvertimeMinutes(120);
                  if (!reason || reason.startsWith("Scheduled Overtime")) {
                    setReason("Scheduled Overtime: 2 hours");
                  }
                }}
              >
                2 hours
              </Button>
              <Button
                type="button"
                size="sm"
                variant={otPreset === "custom" ? "default" : "outline"}
                className={`text-xs ${
                  otPreset === "custom" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-500/30"
                }`}
                onClick={() => setOtPreset("custom")}
              >
                Custom
              </Button>
            </div>

            {otPreset === "custom" && (
              <div className="pt-1 flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={720}
                  step={15}
                  value={overtimeMinutes}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setOvertimeMinutes(val);
                    if (!reason || reason.startsWith("Scheduled Overtime")) {
                      const h = Math.floor(val / 60);
                      const m = val % 60;
                      const label =
                        h > 0
                          ? m > 0
                            ? `${h}h ${m}m`
                            : `${h} hour${h > 1 ? "s" : ""}`
                          : `${m} minutes`;
                      setReason(`Scheduled Overtime: ${label}`);
                    }
                  }}
                  className="w-28 text-sm"
                  placeholder="Minutes"
                />
                <span className="text-xs text-muted-foreground">
                  minutes ({overtimeMinutes >= 60 ? `${(overtimeMinutes / 60).toFixed(1)} hrs` : `${overtimeMinutes} mins`})
                </span>
              </div>
            )}

            <input type="hidden" name="overtimeMinutes" value={overtimeMinutes} />
            <input type="hidden" name="shiftId" value={currentShiftId ?? ""} />
          </div>
        )}

        {type !== ScheduleExceptionType.DAY_OFF && type !== ScheduleExceptionType.OVERTIME && (
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
  overtimeMinutes,
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
  overtimeMinutes?: number;
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
            overtimeMinutes={overtimeMinutes}
            shifts={shifts}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
