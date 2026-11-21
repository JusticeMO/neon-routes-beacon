# Beacon: current architecture and roadmap

## What exists today

| Area | Files | State |
| --- | --- | --- |
| Commuter home (map, search, route sheet, tabs) | `src/pages/Index.tsx`, `src/components/{GoogleMapView,SearchBar,RouteBottomSheet,RouteCard,BottomNav}.tsx` | Works, **sample data only**. Map is Leaflet with CARTO tiles despite the file name. Vehicle positions are simulated in the component. ETAs, fares, seat states and alerts are hard-coded. Profile tab is a placeholder ("John Doe"). |
| Route data | `src/data/routes.ts` | 4 hand-drawn Nairobi routes with stops, in code. Not read from the database. |
| Auth | `src/contexts/AuthContext.tsx`, `src/pages/Auth.tsx` | Email + password via Supabase Auth; roles from `user_roles`. |
| Admin | `src/pages/AdminDashboard.tsx`, `src/components/admin/*` | CRUD for SACCOs, vehicles, users/roles, compliance documents. Admin role only; no SACCO-manager scoping yet. |
| Database | `supabase/migrations/*.sql` | `saccos`, `routes` (path as JSONB), `vehicles`, `driver_assignments`, `sacco_managers`, `compliance_documents`, `profiles`, `user_roles`, with RLS. No stages, shifts, positions, payments. Public (anonymous) read is not allowed yet. |
| Theming | `src/contexts/ThemeContext.tsx`, `src/index.css` | Bright, dark and live themes. |

## What was removed to make it independent (this PR)

The app was generated on Lovable and pointed at a Lovable Cloud database.

- `.env` with the Lovable Cloud project URL and key (removed from git; `.env.example` added, `.env` ignored).
- `previewAuthStorage.ts`, which brokered login sessions to the Lovable editor; replaced with plain `localStorage`.
- `lovable-tagger` dev dependency and its Vite plugin.
- Lovable README, Open Graph images and Twitter handle.
- `.lovable/` folder (the build spec moved to `docs/build-specification.md`).
- Bun lockfiles; npm `package-lock.json` regenerated as the single lockfile.
- `supabase/config.toml` project id reset to a neutral `beacon`.
- The app now starts with no backend: the commuter screens run on sample data and sign-in shows a setup notice.

Data in the old Lovable Cloud database is not migrated. The schema is in `supabase/migrations` and can be applied to any Supabase or Postgres project. If there is real data there (SACCOs, vehicles), export it from Lovable before that project is shut down.

## Target architecture

The full backend plan (ingest, real-time, routes, payments ledger, rewards, security, scaling, phases) is in [BACKEND-PLAN.md](BACKEND-PLAN.md).

```
Crew phone (PWA first, native Android later) --positions--> Ingest (Supabase Edge Function / API)
                                                                 |
                       Postgres + PostGIS (routes, stages, shifts, positions, payments)
                                                                 |
             Realtime channel per route  ----->  Commuter PWA (map, terminus board, follow vehicle)
                                         ----->  SACCO dashboard (fleet, coverage, exceptions, payments)
Payment providers (Jipay, M-PESA Daraja, ...) <--> PaymentProvider interface <--> payments table
```

## Roadmap (one reviewable PR each)

1. **Independence** (this PR).
2. **Data contract and routes from the database.** Add `stages`, `shifts`, `positions`, `vehicle_status` view; public read for live routes/stages; move sample routes into a seed. Front end reads through one `VehicleStatus` data layer with freshness states (fresh / aging / stale / hidden) and a visible "sample data" banner.
3. **Terminus and stage board (priority).** The end-of-day queue at the final stage is the main pain point. For a chosen stage or terminus: vehicles heading there, approximate distance, last seen stage, last update age, and how many of the route's vehicles are reporting. Shareable `?stage=` and `?route=` links and a QR for posting at the stage. No seat or capacity tracking.
4. **Route preview and follow vehicle.** Pick a route, see its line, stages and direction-aware vehicles before boarding; tap to follow.
5. **Crew mode.** Phone sign-in, assigned vehicle and route, one Start/End shift button, location upload every 5 to 10 s with offline buffering. Starts as a PWA screen; native Android later for reliable background location.
6. **SACCO operations.** Routes and stages editor, vehicle assignments, live fleet view, vehicles assigned but not reporting, service alerts to commuters, SACCO-manager scoping.
7. **Payments with Jipay as wallet.** `PaymentProvider` interface, a Jipay adapter (mocked until Jipay confirms their API, settlement, refunds, transaction ids and vehicle-level attribution), receipts, SACCO reconciliation. Tracking never requires payment; cash keeps working.
