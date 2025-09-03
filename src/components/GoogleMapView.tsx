import { useEffect, useRef, useState } from 'react';
import { Navigation, Zap, Plus, Minus, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';

interface Bus {
  id: number;
  route: string;
  position: { x: number; y: number; lat: number; lng: number };
  status: 'moving' | 'stop';
  load: 'few' | 'full' | 'empty';
  progress: number;
}

interface Route {
  id: number;
  number: string;
  color: string;
  path: { x: number; y: number; lat: number; lng: number }[];
}

const GoogleMapView = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [zoom, setZoom] = useState(12);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Mock Nairobi map coordinates converted to screen pixels
  const mockRoutes: Route[] = [
    {
      id: 1,
      number: '46',
      color: '#00d4ff',
      path: [
        { x: 400, y: 300, lat: -1.2921, lng: 36.8219 }, // CBD
        { x: 380, y: 340, lat: -1.2975, lng: 36.8156 },
        { x: 360, y: 380, lat: -1.3028, lng: 36.8092 },
        { x: 340, y: 420, lat: -1.3082, lng: 36.8028 }, // Kawangware
      ]
    },
    {
      id: 2,
      number: '34',
      color: '#00ff88',
      path: [
        { x: 420, y: 280, lat: -1.2841, lng: 36.8155 }, // CBD
        { x: 450, y: 260, lat: -1.2789, lng: 36.8201 },
        { x: 480, y: 240, lat: -1.2736, lng: 36.8247 },
        { x: 510, y: 220, lat: -1.2683, lng: 36.8293 }, // Kasarani
      ]
    },
    {
      id: 3,
      number: '15',
      color: '#ff6b00',
      path: [
        { x: 390, y: 320, lat: -1.3057, lng: 36.8106 }, // CBD
        { x: 370, y: 350, lat: -1.3125, lng: 36.8064 },
        { x: 350, y: 380, lat: -1.3193, lng: 36.8022 },
        { x: 330, y: 410, lat: -1.3261, lng: 36.7980 }, // Karen
      ]
    }
  ];

  useEffect(() => {
    // Initialize mock data
    setRoutes(mockRoutes);
    
    // Initialize buses
    const initialBuses: Bus[] = mockRoutes.map((route, index) => ({
      id: index + 1,
      route: route.number,
      position: route.path[0],
      status: Math.random() > 0.5 ? 'moving' : 'stop',
      load: ['few', 'full', 'empty'][Math.floor(Math.random() * 3)] as Bus['load'],
      progress: 0
    }));

    setBuses(initialBuses);
    setIsLoaded(true);

    // Animate buses
    const interval = setInterval(() => {
      setBuses(prevBuses => 
        prevBuses.map(bus => {
          if (bus.status !== 'moving') return bus;
          
          const route = mockRoutes.find(r => r.number === bus.route);
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
              x: start.x + (end.x - start.x) * segmentProgress,
              y: start.y + (end.y - start.y) * segmentProgress,
              lat: start.lat + (end.lat - start.lat) * segmentProgress,
              lng: start.lng + (end.lng - start.lng) * segmentProgress,
            };

            return { ...bus, position, progress: newProgress };
          }

          return bus;
        })
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 1, 18));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 1, 8));
  const handleReset = () => {
    setZoom(12);
    setPan({ x: 0, y: 0 });
  };

  const zoomScale = Math.pow(1.2, zoom - 12);

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-900">
      {/* Mock Google Maps base layer */}
      <div 
        ref={mapRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{
          backgroundImage: `
            radial-gradient(circle at 25% 25%, rgba(26, 26, 26, 0.8) 0%, transparent 50%),
            radial-gradient(circle at 75% 75%, rgba(40, 40, 40, 0.6) 0%, transparent 50%),
            linear-gradient(45deg, #1a1a1a 25%, transparent 25%),
            linear-gradient(-45deg, #1a1a1a 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #1a1a1a 75%),
            linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)
          `,
          backgroundSize: '60px 60px, 80px 80px, 20px 20px, 20px 20px, 20px 20px, 20px 20px',
          backgroundPosition: '0 0, 40px 40px, 0 0, 0 10px, 10px -10px, -10px 0px'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Street overlay */}
        <div className="absolute inset-0 opacity-30">
          <svg 
            width="100%" 
            height="100%" 
            className="absolute inset-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`
            }}
          >
            {/* Mock street grid */}
            <defs>
              <pattern id="streets" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M 0 50 L 100 50" stroke="#2c2c2c" strokeWidth="2"/>
                <path d="M 50 0 L 50 100" stroke="#2c2c2c" strokeWidth="2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#streets)" />
            
            {/* Major roads */}
            <path d="M 100 300 L 700 300" stroke="#3c3c3c" strokeWidth="4"/>
            <path d="M 400 100 L 400 500" stroke="#3c3c3c" strokeWidth="4"/>
            <path d="M 200 200 L 600 400" stroke="#3c3c3c" strokeWidth="3"/>
          </svg>
        </div>

        {/* Neon glowing routes */}
        <svg 
          width="100%" 
          height="100%" 
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`
          }}
        >
          <defs>
            {routes.map(route => (
              <filter key={route.id} id={`glow-${route.id}`}>
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge> 
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            ))}
          </defs>
          
          {routes.map(route => {
            const pathString = route.path.reduce((acc, point, index) => {
              return acc + (index === 0 ? `M ${point.x} ${point.y}` : ` L ${point.x} ${point.y}`);
            }, '');
            
            return (
              <g key={route.id}>
                {/* Outer glow */}
                <path
                  d={pathString}
                  stroke={route.color}
                  strokeWidth="12"
                  strokeOpacity="0.3"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Inner glow */}
                <path
                  d={pathString}
                  stroke={route.color}
                  strokeWidth="6"
                  strokeOpacity="0.6"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Core line */}
                <path
                  d={pathString}
                  stroke={route.color}
                  strokeWidth="2"
                  strokeOpacity="1"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter={`url(#glow-${route.id})`}
                  className="animate-glow-pulse"
                />
              </g>
            );
          })}
        </svg>

        {/* Bus markers */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`
          }}
        >
          {buses.map(bus => {
            const route = routes.find(r => r.number === bus.route);
            return (
              <div
                key={bus.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer"
                style={{
                  left: bus.position.x,
                  top: bus.position.y,
                  filter: `drop-shadow(0 0 8px ${route?.color || '#00d4ff'})`
                }}
              >
                <div 
                  className="w-4 h-4 rounded-full border-2 border-white animate-glow-pulse"
                  style={{ backgroundColor: route?.color || '#00d4ff' }}
                />
                <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs font-bold text-white bg-black/80 px-2 py-1 rounded whitespace-nowrap">
                  {bus.route}
                </div>
              </div>
            );
          })}
        </div>

        {/* Map labels */}
        <div 
          className="absolute inset-0 pointer-events-none text-gray-400 text-sm"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`
          }}
        >
          <div className="absolute" style={{ left: 380, top: 280 }}>
            <div className="bg-black/60 px-2 py-1 rounded text-white font-medium">
              Nairobi CBD
            </div>
          </div>
          <div className="absolute" style={{ left: 320, top: 400 }}>
            <div className="bg-black/60 px-2 py-1 rounded">Kawangware</div>
          </div>
          <div className="absolute" style={{ left: 500, top: 200 }}>
            <div className="bg-black/60 px-2 py-1 rounded">Kasarani</div>
          </div>
          <div className="absolute" style={{ left: 310, top: 390 }}>
            <div className="bg-black/60 px-2 py-1 rounded">Karen</div>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-glow-pulse w-16 h-16 bg-primary/20 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Navigation className="w-8 h-8 text-primary animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground">Loading mock map...</p>
          </div>
        </div>
      )}

      {/* Map controls */}
      {isLoaded && (
        <>
          {/* Zoom controls */}
          <div className="absolute top-4 left-4 z-20 flex flex-col space-y-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomIn}
              className="glass-surface hover:bg-white/10"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomOut}
              className="glass-surface hover:bg-white/10"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleReset}
              className="glass-surface hover:bg-white/10"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          {/* Map info */}
          <div className="absolute bottom-4 left-4 z-20">
            <div className="glass-surface px-3 py-2 rounded-lg text-sm text-muted-foreground">
              Zoom: {zoom} | Mock Google Maps
            </div>
          </div>

          {/* CBD indicator */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/4 z-10 pointer-events-none">
            <div className="flex items-center space-x-2 glass-surface px-4 py-2 rounded-lg animate-glow-pulse">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Nairobi CBD</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GoogleMapView;