import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanLabel, parseMapLink, type BBox } from './mapLink';

const BOX: BBox = [36.62, -1.43, 37.05, -1.13];
const link = (q: string) => parseMapLink(new URLSearchParams(q), BOX);

describe('map deep links', () => {
  it('opens directions to a home from Sakafind', () => {
    expect(link('lat=-1.29890&lng=36.78260&label=Sunrise%20Apartments&from=sakafind&dir=to'))
      .toEqual({ kind: 'ok', point: { lat: -1.2989, lng: 36.7826 }, label: 'Sunrise Apartments', view: 'to' });
    expect(link('lat=-1.2989&lng=36.7826&view=spot')).toMatchObject({ kind: 'ok', view: 'spot', label: 'Selected place' });
    expect(link('lat=-1.2989&lng=36.7826')).toMatchObject({ kind: 'ok', view: 'town' });
  });

  it('ignores a plain /map', () => {
    expect(link('')).toEqual({ kind: 'none' });
    expect(link('from=sakafind')).toEqual({ kind: 'none' });
  });

  /** A link cut short in WhatsApp ("lat=-1.29&ln") used to leave the map blank with no word why. */
  it('says so when a link is cut short or damaged', () => {
    for (const q of ['lat=-1.29', 'lat=-1.29&lng=', 'lat=abc&lng=36.8', 'lat=&lng=36.8', 'lat=Infinity&lng=36.8', 'lat=200&lng=36.8']) {
      expect(link(q).kind, q).toBe('invalid');
    }
  });

  it('fixes swapped latitude and longitude', () => {
    expect(link('lat=36.7826&lng=-1.2989&dir=to')).toMatchObject({ kind: 'ok', point: { lat: -1.2989, lng: 36.7826 } });
  });

  it('says a place outside Nairobi has no directions yet', () => {
    const r = link('lat=-4.0435&lng=39.6682&label=Mombasa%20flat');
    expect(r).toMatchObject({ kind: 'outside', label: 'Mombasa flat' });
    expect(r.kind === 'outside' && r.message).toContain("outside Beacon's Nairobi map");
  });

  it('keeps labels as short plain text', () => {
    expect(cleanLabel('  Sunrise\n\tApartments ')).toBe('Sunrise Apartments');
    expect(cleanLabel('x'.repeat(200))).toHaveLength(80);
    expect(cleanLabel(null)).toBe('Selected place');
  });
});

describe('map pack fallback', () => {
  const manifest = { version: 'new', built: '', source: '', attribution: '', bbox: BOX, files: { 'roads.pack': { bytes: 1, sha256: '' }, 'places.pack': { bytes: 1, sha256: '' } } };
  afterEach(() => vi.unstubAllGlobals());

  const setup = (good: string | null, cached: string[]) => {
    const store = new Map(good ? [['beacon.pack.good', good]] : []);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('caches', { match: async (u: string) => (cached.some(c => u.includes(c)) ? new Response('') : undefined) });
  };

  /** A phone that saw a new manifest and lost signal before the new files arrived had no map at all. */
  it('keeps the last working pack offline when the new one is not fully downloaded', async () => {
    setup('old', ['roads.pack?v=new']);
    const { usableVersion } = await import('./pack');
    expect(await usableVersion(manifest, false)).toBe('old');
  });

  it('moves to the new pack once it is all on the phone, or whenever online', async () => {
    setup('old', ['roads.pack?v=new', 'places.pack?v=new']);
    const { usableVersion } = await import('./pack');
    expect(await usableVersion(manifest, false)).toBe('new');
    setup('old', []);
    expect(await usableVersion(manifest, true)).toBe('new');
    setup(null, []);
    expect(await usableVersion(manifest, false)).toBe('new');
  });
});
