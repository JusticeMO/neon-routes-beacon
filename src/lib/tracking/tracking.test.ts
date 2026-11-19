import { describe, expect, it } from 'vitest';
import { nairobiRoutes } from '@/data/routes';
import { sampleVehicles } from '@/data/sampleVehicles';
import {
  AGING_MAX_MS, FRESH_MAX_MS, STALE_MAX_MS,
  coverage, formatAge, formatDistance, freshnessOf, isPubliclyVisible, vehiclesApproaching,
  type VehicleStatus,
} from './vehicleStatus';
import { routeGeometry } from './routeGeometry';
import { buildShareUrl, parseDeepLink, stageId } from './deepLink';

const NOW = Date.parse('2026-11-19T17:30:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function vehicle(over: Partial<VehicleStatus>): VehicleStatus {
  return {
    vehicleId: 'v', routeId: '46', plate: 'KDA 100A', saccoName: 'S', direction: 'outbound',
    position: { lat: 0, lng: 0 }, progressM: 0, lastStageIndex: 0, lastReportAt: ago(0),
    source: 'sample', onShift: true, ...over,
  };
}

describe('freshness', () => {
  it('uses the named thresholds', () => {
    expect(freshnessOf(ago(0), NOW)).toBe('fresh');
    expect(freshnessOf(ago(FRESH_MAX_MS - 1), NOW)).toBe('fresh');
    expect(freshnessOf(ago(FRESH_MAX_MS), NOW)).toBe('aging');
    expect(freshnessOf(ago(AGING_MAX_MS), NOW)).toBe('stale');
    expect(freshnessOf(ago(STALE_MAX_MS), NOW)).toBe('hidden');
  });
  it('formats ages and distances without implying arrival times', () => {
    expect(formatAge(ago(2_000), NOW)).toBe('just now');
    expect(formatAge(ago(40_000), NOW)).toBe('40 s ago');
    expect(formatAge(ago(190_000), NOW)).toBe('3 min ago');
    expect(formatDistance(10)).toBe('50 m');
    expect(formatDistance(1234)).toBe('1.2 km');
  });
});

describe('visibility and coverage', () => {
  it('never shows off-shift or hidden vehicles', () => {
    expect(isPubliclyVisible(vehicle({ onShift: false }), NOW)).toBe(false);
    expect(isPubliclyVisible(vehicle({ lastReportAt: ago(STALE_MAX_MS + 1) }), NOW)).toBe(false);
    expect(isPubliclyVisible(vehicle({ lastReportAt: ago(AGING_MAX_MS + 1) }), NOW)).toBe(true);
  });
  it('counts fresh and aging vehicles out of those on shift', () => {
    const vs = [
      vehicle({ vehicleId: 'a' }),
      vehicle({ vehicleId: 'b', lastReportAt: ago(FRESH_MAX_MS + 1) }),
      vehicle({ vehicleId: 'c', lastReportAt: ago(AGING_MAX_MS + 1) }),
      vehicle({ vehicleId: 'd', onShift: false }),
    ];
    expect(coverage(vs, NOW)).toEqual({ reporting: 2, onShift: 3 });
  });
});

describe('vehicles approaching a stage', () => {
  const stage = 1000;
  it('takes outbound vehicles behind the stage and inbound vehicles beyond it, nearest first', () => {
    const vs = [
      vehicle({ vehicleId: 'out-far', direction: 'outbound', progressM: 100 }),
      vehicle({ vehicleId: 'out-near', direction: 'outbound', progressM: 800 }),
      vehicle({ vehicleId: 'out-passed', direction: 'outbound', progressM: 1500 }),
      vehicle({ vehicleId: 'in-near', direction: 'inbound', progressM: 1300 }),
      vehicle({ vehicleId: 'in-passed', direction: 'inbound', progressM: 400 }),
      vehicle({ vehicleId: 'off', direction: 'outbound', progressM: 900, onShift: false }),
    ];
    const got = vehiclesApproaching(vs, stage, NOW);
    expect(got.map(a => a.vehicle.vehicleId)).toEqual(['out-near', 'in-near', 'out-far']);
    expect(got[0].distanceM).toBe(200);
  });
  it('at a terminus, only vehicles heading toward it count', () => {
    const route = nairobiRoutes[0];
    const geo = routeGeometry(route);
    const vs = [
      vehicle({ vehicleId: 'to-town', direction: 'inbound', progressM: geo.lengthM / 2 }),
      vehicle({ vehicleId: 'from-town', direction: 'outbound', progressM: geo.lengthM / 2 }),
    ];
    expect(vehiclesApproaching(vs, geo.stageProgressM[0], NOW).map(a => a.vehicle.vehicleId)).toEqual(['to-town']);
  });
});

describe('route geometry', () => {
  it('orders stages along the line and finds the last stage passed per direction', () => {
    const route = nairobiRoutes[0];
    const geo = routeGeometry(route);
    for (let i = 1; i < geo.stageProgressM.length; i++) {
      expect(geo.stageProgressM[i]).toBeGreaterThan(geo.stageProgressM[i - 1]);
    }
    const mid = (geo.stageProgressM[2] + geo.stageProgressM[3]) / 2;
    expect(geo.lastStageIndex(mid, 'outbound')).toBe(2);
    expect(geo.lastStageIndex(mid, 'inbound')).toBe(3);
  });
});

describe('sample source', () => {
  it('is always labelled sample and stays on the route', () => {
    for (const route of nairobiRoutes) {
      const geo = routeGeometry(route);
      for (const v of sampleVehicles(route, NOW)) {
        expect(v.source).toBe('sample');
        expect(v.progressM).toBeGreaterThanOrEqual(0);
        expect(v.progressM).toBeLessThanOrEqual(geo.lengthM + 1e-6);
      }
    }
  });
});

describe('deep links', () => {
  const route = nairobiRoutes[0];
  it('resolves stage and route ids', () => {
    const id = stageId(route, 3);
    const byStage = parseDeepLink(`?stage=${id}`, nairobiRoutes);
    expect(byStage.route?.number).toBe(route.number);
    expect(byStage.stage?.stageIndex).toBe(3);
    expect(parseDeepLink(`?route=${route.number}`, nairobiRoutes).route?.number).toBe(route.number);
    expect(buildShareUrl('https://beacon.example', { route, stageIndex: 3 })).toBe(`https://beacon.example/?stage=${id}`);
  });
  it('flags unknown ids so the UI can fall back', () => {
    expect(parseDeepLink('?stage=nope', nairobiRoutes)).toMatchObject({ route: null, invalid: true });
    expect(parseDeepLink('?route=999', nairobiRoutes)).toMatchObject({ route: null, invalid: true });
    expect(parseDeepLink('', nairobiRoutes)).toMatchObject({ route: null, invalid: false });
  });
});
