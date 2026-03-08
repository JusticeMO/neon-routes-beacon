import { useEffect, useState, useMemo } from 'react';
import { Plus, Minus, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { nairobiRoutes } from '@/data/routes';
import { useTheme } from '@/contexts/ThemeContext';
import ThemeToggle from './ThemeToggle';

interface Bus {
  id: number;
  route: string;
  position: { lat: number; lng: number };
  status: 'moving' | 'stop';
  progress: number;
}

const TILE_URLS = {
  bright: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  live: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
};

const MapControls = ({ onReset }: { onReset: () => void }) => {
  const map = useMap();
  return (
    <div className="absolute bottom-24 right-4 z-[1000] flex flex-col space-y-2">
      <Button variant="outline" size="icon" onClick={() => map.zoomIn()} className="bg-card/90 backdrop-blur-md border-border/50 hover:bg-card text-foreground shadow-lg rounded-full w-10 h-10">
        <Plus className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => map.zoomOut()} className="bg-card/90 backdrop-blur-md border-border/50 hover:bg-card text-foreground shadow-lg rounded-full w-10 h-10">
        <Minus className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => { map.setView([-1.2864, 36.8172], 14); onReset(); }} className="bg-card/90 backdrop-blur-md border-border/50 hover:bg-card text-foreground shadow-lg rounded-full w-10 h-10">
        <RotateCcw className="w-4 h-4" />
      </Button>
    </div>
  );
};

const DynamicTileLayer = () => {
  const { theme } = useTheme();
  return <TileLayer key={theme} url={TILE_URLS[theme]} attribution='&copy; OpenStreetMap' />;
};

const GoogleMapView = () => {
  const { theme } = useTheme();
  // Track which routes are visible — all on by default
  const [activeRoutes, setActiveRoutes] = useState<Set<string>>(
    () => new Set(nairobiRoutes.map(r => r.number))
  );

  const toggleRoute = (routeNumber: string) => {
    setActiveRoutes(prev => {
      const next = new Set(prev);
      if (next.has(routeNumber)) {
        next.delete(routeNumber);
      } else {
        next.add(routeNumber);
      }
      return next;
    });
  };

  const visibleRoutes = useMemo(
    () => nairobiRoutes.filter(r => activeRoutes.has(r.number)),
    [activeRoutes]
  );

  const [buses, setBuses] = useState<Bus[]>(() =>
    nairobiRoutes.map((route, i) => ({
      id: i + 1,
      route: route.number,
      position: route.path[0],
      status: 'moving',
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

  const isDark = theme === 'dark' || theme === 'live';
  const glowIntensity = theme === 'live' ? 0.25 : theme === 'dark' ? 0.15 : 0.08;

  const routeLines = useMemo(() => visibleRoutes.flatMap(route => {
    const path = route.path.map(p => [p.lat, p.lng] as [number, number]);
    return [
      <Polyline key={`${route.id}-glow`} positions={path} pathOptions={{ color: route.color, weight: theme === 'live' ? 20 : 14, opacity: glowIntensity }} />,
      <Polyline key={`${route.id}-mid`} positions={path} pathOptions={{ color: route.color, weight: theme === 'live' ? 10 : 7, opacity: isDark ? 0.5 : 0.35 }} />,
      <Polyline key={`${route.id}-core`} positions={path} pathOptions={{ color: route.color, weight: 3, opacity: 1 }} />,
    ];
  }), [visibleRoutes, theme, isDark, glowIntensity]);

  const visibleBuses = buses.filter(b => activeRoutes.has(b.route));

  return (
    <div className="relative w-full h-full overflow-hidden">
      <MapContainer
        center={[-1.2864, 36.8172]}
        zoom={14}
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
        style={{ background: isDark ? 'hsl(220, 15%, 6%)' : 'hsl(210, 20%, 96%)' }}
      >
        <DynamicTileLayer />
        <MapControls onReset={() => {}} />
        {routeLines}

        {/* Bus stop markers — only for visible routes */}
        {visibleRoutes.flatMap(route =>
          route.stops.map((stop, i) => (
            <CircleMarker
              key={`stop-${route.id}-${i}`}
              center={[stop.lat, stop.lng]}
              radius={4}
              pathOptions={{
                color: route.color,
                weight: 1.5,
                fillColor: isDark ? '#0f0f1a' : '#ffffff',
                fillOpacity: 1,
                opacity: 0.9,
              }}
            >
              <Tooltip className="neon-tooltip" direction="top" offset={[0, -6]}>
                {stop.name}
              </Tooltip>
            </CircleMarker>
          ))
        )}

        {visibleBuses.map(bus => {
          const route = nairobiRoutes.find(r => r.number === bus.route);
          const color = route?.color || '#3B82F6';
          return (
            <CircleMarker
              key={bus.id}
              center={[bus.position.lat, bus.position.lng]}
              radius={7}
              pathOptions={{
                color: isDark ? '#ffffff' : '#1a1a2e',
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

      {/* Theme toggle — top left */}
      <div className="absolute top-4 left-4 z-[1000]">
        <ThemeToggle />
      </div>

      {/* Route legend with toggles — top right */}
      <div className="absolute top-4 right-4 z-[1000]">
        <div className="bg-card/90 backdrop-blur-xl p-3 rounded-2xl border border-border/30 shadow-xl min-w-[160px]">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Routes</h3>
          <div className="space-y-1">
            {nairobiRoutes.map(route => {
              const isActive = activeRoutes.has(route.number);
              return (
                <button
                  key={route.id}
                  onClick={() => toggleRoute(route.number)}
                  className={`
                    flex items-center w-full space-x-2 px-2 py-1.5 rounded-lg transition-all duration-200
                    ${isActive
                      ? 'hover:bg-muted/30'
                      : 'opacity-40 hover:opacity-60'
                    }
                  `}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all"
                    style={{
                      backgroundColor: route.color,
                      boxShadow: isActive && isDark ? `0 0 6px ${route.color}60` : 'none',
                    }}
                  />
                  <span className="text-xs font-medium flex-1 text-left">{route.name}</span>
                  {isActive ? (
                    <Eye className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom status */}
      <div className="absolute bottom-4 left-4 z-[1000]">
        <div className="bg-card/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-border/20 text-xs text-muted-foreground flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          {activeRoutes.size} of {nairobiRoutes.length} routes active
        </div>
      </div>
    </div>
  );
};

export default GoogleMapView;
