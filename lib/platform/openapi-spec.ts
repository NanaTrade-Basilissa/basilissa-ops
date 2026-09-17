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
      name: "Mobile Authentication",
      description: "SMS OTP phone verification and device binding for staff mobile app.",
    },
    {
      name: "Branch Administration",
      description: "Administrative utilities, branch assets, and QR code generation.",
    },
    {
      name: "Notifications",
      description: "Push notification token registration and staff messaging alerts.",
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
        security: [{ DeviceTokenAuth: [] }],
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
          "401": {
            description: "Unauthorized: Missing, invalid, or expired device token.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "403": {
            description: "Forbidden: Device token does not match employee ID, employee is inactive, or not assigned to branch.",
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
            description: "Unprocessable Entity: Clock-in punch rejected (e.g. outside geofence radius, shift already completed, or no scheduled shift).",
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

    "/api/v1/attendance/status": {
      get: {
        tags: ["Attendance"],
        summary: "Current Staff Attendance Status & Today's Schedule",
        description: "Returns the employee's live clock-in state, recent punch, today's resolved shift schedule, and assigned branch geofence coordinates.",
        operationId: "getAttendanceStatus",
        security: [{ DeviceTokenAuth: [] }],
        responses: {
          "200": {
            description: "Employee current status retrieved successfully.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    employee: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        employeeCode: { type: "string", nullable: true },
                        jobTitle: { type: "string", nullable: true },
                      },
                    },
                    currentStatus: { type: "string", enum: ["CLOCKED_IN", "CLOCKED_OUT", "COMPLETED"], example: "CLOCKED_IN" },
                    canClockIn: { type: "boolean", example: true },
                    canClockOut: { type: "boolean", example: false },
                    clockInDisabledReason: { type: "string", enum: ["SHIFT_COMPLETED", "NO_SHIFT_SCHEDULED", "ALREADY_ON_DUTY"], nullable: true, example: null },
                    clockInDisabledMessage: { type: "string", nullable: true, example: null },
                    lastPunch: { type: "object", nullable: true },
                    todaySchedule: { type: "object", nullable: true },
                    todayRecord: { type: "object", nullable: true },
                    assignedBranches: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized: Missing, invalid, or expired device token.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },

    "/api/v1/attendance/history": {
      get: {
        tags: ["Attendance"],
        summary: "Staff Personal Attendance History",
        description: "Returns the authenticated employee's chronological attendance logs, worked hours breakdown, and period summary totals.",
        operationId: "getAttendanceHistory",
        security: [{ DeviceTokenAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 14 }, description: "Max days to return (1-60)." },
          { name: "startDate", in: "query", schema: { type: "string", format: "date" }, description: "Filter start date (YYYY-MM-DD)." },
          { name: "endDate", in: "query", schema: { type: "string", format: "date" }, description: "Filter end date (YYYY-MM-DD)." },
        ],
        responses: {
          "200": {
            description: "Attendance history retrieved successfully.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    summary: { type: "object" },
                    days: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized: Missing, invalid, or expired device token.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },

    "/api/v1/attendance/punch/sync": {
      post: {
        tags: ["Attendance"],
        summary: "Batch Ingest Offline Mobile Punches",
        description: "Synchronizes an array of locally queued offline clock-in and clock-out punches from a mobile device with chronological sorting and deduplication.",
        operationId: "syncOfflinePunches",
        security: [{ DeviceTokenAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["punches"],
                properties: {
                  punches: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["clientPunchId", "branchId", "direction", "occurredAt", "latitude", "longitude", "accuracyMeters"],
                      properties: {
                        clientPunchId: { type: "string" },
                        branchId: { type: "string" },
                        direction: { type: "string", enum: ["IN", "OUT"] },
                        occurredAt: { type: "string", format: "date-time" },
                        latitude: { type: "number" },
                        longitude: { type: "number" },
                        accuracyMeters: { type: "number" },
                        isMockLocation: { type: "boolean", default: false },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Offline batch processed successfully.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    total: { type: "integer" },
                    accepted: { type: "integer" },
                    duplicates: { type: "integer" },
                    rejected: { type: "integer" },
                    results: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized: Missing, invalid, or expired device token.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },

    "/api/v1/notifications/push-token": {
      post: {
        tags: ["Notifications"],
        summary: "Register Mobile Device Push Notification Token",
        description: "Pairs an Expo or APNs/FCM push notification token with the authenticated staff member's device for shift reminders and alerts.",
        operationId: "registerPushToken",
        security: [{ DeviceTokenAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pushToken"],
                properties: {
                  pushToken: { type: "string", example: "ExponentPushToken[xxxxxxxxxxxxxx]" },
                  platform: { type: "string", enum: ["ios", "android", "web"], default: "android" },
                  deviceName: { type: "string", example: "Kofi's Galaxy S24" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Push token successfully registered.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    message: { type: "string", example: "Push notification token registered successfully." },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized: Missing, invalid, or expired device token.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },

    "/api/v1/attendance/leave-requests": {
      post: {
        tags: ["Attendance", "Mobile"],
        summary: "Submit Employee Leave / Day-Off Request",
        description: "Enables an employee to request annual, sick, or emergency leave. Once approved by a manager, DAY_OFF overrides are automatically placed on the roster.",
        operationId: "submitLeaveRequest",
        security: [{ DeviceTokenAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "startDate", "endDate", "reason"],
                properties: {
                  type: { type: "string", enum: ["ANNUAL", "SICK", "EMERGENCY", "CASUAL", "UNPAID", "OTHER"], example: "ANNUAL" },
                  startDate: { type: "string", format: "date", example: "2026-09-15" },
                  endDate: { type: "string", format: "date", example: "2026-09-18" },
                  reason: { type: "string", example: "Attending family function." },
                  branchId: { type: "string", example: "branch_accra_mall" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Leave request submitted successfully.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    leaveRequest: { type: "object" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error or invalid date range.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized: Missing or invalid device token.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
      get: {
        tags: ["Attendance", "Mobile"],
        summary: "List Employee Leave Requests",
        description: "Returns the employee's submitted leave requests with their review status and manager notes.",
        operationId: "getEmployeeLeaveRequests",
        security: [{ DeviceTokenAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          "200": {
            description: "List of leave requests.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    total: { type: "integer" },
                    leaveRequests: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized: Missing or invalid device token.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },

    "/api/v1/auth/mobile/otp/request": {
      post: {
        tags: ["Mobile Authentication"],
        summary: "Request Mobile SMS Verification Code",
        description: `
Initiates phone number authentication for a staff member.

**Process**:
1. Checks that the provided phone number matches an active employee record in the platform.
2. Generates a secure, single-use 6-digit verification code.
3. Dispatches SMS to the employee via the configured SMS gateway.
4. Returns an encrypted, tamper-evident \`challengeToken\` (valid for 5 minutes).

**Rate Limit**: 10 requests per 10 minutes per IP.
        `.trim(),
        operationId: "requestMobileOtp",
        requestBody: {
          required: true,
          description: "Staff mobile phone number.",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MobileOtpRequestInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Verification code sent to employee phone.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MobileOtpRequestResponse",
                },
              },
            },
          },
          "400": {
            description: "Invalid phone number or malformed request payload.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "403": {
            description: "Employee account is not active.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Phone number not recognized in active employee directory.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "429": {
            description: "Too many verification requests.",
            headers: {
              "Retry-After": {
                schema: { type: "integer" },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "502": {
            description: "SMS delivery provider error.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },

    "/api/v1/auth/mobile/otp/verify": {
      post: {
        tags: ["Mobile Authentication"],
        summary: "Verify OTP & Pair Mobile Device",
        description: `
Verifies the 6-digit SMS OTP code against the challenge token and binds the smartphone device identifier to the employee record.

**Process**:
1. Decrypts and authenticates the \`challengeToken\`.
2. Validates code hash using timing-safe comparison.
3. Binds the \`deviceId\` in \`EmployeeDeviceIdentity\` under \`MOBILE_APP\` provider.
4. Returns employee profile, assigned branches (with GPS geofences), and a 30-day \`deviceToken\`.

**Rate Limit**: 15 attempts per 5 minutes per IP.
        `.trim(),
        operationId: "verifyMobileOtp",
        requestBody: {
          required: true,
          description: "Verification code, challenge token, and client device identity.",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MobileOtpVerifyInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Device successfully paired and authenticated.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MobileOtpVerifyResponse",
                },
              },
            },
          },
          "400": {
            description: "Expired code or invalid challenge token.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Incorrect verification code.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "403": {
            description: "Employee account is inactive.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Employee record no longer exists.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "429": {
            description: "Too many verification attempts.",
            headers: {
              "Retry-After": {
                schema: { type: "integer" },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
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
      DeviceTokenAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "DeviceToken",
        description: "Signed 30-day mobile device session token issued by /api/v1/auth/mobile/otp/verify.",
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
          deviceToken: {
            type: "string",
            description: "Signed 30-day mobile device authentication token (if not sent in Authorization header).",
            example: "iv.ciphertext.tag",
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
      MobileOtpRequestInput: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "Mobile phone number of the employee (local Ghana or international E.164).",
            example: "0241234567",
          },
        },
        required: ["phone"],
      },
      MobileOtpRequestResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          message: { type: "string", example: "Verification code sent to your mobile phone." },
          challengeToken: {
            type: "string",
            description: "Encrypted, tamper-evident challenge token to submit back with the verification code.",
            example: "eyJpdiI6...",
          },
          expiresInSeconds: { type: "integer", example: 300 },
        },
        required: ["ok", "message", "challengeToken", "expiresInSeconds"],
      },
      MobileOtpVerifyInput: {
        type: "object",
        properties: {
          phone: { type: "string", example: "0241234567" },
          code: { type: "string", description: "6-digit verification code received via SMS.", example: "481920" },
          challengeToken: { type: "string", description: "Challenge token received from /otp/request." },
          deviceId: { type: "string", description: "Unique device identifier.", example: "device_ios_88192" },
          deviceName: { type: "string", description: "Human-readable device model.", example: "Kwame's iPhone 13" },
        },
        required: ["phone", "code", "challengeToken", "deviceId"],
      },
      MobileOtpVerifyResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          message: { type: "string", example: "Device registered and authenticated successfully." },
          employee: {
            type: "object",
            properties: {
              id: { type: "string", example: "emp_123" },
              employeeCode: { type: "string", example: "BAS-042" },
              firstName: { type: "string", example: "Kwame" },
              lastName: { type: "string", example: "Mensah" },
              phone: { type: "string", example: "+233241234567" },
              branches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "branch_spintex" },
                    name: { type: "string", example: "Spintex Road" },
                    slug: { type: "string", example: "spintex-road" },
                    latitude: { type: "number", example: 5.6037 },
                    longitude: { type: "number", example: -0.187 },
                    geofenceRadiusMeters: { type: "number", example: 100 },
                    geofenceEnabled: { type: "boolean", example: true },
                  },
                  required: ["id", "name", "slug", "geofenceRadiusMeters", "geofenceEnabled"],
                },
              },
            },
            required: ["id", "employeeCode", "firstName", "lastName", "branches"],
          },
          deviceToken: {
            type: "string",
            description: "Encrypted device session token valid for 30 days.",
            example: "eyJpdiI6...",
          },
        },
        required: ["ok", "message", "employee", "deviceToken"],
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
