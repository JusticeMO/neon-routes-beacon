/**
 * Reading a /map deep link (from Sakafind or a shared "Getting to ..." message). Links are
 * typed, forwarded and cut short in chats, so anything odd in one gets a plain message on the
 * map instead of a blank screen or a trip to nowhere.
 */
import type { LatLng } from './roadGraph';

export type MapLink =
  | { kind: 'none' }
  | { kind: 'invalid'; message: string }
  | { kind: 'outside'; point: LatLng; label: string; message: string }
  | { kind: 'ok'; point: LatLng; label: string; view: 'spot' | 'to' | 'town' };

/** [west, south, east, north], as in the pack manifest. */
export type BBox = [number, number, number, number];

export const inBox = (p: LatLng, [w, s, e, n]: BBox) => p.lng >= w && p.lng <= e && p.lat >= s && p.lat <= n;

/** Labels are shown as text; this only trims, drops control characters and caps the length. */
export function cleanLabel(raw: string | null): string {
  // eslint-disable-next-line no-control-regex -- dropping control characters is the point
  const t = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.slice(0, 80) || 'Selected place';
}

export function parseMapLink(params: URLSearchParams, bbox: BBox): MapLink {
  const rawLat = params.get('lat'), rawLng = params.get('lng');
  if (rawLat === null && rawLng === null) return { kind: 'none' };
  const lat = Number(rawLat), lng = Number(rawLng);
  if (!rawLat?.trim() || !rawLng?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { kind: 'invalid', message: 'This link is incomplete or damaged, so Beacon cannot tell where it points. Ask for the link again, or search for the place.' };
  }
  const label = cleanLabel(params.get('label'));
  const point = { lat, lng };
  if (!inBox(point, bbox)) {
    // A common slip: latitude and longitude swapped.
    const swapped = { lat: lng, lng: lat };
    if (inBox(swapped, bbox)) return { kind: 'ok', point: swapped, label, view: viewOf(params) };
    return { kind: 'outside', point, label, message: `${label} is outside Beacon's Nairobi map, so there are no matatu directions to it yet.` };
  }
  return { kind: 'ok', point, label, view: viewOf(params) };
}

const viewOf = (params: URLSearchParams): 'spot' | 'to' | 'town' =>
  params.get('view') === 'spot' ? 'spot' : params.get('dir') === 'to' ? 'to' : 'town';
