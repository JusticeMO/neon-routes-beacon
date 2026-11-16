# BEACON Build Specification

*Version 0.1 · Working document for the product, tech and AI engineering teams*

## 1. Purpose and how to use this document

This is the single source of truth for building the BEACON pilot. Sections 2–5 explain what we are building and why. Sections 6–12 specify how. Sections 13–17 cover delivery, testing, open decisions and rules for AI engineers.

If anything here conflicts with the existing codebase, stop and raise one concise question rather than guessing.

## 2. Product thesis

BEACON lets commuters see and follow shared matatus on SACCO-defined routes, with clear direction and data freshness. It gives SACCOs the operational visibility behind that service, and adds optional digital fare payment through existing providers once vehicle-level attribution is proven.

**BEACON is shared-vehicle tracking, not Uber/Bolt-style private ride matching.** One vehicle is visible to many commuters. Following a vehicle never reserves a seat, and the UI must never imply it does.

The core question the commuter screen answers: **Is a participating vehicle recently reported on my route, heading my way, near my selected stage?**

## 3. Scope


| Tier                               | Features                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core (promise it)**              | SACCO-defined routes and stages, direction-aware vehicle markers, last-update time, follow a vehicle, coverage indicator, offline and not-reporting states, stage and route deep links, sample-vs-live labelling |
| **Conditional (only when proven)** | Boarding or capacity status, vehicle-level payment attribution                                                                                                                                                   |
| **Later**                          | Reservations, per-stage ETAs, fare rules, SMS or USSD fallback, hardware tracker ingest                                                                                                                          |
| **Out of scope for the pilot**     | Commuter login, real payments, seat reservations, minute-based ETAs, commuter GPS                                                                                                                                |


## 4. Users and what each sees

**Commuter:** routes and stages they recognise; vehicles reporting on their route; direction and destination; last-update time; coverage line; follow-vehicle; optional feedback. No account, no install, no location permission.

**Crew:** their assigned vehicle and route; a Start/End shift control; clear indicator that location is being shared and syncing. Nothing else is required mid-shift.

**SACCO admin:** routes, stages, vehicles, crews and assignments; which vehicles are on shift and reporting; exceptions such as a vehicle assigned but not reporting.

**BEACON operations:** data freshness, failed uploads, integration health and support diagnostics. No access to payment credentials or unnecessary personal data.

## 5. Design principles (built for Nairobi)

1. **Answer first, map second.** A plain-language status card comes before the map and must work without it.
2. **Honesty over polish.** Show last seen and freshness age. Never show guaranteed arrival times.
3. **Show the coverage gap.** For example, 3 of 8 vehicles on this route are reporting, so a quiet map is not read as nothing coming.
4. **Stage-centred.** Commuters think in stage names, destinations and route numbers, not coordinates.
5. **Share-first.** Every stage and route has a link and QR code that works in WhatsApp.
6. **Data-light.** Budget Android phones and costly data bundles are the baseline.
7. **Never threaten crew income.** Cash keeps working and tracking must give crews something back.
8. **Fail gracefully.** Offline, stale, empty-route and service-disruption states are designed, not afterthoughts.
9. **Tracking never requires login or payment.**
10. **Swahili and English** copy, reviewed by native speakers.

## 6. Architecture and tech stack


| Layer                 | Choice                                                                                   | Notes                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Commuter app          | PWA, React + TypeScript (extend the existing BEACON React app)                           | No install, lazy-loaded map, status card renders first                                                                                       |
| SACCO dashboard       | Same React codebase                                                                      | Shared components, role-gated routes                                                                                                         |
| Crew app              | Native Android (Kotlin), kept very small                                                 | Reliable background location via a foreground service; handle OEM battery optimisation. Fallback: React Native with a native location module |
| Maps                  | MapLibre GL with vector tiles                                                            | Search stages from our own data first; add Google Places later only if needed                                                                |
| API                   | TypeScript (Fastify or NestJS)                                                           | Split ingest into Go only if load demands it                                                                                                 |
| Database              | PostgreSQL + PostGIS                                                                     | Routes, stages, trips; spatial queries; partitioned position history                                                                         |
| Live state            | Redis                                                                                    | Latest position per vehicle plus pub/sub                                                                                                     |
| Realtime              | Server-Sent Events or WebSocket, one channel per route                                   | Commuters only receive the route they view                                                                                                   |
| Ingest                | HTTPS batch POST from the crew app every 5–10 s, buffered offline                        | MQTT later for hardware trackers                                                                                                             |
| Notifications and SMS | Firebase Cloud Messaging, Africa’s Talking                                               | Also the path to USSD later                                                                                                                  |
| Payments (later)      | Daraja (M-PESA) behind a `PaymentProvider` interface; SasaPay and Jipay as adapters      | Integrate existing rails; do not build a wallet                                                                                              |
| Auth                  | Crew: phone OTP. SACCO admins: email + password with roles. Commuters: none in the pilot | Commuter auth added later as an optional layer                                                                                               |
| Hosting               | AWS af-south-1 or a Nairobi-hosted provider; Docker, Terraform, GitHub Actions           | Managed Postgres and Redis                                                                                                                   |
| Monitoring            | Sentry, Grafana/Prometheus, uptime checks                                                | Data freshness and ingest health visible from day one                                                                                        |


**Data flow:** crew app sends position batches → ingest API validates and snaps to route → Postgres stores history, Redis stores latest state → commuter PWA reads route status and subscribes to the route channel → SACCO dashboard reads the same state plus history.

## 7. Data model


| Entity                          | Key fields                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sacco                           | id, name, contact, status                                                                            |
| Route                           | id, saccoId, number, name, direction labels, geometry (LineString), status (draft, live, paused)     |
| Stage                           | id, routeId, name, order, location, aliases (including Swahili and local names)                      |
| Vehicle                         | id, plate, saccoId, assignedRouteId, nickname or livery note, status                                 |
| CrewMember                      | id, name, phone, saccoId, role                                                                       |
| Shift                           | id, vehicleId, crewId, routeId, direction, startedAt, endedAt                                        |
| Position                        | vehicleId, shiftId, lat, lng, accuracyM, speed, deviceTimestamp, serverTimestamp, progressAlongRoute |
| VehicleStatus (derived, cached) | vehicleId, routeId, direction, lastStageId, lastReportAt, distanceToStageM, state, source, onShift   |
| Feedback                        | id, stageId or vehicleId, arrived (yes/no), helpful (yes/no), createdAt, prototype flag              |
| Payment (phase 5)               | id, provider, providerReference, vehicleId, shiftId, amount, status                                  |
| IntegrationHealth               | source, lastSuccessAt, errorCount                                                                    |


Commuter records stay anonymous. No commuter identifiers are stored in the pilot.

## 8. Core logic

### 8.1 Position ingest

The crew app sends batches containing vehicle id, shift id and an ordered list of points (lat, lng, accuracy, speed, device timestamp). The server adds a server timestamp, rejects impossible jumps and low-accuracy points beyond a threshold, and ignores duplicates. Sending interval is 5–10 s while moving and slower (for example 30 s) when stationary. The app buffers while offline and flushes when connectivity returns.

### 8.2 Snapping, direction and distance

Snap each point to the route line with PostGIS (`ST_LineLocatePoint`) to get progress along the route. Direction is derived from the change in progress over recent points, not from GPS heading. Last observed stage is the nearest stage behind the vehicle’s progress. Distance to a selected stage is the difference in progress, converted to metres, and is shown as approximate distance only, never as an arrival time. If a point is too far from the route, mark the vehicle as off-route and do not place it on a wrong road.

### 8.3 Freshness states

Thresholds are named constants so the pilot can tune them. Starting values:


| State   | Age of last report             | Display                           |
| ------- | ------------------------------ | --------------------------------- |
| fresh   | under 60 s                     | Normal marker                     |
| aging   | 60 s to 3 min                  | Dimmed marker with age shown      |
| stale   | 3 to 10 min                    | Greyed marker, labelled last seen |
| hidden  | over 10 min                    | Removed from the public view      |
| offline | no reports and shift not ended | Shown only in the SACCO view      |


Ages recompute on a client timer without refetching.

### 8.4 Coverage

Coverage = vehicles reporting (fresh or aging) ÷ vehicles on shift on the route. Show it as a plain line. A route opens to commuters only when coverage passes a configurable threshold (start at 60–70% of active vehicles at peak).

### 8.5 Visibility and privacy rules

- Only vehicles with an active shift (`onShift = true`) are public.
- Positions inside a depot geofence are hidden or delayed.
- Public responses never include crew names, phone numbers or history.
- Rules live in the data layer, so they apply to sample data as well.

### 8.6 Vehicle status shape (single contract between data and UI)


| Field              | Meaning                                     |
| ------------------ | ------------------------------------------- |
| vehicleId, routeId | Identity                                    |
| plate, saccoName   | What commuters recognise                    |
| direction          | outbound or inbound, plus destination label |
| lastStageId        | Last observed stage                         |
| lastReportAt       | Timestamp of last report                    |
| distanceToStageM   | Approximate, relative to the selected stage |
| state              | fresh, aging, stale or offline              |
| source             | sample or live                              |
| onShift            | Boolean                                     |


The UI reads only this shape. Swapping sample data for live data must be a data-layer change with no UI rework.

## 9. API outline


| Endpoint                                       | Purpose                                                                        | Auth                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | -------------------- |
| `POST /v1/positions`                           | Crew batch upload                                                              | Crew token           |
| `POST /v1/shifts/start`, `POST /v1/shifts/end` | Shift control                                                                  | Crew token           |
| `GET /v1/routes`, `GET /v1/routes/:id`         | Route, stages, geometry                                                        | Public               |
| `GET /v1/stages/:id/status`                    | Status card data for a stage                                                   | Public               |
| `GET /v1/routes/:id/vehicles`                  | Visible vehicles with VehicleStatus                                            | Public               |
| `GET /v1/routes/:id/stream`                    | SSE stream of updates for a route                                              | Public               |
| `POST /v1/feedback`                            | Anonymous commuter feedback                                                    | Public, rate-limited |
| `/v1/admin/*`                                  | CRUD for vehicles, crews, routes, stages, assignments; coverage and exceptions | SACCO admin          |
| `POST /v1/payments/*` (phase 5)                | Initiate and confirm payments                                                  | Provider-dependent   |


Public endpoints are rate-limited and cacheable where possible. All timestamps are UTC ISO 8601.

## 10. Application specifications

### 10.1 Commuter PWA (extends the existing BEACON React home screen)

**Entry and navigation**

- Choose a destination, route or nearby stage with search on stage names and aliases.
- Deep links `?stage=<id>` and `?route=<id>` work without sign-in. Unknown IDs fall back to the selector with a friendly message.

**Status card (above the map)**

- Plain language, for example: 2 vehicles reporting on Route 23 toward Town. Nearest last seen at Kawangware, updated 40 seconds ago.
- Shows coverage, freshness, route and destination, direction and last observed stage.

**Vehicles and following**

- Direction-aware markers and a direction filter.
- Tapping a vehicle opens a card with plate, SACCO, route, destination, direction, last observed stage, last-update age and approximate distance to the selected stage.
- Follow this vehicle keeps its progress visible. The card states that following does not reserve a seat.

**States**

- Fresh, aging, stale, offline, no vehicles reporting, route not yet live, service alert (SACCO or BEACON can post a banner such as No vehicles operating on this route today).

**Sample vs live**

- Persistent Sample information banner whenever `source = sample`. It disappears only for live data.

**Map**

- Interactive, lazy-loaded, supports bright, dark and live themes, capped marker counts, and a data-saver option.

**Feedback**

- Two optional questions: Did a vehicle arrive? Did this information help? Anonymous and clearly labelled prototype-only.

**Sharing and language**

- Share this stage via WhatsApp (link preview) and QR. English and Swahili toggle.

**Payment placeholder**

- Either omitted or a non-functional Pay your fare (coming soon) entry that states tracking never requires payment and cash still works.

**Accessibility and performance**

- Semantic status text, screen-reader labels, sufficient contrast in all themes, keyboard-operable controls, and tested on a throttled low-end mobile profile.

**Authentication design rule**

- No login in the pilot. Keep session and user handling in a separate optional layer so phone-number OTP can be added at the payment and receipts step later without refactoring tracking screens.

### 10.2 Crew app (Android)

- Phone OTP login, then a single assigned vehicle and route.
- One large Start/End shift control and a clear status line: sharing, syncing, last successful upload.
- Foreground service for location with a persistent notification; guided setup for battery-optimisation exclusions on common Tecno, Infinix and Samsung devices.
- Offline buffer with automatic flush; adaptive intervals to save battery and data.
- Plain-language consent screen in English and Swahili stating what is shared, when and with whom.
- Optional single toggle for capacity status in a later phase, auto-expiring after a few minutes. Not in the first release.

### 10.3 SACCO dashboard

- Manage vehicles, crews, routes, stages (including aliases) and assignments.
- Live view: which vehicles are on shift, reporting, stale or offline; route coverage; exceptions such as an assigned vehicle not reporting.
- Service alert posting for the commuter view.
- Role-based access and an audit trail for changes.
- Existing SACCO onboarding and admin access must keep working unchanged.

## 11. Payments (phase 5, optional layer)

- Build a `PaymentProvider` interface with adapters for Daraja (M-PESA STK push or till), SasaPay and Jipay. Tracking never depends on it.
- **Gating questions for each provider:** supported flow, settlement, refunds and reversals, transaction identifiers, vehicle-level attribution, API availability, and who handles compliance and support.
- **Attribution options:** per-vehicle till, QR on the vehicle, or a reference code on an STK push.
- Commuters see only the official provider prompt. BEACON never asks for a PIN or stores payment credentials.
- Receipts to the commuter; reconciliation view and transaction records for the SACCO.
- Cash and existing methods remain fully supported.

## 12. Security, privacy and compliance

- Treat location data as personal data. Design for the Data Protection Act, 2019: lawful basis, informed crew consent, minimal collection, retention limits, ODPC registration where required. Confirm with a Kenyan lawyer.
- Encrypt in transit and at rest; store secrets in a managed vault; least-privilege roles; audit logs for admin actions.
- Rate-limit and validate all public endpoints; protect feedback from abuse.
- Check NTSA and county requirements for PSV technology before launch.
- No payment credentials stored by BEACON.

## 13. Delivery plan


| Phase                               | Approx. weeks            | Deliverable                                                                                                                                                   |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Commuter front-end update**    | 2–3                      | Updated BEACON home screen on the VehicleStatus contract with sample data, all states, deep links, feedback and Swahili/English. Existing SACCO access intact |
| **0. Discovery and field research** | 1–2 (parallel with A)    | Pilot SACCO and route chosen; route geometry, stages and vehicle list collected; crew phones and data arrangements; payment provider conversations started    |
| **1. Tracking foundation**          | 4–6                      | Crew app, ingest API, Redis latest state, Postgres history, basic SACCO admin                                                                                 |
| **2. Live commuter map**            | 3–4                      | Replace sample source with live data, SSE stream, coverage and visibility rules                                                                               |
| **3. Field testing**                | 2–3                      | Drive test on the route; measure location age, drop-outs, battery, direction accuracy                                                                         |
| **4. Public pilot**                 | 6–8                      | Open commuter view once coverage passes the threshold; SACCO alerts and exceptions                                                                            |
| **5. Payments**                     | 4–6 (can overlap with 4) | Provider integration, attribution, receipts, reconciliation                                                                                                   |
| **6. Scale**                        | Ongoing                  | More routes, ETAs, optional capacity toggle, SMS/USSD, hardware trackers                                                                                      |


Total to a public pilot is roughly four to five months for a small team. Payments may slip without blocking the pilot.

## 14. Testing and acceptance

**Front-end acceptance (Phase A)**

- Public flow works with no sign-in, install or location prompt.
- `?stage=` and `?route=` links resolve; bad IDs fall back gracefully.
- Map renders in bright, dark and live themes; the status card works with the map hidden.
- Direction filter, vehicle card and follow-vehicle behave correctly.
- Fresh, aging, stale, offline, no-vehicles and service-alert states each render as specified.
- Sample banner is always visible on sample data.
- Off-shift vehicles never appear and the depot rule is applied.
- Feedback submits and is labelled prototype-only.
- SACCO onboarding and admin access still work.
- No console errors; passes a throttled low-end mobile profile.

**Backend and crew app**

- Unit tests: freshness logic, snapping and direction, coverage calculation, visibility rules, deep-link parsing.
- Integration tests: ingest with duplicates, out-of-order and offline-buffered batches; SSE fan-out; admin permissions.
- Field tests: background location survives a full shift on at least three budget phone models; direction correct on both legs; battery and data within agreed limits.
- Load test: expected pilot volume with headroom.

## 15. Pilot metrics

- **Coverage:** percentage of active vehicles reporting at peak and in rain.
- **Freshness:** median location age and share of time under the fresh threshold.
- **Crew retention:** percentage sharing for a full shift, and at weeks 2 and 4.
- **Commuter outcomes:** Did a vehicle arrive? rate, Did this help? rate, share of sessions from stage links or QR.
- **Data cost:** MB per commuter session and per crew shift.
- **Trust signals:** crew complaints, opt-outs and support issues.
- **Payments (if live):** percentage of transactions correctly attributed to a vehicle.

Set numeric targets for each before the pilot opens.

## 16. Open decisions


| Decision                                             | Owner             | Needed by                 |
| ---------------------------------------------------- | ----------------- | ------------------------- |
| Pilot SACCO and route                                | Product           | End of discovery          |
| Freshness thresholds and coverage threshold          | Product + SACCO   | Before Phase 4            |
| Crew phones and data bundle arrangement              | Product + SACCO   | Before Phase 1 field work |
| Payment attribution model and provider               | Product + Finance | Before Phase 5            |
| Map tile provider and budget                         | Tech              | Before Phase 2            |
| Swahili copy review                                  | Product           | Before Phase 4            |
| Legal review of data protection and consent          | Product + Legal   | Before crew onboarding    |
| Naming and branding of stage stickers and QR posters | Product           | Before Phase 4            |


## 17. Instructions for AI engineers

1. Before coding, inspect the existing home screen, route and map components, route and stop data, theming and SACCO admin routes. Post a short summary of what exists and which files you will change.
2. Make focused changes. Do not rewrite the app or introduce a new backend schema in Phase A.
3. Never present sample data as live. Never show guaranteed arrival times or minute-based ETAs.
4. Do not request commuter GPS, and do not require sign-in for tracking.
5. Preserve SACCO onboarding and admin access and the bright, dark and live themes.
6. Code against the VehicleStatus contract in section 8.6. Keep freshness thresholds as named constants.
7. Write unit tests for freshness, coverage, direction, visibility rules and deep-link parsing.
8. Provide a test report against section 14 noting anything not verified, and a list of deliberate out-of-scope follow-ups.
9. If a requirement conflicts with the existing code, stop and ask one concise question.
10. Do not build payments, reservations, per-stage ETAs or crew capacity toggles in the pilot phases.

## 18. Key risks


| Risk                                          | Mitigation                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| Crews switch tracking off                     | SACCO-led onboarding, tangible benefits, plain consent, no threat to income     |
| Low coverage makes the map look empty         | Coverage threshold before opening; honest coverage line                         |
| Background location killed on budget phones   | Native foreground service, guided battery setup, field testing on common models |
| Commuters distrust payments                   | Official provider prompts only, receipts, cash always available                 |
| Disruptions look like app failure             | Service-alert banners and last-known status                                     |
| Payment attribution does not work as promised | Resolve with each provider before committing; keep payments optional            |
| Data cost deters use                          | PWA, data-saver mode, later SMS/USSD                                            |
