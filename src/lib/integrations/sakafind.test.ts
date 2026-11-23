import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const fare = { routeNumber: '46', routeName: 'CBD → Kawangware', vehiclePlate: 'KDA 123A', vehicleId: 'v1', boardingStage: 'Kencom', amountKsh: 80, phone: '0712345678' };

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', new MemStorage());
  vi.stubGlobal('sessionStorage', new MemStorage());
  vi.stubGlobal('window', { location: { origin: 'https://beacon.example.com' } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const live = async () => {
  vi.stubEnv('VITE_SAKAFIND_URL', 'https://sakafind.com');
  vi.stubEnv('VITE_SAKAFIND_API', 'https://app.jengasafe.com/api');
  return import('./sakafind');
};

describe('Continue with Sakafind', () => {
  it('makes the S256 challenge: base64url of SHA-256, no padding', async () => {
    const { pkceChallenge } = await import('./sakafind');
    const verifier = 'dBjftJeZ4CVP-mJ92K1rH6tY4eLWh6Wu3aHnLE8jWd0';
    expect(await pkceChallenge(verifier)).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('sends the commuter to Sakafind with a challenge, never the verifier', async () => {
    const s = await live();
    const url = new URL(await s.connectUrl('/'));
    expect(url.origin + url.pathname).toBe('https://sakafind.com/connect/beacon');
    expect(url.searchParams.get('redirect_uri')).toBe('https://beacon.example.com/connect/sakafind');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const { verifier } = JSON.parse(sessionStorage.getItem('beacon.sakafind.pending')!);
    expect(url.toString()).not.toContain(verifier);
    expect(url.searchParams.get('code_challenge')).toBe(await s.pkceChallenge(verifier));
  });

  /** A code arriving with someone else's state could be an attacker linking their own wallet to this phone. */
  it('ignores a code whose state is not the one it sent', async () => {
    const s = await live();
    await s.connectUrl('/');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(s.completeConnect(new URLSearchParams({ code: 'abc', state: 'not-ours' }))).rejects.toThrow(/did not start here/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swaps the code with the verifier and keeps the token', async () => {
    const s = await live();
    const state = new URL(await s.connectUrl('/map')).searchParams.get('state')!;
    const profile = { first_name: 'Achieng', wallet_open: true, balance_kes: 900, weekly_allowance_kes: 500, spent_this_week_kes: 0, allowance_left_kes: 500, per_fare_max_kes: 300, fee_kes: 0 };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { access_token: 'bcn_x', profile } })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await s.completeConnect(new URLSearchParams({ code: 'abc', state }));
    expect(res.returnTo).toBe('/map');
    expect(s.isConnected()).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://app.jengasafe.com/api/partner/beacon/token');
    expect(JSON.parse(String(init.body))).toMatchObject({ grant_type: 'authorization_code', code: 'abc', redirect_uri: 'https://beacon.example.com/connect/sakafind' });
  });

  it('pays a fare with one Idempotency-Key and reports a fare JiPay has not confirmed as pending', async () => {
    vi.useFakeTimers();
    const s = await live();
    localStorage.setItem('beacon.sakafind.token', 'bcn_x');
    const pending = { reference: 'WF-1', status: 'pending', amount_kes: 80, paybill: '400200', account: 'KDA123A', receipt: null, reason: null };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: pending }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = s.sakafindProvider('400200').pay({ ...fare, accountRef: 'KDA123A', idempotencyKey: 'fare-key-1' });
    await vi.runAllTimersAsync();
    const receipt = await p;
    expect(receipt.status).toBe('pending');
    expect(receipt.demo).toBe(false);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('fare-key-1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer bcn_x');
  });

  it('forgets the token when Sakafind says it was revoked', async () => {
    const s = await live();
    localStorage.setItem('beacon.sakafind.token', 'bcn_x');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in again.' } }), { status: 401 })));
    await expect(s.fetchProfile()).rejects.toThrow('Sign in again.');
    expect(s.isConnected()).toBe(false);
  });

  it('runs as a labelled demo without Sakafind configured, within the weekly limit', async () => {
    vi.useFakeTimers();
    const s = await import('./sakafind');
    expect(s.sakafindLive).toBe(false);
    s.connectDemo();
    const p = s.sakafindProvider('400200').pay(fare);
    await vi.runAllTimersAsync();
    expect((await p).demo).toBe(true);
    expect((await s.fetchProfile())?.allowance_left_kes).toBe(920);
    await expect(s.sakafindProvider('400200').pay({ ...fare, amountKsh: 301 })).rejects.toThrow(/limit/);
  });
});
