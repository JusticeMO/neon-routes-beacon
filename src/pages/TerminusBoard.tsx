import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Radio, TrafficCone } from 'lucide-react';
import { nairobiRoutes, type Route } from '@/data/routes';
import { useAllVehicles, useNow } from '@/hooks/useRouteVehicles';
import { parseDeepLink, stageId } from '@/lib/tracking/deepLink';
import { routeGeometry } from '@/lib/tracking/routeGeometry';
import { coverage, formatAge, formatDistance, vehiclesApproaching, type Freshness } from '@/lib/tracking/vehicleStatus';
import { etaMinutes, trafficLabel } from '@/lib/demo/demoMode';
import { SponsoredCard } from '@/components/WhileYouWait';

const DOT: Record<Freshness, string> = { fresh: 'bg-accent', aging: 'bg-warning', stale: 'bg-muted-foreground', hidden: 'bg-muted-foreground' };

interface Panel { route: Route; stageIndex: number }

/**
 * Stage board: a big-screen view for a terminus or stage, built for the
 * end-of-day queue. Post it on a screen at the stage or open it on a phone.
 * /board shows every route's CBD terminus; /board?stage=<id> shows one stage.
 */
const TerminusBoard = () => {
  const now = useNow(1000);
  const all = useAllVehicles(now);
  const panels: Panel[] = useMemo(() => {
    const { stage } = parseDeepLink(window.location.search, nairobiRoutes);
    if (stage) return [{ route: stage.route, stageIndex: stage.stageIndex }];
    return nairobiRoutes.map(route => ({ route, stageIndex: 0 }));
  }, []);
  const single = panels.length === 1;
  const traffic = trafficLabel(now);
  const title = single ? panels[0].route.stops[panels[0].stageIndex].name : 'CBD termini';

  return (
    <div className="dark min-h-screen bg-[hsl(222,30%,7%)] text-white p-4 sm:p-6 flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Back to the map"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">Beacon stage board</div>
            <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-white/70"><TrafficCone className="w-4 h-4 text-amber-400" /> {traffic} traffic</span>
          <span className="text-3xl font-mono tabular-nums">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </header>

      <div className="text-[11px] font-medium bg-amber-400/15 text-amber-300 rounded-lg px-3 py-1.5 w-fit">
        Demo data: simulated vehicles. Times are estimates. Following a matatu does not reserve a seat.
      </div>

      <div className={`grid gap-4 flex-1 ${single ? 'grid-cols-1 max-w-3xl w-full mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
        {panels.map(({ route, stageIndex }) => {
          const vehicles = all.filter(v => v.routeId === route.number);
          const geo = routeGeometry(route);
          const coming = vehiclesApproaching(vehicles, geo.stageProgressM[stageIndex], now);
          const cov = coverage(vehicles, now);
          const stage = route.stops[stageIndex];
          const next = coming[0];
          return (
            <section key={route.number} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold" style={{ backgroundColor: route.color }}>{route.number}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg truncate">{route.name}</div>
                  <div className="text-xs text-white/50">Arriving at {stage.name} · {cov.reporting} of {cov.onShift} sharing location</div>
                </div>
                <Link to={`/?stage=${stageId(route, stageIndex)}`} className="text-xs text-sky-300 whitespace-nowrap">Open map</Link>
              </div>

              <div className="rounded-xl bg-white/[0.06] p-3 mb-3">
                {next ? (
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <div className="text-xs text-white/50">Next matatu</div>
                      <div className="text-2xl font-bold">{next.vehicle.plate}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-4xl font-bold tabular-nums">~{etaMinutes(next.distanceM, now)}<span className="text-lg font-medium text-white/60"> min</span></div>
                      <div className="text-xs text-white/50">{formatDistance(next.distanceM)} away</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-white/70">No matatus reporting on their way here right now. Vehicles may still be running without sharing location.</div>
                )}
              </div>

              <ul className="space-y-1.5 text-sm">
                {coming.slice(1, single ? 8 : 5).map(({ vehicle: v, distanceM, freshness }) => (
                  <li key={v.vehicleId} className={`flex items-center gap-3 ${freshness === 'stale' ? 'opacity-50' : ''}`}>
                    <span className={`w-2 h-2 rounded-full ${DOT[freshness]}`} aria-hidden />
                    <span className="font-semibold w-24 flex-shrink-0">{v.plate}</span>
                    <span className="flex-1 text-white/60 truncate min-w-0"><span className="hidden sm:inline">near </span> {route.stops[v.lastStageIndex].name}</span>
                    <span className="tabular-nums flex-shrink-0">~{etaMinutes(distanceM, now)} min</span>
                    <span className="text-white/40 text-xs w-16 text-right flex-shrink-0">{formatAge(v.lastReportAt, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="grid gap-3 sm:grid-cols-[1fr_auto] items-center">
        <SponsoredCard seed={Math.floor(now / 10_000)} onDark />
        <div className="flex items-center gap-2 text-xs text-white/50"><Radio className="w-4 h-4" /> Live view on your phone: {window.location.host}/board</div>
      </footer>
    </div>
  );
};

export default TerminusBoard;
