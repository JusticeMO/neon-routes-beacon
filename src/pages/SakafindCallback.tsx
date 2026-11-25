import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { completeConnect } from '@/lib/integrations/sakafind';

/** Sakafind sends the commuter back here after they answer its consent screen. */
const SakafindCallback = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the code works once; React's dev double-run must not spend it twice
    started.current = true;
    completeConnect(params)
      .then(({ returnTo }) => navigate(returnTo, { replace: true, state: { tab: 'profile' } }))
      .catch(e => setError((e as Error).message));
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-center">
      {error ? (
        <div className="space-y-3 max-w-xs">
          <p className="text-sm">{error}</p>
          <Link to="/" className="text-sm text-primary underline">Back to Beacon</Link>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Connecting Sakafind…</p>
      )}
    </div>
  );
};

export default SakafindCallback;
