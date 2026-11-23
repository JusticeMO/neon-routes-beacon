/**
 * "Continue with Sakafind": sign in with a Sakafind account and pay fares from the tenant's
 * JiPay wallet there, within a weekly limit they choose on Sakafind.
 *
 * OAuth 2.0 authorization code flow with PKCE (S256). Beacon sends the commuter to
 * Sakafind's /connect/beacon page with a code challenge; Sakafind sends them back to
 * /connect/sakafind with a one-time code, which Beacon swaps (with the verifier, which
 * never left this browser) for a connection token. Fares then go to
 * POST {api}/partner/beacon/fares with an Idempotency-Key, so a retry never pays twice.
 *
 * Needs VITE_SAKAFIND_URL (the website) and VITE_SAKAFIND_API (its API, ending in /api).
 * Without them the button links a demo wallet held in this browser, and no money moves.
 */
import type { FareRequest, PaymentProvider, Receipt } from '@/lib/payments/provider';
import { maskPhone } from '@/lib/payments/provider';
import { saveReceipt } from '@/lib/payments/jipayMock';

const clean = (v: unknown) => String(v ?? '').trim().replace(/\/+$/, '');
export const SAKAFIND_URL = clean(import.meta.env.VITE_SAKAFIND_URL);
export const SAKAFIND_API = clean(import.meta.env.VITE_SAKAFIND_API);
/** True when both addresses are set; otherwise the flow runs as a labelled demo. */
export const sakafindLive = /^https?:\/\//.test(SAKAFIND_URL) && /^https?:\/\//.test(SAKAFIND_API);

const TOKEN_KEY = 'beacon.sakafind.token';
const PROFILE_KEY = 'beacon.sakafind.profile';
const PENDING_KEY = 'beacon.sakafind.pending';
const DEMO_KEY = 'beacon.sakafind.demo';

export interface SakafindProfile {
  first_name: string;
  wallet_open: boolean;
  balance_kes: number | null;
  weekly_allowance_kes: number;
  spent_this_week_kes: number;
  allowance_left_kes: number;
  per_fare_max_kes: number;
  fee_kes: number;
  /** Set on the demo link only. */
  demo?: boolean;
}

export class SakafindError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}

const store = {
  get: (k: string, s: Storage = localStorage) => { try { return s.getItem(k); } catch { return null; } },
  set: (k: string, v: string, s: Storage = localStorage) => { try { s.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string, s: Storage = localStorage) => { try { s.removeItem(k); } catch { /* private mode */ } },
};

export const redirectUri = () => `${window.location.origin}/connect/sakafind`;

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** The address of Sakafind's consent page; remembers the verifier and state for the way back. */
export async function connectUrl(returnTo = '/'): Promise<string> {
  const verifier = randomString(48);
  const state = randomString(16);
  store.set(PENDING_KEY, JSON.stringify({ verifier, state, returnTo }), sessionStorage);
  const q = new URLSearchParams({
    redirect_uri: redirectUri(), state, code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256',
  });
  return `${SAKAFIND_URL}/connect/beacon?${q}`;
}

const NO_CONNECTION = 'No connection to Sakafind. Check your data and try again. If the fare already went through, trying again will not pay twice.';

async function call<T>(path: string, init: RequestInit = {}, token = store.get(TOKEN_KEY)): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SAKAFIND_API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    // Offline, DNS, CORS or a dropped connection: the request may or may not have arrived.
    throw new SakafindError('NETWORK', NO_CONNECTION, 0);
  }
  const body = await res.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!res.ok || !body?.data) {
    if (res.status === 401) {
      disconnect();
      throw new SakafindError('SIGNED_OUT', 'Sakafind signed this phone out (disconnected or expired). Tap Continue with Sakafind on your profile to connect again.', 401);
    }
    if (res.status === 404 && body?.error?.code === 'NOT_AVAILABLE') {
      throw new SakafindError('NOT_AVAILABLE', 'Paying from your Sakafind wallet is switched off for now. Pay another way.', 404);
    }
    throw new SakafindError(body?.error?.code ?? 'SERVER', body?.error?.message ?? `Sakafind could not do that just now (${res.status || 'no answer'}). Try again.`, res.status);
  }
  return body.data;
}

/**
 * Why the Sakafind wallet can't pay this fare, worked out before trying, or null when it can.
 * The server checks all of this again; this is so the commuter sees why up front.
 */
export function walletBlock(p: SakafindProfile | null, fare: number): string | null {
  if (!p) return null;
  if (!p.wallet_open) return 'Your JiPay Wallet is not open. Open it in Sakafind first.';
  if (p.weekly_allowance_kes <= 0) return 'You connected Beacon for sign-in only. Connect again with a weekly limit to pay fares.';
  if (fare > p.per_fare_max_kes) return `Fares from the wallet are capped at KSh ${p.per_fare_max_kes}.`;
  if (fare > p.allowance_left_kes) return `Only KSh ${p.allowance_left_kes} left of your KSh ${p.weekly_allowance_kes} limit for the last 7 days.`;
  if (p.balance_kes !== null && fare + p.fee_kes > p.balance_kes) return `Your wallet has KSh ${p.balance_kes}; this fare needs KSh ${fare + p.fee_kes} with the fee. Load it in Sakafind.`;
  return null;
}

/** True when a failed payment can be tried again with the same Idempotency-Key (the request may have arrived). */
export const retrySameKey = (e: unknown): boolean => e instanceof SakafindError && e.status === 0;

/**
 * The way back from Sakafind: check state, swap the code for a token. Returns where to go next.
 * A state that doesn't match the one we sent means the page was not opened by this browser's
 * request, so the code is ignored.
 */
export async function completeConnect(params: URLSearchParams): Promise<{ profile: SakafindProfile; returnTo: string }> {
  const pending = JSON.parse(store.get(PENDING_KEY, sessionStorage) ?? 'null') as { verifier: string; state: string; returnTo: string } | null;
  store.del(PENDING_KEY, sessionStorage);
  if (params.get('error') === 'access_denied') throw new SakafindError('DENIED', 'You chose not to connect Sakafind.');
  const code = params.get('code');
  if (!pending || !code || params.get('state') !== pending.state) {
    throw new SakafindError('STATE', 'This sign-in did not start here. Tap Continue with Sakafind again.');
  }
  const data = await call<{ access_token: string; profile: SakafindProfile }>('/partner/beacon/token', {
    method: 'POST',
    body: JSON.stringify({ grant_type: 'authorization_code', code, code_verifier: pending.verifier, redirect_uri: redirectUri() }),
  }, null);
  store.set(TOKEN_KEY, data.access_token);
  store.set(PROFILE_KEY, JSON.stringify(data.profile));
  return { profile: data.profile, returnTo: pending.returnTo.startsWith('/') && !pending.returnTo.startsWith('//') ? pending.returnTo : '/' };
}

// ── Demo link: a wallet held in this browser so the flow can be tried without Sakafind. ──
const DEMO_PROFILE: SakafindProfile = {
  first_name: 'Demo', wallet_open: true, balance_kes: 1250, weekly_allowance_kes: 1000, spent_this_week_kes: 0,
  allowance_left_kes: 1000, per_fare_max_kes: 300, fee_kes: 0, demo: true,
};
export function connectDemo(): SakafindProfile {
  store.set(DEMO_KEY, JSON.stringify(DEMO_PROFILE));
  return DEMO_PROFILE;
}
const demoProfile = () => JSON.parse(store.get(DEMO_KEY) ?? 'null') as SakafindProfile | null;

/** The last known profile, for drawing the screen before the network answers. */
export function cachedProfile(): SakafindProfile | null {
  return demoProfile() ?? (store.get(TOKEN_KEY) ? JSON.parse(store.get(PROFILE_KEY) ?? 'null') : null);
}
export const isConnected = () => Boolean(demoProfile() || store.get(TOKEN_KEY));

export async function fetchProfile(): Promise<SakafindProfile | null> {
  const demo = demoProfile();
  if (demo) return demo;
  if (!sakafindLive || !store.get(TOKEN_KEY)) return null;
  const p = await call<SakafindProfile>('/partner/beacon/wallet');
  store.set(PROFILE_KEY, JSON.stringify(p));
  return p;
}

/** Forget the connection on this phone. The tenant can also disconnect from Sakafind settings. */
export function disconnect() {
  [TOKEN_KEY, PROFILE_KEY, DEMO_KEY].forEach(k => store.del(k));
}

interface FareResult { reference: string; status: 'pending' | 'completed' | 'failed'; amount_kes: number; paybill: string; account: string; receipt: string | null; reason: string | null; message?: string }

/**
 * Pays the SACCO PayBill from the Sakafind wallet. The same key is sent on every attempt
 * for one fare, so a retry after a dropped connection finds the first payment instead of
 * paying again. Waits briefly for JiPay to confirm; a fare still pending after that is
 * reported as pending, never as paid.
 */
export function sakafindProvider(displayPaybill: string): PaymentProvider {
  // PayBills are shown grouped ("000 123") but sent as digits; Sakafind refuses anything else.
  const paybill = displayPaybill.replace(/\D/g, '');
  return {
    id: 'sakafind',
    name: 'JiPay wallet (Sakafind)',
    async pay(req: FareRequest): Promise<Receipt> {
      const account = req.accountRef ?? req.vehiclePlate;
      const base = {
        provider: 'JiPay wallet (Sakafind)', method: 'sakafind' as const, paybill, accountRef: account,
        routeNumber: req.routeNumber, routeName: req.routeName, vehiclePlate: req.vehiclePlate, vehicleId: req.vehicleId,
        boardingStage: req.boardingStage, amountKsh: req.amountKsh, phoneMasked: maskPhone(req.phone), paidAt: new Date().toISOString(),
      };
      const demo = demoProfile();
      if (demo) {
        const blocked = walletBlock(demo, req.amountKsh);
        if (blocked) throw new SakafindError('LIMIT', blocked, 422);
        await new Promise(r => setTimeout(r, 700));
        const spent = demo.spent_this_week_kes + req.amountKsh;
        store.set(DEMO_KEY, JSON.stringify({ ...demo, balance_kes: (demo.balance_kes ?? 0) - req.amountKsh, spent_this_week_kes: spent, allowance_left_kes: demo.weekly_allowance_kes - spent }));
        const receipt: Receipt = { ...base, transactionId: `WF-DEMO-${Date.now().toString(36).toUpperCase()}`, status: 'confirmed', demo: true };
        saveReceipt(receipt);
        return receipt;
      }

      const key = req.idempotencyKey ?? randomString(18);
      let fare = await call<FareResult>('/partner/beacon/fares', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({ amount_kes: req.amountKsh, paybill, account_number: account, route: req.routeNumber, plate: req.vehiclePlate, stage: req.boardingStage }),
      });
      // The fare exists now. A dropped connection while waiting for JiPay must not turn into
      // an error, or the commuter might pay again another way: it stays "pending".
      for (let i = 0; i < 5 && fare.status === 'pending'; i++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          fare = await call<FareResult>(`/partner/beacon/fares/${encodeURIComponent(fare.reference)}`);
        } catch {
          break;
        }
      }
      void fetchProfile().catch(() => undefined);
      if (fare.status === 'failed') throw new SakafindError('FAILED', fare.message ?? 'JiPay did not pay this fare. No money was taken.', 422);
      const receipt: Receipt = {
        ...base, transactionId: fare.reference, mpesaReceipt: fare.receipt ?? undefined,
        status: fare.status === 'completed' ? 'confirmed' : 'pending', demo: false,
      };
      saveReceipt(receipt);
      return receipt;
    },
  };
}

/** Asks Sakafind again about a fare that was still pending, and updates the saved receipt. */
export async function checkFare(receipt: Receipt): Promise<Receipt> {
  const fare = await call<FareResult>(`/partner/beacon/fares/${encodeURIComponent(receipt.transactionId)}`);
  const next: Receipt = {
    ...receipt, mpesaReceipt: fare.receipt ?? receipt.mpesaReceipt,
    status: fare.status === 'completed' ? 'confirmed' : fare.status === 'failed' ? 'failed' : 'pending',
    failureMessage: fare.status === 'failed' ? fare.message : undefined,
  };
  saveReceipt(next);
  return next;
}
