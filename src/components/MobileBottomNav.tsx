import React from 'react';
import { Disc3, FolderDown, Home, Sparkles } from 'lucide-react';

export type MobileNavTarget = 'home' | 'console' | 'ai-picks' | 'offline';

interface MobileBottomNavProps {
  activeSection: MobileNavTarget;
  offlineCount: number;
  onSelect: (target: MobileNavTarget) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeSection,
  offlineCount,
  onSelect,
}) => {
  const items: Array<{
    id: MobileNavTarget;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: 'console',
      label: 'Console',
      icon: <Disc3 className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: 'ai-picks',
      label: 'AI Picks',
      icon: <Sparkles className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: 'offline',
      label: offlineCount > 0 ? `Offline (${offlineCount})` : 'Offline',
      icon: <FolderDown className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  return (
    <nav
      aria-label="Mobile quick navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#090B10]/95 backdrop-blur-lg md:hidden"
    >
      <div className="grid grid-cols-4 h-14">
        {items.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                isActive ? 'text-amber-400' : 'text-[#9CA3AF] hover:text-[#F1F3F5]'
              }`}
            >
              {item.icon}
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
