import { describe, expect, it } from "vitest";
import {
  AttendanceDirection,
  GeofenceDecision,
  LocationAssurance,
} from "@prisma/client";
import {
  evaluateGeofence,
  haversineDistanceMeters,
  type BranchGeofenceConfig,
  type PunchCoordinates,
} from "@/lib/modules/attendance/geofence";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineDistanceMeters(5.6219, -0.1742, 5.6219, -0.1742)).toBe(0);
  });

  it("calculates distance between known Accra coordinates accurately", () => {
    // Accra Mall (5.6219, -0.1742) to Kotoka Airport Terminal 3 (5.6022, -0.1738)
    const dist = haversineDistanceMeters(5.6219, -0.1742, 5.6022, -0.1738);
    // Approximately 2,190 meters
    expect(dist).toBeGreaterThan(2100);
    expect(dist).toBeLessThan(2300);
  });
});

describe("evaluateGeofence", () => {
  const mockBranch: BranchGeofenceConfig = {
    latitude: 5.6219,
    longitude: -0.1742,
    geofenceRadiusMeters: 150,
    maxAcceptableAccuracyMeters: 100,
    geofenceEnabled: true,
  };

  it("evaluates INSIDE when distance + accuracy <= radius", () => {
    // Punch right next to branch (approx 20m away) with 10m accuracy
    const coords: PunchCoordinates = {
      latitude: 5.622,
      longitude: -0.1742,
      accuracyMeters: 10,
    };

    const result = evaluateGeofence(mockBranch, coords, AttendanceDirection.IN);

    expect(result.decision).toBe(GeofenceDecision.INSIDE);
    expect(result.isAccepted).toBe(true);
    expect(result.locationAssurance).toBe(LocationAssurance.GPS_VERIFIED);
    expect(result.flags).not.toContain("OUTSIDE_GEOFENCE");
    expect(result.distanceMeters).toBeLessThan(50);
  });

  it("evaluates OUTSIDE and REJECTS clock-in when distance - accuracy > radius", () => {
    // Punch 1km away
    const coords: PunchCoordinates = {
      latitude: 5.6319,
      longitude: -0.1742,
      accuracyMeters: 15,
    };

    const result = evaluateGeofence(mockBranch, coords, AttendanceDirection.IN);

    expect(result.decision).toBe(GeofenceDecision.OUTSIDE);
    expect(result.isAccepted).toBe(false);
    expect(result.rejectionReason).toContain("Clock-in rejected");
    expect(result.flags).toContain("OUTSIDE_GEOFENCE");
    expect(result.locationAssurance).toBe(LocationAssurance.NONE);
  });

  it("evaluates OUTSIDE and ACCEPTS clock-out with OUTSIDE_GEOFENCE flag", () => {
    // Punch 1km away for clock-out (departure)
    const coords: PunchCoordinates = {
      latitude: 5.6319,
      longitude: -0.1742,
      accuracyMeters: 15,
    };

    const result = evaluateGeofence(mockBranch, coords, AttendanceDirection.OUT);

    expect(result.decision).toBe(GeofenceDecision.OUTSIDE);
    expect(result.isAccepted).toBe(true);
    expect(result.rejectionReason).toBeNull();
    expect(result.flags).toContain("OUTSIDE_GEOFENCE");
    expect(result.locationAssurance).toBe(LocationAssurance.NONE);
  });

  it("evaluates AMBIGUOUS when the error circle intersects the fence", () => {
    // Distance 140m away, accuracy 30m (140 + 30 = 170 > 150, but 140 - 30 = 110 <= 150)
    // Shift slightly North (~140m)
    const coords: PunchCoordinates = {
      latitude: 5.62316,
      longitude: -0.1742,
      accuracyMeters: 30,
    };

    const result = evaluateGeofence(mockBranch, coords, AttendanceDirection.IN);

    expect(result.decision).toBe(GeofenceDecision.AMBIGUOUS);
    expect(result.isAccepted).toBe(true);
    expect(result.flags).toContain("AMBIGUOUS_GEOFENCE");
    expect(result.locationAssurance).toBe(LocationAssurance.GPS_VERIFIED);
  });

  it("detects mock locations, adds flag, and downgrades location assurance", () => {
    const coords: PunchCoordinates = {
      latitude: 5.6219,
      longitude: -0.1742,
      accuracyMeters: 5,
      isMockLocation: true,
    };

    const result = evaluateGeofence(mockBranch, coords, AttendanceDirection.IN);

    expect(result.decision).toBe(GeofenceDecision.INSIDE);
    expect(result.flags).toContain("MOCK_LOCATION_DETECTED");
    expect(result.locationAssurance).toBe(LocationAssurance.NONE);
  });

  it("flags LOW_GPS_ACCURACY when accuracy exceeds maxAcceptableAccuracyMeters", () => {
    const coords: PunchCoordinates = {
      latitude: 5.6219,
      longitude: -0.1742,
      accuracyMeters: 120, // > 100 max
    };

    const result = evaluateGeofence(mockBranch, coords, AttendanceDirection.IN);

    expect(result.flags).toContain("LOW_GPS_ACCURACY");
  });

  it("returns NOT_APPLICABLE if geofencing is disabled on the branch", () => {
    const disabledBranch: BranchGeofenceConfig = {
      ...mockBranch,
      geofenceEnabled: false,
    };

    const coords: PunchCoordinates = {
      latitude: 5.6319,
      longitude: -0.1742,
      accuracyMeters: 10,
    };

    const result = evaluateGeofence(disabledBranch, coords, AttendanceDirection.IN);

    expect(result.decision).toBe(GeofenceDecision.NOT_APPLICABLE);
    expect(result.isAccepted).toBe(true);
    expect(result.distanceMeters).toBeNull();
  });
});
