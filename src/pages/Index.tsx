import { useState, useCallback, useEffect, useMemo } from 'react';
import SplashScreen from '../components/SplashScreen';
import BeaconMap from '../components/BeaconMap';
import SearchBar from '../components/SearchBar';
import BottomNav from '../components/BottomNav';
import RouteBottomSheet from '../components/RouteBottomSheet';
import ThemeToggle from '../components/ThemeToggle';
import { nairobiRoutes, type Route } from '@/data/routes';
import { sampleVehicles } from '@/data/sampleVehicles';
import DemoViewsMenu, { DEMO_VIEWS } from '@/components/DemoViewsMenu';
import { readReceipts } from '@/lib/payments/jipayMock';
import { Link } from 'react-router-dom';
import { useAllVehicles, useNow, useRouteVehicles } from '@/hooks/useRouteVehicles';
import { parseDeepLink, stageId } from '@/lib/tracking/deepLink';
import { coverage } from '@/lib/tracking/vehicleStatus';
import { toast } from 'sonner';
import { Users, MapPin, ChevronRight, Banknote } from 'lucide-react';

const Index = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  // Deep links: ?route=<number> or ?stage=<stage id>. Bad ids fall back to the selector.
  const initial = useMemo(() => parseDeepLink(window.location.search, nairobiRoutes), []);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(initial.route);
  // Default to the town terminus, where end-of-day queues form.
  const [stageIndex, setStageIndex] = useState(initial.stage?.stageIndex ?? 0);
  const [followedId, setFollowedId] = useState<string | null>(null);
  const deepLinked = Boolean(initial.route);
  useEffect(() => {
    if (deepLinked) setShowSplash(false);
    if (initial.invalid) toast.message("We couldn't find that stage or route. Pick one below.");
  }, [deepLinked, initial.invalid]);

  const now = useNow(1000);
  const routeVehicles = useRouteVehicles(selectedRoute, now);
  const allVehicles = useAllVehicles(now);
  const mapVehicles = selectedRoute ? routeVehicles : allVehicles;

  // Keep the URL shareable as the commuter picks a route and stage.
  useEffect(() => {
    const url = selectedRoute ? `?stage=${stageId(selectedRoute, stageIndex)}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [selectedRoute, stageIndex]);

  const handleRouteSelect = useCallback((routeNumber: string) => {
    const route = nairobiRoutes.find(r => r.number === routeNumber);
    if (route) {
      setSelectedRoute(route);
      setStageIndex(0);
      setFollowedId(null);
    }
  }, []);

  const handleClearRoute = useCallback(() => {
    setSelectedRoute(null);
    setFollowedId(null);
  }, []);

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="relative h-full flex flex-col">
            {/* Search bar */}
            <div className="absolute top-4 left-4 right-4 z-40">
              <SearchBar
                onRouteSelect={handleRouteSelect}
                onClear={handleClearRoute}
                selectedRouteName={selectedRoute?.name}
              />
            </div>

            {/* Theme toggle and demo views */}
            <div className="absolute top-[72px] left-4 z-30">
              <ThemeToggle />
            </div>
            <div className="absolute top-[76px] right-4 z-30">
              <DemoViewsMenu />
            </div>

            {/* Map */}
            <div className="flex-1 relative isolate" style={{ minHeight: 0 }}>
              <BeaconMap
                selectedRoute={selectedRoute}
                vehicles={mapVehicles}
                now={now}
                stageIndex={selectedRoute ? stageIndex : undefined}
                followedId={followedId}
                onVehicleClick={id => {
                  const v = mapVehicles.find(x => x.vehicleId === id);
                  if (v && !selectedRoute) handleRouteSelect(v.routeId);
                  setFollowedId(id);
                }}
              />
            </div>

            {/* Route bottom sheet */}
            {selectedRoute && (
              <RouteBottomSheet
                route={selectedRoute}
                vehicles={routeVehicles}
                now={now}
                stageIndex={stageIndex}
                onStageChange={i => { setStageIndex(i); setFollowedId(null); }}
                followedId={followedId}
                onFollow={setFollowedId}
                onClose={handleClearRoute}
              />
            )}
          </div>
        );

      case 'routes':
        return (
          <div className="p-4 space-y-3 pb-24 overflow-y-auto h-full">
            <div className="pt-2 mb-5">
              <h2 className="text-xl font-bold">Nearby Routes</h2>
              <p className="text-muted-foreground text-sm mt-0.5">Tap a route to see matatus on their way to your stage. Sample data for now.</p>
            </div>
            {nairobiRoutes.map(route => {
              const cov = coverage(sampleVehicles(route, now), now);
              return (
                <button
                  key={route.id}
                  onClick={() => { handleRouteSelect(route.number); setActiveTab('home'); }}
                  className="w-full bg-card rounded-2xl p-4 border border-border/30 shadow-sm hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-md" style={{ backgroundColor: route.color }}>
                      {route.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{route.name}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{route.stops.length} stages
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" />{cov.reporting} of {cov.onShift} sharing location
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        );

      case 'alerts':
        return (
          <div className="p-4 pb-24 overflow-y-auto h-full">
            <div className="pt-2 mb-5">
              <h2 className="text-xl font-bold">Alerts</h2>
              <p className="text-muted-foreground text-sm mt-0.5">Service updates & traffic info</p>
            </div>
            <div className="space-y-3">
              <div className="bg-card rounded-2xl p-4 border border-border/30 border-l-4 border-l-warning">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-warning rounded-full mt-1.5 animate-pulse flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm text-warning">Heavy Traffic — Kenyatta Ave</h3>
                    <p className="text-xs text-muted-foreground mt-1">Expect +10 min delays on Routes 46, 108</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-2">2 min ago</p>
                  </div>
                </div>
              </div>
              <div className="bg-card rounded-2xl p-4 border border-border/30 border-l-4 border-l-destructive">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-destructive rounded-full mt-1.5 animate-pulse flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm text-destructive">Route 46 Disruption</h3>
                    <p className="text-xs text-muted-foreground mt-1">Roadworks at Globe Roundabout. Diversion via Ngong Rd.</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-2">15 min ago</p>
                  </div>
                </div>
              </div>
              <div className="bg-card rounded-2xl p-4 border border-border/30 border-l-4 border-l-accent">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-accent rounded-full mt-1.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm text-accent">New Route Added</h3>
                    <p className="text-xs text-muted-foreground mt-1">Route 108 (CBD → Westlands) is now live with real-time tracking.</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-2">1 hour ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'profile': {
        const receipts = readReceipts();
        const spent = receipts.reduce((t, r) => t + r.amountKsh, 0);
        return (
          <div className="p-4 pb-24 overflow-y-auto h-full">
            <div className="pt-2 mb-6 flex items-center gap-4">
              <div className="w-14 h-14 bg-primary/15 rounded-full flex items-center justify-center ring-2 ring-primary/30">
                <span className="text-lg font-bold text-primary">DC</span>
              </div>
              <div>
                <h2 className="text-lg font-bold">Demo commuter</h2>
                <p className="text-xs text-muted-foreground">M-PESA and Jipay (demo)</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-card rounded-2xl p-3 text-center border border-border/30">
                <div className="text-xl font-bold text-primary">{receipts.length}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Fares paid in the app</div>
              </div>
              <div className="bg-card rounded-2xl p-3 text-center border border-border/30">
                <div className="text-xl font-bold text-accent">KSh {spent.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Total spent</div>
              </div>
            </div>

            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Receipts</h3>
            <div className="bg-card rounded-2xl border border-border/30 divide-y divide-border/20 mb-5">
              {receipts.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No fares yet. Follow a matatu on the map and tap Pay to try a demo M-PESA PayBill or Jipay payment.</p>
              )}
              {receipts.slice(0, 10).map(r => (
                <div key={r.transactionId} className="px-4 py-3 flex items-center gap-3">
                  <Banknote className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{r.vehiclePlate} · route {r.routeNumber} · {r.provider}</div>
                    <div className="text-[11px] text-muted-foreground">{r.boardingStage} · {new Date(r.paidAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · <span className="font-mono">{r.transactionId}</span></div>
                  </div>
                  <span className="text-sm font-semibold">KSh {r.amountKsh}</span>
                </div>
              ))}
            </div>

            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Explore the demo</h3>
            <div className="bg-card rounded-2xl border border-border/30 divide-y divide-border/20">
              {DEMO_VIEWS.map(({ to, icon: Icon, label, desc }) => (
                <Link key={to} to={to} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="flex-1 text-left">
                    <span className="block text-sm">{label}</span>
                    <span className="block text-[11px] text-muted-foreground">{desc}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                </Link>
              ))}
            </div>
          </div>
        );
      }

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
