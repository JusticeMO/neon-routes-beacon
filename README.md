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

Map: set `VITE_GOOGLE_MAPS_API_KEY` to use Google Maps with the live traffic layer. With the key, each route is also snapped to real roads (Google driving directions through its stages), so route lines and matatus follow the streets. Enable **Maps JavaScript API** and **Directions API** on the key and restrict it to your site's domain. Without a key the app uses an open-source OpenStreetMap street map (CARTO tiles). Route lines ship already following real roads, routed over OpenStreetMap data with the scripts in `scripts/route-paths/`, so no routing server is needed. Set `VITE_OSRM_URL` to your own OSRM server only if you want routes re-snapped in the browser.

## Offline map (works with no internet)

`/map` is the MVP technical test from the backend plan: open it once with internet, then turn on airplane mode.

- **The map loads offline.** The street map is drawn from a 7 MB Nairobi map pack in `public/offline/`, kept on the phone by a service worker (`public/sw.js`, production builds only, so test with `npm run build && npm run preview`). The commuter map at `/` uses the same offline map.
- **Tap any spot** to get its estate and road ("Kilimani, on Argwings Kodhek Road"), nearby landmarks with distance and direction, the areas around it, and the nearest Beacon stages.
- **Search** estates, landmarks, roads and stages by everyday names ("yaya", "KNH", "town").
- **Directions** by car or on foot: A* over the road graph in a background worker; a cross-town route takes about 30 ms.
- **Animate a vehicle** along any route found, or along a SACCO route.
- **Trip to town:** walk to the nearest stage, then ride that route to its CBD terminus.

Rebuild the map pack with the scripts in [`scripts/map-pack/`](scripts/map-pack/README.md).

## Sakafind integration

Sakafind home pages link their nearest matatu stage to Beacon. Two things on the Beacon side:

| What | Where | Use |
| --- | --- | --- |
| Deep link | `/map?lat=-1.2989&lng=36.7826&label=Sunrise%20Apartments&from=sakafind` | Opens the offline map at the home, with the walk to the nearest stage, the matatu ride to town and a link to live matatus. Add `&view=spot` to open the "what's around here" card instead. |
| Stage list | `/api/v1/stages.json` | Every Beacon stage with its position and the routes that stop there (number, name, colour, direction, usual fare off-peak and peak). Generated on each build, CORS open, no vehicle or rider data. |
| Directions to a home | `/map?lat=..&lng=..&label=..&from=sakafind&dir=to` | "Getting to Sunrise Apartments" from town or from the commuter's location: walk, matatu (with a change in town when needed), walk, total time and fare, with Share directions. |

### Continue with Sakafind (shared sign-in and JiPay wallet)

Profile has **Continue with Sakafind**. The commuter picks a weekly fare limit on Sakafind's `/connect/beacon` page and confirms with their wallet passcode; Beacon then offers **JiPay wallet (Sakafind)** when paying a fare, which pays the SACCO PayBill straight from the wallet they pay rent from.

- OAuth 2.0 code flow with PKCE (S256). The callback is `/connect/sakafind`; the verifier never leaves the browser.
- Each fare carries an `Idempotency-Key`, so a retry never pays twice. A fare JiPay has not confirmed is shown as pending, never as paid.
- Sakafind caps every fare (KSh 300) and the week (the limit the tenant chose), and the tenant can disconnect from Sakafind settings.
- Set `VITE_SAKAFIND_URL` and `VITE_SAKAFIND_API` (see `.env.example`). Without them the button links a demo wallet held in the browser and no money moves.

### Put the demo online

The live copy is hosted on Firebase at https://beacon.sakafind.com: see [docs/HOSTING.md](docs/HOSTING.md). For a quick one-off copy elsewhere:


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
