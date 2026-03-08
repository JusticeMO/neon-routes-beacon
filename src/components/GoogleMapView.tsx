import { useEffect, useState, useMemo } from 'react';
import { Zap, Plus, Minus, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { nairobiRoutes, type Route } from '@/data/routes';

interface Bus {
  id: number;
  route: string;
  position: { lat: number; lng: number };
  status: 'moving' | 'stop';
  load: 'few' | 'full' | 'empty';
  progress: number;
}

const MapControls = ({ onReset }: { onReset: () => void }) => {
  const map = useMap();
  return (
    <div className="absolute top-4 left-4 z-[1000] flex flex-col space-y-2">
      <Button variant="outline" size="icon" onClick={() => map.zoomIn()} className="bg-card/90 backdrop-blur-md border-border/50 hover:bg-card text-foreground shadow-lg">
        <Plus className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => map.zoomOut()} className="bg-card/90 backdrop-blur-md border-border/50 hover:bg-card text-foreground shadow-lg">
        <Minus className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => { map.setView([-1.2864, 36.8172], 14); onReset(); }} className="bg-card/90 backdrop-blur-md border-border/50 hover:bg-card text-foreground shadow-lg">
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

  useEffect(() => {
    const interval = setInterval(() => {
      setBuses(prev => prev.map(bus => {
        if (bus.status !== 'moving') return bus;
        const route = nairobiRoutes.find(r => r.number === bus.route);
        if (!route) return bus;

        let p = bus.progress + 0.003;
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
      <Polyline key={`${route.id}-glow`} positions={path} pathOptions={{ color: route.color, weight: 16, opacity: 0.15 }} />,
      <Polyline key={`${route.id}-mid`} positions={path} pathOptions={{ color: route.color, weight: 8, opacity: 0.4 }} />,
      <Polyline key={`${route.id}-core`} positions={path} pathOptions={{ color: route.color, weight: 3, opacity: 1 }} />,
    ];
  }), []);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <MapContainer
        center={[-1.2864, 36.8172]}
        zoom={14}
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
        style={{ background: 'hsl(220, 15%, 6%)' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap'
        />

        <MapControls onReset={() => {}} />

        {routeLines}

        {buses.map(bus => {
          const route = nairobiRoutes.find(r => r.number === bus.route);
          const color = route?.color || '#3B82F6';
          return (
            <CircleMarker
              key={bus.id}
              center={[bus.position.lat, bus.position.lng]}
              radius={7}
              pathOptions={{
                color: '#ffffff',
                weight: 2.5,
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

      {/* Route legend */}
      <div className="absolute top-4 right-4 z-[1000]">
        <div className="bg-card/90 backdrop-blur-xl p-4 rounded-2xl border border-border/30 shadow-xl">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Live Routes</h3>
          <div className="space-y-2.5">
            {nairobiRoutes.map(route => (
              <div key={route.id} className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: route.color, boxShadow: `0 0 8px ${route.color}60` }} />
                <span className="text-sm font-medium">{route.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-4 z-[1000]">
        <div className="bg-card/80 backdrop-blur-md px-4 py-2 rounded-xl border border-border/20 text-xs text-muted-foreground flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          Live Tracking Active
        </div>
      </div>
    </div>
  );
};

export default GoogleMapView;
