/**
 * Beacon points (DEMO). Commuters earn points by watching a short sponsored
 * clip while they wait, and spend them on a fare. Advertisers fund the points:
 * when a commuter redeems, Beacon pays the full fare into the SACCO's PayBill
 * with the vehicle plate as account number.
 *
 * In production the balance lives on the backend, each view is verified with
 * the ad network, and views are capped per phone number per day.
 */

export const POINTS_PER_AD = 10;
/** 1 point = KSh 1 of fare. A KSh 60 to 100 fare is 6 to 10 ads. */
export const KSH_PER_POINT = 1;
export const AD_SECONDS = 15;
export const MAX_ADS_PER_DAY = 20;

const KEY = 'beacon.demo.points';

interface PointsState { balance: number; day: string; adsToday: number }

const today = (now: number) => new Date(now).toDateString();

function read(now: number): PointsState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PointsState | null;
    if (s) return s.day === today(now) ? s : { ...s, day: today(now), adsToday: 0 };
  } catch { /* ignore */ }
  return { balance: 0, day: today(now), adsToday: 0 };
}
function write(s: PointsState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('beacon-points'));
}

export const pointsBalance = (now = Date.now()) => read(now).balance;
export const adsLeftToday = (now = Date.now()) => MAX_ADS_PER_DAY - read(now).adsToday;
export const pointsForFare = (fareKsh: number) => Math.ceil(fareKsh / KSH_PER_POINT);

/** Credit a fully watched ad. Returns the new balance, or null at the daily cap. */
export function creditAdView(now = Date.now()): number | null {
  const s = read(now);
  if (s.adsToday >= MAX_ADS_PER_DAY) return null;
  const next = { ...s, balance: s.balance + POINTS_PER_AD, adsToday: s.adsToday + 1 };
  write(next);
  return next.balance;
}

export function spendPoints(points: number, now = Date.now()): boolean {
  const s = read(now);
  if (s.balance < points) return false;
  write({ ...s, balance: s.balance - points });
  return true;
}
