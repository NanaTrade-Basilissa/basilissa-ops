# Device Investigation Findings — ZKTeco K40 Pro

> Stage 2a of [Phase 2](./implementation-plan.md#phase-2--fingerprint-integration)
> asks for a written findings document before any device-gateway code is
> written. This is that document. It closes **U1** and **U2** in the
> [open-decisions register](./open-decisions.md).
>
> **Method:** live testing against a real unit, 2026-09-22 — network probes,
> a raw protocol poll (`node-zklib`), and a real HTTP/HTTPS listener the
> device was pointed at directly (first on the local network, then across
> the open internet via a temporary public tunnel). Not a datasheet read.
>
> **Scope:** connectivity and protocol only. Nothing here is a security
> review of the endpoint we'll eventually build, and nothing here should be
> read as "safe to expose as-is" — see Security posture below.

## Device

- **Model:** ZKTeco K40 Pro. **Firmware:** `Ver 8.0.4.3-20230515`. **Serial:**
  `GED7234700295` (from live `INFO=` query strings — treat this as a real
  identifier, not an example).
- **Comm. menu** offers exactly three options: **Ethernet**, **PC
  Connection**, **Cloud Server Setting**. No Wi-Fi entry — this unit is
  Ethernet-only regardless of what network the building otherwise has.
- Unexpected: **port 80 is open and serves a web admin console** (`Server:
  ZK Web Server`, redirects to `/csl/login`). Not something the original
  script or the architecture doc anticipated. Login was not attempted.

## Protocol — both poll and push exist on this hardware

**Poll** (`PC Connection` / `Ethernet`, TCP `4370`) — the proprietary ZK
binary protocol. `node-zklib` connects with **zero credentials** (Comm Key
was `0`, i.e. unset) and freely returns:
- `getInfo()` → `{ userCounts, logCounts, logCapacity: 200000 }`
- `getUsers()` → PIN, name, **role, and a plaintext PIN/password field per
  user**
- `getAttendances()` → raw punch rows

**Push** (`Cloud Server Setting`, Server Mode `ADMS`) — ZKTeco's documented
"iClock/ADMS" protocol, plain flat HTTP, not the binary protocol:
- Device announces itself: `GET /iclock/cdata?SN=<serial>&options=all&language=69&pushver=2.4.1`
- Pushes three tables as tab-separated text, one `POST` per table:
  `USER` (enrolled users, **including the plaintext password field**),
  `ATTLOG` (attendance — the table we actually want), `OPERLOG` (device
  event/audit log — not needed for attendance).
- Then settles into `GET /iclock/getrequest?SN=<serial>` roughly every
  8–20 seconds, asking "anything for me?" A generic `200 OK` to every
  request was enough to keep it happily connected through a full sync and
  subsequent live punches — no need to implement real ADMS command
  responses for this test.
- `ATTLOG` row shape confirmed live: `PIN, timestamp, status code, verify
  method, ...` — e.g. `2  2026-09-22 18:50:23  0  1  0 0 0 0 0 0`. Verify
  method `1` = fingerprint. So **the raw protocol does carry a verification
  method per punch** — an abstraction like `node-zklib`'s `getAttendances()`
  can lose that field; don't assume it's unavailable just because a
  particular library doesn't surface it.

### Identity mapping — confirmed, and one correction to make

On the **user** list the field is `userId`. On an **attendance** record the
matching field is `deviceUserId` — a *record's* `userId` field is something
else (an internal serial), not the person. Match attendance to a person on
`deviceUserId`, not `userId`. This is more precise than the original
`attendancesum.js` script's defensive `record.userId ==
user.userId || record.deviceUserId == user.userId` check — only the second
half of that OR ever actually matches.

## Network — Scenario A is real, not just theoretical

Per [architecture §7.2](./attendance-platform.md#72-fingerprint--device-provider):

- **Scenario A confirmed live.** With `Gateway` and `DNS` set (they were
  `0.0.0.0` / unset out of the box) and `Cloud Server Setting → Server
  Address` pointed at an arbitrary public host, the device pushed a real
  punch across the open internet to a server with no relationship to its
  local subnet, landing in ~2 seconds. **No on-prem branch agent is required
  for connectivity.** This is the single biggest planning change from this
  investigation — the architecture doc treated Scenario A vs. B as the open
  question; it's now answered in A's favour for this hardware.
- **TLS works, but only if asked for explicitly.** A bare hostname or IP in
  `Server Address` silently sends plain HTTP — confirmed via
  `cf-visitor: {"scheme":"http"}` on an inbound request to a host that
  offers HTTPS. Prefixing the address with `https://` made the device
  perform a real TLS handshake to a CA-signed certificate (confirmed via the
  same header flipping to `"https"`) — this was **not** tried successfully
  against a self-signed certificate in this round, so certificate validation
  behaviour (does it accept self-signed / does it pin anything) is still
  open. **Practical rule: always write the full `https://` scheme into the
  device's address field. Never assume a bare address gets encrypted.**
- No gateway = no route anywhere outside the local subnet, full stop. A
  branch whose terminal has no gateway configured cannot reach anything,
  local agent or not, until that one field is set.

## Time

Device clock tracked real time closely during the first test window, then
was observed to jump **forward by roughly 8–9 hours** partway through this
same session, with no corresponding real elapsed time. Cause unconfirmed —
possibly a manual change made while navigating menus, possibly something
else. Net: **this device's clock is not provably stable.** Treat every event
as carrying real clock-skew risk; the clock-drift probe job already scoped
for Phase 2b is not optional hardening, it is load-bearing.

## Offline buffer

`getInfo()` reports **`logCapacity: 200000`** records. Overflow behaviour
(FIFO drop vs. refuse-new-punches) and whether buffered events replay with
their original timestamps were **not** tested — would require actually
filling the buffer, which wasn't attempted.

## Direction / punch-state

Not exercised directly (no in/out button state was deliberately tested),
but the `ATTLOG` status-code column is present on every row, contradicting
an assumption that direction data might be entirely absent. Whether staff
reliably use any in/out button in real usage is still an open question that
only a branch visit answers, per architecture §7.2's existing guidance to
derive direction rather than trust the button.

## Security posture — real findings, not hypothetical

- **Comm Key is `0`** (unset). Anyone on the local network can pull the
  full user list, including the plaintext password field, and attendance
  history, with zero credential, via the poll protocol. Cheap to fix, not
  yet fixed.
- **The device volunteers full biometric templates over the push channel,
  unprompted**, as part of a normal sync (`FP PIN=...TMP=<~800-byte
  base64 template>`). This directly contradicts an assumption in
  [architecture §7.2](./attendance-platform.md#72-fingerprint--device-provider)
  that templates "stay on the device" by default — they don't stay put on
  their own, they get pushed unless something on the receiving end
  explicitly discards them. **Any real ingest endpoint must explicitly drop
  `FP`/template rows rather than assume they'll never arrive.**
- **Device-side authentication on the push channel is nonexistent.** A
  serial number in a URL is the only identifying information, sent in
  clear text even over the encrypted transport. The receiving server, not
  the device, has to be the thing deciding what's legitimate — matches what
  architecture §7.2 already assumed under "treat all device input as
  untrusted," now confirmed rather than assumed.
- Over an unencrypted connection (the default, silent, behaviour), all of
  the above — names, plaintext passwords, fingerprint templates, punch
  times — travels in clear text. This was directly observed, not inferred.

## Net effect on the plan

- **Scenario A** (direct device → cloud ingest endpoint, no on-prem agent)
  is viable for this hardware, contrary to the working assumption coming
  out of the original script review that an on-prem laptop/agent would be
  required. Re-confirm across actual branch routers/firewalls before
  treating this as settled for every site — this was one unit on one
  network.
- The `https://` prefix requirement is a real, easy-to-miss footgun for
  whoever configures each branch's terminal — worth a runbook note, not
  just a mention here.
- The ingest endpoint design already scoped for Phase 2b (dedicated
  endpoint, per-device credential, strict schema validation, quarantine
  unmapped IDs) is validated by this test, not just theoretically prudent —
  add "explicitly discard FP template rows" and "explicitly discard OPERLOG
  rows" to that list.
