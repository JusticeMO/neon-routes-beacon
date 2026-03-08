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
      <div className="h-6 bg-gradient-to-t from-background to-transparent" />
      
      <div className="bg-card/95 backdrop-blur-xl border-t border-border/30 px-4 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`
                  relative flex flex-col items-center space-y-1 py-2 px-5 rounded-xl
                  transition-all duration-200
                  ${isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  
                  {item.badge && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                      {item.badge}
                    </div>
                  )}
                </div>
                
                <span className={`text-[11px] font-medium ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {item.label}
                </span>
                
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-5 h-0.5 bg-primary rounded-full" />
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
