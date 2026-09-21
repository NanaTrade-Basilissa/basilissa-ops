# External Authentication Integration Guide (Trello-Style System)

This guide explains how to authenticate users and manage sessions in your external application (such as the Trello-style task management system) against the **Basilissa Operations Platform**.

---

## 🔑 Authentication Architecture Overview

- **User Authority**: Authenticates directly against the Basilissa `User` database table using **email** and **password**.
- **7-Day Sliding Session Token**: Upon successful login, the API returns a cryptographically signed 7-day Bearer JWT. As long as the user accesses the system at least once every 7 days (via `GET /api/v1/auth/me`), their session rolls forward automatically. If there is no activity for 7 consecutive days, the session expires.
- **Instant Revocation**: Tokens carry a reference to the user's database `sessionVersion` and `Session` ID. If an employee is deactivated, their password is changed, or their role changes in Basilissa, their token is immediately invalidated across all external clients.
- **Multi-Factor Authentication (MFA)**: If the user has MFA enabled on their Basilissa account, an optional 6-digit `mfaCode` can be passed in the payload.

---

## 📡 API Endpoints Summary

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Authenticate with email + password, receive 7-day sliding Bearer token | None (Rate-limited) |
| `GET` | `/api/v1/auth/me` | Validate session token, extend sliding window & fetch current user profile | `Bearer <token>` |
| `POST` | `/api/v1/auth/logout` | Revoke session immediately on server | `Bearer <token>` |

Interactive documentation and testing are available on the live Swagger UI at `/docs`.

---

## 1. User Sign In (`POST /api/v1/auth/login`)

Send the user's email and password to receive a 7-day sliding Bearer token.

### Request

```http
POST /api/v1/auth/login HTTP/1.1
Host: ops.basilissagh.com
Content-Type: application/json

{
  "email": "manager@basilissa.com",
  "password": "Password123!",
  "clientName": "trello_app"
}
```

### Success Response (`200 OK`)

```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-10-19T20:00:00.000Z",
  "user": {
    "id": "cm123abc456",
    "name": "Jane Doe",
    "email": "manager@basilissa.com",
    "status": "ACTIVE",
    "roles": ["BRANCH_MANAGER"],
    "roleAssignments": [
      {
        "role": "BRANCH_MANAGER",
        "scopeType": "BRANCH",
        "scopeId": "branch_spintex_01"
      }
    ],
    "permissions": ["feedback:read", "attendance:view"]
  }
}
```

### Error Responses

- **`401 Unauthorized` (Invalid Credentials / Inactive Account)**:
  ```json
  {
    "ok": false,
    "error": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
  ```
- **`401 Unauthorized` (MFA Required)**:
  If the account has TOTP MFA enabled and no `mfaCode` was passed:
  ```json
  {
    "ok": false,
    "error": "MFA_REQUIRED",
    "message": "Multi-factor authentication code is required"
  }
  ```
  Prompt the user to enter their 6-digit authenticator code and re-send with `"mfaCode": "123456"`.
- **`429 Too Many Requests` (Rate Limited)**:
  ```json
  {
    "ok": false,
    "error": "RATE_LIMITED",
    "message": "Too many login attempts. Please wait a moment before trying again."
  }
  ```

---

## 2. Verifying Session on App Launch (`GET /api/v1/auth/me`)

When the user opens your Trello application, verify whether their stored token is still active and valid.

### Request

```http
GET /api/v1/auth/me HTTP/1.1
Host: ops.basilissagh.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Success Response (`200 OK`)

```json
{
  "ok": true,
  "user": {
    "id": "cm123abc456",
    "name": "Jane Doe",
    "email": "manager@basilissa.com",
    "status": "ACTIVE",
    "roles": ["BRANCH_MANAGER"],
    "roleAssignments": [
      {
        "role": "BRANCH_MANAGER",
        "scopeType": "BRANCH",
        "scopeId": "branch_spintex_01"
      }
    ],
    "permissions": ["feedback:read", "attendance:view"]
  },
  "sessionId": "cm456def789"
}
```

### Error Response (`401 Unauthorized`)

If the token has expired, been revoked, or if the user's password or privileges changed:

```json
{
  "ok": false,
  "error": "UNAUTHORIZED",
  "message": "Invalid, expired, or revoked session token"
}
```
*Action*: Clear local token storage and redirect the user to the login screen.

---

## 3. Sign Out (`POST /api/v1/auth/logout`)

Revoke the session immediately on the server so that the token can no longer be used.

### Request

```http
POST /api/v1/auth/logout HTTP/1.1
Host: ops.basilissagh.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Success Response (`200 OK`)

```json
{
  "ok": true,
  "message": "Signed out successfully"
}
```

---

## 💻 Code Examples for the Trello System

### TypeScript / JavaScript Client Helper

```typescript
// lib/auth-client.ts

const API_BASE = process.env.NEXT_PUBLIC_BASILISSA_API_URL || "https://ops.basilissagh.com";

export interface LoginParams {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface LoginResponse {
  ok: boolean;
  token?: string;
  expiresAt?: string;
  user?: UserProfile;
  error?: string;
  message?: string;
}

/**
 * Perform login against Basilissa Operations API.
 */
export async function loginToBasilissa(params: LoginParams): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      mfaCode: params.mfaCode,
      clientName: "trello_app",
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Login failed");
  }

  return data;
}

/**
 * Validate token and fetch current user profile.
 */
export async function getCurrentUser(token: string): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.message || "Session invalid");
  }

  return data.user;
}

/**
 * Revoke the current session token on the server.
 */
export async function logoutFromBasilissa(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
```

### React Hook Example (`useAuth`)

```typescript
// hooks/useAuth.ts
import { useState, useEffect } from "react";
import { getCurrentUser, loginToBasilissa, logoutFromBasilissa, type UserProfile } from "@/lib/auth-client";

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("basilissa_trello_token");
    if (!token) {
      setLoading(false);
      return;
    }

    getCurrentUser(token)
      .then((profile) => setUser(profile))
      .catch(() => {
        localStorage.removeItem("basilissa_trello_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string, mfaCode?: string) => {
    const result = await loginToBasilissa({ email, password, mfaCode });
    if (result.token && result.user) {
      localStorage.setItem("basilissa_trello_token", result.token);
      setUser(result.user);
    }
    return result;
  };

  const logout = async () => {
    const token = localStorage.getItem("basilissa_trello_token");
    if (token) {
      await logoutFromBasilissa(token).catch(() => {});
      localStorage.removeItem("basilissa_trello_token");
    }
    setUser(null);
  };

  return { user, loading, login, logout, isAuthenticated: Boolean(user) };
}
```

### cURL Quick Test

```bash
# 1. Login
curl -X POST https://ops.basilissagh.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@basilissa.com","password":"YourPassword","clientName":"curl_test"}'

# 2. Check Profile
curl -X GET https://ops.basilissagh.com/api/v1/auth/me \
  -H "Authorization: Bearer <TOKEN>"

# 3. Logout
curl -X POST https://ops.basilissagh.com/api/v1/auth/logout \
  -H "Authorization: Bearer <TOKEN>"
```
