import { useEffect, useRef, useState } from 'react';
import { Gamepad2, Megaphone, X } from 'lucide-react';

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

export const SponsoredCard = ({ seed = 0, onDark = false }: { seed?: number; onDark?: boolean }) => {
  const ad = ADS[seed % ADS.length];
  return (
    <div className={`rounded-xl p-3 flex items-start gap-3 ${ad.tone}`}>
      <Megaphone className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider opacity-70">Sponsored · {ad.brand}</div>
        <div className={`text-xs mt-0.5 ${onDark ? 'text-white' : 'text-foreground'}`}>{ad.text}</div>
      </div>
      <span className="text-[11px] font-semibold whitespace-nowrap">{ad.cta}</span>
    </div>
  );
};

const GAME_MS = 15_000;
const BEST_KEY = 'beacon.demo.tapBest';

/** "Beacon Tap": tap the lit beacon before it moves. 15 seconds a round. */
export const BeaconTapGame = ({ onClose }: { onClose: () => void }) => {
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
        if (scoreRef.current > best) {
          setBest(scoreRef.current);
          try { localStorage.setItem(BEST_KEY, String(scoreRef.current)); } catch { /* ignore */ }
        }
      } else setLeft(l);
    }, 100);
    const move = setInterval(() => setLit(Math.floor(Math.random() * 9)), 750);
    return () => { clearInterval(tick); clearInterval(move); };
  }, [endsAt, best]);

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
          <button onClick={start} className="text-xs font-semibold text-primary">{left === 0 ? `You got ${score}. Play again` : 'Start a 15 s round'}</button>
        )}
      </div>
    </div>
  );
};
