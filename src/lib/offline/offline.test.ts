import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { nairobiRoutes } from '@/data/routes';
import { findRoute, parseRoadGraph, roadName, snap } from './roadGraph';
import { describe as describeSpot, identify, searchPlaces, type Places } from './places';
import { ridePath } from './journey';
import { animator } from './animate';

const pack = (f: string) => gunzipSync(readFileSync(`public/offline/${f}`));
const buf = pack('roads.pack');
const graph = parseRoadGraph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const places: Places = JSON.parse(pack('places.pack').toString('utf8'));

const KENCOM = { lat: -1.285694, lng: 36.82566 };
const KAWANGWARE = { lat: -1.287065, lng: 36.743236 };
const YAYA = { lat: -1.2925, lng: 36.7876 };

describe('offline road graph', () => {
  it('loads Nairobi roads', () => {
    expect(graph.nodeCount).toBeGreaterThan(100_000);
    expect(graph.names).toContain('Ngong Road');
  });

  it('snaps a point to the nearest road', () => {
    const s = snap(graph, KENCOM, 'drive')!;
    expect(s.distM).toBeLessThan(30);
  });

  it('finds a driving route across town with A*', () => {
    const r = findRoute(graph, KENCOM, KAWANGWARE, 'drive')!;
    expect(r).not.toBeNull();
    // Straight line is about 9.2 km; the road route is longer but not absurdly so.
    expect(r.distanceM).toBeGreaterThan(9_200);
    expect(r.distanceM).toBeLessThan(16_000);
    expect(r.path[0].lat).toBeCloseTo(r.from.point.lat, 6);
    expect(r.path[r.path.length - 1].lng).toBeCloseTo(r.to.point.lng, 6);
    expect(r.durationS).toBeGreaterThan(600);
  });

  it('finds a walking route and it ignores one-way rules', () => {
    const r = findRoute(graph, YAYA, { lat: -1.2995, lng: 36.787 }, 'walk')!;
    expect(r.distanceM).toBeLessThan(2_500);
    expect(r.durationS).toBeCloseTo(r.distanceM / (4.8 / 3.6), -1);
  });

  it('names the road at a spot', () => {
    const s = snap(graph, { lat: -1.3003, lng: 36.7845 }, undefined, 300, e => roadName(graph, e) !== null)!;
    expect(roadName(graph, s.edge)).toMatch(/Ngong/);
  });
});

describe('offline places', () => {
  it('identifies a spot and what is around it', () => {
    const id = identify(places, YAYA, nairobiRoutes, { name: 'Argwings Kodhek Road', distM: 20 });
    expect(['Kilimani', 'Hurlingham']).toContain(id.area);
    expect(id.neighbours.length).toBeGreaterThan(0);
    expect(id.landmarks.length).toBeGreaterThan(0);
    expect(id.stages.some(s => s.name === 'Prestige Plaza')).toBe(true);
    expect(describeSpot(id)).toContain('on Argwings Kodhek Road');
  });

  it('searches by everyday names', () => {
    expect(searchPlaces(places, 'westl', nairobiRoutes)[0].name).toBe('Westlands');
    expect(searchPlaces(places, 'KNH', nairobiRoutes)[0].name).toBe('Kenyatta Hospital');
    expect(searchPlaces(places, 'prestige', nairobiRoutes)[0].kind).toBe('stage');
  });
});

describe('journeys and animation', () => {
  it('rides a route from a stage back to the CBD terminus', () => {
    const r46 = nairobiRoutes.find(r => r.number === '46')!;
    const { path, distanceM } = ridePath(r46, r46.stops.length - 1, 0);
    expect(path[0].lat).toBeCloseTo(r46.stops[r46.stops.length - 1].lat, 5);
    expect(path[path.length - 1].lat).toBeCloseTo(r46.stops[0].lat, 5);
    expect(distanceM).toBeGreaterThan(10_000);
  });

  it('moves a marker along a path with a heading', () => {
    const a = animator([{ lat: -1.3, lng: 36.8 }, { lat: -1.29, lng: 36.8 }]);
    expect(a.totalM).toBeGreaterThan(1_000);
    const mid = a.at(a.totalM / 2);
    expect(mid.point.lat).toBeCloseTo(-1.295, 3);
    expect(mid.bearing).toBeLessThan(1); // due north
  });
});

describe('partner stage API', async () => {
  const { buildStagesApi } = await import('@/lib/integrations/stagesApi');
  it('lists each stage once with the routes that serve it', () => {
    const api = buildStagesApi(nairobiRoutes, '2026-01-01T00:00:00Z');
    expect(api.stages.length).toBeGreaterThan(20);
    const kencom = api.stages.find(s => s.id === '46-kencom')!;
    expect(kencom.routes[0]).toMatchObject({ number: '46', towards: ['Kawangware'] });
    expect(new Set(api.stages.map(s => s.id)).size).toBe(api.stages.length);
  });
});
