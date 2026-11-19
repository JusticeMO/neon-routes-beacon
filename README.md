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
