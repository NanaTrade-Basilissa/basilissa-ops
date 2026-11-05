export const DEPARTMENTS = {
  KITCHEN: "KITCHEN",
  SERVICE: "SERVICE",
  SANITATION: "SANITATION",
  MANAGEMENT: "MANAGEMENT",
  OTHER: "OTHER",
} as const;

export type DepartmentKey = (typeof DEPARTMENTS)[keyof typeof DEPARTMENTS];

export const DEPARTMENT_OPTIONS: { id: DepartmentKey; label: string; description: string }[] = [
  {
    id: "KITCHEN",
    label: "Kitchen / Production",
    description: "Chefs, Cooks, Bakers, Kitchen Assistants, Food Prep",
  },
  {
    id: "SERVICE",
    label: "Service / Front of House",
    description: "Cashiers, Frontliners, Waitstaff, Baristas, Dispatch Riders",
  },
  {
    id: "SANITATION",
    label: "Sanitation / Cleaners",
    description: "Cleaners, Utilities, Stewards, Dishwashers, Janitorial",
  },
  {
    id: "MANAGEMENT",
    label: "Branch Management",
    description: "Branch Managers, Supervisors, Shift Leads, Assistant In-Charge",
  },
  {
    id: "OTHER",
    label: "Other / Support",
    description: "Head Office, Administration, Trainees, Uncategorized",
  },
];

export const DEPARTMENT_LABELS: Record<string, string> = {
  KITCHEN: "Kitchen",
  SERVICE: "Service",
  SANITATION: "Sanitation",
  MANAGEMENT: "Management",
  OTHER: "Other",
  // Legacy aliases for backward compatibility
  COOK: "Kitchen",
  FRONT_OF_HOUSE: "Service",
  CLEANER: "Sanitation",
  SUPERVISOR: "Management",
};

/**
 * Intelligently infers a standard functional department from an employee's job title string.
 */
export function inferDepartmentFromJobTitle(jobTitle?: string | null): DepartmentKey {
  if (!jobTitle) return "OTHER";
  const title = jobTitle.toLowerCase().trim();

  // Sanitation / Utility checks
  if (
    title.includes("clean") ||
    title.includes("dish") ||
    title.includes("sanit") ||
    title.includes("utility") ||
    title.includes("porter") ||
    title.includes("janitor") ||
    title.includes("steward")
  ) {
    return "SANITATION";
  }

  // Management / Leadership checks
  if (
    title.includes("manager") ||
    title.includes("supervisor") ||
    title.includes("lead") ||
    title.includes("in-charge") ||
    title.includes("director") ||
    title.includes("coordinator")
  ) {
    return "MANAGEMENT";
  }

  // Kitchen / Culinary checks
  if (
    title.includes("cook") ||
    title.includes("chef") ||
    title.includes("kitchen") ||
    title.includes("pastry") ||
    title.includes("baker") ||
    title.includes("grill") ||
    title.includes("fry") ||
    title.includes("culinary") ||
    title.includes("prep")
  ) {
    return "KITCHEN";
  }

  // Service / Guest facing checks
  if (
    title.includes("cashier") ||
    title.includes("wait") ||
    title.includes("server") ||
    title.includes("counter") ||
    title.includes("front") ||
    title.includes("host") ||
    title.includes("barista") ||
    title.includes("rider") ||
    title.includes("dispatch")
  ) {
    return "SERVICE";
  }

  return "OTHER";
}

/**
 * Returns the effective department for an employee, prioritizing explicit department
 * assignment, and falling back to job title inference.
 */
export function resolveEmployeeDepartment(employee?: {
  department?: string | null;
  jobTitle?: string | null;
} | null): DepartmentKey {
  if (!employee) return "OTHER";
  if (employee.department && employee.department in DEPARTMENT_LABELS) {
    return normalizeDepartmentKey(employee.department);
  }
  return inferDepartmentFromJobTitle(employee.jobTitle);
}

/**
 * Normalizes legacy role categories (e.g. "COOK" -> "KITCHEN") to the modern DepartmentKey.
 */
export function normalizeDepartmentKey(key: string): DepartmentKey {
  const upper = key.toUpperCase().trim();
  switch (upper) {
    case "COOK":
    case "KITCHEN":
      return "KITCHEN";
    case "FRONT_OF_HOUSE":
    case "SERVICE":
      return "SERVICE";
    case "CLEANER":
    case "SANITATION":
      return "SANITATION";
    case "SUPERVISOR":
    case "MANAGEMENT":
      return "MANAGEMENT";
    default:
      return (DEPARTMENTS as Record<string, string>)[upper] ? (upper as DepartmentKey) : "OTHER";
  }
}
