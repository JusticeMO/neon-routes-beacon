export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Cumulative distance (m) at each vertex of a polyline. First entry is 0. */
export function cumulativeDistances(path: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + haversineM(path[i - 1], path[i]));
  return out;
}

/** Point at `distanceM` along the polyline (clamped to its ends). */
export function pointAlong(path: LatLng[], cum: number[], distanceM: number): LatLng {
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(total, distanceM));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / seg;
  const a = path[i - 1];
  const b = path[i];
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Distance along the polyline (m) of the vertex/segment point closest to `p`. */
export function progressOf(path: LatLng[], cum: number[], p: LatLng): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    // Project in a local equirectangular frame; fine at city scale.
    const kx = Math.cos((a.lat * Math.PI) / 180);
    const ax = a.lng * kx, ay = a.lat, bx = b.lng * kx, by = b.lat, px = p.lng * kx, py = p.lat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const q = { lat: ay + dy * t, lng: (ax + dx * t) / kx };
    const d = haversineM(p, q);
    if (d < bestD) {
      bestD = d;
      best = cum[i - 1] + (cum[i] - cum[i - 1]) * t;
    }
  }
  return best;
}
