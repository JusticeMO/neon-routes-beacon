/**
 * Public, read-only stage list for partner apps such as Sakafind, published at
 * /api/v1/stages.json on every build (see vite.config.ts). It only holds what any commuter
 * can already see in Beacon: SACCO-approved routes and their stages. No vehicle or rider data.
 */
import type { Route } from '../../data/routes';
import { stageId } from '../tracking/deepLink';
import { FARES } from '../../data/fares';

export interface StagesApi {
  version: 1;
  generated: string;
  attribution: string;
  fareNote: string;
  /** Path templates on the Beacon host. */
  links: { map: string; directions: string; stage: string };
  stages: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    routes: {
      number: string; name: string; color: string; towards: string[];
      /** Usual full-route fare in KSh off-peak and at peak hours (6–9 am, 5–8 pm). An estimate until each SACCO confirms its fares. */
      fareKsh: { offPeak: number; peak: number };
    }[];
  }[];
}

export function buildStagesApi(routes: Route[], generated = new Date().toISOString()): StagesApi {
  const stages: StagesApi['stages'] = [];
  for (const route of routes) {
    route.stops.forEach((s, i) => {
      // One entry per physical stage; the same stage name within 150 m on another route is merged.
      const near = stages.find(x => x.name === s.name && Math.abs(x.lat - s.lat) < 0.0014 && Math.abs(x.lng - s.lng) < 0.0014);
      const towards = [i > 0 ? route.stops[0].name : null, i < route.stops.length - 1 ? route.stops[route.stops.length - 1].name : null].filter((x): x is string => Boolean(x));
      const entry = { number: route.number, name: route.name, color: route.color, towards, fareKsh: FARES[route.number] ?? { offPeak: 70, peak: 90 } };
      if (near) near.routes.push(entry);
      else stages.push({ id: stageId(route, i), name: s.name, lat: s.lat, lng: s.lng, routes: [entry] });
    });
  }
  return {
    version: 1,
    generated,
    attribution: 'Route geometry © OpenStreetMap contributors',
    fareNote: 'Fares are usual fares, not confirmed by the SACCO. Matatu fares change with time of day, weather and demand.',
    links: { map: '/map?lat={lat}&lng={lng}&label={label}&from={partner}', directions: '/map?lat={lat}&lng={lng}&label={label}&from={partner}&dir=to', stage: '/?stage={id}' },
    stages,
  };
}
