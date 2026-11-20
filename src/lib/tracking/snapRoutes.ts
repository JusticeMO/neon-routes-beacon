import { Loader } from '@googlemaps/js-api-loader';
import { nairobiRoutes } from '@/data/routes';
import { hasFreshRoadPath, setRoadPath } from './roadPaths';

export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let loader: Loader | null = null;
export function googleLoader(): Loader | null {
  if (!GOOGLE_MAPS_KEY) return null;
  loader ??= new Loader({ apiKey: GOOGLE_MAPS_KEY, version: 'weekly' });
  return loader;
}

let started = false;

/**
 * Open-source routing (OSRM on OpenStreetMap roads). Defaults to the public
 * OSRM demo server, which is fine for a demo; point VITE_OSRM_URL at your own
 * OSRM server for production.
 */
const OSRM_URL = ((import.meta.env.VITE_OSRM_URL as string | undefined) || 'https://router.project-osrm.org').replace(/\/$/, '');

async function snapWithOsrm(): Promise<void> {
  for (const route of nairobiRoutes) {
    if (hasFreshRoadPath(route.number)) continue;
    const coords = route.stops.map(s => `${s.lng},${s.lat}`).join(';');
    try {
      const res = await fetch(`${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=true`);
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const data = await res.json() as { routes?: { geometry: { coordinates: [number, number][] } }[] };
      const line = data.routes?.[0]?.geometry.coordinates ?? [];
      setRoadPath(route.number, line.map(([lng, lat]) => ({ lat, lng })));
    } catch (e) {
      console.warn(`[beacon] Could not snap route ${route.number} to roads`, e);
    }
    // Be gentle with the shared demo server.
    await new Promise(r => setTimeout(r, 300));
  }
}

/**
 * Snap every route to real roads through its stages, in order: Google
 * directions when a Google Maps key is set, otherwise open-source OSRM on
 * OpenStreetMap. Failures leave the drawn path in place.
 */
export async function snapRoutesToRoads(): Promise<void> {
  if (started) return;
  started = true;
  const l = googleLoader();
  if (!l) return snapWithOsrm();
  const { DirectionsService } = await l.importLibrary('routes');
  const svc = new DirectionsService();
  for (const route of nairobiRoutes) {
    if (hasFreshRoadPath(route.number)) continue;
    const stops = route.stops;
    try {
      const res = await svc.route({
        origin: stops[0],
        destination: stops[stops.length - 1],
        waypoints: stops.slice(1, -1).map(s => ({ location: s, stopover: false })),
        travelMode: google.maps.TravelMode.DRIVING,
      });
      const path = res.routes[0]?.legs.flatMap(leg => leg.steps.flatMap(step => step.path.map(p => ({ lat: p.lat(), lng: p.lng() })))) ?? [];
      // Drop consecutive duplicates where steps meet.
      const clean = path.filter((p, i) => i === 0 || p.lat !== path[i - 1].lat || p.lng !== path[i - 1].lng);
      setRoadPath(route.number, clean);
    } catch (e) {
      console.warn(`[beacon] Could not snap route ${route.number} to roads`, e);
    }
  }
}
