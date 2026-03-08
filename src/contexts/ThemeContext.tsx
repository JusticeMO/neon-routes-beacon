import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type MapTheme = 'dark' | 'bright' | 'live';

interface ThemeContextType {
  theme: MapTheme;
  setTheme: (theme: MapTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<MapTheme>(() => {
    return (localStorage.getItem('beacon-theme') as MapTheme) || 'bright';
  });

  useEffect(() => {
    localStorage.setItem('beacon-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
