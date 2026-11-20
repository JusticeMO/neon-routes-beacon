import { useEffect, useState } from 'react';
import { CheckCircle2, Coins, Loader2, Smartphone, Trophy, Wallet } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Route } from '@/data/routes';
import type { VehicleStatus } from '@/lib/tracking/vehicleStatus';
import { jipayMock } from '@/lib/payments/jipayMock';
import { mpesaPaybillMock } from '@/lib/payments/mpesaPaybillMock';
import { payWithPoints, payWithPrize } from '@/lib/payments/rewards';
import { POINTS_PER_AD, pointsBalance, pointsForFare } from '@/lib/demo/adPoints';
import { activeVoucher } from '@/lib/demo/tapLeaderboard';
import type { PaymentMethod, PaymentProvider, Receipt } from '@/lib/payments/provider';
import { DEMO_SACCO, DEMO_SACCO_PAYMENTS, JIPAY_PAYBILL, fareFor, isPeak, paybillAccountFor } from '@/lib/demo/demoMode';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: Route;
  vehicle: VehicleStatus;
  boardingStage: string;
}

const PHONE_KEY = 'beacon.demo.phone';
const METHOD_KEY = 'beacon.demo.payMethod';

type CashMethod = 'jipay' | 'mpesa-paybill';
const PROVIDERS: Record<CashMethod, PaymentProvider> = {
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
  const [now] = useState(() => Date.now());
  // A Beacon Tap win covers this fare; offer it first when the commuter has one.
  const [voucher, setVoucher] = useState(() => activeVoucher(Date.now()));
  const fare = fareFor(route.number, now);
  const [points, setPoints] = useState(() => pointsBalance());
  const ptsNeeded = pointsForFare(fare);
  const canUsePoints = points >= ptsNeeded;
  const [method, setMethod] = useState<PaymentMethod>(() => (voucher ? 'prize' : canUsePoints ? 'points' : (read(METHOD_KEY, 'jipay') as PaymentMethod)));
  const [state, setState] = useState<'form' | 'paying' | 'done'>('form');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const paybill = DEMO_SACCO_PAYMENTS.mpesaPaybill;
  const account = paybillAccountFor(vehicle.plate);
  // The dialog stays mounted while a matatu is followed; refresh rewards each time it opens.
  useEffect(() => {
    if (!open) return;
    const v = activeVoucher(Date.now());
    const pts = pointsBalance();
    setVoucher(v);
    setPoints(pts);
    setMethod(v ? 'prize' : pts >= pointsForFare(fare) ? 'points' : (read(METHOD_KEY, 'jipay') as PaymentMethod));
  }, [open, fare]);

  // Jipay: the PayBill is fixed, the commuter only enters the account number (prefilled with this vehicle's).
  const [jipayAccount, setJipayAccount] = useState(account);

  const pay = async () => {
    setState('paying');
    write(PHONE_KEY, phone);
    const free = method === 'prize' || method === 'points';
    if (!free) write(METHOD_KEY, method);
    const req = {
      routeNumber: route.number,
      routeName: route.name,
      vehiclePlate: vehicle.plate,
      vehicleId: vehicle.vehicleId,
      boardingStage,
      amountKsh: fare,
      phone,
      accountRef: method === 'jipay' ? jipayAccount : account,
    };
    const r = method === 'prize' && voucher ? await payWithPrize(req, voucher)
      : method === 'points' ? await payWithPoints(req)
      : await PROVIDERS[free ? 'jipay' : (method as CashMethod)].pay(req);
    setReceipt(r);
    setState('done');
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setTimeout(() => { setState('form'); setReceipt(null); }, 200);
  };

  const options: { id: PaymentMethod; title: string; sub: string; icon: typeof Wallet }[] = [
    ...(canUsePoints ? [{ id: 'points' as const, title: 'Beacon points', sub: `${ptsNeeded} of your ${points} pts. Earned by watching ads.`, icon: Coins }] : []),
    ...(voucher ? [{ id: 'prize' as const, title: 'Beacon Tap prize', sub: `You topped ${voucher.stage}. ${voucher.sponsor} pays this fare.`, icon: Trophy }] : []),
    { id: 'jipay', title: 'Jipay', sub: 'Just the account number. Jipay sets the PayBill.', icon: Wallet },
    { id: 'mpesa-paybill', title: 'SACCO PayBill', sub: `${DEMO_SACCO} · PayBill ${paybill}`, icon: Smartphone },
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

            {method === 'jipay' && (
              <div className="rounded-xl border border-dashed border-border p-3 text-xs space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Jipay PayBill</span><span className="font-mono font-semibold">{JIPAY_PAYBILL} <span className="font-sans font-normal text-muted-foreground">(set)</span></span></div>
                <label htmlFor="jipay-account" className="block text-muted-foreground">Account no. <span className="text-foreground">(on the matatu)</span></label>
                <Input id="jipay-account" value={jipayAccount} onChange={e => setJipayAccount(e.target.value.toUpperCase())} className="font-mono" disabled={state === 'paying'} />
                <p className="text-muted-foreground">Filled in for {vehicle.plate}. You confirm the M-PESA prompt on your phone; Jipay passes the fare to the SACCO.</p>
              </div>
            )}

            {method === 'mpesa-paybill' && (
              <div className="rounded-xl border border-dashed border-border p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Business no.</span><span className="font-mono font-semibold">{paybill}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Account no.</span><span className="font-mono font-semibold">{account}</span></div>
                <p className="text-muted-foreground pt-1">We send an M-PESA prompt to your phone; enter your PIN to pay. You can also pay from the M-PESA menu (Lipa na M-PESA, PayBill) with these numbers.</p>
              </div>
            )}

            {method === 'prize' && (
              <div className="rounded-xl border border-dashed border-accent/50 bg-accent/5 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">You pay</span><span className="font-semibold">KSh 0</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{voucher?.sponsor} pays SACCO PayBill</span><span className="font-mono font-semibold">{paybill} / {account}</span></div>
                <p className="text-muted-foreground pt-1">The SACCO gets the full KSh {fare} for {vehicle.plate}, as for any fare. One free fare per win, valid today.</p>
              </div>
            )}

            {method === 'points' && (
              <div className="rounded-xl border border-dashed border-warning/50 bg-warning/5 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">You spend</span><span className="font-semibold">{ptsNeeded} pts (KSh 0 cash)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Left after</span><span>{points - ptsNeeded} pts</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Beacon pays SACCO PayBill</span><span className="font-mono font-semibold">{paybill} / {account}</span></div>
                <p className="text-muted-foreground pt-1">Advertisers fund the points, so the SACCO gets the full KSh {fare} for {vehicle.plate}.</p>
              </div>
            )}

            {!canUsePoints && points > 0 && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Coins className="w-3.5 h-3.5 text-warning" /> {points} of {ptsNeeded} pts for a free fare. Watch {Math.ceil((ptsNeeded - points) / POINTS_PER_AD)} more ads while you wait.</p>
            )}

            {method !== 'prize' && method !== 'points' && (
              <>
                <label htmlFor="pay-phone" className="text-xs font-medium text-muted-foreground">M-PESA phone number</label>
                <Input id="pay-phone" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" disabled={state === 'paying'} />
              </>
            )}
            <Button onClick={pay} disabled={state === 'paying' || (method !== 'prize' && method !== 'points' && phone.replace(/\D/g, '').length < 9) || (method === 'jipay' && jipayAccount.trim().length < 3)} className="w-full">
              {state === 'paying'
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {method === 'prize' ? 'Claiming your prize…' : method === 'points' ? 'Redeeming points…' : 'Check your phone for the M-PESA prompt…'}</>
                : method === 'prize' ? 'Ride free with your prize' : method === 'points' ? `Pay with ${ptsNeeded} points` : `Pay KSh ${fare}`}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">Paying does not reserve a seat. Cash still works on board.</p>
          </>
        ) : receipt && (
          <div className="text-center space-y-3 py-2">
            <CheckCircle2 className="w-14 h-14 text-accent mx-auto" />
            <div>
              <h2 className="text-lg font-bold">{receipt.method === 'prize' ? 'Fare paid by your prize' : receipt.method === 'points' ? 'Fare paid with points' : 'Fare paid'}</h2>
              <p className="text-sm text-muted-foreground">Show this to the conductor on {receipt.vehiclePlate}.</p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 text-sm text-left space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold">KSh {receipt.amountKsh}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid with</span><span>{receipt.provider}</span></div>
              {receipt.paybill && <div className="flex justify-between"><span className="text-muted-foreground">PayBill / Account</span><span className="font-mono text-xs">{receipt.paybill} / {receipt.accountRef}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span>{receipt.vehiclePlate}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span>{receipt.routeNumber}</span></div>
              {receipt.method !== 'prize' && receipt.method !== 'points' && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{receipt.phoneMasked}</span></div>}
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
