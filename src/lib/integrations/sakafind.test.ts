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
    await expect(s.fetchProfile()).rejects.toThrow('signed this phone out');
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
    await expect(s.sakafindProvider('400200').pay({ ...fare, amountKsh: 301 })).rejects.toThrow(/capped at KSh 300/);
  });
});

describe('Paying from the Sakafind wallet when things go wrong', () => {
  const profile = { first_name: 'A', wallet_open: true, balance_kes: 500, weekly_allowance_kes: 300, spent_this_week_kes: 250, allowance_left_kes: 50, per_fare_max_kes: 300, fee_kes: 5 };

  it('says up front why the wallet cannot pay', async () => {
    const { walletBlock } = await import('./sakafind');
    expect(walletBlock(profile, 40)).toBeNull();
    expect(walletBlock(profile, 80)).toContain('Only KSh 50 left');
    expect(walletBlock({ ...profile, wallet_open: false }, 40)).toContain('not open');
    expect(walletBlock({ ...profile, weekly_allowance_kes: 0, allowance_left_kes: 0 }, 40)).toContain('sign-in only');
    expect(walletBlock({ ...profile, balance_kes: 40 }, 40)).toContain('needs KSh 45 with the fee');
    expect(walletBlock({ ...profile, per_fare_max_kes: 30 }, 40)).toContain('capped at KSh 30');
    expect(walletBlock(null, 40)).toBeNull();
  });

  /** "Failed to fetch" used to reach the commuter raw, and gave no hint that trying again is safe. */
  it('reports no connection plainly and keeps the same key for the retry', async () => {
    const s = await live();
    localStorage.setItem('beacon.sakafind.token', 'bcn_x');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const err = await s.sakafindProvider('400200').pay({ ...fare, idempotencyKey: 'k-12345678' }).catch(e => e);
    expect(err).toBeInstanceOf(s.SakafindError);
    expect(err.message).toContain('will not pay twice');
    expect(s.retrySameKey(err)).toBe(true);
  });

  it('a refusal is final for that key, and a signed-out phone forgets the link', async () => {
    const s = await live();
    localStorage.setItem('beacon.sakafind.token', 'bcn_x');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: 'ALLOWANCE', message: 'Over your limit.' } }), { status: 422 })));
    const refused = await s.sakafindProvider('400200').pay(fare).catch(e => e);
    expect(refused.message).toBe('Over your limit.');
    expect(s.retrySameKey(refused)).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 })));
    const out = await s.sakafindProvider('400200').pay(fare).catch(e => e);
    expect(out.code).toBe('SIGNED_OUT');
    expect(s.isConnected()).toBe(false);
  });

  it('says so when the owner has switched wallet payments off', async () => {
    const s = await live();
    localStorage.setItem('beacon.sakafind.token', 'bcn_x');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: 'NOT_AVAILABLE', message: 'off' } }), { status: 404 })));
    expect((await s.fetchProfile().catch(e => e)).code).toBe('NOT_AVAILABLE');
  });

  /** Losing signal while waiting for JiPay must not read as a failure, or the commuter pays twice. */
  it('a fare that was sent stays pending if the connection drops while waiting', async () => {
    vi.useFakeTimers();
    const s = await live();
    localStorage.setItem('beacon.sakafind.token', 'bcn_x');
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (n++ === 0) return new Response(JSON.stringify({ success: true, data: { reference: 'WF-9', status: 'pending', amount_kes: 80, paybill: '400200', account: 'KDA123A', receipt: null, reason: null } }), { status: 201 });
      throw new TypeError('Failed to fetch');
    }));
    const p = s.sakafindProvider('400200').pay(fare);
    await vi.runAllTimersAsync();
    expect((await p).status).toBe('pending');
  });

  it('turns a failed fare into a clear error, and "check again" updates a pending receipt', async () => {
    vi.useFakeTimers();
    const s = await live();
    const { readReceipts } = await import('@/lib/payments/jipayMock');
    localStorage.setItem('beacon.sakafind.token', 'bcn_x');
    const failed = { reference: 'WF-1', status: 'failed', amount_kes: 80, paybill: '400200', account: 'X', receipt: null, reason: 'declined', message: 'JiPay did not pay this fare (declined). No money was taken.' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: failed }), { status: 201 })));
    const p = s.sakafindProvider('400200').pay(fare).catch(e => e);
    await vi.runAllTimersAsync();
    expect((await p).message).toContain('No money was taken');

    const pending = { ...failed, reference: 'WF-2', status: 'pending', message: undefined };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: pending }), { status: 201 })));
    const q = s.sakafindProvider('400200').pay(fare);
    await vi.runAllTimersAsync();
    const receipt = await q;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { ...pending, status: 'completed', receipt: 'TKA1B2C3' } }))));
    const done = await s.checkFare(receipt);
    expect(done).toMatchObject({ status: 'confirmed', mpesaReceipt: 'TKA1B2C3' });
    expect(readReceipts().filter(r => r.transactionId === 'WF-2')).toHaveLength(1);
  });
});

describe('PayBill format', () => {
  /** The SACCO PayBill is shown as "000 123"; sent like that, Sakafind refused every fare as a bad destination. */
  it('sends the PayBill as digits only', async () => {
    vi.stubEnv('VITE_SAKAFIND_URL', 'https://sakafind.com');
    vi.stubEnv('VITE_SAKAFIND_API', 'https://app.jengasafe.com/api');
    const s = await import('./sakafind');
    localStorage.setItem('beacon.sakafind.token', 'bcn_x');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { reference: 'WF-1', status: 'completed', amount_kes: 80, paybill: '000123', account: 'KDA123A', receipt: 'R1', reason: null } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await s.sakafindProvider('000 123').pay({ routeNumber: '46', routeName: 'x', vehiclePlate: 'KDA 123A', vehicleId: 'v', boardingStage: 'Kencom', amountKsh: 80, phone: '' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).paybill).toBe('000123');
  });
});
