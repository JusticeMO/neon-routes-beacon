import { useState } from 'react';
import { CheckCircle2, Loader2, Smartphone, Wallet } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Route } from '@/data/routes';
import type { VehicleStatus } from '@/lib/tracking/vehicleStatus';
import { jipayMock } from '@/lib/payments/jipayMock';
import { mpesaPaybillMock } from '@/lib/payments/mpesaPaybillMock';
import type { PaymentMethod, PaymentProvider, Receipt } from '@/lib/payments/provider';
import { DEMO_SACCO, DEMO_SACCO_PAYMENTS, fareFor, isPeak, paybillAccountFor } from '@/lib/demo/demoMode';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: Route;
  vehicle: VehicleStatus;
  boardingStage: string;
}

const PHONE_KEY = 'beacon.demo.phone';
const METHOD_KEY = 'beacon.demo.payMethod';

const PROVIDERS: Record<PaymentMethod, PaymentProvider> = {
  jipay: jipayMock,
  'mpesa-paybill': mpesaPaybillMock,
};

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/**
 * Pay a fare for a specific vehicle. Methods are the ones the SACCO has set
 * up: Jipay wallet, or M-PESA to the SACCO's own PayBill with the vehicle plate
 * as account number. Both are mocked. Optional: cash still works.
 */
const PayFareDialog = ({ open, onOpenChange, route, vehicle, boardingStage }: Props) => {
  const [phone, setPhone] = useState(() => read(PHONE_KEY, '0712 345 678'));
  const [method, setMethod] = useState<PaymentMethod>(() => (read(METHOD_KEY, 'mpesa-paybill') as PaymentMethod));
  const [state, setState] = useState<'form' | 'paying' | 'done'>('form');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [now] = useState(() => Date.now());
  const fare = fareFor(route.number, now);
  const paybill = DEMO_SACCO_PAYMENTS.mpesaPaybill;
  const account = paybillAccountFor(vehicle.plate);

  const pay = async () => {
    setState('paying');
    write(PHONE_KEY, phone);
    write(METHOD_KEY, method);
    const r = await PROVIDERS[method].pay({
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

  const options: { id: PaymentMethod; title: string; sub: string; icon: typeof Wallet }[] = [
    { id: 'mpesa-paybill', title: 'M-PESA PayBill', sub: `${DEMO_SACCO} · PayBill ${paybill}`, icon: Smartphone },
    { id: 'jipay', title: 'Jipay wallet', sub: 'Pay from your Jipay balance', icon: Wallet },
  ];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm rounded-2xl z-[2000] max-h-[90vh] overflow-y-auto">
        {state !== 'done' ? (
          <>
            <DialogHeader>
              <DialogTitle>Pay fare</DialogTitle>
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

            <fieldset className="space-y-2" disabled={state === 'paying'}>
              <legend className="text-xs font-medium text-muted-foreground mb-1">Pay with</legend>
              {options.map(({ id, title, sub, icon: Icon }) => (
                <label key={id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${method === id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" name="pay-method" value={id} checked={method === id} onChange={() => setMethod(id)} className="accent-[hsl(var(--primary))]" />
                  <Icon className="w-5 h-5 text-primary" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-[11px] text-muted-foreground">{sub}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {method === 'mpesa-paybill' && (
              <div className="rounded-xl border border-dashed border-border p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Business no.</span><span className="font-mono font-semibold">{paybill}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Account no.</span><span className="font-mono font-semibold">{account}</span></div>
                <p className="text-muted-foreground pt-1">We send an M-PESA prompt to your phone; enter your PIN to pay. You can also pay from the M-PESA menu (Lipa na M-PESA, PayBill) with these numbers.</p>
              </div>
            )}

            <label htmlFor="pay-phone" className="text-xs font-medium text-muted-foreground">{method === 'jipay' ? 'Jipay wallet phone number' : 'M-PESA phone number'}</label>
            <Input id="pay-phone" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" disabled={state === 'paying'} />
            <Button onClick={pay} disabled={state === 'paying' || phone.replace(/\D/g, '').length < 9} className="w-full">
              {state === 'paying'
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {method === 'jipay' ? 'Waiting for Jipay…' : 'Check your phone for the M-PESA prompt…'}</>
                : `Pay KSh ${fare}`}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">Paying does not reserve a seat. Cash still works on board.</p>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Paid with</span><span>{receipt.provider}</span></div>
              {receipt.paybill && <div className="flex justify-between"><span className="text-muted-foreground">PayBill / Account</span><span className="font-mono text-xs">{receipt.paybill} / {receipt.accountRef}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span>{receipt.vehiclePlate}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span>{receipt.routeNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{receipt.phoneMasked}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{receipt.method === 'mpesa-paybill' ? 'M-PESA code' : 'Ref'}</span><span className="font-mono text-xs">{receipt.transactionId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span>{new Date(receipt.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
            <p className="text-[11px] text-warning font-medium">Demo receipt. No money moved.</p>
            <Button variant="outline" className="w-full" onClick={() => close(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PayFareDialog;
