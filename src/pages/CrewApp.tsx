import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Power, Radio, Wifi } from 'lucide-react';
import { nairobiRoutes } from '@/data/routes';
import { useNow, useRouteVehicles } from '@/hooks/useRouteVehicles';
import { readCrewShift, writeCrewShift, type CrewShift } from '@/lib/demo/crewShift';
import { directionLabel } from '@/lib/tracking/routeGeometry';
import { formatAge } from '@/lib/tracking/vehicleStatus';
import { stageId } from '@/lib/tracking/deepLink';
import { DEMO_SACCO } from '@/lib/demo/demoMode';

/**
 * Crew screen: one Start/End shift control and a clear "sharing location"
 * state. In the demo the vehicle is driven along the route by the simulator;
 * the real crew app sends the phone's GPS every 5 to 10 s.
 */
const CrewApp = () => {
  const [shift, setShift] = useState<CrewShift | null>(() => readCrewShift());
  const [plate, setPlate] = useState('KDG 777X');
  const [routeNumber, setRouteNumber] = useState('46');
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('inbound');
  const now = useNow(1000);
  const route = nairobiRoutes.find(r => r.number === (shift?.routeNumber ?? routeNumber))!;
  const vehicles = useRouteVehicles(shift ? route : null, now);
  const mine = vehicles.find(v => v.vehicleId.startsWith('crew-'));

  // Pick up a shift started or ended in another tab.
  useEffect(() => {
    const onStorage = () => setShift(readCrewShift());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const start = () => {
    const s: CrewShift = { plate: plate.trim().toUpperCase() || 'KDG 777X', routeNumber, direction, startedAt: Date.now() };
    writeCrewShift(s);
    setShift(s);
  };
  const end = () => { writeCrewShift(null); setShift(null); };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col max-w-md mx-auto">
      <header className="flex items-center gap-3 p-4">
        <Link to="/" className="p-2 rounded-full hover:bg-muted/40" aria-label="Back"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="text-lg font-bold">Beacon Crew</h1>
          <p className="text-xs text-muted-foreground">{DEMO_SACCO} · demo</p>
        </div>
      </header>

      <main className="flex-1 px-4 pb-8 flex flex-col gap-4">
        {!shift ? (
          <>
            <div className="bg-card rounded-2xl border border-border/40 p-4 space-y-3">
              <label className="block text-xs font-semibold text-muted-foreground">Vehicle
                <input value={plate} onChange={e => setPlate(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base font-semibold text-foreground" />
              </label>
              <label className="block text-xs font-semibold text-muted-foreground">Assigned route
                <select value={routeNumber} onChange={e => setRouteNumber(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground">
                  {nairobiRoutes.map(r => <option key={r.number} value={r.number}>{r.number} · {r.name}</option>)}
                </select>
              </label>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Heading to</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['inbound', 'outbound'] as const).map(d => {
                    const r = nairobiRoutes.find(x => x.number === routeNumber)!;
                    return (
                      <button key={d} onClick={() => setDirection(d)} className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${direction === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>
                        {directionLabel(r, d)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <button onClick={start} className="w-full rounded-3xl bg-accent text-accent-foreground py-8 text-2xl font-bold flex items-center justify-center gap-3 shadow-lg active:scale-[0.98] transition">
              <Power className="w-8 h-8" /> Start shift
            </button>
            <p className="text-xs text-muted-foreground text-center">Starting a shift shares this vehicle's location with commuters on the route until you end it.</p>
          </>
        ) : (
          <>
            <div className="rounded-3xl bg-accent/15 border-2 border-accent p-6 text-center">
              <Radio className="w-12 h-12 text-accent mx-auto animate-pulse" />
              <div className="text-2xl font-bold mt-2">Sharing location</div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                <Wifi className="w-4 h-4 text-accent" /> Synced {mine ? formatAge(mine.lastReportAt, now) : 'just now'}
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border/40 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span className="font-bold">{shift.plate}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span>{route.number} · {route.name}</span></div>
              {mine && <>
                <div className="flex justify-between"><span className="text-muted-foreground">Heading to</span><span>{directionLabel(route, mine.direction)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />Last stage</span><span>{route.stops[mine.lastStageIndex].name}</span></div>
              </>}
              <div className="flex justify-between"><span className="text-muted-foreground">On shift for</span><span>{Math.floor((now - shift.startedAt) / 60000)} min</span></div>
            </div>
            <Link to={`/?stage=${stageId(route, 0)}`} target="_blank" className="text-center text-sm text-primary font-medium">See it on the commuter map (opens a new tab)</Link>
            <button onClick={end} className="mt-auto w-full rounded-3xl bg-destructive text-destructive-foreground py-6 text-xl font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition">
              <Power className="w-7 h-7" /> End shift
            </button>
          </>
        )}
      </main>
    </div>
  );
};

export default CrewApp;
