import type { Route } from '@/data/routes';

export interface StageRef {
  route: Route;
  stageIndex: number;
}

/** Stable, shareable id for a stage: "<route number>-<stage slug>". */
export function stageId(route: Route, stageIndex: number): string {
  const slug = route.stops[stageIndex].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${route.number}-${slug}`;
}

/**
 * Reads `?route=<number>` and `?stage=<stage id>` from a query string.
 * Unknown ids resolve to null so the UI can fall back to the selector.
 */
export function parseDeepLink(search: string, routes: Route[]): { route: Route | null; stage: StageRef | null; invalid: boolean } {
  const params = new URLSearchParams(search);
  const stageParam = params.get('stage');
  const routeParam = params.get('route');
  if (stageParam) {
    for (const route of routes) {
      const i = route.stops.findIndex((_, idx) => stageId(route, idx) === stageParam);
      if (i >= 0) return { route, stage: { route, stageIndex: i }, invalid: false };
    }
  }
  if (routeParam) {
    const route = routes.find(r => r.number === routeParam) ?? null;
    if (route) return { route, stage: null, invalid: Boolean(stageParam) };
  }
  return { route: null, stage: null, invalid: Boolean(stageParam || routeParam) };
}

export function buildShareUrl(origin: string, ref: StageRef): string {
  return `${origin}/?stage=${encodeURIComponent(stageId(ref.route, ref.stageIndex))}`;
}
