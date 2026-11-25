import type { Route } from '@/data/routes';
import { cumulativeDistances, progressOf, pointAlong, type LatLng } from './geo';

export interface RouteGeometry {
  cum: number[];
  lengthM: number;
  /** Metres along the line of each stage, same order as route.stops. */
  stageProgressM: number[];
  pointAt: (progressM: number) => LatLng;
  /** Index of the last stage at or behind `progressM` for a direction. */
  lastStageIndex: (progressM: number, direction: 'outbound' | 'inbound') => number;
}

// Keyed by the path array, so replacing a route's path (snapping it to roads) recomputes.
const cache = new WeakMap<object, RouteGeometry>();

export function routeGeometry(route: Route): RouteGeometry {
  const key = route.path;
  const hit = cache.get(key);
  if (hit) return hit;
  const cum = cumulativeDistances(route.path);
  const stageProgressM = route.stops.map(s => progressOf(route.path, cum, s));
  const geo: RouteGeometry = {
    cum,
    lengthM: cum[cum.length - 1],
    stageProgressM,
    pointAt: p => pointAlong(route.path, cum, p),
    lastStageIndex: (p, direction) => {
      if (direction === 'outbound') {
        let idx = 0;
        stageProgressM.forEach((sp, i) => { if (sp <= p + 1) idx = i; });
        return idx;
      }
      let idx = stageProgressM.length - 1;
      for (let i = stageProgressM.length - 1; i >= 0; i--) if (stageProgressM[i] >= p - 1) idx = i;
      return idx;
    },
  };
  cache.set(key, geo);
  return geo;
}

/** Destination label for a direction, e.g. "Kawangware" or "Kencom". */
export function directionLabel(route: Route, direction: 'outbound' | 'inbound'): string {
  return direction === 'outbound' ? route.stops[route.stops.length - 1].name : route.stops[0].name;
}

/**
 * Points along the route behind a vehicle, oldest first, ending at its
 * position. Used to draw the glowing trail on the map. Follows the route line
 * rather than past GPS fixes, so it is a visual cue of direction, not history.
 */
export function trailBehind(
  route: Route,
  progressM: number,
  direction: 'outbound' | 'inbound',
  lengthM = 450,
  stepM = 30,
): { lat: number; lng: number }[] {
  const geo = routeGeometry(route);
  const sign = direction === 'outbound' ? -1 : 1;
  const pts = [];
  for (let d = lengthM; d >= 0; d -= stepM) {
    const p = progressM + sign * d;
    if (p < 0 || p > geo.lengthM) continue;
    pts.push(geo.pointAt(p));
  }
  return pts;
}
