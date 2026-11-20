import { useEffect, useMemo, useState } from 'react';
import { nairobiRoutes, type Route } from '@/data/routes';
import { sampleVehicles } from '@/data/sampleVehicles';
import type { VehicleStatus } from '@/lib/tracking/vehicleStatus';

/** Current time, re-rendered every `intervalMs` so ages recompute without refetching. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Vehicles on a route as VehicleStatus. Today this reads the sample source;
 * the live source plugs in here.
 */
export function useRouteVehicles(route: Route | null, now: number): VehicleStatus[] {
  // Sample positions only change on each 10 s report, so recompute per second is cheap.
  return useMemo(() => (route ? sampleVehicles(route, now) : []), [route, now]);
}

/** Every route's vehicles, for the overview map, stage boards and the SACCO view. */
export function useAllVehicles(now: number): VehicleStatus[] {
  return useMemo(() => nairobiRoutes.flatMap(r => sampleVehicles(r, now)), [now]);
}
