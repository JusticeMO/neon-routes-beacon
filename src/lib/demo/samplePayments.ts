import type { Receipt } from '@/lib/payments/provider';
import type { VehicleStatus } from '@/lib/tracking/vehicleStatus';
import { nairobiRoutes } from '@/data/routes';
import { DEMO_SACCO_PAYMENTS, fareFor, paybillAccountFor } from './demoMode';

/** Small deterministic PRNG so the seeded day's fares don't change on every render. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * SAMPLE fares (M-PESA PayBill and Jipay) from the last 10 hours (the working day so far). Stands in for
 * the transaction records the payment provider would supply to the SACCO.
 */
export function samplePaymentsToday(vehicles: VehicleStatus[], now: number): Receipt[] {
  // Anchor to the hour so the seeded list stays stable while the clock ticks.
  const start = Math.floor(now / 3_600_000) * 3_600_000 - 10 * 3_600_000;
  const out: Receipt[] = [];
  vehicles.filter(v => v.onShift && !v.vehicleId.startsWith('crew-')).forEach((v, vi) => {
    const route = nairobiRoutes.find(r => r.number === v.routeId)!;
    const rand = rng(start / 1000 + vi * 7919);
    // Roughly one Jipay fare every 6 to 14 minutes per vehicle.
    for (let t = start + rand() * 600_000; t < now; t += 360_000 + rand() * 480_000) {
      const stage = route.stops[Math.floor(rand() * (route.stops.length - 1))].name;
      const paybill = rand() < 0.65;
      out.push({
        transactionId: paybill ? `SK${Math.floor(t / 1000).toString(36).toUpperCase().slice(-6)}${vi}` : `JPD${Math.floor(t / 1000).toString(36).toUpperCase()}${vi}`,
        provider: paybill ? 'M-PESA PayBill' : 'Jipay',
        method: paybill ? 'mpesa-paybill' : 'jipay',
        paybill: paybill ? DEMO_SACCO_PAYMENTS.mpesaPaybill : undefined,
        accountRef: paybill ? paybillAccountFor(v.plate) : undefined,
        routeNumber: route.number,
        routeName: route.name,
        vehiclePlate: v.plate,
        vehicleId: v.vehicleId,
        boardingStage: stage,
        amountKsh: fareFor(route.number, t),
        phoneMasked: `07${Math.floor(rand() * 90 + 10)}•••${Math.floor(rand() * 900 + 100)}`,
        paidAt: new Date(t).toISOString(),
        status: 'confirmed',
        demo: true,
      });
    }
  });
  return out.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}
