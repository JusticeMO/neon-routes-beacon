import { useEffect, useRef, useState, useMemo } from 'react';
import { Navigation, Zap, Plus, Minus, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface Bus {
  id: number;
  route: string;
  position: { lat: number; lng: number };
  status: 'moving' | 'stop';
  load: 'few' | 'full' | 'empty';
  progress: number;
}

interface Route {
  id: number;
  number: string;
  color: string;
  path: { lat: number; lng: number }[];
}

const nairobiRoutes: Route[] = [
  {
    id: 1, number: '46', color: '#00d4ff',
    path: [
      { lat: -1.2921, lng: 36.8219 },
      { lat: -1.2975, lng: 36.8156 },
      { lat: -1.3028, lng: 36.8092 },
      { lat: -1.3082, lng: 36.8028 },
    ]
  },
  {
    id: 2, number: '34', color: '#00ff88',
    path: [
      { lat: -1.2841, lng: 36.8155 },
      { lat: -1.2789, lng: 36.8201 },
      { lat: -1.2736, lng: 36.8247 },
      { lat: -1.2683, lng: 36.8293 },
    ]
  },
  {
    id: 3, number: '15', color: '#ff6b00',
    path: [
      { lat: -1.3057, lng: 36.8106 },
      { lat: -1.3125, lng: 36.8064 },
      { lat: -1.3193, lng: 36.8022 },
      { lat: -1.3261, lng: 36.7980 },
    ]
  }
];

// Component to handle map controls
const MapControls = ({ onReset }: { onReset: () => void }) => {
  const map = useMap();
  return (
    <div className="absolute top-4 left-4 z-[1000] flex flex-col space-y-2">
      <Button variant="outline" size="icon" onClick={() => map.zoomIn()} className="glass-surface hover:bg-white/10">
        <Plus className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => map.zoomOut()} className="glass-surface hover:bg-white/10">
        <Minus className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => { map.setView([-1.2921, 36.8219], 13); onReset(); }} className="glass-surface hover:bg-white/10">
        <RotateCcw className="w-4 h-4" />
      </Button>
    </div>
  );
};

const GoogleMapView = () => {
  const [buses, setBuses] = useState<Bus[]>(() =>
    nairobiRoutes.map((route, i) => ({
      id: i + 1,
      route: route.number,
      position: route.path[0],
      status: 'moving',
      load: (['few', 'full', 'empty'] as const)[i % 3],
      progress: 0,
    }))
  );

  // Animate buses
  useEffect(() => {
    const interval = setInterval(() => {
      setBuses(prev => prev.map(bus => {
        if (bus.status !== 'moving') return bus;
        const route = nairobiRoutes.find(r => r.number === bus.route);
        if (!route) return bus;

        let p = bus.progress + 0.008;
        if (p >= route.path.length - 1) p = 0;

        const idx = Math.floor(p);
        const next = idx + 1;
        const t = p - idx;

        if (next < route.path.length) {
          const s = route.path[idx], e = route.path[next];
          return {
            ...bus,
            progress: p,
            position: {
              lat: s.lat + (e.lat - s.lat) * t,
              lng: s.lng + (e.lng - s.lng) * t,
            }
          };
        }
        return bus;
      }));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const routeLines = useMemo(() => nairobiRoutes.flatMap(route => {
    const path = route.path.map(p => [p.lat, p.lng] as [number, number]);
    return [
      <Polyline key={`${route.id}-glow`} positions={path} pathOptions={{ color: route.color, weight: 14, opacity: 0.2 }} />,
      <Polyline key={`${route.id}-mid`} positions={path} pathOptions={{ color: route.color, weight: 7, opacity: 0.5 }} />,
      <Polyline key={`${route.id}-core`} positions={path} pathOptions={{ color: route.color, weight: 2, opacity: 1 }} />,
    ];
  }), []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-surface">
      <MapContainer
        center={[-1.2921, 36.8219]}
        zoom={13}
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
        style={{ background: '#1a1a2e' }}
      >
        {/* Dark tile layer */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <MapControls onReset={() => {}} />

        {/* Neon route lines */}
        {routeLines}

        {/* Bus markers */}
        {buses.map(bus => {
          const route = nairobiRoutes.find(r => r.number === bus.route);
          const color = route?.color || '#00d4ff';
          return (
            <CircleMarker
              key={bus.id}
              center={[bus.position.lat, bus.position.lng]}
              radius={8}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: color,
                fillOpacity: 1,
              }}
            >
              <Tooltip permanent className="neon-tooltip">
                Route {bus.route}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* CBD indicator */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/4 z-[1000] pointer-events-none">
        <div className="flex items-center space-x-2 glass-surface px-4 py-2 rounded-lg animate-glow-pulse">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Nairobi CBD</span>
        </div>
      </div>

      {/* Route legend */}
      <div className="absolute top-4 right-4 z-[1000]">
        <div className="glass-surface p-4 rounded-lg">
          <h3 className="text-sm font-semibold mb-3">Active Routes</h3>
          <div className="space-y-2">
            {nairobiRoutes.map(route => (
              <div key={route.id} className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full animate-glow-pulse" style={{ backgroundColor: route.color }} />
                <span className="text-sm">Route {route.number}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-4 z-[1000]">
        <div className="glass-surface px-3 py-2 rounded-lg text-sm text-muted-foreground">
          OpenStreetMap | Live Tracking
        </div>
      </div>
    </div>
  );
};

export default GoogleMapView;
