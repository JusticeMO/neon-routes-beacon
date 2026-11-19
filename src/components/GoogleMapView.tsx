import { useEffect, useMemo } from 'react';
import { Plus, Minus, Navigation } from 'lucide-react';
import { Button } from './ui/button';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { nairobiRoutes, type Route } from '@/data/routes';
import { useTheme } from '@/contexts/ThemeContext';
import { freshnessOf, formatAge, isPubliclyVisible, type VehicleStatus } from '@/lib/tracking/vehicleStatus';
import { directionLabel } from '@/lib/tracking/routeGeometry';

interface GoogleMapViewProps {
  selectedRoute: Route | null;
  vehicles: VehicleStatus[];
  now: number;
  stageIndex?: number;
  followedId?: string | null;
  onVehicleClick?: (vehicleId: string) => void;
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

// Keep a followed vehicle in view
const FollowVehicle = ({ vehicle }: { vehicle: VehicleStatus | undefined }) => {
  const map = useMap();
  const lat = vehicle?.position.lat;
  const lng = vehicle?.position.lng;
  useEffect(() => {
    if (lat !== undefined && lng !== undefined) map.panTo([lat, lng], { animate: true });
  }, [lat, lng, map]);
  return null;
};

const GoogleMapView = ({ selectedRoute, vehicles, now, stageIndex, followedId, onVehicleClick }: GoogleMapViewProps) => {
  const { theme } = useTheme();

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
  const visibleVehicles = vehicles.filter(v => isPubliclyVisible(v, now));
  const followed = visibleVehicles.find(v => v.vehicleId === followedId);

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
            radius={i === stageIndex ? 8 : 5}
            pathOptions={{
              color: selectedRoute!.color,
              weight: i === stageIndex ? 4 : 2,
              fillColor: isDark ? '#0f0f1a' : '#ffffff',
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent className="neon-tooltip" direction="top" offset={[0, -8]}>
              {stop.name}
            </Tooltip>
          </CircleMarker>
        ))}

        <FollowVehicle vehicle={followed} />

        {/* Vehicle markers: route colour, dimmed by data age, ringed when followed */}
        {visibleVehicles.map(v => {
          const route = nairobiRoutes.find(r => r.number === v.routeId);
          const color = route?.color || '#3B82F6';
          const freshness = freshnessOf(v.lastReportAt, now);
          const isFollowed = v.vehicleId === followedId;
          const opacity = freshness === 'fresh' ? 1 : freshness === 'aging' ? 0.6 : 0.3;
          return (
            <CircleMarker
              key={v.vehicleId}
              center={[v.position.lat, v.position.lng]}
              radius={isFollowed ? 12 : selectedRoute ? 9 : 6}
              eventHandlers={{ click: () => onVehicleClick?.(v.vehicleId) }}
              pathOptions={{
                color: isFollowed ? '#facc15' : isDark ? '#ffffff' : '#1a1a2e',
                weight: isFollowed ? 4 : 2.5,
                fillColor: freshness === 'stale' ? '#9ca3af' : color,
                fillOpacity: opacity,
                opacity: Math.max(opacity, 0.5),
              }}
            >
              {selectedRoute && route && (
                <Tooltip direction="top" className="neon-tooltip">
                  {v.plate} {v.direction === 'outbound' ? '→' : '←'} {directionLabel(route, v.direction)} · {formatAge(v.lastReportAt, now)}
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
