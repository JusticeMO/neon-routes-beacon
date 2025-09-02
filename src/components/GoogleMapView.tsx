import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Navigation, Zap, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';

/// <reference types="@types/google.maps" />

interface Bus {
  id: number;
  route: string;
  position: google.maps.LatLng;
  status: 'moving' | 'stop';
  load: 'few' | 'full' | 'empty';
  direction: number; // bearing in degrees
}

interface Route {
  id: number;
  number: string;
  color: string;
  path: google.maps.LatLng[];
}

const GoogleMapView = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiInput, setShowApiInput] = useState(true);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);

  const busMarkers = useRef<Map<number, google.maps.Marker>>(new Map());
  const routePolylines = useRef<Map<number, google.maps.Polyline[]>>(new Map());
  const animationIntervals = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const initializeMap = async (key: string) => {
    if (!mapRef.current) return;

    try {
      const loader = new Loader({
        apiKey: key,
        version: 'weekly',
        libraries: ['geometry']
      });

      await loader.load();

      const map = new google.maps.Map(mapRef.current, {
        center: { lat: -1.2921, lng: 36.8219 }, // Nairobi CBD
        zoom: 12,
        styles: [
          // Dark theme Google Maps style
          { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
          {
            featureType: 'administrative.locality',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#c4c4c4' }]
          },
          {
            featureType: 'poi',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#8a8a8a' }]
          },
          {
            featureType: 'poi.park',
            elementType: 'geometry',
            stylers: [{ color: '#263c3f' }]
          },
          {
            featureType: 'poi.park',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#6b9a76' }]
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#2c2c2c' }]
          },
          {
            featureType: 'road',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#212a37' }]
          },
          {
            featureType: 'road',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#9ca5b3' }]
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry',
            stylers: [{ color: '#3c3c3c' }]
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#1f2835' }]
          },
          {
            featureType: 'road.highway',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#f3d19c' }]
          },
          {
            featureType: 'transit',
            elementType: 'geometry',
            stylers: [{ color: '#2f3948' }]
          },
          {
            featureType: 'transit.station',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#d59563' }]
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#17263c' }]
          },
          {
            featureType: 'water',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#515c6d' }]
          },
          {
            featureType: 'water',
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#17263c' }]
          }
        ],
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });

      mapInstance.current = map;
      
      // Initialize routes after Google Maps is loaded
      const initializedRoutes = [
        {
          id: 1,
          number: '46',
          color: '#00d4ff', // neon-blue
          path: [
            new google.maps.LatLng(-1.2921, 36.8219), // CBD
            new google.maps.LatLng(-1.2975, 36.8156),
            new google.maps.LatLng(-1.3028, 36.8092),
            new google.maps.LatLng(-1.3082, 36.8028), // Kawangware
          ]
        },
        {
          id: 2,
          number: '34',
          color: '#00ff88', // neon-green
          path: [
            new google.maps.LatLng(-1.2841, 36.8155), // CBD
            new google.maps.LatLng(-1.2789, 36.8201),
            new google.maps.LatLng(-1.2736, 36.8247),
            new google.maps.LatLng(-1.2683, 36.8293), // Kasarani
          ]
        },
        {
          id: 3,
          number: '15',
          color: '#ff6b00', // neon-orange
          path: [
            new google.maps.LatLng(-1.3057, 36.8106), // CBD
            new google.maps.LatLng(-1.3125, 36.8064),
            new google.maps.LatLng(-1.3193, 36.8022),
            new google.maps.LatLng(-1.3261, 36.7980), // Karen
          ]
        }
      ];
      
      setRoutes(initializedRoutes);
      
      // Initialize routes and buses
      createGlowingRoutes(map, initializedRoutes);
      initializeBuses(initializedRoutes);
      setIsLoaded(true);
      setShowApiInput(false);

    } catch (error) {
      console.error('Error loading Google Maps:', error);
    }
  };

  const createGlowingRoutes = (map: google.maps.Map, routesToCreate: Route[]) => {
    routesToCreate.forEach(route => {
      const routeSegments: google.maps.Polyline[] = [];
      
      // Create multiple polylines for glow effect
      for (let i = 0; i < 3; i++) {
        const polyline = new google.maps.Polyline({
          path: route.path,
          geodesic: true,
          strokeColor: route.color,
          strokeOpacity: i === 0 ? 0.8 : 0.3,
          strokeWeight: i === 0 ? 4 : (8 + i * 4),
          map: map,
          zIndex: 10 - i
        });
        
        routeSegments.push(polyline);
      }
      
      routePolylines.current.set(route.id, routeSegments);
    });
  };

  const initializeBuses = (routesToUse: Route[]) => {
    const initialBuses: Bus[] = routesToUse.map((route, index) => ({
      id: index + 1,
      route: route.number,
      position: route.path[0],
      status: Math.random() > 0.5 ? 'moving' : 'stop',
      load: ['few', 'full', 'empty'][Math.floor(Math.random() * 3)] as Bus['load'],
      direction: 0
    }));

    setBuses(initialBuses);
    
    initialBuses.forEach(bus => {
      createBusMarker(bus);
      if (bus.status === 'moving') {
        startBusAnimation(bus);
      }
    });
  };

  const createBusMarker = (bus: Bus) => {
    if (!mapInstance.current) return;

    // Create custom neon bus icon
    const busIcon = {
      path: 'M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2Z',
      fillColor: routes.find(r => r.number === bus.route)?.color || '#00d4ff',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 0.8,
      anchor: new google.maps.Point(12, 12)
    };

    const marker = new google.maps.Marker({
      position: bus.position,
      map: mapInstance.current,
      icon: busIcon,
      title: `Route ${bus.route} - ${bus.status === 'moving' ? 'Moving' : 'Stopped'}`,
      zIndex: 100
    });

    // Add glow effect with CSS
    const markerElement = marker.get('element');
    if (markerElement) {
      markerElement.style.filter = 'drop-shadow(0 0 10px ' + (routes.find(r => r.number === bus.route)?.color || '#00d4ff') + ')';
    }

    busMarkers.current.set(bus.id, marker);
  };

  const startBusAnimation = (bus: Bus) => {
    const route = routes.find(r => r.number === bus.route);
    if (!route) return;

    let currentSegment = 0;
    let progress = 0;
    const speed = 0.01; // Adjust for animation speed

    const animate = () => {
      if (currentSegment >= route.path.length - 1) {
        currentSegment = 0;
        progress = 0;
      }

      const start = route.path[currentSegment];
      const end = route.path[currentSegment + 1];
      
      if (start && end) {
        const lat = start.lat() + (end.lat() - start.lat()) * progress;
        const lng = start.lng() + (end.lng() - start.lng()) * progress;
        const newPosition = new google.maps.LatLng(lat, lng);

        // Update bus position
        const marker = busMarkers.current.get(bus.id);
        if (marker) {
          marker.setPosition(newPosition);
          
          // Create trailing glow effect
          createTrailEffect(newPosition, route.color);
        }

        progress += speed;
        if (progress >= 1) {
          currentSegment++;
          progress = 0;
        }
      }
    };

    const intervalId = setInterval(animate, 50);
    animationIntervals.current.set(bus.id, intervalId);
  };

  const createTrailEffect = (position: google.maps.LatLng, color: string) => {
    if (!mapInstance.current) return;

    // Create a temporary glow circle that fades out
    const circle = new google.maps.Circle({
      center: position,
      radius: 50,
      fillColor: color,
      fillOpacity: 0.3,
      strokeColor: color,
      strokeOpacity: 0.6,
      strokeWeight: 2,
      map: mapInstance.current
    });

    // Fade out and remove
    setTimeout(() => {
      let opacity = 0.3;
      const fadeInterval = setInterval(() => {
        opacity -= 0.05;
        if (opacity <= 0) {
          circle.setMap(null);
          clearInterval(fadeInterval);
        } else {
          circle.setOptions({
            fillOpacity: opacity,
            strokeOpacity: opacity * 2
          });
        }
      }, 50);
    }, 100);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      animationIntervals.current.forEach(interval => {
        clearInterval(interval);
      });
    };
  }, []);

  const handleApiKeySubmit = () => {
    if (apiKey.trim()) {
      initializeMap(apiKey.trim());
    }
  };

  if (showApiInput) {
    return (
      <div className="relative w-full h-full bg-background flex items-center justify-center">
        <Card className="p-6 max-w-md w-full mx-4 glass-surface">
          <div className="text-center mb-6">
            <Zap className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Google Maps API Key Required</h3>
            <p className="text-sm text-muted-foreground">
              Enter your Google Maps API key to enable real-time mapping with neon route overlays.
            </p>
          </div>
          
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Enter Google Maps API key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleApiKeySubmit()}
            />
            
            <Button 
              onClick={handleApiKeySubmit} 
              className="w-full"
              disabled={!apiKey.trim()}
            >
              Initialize Map
            </Button>
            
            <div className="text-xs text-muted-foreground">
              <p>Get your API key from: <strong>console.cloud.google.com</strong></p>
              <p>Enable: Maps JavaScript API & Places API</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Google Maps Container */}
      <div ref={mapRef} className="w-full h-full" />
      
      {/* Loading overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-glow-pulse w-16 h-16 bg-primary/20 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Navigation className="w-8 h-8 text-primary animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground">Initializing Google Maps...</p>
          </div>
        </div>
      )}

      {/* Map controls overlay */}
      {isLoaded && (
        <>
          {/* CBD Landmark */}
          <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className="flex items-center space-x-2 glass-surface px-4 py-2 rounded-lg animate-glow-pulse">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Nairobi CBD</span>
            </div>
          </div>

          {/* API Key Settings */}
          <div className="absolute top-4 right-4 z-20">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowApiInput(true)}
              className="glass-surface"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default GoogleMapView;