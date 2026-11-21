# Beacon backend plan

Status: proposal for discussion (Oliver and Peter). No code yet.
Scope: everything behind the commuter app, crew app, stage board and SACCO dashboard that the demo currently mocks.

---

## 1. The short version

- **Keep Supabase as the system of record.** Postgres with PostGIS, Auth, Row Level Security, Edge Functions, Realtime Broadcast and pg_cron cover the pilot and well past it. Moving off it now would cost months and buy nothing yet.
- **Add only three things around it, and only when each is needed:**
  1. A **CDN-cached snapshot API** for live vehicles (from day one). It makes commuter load nearly free.
  2. A **tracker gateway** (Traccar, open source) on one small always-on server, when the first hardware trackers arrive (phase 4).
  3. **Sentry** for errors plus an uptime checker (from day one).
- **One ingest pipeline for every location source.** Crew phones, hardware trackers and vendor feeds all become the same `PositionReport`. Everything downstream (snapping to the route, direction, stage boards, freshness) works the same whatever the source.
- **Sparse pings by design.** Phones report about once a minute, in batches, using low-power location and nothing at all while parked (section 4.2). The server is built to expect gaps, not fight them.
- **Commuters get server-pushed updates per route and per stage.** They never read the positions table directly.
- **Money is a double-entry, idempotent ledger** that mirrors what M-PESA and Jipay confirm. Beacon never holds commuter money itself: Jipay holds wallet funds and the SACCO's PayBill receives fares.
- **The terminus queue is a first-class backend feature, not a front-end trick.** The server keeps a live board for every terminus: what is on its way, how far away, and what is already waiting.

---

## 2. What exists today

| Area | State |
| --- | --- |
| Schema (`supabase/migrations`) | `saccos`, `routes` (path as JSONB), `vehicles`, `driver_assignments`, `sacco_managers`, `compliance_documents`, `profiles`, `user_roles`. No stages, shifts, positions, payments, ads or points. |
| RLS | Enabled, but several policies are too open: any signed-in user can read every profile (names, phones), every driver assignment and every SACCO manager row. Only the global `admin` role can write. There is no SACCO-scoped access. **Fix in phase 0.** |
| Front end | Demo mode simulates everything in the browser: vehicles, crew shift (localStorage), Jipay and PayBill payments, points and the Beacon Tap prize. It talks through clean seams (`VehicleStatus`, `PaymentProvider`), so the backend can slot in behind them. |
| Routes | Road-following geometry baked into `src/data/routes.ts`, built offline from OpenStreetMap data. Needs to move into the database. |

---

## 3. Architecture

```
                  ┌──────────────── location sources ────────────────┐
 Crew phone app ──┤ HTTPS batch  ─┐                                  │
 GPS tracker ─────┤ TCP (GT06,   ─┼─► Traccar gateway ─┐             │
                  │ Teltonika…)   │   (phase 4)        │             │
 Vendor feed ─────┤ webhook/API  ─┘                    ▼             │
                  └──────────────────►  ingest-positions (Edge Function)
                                          │ validate · dedupe · snap to route
                                          │ derive direction, stage, trip
                                          ▼
                     Postgres + PostGIS (Supabase)
                     ├─ vehicle_live (1 row per vehicle, upserted)
                     ├─ positions (partitioned by day, kept 90 days)
                     ├─ stage_board (per stage, recomputed on ingest)
                     ├─ routes, stages, shifts, trips
                     ├─ ledger (payments, wallet mirror, points)
                     └─ ads, impressions, game rounds
                                          │
             ┌────────────────────────────┼─────────────────────────────┐
             ▼                            ▼                             ▼
  Realtime Broadcast           Snapshot API (GET, cached          SACCO dashboard
  route:{id}, stage:{id}       5 s at the CDN)                    (RLS-scoped reads)
             │                            │
             └──────► Commuter app and stage boards (subscribe, fall back to polling)

 M-PESA Daraja C2B ──► payments-mpesa-callback ─┐
 Jipay (mocked)    ──► payments-jipay-callback ─┴─► ledger (idempotent) ─► receipts, SACCO reconciliation
```

---

## 4. Location ingest: one pipeline, any source

### 4.1 The contract

Every source is converted into this shape before anything else touches it:

```ts
interface PositionReport {
  source: 'crew_app' | 'tracker' | 'vendor_feed';
  deviceId: string;          // crew install id, tracker IMEI or vendor unit id
  vehicleId: string;         // resolved from the device binding, never trusted from the client
  shiftId?: string;          // crew app only; trackers get one derived from activity
  points: Array<{
    lat: number; lng: number;
    accuracyM: number;
    speedMps?: number;
    recordedAt: string;      // device clock, ISO 8601 UTC
    provider: 'gps' | 'network' | 'fused';
  }>;
  battery?: { pct: number; charging: boolean; tempC?: number };  // crew app health
}
```

`device_bindings` maps each device to one vehicle, with a validity window. A device can only report for the vehicle it is bound to. This is what stops a stolen token from moving someone else's matatu.

### 4.2 Crew phone ping policy (battery, heat and data)

The expensive parts on a phone are, in order: keeping GPS on, waking the mobile radio to send, and keeping the screen on. The policy cuts all three.

| State | How it's detected | Location mode | Fix every | Upload every |
| --- | --- | --- | --- | --- |
| Moving on route | Activity recognition says "in vehicle" | Balanced power (cell and Wi-Fi, about 100 m) | 20–30 s | ~60 s, one batch |
| Approaching a stage or terminus | Inside a geofence around it | High accuracy (GPS) | 10 s | ~30 s |
| Stationary (queue, jam, lunch) | No motion for 2 min | Off | — | "still here" heartbeat every 2–3 min |
| Off shift | Crew pressed End, or 30 min idle off route | Off | — | Nothing |

Notes:

- **Screen off, foreground service.** Native Android (or React Native with a native location module) is needed for reliable background location. A PWA cannot do this reliably with the screen off, so the PWA crew screen is for the demo and first drive tests only.
- **Accuracy is not needed from the phone.** The server snaps every point onto the known route line, so a 100 m cell fix still places the vehicle on the right road and next to the right stage.
- **Small payloads.** Batches are gzipped JSON at first, later a compact binary format. Target: under 2 MB of data per 12-hour shift.
- **Heat.** No GPS while the phone is charging in a hot cab and stationary. The app sends battery temperature in the health block, and the backend drops a device to the lowest tier above 42 °C.
- **Offline.** The app buffers points on the phone and flushes them when signal returns. The server accepts late points into history, but they never move `vehicle_live` backwards in time.
- Every number above is a named setting held on the server and sent to the app at shift start, so the pilot can tune it without an app release.

**Freshness thresholds change to match.** The demo's "fresh under 60 s" assumes 5–10 s pings. With one-minute batches:

| State | Age | Commuter display |
| --- | --- | --- |
| fresh | under 90 s | Normal marker, glides along the road at recent speed |
| aging | 90 s – 4 min | Dimmed, "updated 2 min ago" |
| stale | 4 – 10 min | Grey, "last seen at Prestige" |
| hidden | over 10 min | Removed from the public view |

Between reports, the commuter app moves the marker along the route line at the vehicle's recent speed and never past the next stage. The age label always shows the real time since the last report, so nothing is hidden.

### 4.3 What `ingest-positions` does, per batch

1. Authenticate: a crew JWT with an active shift, or a gateway service key plus the tracker IMEI.
2. Resolve the vehicle from `device_bindings`. Reject a mismatch.
3. Drop bad points: accuracy over 300 m, timestamps more than 10 min in the future or 24 h in the past, and impossible jumps (over 120 km/h implied).
4. Dedupe on `(vehicle_id, recorded_at)`.
5. Insert into `positions` (history).
6. For the newest good point, **snap to the route** with PostGIS: `progress_m` along the route variant, distance off the line (over 75 m means off route), last stage passed, and direction from the change in progress over the last few points rather than from GPS heading.
7. Detect **trips**: entering a terminus geofence ends the current trip and leaving it starts the next one in the opposite direction. Payments and analytics hang off trips.
8. Upsert `vehicle_live`.
9. Recompute the `stage_board` rows this vehicle affects.
10. Broadcast compact updates to `route:{routeId}` and `stage:{stageId}`.
11. Record source health in `integration_health` (last success, error counts).

Steps 6 to 10 sit in one SQL function, `apply_position(...)`, so the logic is identical for every source and can be tested with pgTAP.

**Projection:** store geometry in WGS 84 (EPSG:4326), and measure distances in UTM zone 37S (EPSG:32737), which is metric and accurate for Nairobi.

### 4.4 Hardware trackers later (phase 4)

Most trackers speak raw TCP protocols (GT06/Concox, Teltonika Codec 8, Queclink) that Edge Functions can't receive. Rather than writing protocol decoders, run **Traccar** (open source, 200+ protocols) on one small VM. It decodes and forwards each position to `ingest-positions` with a gateway key. Vendor platforms that offer a webhook or API (including speed governor and insurance tracker vendors) get a small adapter Edge Function that also produces `PositionReport`. No change downstream.

---

## 5. Real-time fan-out to many commuters

One matatu is followed by many commuters at once, and a terminus board is watched by a whole queue. The design keeps the cost of a viewer close to zero.

- **Never Postgres Changes for public data.** That feature checks RLS for every subscriber on every row change, which doesn't scale and risks leaking columns. Use **Realtime Broadcast** instead: the server publishes small, already-public messages.
- **Channels:** `route:{routeId}` carries vehicle updates (plate, direction, `progress_m`, lat/lng, speed, last stage, `reported_at`). `stage:{stageId}` carries board updates (approaching list and waiting count). Public channels are read-only for clients; only the server can publish.
- **Snapshots first, then the stream.** On open, the app fetches `GET /live/routes/{id}` or `GET /live/stages/{id}`, then subscribes. The snapshot endpoints are cached at the CDN for 5 s, so ten thousand people opening the Kencom board cause one database read every 5 s.
- **Fallback:** if the socket drops (common on Nairobi mobile data), the app polls the cached snapshot every 15 s until it reconnects. Commuters who just glance at the app never open a socket at all.
- **Message size:** one vehicle update is about 120 bytes. With one-minute batches, a route with 40 vehicles produces under one message per second.

### 5.1 The terminus queue board (the main pain point)

`stage_board` holds one row per stage and direction. It is recomputed on each ingest for the stages a vehicle affects, and every 30 s by pg_cron so ages stay honest:

- **On the way:** vehicles heading to this stage, nearest first, with distance along the road and freshness.
- **Waiting here:** vehicles stationary inside the terminus geofence, in arrival order. This is what tells someone at the back of the queue whether to wait.
- **Coverage:** reporting vehicles ÷ vehicles on shift, so the board can say "6 of 9 matatus on this route are reporting".
- **Later, arrival estimates:** once there are a few weeks of history, median travel time between stages by hour of day and day of week (a nightly pg_cron job over `positions`). Until then the board shows distance only, never a promised time.

---

## 6. Routes and stages (OSM/OSRM geometry)

```sql
stages               -- shared across SACCOs: Kencom serves many routes
  id, name, aliases text[],          -- Swahili and local names for search
  location geography(Point),
  kind ('stage' | 'terminus' | 'depot'),
  geofence geography(Polygon)        -- terminus queue area, depot privacy zone

routes
  id, sacco_id, number, name, color,
  status ('draft' | 'approved' | 'live' | 'paused'),
  fare_rules jsonb                    -- peak/off-peak, per stage pair later

route_variants       -- one per direction, versioned
  id, route_id, direction ('outbound' | 'inbound'), version int,
  geometry geography(LineString), length_m,
  built_from ('osm_osrm' | 'manual' | 'recorded_trace'), osm_snapshot_date,
  approved_by, approved_at

route_variant_stages
  route_variant_id, stage_id, seq, progress_m   -- precomputed position along the line
```

- **Geometry is built offline**, never at request time: a script runs OSRM (self-hosted with the Kenya OpenStreetMap extract) through the route's stages, simplifies the line to about 3 m and saves it as a new variant version. The existing `scripts/route-paths` becomes this tool.
- **Recorded traces can correct it.** After a week of live data, compare real vehicle traces with the OSRM line and flag stretches where matatus actually use a different road.
- **Approval:** a SACCO manager approves a variant before it goes live, matching the product rule that routes are SACCO-defined.
- **Versioning:** positions and trips store the `route_variant_id` they were snapped to, so editing a route never corrupts history.
- **Shifts and assignments:** `shifts` (vehicle, crew, route, start/end) and `trips` (one terminus-to-terminus leg, auto-detected).

---

## 7. Payments: an idempotent ledger with per-vehicle attribution

### 7.1 Money flows

| Flow | How it works | Source of truth |
| --- | --- | --- |
| **Fare to the SACCO PayBill** | Commuter pays the SACCO's M-PESA PayBill. Account number = the vehicle's plate or code. Daraja C2B confirmation reaches Beacon. | M-PESA |
| **Jipay wallet top-up** | Commuter tops up through Jipay's own PayBill, entering their Jipay account number. Jipay notifies Beacon. | Jipay |
| **Fare from the Jipay wallet** | Commuter picks a vehicle and confirms. Beacon asks Jipay to debit; Jipay pays the SACCO and confirms. | Jipay |
| **Fare paid with points or a prize** | Beacon funds the fare from the advertiser or sponsor pool and settles to the SACCO (section 8.3). | Beacon ledger |

Beacon **mirrors** the money it is told about. It does not hold commuter money. Holding stored value would need Central Bank of Kenya authorisation, so the wallet stays with Jipay, which is expected to hold that licence (confirm with Jipay).

### 7.2 Ledger design

```sql
ledger_accounts   id, kind, owner_type, owner_id, currency ('KES' | 'PTS')
                  -- e.g. commuter_wallet_mirror, sacco_fares_receivable,
                  --      vehicle_fares, ad_pool, sponsor_pool, points_liability

provider_events   id, provider ('mpesa_c2b' | 'jipay' | ...), provider_txn_id,
                  raw jsonb, received_at, signature_ok bool, processed_at
                  UNIQUE (provider, provider_txn_id)        -- idempotency

journal_entries   id, kind ('fare' | 'topup' | 'points_award' | 'redemption' | 'reversal'),
                  provider_event_id, vehicle_id, shift_id, trip_id, route_id,
                  occurred_at, created_at

postings          entry_id, account_id, amount_minor bigint   -- amounts in cents
                  -- every entry's postings sum to zero (constraint trigger)
```

Rules:

- **Store first, process second.** Callbacks are written to `provider_events` as they arrive, then processed. A duplicate callback hits the unique key and is acknowledged without a second posting.
- **Every client request carries an idempotency key** (`payment_intents.idempotency_key UNIQUE`), so a double tap or a retry on a bad connection never charges twice.
- **Append-only.** Mistakes are fixed with a reversal entry, never an update or delete.
- **Attribution:** the account reference resolves to a vehicle, and `occurred_at` resolves to the active shift and trip on that vehicle. A payment that matches no vehicle goes to an **unmatched queue** in the SACCO dashboard for a human to resolve, never silently dropped.
- **Daily reconciliation** (pg_cron): compare the ledger with the Daraja transaction status / statement and with Jipay's settlement report. Mismatches go to the SACCO and to Beacon support.
- **Receipts** are generated from journal entries, so a receipt always matches the books.

### 7.3 Integration notes

- **Daraja C2B needs the SACCO's shortcode credentials.** Each SACCO either authorises a Beacon Daraja app on its PayBill or uses an aggregator that forwards confirmations. This is a per-SACCO onboarding step and a commercial conversation.
- **Callbacks are verified:** IP allow-list for Safaricom, signature or shared secret for Jipay, and a status query back to the provider before a fare is marked confirmed.
- **Jipay stays a mock adapter** behind `PaymentProvider` until Jipay provides API documentation, sandbox credentials, the callback format, refund and reversal flow, and settlement reports. The mock produces the same `provider_events` shape, so switching to the real adapter is one file.
- No PINs or payment credentials ever touch Beacon. Commuters see only the official M-PESA or Jipay prompt.

---

## 8. Ads and points rewards

### 8.1 Ads only to commuters who are waiting

- The server decides when a commuter counts as waiting: following a vehicle, or watching a stage board, with no significant movement. The client asks `GET /ads/next` and the server answers with nothing unless that is true.
- **Never to crew.** The crew app has no ad code at all, and the ad endpoints reject any token with a crew role. Both are enforced, not just one.
- Tables: `advertisers`, `ad_campaigns` (budget, targeting by stage, route and time of day, daily caps), `ad_creatives`, `ad_impressions`.

### 8.2 Verified views earn points

1. `GET /ads/next` returns a creative and a **signed impression token** (campaign, user, issued_at).
2. The client plays the clip and posts `/ads/complete` with the token.
3. The server checks the signature, that at least the clip length has passed since issue, the per-user daily cap (20 ads a day in the demo) and the per-device cap, then posts points to the commuter's points account and debits the campaign budget in the same journal entry.
4. Fraud controls: one account per verified phone number, Play Integrity attestation later, and anomaly flags (many accounts on one device, views at impossible rates).

### 8.3 Spending points and prizes

- Points live in the same ledger (`currency = 'PTS'`). Awarding and spending are journal entries like any other.
- **Redeeming points for a fare** creates a fare entry funded from `ad_pool` (and a Beacon Tap prize from `sponsor_pool`). The SACCO gets the full fare.
- **Settlement to SACCOs:** a **daily batch** payout (one B2B transfer per SACCO with a statement) is simpler and cheaper than paying each redemption in real time. It needs Beacon to hold the advertiser prepayment in a business account, which is ordinary B2B money, not commuter stored value. Confirm with the accountant.
- **Beacon Tap:** rounds are created on the server, scores are submitted with the round id, and the server rejects impossible rates and scores sent after the round closes. The winner gets a single-use prize voucher valid the same day.

The demo's numbers (10 points per 15 s ad, 1 point = KSh 1, 20 ads a day, 5-minute rounds) become server settings, because Oliver hasn't confirmed them yet.

---

## 9. Multi-tenant security (Supabase RLS)

### 9.1 Who can see what

| Data | Commuter (anonymous or signed in) | Crew | SACCO manager | Beacon admin |
| --- | --- | --- | --- | --- |
| Live routes, stages, public vehicle positions | Yes (via broadcast and snapshots only) | Own route | Own SACCO | All |
| Position history | No | No | Own SACCO | All (support) |
| Shifts, trips, crew identities | No | Own | Own SACCO | All |
| Payments | Own receipts | Fares on own vehicle today (if needed) | Own SACCO | Aggregates; transaction detail only through support access |
| Points, ads | Own balance | Never | No | Campaign stats |

### 9.2 How

- **Roles and SACCO membership go into the JWT** using Supabase's custom access token hook: `app_role`, `sacco_ids[]`, `vehicle_id` for an active crew shift. RLS policies read claims instead of joining tables on every row.
- **Helper functions:** `is_sacco_member(sacco_id)`, `is_admin()`, `current_vehicle()`. Every SACCO-owned table carries `sacco_id` and one policy: `using (is_sacco_member(sacco_id))`.
- **Writes that matter go through Edge Functions** (ingest, payments, points), never straight from the client into tables. The functions validate, then write with a restricted database role.
- **The public surface is views, not tables.** `public_vehicle_live` and `public_stage_board` expose only commuter-safe columns (no crew, no device, no history).
- **Phone OTP sign-in** for crew and commuters (Kenyan users rarely use email). Needs an SMS provider (for example Africa's Talking). That is a setup step for when Oliver says go.
- **Fix the current policies** in phase 0: remove "anyone can view profiles", "authenticated can view assignments" and "authenticated can view sacco_managers", and replace with scoped policies.
- **Tests:** pgTAP tests in CI that sign in as each role and assert what it can and cannot read. An RLS regression should fail the build.
- **Privacy:** positions inside depot geofences are never published. Commuter location is never stored; the "waiting" check runs on the device or in-memory. History is kept 90 days, then aggregated. Data Protection Act 2019 and ODPC registration to be confirmed with a Kenyan lawyer before crew onboarding.

---

## 10. Scaling

| | Pilot (1 route) | Nairobi-scale (illustrative) |
| --- | --- | --- |
| Vehicles reporting | ~30 | ~10,000 |
| Ingest requests | ~0.5 per second | ~170 per second |
| Position rows | ~100k per day | ~30M per day |
| Concurrent commuters | hundreds | 100k+ |

What carries it:

- **Ingest:** Edge Functions scale horizontally. `vehicle_live` is tiny (one row per vehicle), so the hot path is one upsert plus one batched insert.
- **History:** `positions` is partitioned by day (native Postgres partitioning managed by pg_partman). pg_cron drops partitions after 90 days, after rolling them up into per-trip and per-segment summaries. Beyond that, older history can move to object storage as Parquet.
- **Commuter reads:** the CDN-cached snapshot plus Broadcast means commuter count barely touches Postgres.
- **When to add more:** if Broadcast connection or message limits on the Supabase plan become the bottleneck, put a dedicated fan-out server (for example Centrifugo) in front of the same channels. The app's channel names don't change.
- **Indexes to plan for:** GiST on geometries and geofences, `(vehicle_id, recorded_at)` on positions, `(route_id)` on `vehicle_live`, unique `(provider, provider_txn_id)` on provider events.

---

## 11. Observability and operations

- **Errors:** Sentry in the commuter app, crew app and Edge Functions.
- **Health, as data:** `integration_health` and a `system_health` view, refreshed by pg_cron: ingest lag (p50/p95 of server time minus device time), coverage per route, vehicles on shift but silent for 10+ minutes, payment callback failures, unmatched payments, ledger imbalance (should always be zero).
- **Ops screen:** an admin page that reads `system_health`, so Oliver can see "Route 46: 7 of 9 reporting, ingest lag 40 s, 2 unmatched payments" at a glance.
- **Alerts:** uptime checks on the ingest and snapshot endpoints, plus alerts on silent routes, failed callbacks and ledger imbalance. The channel (email, SMS, WhatsApp) is to be chosen; no connectors are set up until Oliver says go.
- **Environments:** three Supabase projects (dev, staging, prod). Migrations live in git and are applied by CI. `supabase db reset` plus seed data runs the whole stack locally. A position simulator replays recorded traces for testing.
- **Backups:** daily backups with point-in-time recovery on prod (Pro plan) before real money flows.

---

## 12. Phased plan

Durations are rough estimates for one or two developers.

| Phase | What | Done when |
| --- | --- | --- |
| **0. Foundations** (1 week) | Three environments, CI with migrations and pgTAP, RLS fixes, JWT claims hook, phone OTP sign-in, Sentry. | A SACCO manager can sign in and sees only their SACCO. RLS tests pass in CI. |
| **1. Routes and stages in the database** (1–2 weeks) | Stages, route variants, PostGIS, the OSRM build script writing to the database, public route API. The app reads routes from the backend. | The pilot route renders from the database with correct stages in both directions. |
| **2. Live tracking pilot** (3–4 weeks) | Native Android crew app with the ping policy, `ingest-positions`, `apply_position`, `vehicle_live`, trips, Broadcast channels, cached snapshots, server-side terminus board, ops health screen. | Drive test: direction right on both legs, median report age under 90 s, crew battery use within the agreed limit on three budget phones, the terminus board matches what is physically in the queue. |
| **3. Payments** (3 weeks) | Ledger, Daraja C2B on the pilot SACCO's PayBill (sandbox, then live), Jipay mock adapter, receipts, unmatched queue, daily reconciliation. | 100 test payments reconcile to the shilling, with duplicates and retries injected. |
| **4. Rewards and trackers** (3 weeks) | Ad campaigns, verified impressions, points, Beacon Tap rounds, daily SACCO settlement. Traccar gateway and the first tracker or vendor feed. | Points earned, redeemed and settled end to end. One vehicle reports from a tracker with no phone. |
| **5. Scale and arrival estimates** (ongoing) | Partitioning and retention live, per-segment travel-time model for arrival estimates, a second and third route, load test at 10× pilot. | Arrival estimates within agreed error on the pilot route; load test passes. |

Jipay goes live inside phase 3 or 4, whenever its API and contract exist. Nothing else waits for it.

---

## 13. Decisions needed

| Decision | Who | Needed by |
| --- | --- | --- |
| Pilot SACCO and route; will it authorise Daraja access on its PayBill? | Oliver | Phase 2 |
| Native Android (Kotlin) or React Native for the crew app | Peter | Phase 2 |
| Crew phones: SACCO-provided or crew's own; who pays the data | Oliver + SACCO | Phase 2 |
| Do pilot vehicles already have trackers or speed governors with a data feed? | Oliver + SACCO | Phase 4 |
| SMS provider for OTP | Oliver | Phase 0 |
| Jipay API, sandbox, settlement and licence details | Jipay | Phase 3/4 |
| Points rate, daily cap, prize rules (demo values unconfirmed) | Oliver | Phase 4 |
| Settlement of points and prize fares: daily batch (recommended) or per fare | Oliver + accountant | Phase 4 |
| Data protection review and ODPC registration | Oliver + lawyer | Before crew onboarding |
