import { Link } from 'react-router-dom';
import { Building2, MonitorPlay, Radio, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export const DEMO_VIEWS = [
  { to: '/board', icon: MonitorPlay, label: 'Stage board', desc: 'Big-screen view of matatus heading into the CBD termini' },
  { to: '/crew', icon: Radio, label: 'Crew app', desc: 'Start a shift and share the vehicle location' },
  { to: '/sacco', icon: Building2, label: 'SACCO dashboard', desc: 'Fleet coverage, exceptions and fares by PayBill and Jipay' },
];

/** Switch between the demo's commuter, stage, crew and SACCO views. */
const DemoViewsMenu = () => (
  <Popover>
    <PopoverTrigger asChild>
      <button className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-card/95 backdrop-blur-md border border-border/40 shadow-md text-xs font-semibold">
        <Sparkles className="w-4 h-4 text-primary" /> Demo views
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72 p-2 z-[1100]">
      {DEMO_VIEWS.map(({ to, icon: Icon, label, desc }) => (
        <Link key={to} to={to} className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/40">
          <Icon className="w-4 h-4 mt-0.5 text-primary" />
          <div>
            <div className="text-sm font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        </Link>
      ))}
    </PopoverContent>
  </Popover>
);

export default DemoViewsMenu;
