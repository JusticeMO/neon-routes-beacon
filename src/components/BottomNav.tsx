import { useState } from 'react';
import { Home, Route, AlertTriangle, User } from 'lucide-react';

interface NavItem {
  id: string;
  icon: typeof Home;
  label: string;
  badge?: number;
}

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const navItems: NavItem[] = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'routes', icon: Route, label: 'Routes' },
    { id: 'alerts', icon: AlertTriangle, label: 'Alerts', badge: 2 },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      {/* Gradient overlay for smooth transition */}
      <div className="h-8 bg-gradient-to-t from-background to-transparent" />
      
      <div className="glass-surface border-t border-glass-border px-4 py-2">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`
                  relative flex flex-col items-center space-y-1 py-2 px-4 rounded-xl
                  transition-all duration-300 transform
                  ${isActive 
                    ? 'text-primary scale-105 bg-primary/10' 
                    : 'text-muted-foreground hover:text-foreground hover:scale-105'
                  }
                `}
              >
                <div className="relative">
                  <Icon 
                    className={`
                      w-5 h-5 transition-all duration-300
                      ${isActive ? 'animate-glow-pulse' : ''}
                    `} 
                  />
                  
                  {/* Badge for notifications */}
                  {item.badge && (
                    <div className="absolute -top-2 -right-2 w-4 h-4 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center animate-glow-pulse">
                      {item.badge}
                    </div>
                  )}
                </div>
                
                <span 
                  className={`
                    text-xs font-medium transition-all duration-300
                    ${isActive ? 'opacity-100' : 'opacity-70'}
                  `}
                >
                  {item.label}
                </span>
                
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomNav;