import { useEffect, useState } from 'react';
import { Home, Loader2, LogOut, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  cachedProfile, connectDemo, connectUrl, disconnect, fetchProfile, sakafindLive, type SakafindProfile,
} from '@/lib/integrations/sakafind';

const ksh = (n: number | null | undefined) => `KSh ${(n ?? 0).toLocaleString()}`;

/** Profile card: "Continue with Sakafind", then the shared JiPay wallet and this week's fare limit. */
const SakafindCard = () => {
  const [profile, setProfile] = useState<SakafindProfile | null>(() => cachedProfile());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile().then(p => setProfile(p)).catch(e => setError((e as Error).message));
  }, []);

  const connect = async () => {
    setError(null);
    if (!sakafindLive) { setProfile(connectDemo()); return; }
    setBusy(true);
    window.location.assign(await connectUrl('/'));
  };

  if (!profile) {
    return (
      <div className="bg-card rounded-2xl border border-border/30 p-4 mb-5 space-y-3" data-testid="sakafind-card">
        <div className="flex items-start gap-3">
          <Home className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Rent with Sakafind?</p>
            <p className="text-[11px] text-muted-foreground">Sign in with your Sakafind account and pay fares from the same JiPay wallet you pay rent from, up to a weekly limit you choose.</p>
          </div>
        </div>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        <Button className="w-full" onClick={connect} disabled={busy} data-testid="sakafind-connect">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Continue with Sakafind${sakafindLive ? '' : ' (demo)'}`}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/30 p-4 mb-5 space-y-3" data-testid="sakafind-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">JiPay wallet (Sakafind)</p>
            <p className="text-[11px] text-muted-foreground">Signed in as {profile.first_name || 'you'}{profile.demo ? ' · demo, no money moves' : ''}</p>
          </div>
        </div>
        <button onClick={() => { disconnect(); setProfile(null); }} className="text-[11px] text-muted-foreground flex items-center gap-1" aria-label="Disconnect Sakafind">
          <LogOut className="w-3.5 h-3.5" /> Disconnect
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-muted/40 p-2">
          <div className="text-base font-bold" data-testid="sakafind-balance">{profile.wallet_open ? ksh(profile.balance_kes) : 'Not open'}</div>
          <div className="text-[10px] text-muted-foreground">Wallet balance</div>
        </div>
        <div className="rounded-xl bg-muted/40 p-2">
          <div className="text-base font-bold">{ksh(profile.allowance_left_kes)}</div>
          <div className="text-[10px] text-muted-foreground">Left of {ksh(profile.weekly_allowance_kes)} this week</div>
        </div>
      </div>
      {!profile.wallet_open && <p className="text-[11px] text-muted-foreground">Open your JiPay wallet in Sakafind to pay fares from it.</p>}
      {profile.wallet_open && profile.weekly_allowance_kes === 0 && <p className="text-[11px] text-muted-foreground">You connected for sign-in only. Raise the weekly limit by connecting again.</p>}
    </div>
  );
};

export default SakafindCard;
