/**
 * Matatu journeys between two places, worked out on the phone: walk to a Beacon stage on the
 * road network, ride one SACCO route, walk to the destination. A first step towards the full
 * journey planner in docs/BACKEND-PLAN.md section 6A (transfers come later).
 *
 * Used for "trip to town" from any spot, and for "getting to this home" from Sakafind, where
 * the directions (route, stages, walk and fare) can be shared as a link.
 */
import type { Route } from '@/data/routes';
import { cumulativeDistances, progressOf } from '@/lib/tracking/geo';
import { fareFor, isPeak } from '@/lib/demo/demoMode';
import { distM, stagesNear, type NearbyStage } from './places';
import { route as findRoute, type TimedRoute } from './router';
import type { LatLng } from './roadGraph';

/** Typical matatu speed along a route including stops, m/s (about 15 km/h). */
export const MATATU_MPS = 4.2;
/** Furthest we suggest walking to or from a stage. */
export const MAX_WALK_M = 1500;

export interface RideLeg {
  route: Route;
  fromIndex: number;
  toIndex: number;
  from: string;
  to: string;
  path: LatLng[];
  distanceM: number;
  durationS: number;
  /** Usual fare in KSh right now (SACCO fares change with peak hours). */
  fareKsh: number;
  peak: boolean;
}
export interface Journey {
  /** Walk to the boarding stage; null when starting at the stage (from town). */
  walkIn: TimedRoute | null;
  ride: RideLeg;
  /** Walk from the alighting stage to the destination; null when ending at the stage. */
  walkOut: TimedRoute | null;
  totalS: number;
  /** Boarding stage of the first ride. */
  stage: NearbyStage;
  /**
   * Second matatu, changing in town: most Nairobi routes run into the CBD, so a trip across
   * town is usually two routes with a short walk between termini. `ride` then ends in town.
   */
  change?: { walk: TimedRoute | null; ride: RideLeg };
  /** Fare for the whole trip in KSh. */
  fareKsh: number;
}

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

export function rideLeg(route: Route, fromIndex: number, toIndex: number, now = Date.now()): RideLeg {
  const { path, distanceM } = ridePath(route, fromIndex, toIndex);
  return {
    route, fromIndex, toIndex, from: route.stops[fromIndex].name, to: route.stops[toIndex].name,
    path, distanceM, durationS: distanceM / MATATU_MPS, fareKsh: fareFor(route.number, now), peak: isPeak(now),
  };
}

/** Where a journey starts: a point (walk to a stage first) or "town", meaning any route's CBD terminus. */
export type Origin = { kind: 'point'; point: LatLng } | { kind: 'town' };

const asStage = (route: Route, i: number, p?: LatLng): NearbyStage => {
  const s = route.stops[i];
  return { name: s.name, point: { lat: s.lat, lng: s.lng }, distM: p ? distM(p, s) : 0, direction: '', serves: [{ route, stageIndex: i }] };
};

/**
 * Fastest one-route matatu journey from `origin` to `dest`, or null when no single Beacon route
 * links stages within walking distance of both. Walks are on the road network.
 */
export async function planJourney(origin: Origin, dest: LatLng | 'town', routes: Route[], now = Date.now()): Promise<Journey | null> {
  // Boarding options: (route, stage index), with the stage for display.
  const boards: { route: Route; i: number; stage: NearbyStage }[] = [];
  if (origin.kind === 'town') routes.forEach(r => boards.push({ route: r, i: 0, stage: asStage(r, 0) }));
  else stagesNear(origin.point, routes, MAX_WALK_M, 4).forEach(s => s.serves.forEach(x => boards.push({ route: x.route, i: x.stageIndex, stage: s })));

  const alights = (route: Route): number[] =>
    dest === 'town' ? [0] : route.stops.map((s, j) => (distM(dest, s) <= MAX_WALK_M ? j : -1)).filter(j => j >= 0);

  // Rank by a straight-line estimate first, then walk the road network only for the best few.
  const est = (route: Route, i: number, j: number) => {
    const walkIn = origin.kind === 'point' ? distM(origin.point, route.stops[i]) * 1.3 / (4.8 / 3.6) : 0;
    const walkOut = dest === 'town' ? 0 : distM(dest, route.stops[j]) * 1.3 / (4.8 / 3.6);
    return walkIn + walkOut + ridePath(route, i, j).distanceM / MATATU_MPS;
  };
  const options = boards
    .flatMap(b => alights(b.route).filter(j => j !== b.i).map(j => ({ ...b, j, est: est(b.route, b.i, j) })))
    .sort((a, b) => a.est - b.est)
    .slice(0, 4);

  let best: Journey | null = null;
  const walks = new Map<string, TimedRoute | null>();
  const walk = async (a: LatLng, b: LatLng) => {
    const k = `${a.lat},${a.lng}>${b.lat},${b.lng}`;
    if (!walks.has(k)) walks.set(k, await findRoute(a, b, 'walk'));
    return walks.get(k)!;
  };
  for (const o of options) {
    const s = o.route.stops;
    const walkIn = origin.kind === 'point' ? await walk(origin.point, s[o.i]) : null;
    const walkOut = dest === 'town' ? null : await walk(s[o.j], dest);
    if ((origin.kind === 'point' && !walkIn) || (dest !== 'town' && !walkOut)) continue;
    const ride = rideLeg(o.route, o.i, o.j, now);
    const totalS = (walkIn?.durationS ?? 0) + ride.durationS + (walkOut?.durationS ?? 0);
    if (!best || totalS < best.totalS) best = { walkIn, ride, walkOut, totalS, stage: o.stage, fareKsh: ride.fareKsh };
  }
  if (best || origin.kind === 'town' || dest === 'town') return best;
  return changeInTown(origin.point, dest, routes, now);
}

/** Two matatus: into town on one route, out on another, walking between the two termini. */
async function changeInTown(from: LatLng, to: LatLng, routes: Route[], now: number): Promise<Journey | null> {
  const [inbound, outbound] = await Promise.all([planJourney({ kind: 'point', point: from }, 'town', routes, now), planJourney({ kind: 'town' }, to, routes, now)]);
  if (!inbound || !outbound) return null;
  const a = inbound.ride.path[inbound.ride.path.length - 1];
  const b = outbound.ride.path[0];
  const walk = distM(a, b) > 30 ? await findRoute(a, b, 'walk') : null;
  if (distM(a, b) > 30 && !walk) return null;
  return {
    walkIn: inbound.walkIn,
    ride: inbound.ride,
    change: { walk, ride: outbound.ride },
    walkOut: outbound.walkOut,
    stage: inbound.stage,
    totalS: inbound.totalS + (walk?.durationS ?? 0) + outbound.totalS,
    fareKsh: inbound.ride.fareKsh + outbound.ride.fareKsh,
  };
}

/** Walk to the nearest stage and ride to its CBD terminus. */
export function tripToTown(p: LatLng, routes: Route[]): Promise<Journey | null> {
  return planJourney({ kind: 'point', point: p }, 'town', routes);
}

const minutesText = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;
const metres = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** Plain-text directions for sharing (WhatsApp, SMS), ending with the link. */
export function journeyText(j: Journey, destLabel: string, link: string): string {
  const lines = [`Getting to ${destLabel} by matatu:`];
  if (j.walkIn) lines.push(`• Walk ${metres(j.walkIn.distanceM)} to ${j.ride.from} stage`);
  for (const r of [j.ride, j.change?.ride].filter((x): x is RideLeg => Boolean(x))) {
    if (r === j.change?.ride && j.change.walk) lines.push(`• Walk ${metres(j.change.walk.distanceM)} to ${r.from} stage`);
    lines.push(`• Board route ${r.route.number} (${r.route.name}) at ${r.from}, alight at ${r.to}. Fare about KSh ${r.fareKsh}${r.peak ? ' (peak)' : ''}.`);
  }
  if (j.walkOut) lines.push(`• Walk ${metres(j.walkOut.distanceM)} (${minutesText(j.walkOut.durationS)}) to ${destLabel}`);
  lines.push(`About ${minutesText(j.totalS)} in all, plus waiting time.`, `Map and live matatus: ${link}`);
  return lines.join('\n');
}
