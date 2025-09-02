import { useState } from 'react';
import { Search, MapPin, Clock } from 'lucide-react';

const SearchBar = () => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const suggestions = [
    { name: 'CBD', type: 'landmark', icon: MapPin },
    { name: 'KICC', type: 'landmark', icon: MapPin },
    { name: 'Westlands', type: 'area', icon: MapPin },
    { name: 'Karen Shopping Centre', type: 'landmark', icon: MapPin },
  ];

  const recentSearches = [
    'CBD to Kawangware',
    'Westlands to Karen',
    'KICC to Kasarani',
  ];

  return (
    <div className="relative w-full">
      {/* Search input */}
      <div 
        className={`
          flex items-center space-x-3 glass-surface rounded-2xl px-4 py-3
          transition-all duration-300 ${isFocused ? 'ring-2 ring-primary/50' : ''}
        `}
      >
        <Search className="w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Where are you going?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Search suggestions dropdown */}
      {isFocused && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-surface rounded-2xl overflow-hidden z-50 animate-fade-in">
          {/* Recent searches */}
          {query === '' && recentSearches.length > 0 && (
            <div className="p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Recent</span>
              </div>
              {recentSearches.map((search, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 py-2 px-2 rounded-lg hover:bg-muted/20 cursor-pointer transition-colors"
                >
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{search}</span>
                </div>
              ))}
            </div>
          )}

          {/* Location suggestions */}
          {query !== '' && (
            <div className="p-4">
              <div className="space-y-1">
                {suggestions
                  .filter(item => 
                    item.name.toLowerCase().includes(query.toLowerCase())
                  )
                  .map((suggestion, index) => (
                    <div
                      key={index}
                      className="flex items-center space-x-3 py-3 px-2 rounded-lg hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <suggestion.icon className="w-4 h-4 text-primary" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{suggestion.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {suggestion.type}
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;