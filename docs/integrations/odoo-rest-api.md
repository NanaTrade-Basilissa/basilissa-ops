# REST API — developer reference

A token-authenticated REST surface over Odoo 17, for mobile apps and browser clients.

Odoo ships two ways in and neither suits an external app: session cookies are stateful, and
`type='json'` routes are JSON-RPC that answer **HTTP 200 even for errors**. This module adds real REST
semantics — meaningful status codes, JSON error bodies, and no session cookie.

- **Base URL** — `http://<host>:8067/api/v1`
- **Auth** — `Authorization: Bearer <access_token>`
- **Content type** — `application/json` on every request with a body

---

## 1. Conventions

### Required headers

| Header | When | Value |
|---|---|---|
| `X-Odoo-Db` | **Every request** (see note) | database name, e.g. `basilissa-db` |
| `Content-Type` | requests with a body | `application/json` |
| `Authorization` | protected endpoints | `Bearer <access_token>` |

> **`X-Odoo-Db` is mandatory when the server hosts more than one database.** Odoo picks the database in
> `Request.__init__`, before any route runs, from either a session cookie or single-database
> auto-selection. A cookie-less REST client has neither. Omit the header on a multi-database server and
> you get a bare **HTML 404**, not an auth error — this is the single most common setup mistake.
> `?db=<name>` on the query string works identically. On a single-database server the header is optional.

### Request bodies

Bodies are parsed as **raw JSON**. `multipart/form-data` and `application/x-www-form-urlencoded` are not
accepted and produce `400 bad_request`.

### Responses

Success bodies are plain JSON objects; the shape is documented per endpoint. Errors are always:

```json
{ "error": { "code": "unauthorized", "message": "Invalid credentials" } }
```

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `bad_request` | Missing/invalid parameter, malformed JSON body |
| 400 | `validation_error` | Odoo `ValidationError` — a constraint rejected the data |
| 401 | `unauthorized` | Missing, invalid, expired or revoked token; bad credentials |
| 403 | `forbidden` | Authenticated, but Odoo access rights or record rules refuse |
| 404 | `not_found` | Model not exposed, or record does not exist |
| 405 | `method_not_allowed` | Operation not enabled for this model, or wrong HTTP verb |
| 500 | `server_error` | Unexpected failure. Detail is logged, never returned |

### Statelessness

No endpoint sets a `session_id` cookie. Every request is authenticated solely by its bearer token, so
clients need no cookie jar.

---

## 2. Authentication

### Token model

Login returns two tokens:

| Token | Default lifetime | Purpose |
|---|---|---|
| `access_token` | 1 hour | Sent on every request |
| `refresh_token` | 30 days | Exchanged for a new pair when the access token expires |

Tokens are opaque 64-character hex strings, stored **hashed** — the plaintext exists only in the
response that created it and cannot be recovered afterwards. Revoking a refresh token also revokes every
access token minted from it.

**Refresh rotates.** Each call to `/auth/refresh` invalidates the refresh token you presented and issues
a new one. Always persist the new value; replaying a consumed refresh token returns 401.

---

### `POST /auth/login`

Public. Exchanges credentials for a token pair.

```json
{ "login": "user@example.com", "password": "secret", "device": "iPhone 15 — Sales" }
```

`device` is optional and only labels the session in the admin's token list.

**200** — signed in:

```json
{
  "access_token": "672a0900b0a9d85b38277501d2687e83…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "610804c32726982c9f667e5365c6b6f6…",
  "refresh_expires_in": 2592000,
  "user": {
    "id": 22, "name": "API Demo", "login": "apidemo", "email": false,
    "partner_id": 36, "company_id": 1, "company_name": "My Company",
    "lang": "en_US", "tz": false, "is_share": false
  }
}
```

**202** — the account has two-factor authentication enabled. No tokens yet:

```json
{ "mfa_required": true, "mfa_type": "totp", "challenge_token": "…" }
```

Post the challenge plus the 6-digit code to `/auth/mfa` to finish. The challenge is valid for 5 minutes
and is single-use.

**401** — `Invalid credentials`. Identical whether the login or the password was wrong.

> **Rate limiting.** Failed logins are counted per client IP using Odoo's own cooldown
> (`base.login_cooldown_after`, default 5; `base.login_cooldown_duration`, default 60s). Exceed it and
> you get 401 `Too many login failures, please wait a bit before trying again.` — that is the cooldown,
> not a credential problem.

---

### `POST /auth/mfa`

Public. Completes a two-factor login.

```json
{ "challenge_token": "…", "code": "123456" }
```

**200** — same body as a successful `/auth/login`. **401** — wrong code, or an expired/already-used
challenge.

---

### `POST /auth/refresh`

Public. Exchanges a refresh token for a new pair.

```json
{ "refresh_token": "…" }
```

**200** — same body as `/auth/login`, with a **new** `refresh_token`. **401** — expired, revoked, or
already-rotated token.

---

### `POST /auth/logout`

Bearer. Revokes the presenting token and its whole family (the refresh token and every access token
under it).

**200** → `{ "logged_out": true }`

---

### `GET /auth/sessions`

Bearer. The caller's live refresh tokens — one per signed-in device.

```json
{ "sessions": [
  { "id": 12, "device": "iPhone 15 — Sales", "ip": "10.0.0.4",
    "created_at": "2026-09-05T09:12:44", "expires_at": "2026-10-05T09:12:44", "current": true }
]}
```

---

### `GET /auth/me`

Bearer. The authenticated user. Same `user` object as the login response.

```json
{ "user": { "id": 22, "name": "API Demo", "login": "apidemo", … } }
```

Prefer this over exposing `res.users` when the app only needs "who am I".

---

### `PATCH /auth/me`

Bearer. Updates the caller's own profile. Keys are filtered to Odoo's `SELF_WRITEABLE_FIELDS` — the same
allowlist that bounds the web client's own profile form.

```json
{ "name": "New Name", "tz": "Africa/Accra", "login": "nope" }
```

Anything outside the allowlist is **silently ignored and reported back**, not rejected:

```json
{ "user": { … }, "ignored_fields": ["login"] }
```

> **Do not hard-code the allowlist.** It is `base`'s set (`name`, `email`, `signature`, `lang`, `tz`,
> `image_1920`, `company_id`, `action_id`) *plus whatever installed modules add*, so it differs per
> deployment — with `hr` installed it grows to around sixty fields covering private address, emergency
> contact, identification and `pin`. Discover it at runtime from the `ignored_fields` array, and review
> what your installation actually permits before relying on this endpoint.

---

### `POST /auth/password/change`

Bearer.

```json
{ "old_password": "…", "new_password": "…" }
```

**200** → `{ "password_changed": true }`. On success every other token belonging to that user is revoked;
only the caller's current session survives. **401** if the old password is wrong.

---

### `POST /auth/password/reset`

Public. Triggers Odoo's standard reset email.

```json
{ "login": "user@example.com" }
```

**Always 200** → `{ "requested": true }`, whether or not the account exists. This is deliberate: a
differing response would turn the endpoint into an account-enumeration oracle. Do not use the response
to tell the user whether their address was recognised.

---

## 3. Data endpoints

All require `Authorization: Bearer`. All operate on models an administrator has **explicitly exposed**
(§4) — anything else returns 404.

Every call runs **as the token's user, never as superuser**. Odoo's access rights and record rules are
what decide the result; the whitelist only controls reachability.

### `GET /{model}` — list

Query parameters, all optional:

| Param | Type | Default | Notes |
|---|---|---|---|
| `domain` | JSON array | `[]` | Standard Odoo domain, e.g. `[["is_company","=",true]]` |
| `fields` | CSV | all fields | `name,email,phone` |
| `limit` | int | 80 | Capped at **200** |
| `offset` | int | 0 | |
| `order` | string | model default | e.g. `name asc` |

```
GET /api/v1/res.partner?fields=name,email&limit=20&offset=0&order=name%20asc
```

```json
{ "count": 314, "limit": 20, "offset": 0,
  "records": [ { "id": 36, "name": "API Demo", "email": false } ] }
```

`count` is the total matching the domain, ignoring pagination — use it to drive paging.

> **Always send `fields`.** Omitting it returns every column, including base64 binaries such as avatars
> and attachments. On models with images this is the difference between a 2 KB and a 2 MB response.

### `GET /{model}/fields` — metadata

Returns `string`, `type`, `required`, `readonly`, `relation`, `selection` and `help` per field — enough
to build a form without hard-coding the schema.

```json
{ "fields": { "name": { "string": "Name", "type": "char", "required": true }, … } }
```

### `GET /{model}/{id}` — read one

Accepts `fields` as above. **404** if the record does not exist or the model is not exposed.

```json
{ "record": { "id": 2, "name": "Administrator", "login": "admin" } }
```

### `POST /{model}` — create

Body is the values object.

```json
{ "name": "New Contact", "email": "new@example.com" }
```

**200** → `{ "id": 37, "record": { … } }`

### `PATCH /{model}/{id}` — update

`PUT` is accepted as an alias. Body is the values object; partial updates only touch the keys you send.

**200** → `{ "id": 37, "record": { … } }`

### `DELETE /{model}/{id}` — delete

**200** → `{ "id": 37, "deleted": true }`

### `POST /{model}/{id}/call` — invoke a business method

Only method names an administrator has listed for that model, and never a name starting with `_`.

```json
{ "method": "action_confirm", "args": [], "kwargs": {} }
```

**200** → `{ "result": … }`. Recordsets are serialised to their id list; anything not JSON-native is
stringified. **403** if the method is not whitelisted.

### Field value formats

| Odoo type | JSON |
|---|---|
| `many2one` | `[id, "Display Name"]` — or `false` |
| `one2many` / `many2many` | array of ids |
| `date` | `"2026-09-05"` |
| `datetime` | `"2026-09-05 14:30:00"` — **UTC**, no timezone suffix |
| `binary` | base64 string |
| empty char/text | `false`, not `null` |

To **write** an x2many, use Odoo command triplets, e.g. `"tag_ids": [[6, 0, [1, 2, 3]]]`.

Dotted paths are **not** supported — `fields=partner_id.email` is rejected. Read the related record
separately.

---

## 4. Exposing a model

Nothing is reachable until an administrator adds it:

**Settings → Technical → REST API → Exposed Models**

| Field | Effect |
|---|---|
| Model | The technical model, e.g. `res.partner` |
| Read / Create / Update / Delete | Enables the matching verb. A disabled verb returns **405** |
| Callable Methods | Comma-separated names reachable via `/call`. Empty = none. Private names refused |
| Archived | Archiving the row removes access without deleting it |

A model that is not listed returns **404**, not 403 — the API does not confirm which models exist.

**Exposing a model grants nothing by itself.** A user still needs the corresponding Odoo access rights;
without them the call returns 403 with Odoo's own explanation.

---

## 5. Configuration

**Settings → General Settings → Integrations → REST API**

| Setting | Parameter | Default |
|---|---|---|
| Access token lifetime | `rest_api.access_token_ttl` | 3600 s |
| Refresh token lifetime | `rest_api.refresh_token_ttl` | 2592000 s (30 d) |
| MFA challenge lifetime | `rest_api.mfa_challenge_ttl` | 300 s |
| Allowed origins (CORS) | `rest_api.cors_origins` | empty |

**CORS** applies to browser clients only; mobile apps ignore it. The value must be the origin of the
*calling web app* (e.g. `https://app.example.com`), not Odoo's own URL. Empty means no CORS header is
sent, which blocks browsers. `*` allows any origin — acceptable here because authentication is a bearer
token, not an ambient cookie.

Administrators manage tokens under **Settings → Technical → REST API → API Tokens** and can revoke any
of them; a revoked token stops working on its next request. A daily cron purges expired rows.

---

## 6. Deployment notes

- **Requires `server_wide_modules = base,web,rest_api`** in `odoo.conf` when the server hosts multiple
  databases. The code that reads `X-Odoo-Db` runs before any database is chosen, so it must be loaded at
  startup. Without it, every `/api/v1` call 404s. A per-host `dbfilter` resolving to one database is the
  alternative.
- **Put it behind HTTPS.** Bearer tokens are only as safe as the transport.
- **Enable `proxy_mode`** behind a reverse proxy, or the login rate-limiter counts the proxy's IP
  instead of the real client's and will lock out everyone at once.

---

## 7. Current limitations

Known and deliberate, so you can design around them:

- **No multi-company / branch selection.** A client cannot choose which company or branch it is working
  in. Today the behaviour is Odoo's default: **reads span every company the user belongs to**, and
  **new records are created in the user's default company** (`res.users.company_id`). For a user who
  belongs to a single branch this is correct. For a multi-branch user there is currently no way to say
  "create this in Accra Mall" — that needs an `allowed_company_ids` selector, which is not implemented.
- **Access is per company membership, not inherited.** A user who belongs to a parent company does not
  see its branches' records unless they are also a member of those branches.
- **`/call` is not a sandbox.** It restricts which method *names* may be invoked; it cannot restrict what
  those methods do internally. Treat whitelisting a method as granting everything that method touches.
- **Related names leak through many2one values.** A `many2one` serialises as `[id, "Display Name"]`, so
  the display name of a record in a non-exposed model is visible.
- **No rate limiting on data endpoints.** Only login is throttled. Add a reverse-proxy limit if the API
  is public.
- **No bulk write or multi-record delete**, and no `read_group`/aggregation endpoint.

---

## 8. Quickstart

```bash
BASE=http://localhost:8067/api/v1
DB='X-Odoo-Db: basilissa-db'
JSON='Content-Type: application/json'

# 1. Sign in
TOKENS=$(curl -s -X POST "$BASE/auth/login" -H "$DB" -H "$JSON" \
  -d '{"login":"user@example.com","password":"secret","device":"cli"}')
ACCESS=$(echo "$TOKENS"  | sed -n 's/.*"access_token": *"\([^"]*\)".*/\1/p')
REFRESH=$(echo "$TOKENS" | sed -n 's/.*"refresh_token": *"\([^"]*\)".*/\1/p')

AUTH="Authorization: Bearer $ACCESS"

# 2. Who am I
curl -s -H "$DB" -H "$AUTH" "$BASE/auth/me"

# 3. Read an exposed model
curl -s -H "$DB" -H "$AUTH" "$BASE/res.partner?fields=name,email&limit=5"

# 4. Create
curl -s -X POST "$BASE/res.partner" -H "$DB" -H "$JSON" -H "$AUTH" \
  -d '{"name":"Created via API"}'

# 5. Renew when the access token expires (keep the NEW refresh token)
curl -s -X POST "$BASE/auth/refresh" -H "$DB" -H "$JSON" \
  -d "{\"refresh_token\":\"$REFRESH\"}"

# 6. Sign out
curl -s -X POST "$BASE/auth/logout" -H "$DB" -H "$JSON" -H "$AUTH" -d '{}'
```

### Client checklist

1. Store both tokens in secure storage (Keychain / Keystore), never in plain preferences.
2. Send `X-Odoo-Db` and `Authorization` on every call — set them once in your HTTP client.
3. On **401**, refresh once and retry the original request; if the refresh also 401s, sign the user out.
4. Serialise refreshes — concurrent requests hitting 401 together must not each rotate the token, or all
   but one will fail. Use a single-flight lock.
5. Always send `fields` on list calls.
6. Treat `count` as the pagination total, not `records.length`.
