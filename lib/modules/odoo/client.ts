import "server-only";
import { scoped } from "@/lib/platform/logger";
import type { OdooAuthMode, OdooConnectionStatus } from "./constants";
import type { RawOdooEmployeeRecord } from "./policy";

const log = scoped("odoo:client");

export class OdooApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "OdooApiError";
    this.status = status;
    this.code = code;
  }
}

export type OdooEnvConfig = {
  baseUrl: string | null;
  database: string | null;
  apiKey: string | null;
  apiKeyHeader: string;
  accessToken: string | null;
  login: string | null;
  password: string | null;
  authMode: OdooAuthMode;
};

export function getOdooEnvConfig(): OdooEnvConfig {
  const rawBaseUrl = process.env.ODOO_API_URL?.trim() || null;
  let baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, "") : null;
  if (baseUrl && !baseUrl.endsWith("/api/v1")) {
    baseUrl = `${baseUrl}/api/v1`;
  }
  const database = process.env.ODOO_DB?.trim() || null;
  const apiKey = process.env.ODOO_API_KEY?.trim() || null;
  const apiKeyHeader = process.env.ODOO_API_KEY_HEADER?.trim() || "X-API-Key";
  const accessToken = process.env.ODOO_ACCESS_TOKEN?.trim() || null;
  const login = process.env.ODOO_LOGIN?.trim() || null;
  const password = process.env.ODOO_PASSWORD?.trim() || null;

  let authMode: OdooAuthMode = "unconfigured";
  if (baseUrl) {
    if (apiKey) {
      authMode = "api_key";
    } else if (accessToken) {
      authMode = "bearer_token";
    } else if (login && password) {
      authMode = "login_fallback";
    }
  }

  return {
    baseUrl,
    database,
    apiKey,
    apiKeyHeader,
    accessToken,
    login,
    password,
    authMode,
  };
}

/**
 * Ephemeral in-memory token cache used ONLY when testing via `login_fallback`
 * before `ODOO_API_KEY` is configured. Once `ODOO_API_KEY` is set, this path
 * is bypassed completely.
 */
type CachedTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
};

let cachedTokens: CachedTokenPair | null = null;
let inflightTokenPromise: Promise<string> | null = null;

async function parseErrorResponse(response: Response): Promise<OdooApiError> {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
    if (parsed?.error) {
      return new OdooApiError(
        response.status,
        parsed.error.code ?? `http_${response.status}`,
        parsed.error.message ?? `Odoo API error (${response.status})`,
      );
    }
  } catch {
    // Plain HTML (e.g. missing X-Odoo-Db 404) or non-JSON body
  }
  return new OdooApiError(
    response.status,
    `http_${response.status}`,
    text ? `Odoo HTTP ${response.status}: ${text.slice(0, 200)}` : `Odoo HTTP ${response.status}`,
  );
}

async function acquireFallbackBearerToken(config: OdooEnvConfig, forceRefresh = false): Promise<string> {
  if (config.accessToken && !forceRefresh) {
    return config.accessToken;
  }

  if (
    !forceRefresh &&
    cachedTokens &&
    cachedTokens.expiresAtMs > Date.now() + 30_000
  ) {
    return cachedTokens.accessToken;
  }

  if (inflightTokenPromise) {
    return inflightTokenPromise;
  }

  inflightTokenPromise = (async () => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.database) {
        headers["X-Odoo-Db"] = config.database;
      }

      // 1. Try rotating refresh token if we already had a session
      if (cachedTokens?.refreshToken) {
        const refreshRes = await fetch(`${config.baseUrl}/auth/refresh`, {
          method: "POST",
          headers,
          body: JSON.stringify({ refresh_token: cachedTokens.refreshToken }),
          cache: "no-store",
        });

        if (refreshRes.ok) {
          const body = (await refreshRes.json()) as {
            access_token: string;
            refresh_token: string;
            expires_in?: number;
          };
          cachedTokens = {
            accessToken: body.access_token,
            refreshToken: body.refresh_token,
            expiresAtMs: Date.now() + (body.expires_in ?? 3600) * 1000,
          };
          return cachedTokens.accessToken;
        }
        cachedTokens = null;
      }

      // 2. Fallback to /auth/login for temporary local dev testing
      if (!config.login || !config.password) {
        throw new OdooApiError(
          401,
          "unconfigured_auth",
          "Neither ODOO_API_KEY nor temporary ODOO_LOGIN/ODOO_PASSWORD credentials are set.",
        );
      }

      const loginRes = await fetch(`${config.baseUrl}/auth/login`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          login: config.login,
          password: config.password,
          device: "Basilissa Ops Sync Worker (Dev Fallback)",
        }),
        cache: "no-store",
      });

      if (!loginRes.ok) {
        throw await parseErrorResponse(loginRes);
      }

      const loginBody = (await loginRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        mfa_required?: boolean;
      };

      if (loginBody.mfa_required || !loginBody.access_token) {
        throw new OdooApiError(
          401,
          "mfa_not_supported",
          "Odoo account requires interactive MFA; use ODOO_API_KEY or a non-MFA service account.",
        );
      }

      cachedTokens = {
        accessToken: loginBody.access_token,
        refreshToken: loginBody.refresh_token ?? "",
        expiresAtMs: Date.now() + (loginBody.expires_in ?? 3600) * 1000,
      };
      return cachedTokens.accessToken;
    } finally {
      inflightTokenPromise = null;
    }
  })();

  return inflightTokenPromise;
}

export async function odooRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const config = getOdooEnvConfig();
  if (!config.baseUrl || config.authMode === "unconfigured") {
    throw new OdooApiError(
      503,
      "unconfigured",
      "Odoo API is not configured. Set ODOO_API_URL, ODOO_DB, and ODOO_API_KEY.",
    );
  }

  const method = options.method ?? "GET";
  const url = new URL(`${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const buildHeaders = async (forceRefresh = false): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    if (config.database) {
      headers["X-Odoo-Db"] = config.database;
    }
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (config.authMode === "api_key" && config.apiKey) {
      // Primary system-to-system authentication via X-API-Key
      headers[config.apiKeyHeader] = config.apiKey;
      headers["X-API-Key"] = config.apiKey;
      headers["X-API"] = config.apiKey;
    } else {
      const token = await acquireFallbackBearerToken(config, forceRefresh);
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  };

  let response = await fetch(url.toString(), {
    method,
    headers: await buildHeaders(false),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  // On 401 when using temporary login_fallback, refresh once and retry
  if (response.status === 401 && config.authMode === "login_fallback") {
    log.info("Odoo returned 401 in login_fallback mode, refreshing token once");
    response = await fetch(url.toString(), {
      method,
      headers: await buildHeaders(true),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as T;
}

export type OdooListResponse<T> = {
  count: number;
  limit: number;
  offset: number;
  records: T[];
};

export type OdooCreateOrUpdateResponse = {
  id: number;
  record?: Record<string, unknown>;
};

export type OdooAttendanceRecord = {
  id: number;
  employee_id: [number, string] | false;
  check_in: string;
  check_out: string | false;
  worked_hours?: number;
  overtime_hours?: number;
};

/**
 * Checks connectivity and authentication against the configured Odoo REST API.
 */
export async function getOdooConnectionStatus(): Promise<OdooConnectionStatus> {
  const config = getOdooEnvConfig();
  if (!config.baseUrl || config.authMode === "unconfigured") {
    return {
      configured: false,
      reachable: false,
      authMode: config.authMode,
      baseUrl: config.baseUrl,
      database: config.database,
      message: "Odoo API is not configured. Set ODOO_API_URL, ODOO_DB, and ODOO_API_KEY in environment.",
    };
  }

  try {
    // Try /auth/me first; if X-API-Key mode does not expose /auth/me, fall back to a 1-row employee probe
    try {
      const me = await odooRequest<{ user?: { id?: number; name?: string; login?: string } }>("/auth/me");
      return {
        configured: true,
        reachable: true,
        authMode: config.authMode,
        baseUrl: config.baseUrl,
        database: config.database,
        authenticatedAs: me.user?.name ?? me.user?.login ?? null,
        message: "Connected to Odoo REST API.",
      };
    } catch (meErr) {
      if (meErr instanceof OdooApiError && (meErr.status === 404 || meErr.status === 405)) {
        const probe = await odooRequest<OdooListResponse<{ id: number }>>("/hr.employee.public", {
          query: { fields: "id", limit: 1 },
        });
        return {
          configured: true,
          reachable: true,
          authMode: config.authMode,
          baseUrl: config.baseUrl,
          database: config.database,
          authenticatedAs: "X-API-Key Service Client",
          message: `Connected to Odoo REST API (${probe.count} employee records visible).`,
        };
      }
      throw meErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      reachable: false,
      authMode: config.authMode,
      baseUrl: config.baseUrl,
      database: config.database,
      message: `Unable to reach Odoo REST API: ${message}`,
    };
  }
}

/**
 * Pages through all employees in Odoo (`hr.employee` preferred, falling back to
 * `hr.employee.public` if `hr.employee` is not exposed or forbidden).
 */
export async function fetchAllOdooEmployees(): Promise<{
  modelUsed: "hr.employee" | "hr.employee.public";
  records: RawOdooEmployeeRecord[];
}> {
  const fields = "id,name,job_title,work_email,work_phone,mobile_phone,department_id,company_id,active";
  const pageSize = 200;

  const fetchFromModel = async (
    model: "hr.employee" | "hr.employee.public",
  ): Promise<RawOdooEmployeeRecord[]> => {
    const all: RawOdooEmployeeRecord[] = [];
    let offset = 0;

    while (true) {
      const page = await odooRequest<OdooListResponse<RawOdooEmployeeRecord>>(`/${model}`, {
        query: {
          fields,
          limit: pageSize,
          offset,
          order: "id asc",
        },
      });

      all.push(...page.records);
      offset += page.records.length;

      if (page.records.length === 0 || offset >= page.count) {
        break;
      }
    }

    return all;
  };

  try {
    const records = await fetchFromModel("hr.employee");
    return { modelUsed: "hr.employee", records };
  } catch (err) {
    if (err instanceof OdooApiError && (err.status === 403 || err.status === 404)) {
      log.info("hr.employee returned 403/404, falling back to hr.employee.public", {
        status: err.status,
      });
      const records = await fetchFromModel("hr.employee.public");
      return { modelUsed: "hr.employee.public", records };
    }
    throw err;
  }
}

/**
 * Queries Odoo for any attendance records of `odooEmployeeId` that overlap the
 * `[checkInUtc, checkOutUtc]` window or are still open (`check_out = false`).
 */
export async function findConflictingOdooAttendances(
  odooEmployeeId: number,
  checkInUtc: string,
  checkOutUtc: string,
): Promise<OdooAttendanceRecord[]> {
  const domain = JSON.stringify([
    "&",
    ["employee_id", "=", odooEmployeeId],
    "|",
    ["check_out", "=", false],
    "&",
    ["check_in", "<", checkOutUtc],
    ["check_out", ">", checkInUtc],
  ]);

  const response = await odooRequest<OdooListResponse<OdooAttendanceRecord>>("/hr.attendance", {
    query: {
      domain,
      fields: "id,employee_id,check_in,check_out,worked_hours,overtime_hours",
      limit: 20,
      order: "check_in desc",
    },
  });

  return response.records;
}

/**
 * Creates a completed attendance record in Odoo (`POST /api/v1/hr.attendance`).
 */
export async function createOdooAttendance(input: {
  odooEmployeeId: number;
  checkInUtc: string;
  checkOutUtc: string;
}): Promise<number> {
  const res = await odooRequest<OdooCreateOrUpdateResponse>("/hr.attendance", {
    method: "POST",
    body: {
      employee_id: input.odooEmployeeId,
      check_in: input.checkInUtc,
      check_out: input.checkOutUtc,
      in_mode: "manual",
      out_mode: "manual",
    },
  });

  return res.id;
}

/**
 * Updates an existing attendance record in Odoo (`PATCH /api/v1/hr.attendance/{id}`),
 * used when closing an open record or updating `check_out` after overtime approval.
 */
export async function updateOdooAttendance(
  odooAttendanceId: number,
  input: {
    checkInUtc?: string;
    checkOutUtc: string;
  },
): Promise<number> {
  const body: Record<string, unknown> = {
    check_out: input.checkOutUtc,
    out_mode: "manual",
  };
  if (input.checkInUtc) {
    body.check_in = input.checkInUtc;
  }

  const res = await odooRequest<OdooCreateOrUpdateResponse>(`/hr.attendance/${odooAttendanceId}`, {
    method: "PATCH",
    body,
  });

  return res.id;
}
