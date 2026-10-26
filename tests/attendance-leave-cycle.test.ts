import { describe, expect, it } from "vitest";
import {
  normalizeJobCategory,
  calculateProbationEndDate,
  isProbationCleared,
  getIsoWeekString,
  getDatesFromIsoWeek,
  getAllWeeksInYear,
} from "@/lib/modules/attendance/leave-cycle";

describe("Annual Leave & Anti-Collision Engine", () => {
  describe("Job Category Normalization (Anti-Collision grouping)", () => {
    it("categorizes kitchen cooking staff into COOK", () => {
      expect(normalizeJobCategory("Head Cook")).toBe("COOK");
      expect(normalizeJobCategory("Line Cook")).toBe("COOK");
      expect(normalizeJobCategory("Chef de Partie")).toBe("COOK");
      expect(normalizeJobCategory("Baker")).toBe("COOK");
      expect(normalizeJobCategory("Grill Master")).toBe("COOK");
    });

    it("categorizes customer-facing staff into FRONT_OF_HOUSE", () => {
      expect(normalizeJobCategory("Cashier")).toBe("FRONT_OF_HOUSE");
      expect(normalizeJobCategory("Waitress")).toBe("FRONT_OF_HOUSE");
      expect(normalizeJobCategory("Host / Hostess")).toBe("FRONT_OF_HOUSE");
      expect(normalizeJobCategory("Barista")).toBe("FRONT_OF_HOUSE");
    });

    it("categorizes sanitation staff into CLEANER", () => {
      expect(normalizeJobCategory("Dishwasher")).toBe("CLEANER");
      expect(normalizeJobCategory("Sanitation Staff")).toBe("CLEANER");
      expect(normalizeJobCategory("Kitchen Cleaner")).toBe("CLEANER");
    });

    it("categorizes leadership roles into SUPERVISOR", () => {
      expect(normalizeJobCategory("Shift Supervisor")).toBe("SUPERVISOR");
      expect(normalizeJobCategory("Branch Manager")).toBe("SUPERVISOR");
      expect(normalizeJobCategory("Assistant Manager")).toBe("SUPERVISOR");
      expect(normalizeJobCategory("Floor Lead")).toBe("SUPERVISOR");
    });

    it("falls back to OTHER for unrecognized titles", () => {
      expect(normalizeJobCategory(null)).toBe("OTHER");
      expect(normalizeJobCategory("Consultant")).toBe("OTHER");
    });
  });

  describe("12-Month Probation Rule", () => {
    it("calculates exact 12-month probation anniversary", () => {
      const hireDate = new Date("2025-06-15T00:00:00.000Z");
      const probationEnd = calculateProbationEndDate(hireDate);
      expect(probationEnd.toISOString().split("T")[0]).toBe("2026-06-15");
    });

    it("evaluates probation clearance accurately", () => {
      const employee = {
        probationEndDate: new Date("2026-06-15T00:00:00.000Z"),
      };

      // Before anniversary -> blocked
      expect(isProbationCleared(employee, new Date("2026-06-14T00:00:00.000Z"))).toBe(false);

      // On anniversary -> cleared
      expect(isProbationCleared(employee, new Date("2026-06-15T00:00:00.000Z"))).toBe(true);

      // After anniversary -> cleared
      expect(isProbationCleared(employee, new Date("2026-07-01T00:00:00.000Z"))).toBe(true);

      // If no probation end date or hire date is set -> cleared
      expect(isProbationCleared({}, new Date("2026-01-01T00:00:00.000Z"))).toBe(true);
    });
  });

  describe("ISO Week Date Calculations", () => {
    it("generates correct ISO week string for given dates", () => {
      // 2026-01-05 is Monday of Week 2
      const dateW2 = new Date("2026-01-05T00:00:00.000Z");
      expect(getIsoWeekString(dateW2)).toBe("2026-W02");
    });

    it("derives Monday to Sunday dates from ISO week string", () => {
      const { startDate, endDate } = getDatesFromIsoWeek("2026-W10");
      expect(startDate.getUTCDay()).toBe(1); // Monday
      expect(endDate.getUTCDay()).toBe(0); // Sunday

      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(6); // 7 days total (Mon to Sun)
    });

    it("generates all 52 weeks in a standard year", () => {
      const weeks = getAllWeeksInYear(2026);
      expect(weeks.length).toBeGreaterThanOrEqual(52);
      expect(weeks[0]).toBe("2026-W01");
      expect(weeks[weeks.length - 1]).toMatch(/^2026-W5[23]$/);
    });
  });
});
