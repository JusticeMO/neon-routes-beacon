import { useEffect, useRef, useState } from 'react';
import { Coins, Gamepad2, Megaphone, PlayCircle, Ticket, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AD_SECONDS, KSH_PER_POINT, MAX_ADS_PER_DAY, POINTS_PER_AD, creditAdView, pointsBalance } from '@/lib/demo/adPoints';
import { activeVoucher, leaderboard, recordScore, roundEndsAt, roundIdAt, sponsorFor } from '@/lib/demo/tapLeaderboard';

/**
 * Engagement while commuters wait at the stage: one sponsored slot and a
 * short tap game. Both are demo content; real ads would come from an ad
 * inventory the SACCO or Beacon sells per route and stage.
 */
const ADS = [
  { brand: 'Jipay', text: 'Pay your fare from your phone. No change needed.', cta: 'Get Jipay', tone: 'bg-primary/10 text-primary' },
  { brand: 'Mama Njeri Snacks', text: 'Hot samosas at Kencom stage, KSh 30. Ready before your matatu is.', cta: 'Find the stall', tone: 'bg-warning/15 text-warning' },
  { brand: 'Stage Data Bundles', text: '1 GB for KSh 50. Stream while you wait.', cta: 'Buy bundle', tone: 'bg-accent/15 text-accent' },
];

/** Live points balance; updates when an ad is credited or points are spent. */
export function usePoints() {
  const [pts, setPts] = useState(() => pointsBalance());
  useEffect(() => {
    const on = () => setPts(pointsBalance());
    window.addEventListener('beacon-points', on);
    return () => window.removeEventListener('beacon-points', on);
  }, []);
  return pts;
}

/**
 * A sponsored slot. With `earn`, the commuter can watch a 15 s clip for
 * Beacon points, which they redeem as fare (1 point = KSh 1).
 */
export const SponsoredCard = ({ seed = 0, onDark = false, earn = false }: { seed?: number; onDark?: boolean; earn?: boolean }) => {
  const [extra, setExtra] = useState(0);
  const [watching, setWatching] = useState(false);
  const points = usePoints();
  const ad = ADS[(seed + extra) % ADS.length];
  return (
    <div className={`rounded-xl p-3 ${ad.tone}`}>
      <div className="flex items-start gap-3">
        <Megaphone className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider opacity-70">Sponsored · {ad.brand}</div>
          <div className={`text-xs mt-0.5 ${onDark ? 'text-white' : 'text-foreground'}`}>{ad.text}</div>
        </div>
        <span className="text-[11px] font-semibold whitespace-nowrap">{ad.cta}</span>
      </div>
      {earn && (
        <div className="mt-2 pt-2 border-t border-current/10 flex items-center gap-2">
          <button onClick={() => setWatching(true)} className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-background/70 text-foreground border border-border/40">
            <PlayCircle className="w-3.5 h-3.5 text-primary" /> Watch {AD_SECONDS} s · +{POINTS_PER_AD} pts
          </button>
          <span className="ml-auto flex items-center gap-1 text-[11px] text-foreground" data-testid="points-balance">
            <Coins className="w-3.5 h-3.5 text-warning" /> <b>{points}</b> pts = KSh {points * KSH_PER_POINT}
          </span>
        </div>
      )}
      {earn && (
        <WatchAdDialog
          open={watching}
          ad={ad}
          onClose={() => setWatching(false)}
          onWatched={() => { setWatching(false); setExtra(e => e + 1); }}
        />
      )}
    </div>
  );
};

const WatchAdDialog = ({ open, ad, onClose, onWatched }: { open: boolean; ad: typeof ADS[number]; onClose: () => void; onWatched: () => void }) => {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const total = AD_SECONDS * 1000;

  useEffect(() => {
    if (!open) { setStartedAt(null); setElapsed(0); return; }
    const t0 = Date.now();
    setStartedAt(t0);
    const id = setInterval(() => setElapsed(Math.min(total, Date.now() - t0)), 200);
    return () => clearInterval(id);
  }, [open, total]);

  const done = startedAt !== null && elapsed >= total;
  const claim = () => {
    const bal = creditAdView();
    if (bal === null) toast.error(`That's today's limit of ${MAX_ADS_PER_DAY} ads. Points still count tomorrow.`);
    else toast.success(`+${POINTS_PER_AD} points. You have ${bal} pts (KSh ${bal * KSH_PER_POINT} of fare).`);
    onWatched();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm rounded-2xl z-[2000] p-0 overflow-hidden">
        <DialogTitle className="sr-only">Sponsored clip from {ad.brand}</DialogTitle>
        <DialogDescription className="sr-only">Watch to the end to earn {POINTS_PER_AD} Beacon points.</DialogDescription>
        <div className={`aspect-[4/5] flex flex-col items-center justify-center text-center p-6 relative ${ad.tone}`}>
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,currentColor,transparent_60%)] animate-pulse" />
          <Megaphone className="w-10 h-10 mb-3 relative" />
          <div className="text-2xl font-bold relative">{ad.brand}</div>
          <p className="text-sm text-foreground mt-2 relative">{ad.text}</p>
          <span className="mt-4 text-xs font-semibold px-3 py-1.5 rounded-full bg-background/80 text-foreground relative">{ad.cta}</span>
          <span className="absolute top-3 left-3 text-[10px] uppercase tracking-wider opacity-70">Sponsored · demo clip</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${(elapsed / total) * 100}%` }} /></div>
          {done ? (
            <Button className="w-full" onClick={claim}><Coins className="w-4 h-4 mr-2" /> Collect {POINTS_PER_AD} points</Button>
          ) : (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Watch to the end for +{POINTS_PER_AD} pts · {Math.ceil((total - elapsed) / 1000)} s</span>
              <button onClick={onClose} className="underline">Skip (no points)</button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const GAME_MS = 15_000;
const BEST_KEY = 'beacon.demo.tapBest';

const clockTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * "Beacon Tap": tap the lit beacon before it moves. 15 seconds a game. Players
 * at the same stage share a 5-minute round; whoever tops the board when the
 * round closes gets their next fare paid by the round's sponsor.
 */
export const BeaconTapGame = ({ stage, now, onClose }: { stage: string; now: number; onClose: () => void }) => {
  const [lit, setLit] = useState(4);
  const [score, setScore] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left, setLeft] = useState(GAME_MS);
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY) ?? 0); } catch { return 0; }
  });
  const scoreRef = useRef(0);

  useEffect(() => {
    if (!endsAt) return;
    const tick = setInterval(() => {
      const l = endsAt - Date.now();
      if (l <= 0) {
        setEndsAt(null);
        setLeft(0);
        recordScore(stage, scoreRef.current, Date.now());
        if (scoreRef.current > best) {
          setBest(scoreRef.current);
          try { localStorage.setItem(BEST_KEY, String(scoreRef.current)); } catch { /* ignore */ }
        }
      } else setLeft(l);
    }, 100);
    const move = setInterval(() => setLit(Math.floor(Math.random() * 9)), 750);
    return () => { clearInterval(tick); clearInterval(move); };
  }, [endsAt, best, stage]);

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setLeft(GAME_MS);
    setEndsAt(Date.now() + GAME_MS);
  };

  const tap = (i: number) => {
    if (!endsAt || i !== lit) return;
    scoreRef.current += 1;
    setScore(scoreRef.current);
    setLit(n => (n + 1 + Math.floor(Math.random() * 8)) % 9);
  };

  const voucher = activeVoucher(now);
  const roundId = roundIdAt(now);
  const closes = roundEndsAt(roundId);
  const sponsor = sponsorFor(roundId);
  const board = leaderboard(stage, now);
  const youTop = board[0]?.you;
  const minsLeft = Math.max(1, Math.ceil((closes - now) / 60_000));

  return (
    <div className="rounded-xl border border-border/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Gamepad2 className="w-4 h-4 text-primary" /> Beacon Tap</div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Score <b className="text-foreground">{score}</b></span>
          <span>Best <b className="text-foreground">{best}</b></span>
          <button onClick={onClose} aria-label="Close game"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {voucher && (
        <div className="mb-2 rounded-lg bg-accent/15 text-accent p-2 text-xs flex items-start gap-2" data-testid="tap-voucher">
          <Ticket className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span><b>You won your fare.</b> You topped {voucher.stage} with {voucher.score}. Follow a matatu and tap Pay: {voucher.sponsor} covers it today.</span>
        </div>
      )}

      <div className="mb-2 rounded-lg bg-warning/10 p-2 text-[11px] flex items-center gap-2">
        <Trophy className="w-4 h-4 text-warning flex-shrink-0" />
        <span className="flex-1">Top scorer at <b>{stage}</b> when the round closes at <b>{clockTime(closes)}</b> gets their fare paid by {sponsor}.</span>
      </div>

      <div className="grid grid-cols-3 gap-2 max-w-[168px] mx-auto">
        {Array.from({ length: 9 }, (_, i) => (
          <button
            key={i}
            onClick={() => tap(i)}
            aria-label={i === lit && endsAt ? 'Lit beacon' : 'Beacon'}
            className={`aspect-square rounded-full border-2 transition-all ${endsAt && i === lit ? 'bg-primary border-primary shadow-[0_0_18px_hsl(var(--primary))] scale-105' : 'bg-muted/40 border-border/40'}`}
          />
        ))}
      </div>
      <div className="mt-2 text-center">
        {endsAt ? (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${(left / GAME_MS) * 100}%` }} /></div>
        ) : (
          <button onClick={start} className="text-xs font-semibold text-primary">{left === 0 ? `You got ${score}. Play again` : 'Start a 15 s game'}</button>
        )}
      </div>

      <div className="mt-3" data-testid="tap-leaderboard">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          <span>This round at {stage}</span>
          <span>Closes in {minsLeft} min</span>
        </div>
        {board.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Nobody has played yet. Be first.</p>
        ) : (
          <ol className="text-xs divide-y divide-border/20">
            {board.slice(0, 5).map((e, i) => (
              <li key={e.name} className={`flex items-center gap-2 py-1 ${e.you ? 'font-semibold text-primary' : ''}`}>
                <span className="w-4 text-muted-foreground">{i + 1}</span>
                <span className="flex-1">{e.name}{i === 0 && <Trophy className="inline w-3 h-3 ml-1 text-warning" />}</span>
                <span>{e.score}</span>
              </li>
            ))}
          </ol>
        )}
        {!endsAt && board.some(e => e.you) && (
          <p className="text-[11px] mt-1 text-muted-foreground">
            {youTop ? `You're on top. Hold it until ${clockTime(closes)} and your next fare is free.` : `Beat ${board[0].score} to take the top spot.`}
          </p>
        )}
      </div>
    </div>
  );
};
