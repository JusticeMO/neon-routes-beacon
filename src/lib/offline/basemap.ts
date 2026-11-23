/**
 * Draws the offline street map (nairobi.pmtiles) in Leaflet with protomaps-leaflet.
 * Labels use the phone's own fonts, so nothing is downloaded at view time.
 */
import L from 'leaflet';
import { PMTiles, type Source } from 'pmtiles';
import {
  CenteredTextSymbolizer, LineLabelSymbolizer, LineSymbolizer, PolygonSymbolizer, exp, leafletLayer,
  type LabelRule, type PaintRule,
} from 'protomaps-leaflet';
import type { MapTheme } from '@/contexts/ThemeContext';
import { fetchBytes, packUrl } from './pack';

interface Palette {
  background: string; water: string; park: string; forest: string; hospital: string; school: string; industrial: string; commercial: string;
  highway: string; highwayCasing: string; major: string; majorCasing: string; minor: string; minorCasing: string; path: string;
  label: string; labelHalo: string; area: string; roadLabel: string;
}

export const PALETTES: Record<MapTheme, Palette> = {
  bright: {
    background: '#f3f1ec', water: '#a8d4e6', park: '#d3e9c6', forest: '#bcdcae', hospital: '#f7e0e0', school: '#f3ecd5', industrial: '#ebe6ee', commercial: '#f5e9e1',
    highway: '#f7c169', highwayCasing: '#d9973d', major: '#fde5a6', majorCasing: '#d9bf86', minor: '#ffffff', minorCasing: '#d9d4cb', path: '#b7ad9f',
    label: '#3d3a35', labelHalo: '#ffffff', area: '#6b5f50', roadLabel: '#55514b',
  },
  dark: {
    background: '#101318', water: '#0f2a3d', park: '#122219', forest: '#10261a', hospital: '#2a171b', school: '#221f15', industrial: '#1b1a22', commercial: '#1e1a18',
    highway: '#5a4a2a', highwayCasing: '#2b2416', major: '#3a3d46', majorCasing: '#20232a', minor: '#2a2d35', minorCasing: '#181b21', path: '#30333b',
    label: '#c3c9d4', labelHalo: '#101318', area: '#8f9bb0', roadLabel: '#8d95a3',
  },
  live: {
    background: '#070b14', water: '#0a2236', park: '#0a1d18', forest: '#0a2019', hospital: '#1d0f1a', school: '#16150f', industrial: '#12121c', commercial: '#141217',
    highway: '#1f4f6e', highwayCasing: '#0e2638', major: '#1c2a3d', majorCasing: '#0d1522', minor: '#151e2c', minorCasing: '#0b111b', path: '#1a2230',
    label: '#a9c7e8', labelHalo: '#070b14', area: '#6fa8dc', roadLabel: '#7d93ad',
  },
};

const kind = (k: string | string[]) => (_z: number, f?: { props: Record<string, unknown> }) =>
  Array.isArray(k) ? k.includes(f?.props.kind as string) : f?.props.kind === k;

export function paintRulesFor(t: MapTheme): PaintRule[] {
  const c = PALETTES[t];
  const line = (k: string | string[], color: string, stops: number[][], minzoom = 0): PaintRule => ({
    dataLayer: 'roads', minzoom, filter: kind(k),
    symbolizer: new LineSymbolizer({ color, width: z => exp(1.6, stops)(z), lineCap: 'round', lineJoin: 'round' }),
  });
  const fill = (k: string | string[], color: string): PaintRule => ({ dataLayer: 'landuse', filter: kind(k), symbolizer: new PolygonSymbolizer({ fill: color }) });
  return [
    fill('forest', c.forest), fill('park', c.park), fill('hospital', c.hospital), fill('school', c.school),
    fill('industrial', c.industrial), fill('commercial', c.commercial),
    { dataLayer: 'water', filter: (_z, f) => f?.geomType === 3, symbolizer: new PolygonSymbolizer({ fill: c.water }) },
    { dataLayer: 'water', filter: (_z, f) => f?.geomType === 2, symbolizer: new LineSymbolizer({ color: c.water, width: z => exp(1.6, [[11, 0.5], [16, 4]])(z) }) },
    { dataLayer: 'roads', minzoom: 14, filter: kind('path'), symbolizer: new LineSymbolizer({ color: c.path, width: 1, dash: [3, 2] }) },
    // Casings first, then fills, so junctions join cleanly.
    line(['minor_road', 'service'], c.minorCasing, [[13, 0.5], [15, 5], [18, 18]], 13),
    line('medium_road', c.majorCasing, [[11, 1], [15, 8], [18, 22]]),
    line('major_road', c.majorCasing, [[10, 1.5], [15, 10], [18, 26]]),
    line('highway', c.highwayCasing, [[9, 2], [15, 12], [18, 30]]),
    line('service', c.minor, [[14, 1], [15, 2.5], [18, 10]], 14),
    line('minor_road', c.minor, [[13, 0.5], [15, 3.5], [18, 15]], 13),
    line('medium_road', c.minor, [[11, 0.5], [15, 6], [18, 19]]),
    line('major_road', c.major, [[10, 1], [15, 7.5], [18, 23]]),
    line('highway', c.highway, [[9, 1.2], [15, 9], [18, 27]]),
  ];
}

export function labelRulesFor(t: MapTheme): LabelRule[] {
  const c = PALETTES[t];
  const roadLabel = (k: string | string[], minzoom: number): LabelRule => ({
    dataLayer: 'roads', minzoom, filter: kind(k),
    symbolizer: new LineLabelSymbolizer({ fill: c.roadLabel, stroke: c.labelHalo, width: 2.5, font: '500 11px system-ui, sans-serif' }),
  });
  const place = (k: string, minzoom: number, font: string, color: string): LabelRule => ({
    dataLayer: 'places', minzoom, filter: kind(k),
    symbolizer: new CenteredTextSymbolizer({ fill: color, stroke: c.labelHalo, width: 3, font, textTransform: 'uppercase', letterSpacing: 1 }),
  });
  return [
    place('locality', 10, '600 13px system-ui, sans-serif', c.label),
    place('macrohood', 12, '600 12px system-ui, sans-serif', c.area),
    place('neighbourhood', 14, '500 11px system-ui, sans-serif', c.area),
    roadLabel(['highway', 'major_road'], 13),
    roadLabel('medium_road', 14),
    roadLabel(['minor_road'], 15),
  ];
}

/** The pack's tiles, held in memory: a 4 MB file, read once (from the service worker cache when offline). */
let tilesPromise: Promise<PMTiles> | null = null;
export function loadTiles(): Promise<PMTiles> {
  tilesPromise ??= packUrl('nairobi.pmtiles').then(fetchBytes).then(buf => {
    const source: Source = {
      getKey: () => 'beacon-nairobi',
      getBytes: async (offset: number, length: number) => ({ data: buf.slice(offset, offset + length) }),
    };
    return new PMTiles(source);
  });
  tilesPromise.catch(() => { tilesPromise = null; });
  return tilesPromise;
}

export function offlineLayer(tiles: PMTiles, theme: MapTheme): L.GridLayer {
  return leafletLayer({
    url: tiles,
    paintRules: paintRulesFor(theme),
    labelRules: labelRulesFor(theme),
    backgroundColor: PALETTES[theme].background,
    maxDataZoom: 14,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }) as unknown as L.GridLayer;
}
