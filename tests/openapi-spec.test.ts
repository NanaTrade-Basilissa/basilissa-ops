import { describe, it, expect } from "vitest";
import { OPENAPI_SPEC } from "@/lib/platform/openapi-spec";

describe("OpenAPI 3.0.3 Specification", () => {
  it("has valid top-level OpenAPI structure", () => {
    expect(OPENAPI_SPEC.openapi).toBe("3.0.3");
    expect(OPENAPI_SPEC.info.title).toBe("Basilissa Operations Platform API");
    expect(OPENAPI_SPEC.info.version).toBe("1.0.0");
    expect(OPENAPI_SPEC.paths).toBeDefined();
    expect(OPENAPI_SPEC.components.schemas).toBeDefined();
    expect(OPENAPI_SPEC.components.securitySchemes.CookieAuth).toBeDefined();
  });

  it("documents all primary public and admin endpoints", () => {
    const paths = Object.keys(OPENAPI_SPEC.paths);
    expect(paths).toContain("/api/health");
    expect(paths).toContain("/api/feedback");
    expect(paths).toContain("/api/v1/attendance/punch");
    expect(paths).toContain("/api/admin/feedback/qr");
    expect(paths).toContain("/api/admin/branches/{id}/feedback/qr");
    expect(paths).toContain("/api/admin/qr");
    expect(paths).toContain("/api/admin/branches/{id}/qr");
  });

  it("defines detailed schemas for customer feedback and mobile punch ingestion", () => {
    const schemas = OPENAPI_SPEC.components.schemas;
    expect(schemas.FeedbackSubmissionInput).toBeDefined();
    expect(schemas.FeedbackSubmissionInput.required).toContain("branchSlug");
    expect(schemas.FeedbackSubmissionInput.required).toContain("submissionToken");
    expect(schemas.FeedbackSubmissionInput.required).toContain("answers");

    expect(schemas.MobilePunchInput).toBeDefined();
    expect(schemas.MobilePunchInput.required).toContain("employeeId");
    expect(schemas.MobilePunchInput.required).toContain("branchId");
    expect(schemas.MobilePunchInput.required).toContain("direction");
    expect(schemas.MobilePunchInput.required).toContain("latitude");
    expect(schemas.MobilePunchInput.required).toContain("longitude");
    expect(schemas.MobilePunchInput.required).toContain("accuracyMeters");

    expect(schemas.MobilePunchSuccessResult).toBeDefined();
    expect(schemas.MobilePunchGeofenceFailureResult).toBeDefined();
  });

  it("assigns appropriate tags and operationIds to all endpoints", () => {
    for (const [path, methods] of Object.entries(OPENAPI_SPEC.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.summary, `${method.toUpperCase()} ${path} has summary`).toBeTruthy();
        expect(operation.operationId, `${method.toUpperCase()} ${path} has operationId`).toBeTruthy();
        expect(operation.tags.length, `${method.toUpperCase()} ${path} has tags`).toBeGreaterThan(0);
        expect(operation.responses, `${method.toUpperCase()} ${path} has responses`).toBeDefined();
      }
    }
  });

  it("marks admin endpoints with cookie session security", () => {
    const adminQr = OPENAPI_SPEC.paths["/api/admin/feedback/qr"].get;
    expect(adminQr.security).toEqual([{ CookieAuth: [] }]);

    const branchQr = OPENAPI_SPEC.paths["/api/admin/branches/{id}/feedback/qr"].get;
    expect(branchQr.security).toEqual([{ CookieAuth: [] }]);
  });
});
