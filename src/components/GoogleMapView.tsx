import { useEffect, useState, useMemo, useCallback } from 'react';
import { Plus, Minus, Navigation } from 'lucide-react';
import { Button } from './ui/button';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { nairobiRoutes, type Route } from '@/data/routes';
import { useTheme } from '@/contexts/ThemeContext';

interface Bus {
  id: number;
  route: string;
  position: { lat: number; lng: number };
  status: 'moving' | 'stop';
  progress: number;
}

interface GoogleMapViewProps {
  selectedRoute: Route | null;
}

const TILE_URLS = {
  bright: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  live: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
};

const MapControls = () => {
  const map = useMap();
  return (
    <div className="absolute bottom-32 right-4 z-[1000] flex flex-col space-y-2">
      <Button variant="outline" size="icon" onClick={() => map.zoomIn()} className="bg-card/90 backdrop-blur-md border-border/50 hover:bg-card text-foreground shadow-lg rounded-full w-10 h-10">
        <Plus className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => map.zoomOut()} className="bg-card/90 backdrop-blur-md border-border/50 hover:bg-card text-foreground shadow-lg rounded-full w-10 h-10">
        <Minus className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => map.setView([-1.2864, 36.8172], 14)} className="bg-card/90 backdrop-blur-md border-border/50 hover:bg-card text-foreground shadow-lg rounded-full w-10 h-10">
        <Navigation className="w-4 h-4" />
      </Button>
    </div>
  );
};

const DynamicTileLayer = () => {
  const { theme } = useTheme();
  return <TileLayer key={theme} url={TILE_URLS[theme]} attribution='&copy; OpenStreetMap' />;
};

// Auto-fit map to selected route
const FitToRoute = ({ route }: { route: Route | null }) => {
  const map = useMap();
  useEffect(() => {
    if (!route) {
      map.setView([-1.2864, 36.8172], 14);
      return;
    }
    const lats = route.path.map(p => p.lat);
    const lngs = route.path.map(p => p.lng);
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [50, 50], maxZoom: 15 }
    );
  }, [route, map]);
  return null;
};

const GoogleMapView = ({ selectedRoute }: GoogleMapViewProps) => {
  const { theme } = useTheme();

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
          return { ...bus, progress: p, position: { lat: s.lat + (e.lat - s.lat) * t, lng: s.lng + (e.lng - s.lng) * t } };
        }
        return bus;
      }));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const isDark = theme === 'dark' || theme === 'live';
  const glowIntensity = theme === 'live' ? 0.25 : theme === 'dark' ? 0.15 : 0.08;

  // Show selected route prominently, others dimmed; if none selected show all dimmed
  const routeLines = useMemo(() => {
    const routesToShow = selectedRoute ? [selectedRoute] : nairobiRoutes;
    const dimRoutes = selectedRoute ? nairobiRoutes.filter(r => r.id !== selectedRoute.id) : [];

    return [
      // Dimmed background routes
      ...dimRoutes.flatMap(route => {
        const path = route.path.map(p => [p.lat, p.lng] as [number, number]);
        return [
          <Polyline key={`${route.id}-dim`} positions={path} pathOptions={{ color: route.color, weight: 3, opacity: 0.15 }} />,
        ];
      }),
      // Active routes
      ...routesToShow.flatMap(route => {
        const path = route.path.map(p => [p.lat, p.lng] as [number, number]);
        const isSelected = selectedRoute?.id === route.id;
        return [
          <Polyline key={`${route.id}-glow`} positions={path} pathOptions={{ color: route.color, weight: isSelected ? 22 : 14, opacity: isSelected ? glowIntensity * 1.5 : glowIntensity }} />,
          <Polyline key={`${route.id}-mid`} positions={path} pathOptions={{ color: route.color, weight: isSelected ? 12 : 7, opacity: isDark ? 0.5 : 0.35 }} />,
          <Polyline key={`${route.id}-core`} positions={path} pathOptions={{ color: route.color, weight: isSelected ? 4 : 3, opacity: 1 }} />,
        ];
      }),
    ];
  }, [selectedRoute, theme, isDark, glowIntensity]);

  // Only show stops for selected route
  const visibleStops = selectedRoute ? selectedRoute.stops : [];
  const visibleBuses = selectedRoute
    ? buses.filter(b => b.route === selectedRoute.number)
    : buses;

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
        <FitToRoute route={selectedRoute} />
        <MapControls />
        {routeLines}

        {/* Bus stop markers */}
        {visibleStops.map((stop, i) => (
          <CircleMarker
            key={`stop-${selectedRoute!.id}-${i}`}
            center={[stop.lat, stop.lng]}
            radius={5}
            pathOptions={{
              color: selectedRoute!.color,
              weight: 2,
              fillColor: isDark ? '#0f0f1a' : '#ffffff',
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent className="neon-tooltip" direction="top" offset={[0, -8]}>
              {stop.name}
            </Tooltip>
          </CircleMarker>
        ))}

        {/* Bus markers */}
        {visibleBuses.map(bus => {
          const route = nairobiRoutes.find(r => r.number === bus.route);
          const color = route?.color || '#3B82F6';
          return (
            <CircleMarker
              key={bus.id}
              center={[bus.position.lat, bus.position.lng]}
              radius={selectedRoute ? 9 : 6}
              pathOptions={{
                color: isDark ? '#ffffff' : '#1a1a2e',
                weight: 2.5,
                fillColor: color,
                fillOpacity: 1,
              }}
            >
              {selectedRoute && (
                <Tooltip permanent className="neon-tooltip">
                  🚌 Route {bus.route}
                </Tooltip>
              )}
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Map zoom controls are inside MapContainer */}
    </div>
  );
};

export default GoogleMapView;
