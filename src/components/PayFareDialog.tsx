import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Coins, Home, Loader2, RefreshCw, Smartphone, Trophy, Wallet, XCircle } from 'lucide-react';
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
import { cachedProfile, checkFare, fetchProfile, retrySameKey, sakafindProvider, SakafindError, walletBlock, type SakafindProfile } from '@/lib/integrations/sakafind';
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
 * as account number. Both are mocked. A commuter who signed in with Sakafind can also pay
 * from their JiPay wallet there (real when Sakafind is configured). Optional: cash still works.
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
  const [linked, setLinked] = useState<SakafindProfile | null>(() => cachedProfile());
  const savedMethod = (p: SakafindProfile | null): PaymentMethod => {
    const m = read(METHOD_KEY, 'jipay') as PaymentMethod;
    return m === 'sakafind' && (!p || walletBlock(p, fare)) ? 'jipay' : m;
  };
  const [method, setMethod] = useState<PaymentMethod>(() => (voucher ? 'prize' : canUsePoints ? 'points' : savedMethod(cachedProfile())));
  // One key per fare: a retry after a dropped connection must find the first payment, not pay again.
  const [fareKey, setFareKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'form' | 'paying' | 'done'>('form');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const paybill = DEMO_SACCO_PAYMENTS.mpesaPaybill;
  const account = paybillAccountFor(vehicle.plate);
  // The dialog stays mounted while a matatu is followed; refresh rewards each time it opens.
  useEffect(() => {
    if (!open) return;
    const v = activeVoucher(Date.now());
    const pts = pointsBalance();
    const p = cachedProfile();
    setVoucher(v);
    setPoints(pts);
    setLinked(p);
    setError(null);
    setMethod(v ? 'prize' : pts >= pointsForFare(fare) ? 'points' : savedMethod(p));
    // The balance and this week's limit move with every fare and rent payment: ask again.
    if (p) {
      fetchProfile()
        .then(fresh => setLinked(fresh))
        .catch(e => { if (e instanceof SakafindError && (e.code === 'SIGNED_OUT' || e.code === 'NOT_AVAILABLE')) { setLinked(null); setWalletNote(e.message); } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fare]);
  const sakafindBlocked = walletBlock(linked, fare);
  const [walletNote, setWalletNote] = useState<string | null>(null);
  useEffect(() => { if (open) setWalletNote(null); }, [open]);
  const [checking, setChecking] = useState(false);
  const recheck = async () => {
    if (!receipt) return;
    setChecking(true);
    try { setReceipt(await checkFare(receipt)); } catch (e) { setError((e as Error).message); } finally { setChecking(false); }
  };

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
    setError(null);
    try {
      const r = method === 'prize' && voucher ? await payWithPrize(req, voucher)
        : method === 'points' ? await payWithPoints(req)
        : method === 'sakafind' ? await sakafindProvider(paybill).pay({ ...req, accountRef: account, idempotencyKey: fareKey })
        : await PROVIDERS[free ? 'jipay' : (method as CashMethod)].pay(req);
      setReceipt(r);
      setState('done');
    } catch (e) {
      setError((e as Error).message || 'Payment failed. Try again or pay cash.');
      setState('form');
      if (method === 'sakafind') {
        // Keep the key only when the request may have arrived (no answer), so trying again
        // finds that fare; after a clear refusal the next attempt is a new fare.
        if (!retrySameKey(e)) setFareKey(crypto.randomUUID());
        if (e instanceof SakafindError && (e.code === 'SIGNED_OUT' || e.code === 'NOT_AVAILABLE')) { setLinked(null); setMethod('jipay'); setWalletNote(e.message); }
        else fetchProfile().then(setLinked).catch(() => undefined);
      }
    }
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setTimeout(() => { setState('form'); setReceipt(null); setFareKey(crypto.randomUUID()); }, 200);
  };

  const options: { id: PaymentMethod; title: string; sub: string; icon: typeof Wallet; disabled?: boolean }[] = [
    ...(canUsePoints ? [{ id: 'points' as const, title: 'Beacon points', sub: `${ptsNeeded} of your ${points} pts. Earned by watching ads.`, icon: Coins }] : []),
    ...(voucher ? [{ id: 'prize' as const, title: 'Beacon Tap prize', sub: `You topped ${voucher.stage}. ${voucher.sponsor} pays this fare.`, icon: Trophy }] : []),
    ...(linked ? [{
      id: 'sakafind' as const, title: 'JiPay wallet (Sakafind)', icon: Home, disabled: Boolean(sakafindBlocked),
      sub: sakafindBlocked ?? `KSh ${(linked.balance_kes ?? 0).toLocaleString()} in wallet · KSh ${linked.allowance_left_kes.toLocaleString()} left of your 7-day limit${linked.demo ? ' · demo' : ''}`,
    }] : []),
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
              <DialogDescription>{method === 'sakafind' && linked && !linked.demo ? 'Paid from your Sakafind wallet to the SACCO PayBill.' : 'Demo payment. No money moves.'}</DialogDescription>
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
              {options.map(({ id, title, sub, icon: Icon, disabled }) => (
                <label key={id} data-testid={`pay-method-${id}`} className={`flex items-center gap-3 rounded-xl border p-3 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${method === id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" name="pay-method" value={id} checked={method === id} disabled={disabled} onChange={() => setMethod(id)} className="accent-[hsl(var(--primary))]" />
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

            {method === 'sakafind' && linked && (
              <div className="rounded-xl border border-dashed border-border p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Pays SACCO PayBill</span><span className="font-mono font-semibold">{paybill} / {account}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Limit per fare</span><span>KSh {linked.per_fare_max_kes}</span></div>
                <p className="text-muted-foreground pt-1">No M-PESA prompt: the fare comes out of the wallet you pay rent from, within the weekly limit you set on Sakafind.</p>
              </div>
            )}

            {!canUsePoints && points > 0 && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Coins className="w-3.5 h-3.5 text-warning" /> {points} of {ptsNeeded} pts for a free fare. Watch {Math.ceil((ptsNeeded - points) / POINTS_PER_AD)} more ads while you wait.</p>
            )}

            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
            {walletNote && !error && <p className="text-xs text-muted-foreground" data-testid="wallet-note">{walletNote}</p>}

            {method !== 'prize' && method !== 'points' && method !== 'sakafind' && (
              <>
                <label htmlFor="pay-phone" className="text-xs font-medium text-muted-foreground">M-PESA phone number</label>
                <Input id="pay-phone" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" disabled={state === 'paying'} />
              </>
            )}
            <Button onClick={pay} disabled={state === 'paying' || (method === 'sakafind' && Boolean(sakafindBlocked)) || (method !== 'prize' && method !== 'points' && method !== 'sakafind' && phone.replace(/\D/g, '').length < 9) || (method === 'jipay' && jipayAccount.trim().length < 3)} className="w-full">
              {state === 'paying'
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {method === 'prize' ? 'Claiming your prize…' : method === 'points' ? 'Redeeming points…' : method === 'sakafind' ? 'Paying from your wallet…' : 'Check your phone for the M-PESA prompt…'}</>
                : method === 'prize' ? 'Ride free with your prize' : method === 'points' ? `Pay with ${ptsNeeded} points` : `Pay KSh ${fare}`}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">Paying does not reserve a seat. Cash still works on board.</p>
          </>
        ) : receipt && (
          <div className="text-center space-y-3 py-2">
            {receipt.status === 'pending' ? <Clock className="w-14 h-14 text-warning mx-auto" />
              : receipt.status === 'failed' ? <XCircle className="w-14 h-14 text-destructive mx-auto" />
              : <CheckCircle2 className="w-14 h-14 text-accent mx-auto" />}
            <div>
              <h2 className="text-lg font-bold" data-testid="receipt-title">{receipt.status === 'pending' ? 'Fare sent, waiting for JiPay' : receipt.status === 'failed' ? 'Fare not paid' : receipt.method === 'prize' ? 'Fare paid by your prize' : receipt.method === 'points' ? 'Fare paid with points' : 'Fare paid'}</h2>
              <p className="text-sm text-muted-foreground">{receipt.status === 'pending' ? 'JiPay has not confirmed yet. Do not pay again: check again in a moment, or look in your Sakafind wallet.' : receipt.status === 'failed' ? (receipt.failureMessage ?? 'JiPay did not pay this fare. No money was taken.') + ' Pay another way.' : `Show this to the conductor on ${receipt.vehiclePlate}.`}</p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 text-sm text-left space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold">KSh {receipt.amountKsh}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid with</span><span>{receipt.provider}</span></div>
              {receipt.paybill && <div className="flex justify-between"><span className="text-muted-foreground">PayBill / Account</span><span className="font-mono text-xs">{receipt.paybill} / {receipt.accountRef}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Vehicle</span><span>{receipt.vehiclePlate}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span>{receipt.routeNumber}</span></div>
              {receipt.method !== 'prize' && receipt.method !== 'points' && receipt.method !== 'sakafind' && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{receipt.phoneMasked}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">{receipt.method === 'mpesa-paybill' ? 'M-PESA code' : 'Ref'}</span><span className="font-mono text-xs">{receipt.transactionId}</span></div>
              {receipt.mpesaReceipt && <div className="flex justify-between"><span className="text-muted-foreground">M-PESA code</span><span className="font-mono text-xs">{receipt.mpesaReceipt}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span>{new Date(receipt.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
            {receipt.demo && <p className="text-[11px] text-warning font-medium">Demo receipt. No money moved.</p>}
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
            {receipt.status === 'pending' && receipt.method === 'sakafind' && (
              <Button className="w-full" onClick={recheck} disabled={checking} data-testid="check-again">
                {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Check again
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => close(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PayFareDialog;
