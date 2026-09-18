/**
 * Centralized Permission Registry.
 *
 * Implements the "Resource + Action = Permission" model.
 * The registry is the single source of truth for:
 *   - Available resources
 *   - Actions permitted on each resource
 *   - Human-readable labels and descriptions
 *   - Generating the permission matrix for the Roles & Permissions UI
 */

import type { PrismaClient } from "@prisma/client";

export type ActionDefinition = {
  label: string;
  description?: string;
};

export type ResourceDefinition = {
  label: string;
  description?: string;
  actions: Record<string, ActionDefinition>;
};

export const PERMISSION_REGISTRY = {
  employees: {
    label: "Employees",
    description: "Employee records and staff directory",
    actions: {
      create: { label: "Create", description: "Add new employee records" },
      read: { label: "View", description: "View employee profiles and records" },
      update: { label: "Update", description: "Edit employee information and branch assignments" },
      delete: { label: "Delete", description: "Terminate or delete employee records" },
      export: { label: "Export", description: "Export employee lists to CSV/Excel" },
    },
  },
  attendance: {
    label: "Attendance",
    description: "Time and attendance tracking, logs, and timesheets",
    actions: {
      create: { label: "Create", description: "Record manual punches and attendance entries" },
      read: { label: "View", description: "View attendance records, logs, and timesheets" },
      update: { label: "Update", description: "Modify attendance events and timesheets" },
      delete: { label: "Delete", description: "Delete attendance entries" },
      approve: { label: "Approve", description: "Approve attendance corrections and overtime" },
      export: { label: "Export", description: "Export attendance timesheets to Excel" },
    },
  },
  assessments: {
    label: "Assessments",
    description: "Internal staff assessments and evaluations",
    actions: {
      create: { label: "Create", description: "Create assessments and questions" },
      read: { label: "View", description: "View assessments, responses, and score reports" },
      update: { label: "Update", description: "Edit assessment details, questions, and settings" },
      delete: { label: "Delete", description: "Delete assessments" },
      publish: { label: "Publish", description: "Publish or unpublish assessments" },
      assign: { label: "Assign", description: "Issue and email assessment invitations" },
    },
  },
  aptitude: {
    label: "Aptitude Tests",
    description: "Candidate screening and aptitude testing",
    actions: {
      create: { label: "Create", description: "Create aptitude tests and questions" },
      read: { label: "View", description: "View test definitions, candidate attempts, and scores" },
      update: { label: "Update", description: "Edit test questions, timing, and pass marks" },
      delete: { label: "Delete", description: "Delete aptitude tests" },
      publish: { label: "Publish", description: "Publish or archive aptitude tests" },
      assign: { label: "Assign", description: "Send aptitude test invitations to candidates" },
    },
  },
  branches: {
    label: "Branches",
    description: "Store locations, geofences, and operating hours",
    actions: {
      create: { label: "Create", description: "Add new branch locations" },
      read: { label: "View", description: "View branch profiles and details" },
      update: { label: "Update", description: "Edit branch details, geofences, and settings" },
      delete: { label: "Delete", description: "Remove branch locations" },
    },
  },
  schedules: {
    label: "Schedules",
    description: "Shift rotas, templates, and weekly schedules",
    actions: {
      create: { label: "Create", description: "Create shift templates and rota assignments" },
      read: { label: "View", description: "View shift rotas and schedules" },
      update: { label: "Update", description: "Modify shifts, rotas, and schedule overrides" },
      delete: { label: "Delete", description: "Delete shifts or rota assignments" },
      publish: { label: "Publish", description: "Publish and copy weekly shift rotas" },
    },
  },
  feedback: {
    label: "Customer Feedback",
    description: "Customer ratings, comments, and NPS surveys",
    actions: {
      read: { label: "View", description: "View customer feedback submissions and ratings" },
      export: { label: "Export", description: "Export feedback data and reports" },
    },
  },
  questions: {
    label: "Feedback Questions",
    description: "Customer feedback survey questions and scales",
    actions: {
      create: { label: "Create", description: "Add new feedback survey questions" },
      read: { label: "View", description: "View feedback questions" },
      update: { label: "Update", description: "Edit feedback questions and ordering" },
      delete: { label: "Delete", description: "Delete or archive feedback questions" },
    },
  },
  policies: {
    label: "Attendance Policies",
    description: "Grace periods, break policies, and overtime rules",
    actions: {
      read: { label: "View", description: "View attendance policy configurations" },
      update: { label: "Update", description: "Edit attendance policy rules and grace periods" },
    },
  },
  users: {
    label: "Users",
    description: "User accounts, sign-in access, and status",
    actions: {
      create: { label: "Create", description: "Create new user accounts" },
      read: { label: "View", description: "View user accounts and profiles" },
      update: { label: "Update", description: "Edit user status, details, and MFA settings" },
      delete: { label: "Delete", description: "Deactivate or remove user accounts" },
      assign: { label: "Assign", description: "Assign roles to user accounts" },
    },
  },
  roles: {
    label: "Roles & Permissions",
    description: "Custom roles and access control configurations",
    actions: {
      create: { label: "Create", description: "Create new custom roles" },
      read: { label: "View", description: "View custom roles and their assigned permissions" },
      update: { label: "Update", description: "Edit custom roles and modify permissions" },
      delete: { label: "Delete", description: "Delete custom roles not in use" },
      assign: { label: "Assign", description: "Assign roles to users" },
    },
  },
  email_queue: {
    label: "Email Queue",
    description: "Background notification and email delivery queue",
    actions: {
      read: { label: "View", description: "View queued and delivered email jobs" },
      manage: { label: "Manage", description: "Retry, resend, or cancel queued email jobs" },
    },
  },
  jobs: {
    label: "Background Jobs",
    description: "System job queue and background task executions",
    actions: {
      read: { label: "View", description: "View queued, running, succeeded, and dead jobs" },
      manage: { label: "Manage", description: "Retry or cancel background jobs" },
    },
  },
} as const;

export type PermissionRegistryType = typeof PERMISSION_REGISTRY;
export type ResourceKey = keyof PermissionRegistryType;

export type PermissionKey = {
  [R in ResourceKey]: `${R}:${Extract<keyof PermissionRegistryType[R]["actions"], string>}`;
}[ResourceKey];

export type FlattenedPermission = {
  key: string;
  resource: string;
  resourceLabel: string;
  action: string;
  actionLabel: string;
  description?: string;
};

/**
 * Returns all permissions in flattened form with keys and labels.
 */
export function getAllPermissions(): FlattenedPermission[] {
  const result: FlattenedPermission[] = [];
  for (const [resource, resDef] of Object.entries(PERMISSION_REGISTRY)) {
    for (const [action, actionDef] of Object.entries(resDef.actions)) {
      result.push({
        key: `${resource}:${action}`,
        resource,
        resourceLabel: resDef.label,
        action,
        actionLabel: actionDef.label,
        description: actionDef.description,
      });
    }
  }
  return result;
}

/**
 * Ordered list of standard action columns for the permission matrix table.
 */
export const MATRIX_ACTIONS = [
  { key: "create", label: "Create" },
  { key: "read", label: "Read" },
  { key: "update", label: "Update" },
  { key: "delete", label: "Delete" },
  { key: "approve", label: "Approve" },
  { key: "export", label: "Export" },
  { key: "publish", label: "Publish" },
  { key: "assign", label: "Assign" },
  { key: "manage", label: "Manage" },
] as const;

export type MatrixActionKey = (typeof MATRIX_ACTIONS)[number]["key"];

export type MatrixRow = {
  resource: string;
  resourceLabel: string;
  resourceDescription?: string;
  actions: {
    [action in MatrixActionKey]?: {
      key: string;
      label: string;
      description?: string;
    };
  };
};

/**
 * Generates the matrix data structure for the Roles & Permissions UI table.
 */
export function getPermissionMatrix(): MatrixRow[] {
  return Object.entries(PERMISSION_REGISTRY).map(([resource, resDef]) => {
    const actions: MatrixRow["actions"] = {};
    for (const [actionKey, actionDef] of Object.entries(resDef.actions)) {
      actions[actionKey as MatrixActionKey] = {
        key: `${resource}:${actionKey}`,
        label: actionDef.label,
        description: actionDef.description,
      };
    }
    return {
      resource,
      resourceLabel: resDef.label,
      resourceDescription: resDef.description,
      actions,
    };
  });
}

/**
 * Validates whether a given key exists in the permission registry.
 */
export function isValidPermissionKey(key: string): boolean {
  const [resource, action] = key.split(":");
  if (!resource || !action) return false;
  const res = PERMISSION_REGISTRY[resource as ResourceKey];
  if (!res) return false;
  return action in res.actions;
}

/**
 * Synchronizes the code-defined permissions with the database `permissions` table.
 * Idempotent: upserts each permission by its unique `key`.
 */
export async function syncPermissionRegistry(db: PrismaClient): Promise<number> {
  const all = getAllPermissions();
  for (const p of all) {
    await db.permissionRecord.upsert({
      where: { key: p.key },
      create: {
        key: p.key,
        resource: p.resource,
        action: p.action,
        label: p.actionLabel,
        description: p.description,
      },
      update: {
        resource: p.resource,
        action: p.action,
        label: p.actionLabel,
        description: p.description,
      },
    });
  }
  return all.length;
}
