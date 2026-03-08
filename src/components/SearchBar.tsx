import { useState, useMemo } from 'react';
import { Search, MapPin, X } from 'lucide-react';
import { nairobiRoutes } from '@/data/routes';

interface SearchBarProps {
  onRouteSelect: (routeNumber: string) => void;
  onClear: () => void;
  selectedRouteName?: string;
}

const SearchBar = ({ onRouteSelect, onClear, selectedRouteName }: SearchBarProps) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Gather all unique stop names and their route associations
  const allStops = useMemo(() => {
    const stops: { name: string; routeNumber: string; routeName: string; color: string }[] = [];
    nairobiRoutes.forEach(route => {
      route.stops.forEach(stop => {
        stops.push({ name: stop.name, routeNumber: route.number, routeName: route.name, color: route.color });
      });
    });
    return stops;
  }, []);

  const filtered = query.length > 0
    ? allStops.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.routeName.toLowerCase().includes(query.toLowerCase()) ||
        s.routeNumber.includes(query)
      )
    : [];

  // Group by route
  const groupedResults = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach(item => {
      const existing = map.get(item.routeNumber) || [];
      existing.push(item);
      map.set(item.routeNumber, existing);
    });
    return map;
  }, [filtered]);

  const handleSelect = (routeNumber: string) => {
    setQuery('');
    setIsFocused(false);
    onRouteSelect(routeNumber);
  };

  if (selectedRouteName) {
    return (
      <div className="flex items-center bg-card/95 backdrop-blur-xl rounded-2xl px-4 py-3 border border-border/40 shadow-lg">
        <MapPin className="w-5 h-5 text-primary mr-3 flex-shrink-0" />
        <span className="flex-1 font-medium text-sm">{selectedRouteName}</span>
        <button onClick={onClear} className="p-1 rounded-full hover:bg-muted/30 transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div className={`flex items-center bg-card/95 backdrop-blur-xl rounded-2xl px-4 py-3 border shadow-lg transition-all duration-200 ${isFocused ? 'border-primary/40 ring-2 ring-primary/20' : 'border-border/40'}`}>
        <Search className="w-5 h-5 text-muted-foreground mr-3" />
        <input
          type="text"
          placeholder="Where are you going?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm"
        />
      </div>

      {isFocused && query.length > 0 && groupedResults.size > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card/95 backdrop-blur-xl rounded-2xl border border-border/40 shadow-xl overflow-hidden z-50 animate-fade-in max-h-64 overflow-y-auto">
          {Array.from(groupedResults.entries()).map(([routeNum, stops]) => (
            <button
              key={routeNum}
              onMouseDown={() => handleSelect(routeNum)}
              className="w-full text-left px-4 py-3 hover:bg-muted/20 transition-colors border-b border-border/10 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: stops[0].color }}>
                  {routeNum}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{stops[0].routeName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Stops: {stops.map(s => s.name).join(' · ')}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isFocused && query.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card/95 backdrop-blur-xl rounded-2xl border border-border/40 shadow-xl overflow-hidden z-50 animate-fade-in">
          <div className="px-4 py-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Popular Routes</p>
          </div>
          {nairobiRoutes.map(route => (
            <button
              key={route.id}
              onMouseDown={() => handleSelect(route.number)}
              className="w-full text-left px-4 py-3 hover:bg-muted/20 transition-colors border-b border-border/10 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: route.color }}>
                  {route.number}
                </div>
                <div>
                  <div className="text-sm font-semibold">{route.name}</div>
                  <div className="text-xs text-muted-foreground">{route.stops.length} stops</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
