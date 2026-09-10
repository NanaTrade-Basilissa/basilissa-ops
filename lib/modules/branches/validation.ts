import { z } from "zod";

export const branchSlugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(60, "Slug must be at most 60 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must contain only lowercase letters, numbers and hyphens (e.g. east-legon)",
  );

export const branchInputSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  slug: branchSlugSchema,
  location: z.string().min(2, "Location must be at least 2 characters").max(200),
  isActive: z.boolean(),
  latitude: z.number().min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90").nullable().optional(),
  longitude: z.number().min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180").nullable().optional(),
  geofenceRadiusMeters: z.coerce.number().int().min(10, "Radius must be at least 10 meters").max(5000, "Radius must be under 5000 meters").default(150),
  maxAcceptableAccuracyMeters: z.coerce.number().int().min(10).max(500).default(100),
  geofenceEnabled: z.boolean().default(false),
});

export const branchGeofenceUpdateSchema = z.object({
  latitude: z.number().min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90").nullable().optional(),
  longitude: z.number().min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180").nullable().optional(),
  geofenceRadiusMeters: z.coerce.number().int().min(10, "Radius must be at least 10 meters").max(5000, "Radius must be under 5000 meters").default(150),
  maxAcceptableAccuracyMeters: z.coerce.number().int().min(10).max(500).default(100),
  geofenceEnabled: z.boolean().default(false),
});

export type BranchInput = z.infer<typeof branchInputSchema>;
export type BranchGeofenceUpdateInput = z.infer<typeof branchGeofenceUpdateSchema>;
