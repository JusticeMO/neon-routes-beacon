import { useState } from 'react';
import { CheckCircle2, Loader2, Wallet } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Route } from '@/data/routes';
import type { VehicleStatus } from '@/lib/tracking/vehicleStatus';
import { jipayMock } from '@/lib/payments/jipayMock';
import type { Receipt } from '@/lib/payments/provider';
import { fareFor, isPeak } from '@/lib/demo/demoMode';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: Route;
  vehicle: VehicleStatus;
  boardingStage: string;
}

const PHONE_KEY = 'beacon.demo.phone';

/** Pay a fare for a specific vehicle through Jipay (mocked). Optional: cash still works. */
const PayFareDialog = ({ open, onOpenChange, route, vehicle, boardingStage }: Props) => {
  const [phone, setPhone] = useState(() => {
    try { return localStorage.getItem(PHONE_KEY) ?? '0712 345 678'; } catch { return '0712 345 678'; }
  });
  const [state, setState] = useState<'form' | 'paying' | 'done'>('form');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [now] = useState(() => Date.now());
  const fare = fareFor(route.number, now);

  const pay = async () => {
    setState('paying');
    try { localStorage.setItem(PHONE_KEY, phone); } catch { /* ignore */ }
    const r = await jipayMock.pay({
      routeNumber: route.number,
      routeName: route.name,
      vehiclePlate: vehicle.plate,
      vehicleId: vehicle.vehicleId,
      boardingStage,
      amountKsh: fare,
      phone,
    });
    setReceipt(r);
    setState('done');
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setTimeout(() => { setState('form'); setReceipt(null); }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm rounded-2xl z-[2000]">
        {state !== 'done' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-primary" /> Pay fare with Jipay</DialogTitle>
              <DialogDescription>Demo payment. No money moves.</DialogDescription>
            </DialogHeader>
            <div className="rounded-xl bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span className="font-semibold">{vehicle.plate}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span>{route.number} · {route.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Boarding at</span><span>{boardingStage}</span></div>
              <div className="flex justify-between pt-1 border-t border-border/40 mt-1">
                <span className="text-muted-foreground">Fare {isPeak(now) ? '(peak)' : '(off-peak)'}</span>
                <span className="text-lg font-bold">KSh {fare}</span>
              </div>
            </div>
            <label className="text-xs font-medium text-muted-foreground">Jipay wallet phone number</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" disabled={state === 'paying'} />
            <Button onClick={pay} disabled={state === 'paying' || phone.replace(/\D/g, '').length < 9} className="w-full">
              {state === 'paying' ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Waiting for Jipay…</> : `Pay KSh ${fare}`}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">Paying does not reserve a seat. Cash and M-PESA still work on board.</p>
          </>
        ) : receipt && (
          <div className="text-center space-y-3 py-2">
            <CheckCircle2 className="w-14 h-14 text-accent mx-auto" />
            <div>
              <h2 className="text-lg font-bold">Fare paid</h2>
              <p className="text-sm text-muted-foreground">Show this to the conductor on {receipt.vehiclePlate}.</p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 text-sm text-left space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold">KSh {receipt.amountKsh}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span>{receipt.vehiclePlate}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span>{receipt.routeNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Wallet</span><span>{receipt.phoneMasked}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ref</span><span className="font-mono text-xs">{receipt.transactionId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span>{new Date(receipt.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
            <p className="text-[11px] text-warning font-medium">Demo receipt from a mocked Jipay wallet.</p>
            <Button variant="outline" className="w-full" onClick={() => close(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PayFareDialog;
