import type { LatLng } from './geo';

/**
 * The single contract between tracking data and the UI (build spec §8.6).
 * Sample and live sources both produce this shape, so swapping the source
 * needs no UI changes.
 */
export type Direction = 'outbound' | 'inbound';
export type DataSource = 'sample' | 'live';
export type Freshness = 'fresh' | 'aging' | 'stale' | 'hidden';

export interface VehicleStatus {
  vehicleId: string;
  routeId: string;
  plate: string;
  saccoName: string;
  /** outbound = first stage → last stage (e.g. Town → Kawangware). */
  direction: Direction;
  position: LatLng;
  /** Metres along the route line from its first stage. */
  progressM: number;
  /** Index into the route's stages of the last stage passed. */
  lastStageIndex: number;
  /** ISO 8601 UTC. */
  lastReportAt: string;
  source: DataSource;
  onShift: boolean;
}

// Freshness thresholds (spec §8.3). Named so the pilot can tune them.
export const FRESH_MAX_MS = 60_000;
export const AGING_MAX_MS = 3 * 60_000;
export const STALE_MAX_MS = 10 * 60_000;

/** A report stamped this far in the future comes from a wrong clock and says nothing about now. */
export const FUTURE_SKEW_MS = 2 * 60_000;

export function freshnessOf(lastReportAt: string, now: number): Freshness {
  const age = now - Date.parse(lastReportAt);
  // Unreadable or far-future timestamps would otherwise look "fresh" forever.
  if (!Number.isFinite(age) || age < -FUTURE_SKEW_MS) return 'hidden';
  if (age < FRESH_MAX_MS) return 'fresh';
  if (age < AGING_MAX_MS) return 'aging';
  if (age < STALE_MAX_MS) return 'stale';
  return 'hidden';
}

/** "just now", "40 s ago", "3 min ago". */
export function formatAge(lastReportAt: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(lastReportAt)) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  return `${Math.floor(s / 60)} min ago`;
}

/** "350 m", "1.2 km". Approximate on purpose: never an arrival time. */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** Public visibility rule (spec §8.5): on shift and not hidden by age. */
export function isPubliclyVisible(v: VehicleStatus, now: number): boolean {
  return v.onShift && freshnessOf(v.lastReportAt, now) !== 'hidden';
}

/** Coverage (spec §8.4): reporting (fresh or aging) ÷ on shift. */
export function coverage(vehicles: VehicleStatus[], now: number) {
  const onShift = vehicles.filter(v => v.onShift);
  const reporting = onShift.filter(v => {
    const f = freshnessOf(v.lastReportAt, now);
    return f === 'fresh' || f === 'aging';
  });
  return { reporting: reporting.length, onShift: onShift.length };
}

export interface Approaching {
  vehicle: VehicleStatus;
  /** Metres along the route still to travel to reach the stage. */
  distanceM: number;
  freshness: Freshness;
}

/**
 * Vehicles that are on their way to the stage at `stageProgressM`, nearest
 * first. Outbound vehicles approach from lower progress, inbound from higher.
 * A vehicle already at or past the stage (within `passedToleranceM`) is not
 * approaching.
 */
export function vehiclesApproaching(
  vehicles: VehicleStatus[],
  stageProgressM: number,
  now: number,
  passedToleranceM = 30,
): Approaching[] {
  const out: Approaching[] = [];
  for (const v of vehicles) {
    if (!isPubliclyVisible(v, now)) continue;
    const delta = stageProgressM - v.progressM;
    const distanceM = v.direction === 'outbound' ? delta : -delta;
    if (distanceM < -passedToleranceM) continue;
    out.push({ vehicle: v, distanceM: Math.max(0, distanceM), freshness: freshnessOf(v.lastReportAt, now) });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}
