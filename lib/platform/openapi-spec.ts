/**
 * OpenAPI 3.0.3 specification for the Basilissa Operations Platform.
 *
 * Covers:
 * - Public Healthcheck (/api/health)
 * - Customer Feedback Submission (/api/feedback)
 * - Mobile Geofenced Attendance Punches (/api/v1/attendance/punch)
 * - Branch Administration & Feedback QR Codes (/api/admin/feedback/qr, /api/admin/branches/{id}/feedback/qr)
 */

export const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "Basilissa Operations Platform API",
    version: "1.0.0",
    description: `
Welcome to the Basilissa Operations Platform API documentation.

### Core Subsystems
- **Customer Experience & Feedback**: Public, rate-limited ingestion endpoints for in-branch customer dining reviews.
- **Workforce Attendance**: Geofenced mobile clock-in/out engine evaluating device GPS against branch boundaries using the Haversine spherical formula.
- **Branch Operations & QR Codes**: Administrative endpoints for generating high-resolution QR codes encoding branch survey links.
- **Platform Telemetry**: Liveness and database connectivity healthchecks for orchestrators and uptime probes.

### Authentication
- **Public Endpoints** (\`/api/health\`, \`/api/feedback\`, \`/api/v1/attendance/punch\`): No session cookie required. Rate limited by client IP.
- **Admin Endpoints** (\`/api/admin/*\`): Require an active session cookie (\`auth_session\`) with appropriate RBAC permissions (\`branch:read\`).
    `.trim(),
    contact: {
      name: "Basilissa Engineering & Operations",
      email: "ops@basilissa.gh",
    },
  },
  servers: [
    {
      url: "/",
      description: "Current Host / Active Environment",
    },
  ],
  tags: [
    {
      name: "Health",
      description: "System liveness and PostgreSQL database connectivity checks.",
    },
    {
      name: "Feedback",
      description: "Public customer experience survey submissions.",
    },
    {
      name: "Attendance",
      description: "GPS-geofenced mobile punch ingestion and clock-in/out processing.",
    },
    {
      name: "Branch Administration",
      description: "Administrative utilities, branch assets, and QR code generation.",
    },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "System Health & Database Connectivity",
        description:
          "Probes PostgreSQL connectivity via SELECT 1. Unauthenticated for use by Docker Compose, Kubernetes, and uptime monitoring.",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "System is healthy and database is connected.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthOkResponse",
                },
                example: { status: "ok" },
              },
            },
          },
          "503": {
            description: "Database connection failed or system is unhealthy.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthErrorResponse",
                },
                example: { status: "error" },
              },
            },
          },
        },
      },
    },

    "/api/feedback": {
      post: {
        tags: ["Feedback"],
        summary: "Submit Customer Feedback",
        description: `
Records a dining feedback submission from a customer at a branch.

**Rate Limit**: 20 submissions per 10 minutes per IP address.
**Idempotency**: Submitting an identical \`submissionToken\` will return 200 with the existing record without creating duplicate entries.
        `.trim(),
        operationId: "submitFeedback",
        requestBody: {
          required: true,
          description: "Feedback submission payload including branch slug, idempotency UUID token, and survey answers.",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/FeedbackSubmissionInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Feedback submission successfully recorded.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FeedbackSubmissionRecord",
                },
              },
            },
          },
          "200": {
            description: "Idempotent replay: submission token was previously processed.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FeedbackSubmissionRecord",
                },
              },
            },
          },
          "400": {
            description: "Malformed JSON or validation error (e.g., missing question answers).",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "403": {
            description: "Target branch is currently marked inactive.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Branch slug does not match any known branch.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "409": {
            description: "Question set was updated between client form fetch and submission.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "429": {
            description: "Rate limit exceeded (Too many submissions from this IP).",
            headers: {
              "Retry-After": {
                schema: { type: "integer" },
                description: "Seconds until submission window resets.",
              },
            },
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },

    "/api/v1/attendance/punch": {
      post: {
        tags: ["Attendance"],
        summary: "Ingest Mobile Geofenced Attendance Punch",
        description: `
Ingests mobile clock-in/out punches from branch staff.

**Geofence Verification**:
- Computes geodesic distance between device coordinates and branch location via the **Haversine formula**.
- **Clock-IN (Arrival)**: Strictly enforced. Rejects punches outside fence boundary (\`422 Unprocessable Entity\`).
- **Clock-OUT (Departure)**: Asymmetric acceptance per architectural policy. Accepted regardless of distance to safeguard employee worked hours, flagged with \`OUTSIDE_GEOFENCE\` audit flag.
- Rejects simulated or mock GPS locations.

**Rate Limit**: 30 requests per minute per IP address.
        `.trim(),
        operationId: "recordMobilePunch",
        requestBody: {
          required: true,
          description: "Mobile punch telemetry including employee, branch, direction, GPS coordinates, and accuracy.",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MobilePunchInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Punch successfully ingested and settled into attendance record.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MobilePunchSuccessResult",
                },
              },
            },
          },
          "400": {
            description: "Invalid JSON or schema validation error.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "403": {
            description: "Forbidden: Employee is inactive or not assigned to the specified branch.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Employee or Branch ID was not found.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "422": {
            description: "Unprocessable Entity: Clock-in punch rejected because device is outside the branch geofence radius.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MobilePunchGeofenceFailureResult",
                },
              },
            },
          },
          "429": {
            description: "Rate limit exceeded (Too many punch requests).",
            headers: {
              "Retry-After": {
                schema: { type: "integer" },
                description: "Seconds until punch rate limit resets.",
              },
            },
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },

    "/api/admin/feedback/qr": {
      get: {
        tags: ["Branch Administration"],
        summary: "Generate General Feedback QR Code",
        description: "Generates a 640x640 PNG QR code pointing to the platform's global feedback URL (/feedback).",
        operationId: "getGeneralFeedbackQr",
        security: [{ CookieAuth: [] }],
        parameters: [
          {
            name: "download",
            in: "query",
            required: false,
            description: "Pass '1' to set Content-Disposition to attachment for file download.",
            schema: { type: "string", enum: ["0", "1"] },
          },
        ],
        responses: {
          "200": {
            description: "QR code image binary in PNG format.",
            content: {
              "image/png": {
                schema: {
                  type: "string",
                  format: "binary",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized: Missing valid admin session cookie.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "403": {
            description: "Forbidden: Actor lacks 'branch:read' permission.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },

    "/api/admin/branches/{id}/feedback/qr": {
      get: {
        tags: ["Branch Administration"],
        summary: "Generate Branch Feedback QR Code",
        description: "Generates a 640x640 PNG QR code encoding the branch-specific feedback survey link (/feedback?branch={slug}).",
        operationId: "getBranchFeedbackQr",
        security: [{ CookieAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "The unique ID of the branch.",
            schema: { type: "string" },
          },
          {
            name: "download",
            in: "query",
            required: false,
            description: "Pass '1' to set Content-Disposition to attachment for file download.",
            schema: { type: "string", enum: ["0", "1"] },
          },
        ],
        responses: {
          "200": {
            description: "Branch QR code image binary in PNG format.",
            content: {
              "image/png": {
                schema: {
                  type: "string",
                  format: "binary",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized: Missing valid admin session cookie.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "403": {
            description: "Forbidden: Actor lacks 'branch:read' permission for this specific branch.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Branch with given ID not found.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },

    "/api/admin/qr": {
      get: {
        tags: ["Branch Administration"],
        summary: "General Feedback QR Code (Legacy Alias)",
        description: "Backwards-compatible legacy route aliased to /api/admin/feedback/qr.",
        operationId: "getGeneralFeedbackQrLegacy",
        deprecated: true,
        security: [{ CookieAuth: [] }],
        parameters: [
          {
            name: "download",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["0", "1"] },
          },
        ],
        responses: {
          "200": {
            description: "PNG image binary.",
            content: {
              "image/png": { schema: { type: "string", format: "binary" } },
            },
          },
        },
      },
    },

    "/api/admin/branches/{id}/qr": {
      get: {
        tags: ["Branch Administration"],
        summary: "Branch Feedback QR Code (Legacy Alias)",
        description: "Backwards-compatible legacy route aliased to /api/admin/branches/{id}/feedback/qr.",
        operationId: "getBranchFeedbackQrLegacy",
        deprecated: true,
        security: [{ CookieAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "download",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["0", "1"] },
          },
        ],
        responses: {
          "200": {
            description: "PNG image binary.",
            content: {
              "image/png": { schema: { type: "string", format: "binary" } },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      CookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "auth_session",
        description: "Encrypted HTTP-only session cookie issued upon successful administrative authentication.",
      },
    },
    schemas: {
      HealthOkResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
        },
        required: ["status"],
      },
      HealthErrorResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "error" },
        },
        required: ["status"],
      },
      FeedbackAnswerInput: {
        type: "object",
        properties: {
          questionId: {
            type: "string",
            description: "ID of the survey question being answered.",
            example: "clz...",
          },
          score: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "Rating score between 1 (Poor) and 5 (Excellent).",
            example: 5,
          },
        },
        required: ["questionId", "score"],
      },
      FeedbackSubmissionInput: {
        type: "object",
        properties: {
          branchSlug: {
            type: "string",
            description: "URL slug of the branch visited by the customer.",
            example: "spintex-road",
          },
          submissionToken: {
            type: "string",
            format: "uuid",
            description: "Client-generated UUID idempotency token.",
            example: "c8e8f8b0-8f9f-4f7f-8f8f-8f8f8f8f8f8f",
          },
          answers: {
            type: "array",
            items: { $ref: "#/components/schemas/FeedbackAnswerInput" },
            description: "Array of responses answering active branch survey questions.",
          },
        },
        required: ["branchSlug", "submissionToken", "answers"],
      },
      FeedbackSubmissionRecord: {
        type: "object",
        properties: {
          id: { type: "string", example: "cl..." },
          branchId: { type: "string", example: "cl..." },
          submissionToken: { type: "string", format: "uuid" },
          overallScore: { type: "number", example: 4.8 },
          submittedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "branchId", "submissionToken", "overallScore", "submittedAt"],
      },
      MobilePunchInput: {
        type: "object",
        properties: {
          employeeId: {
            type: "string",
            description: "Unique employee ID.",
            example: "emp_12345",
          },
          branchId: {
            type: "string",
            description: "Target branch ID.",
            example: "branch_spintex",
          },
          direction: {
            type: "string",
            enum: ["IN", "OUT"],
            description: "Arrival clock-in ('IN') or departure clock-out ('OUT').",
            example: "IN",
          },
          latitude: {
            type: "number",
            minimum: -90,
            maximum: 90,
            description: "Device GPS latitude coordinate in decimal degrees.",
            example: 5.6037,
          },
          longitude: {
            type: "number",
            minimum: -180,
            maximum: 180,
            description: "Device GPS longitude coordinate in decimal degrees.",
            example: -0.187,
          },
          accuracyMeters: {
            type: "number",
            minimum: 0,
            maximum: 5000,
            description: "Device horizontal GPS accuracy radius in meters.",
            example: 12.4,
          },
          isMockLocation: {
            type: "boolean",
            default: false,
            description: "Flag indicating whether coordinates were simulated by developer settings/mock providers.",
            example: false,
          },
          deviceId: {
            type: "string",
            description: "Optional persistent device identifier.",
            example: "device_ios_a1b2c3",
          },
          idempotencyKey: {
            type: "string",
            description: "Optional client idempotency key to prevent accidental duplicate punch taps.",
            example: "punch_seq_9876",
          },
        },
        required: ["employeeId", "branchId", "direction", "latitude", "longitude", "accuracyMeters"],
      },
      MobilePunchSuccessResult: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          punch: {
            type: "object",
            properties: {
              id: { type: "string", example: "evt_punch_991" },
              employeeId: { type: "string", example: "emp_12345" },
              branchId: { type: "string", example: "branch_spintex" },
              direction: { type: "string", enum: ["IN", "OUT"], example: "IN" },
              timestamp: { type: "string", format: "date-time" },
              provider: { type: "string", example: "MOBILE_APP" },
              status: { type: "string", example: "ACCEPTED" },
            },
            required: ["id", "employeeId", "branchId", "direction", "timestamp", "provider", "status"],
          },
          geofence: {
            type: "object",
            properties: {
              state: { type: "string", enum: ["INSIDE", "OUTSIDE", "AMBIGUOUS", "NOT_APPLICABLE"], example: "INSIDE" },
              distanceMeters: { type: "number", example: 34.2 },
              radiusMeters: { type: "number", example: 100 },
              accuracyMeters: { type: "number", example: 12.4 },
            },
            required: ["state", "distanceMeters", "radiusMeters", "accuracyMeters"],
          },
          action: { type: "string", example: "Shift clock-in registered" },
        },
        required: ["ok", "punch", "geofence"],
      },
      MobilePunchGeofenceFailureResult: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: false },
          error: { type: "string", example: "OUTSIDE_GEOFENCE" },
          message: {
            type: "string",
            example: "Punch rejected: Device is 342m away from branch (allowed: 100m).",
          },
          distanceMeters: { type: "number", example: 342.1 },
          radiusMeters: { type: "number", example: 100 },
        },
        required: ["ok", "error", "message"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: false },
          error: { type: "string", example: "VALIDATION_ERROR" },
          message: { type: "string", example: "Invalid input parameters" },
          issues: {
            type: "array",
            items: { type: "object" },
            description: "Detailed Zod validation issues when available.",
          },
        },
        required: ["error"],
      },
    },
  },
} as const;
