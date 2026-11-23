import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowLeft, Bus, Car, Footprints, Home, Loader2, MapPin, Navigation, Play, Search, Square, Wifi, WifiOff, X,
} from 'lucide-react';
import { nairobiRoutes } from '@/data/routes';
import { useTheme } from '@/contexts/ThemeContext';
import OfflineBaseLayer from '@/components/OfflineBaseLayer';
import { Button } from '@/components/ui/button';
import { stageId } from '@/lib/tracking/deepLink';
import { loadManifest, loadPlaces, packSizeMB, type PackManifest } from '@/lib/offline/pack';
import { describe, formatDistance, identify, searchPlaces, type Identified, type Places, type SearchHit } from '@/lib/offline/places';
import { loadRouter, nearestRoad, route as findRoute, searchRoadNames, type TimedRoute } from '@/lib/offline/router';
import { tripToTown, type Journey } from '@/lib/offline/journey';
import { animator } from '@/lib/offline/animate';
import type { LatLng, Profile } from '@/lib/offline/roadGraph';

const CENTER: [number, number] = [-1.2864, 36.8172];
const BOUNDS: L.LatLngBoundsExpression = [[-1.48, 36.55], [-1.08, 37.12]];

const minutes = (s: number) => (s < 90 ? '1 min' : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);

function pinIcon(color: string, glyph: string) {
  return L.divIcon({
    className: '',
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    html: `<div style="width:30px;height:38px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><svg viewBox="0 0 30 38" width="30" height="38"><path d="M15 37C15 37 2 22 2 14a13 13 0 0 1 26 0c0 8-13 23-13 23z" fill="${color}" stroke="#fff" stroke-width="2"/><text x="15" y="19" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="system-ui">${glyph}</text></svg></div>`,
  });
}

function vehicleIcon(color: string) {
  return L.divIcon({
    className: 'beacon-vehicle',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="beacon-vehicle-inner" style="width:34px;height:34px;transition:transform .1s linear"><svg viewBox="0 0 34 34" width="34" height="34"><circle cx="17" cy="17" r="13" fill="${color}" stroke="#fff" stroke-width="3"/><path d="M17 7 L23 21 L17 18 L11 21 Z" fill="#fff"/></svg></div>`,
  });
}

/** Moves a marker along a path, frame by frame, with its arrow pointing the way it travels. */
const AnimatedVehicle = ({ path, color, seconds, onDone }: { path: LatLng[]; color: string; seconds: number; onDone: () => void }) => {
  const markerRef = useRef<L.Marker>(null);
  const map = useMap();
  useEffect(() => {
    const a = animator(path);
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / (seconds * 1000));
      const { point, bearing } = a.at(a.totalM * k);
      const m = markerRef.current;
      if (m) {
        m.setLatLng([point.lat, point.lng]);
        const inner = m.getElement()?.querySelector<HTMLElement>('.beacon-vehicle-inner');
        if (inner) inner.style.transform = `rotate(${bearing}deg)`;
        if (!map.getBounds().pad(-0.15).contains([point.lat, point.lng])) map.panTo([point.lat, point.lng], { animate: true });
      }
      if (k < 1) raf = requestAnimationFrame(tick);
      else onDone();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [path, seconds, map, onDone]);
  return <Marker ref={markerRef} position={[path[0].lat, path[0].lng]} icon={vehicleIcon(color)} interactive={false} />;
};

const ClickToIdentify = ({ onTap }: { onTap: (p: LatLng) => void }) => {
  useMapEvents({ click: e => onTap({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
};

const FlyTo = ({ target }: { target: { point: LatLng; zoom?: number; key: number } | null }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.point.lat, target.point.lng], target.zoom ?? Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [target, map]);
  return null;
};

const FitPath = ({ path }: { path: LatLng[] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (path && path.length > 1) map.fitBounds(L.latLngBounds(path.map(p => [p.lat, p.lng])), { paddingTopLeft: [30, 120], paddingBottomRight: [30, 300], maxZoom: 17 });
  }, [path, map]);
  return null;
};

type Mode =
  | { kind: 'idle' }
  | { kind: 'spot'; id: Identified }
  | { kind: 'directions'; from: LatLng | null; to: LatLng | null; fromLabel: string; toLabel: string; profile: Profile; result: TimedRoute | null; busy: boolean; error?: string }
  | { kind: 'trip'; from: LatLng; label: string; journey: Journey | null; busy: boolean };

/**
 * The offline map: works in airplane mode once opened online. Tap any spot to learn what it
 * is and what's around it, get directions on the road network, animate a vehicle along a route,
 * and see the matatu trip to town (used by the Sakafind integration, /map?lat=..&lng=..&label=..).
 */
const OfflineMap = () => {
  const { theme } = useTheme();
  const isDark = theme !== 'bright';
  const [params] = useSearchParams();
  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [places, setPlaces] = useState<Places | null>(null);
  const [routerReady, setRouterReady] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [pin, setPin] = useState<LatLng | null>(null);
  const [home, setHome] = useState<{ point: LatLng; label: string } | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [fly, setFly] = useState<{ point: LatLng; zoom?: number; key: number } | null>(null);
  const [playing, setPlaying] = useState<{ path: LatLng[]; color: string; seconds: number } | null>(null);
  const fromSakafind = params.get('from') === 'sakafind';

  useEffect(() => {
    loadManifest().then(setManifest).catch(e => setPackError(String(e.message ?? e)));
    loadPlaces().then(setPlaces).catch(e => setPackError(String(e.message ?? e)));
    loadRouter().then(() => setRouterReady(true)).catch(e => setPackError(String(e.message ?? e)));
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const tapSpot = useCallback(async (p: LatLng) => {
    if (!places) return;
    setPin(p);
    setPlaying(null);
    const road = routerReady ? await nearestRoad(p).catch(() => null) : null;
    setMode({ kind: 'spot', id: identify(places, p, nairobiRoutes, road) });
  }, [places, routerReady]);

  // Deep link: /map?lat=-1.29&lng=36.78&label=Sunrise%20Apartments[&from=sakafind]
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !places || !routerReady) return;
    const lat = Number(params.get('lat')), lng = Number(params.get('lng'));
    if (!params.get('lat') || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    linked.current = true;
    const point = { lat, lng };
    const label = params.get('label')?.slice(0, 80) || 'Selected place';
    setHome({ point, label });
    setFly({ point, zoom: 16, key: Date.now() });
    if (params.get('view') === 'spot') tapSpot(point);
    else startTrip(point, label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, routerReady, params]);

  // Search: places and stages from the pack, roads from the routing worker.
  useEffect(() => {
    if (!places || query.trim().length < 2) { setHits([]); return; }
    let live = true;
    const local = searchPlaces(places, query, nairobiRoutes, 6);
    setHits(local);
    if (routerReady) {
      searchRoadNames(query, 3).then(roads => {
        if (!live) return;
        setHits([...local, ...roads.map(r => ({ name: r.name, kind: 'road', detail: 'Road', point: r.point, score: 0 }))].slice(0, 8));
      }).catch(() => {});
    }
    return () => { live = false; };
  }, [query, places, routerReady]);

  const runDirections = useCallback(async (m: Extract<Mode, { kind: 'directions' }>) => {
    if (!m.from || !m.to) { setMode(m); return; }
    setMode({ ...m, busy: true, result: null, error: undefined });
    setPlaying(null);
    try {
      const result = await findRoute(m.from, m.to, m.profile);
      setMode({ ...m, busy: false, result, error: result ? undefined : 'No route found between these points.' });
    } catch (e) {
      setMode({ ...m, busy: false, result: null, error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const startTrip = useCallback(async (from: LatLng, label: string) => {
    setPlaying(null);
    setMode({ kind: 'trip', from, label, journey: null, busy: true });
    const journey = await tripToTown(from, nairobiRoutes).catch(() => null);
    setMode({ kind: 'trip', from, label, journey, busy: false });
  }, []);

  const labelFor = (id: Identified) => describe(id);

  // While picking directions, a tap fills the missing end; otherwise it identifies the spot.
  const onMapTap = useCallback(async (p: LatLng, name?: string) => {
    if (mode.kind === 'directions' && (!mode.from || !mode.to) && places) {
      const road = name ? null : await nearestRoad(p).catch(() => null);
      const label = name ?? describe(identify(places, p, nairobiRoutes, road));
      runDirections(mode.from ? { ...mode, to: p, toLabel: label } : { ...mode, from: p, fromLabel: label });
      return;
    }
    tapSpot(p);
  }, [mode, places, runDirections, tapSpot]);
  const status = packError ? 'error' : manifest && places && routerReady ? 'ready' : 'loading';

  const routePath = mode.kind === 'directions' ? mode.result?.path ?? null : null;
  const trip = mode.kind === 'trip' ? mode.journey : null;
  const fitTarget = useMemo(() => routePath ?? (trip ? [...trip.walk.path, ...trip.ride.path] : null), [routePath, trip]);
  const stopPlaying = useCallback(() => setPlaying(null), []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <MapContainer center={CENTER} zoom={14} minZoom={10} maxZoom={19} maxBounds={BOUNDS} zoomControl={false} className="w-full h-full"
        style={{ background: isDark ? '#101318' : '#f3f1ec' }}>
        <OfflineBaseLayer />
        <ClickToIdentify onTap={p => onMapTap(p)} />
        <FlyTo target={fly} />
        <FitPath path={fitTarget} />

        {nairobiRoutes.map(r => (
          <Polyline key={r.id} positions={r.path.map(p => [p.lat, p.lng] as [number, number])} interactive={false}
            pathOptions={{ color: r.color, weight: 3, opacity: mode.kind === 'trip' ? 0.15 : 0.35 }} />
        ))}

        {routePath && <>
          <Polyline positions={routePath.map(p => [p.lat, p.lng] as [number, number])} pathOptions={{ color: isDark ? '#38bdf8' : '#2563eb', weight: 9, opacity: 0.25 }} interactive={false} />
          <Polyline positions={routePath.map(p => [p.lat, p.lng] as [number, number])} pathOptions={{ color: isDark ? '#7dd3fc' : '#1d4ed8', weight: 4, opacity: 0.95, dashArray: mode.kind === 'directions' && mode.profile === 'walk' ? '2 8' : undefined, lineCap: 'round' }} interactive={false} />
        </>}

        {trip && <>
          <Polyline positions={trip.walk.path.map(p => [p.lat, p.lng] as [number, number])} pathOptions={{ color: isDark ? '#e5e7eb' : '#374151', weight: 4, dashArray: '2 8', lineCap: 'round' }} interactive={false} />
          <Polyline positions={trip.ride.path.map(p => [p.lat, p.lng] as [number, number])} pathOptions={{ color: trip.ride.route.color, weight: 10, opacity: 0.3 }} interactive={false} />
          <Polyline positions={trip.ride.path.map(p => [p.lat, p.lng] as [number, number])} pathOptions={{ color: trip.ride.route.color, weight: 4.5, opacity: 0.95 }} interactive={false} />
          {[trip.stage.point, trip.ride.path[trip.ride.path.length - 1]].map((p, i) => (
            <CircleMarker key={i} center={[p.lat, p.lng]} radius={7} pathOptions={{ color: trip.ride.route.color, weight: 3, fillColor: '#fff', fillOpacity: 1 }}>
              <Tooltip permanent direction="top" offset={[0, -8]} className="neon-tooltip">{i === 0 ? trip.stage.name : trip.ride.to}</Tooltip>
            </CircleMarker>
          ))}
        </>}

        {mode.kind === 'spot' && mode.id.stages.map(s => (
          <CircleMarker key={s.name} center={[s.point.lat, s.point.lng]} radius={6} pathOptions={{ color: s.serves[0].route.color, weight: 3, fillColor: '#fff', fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -6]} className="neon-tooltip">{s.name}</Tooltip>
          </CircleMarker>
        ))}

        {home && <Marker position={[home.point.lat, home.point.lng]} icon={pinIcon('#7c3aed', '⌂')}><Tooltip direction="top" offset={[0, -34]}>{home.label}</Tooltip></Marker>}
        {pin && mode.kind === 'spot' && <Marker position={[pin.lat, pin.lng]} icon={pinIcon('#ef4444', '•')} />}
        {mode.kind === 'directions' && mode.from && <Marker position={[mode.from.lat, mode.from.lng]} icon={pinIcon('#16a34a', 'A')} />}
        {mode.kind === 'directions' && mode.to && <Marker position={[mode.to.lat, mode.to.lng]} icon={pinIcon('#dc2626', 'B')} />}
        {playing && <AnimatedVehicle path={playing.path} color={playing.color} seconds={playing.seconds} onDone={stopPlaying} />}
      </MapContainer>

      {/* Top bar: back, search, offline status */}
      <div className="absolute top-0 inset-x-0 z-[1000] p-3 space-y-2 pointer-events-none">
        <div className="relative z-20 flex items-center gap-2 pointer-events-auto">
          <Link to="/" className="w-10 h-10 shrink-0 rounded-full bg-card/95 backdrop-blur-md border border-border/40 shadow-md flex items-center justify-center" aria-label="Back to Beacon">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a place, estate, road or stage"
              className="w-full h-10 pl-9 pr-9 rounded-full bg-card/95 backdrop-blur-md border border-border/40 shadow-md text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Clear search"><X className="w-4 h-4 text-muted-foreground" /></button>}
            {hits.length > 0 && (
              <div className="absolute mt-1 w-full rounded-2xl bg-card border border-border/40 shadow-xl overflow-hidden">
                {hits.map((h, i) => (
                  <button key={`${h.kind}-${h.name}-${i}`} className="w-full text-left px-4 py-2.5 hover:bg-muted/40 flex items-center gap-3"
                    onClick={() => { setQuery(''); setHits([]); setFly({ point: h.point, zoom: h.kind === 'area' ? 15 : 17, key: Date.now() }); onMapTap(h.point, h.name); }}>
                    {h.kind === 'stage' ? <Bus className="w-4 h-4 text-primary" /> : <MapPin className="w-4 h-4 text-muted-foreground" />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">{h.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{h.detail}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-center pointer-events-auto">
          <div className="px-3 py-1.5 rounded-full bg-card/95 backdrop-blur-md border border-border/40 shadow text-[11px] font-medium flex items-center gap-1.5">
            {status === 'loading' && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the offline Nairobi map…</>}
            {status === 'error' && <><WifiOff className="w-3.5 h-3.5 text-destructive" /> Map pack unavailable. Open once with internet.</>}
            {status === 'ready' && (online
              ? <><Wifi className="w-3.5 h-3.5 text-success" /> Offline map ready · {packSizeMB(manifest!).toFixed(1)} MB · works without internet</>
              : <><WifiOff className="w-3.5 h-3.5 text-warning" /> No internet · map, search and directions still work</>)}
          </div>
        </div>
      </div>

      {/* Bottom card */}
      <div className="absolute bottom-0 inset-x-0 z-[1000] p-3">
        <div className="mx-auto max-w-lg rounded-3xl bg-card border border-border/40 shadow-2xl p-4 max-h-[55vh] overflow-y-auto">
          {mode.kind === 'idle' && (
            <div className="text-sm">
              <p className="font-semibold">{fromSakafind ? 'Matatus near your new home' : 'Tap anywhere on the map'}</p>
              <p className="text-muted-foreground text-xs mt-1">Beacon will tell you the area, the road, landmarks and matatu stages around it. Directions and the trip to town work offline too.</p>
            </div>
          )}

          {mode.kind === 'spot' && (() => {
            const id = mode.id;
            return (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <MapPin className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold leading-tight">{labelFor(id)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[id.ward && id.ward !== id.area ? `${id.ward} ward` : null, `${id.point.lat.toFixed(5)}, ${id.point.lng.toFixed(5)}`].filter(Boolean).join(' · ')}
                      {!id.inCoverage && ' · outside the offline map area'}
                    </p>
                  </div>
                  <button onClick={() => { setMode({ kind: 'idle' }); setPin(null); }} aria-label="Close"><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>

                {id.stages.length > 0 && (
                  <div>
                    <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Matatu stages nearby</h4>
                    {id.stages.map(s => (
                      <Link key={s.name} to={`/?stage=${encodeURIComponent(stageId(s.serves[0].route, s.serves[0].stageIndex))}`} className="flex items-center gap-2 py-1.5 text-sm hover:underline">
                        <Bus className="w-4 h-4" style={{ color: s.serves[0].route.color }} />
                        <span className="flex-1">{s.name} <span className="text-muted-foreground text-xs">· route {s.serves.map(x => x.route.number).join(', ')}</span></span>
                        <span className="text-xs text-muted-foreground">{formatDistance(s.distM)} {s.direction}</span>
                      </Link>
                    ))}
                  </div>
                )}

                {id.landmarks.length > 0 && (
                  <div>
                    <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Landmarks</h4>
                    {id.landmarks.slice(0, 3).map(l => (
                      <div key={l.name} className="flex items-center gap-2 py-1 text-sm">
                        <span className="flex-1 truncate">{l.name} <span className="text-muted-foreground text-xs">· {l.kind}</span></span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatDistance(l.distM)} {l.direction}</span>
                      </div>
                    ))}
                  </div>
                )}

                {id.neighbours.length > 0 && (
                  <div>
                    <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Areas around</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {id.neighbours.map(n => (
                        <span key={n.name} className="text-xs px-2 py-1 rounded-full bg-muted/50">{n.name} · {n.direction}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => runDirections({ kind: 'directions', from: id.point, to: null, fromLabel: labelFor(id), toLabel: '', profile: 'drive', result: null, busy: false })}>
                    <Navigation className="w-3.5 h-3.5 mr-1" /> From here
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runDirections({ kind: 'directions', from: home?.point ?? null, to: id.point, fromLabel: home?.label ?? '', toLabel: labelFor(id), profile: 'drive', result: null, busy: false })}>
                    <MapPin className="w-3.5 h-3.5 mr-1" /> To here
                  </Button>
                  <Button size="sm" onClick={() => startTrip(id.point, labelFor(id))}>
                    <Bus className="w-3.5 h-3.5 mr-1" /> To town
                  </Button>
                </div>
              </div>
            );
          })()}

          {mode.kind === 'directions' && (
            <DirectionsPanel mode={mode} onChange={runDirections} onClose={() => { setMode({ kind: 'idle' }); setPlaying(null); }}
              playing={Boolean(playing)}
              onPlay={() => mode.result && setPlaying(playing ? null : { path: mode.result.path, color: '#f59e0b', seconds: Math.min(20, Math.max(6, mode.result.distanceM / 600)) })} />
          )}

          {mode.kind === 'trip' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                {home && home.point === mode.from ? <Home className="w-5 h-5 text-violet-500 mt-0.5" /> : <MapPin className="w-5 h-5 text-destructive mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold leading-tight">Trip to town from {mode.label}</p>
                  {fromSakafind && <p className="text-xs text-muted-foreground">From Sakafind · walking and matatu, worked out on your phone</p>}
                </div>
                <button onClick={() => { setMode({ kind: 'idle' }); setPlaying(null); }} aria-label="Close"><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              {mode.busy && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Finding the nearest stage…</p>}
              {!mode.busy && !mode.journey && <p className="text-sm text-muted-foreground">No Beacon stage within 1.5 km yet. Beacon is adding more SACCO routes; you can still tap the map for the nearest roads and landmarks.</p>}
              {mode.journey && (() => {
                const j = mode.journey;
                return (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold whitespace-nowrap">{minutes(j.totalS)}</span>
                      <span className="text-sm text-muted-foreground">to {j.ride.to} (estimate, before waiting time)</span>
                    </div>
                    <ol className="space-y-2 text-sm">
                      <li className="flex gap-2"><Footprints className="w-4 h-4 mt-0.5 shrink-0" /><span>Walk {formatDistance(j.walk.distanceM)} ({minutes(j.walk.durationS)}) to <b>{j.stage.name}</b> stage</span></li>
                      <li className="flex gap-2"><Bus className="w-4 h-4 mt-0.5 shrink-0" style={{ color: j.ride.route.color }} /><span>Take route <b>{j.ride.route.number}</b> to {j.ride.to}, {formatDistance(j.ride.distanceM)} (about {minutes(j.ride.durationS)})</span></li>
                    </ol>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" onClick={() => setPlaying(playing ? null : { path: j.ride.path, color: j.ride.route.color, seconds: 12 })}>
                        {playing ? <><Square className="w-3.5 h-3.5 mr-1" /> Stop</> : <><Play className="w-3.5 h-3.5 mr-1" /> Play the ride</>}
                      </Button>
                      <Button size="sm" asChild>
                        <Link to={`/?stage=${encodeURIComponent(stageId(j.ride.route, j.stage.serves.find(s => s.route.id === j.ride.route.id)!.stageIndex))}`}>
                          <Bus className="w-3.5 h-3.5 mr-1" /> Live matatus
                        </Link>
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DirectionsPanel = ({ mode, onChange, onClose, onPlay, playing }: {
  mode: Extract<Mode, { kind: 'directions' }>;
  onChange: (m: Extract<Mode, { kind: 'directions' }>) => void;
  onClose: () => void;
  onPlay: () => void;
  playing: boolean;
}) => {
  const r = mode.result;
  const via = r?.steps.filter(s => s.name && s.distanceM > 300).sort((a, b) => b.distanceM - a.distanceM).slice(0, 3).map(s => s.name) ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="font-semibold flex-1">Directions</p>
        <div className="flex rounded-full bg-muted/50 p-0.5">
          {(['drive', 'walk'] as const).map(p => (
            <button key={p} onClick={() => onChange({ ...mode, profile: p })}
              className={`px-3 py-1 rounded-full text-xs flex items-center gap-1 ${mode.profile === p ? 'bg-card shadow font-semibold' : 'text-muted-foreground'}`}>
              {p === 'drive' ? <Car className="w-3.5 h-3.5" /> : <Footprints className="w-3.5 h-3.5" />} {p === 'drive' ? 'Drive' : 'Walk'}
            </button>
          ))}
        </div>
        <button onClick={onClose} aria-label="Close"><X className="w-4 h-4 text-muted-foreground" /></button>
      </div>
      <div className="text-xs space-y-1">
        <p><span className="inline-block w-4 font-bold text-green-600">A</span>{mode.from ? mode.fromLabel || 'Selected point' : <i className="text-muted-foreground">Tap the map or a place, then “From here”</i>}</p>
        <p><span className="inline-block w-4 font-bold text-red-600">B</span>{mode.to ? mode.toLabel || 'Selected point' : <i className="text-muted-foreground">Tap the map or a place, then “To here”</i>}</p>
      </div>
      {mode.busy && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Finding a route…</p>}
      {mode.error && <p className="text-sm text-destructive">{mode.error}</p>}
      {r && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold whitespace-nowrap">{minutes(r.durationS)}</span>
            <span className="text-sm text-muted-foreground">{formatDistance(r.distanceM)}{via.length ? ` · via ${via.join(', ')}` : ''}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Found on this phone in {r.ms} ms, no internet used. {mode.profile === 'drive' ? 'Time assumes typical city traffic.' : ''}</p>
          <Button size="sm" variant="outline" className="w-full" onClick={onPlay}>
            {playing ? <><Square className="w-3.5 h-3.5 mr-1" /> Stop</> : <><Play className="w-3.5 h-3.5 mr-1" /> Animate a vehicle along this route</>}
          </Button>
        </>
      )}
    </div>
  );
};

export default OfflineMap;
