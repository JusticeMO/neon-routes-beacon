import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Beacon's backend is a standard Supabase (Postgres + Auth) project that you own.
// Point it at your own project, or a local one from `supabase start`, via .env
// (see .env.example). Without it, the public commuter screens still work on
// sample data; sign-in and the SACCO admin area need the backend.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

export const isBackendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isBackendConfigured && import.meta.env.DEV) {
  console.warn(
    '[beacon] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Running on sample data only; sign-in and admin are disabled.',
  );
}

// Import the client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = createClient<Database>(
  SUPABASE_URL || 'http://localhost:54321',
  SUPABASE_ANON_KEY || 'backend-not-configured',
  {
    auth: {
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      persistSession: isBackendConfigured,
      autoRefreshToken: isBackendConfigured,
    },
  },
);
