import type { Route } from './routes';
import { routeGeometry } from '@/lib/tracking/routeGeometry';
import type { VehicleStatus } from '@/lib/tracking/vehicleStatus';
import { readCrewShift } from '@/lib/demo/crewShift';
import { DEMO_SACCO } from '@/lib/demo/demoMode';

/**
 * SAMPLE tracking source. Simulates matatus shuttling between a route's two
 * terminals so the commuter screens can be built and tested before crews are
 * reporting. Everything it returns is marked `source: 'sample'`.
 *
 * Replace with a live source (Supabase Realtime) that returns the same
 * VehicleStatus shape; no UI changes should be needed.
 */

const REPORT_INTERVAL_MS = 10_000;
const SPEED_MPS = 5.5; // ~20 km/h, Nairobi traffic

interface SampleVehicle {
  suffix: string;
  /** Where in the shuttle loop the vehicle is at t=0, as a fraction. */
  phase: number;
  /** How long ago it last reported (simulates a phone that went quiet). */
  silentForMs: number;
  onShift: boolean;
}

const FLEET: SampleVehicle[] = [
  { suffix: 'A', phase: 0.05, silentForMs: 0, onShift: true },
  { suffix: 'B', phase: 0.3, silentForMs: 0, onShift: true },
  { suffix: 'C', phase: 0.55, silentForMs: 0, onShift: true },
  { suffix: 'D', phase: 0.8, silentForMs: 0, onShift: true },
  { suffix: 'E', phase: 0.68, silentForMs: 2 * 60_000, onShift: true }, // aging
  { suffix: 'F', phase: 0.15, silentForMs: 6 * 60_000, onShift: true }, // stale
  { suffix: 'G', phase: 0.42, silentForMs: 0, onShift: false }, // off shift: never public
];

function plateFor(route: Route, suffix: string, i: number): string {
  const n = (Number(route.number) * 37 + i * 113) % 900 + 100;
  return `KD${String.fromCharCode(65 + (i % 6))} ${n}${suffix}`;
}

export function sampleVehicles(route: Route, now: number): VehicleStatus[] {
  const geo = routeGeometry(route);
  const loopM = geo.lengthM * 2;
  const crew = crewVehicle(route, now);
  const fleet = FLEET.map((v, i) => {
    const reportedAt = Math.floor((now - v.silentForMs) / REPORT_INTERVAL_MS) * REPORT_INTERVAL_MS;
    const travelled = (v.phase * loopM + (reportedAt / 1000) * SPEED_MPS) % loopM;
    const outbound = travelled < geo.lengthM;
    const progressM = outbound ? travelled : loopM - travelled;
    const direction = outbound ? 'outbound' : 'inbound';
    return {
      vehicleId: `sample-${route.number}-${v.suffix}`,
      routeId: route.number,
      plate: plateFor(route, v.suffix, i),
      saccoName: DEMO_SACCO,
      direction,
      position: geo.pointAt(progressM),
      progressM,
      lastStageIndex: geo.lastStageIndex(progressM, direction),
      lastReportAt: new Date(reportedAt).toISOString(),
      source: 'sample',
      onShift: v.onShift,
    } satisfies VehicleStatus;
  });
  return crew ? [crew, ...fleet] : fleet;
}

/**
 * The vehicle a demo crew member started a shift on (see the /crew screen).
 * It leaves its starting terminus when the shift starts and shuttles at
 * sample speed, reporting every 5 s.
 */
function crewVehicle(route: Route, now: number): VehicleStatus | null {
  const shift = readCrewShift();
  if (!shift || shift.routeNumber !== route.number) return null;
  const geo = routeGeometry(route);
  const loopM = geo.lengthM * 2;
  const reportedAt = Math.max(shift.startedAt, Math.floor(now / 5000) * 5000);
  const start = shift.direction === 'outbound' ? 0 : geo.lengthM;
  const travelled = (start + ((reportedAt - shift.startedAt) / 1000) * SPEED_MPS) % loopM;
  const outbound = travelled < geo.lengthM;
  const progressM = outbound ? travelled : loopM - travelled;
  const direction = outbound ? 'outbound' : 'inbound';
  return {
    vehicleId: `crew-${shift.plate.replace(/\s+/g, '')}`,
    routeId: route.number,
    plate: shift.plate,
    saccoName: DEMO_SACCO,
    direction,
    position: geo.pointAt(progressM),
    progressM,
    lastStageIndex: geo.lastStageIndex(progressM, direction),
    lastReportAt: new Date(reportedAt).toISOString(),
    source: 'sample',
    onShift: true,
  };
}
