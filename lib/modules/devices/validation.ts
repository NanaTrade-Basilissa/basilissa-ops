import { z } from "zod";

export const deviceInputSchema = z.object({
  serialNumber: z
    .string()
    .trim()
    .min(1, "Serial number is required")
    .max(60, "Serial number must be at most 60 characters"),
  branchId: z.string().min(1, "Branch is required"),
  label: z
    .string()
    .trim()
    .max(120, "Label must be at most 120 characters")
    .optional()
    .transform((v) => (v ? v : null)),
  isActive: z.boolean(),
});

export type DeviceInput = z.infer<typeof deviceInputSchema>;

/**
 * No `serialNumber` — changing it after creation would silently orphan every
 * attendance event already tied to the old string, since `IngestCommand.deviceId`
 * and `EmployeeDeviceIdentity.deviceId` both reference it by value, not by
 * this row's id. Retiring a unit means deactivating it and registering a new one.
 */
export const deviceUpdateSchema = deviceInputSchema.omit({ serialNumber: true });

export type DeviceUpdateInput = z.infer<typeof deviceUpdateSchema>;
