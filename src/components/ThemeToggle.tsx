import { Sun, Moon, Zap } from 'lucide-react';
import { useTheme, type MapTheme } from '@/contexts/ThemeContext';

const themes: { id: MapTheme; icon: typeof Sun; label: string }[] = [
  { id: 'bright', icon: Sun, label: 'Light' },
  { id: 'dark', icon: Moon, label: 'Dark' },
  { id: 'live', icon: Zap, label: 'Live' },
];

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center bg-card/90 backdrop-blur-xl rounded-full border border-border/40 p-1 shadow-lg">
      {themes.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setTheme(id)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
            transition-all duration-200
            ${theme === id
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'text-muted-foreground hover:text-foreground'
            }
          `}
          title={label}
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
};

export default ThemeToggle;
