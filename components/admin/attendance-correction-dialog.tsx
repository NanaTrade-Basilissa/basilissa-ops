"use client";

import { useActionState, useEffect, useState } from "react";
import { Clock, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatAccraTime } from "@/lib/platform/date";
import type { AttendanceActionState } from "@/lib/modules/attendance/actions";
import { correctAttendance } from "@/lib/modules/attendance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const REASONS: [string, string][] = [
  ["DEVICE_CLOCK_WRONG", "Terminal clock was incorrect"],
  ["FORGOT_TO_PUNCH", "Employee forgot to punch"],
  ["DUPLICATE_PUNCH", "Accidental duplicate punch"],
  ["WRONG_EMPLOYEE", "Punched under wrong employee"],
  ["DISPUTE_RESOLVED", "Attendance dispute resolved"],
  ["OTHER", "Other reason"],
];

type PunchEvent = {
  id: string;
  direction: string;
  occurredAt: Date | string;
  isVoided?: boolean;
  providerType: string;
};

export function AttendanceCorrectionDialog({
  employeeId,
  branchId,
  dateKey,
  events,
  initialEventId,
  initialOperation = "ADJUST_TIME",
  trigger,
}: {
  employeeId: string;
  branchId: string;
  dateKey: string;
  events: PunchEvent[];
  initialEventId?: string;
  initialOperation?: "ADJUST_TIME" | "VOID_EVENT" | "INSERT_EVENT";
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false);
  const [operation, setOperation] = useState<"ADJUST_TIME" | "VOID_EVENT" | "INSERT_EVENT">(
    initialOperation
  );
  const [selectedEventId, setSelectedEventId] = useState<string>(
    initialEventId ?? events[0]?.id ?? ""
  );
  const [correctedTime, setCorrectedTime] = useState(() => {
    const ev = initialEventId ? events.find((e) => e.id === initialEventId) : events[0];
    if (ev) {
      const dt = new Date(ev.occurredAt);
      return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
    }
    return "";
  });
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [reasonCode, setReasonCode] = useState<string>("FORGOT_TO_PUNCH");
  const [reasonText, setReasonText] = useState("");

  const boundAction = correctAttendance.bind(null, employeeId, branchId, dateKey);
  const [state, formAction, isPending] = useActionState<AttendanceActionState, FormData>(
    boundAction,
    undefined
  );

  useEffect(() => {
    if (state?.saved) {
      toast.success(state.saved);
      const timer = setTimeout(() => {
        setOpen(false);
        setConfirmVoidOpen(false);
        setReasonText("");
      }, 0);
      return () => clearTimeout(timer);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  const activeEvents = events.filter((e) => !e.isVoided);

  const handleSubmit = (formData: FormData) => {
    // If time was entered as HH:MM, construct ISO date string combining dateKey and time
    if (operation === "ADJUST_TIME" || operation === "INSERT_EVENT") {
      if (correctedTime) {
        const fullIso = `${dateKey}T${correctedTime}:00`;
        formData.set("correctedOccurredAt", fullIso);
      }
    }
    formAction(formData);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            trigger ?? (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Settings2 className="size-3.5" />
                Correct attendance
              </Button>
            )
          }
        />
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              Attendance Correction
            </DialogTitle>
            <DialogDescription>
              Adjust timestamps, insert missing punches, or void incorrect punches.
              Original punches remain in the immutable audit trail.
            </DialogDescription>
          </DialogHeader>

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <form action={handleSubmit} className="space-y-4">
            <input type="hidden" name="operation" value={operation} />

            {/* Operation Type Switcher */}
            <div className="space-y-1.5">
              <Label>Correction Type</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setOperation("ADJUST_TIME")}
                  className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center text-xs font-medium transition-colors ${
                    operation === "ADJUST_TIME"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <Clock className="size-4 mb-1" />
                  Adjust time
                </button>
                <button
                  type="button"
                  onClick={() => setOperation("INSERT_EVENT")}
                  className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center text-xs font-medium transition-colors ${
                    operation === "INSERT_EVENT"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <Plus className="size-4 mb-1" />
                  Insert punch
                </button>
                <button
                  type="button"
                  onClick={() => setOperation("VOID_EVENT")}
                  className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center text-xs font-medium transition-colors ${
                    operation === "VOID_EVENT"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <Trash2 className="size-4 mb-1" />
                  Void punch
                </button>
              </div>
            </div>

            {/* Target Punch Selection (for ADJUST_TIME and VOID_EVENT) */}
            {operation !== "INSERT_EVENT" && (
              <div className="space-y-1.5">
                <Label htmlFor="targetEventId">Target recorded punch</Label>
                {activeEvents.length > 0 ? (
                  <NativeSelect
                    id="targetEventId"
                    name="targetEventId"
                    value={selectedEventId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setSelectedEventId(newId);
                      const ev = activeEvents.find((x) => x.id === newId);
                      if (ev) {
                        const dt = new Date(ev.occurredAt);
                        setCorrectedTime(
                          `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`
                        );
                      }
                    }}
                    required
                  >
                    {activeEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {formatAccraTime(new Date(event.occurredAt))} -{" "}
                        {event.direction.toLowerCase().replace("_", " ")} ({event.providerType})
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No active punches recorded for this day. Use &ldquo;Insert punch&rdquo; instead.
                  </p>
                )}
              </div>
            )}

            {/* Direction Selection (for INSERT_EVENT) */}
            {operation === "INSERT_EVENT" && (
              <div className="space-y-1.5">
                <Label htmlFor="direction">Direction</Label>
                <NativeSelect
                  id="direction"
                  name="direction"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "IN" | "OUT")}
                >
                  <option value="IN">Clock In</option>
                  <option value="OUT">Clock Out</option>
                </NativeSelect>
              </div>
            )}

            {/* Corrected / Actual Punch Time */}
            {operation !== "VOID_EVENT" && (
              <div className="space-y-1.5">
                <Label htmlFor="timeInput">
                  {operation === "ADJUST_TIME" ? "Corrected punch time" : "Punch time"}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="timeInput"
                    type="time"
                    required
                    value={correctedTime}
                    onChange={(e) => setCorrectedTime(e.target.value)}
                    className="w-40 font-mono"
                  />
                  <span className="text-xs text-muted-foreground">Accra local time (GMT)</span>
                </div>
              </div>
            )}

            {/* Void Explanation Warning */}
            {operation === "VOID_EVENT" && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                Voiding this punch will remove it from the settled day calculation. The punch record
                will be marked as set aside and retained in the audit history.
              </div>
            )}

            {/* Audit Reason Code */}
            <div className="space-y-1.5">
              <Label htmlFor="reasonCode">Audit reason *</Label>
              <NativeSelect
                id="reasonCode"
                name="reasonCode"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                required
              >
                {REASONS.map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {/* Reason Details */}
            <div className="space-y-1.5">
              <Label htmlFor="reasonText">
                Explanation notes {reasonCode === "OTHER" && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                id="reasonText"
                name="reasonText"
                rows={2}
                required={reasonCode === "OTHER"}
                placeholder="e.g. Employee verified arrival with branch supervisor."
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              {operation === "VOID_EVENT" ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending || !selectedEventId}
                  onClick={() => setConfirmVoidOpen(true)}
                >
                  Void punch
                </Button>
              ) : (
                <Button type="submit" disabled={isPending || (operation === "ADJUST_TIME" && !selectedEventId)}>
                  {isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                  Apply correction
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation for Destructive Void Punch */}
      <AlertDialog open={confirmVoidOpen} onOpenChange={setConfirmVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this attendance punch?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void this punch? The punch will no longer count towards worked
              hours or punctuality, and the day will be recalculated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <form action={handleSubmit}>
              <input type="hidden" name="operation" value="VOID_EVENT" />
              <input type="hidden" name="targetEventId" value={selectedEventId} />
              <input type="hidden" name="reasonCode" value={reasonCode} />
              <input type="hidden" name="reasonText" value={reasonText} />
              <AlertDialogAction
                type="submit"
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                Confirm void
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
