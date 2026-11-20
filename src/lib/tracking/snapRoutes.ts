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
 * Snap every route to real roads: Google driving directions from the first
 * stage to the last, passing through each stage in order. Needs the
 * Directions API enabled on the key. Failures leave the drawn path in place.
 */
export async function snapRoutesToRoads(): Promise<void> {
  const l = googleLoader();
  if (!l || started) return;
  started = true;
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
