# Beacon

Beacon lets commuters see and follow shared matatus on SACCO-defined routes before they board, and gives SACCOs the operational view behind that service. Fare payment (Jipay, M-PESA and others) is an optional layer on top of tracking.

- Product and build spec: [docs/build-specification.md](docs/build-specification.md)
- Current architecture and roadmap: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Run it locally

Requires Node.js 20+ and npm.

```sh
npm install
cp .env.example .env   # optional, see "Backend" below
npm run dev            # http://localhost:8080
```

Other scripts: `npm run build`, `npm run preview`, `npm run typecheck`, `npm run lint`.

## Demo mode

With no backend configured, Beacon runs as a self-contained demo on simulated data. Nothing needs to be set up.

| Screen | URL | What it shows |
| --- | --- | --- |
| Commuter app | `/` | Pick a route and your stage, see matatus heading there with estimated minutes, follow one, pay the fare with Jipay (mocked), and an ad slot plus the Beacon Tap game while you wait. Receipts are under Profile. |
| Stage board | `/board`, `/board?stage=46-kencom` | Big-screen board for the CBD termini, built for the end-of-day queue. |
| Crew app | `/crew` | Start/End shift; the vehicle then appears on the commuter map and stage board in other tabs of the same browser. |
| SACCO dashboard | `/sacco` | Coverage, vehicles on shift but not reporting, supply heading into each CBD terminus, Jipay fares per vehicle. |

Rewards while you wait (demo rules, all in `src/lib/demo/`):
- **Watch ads for points**: a 15-second sponsored clip earns 10 Beacon points; 1 point = KSh 1 of fare, capped at 20 ads a day. With enough points for the fare, "Beacon points" appears as a payment option.
- **Beacon Tap prize**: players at the same stage share a 5-minute round. Whoever tops the board when it closes gets their next fare (valid that day) paid by the round's sponsor. Other players are simulated.
- In both cases the full fare still goes to the SACCO's PayBill with the vehicle plate as account number, funded by advertisers, so crews are paid as for any fare. In production the points balance, ad views and leaderboard must live on the backend, verified per phone number.

What is simulated: vehicle positions, traffic speed by time of day (evening rush is slowest), fares (peak/off-peak), Jipay payments and receipts (stored in the browser only), ads. ETAs are estimates from distance and traffic speed.

Map: set `VITE_GOOGLE_MAPS_API_KEY` to use Google Maps with the live traffic layer. With the key, each route is also snapped to real roads (Google driving directions through its stages), so route lines and matatus follow the streets. Enable **Maps JavaScript API** and **Directions API** on the key and restrict it to your site's domain. Without a key the app uses an open-source OpenStreetMap street map (CARTO tiles) and snaps routes to roads with open-source OSRM routing (the public demo server by default; set `VITE_OSRM_URL` to your own OSRM server for production).

### Put the demo online

`npm run build`, then upload `dist/` to any static host. Quickest options:
- **Netlify Drop**: drag the `dist` folder onto https://app.netlify.com/drop. `public/_redirects` already handles page links like `/board`.
- **Vercel**: import the repo; `vercel.json` handles page links. Build command `npm run build`, output `dist`.

Leave the `VITE_SUPABASE_*` variables unset on the host to keep it in demo mode.

## Backend

Beacon uses a standard [Supabase](https://supabase.com) project (Postgres + Auth) that **you** own. Nothing is tied to any app-builder platform.

1. Create a project on supabase.com, or run one locally with `npx supabase start` (needs Docker).
2. Apply the schema in `supabase/migrations`:
   - hosted: `npx supabase link --project-ref <ref>` then `npx supabase db push`
   - local: `npx supabase db reset`
3. Put the project URL and anon key in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Sign up in the app at `/auth`, then make yourself an admin in SQL:
   `insert into user_roles (user_id, role) values ('<your auth user id>', 'admin');`

Without a backend, the public commuter screens run on sample data and sign-in/admin are disabled with a notice.

## Deploy

`npm run build` produces a static site in `dist/`. Host it on any static host (Netlify, Vercel, Cloudflare Pages, S3 + CloudFront, Nginx). Configure the two `VITE_SUPABASE_*` variables in the host's build settings and add an SPA fallback to `index.html`.

## Tech

Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, Leaflet (OpenStreetMap/CARTO tiles), TanStack Query, Supabase JS.
