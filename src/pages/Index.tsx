import { useState } from 'react';
import SplashScreen from '../components/SplashScreen';
import GoogleMapView from '../components/GoogleMapView';
import SearchBar from '../components/SearchBar';
import BottomNav from '../components/BottomNav';
import RouteCard from '../components/RouteCard';

const Index = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState('home');

  const routes = [
    { id: 1, number: '46', name: 'CBD → Kawangware', color: 'neon-blue' as const, eta: '3 mins', load: 'few' as const, fare: 'KSh 60' },
    { id: 2, number: '34', name: 'CBD → Kasarani', color: 'neon-green' as const, eta: '7 mins', load: 'full' as const, fare: 'KSh 80' },
    { id: 3, number: '15', name: 'CBD → Karen', color: 'neon-orange' as const, eta: '12 mins', load: 'empty' as const, fare: 'KSh 100' },
    { id: 4, number: '108', name: 'CBD → Westlands', color: 'neon-purple' as const, eta: '5 mins', load: 'few' as const, fare: 'KSh 50' },
  ];

  const handleRouteSelect = (route: any) => {
    console.log('Selected route:', route);
  };

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="relative h-full flex flex-col">
            <div className="absolute top-4 left-4 right-4 z-30">
              <SearchBar />
            </div>
            <div className="flex-1 relative" style={{ minHeight: 0 }}>
              <GoogleMapView />
            </div>
          </div>
        );
      
      case 'routes':
        return (
          <div className="p-4 space-y-3 pb-24 overflow-y-auto h-full">
            <div className="text-center mb-6 pt-2">
              <h2 className="text-2xl font-bold mb-1">Available Routes</h2>
              <p className="text-muted-foreground text-sm">Live bus positions & ETAs</p>
            </div>
            {routes.map(route => (
              <RouteCard 
                key={route.id} 
                route={route} 
                onSelect={handleRouteSelect}
              />
            ))}
          </div>
        );
      
      case 'alerts':
        return (
          <div className="p-4 pb-24 overflow-y-auto h-full">
            <div className="text-center mb-6 pt-2">
              <h2 className="text-2xl font-bold mb-1">Live Alerts</h2>
              <p className="text-muted-foreground text-sm">Real-time traffic updates</p>
            </div>
            
            <div className="space-y-3">
              <div className="bg-card rounded-2xl p-4 border border-border/30 border-l-4 border-l-warning shadow-lg">
                <div className="flex items-start space-x-3">
                  <div className="w-2.5 h-2.5 bg-warning rounded-full mt-1.5 animate-pulse" />
                  <div>
                    <h3 className="font-semibold text-warning">Heavy Traffic</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Kenyatta Avenue experiencing delays. Expect 10 min additional time.
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-2">2 mins ago</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-card rounded-2xl p-4 border border-border/30 border-l-4 border-l-destructive shadow-lg">
                <div className="flex items-start space-x-3">
                  <div className="w-2.5 h-2.5 bg-destructive rounded-full mt-1.5 animate-pulse" />
                  <div>
                    <h3 className="font-semibold text-destructive">Service Disruption</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Route 46 temporarily suspended due to roadworks at Globe Roundabout.
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-2">5 mins ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'profile':
        return (
          <div className="p-4 pb-24 overflow-y-auto h-full">
            <div className="text-center mb-8 pt-2">
              <div className="w-20 h-20 bg-primary/15 rounded-full mx-auto mb-4 flex items-center justify-center ring-2 ring-primary/30">
                <span className="text-xl font-bold text-primary">JD</span>
              </div>
              <h2 className="text-2xl font-bold">John Doe</h2>
              <p className="text-muted-foreground text-sm">Regular Commuter</p>
            </div>
            
            <div className="space-y-3">
              <div className="bg-card rounded-2xl p-5 border border-border/30 shadow-lg">
                <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Travel Stats</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">47</div>
                    <div className="text-xs text-muted-foreground mt-1">Trips This Month</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-accent">2,340</div>
                    <div className="text-xs text-muted-foreground mt-1">Eco Points</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-card rounded-2xl p-5 border border-border/30 shadow-lg">
                <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Favorite Routes</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">CBD → Kawangware</span>
                    <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-full">Route 46</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">CBD → Westlands</span>
                    <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-full">Route 108</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="relative h-screen overflow-hidden">
        {renderContent()}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
