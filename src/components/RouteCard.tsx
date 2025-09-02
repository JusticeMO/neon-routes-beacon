import { Clock, Users, MapPin } from 'lucide-react';

interface Route {
  id: number;
  number: string;
  name: string;
  color: 'neon-blue' | 'neon-green' | 'neon-orange' | 'neon-purple';
  eta: string;
  load: 'empty' | 'few' | 'full';
  fare: string;
}

interface RouteCardProps {
  route: Route;
  onSelect: (route: Route) => void;
}

const RouteCard = ({ route, onSelect }: RouteCardProps) => {
  const getLoadStatus = (load: string) => {
    switch (load) {
      case 'empty': return { text: 'Empty', color: 'text-success', bg: 'bg-success/20' };
      case 'few': return { text: 'Few Seats', color: 'text-warning', bg: 'bg-warning/20' };
      case 'full': return { text: 'Full', color: 'text-destructive', bg: 'bg-destructive/20' };
      default: return { text: 'Unknown', color: 'text-muted-foreground', bg: 'bg-muted/20' };
    }
  };

  const loadStatus = getLoadStatus(route.load);

  return (
    <div 
      onClick={() => onSelect(route)}
      className="glass-surface rounded-2xl p-4 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:bg-muted/5"
    >
      <div className="flex items-center justify-between">
        {/* Route info */}
        <div className="flex items-center space-x-4">
          {/* Route number with neon glow */}
          <div 
            className={`
              flex items-center justify-center w-12 h-12 rounded-xl font-bold text-lg
              bg-${route.color}/20 text-${route.color} border border-${route.color}/30
              animate-glow-pulse
            `}
          >
            {route.number}
          </div>
          
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">{route.name}</h3>
            <div className="flex items-center space-x-4 mt-1">
              <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>{route.eta}</span>
              </div>
              <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>{route.fare}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Load status */}
        <div className="text-right">
          <div 
            className={`
              inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium
              ${loadStatus.bg} ${loadStatus.color}
            `}
          >
            <Users className="w-3 h-3" />
            <span>{loadStatus.text}</span>
          </div>
        </div>
      </div>

      {/* Route preview path */}
      <div className="mt-4 pt-4 border-t border-border/20">
        <svg className="w-full h-8" viewBox="0 0 200 30">
          <path
            d="M10 15 Q50 10 100 15 T190 15"
            stroke={`hsl(var(--${route.color}))`}
            strokeWidth="3"
            fill="none"
            className="route-line"
            filter="url(#miniGlow)"
          />
          
          {/* Start and end dots */}
          <circle cx="10" cy="15" r="3" fill={`hsl(var(--${route.color}))`} />
          <circle cx="190" cy="15" r="3" fill={`hsl(var(--${route.color}))`} />
          
          <defs>
            <filter id="miniGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
        </svg>
      </div>
    </div>
  );
};

export default RouteCard;