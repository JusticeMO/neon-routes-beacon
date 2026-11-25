/** Main-thread client for the routing worker. */
import type { LatLng, Profile, RouteResult } from './roadGraph';
import { packUrl } from './pack';

export type RouterRequest = { id: number } & (
  | { type: 'load'; url: string }
  | { type: 'route'; from: LatLng; to: LatLng; profile: Profile }
  | { type: 'road'; point: LatLng }
  | { type: 'searchRoads'; query: string; limit?: number }
);
export interface RouterResponse { id: number; ok: boolean; result?: unknown; error?: string }

export type TimedRoute = RouteResult & { ms: number };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let ready: Promise<unknown> | null = null;

type Body<T> = T extends unknown ? Omit<T, 'id'> : never;
function call<T>(msg: Body<RouterRequest>): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./router.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<RouterResponse>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.result);
      else p.reject(new Error(ev.data.error));
    };
  }
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ id, ...msg });
  });
}

/** Load the road graph into the worker (once). Resolves with its size. */
export function loadRouter(): Promise<{ nodes: number; edges: number }> {
  ready ??= packUrl('roads.pack').then(url => call({ type: 'load', url }));
  ready.catch(() => { ready = null; });
  return ready as Promise<{ nodes: number; edges: number }>;
}

export async function route(from: LatLng, to: LatLng, profile: Profile): Promise<TimedRoute | null> {
  await loadRouter();
  return call({ type: 'route', from, to, profile });
}

export async function nearestRoad(point: LatLng): Promise<{ name: string; distM: number } | null> {
  await loadRouter();
  return call({ type: 'road', point });
}

export async function searchRoadNames(query: string, limit = 4): Promise<{ name: string; point: LatLng }[]> {
  await loadRouter();
  return call({ type: 'searchRoads', query, limit });
}
