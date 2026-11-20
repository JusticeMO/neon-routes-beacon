import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Banknote, Bus, MonitorPlay, Radio, Wallet } from 'lucide-react';
import BeaconMap from '@/components/BeaconMap';
import { nairobiRoutes } from '@/data/routes';
import { useAllVehicles, useNow } from '@/hooks/useRouteVehicles';
import { routeGeometry, directionLabel } from '@/lib/tracking/routeGeometry';
import { coverage, formatAge, freshnessOf, vehiclesApproaching, type Freshness } from '@/lib/tracking/vehicleStatus';
import { stageId } from '@/lib/tracking/deepLink';
import { DEMO_SACCO, DEMO_SACCO_PAYMENTS, etaMinutes } from '@/lib/demo/demoMode';
import { samplePaymentsToday } from '@/lib/demo/samplePayments';
import { readReceipts } from '@/lib/payments/jipayMock';

const STATUS: Record<Freshness, { label: string; cls: string }> = {
  fresh: { label: 'Live', cls: 'bg-accent/15 text-accent' },
  aging: { label: 'Delayed', cls: 'bg-warning/15 text-warning' },
  stale: { label: 'Not reporting', cls: 'bg-destructive/15 text-destructive' },
  hidden: { label: 'Offline', cls: 'bg-destructive/15 text-destructive' },
};

const ksh = (n: number) => `KSh ${n.toLocaleString()}`;

/**
 * SACCO operations view (demo): fleet coverage, vehicles that stopped
 * reporting, supply heading into each CBD terminus for the evening queue,
 * and Jipay fare flows per vehicle. All sample data.
 */
const SaccoDashboard = () => {
  const now = useNow(2000);
  const vehicles = useAllVehicles(now);
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const minute = Math.floor(now / 60_000);
  const payments = useMemo(() => {
    const own = readReceipts().filter(r => now - Date.parse(r.paidAt) < 10 * 3_600_000);
    return [...own, ...samplePaymentsToday(vehicles, now)].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
    // Recompute once a minute, plus whenever the fleet list changes size (a crew shift starts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, vehicles.length]);

  const onShift = vehicles.filter(v => v.onShift);
  const cov = coverage(vehicles, now);
  const exceptions = onShift.filter(v => ['stale', 'hidden'].includes(freshnessOf(v.lastReportAt, now)));
  const delayed = onShift.filter(v => freshnessOf(v.lastReportAt, now) === 'aging');
  const total = payments.reduce((s, p) => s + p.amountKsh, 0);
  const paybillTotal = payments.filter(p => p.method === 'mpesa-paybill').reduce((s, p) => s + p.amountKsh, 0);
  const byVehicle = new Map<string, { n: number; sum: number }>();
  payments.forEach(p => {
    const e = byVehicle.get(p.vehicleId) ?? { n: 0, sum: 0 };
    byVehicle.set(p.vehicleId, { n: e.n + 1, sum: e.sum + p.amountKsh });
  });
  const shown = onShift.filter(v => routeFilter === 'all' || v.routeId === routeFilter);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-card/60">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 rounded-full hover:bg-muted/40" aria-label="Back to the map"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-lg font-bold">{DEMO_SACCO}</h1>
            <p className="text-xs text-muted-foreground">Operations · M-PESA PayBill {DEMO_SACCO_PAYMENTS.mpesaPaybill} · demo data</p>
          </div>
        </div>
        <div className="flex gap-2 text-sm">
          <Link to="/board" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-muted/30"><MonitorPlay className="w-4 h-4" /> Stage boards</Link>
          <Link to="/crew" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-muted/30"><Radio className="w-4 h-4" /> Crew app</Link>
        </div>
      </header>

      <main className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Bus, label: 'Vehicles on shift', value: String(cov.onShift), sub: `${nairobiRoutes.length} routes` },
            { icon: Radio, label: 'Sharing location', value: `${cov.reporting} of ${cov.onShift}`, sub: `${Math.round((cov.reporting / Math.max(1, cov.onShift)) * 100)}% coverage` },
            { icon: AlertTriangle, label: 'Not reporting', value: String(exceptions.length), sub: `${delayed.length} delayed` },
            { icon: Wallet, label: 'Fares paid in app, last 10 h', value: ksh(total), sub: `PayBill ${ksh(paybillTotal)} · Jipay ${ksh(total - paybillTotal)}` },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="bg-card rounded-2xl border border-border/40 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="w-4 h-4" />{label}</div>
              <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
              <div className="text-xs text-muted-foreground">{sub}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
          {/* Live map */}
          <section className="bg-card rounded-2xl border border-border/40 overflow-hidden">
            <div className="px-4 py-3 text-sm font-semibold">Live fleet</div>
            <div className="h-[380px] relative isolate"><BeaconMap selectedRoute={null} vehicles={vehicles} now={now} /></div>
          </section>

          {/* Terminus supply */}
          <section className="bg-card rounded-2xl border border-border/40 p-4">
            <h2 className="text-sm font-semibold">Heading into CBD termini</h2>
            <p className="text-xs text-muted-foreground mb-3">Where the evening queues form. Vehicles reporting on their way in.</p>
            <ul className="space-y-3">
              {nairobiRoutes.map(route => {
                const rv = vehicles.filter(v => v.routeId === route.number);
                const coming = vehiclesApproaching(rv, routeGeometry(route).stageProgressM[0], now);
                const in15 = coming.filter(c => etaMinutes(c.distanceM, now) <= 15).length;
                return (
                  <li key={route.number} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: route.color }}>{route.number}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{route.stops[0].name}</div>
                      <div className="text-xs text-muted-foreground">
                        {coming.length} inbound · {in15} within ~15 min{coming[0] ? ` · next ~${etaMinutes(coming[0].distanceM, now)} min` : ''}
                      </div>
                    </div>
                    {in15 === 0 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">Queue risk</span>}
                    <Link to={`/board?stage=${stageId(route, 0)}`} className="text-xs text-primary">Board</Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Exceptions */}
        {exceptions.length > 0 && (
          <section className="bg-destructive/5 border border-destructive/30 rounded-2xl p-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-destructive"><AlertTriangle className="w-4 h-4" /> On shift but not reporting</h2>
            <ul className="mt-2 grid sm:grid-cols-2 gap-2 text-sm">
              {exceptions.map(v => (
                <li key={v.vehicleId} className="flex justify-between bg-card rounded-xl px-3 py-2">
                  <span className="font-semibold">{v.plate} <span className="font-normal text-muted-foreground">route {v.routeId}</span></span>
                  <span className="text-muted-foreground">last seen {formatAge(v.lastReportAt, now)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid gap-5">
          {/* Fleet table */}
          <section className="bg-card rounded-2xl border border-border/40 p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="text-sm font-semibold">Fleet</h2>
              <select value={routeFilter} onChange={e => setRouteFilter(e.target.value)} className="text-xs rounded-full border border-border bg-card px-3 py-1.5">
                <option value="all">All routes</option>
                {nairobiRoutes.map(r => <option key={r.number} value={r.number}>Route {r.number}</option>)}
              </select>
            </div>
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-xs text-muted-foreground text-left">
                <tr><th className="py-1.5 font-medium">Vehicle</th><th className="font-medium">Route</th><th className="font-medium">Heading to</th><th className="font-medium">Last stage</th><th className="font-medium">Updated</th><th className="font-medium">Status</th><th className="font-medium text-right">Fares</th></tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {shown.map(v => {
                  const route = nairobiRoutes.find(r => r.number === v.routeId)!;
                  const f = STATUS[freshnessOf(v.lastReportAt, now)];
                  const pay = byVehicle.get(v.vehicleId);
                  return (
                    <tr key={v.vehicleId}>
                      <td className="py-2 font-semibold whitespace-nowrap">{v.plate}{v.vehicleId.startsWith('crew-') && <span className="ml-1.5 text-[10px] font-semibold text-primary">crew app</span>}</td>
                      <td>{route.number}</td>
                      <td className="whitespace-nowrap">{directionLabel(route, v.direction)}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{route.stops[v.lastStageIndex].name}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{formatAge(v.lastReportAt, now)}</td>
                      <td><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${f.cls}`}>{f.label}</span></td>
                      <td className="text-right tabular-nums whitespace-nowrap">{pay ? ksh(pay.sum) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Payments */}
          <section className="bg-card rounded-2xl border border-border/40 p-4">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Banknote className="w-4 h-4" /> Latest fares</h2>
            <p className="text-xs text-muted-foreground mb-3">Mocked. PayBill fares use the vehicle plate as account number, so each fare is tied to a vehicle.</p>
            <ul className="grid md:grid-cols-2 gap-x-6 text-sm">
              {payments.slice(0, 12).map(p => (
                <li key={p.transactionId} className="py-2 flex items-center gap-3 border-b border-border/30">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{p.vehiclePlate} <span className="text-muted-foreground font-normal">· route {p.routeNumber} · {p.boardingStage}</span> <span className={`ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${p.method === 'mpesa-paybill' ? 'bg-accent/15 text-accent' : 'bg-primary/10 text-primary'}`}>{p.method === 'mpesa-paybill' ? 'PayBill' : 'Jipay'}</span></div>
                    <div className="text-[11px] text-muted-foreground font-mono">{p.transactionId} · {p.phoneMasked} · {new Date(p.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div className="font-semibold tabular-nums">{ksh(p.amountKsh)}</div>
                </li>
              ))}
              {payments.length === 0 && <li className="py-4 text-muted-foreground text-center">No fares yet today.</li>}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
};

export default SaccoDashboard;
