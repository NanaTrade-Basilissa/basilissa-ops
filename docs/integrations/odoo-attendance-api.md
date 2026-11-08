# Attendance over the REST API

How to build a check-in / check-out client (mobile, kiosk, web) against `hr.attendance` using the
`rest_api` module.

Read [`API.md`](./API.md) first for authentication, headers and the error format. This document only
covers what is specific to attendance.

Every request below assumes the two standard headers:

```
X-Odoo-Db: basilissa-db
Authorization: Bearer <access_token>
```

---

## 1. Setup

### 1.1 Expose the models

Nothing is reachable until an administrator lists it in
**Settings → Technical → REST API → Exposed Models**:

| Model | Read | Create | Update | Delete | Why |
|---|:--:|:--:|:--:|:--:|---|
| `hr.attendance` | ✔ | ✔ | ✔ | optional | the records themselves |
| `hr.employee.public` | ✔ | | | | to resolve "which employee am I" |

> Use **`hr.employee.public`**, not `hr.employee`. A plain internal user has **no read access at all** to
> `hr.employee` — its ACL only covers *Officer: Manage all employees* and *Settings*. `hr.employee.public`
> grants read to every internal user and carries the fields a client needs.

Leave **Delete** off unless the client genuinely needs to remove records; corrections are normally a
`PATCH` of `check_out`.

### 1.2 Understand who may write

`hr.attendance` ships three groups, and the difference decides whether your client can check anyone in
at all:

| Group | Rights on `hr.attendance` | Which records |
|---|---|---|
| `group_hr_attendance_own_reader`<br>(*User: Read his own attendances* — implied by every internal user) | **read only** | `employee_id.user_id = me` |
| `group_hr_attendance_officer`<br>(*Officer: Manage attendances*) | read, create, write, delete | only where `employee_id.attendance_manager_id = me` |
| `group_hr_attendance_manager`<br>(*Administrator*) | read, create, write, delete | **all records** (`[(1,'=',1)]`) |

**A plain internal user cannot check themselves in.** With only the base group they get `403 forbidden`
on `POST /api/v1/hr.attendance`. This is Odoo's own access model, not a limitation of the API.

To let users record their own attendance, pick one:

- **Least privilege (recommended)** — on each employee record set **Attendance Manager** to that
  employee's own user. Odoo then satisfies the officer record rule for their own attendances, and
  `hr_attendance` automatically adds that user to *Officer: Manage attendances* when the field is set,
  so no separate group assignment is needed.
- **Supervisor model** — set one supervisor as Attendance Manager on a group of employees; that
  supervisor can check any of them in, and each employee still reads their own records.
- **Administrator** — full access to everyone's attendance. Convenient, and far more than a phone needs.

> ⚠️ **On `basilissa-db` today, all eight active users are in *Administrator*.** `hr_attendance` grants
> that group to the default-user template, and it was propagated to existing users at install. In
> practice your API clients will already be able to create, edit and delete **any employee's**
> attendance, including other people's. That works, but it means a stolen phone token can rewrite the
> whole company's timesheet. Consider trimming to the least-privilege setup above.

---

## 2. Resolve the current employee

`GET /api/v1/auth/me` returns the **user**, not the employee, and attendance is keyed on
`hr.employee`. Resolve it once at sign-in and cache it:

```
GET /api/v1/hr.employee.public?domain=[["user_id","=",22]]&fields=name,user_id
```

```json
{ "count": 1, "limit": 80, "offset": 0,
  "records": [ { "id": 2, "name": "API Demo", "user_id": [22, "API Demo"] } ] }
```

Take `records[0].id` — that is your `employee_id`.

> **Handle `count != 1`.** `count: 0` means the user has no employee record and cannot record attendance
> — show a clear error rather than failing on an undefined id. `count > 1` means duplicate employee
> records point at one user, and you must not guess. *(`basilissa-db` currently has two active employees
> both named "accounting" linked to `ac@test.com` — that account will hit this case.)*

---

## 3. The check-in / check-out cycle

There is no `check_in` / `check_out` action endpoint. Odoo's own toggle
(`hr.employee._attendance_action_change`) is a **private** method, and `/call` refuses any name starting
with an underscore. A client drives the cycle with ordinary CRUD, which is three calls:

### 3.1 Am I checked in? — find the open record

An open attendance is one with no `check_out`:

```
GET /api/v1/hr.attendance
    ?domain=[["employee_id","=",2],["check_out","=",false]]
    &fields=check_in,check_out
```

```json
{ "count": 1, "limit": 80, "offset": 0,
  "records": [ { "id": 1, "check_in": "2026-09-06 08:00:00", "check_out": false } ] }
```

`count: 0` → the user is checked out; show a **Check in** button.
`count: 1` → checked in since `check_in`; show **Check out** and keep `records[0].id`.

Do this on app launch and after resuming from background — the user may have checked out on another
device.

### 3.2 Check in — create

```
POST /api/v1/hr.attendance
```

```json
{
  "employee_id": 2,
  "check_in": "2026-09-06 08:00:00",
  "in_mode": "manual",
  "in_latitude": 5.6037,
  "in_longitude": -0.1870,
  "in_city": "Accra",
  "in_country_name": "Ghana"
}
```

**200** → `{ "id": 3, "record": { … } }`. Keep the `id` for the check-out call.

Geolocation is optional. Send it when the device can supply it — it is what makes the *View on Maps*
button work in the Odoo back office.

### 3.3 Check out — update

```
PATCH /api/v1/hr.attendance/3
```

```json
{ "check_out": "2026-09-06 17:00:00", "out_mode": "manual",
  "out_latitude": 5.6037, "out_longitude": -0.1870 }
```

Then re-read with explicit fields to get the computed totals:

```
GET /api/v1/hr.attendance/3?fields=employee_id,check_in,check_out,worked_hours,overtime_hours,in_mode,in_city
```

```json
{ "record": { "id": 3, "employee_id": [2, "API Demo"],
  "check_in": "2026-09-06 08:00:00", "check_out": "2026-09-06 17:00:00",
  "worked_hours": 9.0, "overtime_hours": 0.0,
  "in_mode": "manual", "in_city": "Accra" } }
```

> **Always re-read with `fields`.** The `record` returned by `POST`/`PATCH` is a full read of every
> column, which on `hr.attendance` (a `mail.thread` model) includes `message_ids`,
> `message_follower_ids`, `rating_ids`, `website_message_ids` and a dozen other chatter fields. Ignore
> that payload and fetch what you need.

---

## 4. Field reference — `hr.attendance`

| Field | Type | Writable | Notes |
|---|---|:--:|---|
| `employee_id` | many2one | ✔ (create) | **Required.** Reads back as `[id, "Name"]` |
| `check_in` | datetime | ✔ | **Required.** UTC. Defaults to now if omitted |
| `check_out` | datetime | ✔ | Empty (`false`) while the shift is open |
| `worked_hours` | float | computed | Hours as a decimal (`9.0` = 9h, `7.5` = 7h30). **Scheduled lunch is subtracted** |
| `overtime_hours` | float | computed | This record's share of the day's extra hours |
| `department_id` | many2one | related | From the employee |
| `in_mode` / `out_mode` | selection | ✔ | `kiosk`, `systray`, `manual`. Defaults to `manual` |
| `in_latitude` / `in_longitude` | float | ✔ | 7 decimal places |
| `out_latitude` / `out_longitude` | float | ✔ | |
| `in_city` / `out_city` | char | ✔ | |
| `in_country_name` / `out_country_name` | char | ✔ | |
| `in_ip_address` / `out_ip_address` | char | ✔ | |
| `in_browser` / `out_browser` | char | ✔ | |

`worked_hours` and `overtime_hours` are stored computed fields — never write them. They recalculate
automatically whenever you create, update or delete a record.

### Times are UTC

`check_in` and `check_out` are naive **UTC** strings, `"YYYY-MM-DD HH:MM:SS"`, with no timezone suffix.
This matters more here than anywhere else in the API: send a device's local wall-clock time and you will
record the wrong shift. Convert to UTC before sending, and convert back to the employee's timezone for
display — `GET /api/v1/auth/me` returns the user's `tz`.

---

## 5. Reading history

Recent records for one employee, newest first:

```
GET /api/v1/hr.attendance
    ?domain=[["employee_id","=",2]]
    &fields=check_in,check_out,worked_hours,overtime_hours
    &order=check_in desc
    &limit=30
```

A date range — remember the bounds are UTC:

```
domain=[["employee_id","=",2],
        ["check_in",">=","2026-09-01 00:00:00"],
        ["check_in","<","2026-10-01 00:00:00"]]
```

Still open right now, across everyone you can see (a "who is on site" board):

```
domain=[["check_out","=",false]]&fields=employee_id,check_in
```

Use the `count` in the response for pagination totals, not `records.length` — that is capped at `limit`
(default 80, maximum 200).

There is no aggregation endpoint. To total hours for a period, page through the records and sum
`worked_hours` client-side.

---

## 6. Errors you will actually hit

All arrive as `{"error": {"code": …, "message": …}}`. These are real responses from the endpoints:

| Situation | HTTP | Body |
|---|:--:|---|
| Checking in while already checked in | 400 | `validation_error` — *"Cannot create new attendance record for API Demo, the employee hasn't checked out since 09/06/2026 08:00:00"* |
| `check_out` earlier than `check_in` | 400 | `validation_error` — *"\"Check Out\" time cannot be earlier than \"Check In\" time."* |
| New record overlapping an existing one | 400 | `validation_error` — *"…the employee was already checked in on …"* |
| Plain user without officer/manager rights | 403 | `forbidden` — Odoo's access-rights explanation |
| `hr.attendance` not in the exposed list | 404 | `not_found` — *"Unknown resource: hr.attendance"* |
| Delete not enabled on the exposed model | 405 | `method_not_allowed` |
| Attendance id does not exist | 404 | `not_found` |

The overlap and ordering messages come from Odoo's model constraints, so they are already phrased for
end users — you can surface them directly. Treat any `validation_error` as "show the message, do not
retry".

**Design for the double-tap.** The overlap constraint is your safety net, not your UI: check the open
record (§3.1) before showing a Check-in button, and disable the button while the request is in flight.

---

## 7. Gotchas

- **Attendances cannot be duplicated.** The model overrides `copy()` to raise. `/call` refuses it anyway
  unless whitelisted — `{"method":"copy"}` returns `403 Method copy is not callable on hr.attendance`.
- **Overtime is recomputed for the whole day**, not just the record you touched, and only once the shift
  is closed — an open shift forces that day's extra hours to `0`. Do not expect `overtime_hours` to be
  meaningful before check-out.
- **`worked_hours` is not `check_out - check_in`.** Scheduled lunch from the employee's working schedule
  is subtracted, so 08:00–17:00 against a calendar with a 12:00–13:00 break returns `8.0`, not `9.0`.
  (The example in §3.3 returns `9.0` because that demo employee has no lunch period configured.)
- **No company/branch selection.** New records take the employee's own company; the client cannot choose
  a branch. See *Current limitations* in `API.md`.
- **One open record per employee** is enforced by the model. If a client crashes mid-shift the record
  stays open until someone closes it — an admin can fix it in the back office, or the client can `PATCH`
  the stale record's `check_out`.
- **Deleting is silent.** There is no archive on `hr.attendance`; `DELETE` removes the row and triggers
  an overtime recalculation for that day.

---

## 8. Worked example

```bash
BASE=http://localhost:8067/api/v1
DB='X-Odoo-Db: basilissa-db'
JSON='Content-Type: application/json'

# --- sign in -------------------------------------------------------------
TOKENS=$(curl -s -X POST "$BASE/auth/login" -H "$DB" -H "$JSON" \
  -d '{"login":"pos@test.com","password":"…","device":"Kiosk — Accra Mall"}')
ACCESS=$(echo "$TOKENS" | sed -n 's/.*"access_token": *"\([^"]*\)".*/\1/p')
UID=$(echo "$TOKENS"    | sed -n 's/.*"user": {"id": *\([0-9]*\).*/\1/p')
AUTH="Authorization: Bearer $ACCESS"

# --- resolve my employee -------------------------------------------------
EMP=$(curl -s -G -H "$DB" -H "$AUTH" "$BASE/hr.employee.public" \
  --data-urlencode "domain=[[\"user_id\",\"=\",$UID]]" --data-urlencode "fields=name" \
  | sed -n 's/.*"records": \[{"id": *\([0-9]*\).*/\1/p')

# --- am I checked in? ----------------------------------------------------
OPEN=$(curl -s -G -H "$DB" -H "$AUTH" "$BASE/hr.attendance" \
  --data-urlencode "domain=[[\"employee_id\",\"=\",$EMP],[\"check_out\",\"=\",false]]" \
  --data-urlencode "fields=check_in")

# --- check in (UTC!) -----------------------------------------------------
NOW=$(date -u +"%Y-%m-%d %H:%M:%S")
ATT=$(curl -s -X POST "$BASE/hr.attendance" -H "$DB" -H "$JSON" -H "$AUTH" \
  -d "{\"employee_id\":$EMP,\"check_in\":\"$NOW\",\"in_mode\":\"manual\"}")
AID=$(echo "$ATT" | sed -n 's/.*"id": *\([0-9]*\).*/\1/p' | head -1)

# --- check out -----------------------------------------------------------
OUT=$(date -u +"%Y-%m-%d %H:%M:%S")
curl -s -X PATCH "$BASE/hr.attendance/$AID" -H "$DB" -H "$JSON" -H "$AUTH" \
  -d "{\"check_out\":\"$OUT\",\"out_mode\":\"manual\"}" -o /dev/null

# --- what did that shift come to? ---------------------------------------
curl -s -H "$DB" -H "$AUTH" \
  "$BASE/hr.attendance/$AID?fields=check_in,check_out,worked_hours,overtime_hours"
```

### Client checklist

1. Resolve and cache `employee_id` once per sign-in; handle the zero and duplicate cases explicitly.
2. Re-check the open record on launch and on resume — the state may have changed elsewhere.
3. Convert to and from UTC at the edge of your app; never send device-local time.
4. Always pass `fields`; ignore the fat `record` in create/update responses.
5. Disable the check-in button while a request is in flight, and surface `validation_error` messages
   verbatim.
6. Queue offline check-ins with their **real** UTC timestamp and replay them later — `check_in` does not
   have to be "now".
