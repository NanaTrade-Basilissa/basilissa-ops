"use client";

import { useTransition } from "react";
import { CalendarArrowDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { TopActionsBar } from "@/components/admin/top-actions-bar";
import { HolidayDialog } from "@/components/admin/holiday-dialog";
import { importCalendarHolidaysAction } from "@/lib/modules/attendance/actions";

export function HolidayTopActions({ year }: { year: number }) {
  const [isPending, startTransition] = useTransition();

  function loadCalendar() {
    startTransition(async () => {
      const result = await importCalendarHolidaysAction(year);
      if (!result.ok) {
        toast.error(result.error ?? "Could not load the calendar.");
        return;
      }
      toast.success(
        result.added
          ? `Added ${result.added} holiday${result.added === 1 ? "" : "s"} for ${year}.`
          : `Every ${year} calendar holiday is already in the list.`,
      );
    });
  }

  return (
    <TopActionsBar
      primaryAction={{
        label: "Add holiday",
        icon: Plus,
        dialog: (props) => <HolidayDialog defaultDateKey={`${year}-01-01`} {...props} />,
      }}
      secondaryActions={[
        {
          label: isPending ? "Loading…" : `Load ${year} Ghana holidays`,
          icon: CalendarArrowDown,
          onClick: loadCalendar,
          disabled: isPending,
        },
      ]}
    />
  );
}
