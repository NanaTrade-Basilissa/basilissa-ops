import { describe, expect, it } from "vitest";
import { branchInputSchema, branchGeofenceUpdateSchema } from "@/lib/modules/branches/validation";

describe("branchInputSchema geofence fields", () => {
  const baseValid = {
    name: "Accra Mall Branch",
    slug: "accra-mall",
    location: "Accra Mall, Tetteh Quarshie",
    isActive: true,
  };

  it("accepts valid GPS coordinates and custom radius", () => {
    const result = branchInputSchema.safeParse({
      ...baseValid,
      latitude: 5.6219,
      longitude: -0.1742,
      geofenceRadiusMeters: 200,
      maxAcceptableAccuracyMeters: 80,
      geofenceEnabled: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.latitude).toBe(5.6219);
      expect(result.data.longitude).toBe(-0.1742);
      expect(result.data.geofenceRadiusMeters).toBe(200);
      expect(result.data.geofenceEnabled).toBe(true);
    }
  });

  it("applies sensible defaults when geofence fields are omitted or null", () => {
    const result = branchInputSchema.safeParse({
      ...baseValid,
      latitude: null,
      longitude: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.latitude).toBeNull();
      expect(result.data.longitude).toBeNull();
      expect(result.data.geofenceRadiusMeters).toBe(150);
      expect(result.data.geofenceEnabled).toBe(false);
    }
  });

  it("rejects out-of-range latitude (> 90 or < -90)", () => {
    const resultHigh = branchInputSchema.safeParse({
      ...baseValid,
      latitude: 95.0,
      longitude: 0.0,
    });
    expect(resultHigh.success).toBe(false);

    const resultLow = branchInputSchema.safeParse({
      ...baseValid,
      latitude: -95.0,
      longitude: 0.0,
    });
    expect(resultLow.success).toBe(false);
  });

  it("rejects out-of-range longitude (> 180 or < -180)", () => {
    const result = branchInputSchema.safeParse({
      ...baseValid,
      latitude: 5.0,
      longitude: 190.0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts minimum radius of 5 meters", () => {
    const result = branchInputSchema.safeParse({
      ...baseValid,
      geofenceRadiusMeters: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.geofenceRadiusMeters).toBe(5);
    }
  });

  it("rejects radius less than 5 meters", () => {
    const result = branchInputSchema.safeParse({
      ...baseValid,
      geofenceRadiusMeters: 4,
    });
    expect(result.success).toBe(false);
  });
});

describe("branchGeofenceUpdateSchema", () => {
  it("validates partial geofence updates", () => {
    const result = branchGeofenceUpdateSchema.safeParse({
      latitude: 5.6037,
      longitude: -0.187,
      geofenceRadiusMeters: 100,
      maxAcceptableAccuracyMeters: 50,
      geofenceEnabled: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.latitude).toBe(5.6037);
      expect(result.data.longitude).toBe(-0.187);
      expect(result.data.geofenceRadiusMeters).toBe(100);
      expect(result.data.geofenceEnabled).toBe(true);
    }
  });

  it("coerces string radius and applies default 150m", () => {
    const result = branchGeofenceUpdateSchema.safeParse({
      latitude: 5.6037,
      longitude: -0.187,
      geofenceRadiusMeters: "250",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.geofenceRadiusMeters).toBe(250);
    }
  });

  it("rejects non-numeric coordinates", () => {
    const result = branchGeofenceUpdateSchema.safeParse({
      latitude: "invalid",
      longitude: -0.187,
    });

    expect(result.success).toBe(false);
  });

  it("accepts minimum radius of 5 meters", () => {
    const result = branchGeofenceUpdateSchema.safeParse({
      latitude: 5.6037,
      longitude: -0.187,
      geofenceRadiusMeters: 5,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.geofenceRadiusMeters).toBe(5);
    }
  });

  it("rejects radius less than 5 meters", () => {
    const result = branchGeofenceUpdateSchema.safeParse({
      latitude: 5.6037,
      longitude: -0.187,
      geofenceRadiusMeters: 4,
    });

    expect(result.success).toBe(false);
  });
});

