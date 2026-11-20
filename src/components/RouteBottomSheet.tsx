import { useMemo, useState } from 'react';
import { X, ChevronUp, Share2, Eye, EyeOff, Info, Wallet, MonitorPlay, Gamepad2, Car } from 'lucide-react';
import { Link } from 'react-router-dom';
import PayFareDialog from './PayFareDialog';
import { BeaconTapGame, SponsoredCard } from './WhileYouWait';
import { etaMinutes, fareFor, trafficLabel } from '@/lib/demo/demoMode';
import { toast } from 'sonner';
import { type Route } from '@/data/routes';
import {
  coverage,
  formatAge,
  formatDistance,
  vehiclesApproaching,
  type Freshness,
  type VehicleStatus,
} from '@/lib/tracking/vehicleStatus';
import { directionLabel, routeGeometry } from '@/lib/tracking/routeGeometry';
import { buildShareUrl, stageId } from '@/lib/tracking/deepLink';

interface RouteBottomSheetProps {
  route: Route;
  vehicles: VehicleStatus[];
  now: number;
  stageIndex: number;
  onStageChange: (index: number) => void;
  followedId: string | null;
  onFollow: (vehicleId: string | null) => void;
  onClose: () => void;
}

const FRESHNESS_STYLE: Record<Freshness, { dot: string; label: string }> = {
  fresh: { dot: 'bg-accent', label: 'Live' },
  aging: { dot: 'bg-warning', label: 'Delayed' },
  stale: { dot: 'bg-muted-foreground', label: 'Last seen' },
  hidden: { dot: 'bg-muted-foreground', label: 'Hidden' },
};

const RouteBottomSheet = ({
  route, vehicles, now, stageIndex, onStageChange, followedId, onFollow, onClose,
}: RouteBottomSheetProps) => {
  const [expanded, setExpanded] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const geo = routeGeometry(route);
  const stage = route.stops[stageIndex];
  const last = route.stops.length - 1;
  const isSample = vehicles.some(v => v.source === 'sample');

  const approaching = useMemo(
    () => vehiclesApproaching(vehicles, geo.stageProgressM[stageIndex], now),
    [vehicles, geo, stageIndex, now],
  );
  const cov = coverage(vehicles, now);
  const nearest = approaching[0];
  const followed = approaching.find(a => a.vehicle.vehicleId === followedId);
  const traffic = trafficLabel(now);

  const share = async () => {
    const url = buildShareUrl(window.location.origin, { route, stageIndex });
    const text = `Matatus heading to ${stage.name} on route ${route.number}: ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Beacon', text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied. Paste it in WhatsApp.');
      }
    } catch { /* user cancelled */ }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1001] animate-fade-in">
      <div className="bg-card/95 backdrop-blur-xl rounded-t-3xl border-t border-x border-border/30 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] max-h-[75vh] flex flex-col">
        <button onClick={() => setExpanded(!expanded)} className="w-full flex justify-center pt-3 pb-1" aria-label={expanded ? 'Collapse' : 'Expand'}>
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </button>

        <div className="px-5 pb-3 overflow-y-auto">
          {/* Route header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-md" style={{ backgroundColor: route.color }}>
                {route.number}
              </div>
              <div>
                <h3 className="font-bold text-base">{route.name}</h3>
                <p className="text-xs text-muted-foreground">{route.stops.length} stages</p>
              </div>
            </div>
            <div className="flex items-center">
              <button onClick={share} className="p-2 rounded-full hover:bg-muted/30" aria-label="Share this stage">
                <Share2 className="w-5 h-5 text-muted-foreground" />
              </button>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-muted/30" aria-label="Close route">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {isSample && (
            <div className="flex items-center gap-2 text-[11px] font-medium bg-warning/15 text-warning rounded-lg px-3 py-1.5 mb-3" role="status">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              Demo data. These are simulated vehicles, not real matatus.
            </div>
          )}

          {/* Where are you waiting */}
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">I'm waiting at</p>
          <div className="flex gap-2 mb-3 flex-wrap">
            {[0, last].map(i => (
              <button
                key={i}
                onClick={() => onStageChange(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${stageIndex === i ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/30'}`}
              >
                {route.stops[i].name} (terminus)
              </button>
            ))}
            <select
              aria-label="Choose another stage"
              value={stageIndex !== 0 && stageIndex !== last ? stageIndex : ''}
              onChange={e => e.target.value !== '' && onStageChange(Number(e.target.value))}
              className="px-3 py-1.5 rounded-full text-xs border border-border bg-card"
            >
              <option value="">Other stage…</option>
              {route.stops.map((s, i) => (i !== 0 && i !== last ? <option key={i} value={i}>{s.name}</option> : null))}
            </select>
          </div>

          {/* Plain-language status: answer first */}
          <div className="bg-muted/30 rounded-xl p-3 mb-2" aria-live="polite">
            {nearest ? (
              <p className="text-sm">
                <span className="font-bold">{approaching.length} {approaching.length === 1 ? 'matatu' : 'matatus'}</span> on the way to {stage.name}.
                {' '}Nearest is about <span className="font-semibold">{formatDistance(nearest.distanceM)}</span> away,
                last seen near {route.stops[nearest.vehicle.lastStageIndex].name}, updated {formatAge(nearest.vehicle.lastReportAt, now)}.
                {' '}Estimated <span className="font-semibold">{etaMinutes(nearest.distanceM, now)} min</span> in {traffic} traffic.
              </p>
            ) : (
              <p className="text-sm">No matatus are reporting on their way to {stage.name} right now. Vehicles may still be running without sharing location.</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {cov.reporting} of {cov.onShift} vehicles working this route are sharing location.
              {' '}<Link to={`/board?stage=${stageId(route, stageIndex)}`} className="text-primary font-medium inline-flex items-center gap-1"><MonitorPlay className="w-3 h-3" />Stage board</Link>
            </p>
          </div>

          {/* Followed vehicle: ETA and optional Jipay payment */}
          {followed && (
            <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3 mb-2">
              <div className="flex items-center gap-3">
                <Car className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">Following {followed.vehicle.plate}</div>
                  <div className="text-[11px] text-muted-foreground">
                    ~{etaMinutes(followed.distanceM, now)} min to {stage.name} (estimate) · {formatDistance(followed.distanceM)} · updated {formatAge(followed.vehicle.lastReportAt, now)}
                  </div>
                </div>
                <button onClick={() => setPayOpen(true)} className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-full bg-primary text-primary-foreground">
                  <Wallet className="w-3.5 h-3.5" /> Pay KSh {fareFor(route.number, now)}
                </button>
              </div>
            </div>
          )}

          {/* Approaching vehicles */}
          {approaching.length > 0 && (
            <ul className="divide-y divide-border/20">
              {(expanded ? approaching : approaching.slice(0, 3)).map(({ vehicle: v, distanceM, freshness }) => {
                const f = FRESHNESS_STYLE[freshness];
                const following = followedId === v.vehicleId;
                return (
                  <li key={v.vehicleId} className={`py-2.5 flex items-center gap-3 ${freshness === 'stale' ? 'opacity-60' : ''}`}>
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${f.dot}`} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{v.plate} <span className="font-normal text-muted-foreground">toward {directionLabel(route, v.direction)}</span></div>
                      <div className="text-[11px] text-muted-foreground">
                        ~{etaMinutes(distanceM, now)} min · {formatDistance(distanceM)} · near {route.stops[v.lastStageIndex].name} · {f.label.toLowerCase()} {formatAge(v.lastReportAt, now)}
                      </div>
                    </div>
                    <button
                      onClick={() => onFollow(following ? null : v.vehicleId)}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border ${following ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/30'}`}
                    >
                      {following ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {following ? 'Following' : 'Follow'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {expanded && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Following a matatu does not reserve a seat. Times are estimates from distance and traffic. Cash still works.
            </p>
          )}

          {/* While you wait */}
          <div className="mt-3 space-y-2">
            <SponsoredCard seed={stageIndex} earn />
            {playing ? (
              <BeaconTapGame stage={stage.name} now={now} onClose={() => setPlaying(false)} />
            ) : (
              <button onClick={() => setPlaying(true)} className="w-full flex items-center justify-center gap-2 text-xs font-medium py-2 rounded-xl border border-border/40 hover:bg-muted/30">
                <Gamepad2 className="w-4 h-4 text-primary" /> Play Beacon Tap while you wait
              </button>
            )}
          </div>
        </div>

        {approaching.length > 3 || !expanded ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-2.5 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border/20"
          >
            <ChevronUp className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? 'Less' : 'More'}
          </button>
        ) : null}

        <div className="h-16 flex-shrink-0" />
      </div>
      {followed && (
        <PayFareDialog open={payOpen} onOpenChange={setPayOpen} route={route} vehicle={followed.vehicle} boardingStage={stage.name} />
      )}
    </div>
  );
};

export default RouteBottomSheet;
