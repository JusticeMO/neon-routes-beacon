/**
 * Offline reverse geocoding and search: "what is this spot, and what is around it?"
 * Works from places.pack (areas, wards and landmarks baked from OpenStreetMap data)
 * plus Beacon's own stages. No network needed.
 */
import type { Route } from '@/data/routes';
import { normalise, type LatLng } from './roadGraph';

/** [name, lng, lat, kind] with kind 0 estate (macrohood), 1 neighbourhood, 2 smaller area, 3 town */
export type AreaRow = [string, number, number, number];
/** [name, kind, lng, lat] */
export type PoiRow = [string, string, number, number];
export interface Region { name: string; kind: 'ward' | 'subcounty' | 'county'; rings: [number, number][][] }
export interface Places { v: number; bbox: [number, number, number, number]; areas: AreaRow[]; regions: Region[]; pois: PoiRow[] }

const KLAT = 111_320;
const KLNG = 111_320 * Math.cos((-1.28 * Math.PI) / 180);
export const distM = (a: LatLng, b: LatLng) => Math.hypot((a.lng - b.lng) * KLNG, (a.lat - b.lat) * KLAT);

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Compass direction from a to b, e.g. "north-east". */
export function directionTo(a: LatLng, b: LatLng): string {
  const deg = (Math.atan2((b.lng - a.lng) * KLNG, (b.lat - a.lat) * KLAT) * 180) / Math.PI;
  return COMPASS[Math.round(((deg + 360) % 360) / 45) % 8];
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

function inRing(p: LatLng, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface Nearby { name: string; kind: string; distM: number; direction: string; point: LatLng }
export interface NearbyStage {
  name: string;
  point: LatLng;
  distM: number;
  direction: string;
  /** Routes that stop here, with this stage's index on each. */
  serves: { route: Route; stageIndex: number }[];
}
export interface Identified {
  point: LatLng;
  /** Best-known estate or neighbourhood, e.g. "Kilimani". */
  area: string | null;
  /** A smaller named place inside it, when there is one close by. */
  locality: string | null;
  ward: string | null;
  subcounty: string | null;
  road: { name: string; distM: number } | null;
  landmarks: Nearby[];
  neighbours: Nearby[];
  stages: NearbyStage[];
  inCoverage: boolean;
}

/** Beacon stages near a point, merging the same stage on several routes. */
export function stagesNear(p: LatLng, routes: Route[], radiusM = 1200, limit = 4): NearbyStage[] {
  const found: NearbyStage[] = [];
  routes.forEach(route => route.stops.forEach((s, stageIndex) => {
    const d = distM(p, s);
    if (d > radiusM) return;
    const same = found.find(f => f.name === s.name && distM(f.point, s) < 150);
    if (same) same.serves.push({ route, stageIndex });
    else found.push({ name: s.name, point: { lat: s.lat, lng: s.lng }, distM: d, direction: directionTo(p, s), serves: [{ route, stageIndex }] });
  }));
  return found.sort((a, b) => a.distM - b.distM).slice(0, limit);
}

export function identify(places: Places, p: LatLng, routes: Route[], road?: { name: string; distM: number } | null): Identified {
  const [W, S, E, N] = places.bbox;
  const withDist = places.areas.map(a => ({ a, d: distM(p, { lng: a[1], lat: a[2] }) }));
  const nearestOf = (kinds: number[], maxM: number) =>
    withDist.filter(x => kinds.includes(x.a[3]) && x.d <= maxM).sort((x, y) => x.d - y.d)[0]?.a ?? null;

  const estate = nearestOf([0], 2500) ?? nearestOf([1, 3], 3000);
  const finer = nearestOf([1, 2], 700);
  const area = estate?.[0] ?? null;
  const locality = finer && finer[0] !== area ? finer[0] : null;

  let ward: string | null = null;
  let subcounty: string | null = null;
  for (const r of places.regions) {
    if (!r.rings.some(ring => inRing(p, ring))) continue;
    if (r.kind === 'ward' && !ward) ward = r.name.replace(/ ward$/, '');
    if (r.kind === 'subcounty' && !subcounty) subcounty = r.name;
  }

  const landmarks: Nearby[] = places.pois
    .map(([name, kind, lng, lat]) => ({ name, kind, point: { lat, lng }, distM: distM(p, { lat, lng }), direction: directionTo(p, { lat, lng }) }))
    .filter(x => x.distM <= 600)
    .sort((a, b) => a.distM - b.distM)
    .filter((x, i, arr) => arr.findIndex(y => y.name === x.name) === i)
    .slice(0, 5);

  const neighbours: Nearby[] = withDist
    .filter(x => x.a[3] === 0 && x.a[0] !== area && x.d <= 5000)
    .sort((x, y) => x.d - y.d)
    .slice(0, 4)
    .map(({ a, d }) => ({ name: a[0], kind: 'area', distM: d, point: { lng: a[1], lat: a[2] }, direction: directionTo(p, { lng: a[1], lat: a[2] }) }));

  return {
    point: p, area, locality, ward, subcounty, road: road ?? null, landmarks, neighbours,
    stages: stagesNear(p, routes),
    inCoverage: p.lng >= W && p.lng <= E && p.lat >= S && p.lat <= N,
  };
}

/** One-line description, e.g. "Kilimani, on Argwings Kodhek Rd". */
export function describe(id: Identified): string {
  const parts = [id.locality && id.area ? `${id.locality}, ${id.area}` : id.area ?? id.locality ?? id.ward ?? 'Unnamed area'];
  if (id.road && id.road.distM < 80) parts.push(`on ${id.road.name}`);
  else if (id.road) parts.push(`near ${id.road.name}`);
  return parts.join(', ');
}

export interface SearchHit { name: string; kind: string; detail?: string; point: LatLng; score: number }

// Everyday names that don't match the map's official ones.
const ALIASES: Record<string, string> = {
  knh: 'Kenyatta Hospital', 'kenyatta hosi': 'Kenyatta Hospital', town: 'Kencom', cbd: 'Kencom', tao: 'Kencom',
  'odeon': 'Odeon', 'ambassador': 'Ambassadeur', 'railways': 'Railways',
};

/** Search areas, landmarks and Beacon stages by name, offline. Each query word must start a word of the name. */
export function searchPlaces(places: Places, query: string, routes: Route[], limit = 8): SearchHit[] {
  const q = normalise(ALIASES[normalise(query)] ?? query);
  const words = q.split(' ').filter(Boolean);
  if (!words.length) return [];
  const score = (name: string, weight: number) => {
    const n = normalise(name);
    if (n === q) return 100 + weight;
    const toks = n.split(' ');
    if (!words.every(w => toks.some(t => t.startsWith(w)))) return 0;
    return (n.startsWith(q) ? 60 : 40) + weight - Math.min(10, toks.length);
  };
  const hits: SearchHit[] = [];
  const seenStage = new Set<string>();
  routes.forEach(route => route.stops.forEach(s => {
    const sc = score(s.name, 30);
    if (!sc || seenStage.has(s.name)) return;
    seenStage.add(s.name);
    const serving = routes.filter(r => r.stops.some(x => x.name === s.name)).map(r => r.number);
    hits.push({ name: s.name, kind: 'stage', detail: `Matatu stage · route ${serving.join(', ')}`, point: { lat: s.lat, lng: s.lng }, score: sc });
  }));
  for (const [name, lng, lat, k] of places.areas) {
    const sc = score(name, k === 0 ? 20 : 10);
    if (sc) hits.push({ name, kind: 'area', detail: k === 3 ? 'Town' : 'Area', point: { lat, lng }, score: sc });
  }
  for (const [name, kind, lng, lat] of places.pois) {
    const sc = score(name, 0);
    if (sc) hits.push({ name, kind, detail: kind[0].toUpperCase() + kind.slice(1), point: { lat, lng }, score: sc });
  }
  return hits.sort((a, b) => b.score - a.score).filter((h, i, arr) => arr.findIndex(x => x.name === h.name && x.kind === h.kind) === i).slice(0, limit);
}
