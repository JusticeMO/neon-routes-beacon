import { useState, useRef } from 'react';
import { X, Clock, Users, MapPin, ChevronUp, Banknote, ArrowRight } from 'lucide-react';
import { type Route } from '@/data/routes';

interface RouteBottomSheetProps {
  route: Route;
  onClose: () => void;
}

const RouteBottomSheet = ({ route, onClose }: RouteBottomSheetProps) => {
  const [expanded, setExpanded] = useState(false);

  // Simulated data
  const eta = ['3 min', '7 min', '5 min', '12 min'][route.id - 1] || '5 min';
  const fare = ['KSh 60', 'KSh 80', 'KSh 100', 'KSh 50'][route.id - 1] || 'KSh 70';
  const seats = ['Few Seats', 'Full', 'Available', 'Few Seats'][route.id - 1] || 'Available';
  const seatsColor = seats === 'Full' ? 'text-destructive' : seats === 'Available' ? 'text-accent' : 'text-warning';
  const seatsBg = seats === 'Full' ? 'bg-destructive/10' : seats === 'Available' ? 'bg-accent/10' : 'bg-warning/10';

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1001] animate-fade-in">
      {/* Handle bar + main info */}
      <div className="bg-card/95 backdrop-blur-xl rounded-t-3xl border-t border-x border-border/30 shadow-[0_-8px_30px_rgba(0,0,0,0.15)]">
        {/* Drag handle */}
        <button onClick={() => setExpanded(!expanded)} className="w-full flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </button>

        {/* Route header */}
        <div className="px-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-md" style={{ backgroundColor: route.color }}>
                {route.number}
              </div>
              <div>
                <h3 className="font-bold text-base">{route.name}</h3>
                <p className="text-xs text-muted-foreground">{route.stops.length} stops</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-muted/30 transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <Clock className="w-4 h-4 mx-auto mb-1 text-primary" />
              <div className="text-sm font-bold">{eta}</div>
              <div className="text-[10px] text-muted-foreground">Next Bus</div>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 text-center">
              <Banknote className="w-4 h-4 mx-auto mb-1 text-accent" />
              <div className="text-sm font-bold">{fare}</div>
              <div className="text-[10px] text-muted-foreground">Fare</div>
            </div>
            <div className={`${seatsBg} rounded-xl p-3 text-center`}>
              <Users className={`w-4 h-4 mx-auto mb-1 ${seatsColor}`} />
              <div className={`text-sm font-bold ${seatsColor}`}>{seats}</div>
              <div className="text-[10px] text-muted-foreground">Capacity</div>
            </div>
          </div>
        </div>

        {/* Expanded: stops list */}
        {expanded && (
          <div className="px-5 pb-6 border-t border-border/20 pt-4 max-h-48 overflow-y-auto">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Stops</p>
            <div className="space-y-0">
              {route.stops.map((stop, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="w-3 h-3 rounded-full border-2 flex-shrink-0"
                      style={{
                        borderColor: route.color,
                        backgroundColor: i === 0 || i === route.stops.length - 1 ? route.color : 'transparent',
                      }}
                    />
                    {i < route.stops.length - 1 && (
                      <div className="w-0.5 h-6 bg-border/50" />
                    )}
                  </div>
                  <div className="pb-4">
                    <span className={`text-sm ${i === 0 || i === route.stops.length - 1 ? 'font-semibold' : 'text-muted-foreground'}`}>
                      {stop.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2.5 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border/20"
        >
          <ChevronUp className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Less' : 'View all stops'}
        </button>

        {/* Safe area padding for bottom nav */}
        <div className="h-16" />
      </div>
    </div>
  );
};

export default RouteBottomSheet;
