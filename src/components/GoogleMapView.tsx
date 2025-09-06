import { useEffect, useRef, useState } from 'react';
import { Navigation, Zap, Plus, Minus, RotateCcw, Key } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Loader } from '@googlemaps/js-api-loader';

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

const GoogleMapView = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [showApiInput, setShowApiInput] = useState(true);
  const [routePolylines, setRoutePolylines] = useState<google.maps.Polyline[]>([]);
  const [busMarkers, setBusMarkers] = useState<google.maps.Marker[]>([]);

  // Nairobi bus routes with real coordinates
  const nairobiRoutes: Route[] = [
    {
      id: 1,
      number: '46',
      color: '#00d4ff',
      path: [
        { lat: -1.2921, lng: 36.8219 }, // CBD
        { lat: -1.2975, lng: 36.8156 },
        { lat: -1.3028, lng: 36.8092 },
        { lat: -1.3082, lng: 36.8028 }, // Kawangware
      ]
    },
    {
      id: 2,
      number: '34',
      color: '#00ff88',
      path: [
        { lat: -1.2841, lng: 36.8155 }, // CBD
        { lat: -1.2789, lng: 36.8201 },
        { lat: -1.2736, lng: 36.8247 },
        { lat: -1.2683, lng: 36.8293 }, // Kasarani
      ]
    },
    {
      id: 3,
      number: '15',
      color: '#ff6b00',
      path: [
        { lat: -1.3057, lng: 36.8106 }, // CBD
        { lat: -1.3125, lng: 36.8064 },
        { lat: -1.3193, lng: 36.8022 },
        { lat: -1.3261, lng: 36.7980 }, // Karen
      ]
    }
  ];

  const initializeMap = async () => {
    if (!mapRef.current || !apiKey) return;

    try {
      const loader = new Loader({
        apiKey: apiKey,
        version: "weekly",
        libraries: ["places"]
      });

      await loader.load();
      
      const mapInstance = new google.maps.Map(mapRef.current, {
        center: { lat: -1.2921, lng: 36.8219 }, // Nairobi CBD
        zoom: 12,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
          {
            featureType: "administrative.locality",
            elementType: "labels.text.fill",
            stylers: [{ color: "#d59563" }]
          },
          {
            featureType: "poi",
            elementType: "labels.text.fill",
            stylers: [{ color: "#d59563" }]
          },
          {
            featureType: "poi.park",
            elementType: "geometry",
            stylers: [{ color: "#263c3f" }]
          },
          {
            featureType: "poi.park",
            elementType: "labels.text.fill",
            stylers: [{ color: "#6b9a76" }]
          },
          {
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#38414e" }]
          },
          {
            featureType: "road",
            elementType: "geometry.stroke",
            stylers: [{ color: "#212a37" }]
          },
          {
            featureType: "road",
            elementType: "labels.text.fill",
            stylers: [{ color: "#9ca5b3" }]
          },
          {
            featureType: "road.highway",
            elementType: "geometry",
            stylers: [{ color: "#746855" }]
          },
          {
            featureType: "road.highway",
            elementType: "geometry.stroke",
            stylers: [{ color: "#1f2835" }]
          },
          {
            featureType: "road.highway",
            elementType: "labels.text.fill",
            stylers: [{ color: "#f3d19c" }]
          },
          {
            featureType: "transit",
            elementType: "geometry",
            stylers: [{ color: "#2f3948" }]
          },
          {
            featureType: "transit.station",
            elementType: "labels.text.fill",
            stylers: [{ color: "#d59563" }]
          },
          {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#17263c" }]
          },
          {
            featureType: "water",
            elementType: "labels.text.fill",
            stylers: [{ color: "#515c6d" }]
          },
          {
            featureType: "water",
            elementType: "labels.text.stroke",
            stylers: [{ color: "#17263c" }]
          }
        ]
      });

      setMap(mapInstance);
      
      // Initialize routes and buses
      setRoutes(nairobiRoutes);
      
      // Initialize buses
      const initialBuses: Bus[] = nairobiRoutes.map((route, index) => ({
        id: index + 1,
        route: route.number,
        position: route.path[0],
        status: Math.random() > 0.5 ? 'moving' : 'stop',
        load: ['few', 'full', 'empty'][Math.floor(Math.random() * 3)] as Bus['load'],
        progress: 0
      }));

      setBuses(initialBuses);
      createRouteOverlays(mapInstance, nairobiRoutes);
      createBusMarkers(mapInstance, initialBuses, nairobiRoutes);
      setIsLoaded(true);
      
    } catch (error) {
      console.error('Error loading Google Maps:', error);
    }
  };

  const createRouteOverlays = (mapInstance: google.maps.Map, routeData: Route[]) => {
    // Clear existing polylines
    routePolylines.forEach(polyline => polyline.setMap(null));
    
    const newPolylines = routeData.map(route => {
      // Create multiple polylines for neon glow effect
      const outerGlow = new google.maps.Polyline({
        path: route.path,
        geodesic: true,
        strokeColor: route.color,
        strokeOpacity: 0.3,
        strokeWeight: 12,
        map: mapInstance,
      });

      const innerGlow = new google.maps.Polyline({
        path: route.path,
        geodesic: true,
        strokeColor: route.color,
        strokeOpacity: 0.6,
        strokeWeight: 6,
        map: mapInstance,
      });

      const coreLine = new google.maps.Polyline({
        path: route.path,
        geodesic: true,
        strokeColor: route.color,
        strokeOpacity: 1,
        strokeWeight: 2,
        map: mapInstance,
      });

      return [outerGlow, innerGlow, coreLine];
    }).flat();

    setRoutePolylines(newPolylines);
  };

  const createBusMarkers = (mapInstance: google.maps.Map, busData: Bus[], routeData: Route[]) => {
    // Clear existing markers
    busMarkers.forEach(marker => marker.setMap(null));
    
    const newMarkers = busData.map(bus => {
      const route = routeData.find(r => r.number === bus.route);
      
      // Create custom glowing marker
      const marker = new google.maps.Marker({
        position: bus.position,
        map: mapInstance,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: route?.color || '#00d4ff',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        title: `Route ${bus.route}`,
      });

      return marker;
    });

    setBusMarkers(newMarkers);
  };

  useEffect(() => {
    if (apiKey) {
      initializeMap();
    }
  }, [apiKey]);

  // Animate buses
  useEffect(() => {
    if (!map || buses.length === 0) return;

    const interval = setInterval(() => {
      setBuses(prevBuses => {
        const updatedBuses = prevBuses.map(bus => {
          if (bus.status !== 'moving') return bus;
          
          const route = nairobiRoutes.find(r => r.number === bus.route);
          if (!route) return bus;

          let newProgress = bus.progress + 0.005;
          if (newProgress >= route.path.length - 1) {
            newProgress = 0;
          }

          const currentIndex = Math.floor(newProgress);
          const nextIndex = currentIndex + 1;
          const segmentProgress = newProgress - currentIndex;

          if (nextIndex < route.path.length) {
            const start = route.path[currentIndex];
            const end = route.path[nextIndex];
            
            const position = {
              lat: start.lat + (end.lat - start.lat) * segmentProgress,
              lng: start.lng + (end.lng - start.lng) * segmentProgress,
            };

            return { ...bus, position, progress: newProgress };
          }

          return bus;
        });

        // Update marker positions
        updatedBuses.forEach((bus, index) => {
          if (busMarkers[index]) {
            busMarkers[index].setPosition(bus.position);
          }
        });

        return updatedBuses;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [map, buses.length, busMarkers]);

  const handleApiKeySubmit = () => {
    if (apiKey.trim()) {
      setShowApiInput(false);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-surface">
      {/* API Key Input */}
      {showApiInput && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-surface p-8 rounded-2xl max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary/20 rounded-full mx-auto mb-4 flex items-center justify-center animate-glow-pulse">
                <Key className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Connect to Google Maps</h2>
              <p className="text-sm text-muted-foreground">
                Enter your Google Maps API key to enable real-time mapping
              </p>
            </div>
            <div className="space-y-4">
              <Input
                type="text"
                placeholder="Your Google Maps API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="bg-background/50"
              />
              <Button 
                onClick={handleApiKeySubmit}
                className="w-full"
                disabled={!apiKey.trim()}
              >
                Connect Map
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Get your free API key at{' '}
                <a 
                  href="https://developers.google.com/maps/documentation/javascript/get-api-key" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Maps Platform
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Google Maps Container */}
      <div 
        ref={mapRef}
        className="w-full h-full"
      />

      {/* Custom Overlay for Neon Effects */}
      <div 
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-10"
      />

      {/* Loading overlay */}
      {!isLoaded && !showApiInput && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-20">
          <div className="text-center">
            <div className="animate-glow-pulse w-16 h-16 bg-primary/20 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Navigation className="w-8 h-8 text-primary animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground">Loading Google Maps...</p>
          </div>
        </div>
      )}

      {/* Map controls */}
      {isLoaded && map && (
        <>
          {/* Custom zoom controls */}
          <div className="absolute top-4 left-4 z-20 flex flex-col space-y-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => map.setZoom((map.getZoom() || 12) + 1)}
              className="glass-surface hover:bg-white/10"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => map.setZoom((map.getZoom() || 12) - 1)}
              className="glass-surface hover:bg-white/10"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                map.setCenter({ lat: -1.2921, lng: 36.8219 });
                map.setZoom(12);
              }}
              className="glass-surface hover:bg-white/10"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          {/* Map info */}
          <div className="absolute bottom-4 left-4 z-20">
            <div className="glass-surface px-3 py-2 rounded-lg text-sm text-muted-foreground">
              Zoom: {map.getZoom()?.toFixed(0) || 12} | Google Maps
            </div>
          </div>

          {/* CBD indicator */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/4 z-10 pointer-events-none">
            <div className="flex items-center space-x-2 glass-surface px-4 py-2 rounded-lg animate-glow-pulse">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Nairobi CBD</span>
            </div>
          </div>

          {/* Route legend */}
          <div className="absolute top-4 right-4 z-20">
            <div className="glass-surface p-4 rounded-lg">
              <h3 className="text-sm font-semibold mb-3">Active Routes</h3>
              <div className="space-y-2">
                {routes.map(route => (
                  <div key={route.id} className="flex items-center space-x-3">
                    <div 
                      className="w-3 h-3 rounded-full animate-glow-pulse"
                      style={{ backgroundColor: route.color }}
                    />
                    <span className="text-sm">Route {route.number}</span>
                    <div className="flex space-x-1">
                      {buses
                        .filter(bus => bus.route === route.number)
                        .map(bus => (
                          <div
                            key={bus.id}
                            className={`w-2 h-2 rounded-full ${
                              bus.status === 'moving' ? 'animate-pulse' : ''
                            }`}
                            style={{ backgroundColor: route.color }}
                            title={`${bus.status} - ${bus.load} seats`}
                          />
                        ))
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GoogleMapView;