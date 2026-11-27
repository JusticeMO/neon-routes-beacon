import { useEffect, useState } from 'react';
import { Home, Loader2, LogOut, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  cachedProfile, connectDemo, connectUrl, connectViaParent, disconnect, fetchProfile, sakafindLive, type SakafindProfile,
} from '@/lib/integrations/sakafind';
import { isEmbedded } from '@/lib/embed';

const ksh = (n: number | null | undefined) => `KSh ${(n ?? 0).toLocaleString()}`;

/** Profile card: "Continue with Sakafind", then the shared JiPay wallet and this week's fare limit. */
const SakafindCard = () => {
  const [profile, setProfile] = useState<SakafindProfile | null>(() => cachedProfile());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const embedded = isEmbedded();

  useEffect(() => {
    fetchProfile().then(p => setProfile(p)).catch(e => {
      // Signed out on Sakafind's side: show the connect button again, with the reason.
      if ((e as { code?: string }).code === 'SIGNED_OUT') setProfile(null);
      setError((e as Error).message);
    });
  }, []);

  const connect = async () => {
    setError(null);
    if (!sakafindLive) { setProfile(connectDemo()); return; }
    setBusy(true);
    if (embedded) {
      // Inside Sakafind: its own consent step opens over this map, and the answer comes back here.
      try {
        setProfile(await connectViaParent());
      } catch (e) {
        setError((e as Error).message || 'Could not connect Sakafind. Try again.');
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      window.location.assign(await connectUrl('/'));
    } catch {
      // crypto.subtle needs https: an http preview cannot make the PKCE challenge.
      setBusy(false);
      setError('Sign-in with Sakafind needs a secure (https) page. Open Beacon over https and try again.');
    }
  };

  // Inside Sakafind's Matatus tab with wallet fares switched off, a demo wallet would only
  // confuse a real tenant, so the card stays out of the way until Sakafind is connected.
  if (embedded && !sakafindLive && !profile) return null;

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
          <div className="text-[10px] text-muted-foreground">Left of {ksh(profile.weekly_allowance_kes)} per 7 days</div>
        </div>
      </div>
      {error && <p className="text-[11px] text-warning">Could not refresh just now; showing the last balance Beacon saw.</p>}
      {!profile.wallet_open && <p className="text-[11px] text-muted-foreground">Open your JiPay wallet in Sakafind to pay fares from it.</p>}
      {profile.wallet_open && profile.weekly_allowance_kes === 0 && <p className="text-[11px] text-muted-foreground">You connected for sign-in only. Raise the weekly limit by connecting again.</p>}
    </div>
  );
};

export default SakafindCard;
