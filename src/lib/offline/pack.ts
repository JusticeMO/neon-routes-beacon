/**
 * The offline Nairobi map pack: public/offline/{manifest.json, nairobi.pmtiles, roads.pack, places.pack}.
 * Built by scripts/map-pack. Files are fetched once, kept by the service worker (public/sw.js),
 * and served from its cache when the phone is offline.
 */
import type { Places } from './places';

export interface PackManifest {
  version: string;
  built: string;
  source: string;
  attribution: string;
  bbox: [number, number, number, number];
  files: Record<string, { bytes: number; sha256: string }>;
}

export const PACK_BASE = `${import.meta.env.BASE_URL ?? '/'}offline/`.replace(/\/{2,}/g, '/');

let manifestPromise: Promise<PackManifest> | null = null;
export function loadManifest(): Promise<PackManifest> {
  manifestPromise ??= fetch(`${PACK_BASE}manifest.json`).then(r => {
    if (!r.ok) throw new Error(`Map pack manifest: HTTP ${r.status}`);
    return r.json();
  });
  manifestPromise.catch(() => { manifestPromise = null; });
  return manifestPromise;
}

/** URL of a pack file, versioned so a new pack is never mixed with a cached old one. */
export async function packUrl(file: string): Promise<string> {
  const m = await loadManifest();
  return `${PACK_BASE}${file}?v=${m.version}`;
}

export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.arrayBuffer();
}

/** .pack files are gzip; unzip in the browser (the server sends them as plain bytes). */
export async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

let placesPromise: Promise<Places> | null = null;
export function loadPlaces(): Promise<Places> {
  placesPromise ??= packUrl('places.pack').then(fetchBytes).then(gunzip).then(b => JSON.parse(new TextDecoder().decode(b)));
  placesPromise.catch(() => { placesPromise = null; });
  return placesPromise;
}

export function packSizeMB(m: PackManifest): number {
  return Object.values(m.files).reduce((s, f) => s + f.bytes, 0) / 1e6;
}
