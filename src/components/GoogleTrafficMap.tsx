import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { nairobiRoutes, type Route } from '@/data/routes';
import { freshnessOf, formatAge, isPubliclyVisible, type VehicleStatus } from '@/lib/tracking/vehicleStatus';
import { directionLabel } from '@/lib/tracking/routeGeometry';

export interface MapProps {
  selectedRoute: Route | null;
  vehicles: VehicleStatus[];
  now: number;
  stageIndex?: number;
  followedId?: string | null;
  onVehicleClick?: (vehicleId: string) => void;
}

const CENTER = { lat: -1.2864, lng: 36.8172 };

/**
 * Google Maps base map with the live traffic layer. Used when
 * VITE_GOOGLE_MAPS_API_KEY is set; otherwise Beacon uses the Leaflet map.
 * Same props as the Leaflet map so the screens don't care which one renders.
 */
const GoogleTrafficMap = ({ apiKey, onError, ...props }: MapProps & { apiKey: string; onError: () => void }) => {
  const { selectedRoute, vehicles, now, stageIndex, followedId, onVehicleClick } = props;
  const el = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const lines = useRef<google.maps.Polyline[]>([]);
  const stops = useRef<google.maps.Marker[]>([]);
  const markers = useRef(new Map<string, google.maps.Marker>());
  const clickRef = useRef(onVehicleClick);
  clickRef.current = onVehicleClick;

  useEffect(() => {
    let cancelled = false;
    new Loader({ apiKey, version: 'weekly' })
      .importLibrary('maps')
      .then(({ Map, TrafficLayer }) => {
        if (cancelled || !el.current) return;
        const m = new Map(el.current, { center: CENTER, zoom: 14, disableDefaultUI: true, zoomControl: true, clickableIcons: false });
        new TrafficLayer().setMap(m);
        setMap(m);
      })
      .catch(onError);
    return () => { cancelled = true; };
  }, [apiKey, onError]);

  // Route lines; selected route bold, the rest faint.
  useEffect(() => {
    if (!map) return;
    lines.current.forEach(l => l.setMap(null));
    lines.current = nairobiRoutes.map(r => new google.maps.Polyline({
      map,
      path: r.path,
      strokeColor: r.color,
      strokeOpacity: !selectedRoute ? 0.8 : r.id === selectedRoute.id ? 1 : 0.15,
      strokeWeight: selectedRoute?.id === r.id ? 6 : 4,
    }));
    stops.current.forEach(s => s.setMap(null));
    stops.current = (selectedRoute?.stops ?? []).map((s, i) => new google.maps.Marker({
      map,
      position: s,
      title: s.name,
      label: { text: s.name, fontSize: '11px', fontWeight: '600', className: 'beacon-stop-label' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: i === stageIndex ? 8 : 5, fillColor: '#fff', fillOpacity: 1, strokeColor: selectedRoute!.color, strokeWeight: i === stageIndex ? 4 : 2, labelOrigin: new google.maps.Point(0, -3) },
      zIndex: 1,
    }));
    if (selectedRoute) {
      const b = new google.maps.LatLngBounds();
      selectedRoute.path.forEach(p => b.extend(p));
      map.fitBounds(b, 50);
    }
  }, [map, selectedRoute, stageIndex]);

  // Vehicle markers, updated in place.
  useEffect(() => {
    if (!map) return;
    const visible = vehicles.filter(v => isPubliclyVisible(v, now));
    const seen = new Set<string>();
    for (const v of visible) {
      seen.add(v.vehicleId);
      const route = nairobiRoutes.find(r => r.number === v.routeId);
      const fresh = freshnessOf(v.lastReportAt, now);
      const followed = v.vehicleId === followedId;
      const icon: google.maps.Symbol = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: followed ? 11 : selectedRoute ? 8 : 6,
        fillColor: fresh === 'stale' ? '#9ca3af' : route?.color ?? '#3B82F6',
        fillOpacity: fresh === 'fresh' ? 1 : fresh === 'aging' ? 0.6 : 0.35,
        strokeColor: followed ? '#facc15' : '#1a1a2e',
        strokeWeight: followed ? 4 : 2,
      };
      const title = route ? `${v.plate} → ${directionLabel(route, v.direction)} · ${formatAge(v.lastReportAt, now)}` : v.plate;
      let mk = markers.current.get(v.vehicleId);
      if (!mk) {
        mk = new google.maps.Marker({ map, position: v.position, icon, title, zIndex: 10 });
        mk.addListener('click', () => clickRef.current?.(v.vehicleId));
        markers.current.set(v.vehicleId, mk);
      } else {
        mk.setPosition(v.position);
        mk.setIcon(icon);
        mk.setTitle(title);
      }
      if (followed) map.panTo(v.position);
    }
    for (const [id, mk] of markers.current) {
      if (!seen.has(id)) { mk.setMap(null); markers.current.delete(id); }
    }
  }, [map, vehicles, now, followedId, selectedRoute]);

  return <div ref={el} className="w-full h-full" />;
};

export default GoogleTrafficMap;
