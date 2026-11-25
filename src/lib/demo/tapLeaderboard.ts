/**
 * Beacon Tap stage leaderboard (DEMO). Commuters waiting at the same stage
 * play in short rounds. When a round closes, the top scorer at that stage gets
 * their next fare paid by the round's sponsor. The sponsor pays the SACCO's
 * PayBill with the vehicle plate as account number, so the SACCO is still
 * paid in full.
 *
 * Other players are simulated and deterministic per stage and round; in
 * production the board would come from the backend, with one entry per
 * verified phone number to stop multi-account farming.
 */

export const ROUND_MS = 5 * 60_000;
export const ROUND_SPONSORS = ['Jipay', 'Mama Njeri Snacks', 'Stage Data Bundles'];

const ROUND_KEY = 'beacon.demo.tapRound';
const VOUCHER_KEY = 'beacon.demo.fareVoucher';
export const YOU = 'You';

const NAMES = ['Wanjiru K.', 'Otieno M.', 'Achieng A.', 'Kamau J.', 'Njeri W.', 'Mutua P.', 'Chebet L.', 'Omondi D.', 'Wairimu G.', 'Kiprop S.'];

export interface LeaderEntry { name: string; score: number; you?: boolean }

interface RoundState { stage: string; roundId: number; best: number; settled?: boolean }

export interface FareVoucher {
  stage: string;
  sponsor: string;
  score: number;
  wonAt: string;
  /** End of the day the round was won; unused vouchers lapse then. */
  expiresAt: string;
  used?: boolean;
}

const read = <T>(k: string): T | null => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export const roundIdAt = (now: number) => Math.floor(now / ROUND_MS);
export const roundEndsAt = (roundId: number) => (roundId + 1) * ROUND_MS;
export const sponsorFor = (roundId: number) => ROUND_SPONSORS[roundId % ROUND_SPONSORS.length];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * Simulated players at this stage. Each joins partway through the round, so the
 * board fills up as the round runs and the top score to beat climbs.
 */
function rivals(stage: string, roundId: number, now: number): LeaderEntry[] {
  const r = rng(hash(`${stage}|${roundId}`));
  const count = 3 + Math.floor(r() * 3);
  const start = roundId * ROUND_MS;
  const used = new Set<number>();
  const out: LeaderEntry[] = [];
  for (let i = 0; i < count; i++) {
    let n = Math.floor(r() * NAMES.length);
    while (used.has(n)) n = (n + 1) % NAMES.length;
    used.add(n);
    const score = 6 + Math.floor(r() * 12); // 6..17
    const joinsAt = start + r() * ROUND_MS * 0.8;
    if (now >= joinsAt) out.push({ name: NAMES[n], score });
  }
  return out;
}

function myRound(stage: string, roundId: number): RoundState | null {
  const s = read<RoundState>(ROUND_KEY);
  return s && s.stage === stage && s.roundId === roundId ? s : null;
}

export function leaderboard(stage: string, now: number): LeaderEntry[] {
  const roundId = roundIdAt(now);
  const list = rivals(stage, roundId, now);
  const mine = myRound(stage, roundId);
  if (mine && mine.best > 0) list.push({ name: YOU, score: mine.best, you: true });
  // Ties go to whoever set the score first; simulated players count as earlier.
  return list.sort((a, b) => b.score - a.score || Number(!!a.you) - Number(!!b.you));
}

/** Record a finished game. Keeps the player's best score for this stage and round. */
export function recordScore(stage: string, score: number, now: number) {
  settleRounds(now);
  const roundId = roundIdAt(now);
  const mine = myRound(stage, roundId);
  if (mine && mine.best >= score) return;
  write(ROUND_KEY, { stage, roundId, best: score } satisfies RoundState);
}

/**
 * Close any round of the player's that has ended. If they topped it, they win a
 * fare voucher. Safe to call often.
 */
export function settleRounds(now: number): FareVoucher | null {
  const s = read<RoundState>(ROUND_KEY);
  if (!s || s.settled || now < roundEndsAt(s.roundId)) return null;
  write(ROUND_KEY, { ...s, settled: true });
  const final = rivals(s.stage, s.roundId, roundEndsAt(s.roundId));
  const top = Math.max(0, ...final.map(e => e.score));
  if (s.best <= top) return null;
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const v: FareVoucher = {
    stage: s.stage,
    sponsor: sponsorFor(s.roundId),
    score: s.best,
    wonAt: new Date(roundEndsAt(s.roundId)).toISOString(),
    expiresAt: end.toISOString(),
  };
  write(VOUCHER_KEY, v);
  return v;
}

/** The unused fare voucher the player has won, if any. */
export function activeVoucher(now: number): FareVoucher | null {
  settleRounds(now);
  const v = read<FareVoucher>(VOUCHER_KEY);
  return v && !v.used && now < Date.parse(v.expiresAt) ? v : null;
}

export function redeemVoucher() {
  const v = read<FareVoucher>(VOUCHER_KEY);
  if (v) write(VOUCHER_KEY, { ...v, used: true });
}
