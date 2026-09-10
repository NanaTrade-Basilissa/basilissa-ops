import {
  AttendanceDirection,
  GeofenceDecision,
  LocationAssurance,
  type Prisma,
} from "@prisma/client";

/**
 * Server-side geofencing evaluation for mobile attendance (Phase 5, §10).
 *
 * Evaluates GPS proximity to a branch using the Haversine formula and
 * implements the three-state decision matrix:
 *   - INSIDE:     distance + accuracy <= radius (confident, accept, GPS_VERIFIED)
 *   - OUTSIDE:    distance - accuracy > radius  (confident, reject clock-IN, accept clock-OUT with flag)
 *   - AMBIGUOUS:  overlapping margin of error   (accept, flag LOW_GPS_ACCURACY for review)
 *   - NOT_APPLICABLE: geofencing disabled or branch has no GPS coordinates configured.
 */

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates the great-circle distance between two points on the Earth
 * using the Haversine formula.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

export type BranchGeofenceConfig = {
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number;
  maxAcceptableAccuracyMeters: number;
  geofenceEnabled: boolean;
};

export type PunchCoordinates = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  isMockLocation?: boolean;
};

export type GeofenceEvaluationResult = {
  decision: GeofenceDecision;
  distanceMeters: number | null;
  isAccepted: boolean;
  rejectionReason: string | null;
  flags: string[];
  locationAssurance: LocationAssurance;
  geofenceSnapshot: Prisma.InputJsonValue;
};

/**
 * Evaluates punch coordinates against branch geofence boundary according to
 * the three-state decision rules.
 */
export function evaluateGeofence(
  branch: BranchGeofenceConfig,
  coordinates: PunchCoordinates,
  direction: AttendanceDirection,
): GeofenceEvaluationResult {
  // If geofencing is disabled or branch has no coordinates, bypass check
  if (
    !branch.geofenceEnabled ||
    branch.latitude === null ||
    branch.longitude === null
  ) {
    return {
      decision: GeofenceDecision.NOT_APPLICABLE,
      distanceMeters: null,
      isAccepted: true,
      rejectionReason: null,
      flags: [],
      locationAssurance: LocationAssurance.NONE,
      geofenceSnapshot: {
        geofenceEnabled: false,
        evaluatedAt: new Date().toISOString(),
      },
    };
  }

  const distance = haversineDistanceMeters(
    branch.latitude,
    branch.longitude,
    coordinates.latitude,
    coordinates.longitude,
  );

  const flags: string[] = [];
  if (coordinates.isMockLocation) {
    flags.push("MOCK_LOCATION_DETECTED");
  }

  const isLowAccuracy =
    coordinates.accuracyMeters > branch.maxAcceptableAccuracyMeters;
  if (isLowAccuracy) {
    flags.push("LOW_GPS_ACCURACY");
  }

  const snapshot: Prisma.InputJsonValue = {
    branchLatitude: branch.latitude,
    branchLongitude: branch.longitude,
    radiusMeters: branch.geofenceRadiusMeters,
    maxAcceptableAccuracyMeters: branch.maxAcceptableAccuracyMeters,
    evaluatedDistanceMeters: distance,
    evaluatedAccuracyMeters: coordinates.accuracyMeters,
    isMockLocation: Boolean(coordinates.isMockLocation),
    evaluatedAt: new Date().toISOString(),
  };

  // Three-state evaluation
  // 1. Confident inside: distance + accuracy <= radius
  if (distance + coordinates.accuracyMeters <= branch.geofenceRadiusMeters) {
    return {
      decision: GeofenceDecision.INSIDE,
      distanceMeters: distance,
      isAccepted: true,
      rejectionReason: null,
      flags,
      locationAssurance: coordinates.isMockLocation
        ? LocationAssurance.NONE
        : LocationAssurance.GPS_VERIFIED,
      geofenceSnapshot: snapshot,
    };
  }

  // 2. Confident outside: distance - accuracy > radius
  if (distance - coordinates.accuracyMeters > branch.geofenceRadiusMeters) {
    flags.push("OUTSIDE_GEOFENCE");

    // Clock-in outside the fence is rejected per §10 to prevent remote check-ins.
    // Clock-out outside the fence is always accepted + flagged to avoid missing punches.
    if (direction === AttendanceDirection.IN) {
      return {
        decision: GeofenceDecision.OUTSIDE,
        distanceMeters: distance,
        isAccepted: false,
        rejectionReason: `Clock-in rejected: You are ${distance}m from the branch (allowed radius: ${branch.geofenceRadiusMeters}m).`,
        flags,
        locationAssurance: LocationAssurance.NONE,
        geofenceSnapshot: snapshot,
      };
    }

    return {
      decision: GeofenceDecision.OUTSIDE,
      distanceMeters: distance,
      isAccepted: true,
      rejectionReason: null,
      flags,
      locationAssurance: LocationAssurance.NONE,
      geofenceSnapshot: snapshot,
    };
  }

  // 3. Ambiguous: error circle crosses the fence perimeter
  flags.push("AMBIGUOUS_GEOFENCE");
  return {
    decision: GeofenceDecision.AMBIGUOUS,
    distanceMeters: distance,
    isAccepted: true,
    rejectionReason: null,
    flags,
    locationAssurance: coordinates.isMockLocation
      ? LocationAssurance.NONE
      : LocationAssurance.GPS_VERIFIED,
    geofenceSnapshot: snapshot,
  };
}
