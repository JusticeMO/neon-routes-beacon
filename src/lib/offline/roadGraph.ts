/**
 * Offline road graph for Nairobi (built by scripts/map-pack/build.py from OpenStreetMap
 * data) and the base routing algorithm: A* over the road network.
 *
 * File layout of roads.pack after gunzip (little endian):
 *   header   "BRG1", nodeCount, edgeCount, geomCount, nameCount, nameBytes (u32 each)
 *   nodes    i32[2 * nodeCount]  lng, lat in micro-degrees
 *   from     u32[edgeCount]
 *   to       u32[edgeCount]
 *   length   f32[edgeCount]      metres
 *   gStart   u32[edgeCount]      first intermediate point in geom
 *   geom     i32[2 * geomCount]  intermediate points of every edge, micro-degrees
 *   gLen     u16[edgeCount]      number of intermediate points
 *   name     u16[edgeCount]      index into names, 0xFFFF = unnamed
 *   class    u8[edgeCount]       index into ROAD_CLASSES
 *   flags    u8[edgeCount]       1 car forward, 2 car backward, 4 walking
 *   (pad to 4 bytes) names      UTF-8, newline separated
 */

export const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
  'living_street', 'service', 'track', 'unknown', 'path', 'footway', 'steps', 'pedestrian', 'cycleway'] as const;

export type Profile = 'drive' | 'walk';
export interface LatLng { lat: number; lng: number }

/** City driving speeds by road class, km/h. Deliberately modest: Nairobi traffic. */
const DRIVE_KMH = [70, 55, 40, 35, 30, 25, 20, 10, 12, 10, 18, 0, 0, 0, 0, 0];
const WALK_KMH = 4.8;
const MAX_DRIVE_MPS = 70 / 3.6;
const NO_NAME = 0xffff;
const CELL = 0.004; // grid cell for snapping, degrees (~450 m)

export interface RoadGraph {
  nodeCount: number;
  edgeCount: number;
  nodeLng: Float64Array;
  nodeLat: Float64Array;
  eFrom: Uint32Array;
  eTo: Uint32Array;
  eLen: Float32Array;
  eGeomStart: Uint32Array;
  eGeomLen: Uint16Array;
  geom: Int32Array;
  eName: Uint16Array;
  eCls: Uint8Array;
  eFlags: Uint8Array;
  names: string[];
  /** Undirected adjacency in CSR form: edges touching node n are adjEdge[adjStart[n] .. adjStart[n + 1]). */
  adjStart: Uint32Array;
  adjEdge: Uint32Array;
  grid: Map<number, number[]>;
}

export function parseRoadGraph(buf: ArrayBuffer): RoadGraph {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'BRG1') throw new Error('Not a Beacon road graph');
  const [nodeCount, edgeCount, geomCount, , nameBytes] = [4, 8, 12, 16, 20].map(o => dv.getUint32(o, true));
  let off = 24;
  const take = <T>(Ctor: { new (b: ArrayBuffer, o: number, n: number): T; BYTES_PER_ELEMENT: number }, n: number): T => {
    const a = new Ctor(buf, off, n);
    off += n * Ctor.BYTES_PER_ELEMENT;
    return a;
  };
  const nodes = take(Int32Array, nodeCount * 2);
  const eFrom = take(Uint32Array, edgeCount);
  const eTo = take(Uint32Array, edgeCount);
  const eLen = take(Float32Array, edgeCount);
  const eGeomStart = take(Uint32Array, edgeCount);
  const geom = take(Int32Array, geomCount * 2);
  const eGeomLen = take(Uint16Array, edgeCount);
  const eName = take(Uint16Array, edgeCount);
  const eCls = take(Uint8Array, edgeCount);
  const eFlags = take(Uint8Array, edgeCount);
  off += (4 - (off % 4)) % 4;
  const names = new TextDecoder().decode(new Uint8Array(buf, off, nameBytes)).split('\n');

  const nodeLng = new Float64Array(nodeCount);
  const nodeLat = new Float64Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    nodeLng[i] = nodes[2 * i] / 1e6;
    nodeLat[i] = nodes[2 * i + 1] / 1e6;
  }

  const degree = new Uint32Array(nodeCount + 1);
  for (let e = 0; e < edgeCount; e++) { degree[eFrom[e] + 1]++; degree[eTo[e] + 1]++; }
  for (let i = 0; i < nodeCount; i++) degree[i + 1] += degree[i];
  const adjStart = degree;
  const fill = adjStart.slice(0, nodeCount);
  const adjEdge = new Uint32Array(edgeCount * 2);
  for (let e = 0; e < edgeCount; e++) { adjEdge[fill[eFrom[e]]++] = e; adjEdge[fill[eTo[e]]++] = e; }

  const g: RoadGraph = { nodeCount, edgeCount, nodeLng, nodeLat, eFrom, eTo, eLen, eGeomStart, eGeomLen, geom, eName, eCls, eFlags, names, adjStart, adjEdge, grid: new Map() };
  for (let e = 0; e < edgeCount; e++) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of edgeCoords(g, e)) {
      minX = Math.min(minX, p.lng); maxX = Math.max(maxX, p.lng);
      minY = Math.min(minY, p.lat); maxY = Math.max(maxY, p.lat);
    }
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cy = Math.floor(minY / CELL); cy <= Math.floor(maxY / CELL); cy++) {
        const k = cellKey(cx, cy);
        const list = g.grid.get(k);
        if (list) list.push(e); else g.grid.set(k, [e]);
      }
    }
  }
  return g;
}

const cellKey = (cx: number, cy: number) => (cx + 100_000) * 200_000 + (cy + 100_000);

/** Full polyline of an edge, from its `from` node to its `to` node. */
export function edgeCoords(g: RoadGraph, e: number): LatLng[] {
  const out: LatLng[] = [{ lat: g.nodeLat[g.eFrom[e]], lng: g.nodeLng[g.eFrom[e]] }];
  const s = g.eGeomStart[e];
  for (let i = 0; i < g.eGeomLen[e]; i++) out.push({ lat: g.geom[2 * (s + i) + 1] / 1e6, lng: g.geom[2 * (s + i)] / 1e6 });
  out.push({ lat: g.nodeLat[g.eTo[e]], lng: g.nodeLng[g.eTo[e]] });
  return out;
}

export const roadName = (g: RoadGraph, e: number): string | null => (g.eName[e] === NO_NAME ? null : g.names[g.eName[e]]);
export const roadClass = (g: RoadGraph, e: number) => ROAD_CLASSES[g.eCls[e]];

function allowed(g: RoadGraph, e: number, profile: Profile, forward: boolean): boolean {
  const f = g.eFlags[e];
  if (profile === 'walk') return (f & 4) !== 0;
  return (f & (forward ? 1 : 2)) !== 0;
}

function speedMps(g: RoadGraph, e: number, profile: Profile): number {
  if (profile === 'walk') return (g.eCls[e] === 13 ? 3 : WALK_KMH) / 3.6;
  return DRIVE_KMH[g.eCls[e]] / 3.6;
}

// Local flat-earth metres; accurate to well under 1% across the Nairobi area.
const KLAT = 111_320;
const KLNG = 111_320 * Math.cos((-1.28 * Math.PI) / 180);
const dist = (a: LatLng, b: LatLng) => Math.hypot((a.lng - b.lng) * KLNG, (a.lat - b.lat) * KLAT);

export interface Snap {
  edge: number;
  /** Metres along the edge from its `from` node. */
  along: number;
  point: LatLng;
  /** Metres from the query point to the road. */
  distM: number;
}

/**
 * Nearest road usable by `profile` (or any road when profile is omitted), within maxM metres.
 * `accept` can narrow it further, for example to named roads only.
 */
export function snap(g: RoadGraph, p: LatLng, profile?: Profile, maxM = 1500, accept?: (e: number) => boolean): Snap | null {
  const cx = Math.floor(p.lng / CELL), cy = Math.floor(p.lat / CELL);
  let best: Snap | null = null;
  const seen = new Set<number>();
  const maxRing = Math.ceil(maxM / (CELL * KLNG)) + 1;
  for (let r = 0; r <= maxRing; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        for (const e of g.grid.get(cellKey(cx + dx, cy + dy)) ?? []) {
          if (seen.has(e)) continue;
          seen.add(e);
          if (profile && !allowed(g, e, profile, true) && !allowed(g, e, profile, false)) continue;
          if (accept && !accept(e)) continue;
          const s = nearestOnEdge(g, e, p);
          if (s.distM <= maxM && (!best || s.distM < best.distM)) best = s;
        }
      }
    }
    // Anything in ring r+1 is at least r cells away.
    if (best && best.distM < r * CELL * KLAT) break;
  }
  return best;
}

function nearestOnEdge(g: RoadGraph, e: number, p: LatLng): Snap {
  const pts = edgeCoords(g, e);
  let best: Snap = { edge: e, along: 0, point: pts[0], distM: Infinity };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ax = a.lng * KLNG, ay = a.lat * KLAT, bx = b.lng * KLNG, by = b.lat * KLAT;
    const px = p.lng * KLNG, py = p.lat * KLAT;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const q = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const d = dist(p, q);
    const segLen = Math.sqrt(len2);
    if (d < best.distM) best = { edge: e, along: acc + segLen * t, point: q, distM: d };
    acc += segLen;
  }
  // Scale to the stored length so partial costs line up with whole edges.
  if (acc > 0) best.along *= g.eLen[e] / acc;
  return best;
}

/** Part of an edge's polyline between two distances along it (from <= to, both in metres from the `from` node). */
function edgeSlice(g: RoadGraph, e: number, fromM: number, toM: number): LatLng[] {
  const pts = edgeCoords(g, e);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const scale = cum[cum.length - 1] / (g.eLen[e] || 1);
  const at = (m: number): LatLng => {
    const d = m * scale;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return { lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t, lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * t };
  };
  const out = [at(fromM)];
  for (let i = 1; i < pts.length - 1; i++) if (cum[i] > fromM * scale && cum[i] < toM * scale) out.push(pts[i]);
  out.push(at(toM));
  return out;
}

/** Binary min-heap of node ids keyed by a Float64 score. */
class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() { return this.ids.length; }
  push(id: number, key: number) {
    const { ids, keys } = this;
    let i = ids.length;
    ids.push(id); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p]; i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop(): number {
    const { ids, keys } = this;
    const top = ids[0];
    const id = ids.pop()!, key = keys.pop()!;
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        ids[i] = ids[c]; keys[i] = keys[c]; i = c;
      }
      ids[i] = id; keys[i] = key;
    }
    return top;
  }
}

export interface RouteStep { name: string | null; distanceM: number }
export interface RouteResult {
  profile: Profile;
  path: LatLng[];
  distanceM: number;
  durationS: number;
  /** Consecutive stretches of the same road, for a short "via" summary. */
  steps: RouteStep[];
  from: Snap;
  to: Snap;
  /** Nodes the search settled: a rough measure of work done. */
  visited: number;
}

/**
 * A* over the road graph from `a` to `b`. Costs are travel time; the heuristic is
 * straight-line distance at the profile's top speed, so it never overestimates and the
 * route found is the fastest one in the graph.
 */
export function findRoute(g: RoadGraph, a: LatLng, b: LatLng, profile: Profile): RouteResult | null {
  const from = snap(g, a, profile);
  const to = snap(g, b, profile);
  if (!from || !to) return null;
  const vmax = profile === 'walk' ? WALK_KMH / 3.6 : MAX_DRIVE_MPS;
  const target = to.point;
  const h = (n: number) => dist({ lat: g.nodeLat[n], lng: g.nodeLng[n] }, target) / vmax;

  const cost = new Float64Array(g.nodeCount).fill(Infinity);
  const prevEdge = new Int32Array(g.nodeCount).fill(-1);
  const done = new Uint8Array(g.nodeCount);
  const heap = new Heap();

  // Leave the start edge towards either end, as far as one-way rules allow.
  const fe = from.edge;
  const startLinks: [number, number][] = [];
  if (allowed(g, fe, profile, true)) startLinks.push([g.eTo[fe], (g.eLen[fe] - from.along) / speedMps(g, fe, profile)]);
  if (allowed(g, fe, profile, false)) startLinks.push([g.eFrom[fe], from.along / speedMps(g, fe, profile)]);
  for (const [n, c] of startLinks) {
    if (c < cost[n]) { cost[n] = c; prevEdge[n] = -2; heap.push(n, c + h(n)); }
  }

  // Arrive on the target edge from either end.
  const te = to.edge;
  const endFrom = allowed(g, te, profile, true) ? to.along / speedMps(g, te, profile) : Infinity; // enter at from-node
  const endTo = allowed(g, te, profile, false) ? (g.eLen[te] - to.along) / speedMps(g, te, profile) : Infinity; // enter at to-node

  let best = Infinity;
  let bestEnd = -1;
  let arrivesAtFrom = false;
  // Same edge, no node in between.
  if (fe === te) {
    const fwd = to.along >= from.along;
    if (allowed(g, fe, profile, fwd)) { best = Math.abs(to.along - from.along) / speedMps(g, fe, profile); bestEnd = -3; }
  }

  let visited = 0;
  while (heap.size) {
    const n = heap.pop();
    if (done[n]) continue;
    done[n] = 1;
    visited++;
    if (cost[n] + h(n) >= best) break;
    if (n === g.eFrom[te] && cost[n] + endFrom < best) { best = cost[n] + endFrom; bestEnd = n; arrivesAtFrom = true; }
    if (n === g.eTo[te] && cost[n] + endTo < best) { best = cost[n] + endTo; bestEnd = n; arrivesAtFrom = false; }
    for (let i = g.adjStart[n]; i < g.adjStart[n + 1]; i++) {
      const e = g.adjEdge[i];
      const forward = g.eFrom[e] === n;
      if (!allowed(g, e, profile, forward)) continue;
      const m = forward ? g.eTo[e] : g.eFrom[e];
      if (done[m]) continue;
      const c = cost[n] + g.eLen[e] / speedMps(g, e, profile);
      if (c < cost[m]) { cost[m] = c; prevEdge[m] = e; heap.push(m, c + h(m)); }
    }
  }
  if (bestEnd === -1) return null;

  // Walk back from the arrival node to the start edge.
  const pieces: { edge: number; coords: LatLng[]; len: number }[] = [];
  if (bestEnd === -3) {
    const lo = Math.min(from.along, to.along), hi = Math.max(from.along, to.along);
    const c = edgeSlice(g, fe, lo, hi);
    pieces.push({ edge: fe, coords: to.along >= from.along ? c : c.reverse(), len: hi - lo });
  } else {
    const tail = arrivesAtFrom ? edgeSlice(g, te, 0, to.along) : edgeSlice(g, te, to.along, g.eLen[te]).reverse();
    pieces.push({ edge: te, coords: tail, len: arrivesAtFrom ? to.along : g.eLen[te] - to.along });
    let n = bestEnd;
    while (prevEdge[n] >= 0) {
      const e = prevEdge[n];
      const forward = g.eTo[e] === n;
      const c = edgeCoords(g, e);
      pieces.push({ edge: e, coords: forward ? c : c.reverse(), len: g.eLen[e] });
      n = forward ? g.eFrom[e] : g.eTo[e];
    }
    const leftViaTo = n === g.eTo[fe];
    const head = leftViaTo ? edgeSlice(g, fe, from.along, g.eLen[fe]) : edgeSlice(g, fe, 0, from.along).reverse();
    pieces.push({ edge: fe, coords: head, len: leftViaTo ? g.eLen[fe] - from.along : from.along });
    pieces.reverse();
  }

  const path: LatLng[] = [];
  const steps: RouteStep[] = [];
  let distanceM = 0;
  for (const p of pieces) {
    for (const c of p.coords) {
      const last = path[path.length - 1];
      if (!last || last.lat !== c.lat || last.lng !== c.lng) path.push(c);
    }
    distanceM += p.len;
    const name = roadName(g, p.edge);
    const prev = steps[steps.length - 1];
    if (prev && prev.name === name) prev.distanceM += p.len;
    else steps.push({ name, distanceM: p.len });
  }
  return { profile, path, distanceM, durationS: best, steps, from, to, visited };
}

/** Road names containing every word of the query (prefix match per word), with a point on each road. */
export function searchRoads(g: RoadGraph, query: string, limit = 5): { name: string; point: LatLng }[] {
  const words = normalise(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const hits: number[] = [];
  g.names.forEach((n, i) => {
    const toks = normalise(n).split(' ');
    if (words.every(w => toks.some(t => t.startsWith(w)))) hits.push(i);
  });
  const out: { name: string; point: LatLng }[] = [];
  for (const i of hits.slice(0, limit)) {
    let e = 0;
    while (e < g.edgeCount && g.eName[e] !== i) e++;
    if (e < g.edgeCount) out.push({ name: g.names[i], point: edgeCoords(g, e)[0] });
  }
  return out;
}

export function normalise(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
