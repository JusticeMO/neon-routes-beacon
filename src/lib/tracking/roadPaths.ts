import { useSyncExternalStore } from 'react';
import { nairobiRoutes } from '@/data/routes';
import type { LatLng } from './geo';

/**
 * Road-following geometry for each route. The hand-drawn paths in
 * data/routes.ts only connect the stages roughly; when a Google Maps key is
 * set, each route is snapped to real roads with Google directions through its
 * stages and the result replaces the route's path, so lines and matatus follow
 * the streets. Results are cached in this browser for a week.
 */
const KEY = 'beacon.roadPaths.v1';
const MAX_AGE_MS = 7 * 24 * 3_600_000;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach(l => l());
}

export function useRoadPathsVersion(): number {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => version,
  );
}

type Cache = Record<string, { at: number; path: LatLng[] }>;

function readCache(): Cache {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Cache; } catch { return {}; }
}

export function setRoadPath(routeNumber: string, path: LatLng[]) {
  const route = nairobiRoutes.find(r => r.number === routeNumber);
  if (!route || path.length < 2) return;
  route.path = path;
  try {
    const c = readCache();
    c[routeNumber] = { at: Date.now(), path };
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch { /* storage blocked: keep it in memory */ }
  emit();
}

export function hasFreshRoadPath(routeNumber: string): boolean {
  const e = readCache()[routeNumber];
  return Boolean(e && Date.now() - e.at < MAX_AGE_MS);
}

/** Apply cached road paths at startup, before anything renders. */
export function applyCachedRoadPaths() {
  const c = readCache();
  for (const route of nairobiRoutes) {
    const e = c[route.number];
    if (e && Date.now() - e.at < MAX_AGE_MS && e.path.length > 1) route.path = e.path;
  }
}
