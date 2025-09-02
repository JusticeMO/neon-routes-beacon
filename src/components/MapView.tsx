import { useState } from 'react';
import { MapPin, Navigation, Zap } from 'lucide-react';

const MapView = () => {
  const [buses] = useState([
    { id: 1, route: '46', lat: -1.2921, lng: 36.8219, status: 'moving', load: 'few' },
    { id: 2, route: '34', lat: -1.2841, lng: 36.8155, status: 'stop', load: 'full' },
    { id: 3, route: '15', lat: -1.3057, lng: 36.8106, status: 'moving', load: 'empty' },
  ]);

  const [routes] = useState([
    { id: 1, number: '46', color: 'neon-blue', path: 'CBD - Kawangware' },
    { id: 2, number: '34', color: 'neon-green', path: 'CBD - Kasarani' },
    { id: 3, number: '15', color: 'neon-orange', path: 'CBD - Karen' },
  ]);

  return (
    <div className="relative w-full h-full bg-card overflow-hidden">
      {/* Map background simulation */}
      <div className="absolute inset-0 bg-gradient-to-br from-muted/10 to-background">
        {/* Grid overlay for map feel */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(hsl(var(--border)) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px'
          }}
        />
      </div>

      {/* Route lines */}
      <svg className="absolute inset-0 w-full h-full">
        {/* Route 46 - Blue */}
        <path
          d="M100 300 Q300 200 500 300 T900 250"
          stroke="hsl(var(--neon-blue))"
          strokeWidth="4"
          fill="none"
          className="route-line glow-blue"
          filter="url(#glow)"
        />
        
        {/* Route 34 - Green */}
        <path
          d="M150 500 Q400 400 650 450 T950 400"
          stroke="hsl(var(--neon-green))"
          strokeWidth="4"
          fill="none"
          className="route-line glow-green"
          filter="url(#glow)"
        />
        
        {/* Route 15 - Orange */}
        <path
          d="M200 600 Q450 550 700 580 T1000 600"
          stroke="hsl(var(--neon-orange))"
          strokeWidth="4"
          fill="none"
          className="route-line glow-orange"
          filter="url(#glow)"
        />

        {/* Glow filter definition */}
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Bus markers */}
      {buses.map((bus) => (
        <div
          key={bus.id}
          className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
          style={{
            left: `${(bus.lng + 36.9) * 300}px`,
            top: `${(bus.lat + 1.4) * 400}px`,
          }}
        >
          <div 
            className={`
              relative p-2 rounded-full glass-surface animate-glow-pulse
              ${bus.status === 'moving' ? 'bg-primary/20' : 'bg-warning/20'}
            `}
          >
            <div className="flex items-center justify-center w-8 h-8">
              {bus.status === 'moving' ? (
                <Navigation className="w-4 h-4 text-primary" />
              ) : (
                <MapPin className="w-4 h-4 text-warning" />
              )}
            </div>
            
            {/* Route number badge */}
            <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
              {bus.route}
            </div>
          </div>
        </div>
      ))}

      {/* Key landmarks */}
      <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="flex items-center space-x-2 glass-surface px-4 py-2 rounded-lg">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">CBD</span>
        </div>
      </div>

      {/* Interactive hotspots */}
      <div className="absolute bottom-1/4 right-1/4 z-10">
        <div className="w-3 h-3 bg-accent rounded-full animate-glow-pulse" />
      </div>
      
      <div className="absolute top-1/4 right-1/3 z-10">
        <div className="w-3 h-3 bg-neon-green rounded-full animate-glow-pulse" />
      </div>
    </div>
  );
};

export default MapView;