import { isBackendConfigured } from '@/integrations/supabase/client';

/**
 * Demo mode runs every screen (commuter, stage board, crew, SACCO) on seeded
 * sample data with no backend. It is on when no Supabase project is configured,
 * or when VITE_DEMO_MODE=true forces it on a configured build.
 */
export const isDemoMode = !isBackendConfigured || import.meta.env.VITE_DEMO_MODE === 'true';

export const DEMO_SACCO = 'Beacon Demo SACCO';

/**
 * Payment setup the SACCO is given. Demo values: the PayBill number is a
 * placeholder, not a real business number. Fares paid to the PayBill use the
 * vehicle plate (no spaces) as the account number, so each fare is tied to
 * the vehicle it was paid on.
 */
export const DEMO_SACCO_PAYMENTS = {
  mpesaPaybill: '000 123',
  jipayMerchant: 'BEACON-DEMO',
};

export function paybillAccountFor(plate: string): string {
  return plate.replace(/\s+/g, '').toUpperCase();
}

/** Fare per route in KSh (demo values; real fares come from the SACCO's route setup). */
const FARES: Record<string, { offPeak: number; peak: number }> = {
  '46': { offPeak: 60, peak: 80 },
  '34': { offPeak: 70, peak: 100 },
  '15': { offPeak: 80, peak: 100 },
  '108': { offPeak: 50, peak: 70 },
};

export function isPeak(now: number): boolean {
  const h = new Date(now).getHours();
  return (h >= 6 && h < 9) || (h >= 17 && h < 20);
}

export function fareFor(routeNumber: string, now: number): number {
  const f = FARES[routeNumber] ?? { offPeak: 70, peak: 90 };
  return isPeak(now) ? f.peak : f.offPeak;
}

/**
 * Average matatu speed for an ETA estimate, slowed down in the evening rush
 * when the CBD termini queue up. Demo stand-in for a traffic-aware ETA
 * (Google Directions with traffic once a Maps key is set up).
 */
export function trafficSpeedMps(now: number): number {
  const h = new Date(now).getHours();
  if (h >= 17 && h < 20) return 2.8; // ~10 km/h evening rush
  if (h >= 6 && h < 9) return 3.6; // ~13 km/h morning rush
  return 5.5; // ~20 km/h
}

export function trafficLabel(now: number): 'heavy' | 'moderate' | 'light' {
  const s = trafficSpeedMps(now);
  return s < 3 ? 'heavy' : s < 4 ? 'moderate' : 'light';
}

/** Estimated minutes to cover `distanceM` at current traffic. Always shown as an estimate. */
export function etaMinutes(distanceM: number, now: number): number {
  return Math.max(1, Math.round(distanceM / trafficSpeedMps(now) / 60));
}
