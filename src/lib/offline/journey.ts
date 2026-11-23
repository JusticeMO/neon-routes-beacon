/**
 * "Trip to town" from any spot, offline: walk to the nearest Beacon stage on the road
 * network, then ride that SACCO route to its CBD terminus. A small first step towards the
 * full matatu journey planner in docs/BACKEND-PLAN.md section 6A.
 */
import type { Route } from '@/data/routes';
import { cumulativeDistances, progressOf } from '@/lib/tracking/geo';
import { stagesNear, type NearbyStage } from './places';
import { route as findRoute, type TimedRoute } from './router';
import type { LatLng } from './roadGraph';

/** Typical matatu speed along a route including stops, m/s (about 15 km/h). */
export const MATATU_MPS = 4.2;

export interface RideLeg { route: Route; from: string; to: string; path: LatLng[]; distanceM: number; durationS: number }
export interface Journey { stage: NearbyStage; walk: TimedRoute; ride: RideLeg; totalS: number }

/** Part of a route's path between two stage indexes, in travel order. */
export function ridePath(route: Route, fromIndex: number, toIndex: number): { path: LatLng[]; distanceM: number } {
  const cum = cumulativeDistances(route.path);
  const a = progressOf(route.path, cum, route.stops[fromIndex]);
  const b = progressOf(route.path, cum, route.stops[toIndex]);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const inside = route.path.filter((_, i) => cum[i] > lo && cum[i] < hi);
  const path = [route.stops[a <= b ? fromIndex : toIndex], ...inside, route.stops[a <= b ? toIndex : fromIndex]].map(p => ({ lat: p.lat, lng: p.lng }));
  return { path: a <= b ? path : path.reverse(), distanceM: hi - lo };
}

/** Best trip to the CBD from `p`, or null when no Beacon stage is within walking distance. */
export async function tripToTown(p: LatLng, routes: Route[]): Promise<Journey | null> {
  const candidates = stagesNear(p, routes, 1500, 3).filter(s => s.serves.some(x => x.stageIndex > 0));
  let best: Journey | null = null;
  for (const stage of candidates) {
    const walk = await findRoute(p, stage.point, 'walk');
    if (!walk) continue;
    for (const { route, stageIndex } of stage.serves) {
      if (stageIndex === 0) continue;
      const { path, distanceM } = ridePath(route, stageIndex, 0);
      const ride: RideLeg = { route, from: stage.name, to: route.stops[0].name, path, distanceM, durationS: distanceM / MATATU_MPS };
      const totalS = walk.durationS + ride.durationS;
      if (!best || totalS < best.totalS) best = { stage, walk, ride, totalS };
    }
  }
  return best;
}
