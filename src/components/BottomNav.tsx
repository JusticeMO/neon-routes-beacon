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
    <div className="fixed bottom-0 left-0 right-0 z-[1002]">
      <div className="bg-card/95 backdrop-blur-xl border-t border-border/40 px-2 py-1.5 shadow-[0_-2px_16px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`
                  relative flex flex-col items-center space-y-0.5 py-2 px-5 rounded-xl
                  transition-all duration-200
                  ${isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                  {item.badge && (
                    <div className="absolute -top-1.5 -right-2 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                      {item.badge}
                    </div>
                  )}
                </div>
                <span className={`text-[10px] font-semibold ${isActive ? 'opacity-100' : 'opacity-50'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomNav;
