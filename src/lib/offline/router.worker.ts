/// <reference lib="webworker" />
/** Runs the road graph and A* off the main thread so the map never stutters. */
import { findRoute, parseRoadGraph, roadName, searchRoads, snap, type RoadGraph } from './roadGraph';
import type { RouterRequest, RouterResponse } from './router';

let graph: Promise<RoadGraph> | null = null;

async function load(url: string): Promise<RoadGraph> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Road graph: HTTP ${r.status}`);
  const stream = r.body!.pipeThrough(new DecompressionStream('gzip'));
  return parseRoadGraph(await new Response(stream).arrayBuffer());
}

self.onmessage = async (ev: MessageEvent<RouterRequest>) => {
  const req = ev.data;
  const reply = (res: Omit<RouterResponse, 'id'>) => (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id: req.id, ...res });
  try {
    if (req.type === 'load') {
      graph ??= load(req.url);
      graph.catch(() => { graph = null; });
      const g = await graph;
      reply({ ok: true, result: { nodes: g.nodeCount, edges: g.edgeCount } });
      return;
    }
    if (!graph) throw new Error('Road graph not loaded');
    const g = await graph;
    if (req.type === 'route') {
      const t = performance.now();
      const result = findRoute(g, req.from, req.to, req.profile);
      reply({ ok: true, result: result && { ...result, ms: Math.round(performance.now() - t) } });
    } else if (req.type === 'road') {
      const s = snap(g, req.point, undefined, 400, e => roadName(g, e) !== null);
      reply({ ok: true, result: s && { name: roadName(g, s.edge), distM: s.distM } });
    } else if (req.type === 'searchRoads') {
      reply({ ok: true, result: searchRoads(g, req.query, req.limit) });
    }
  } catch (e) {
    reply({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
