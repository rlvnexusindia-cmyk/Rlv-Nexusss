import React from 'react';
import { Disc3 } from 'lucide-react';

export type AppView = 'home' | 'console';

interface TopBarProps {
  activeView: AppView;
  autoMixEnabled: boolean;
  onSwitchView: (view: AppView) => void;
  onToggleAutoMix: () => void;
  onNavigateConsoleSection: (sectionId: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  autoMixEnabled,
  onSwitchView,
  onToggleAutoMix,
  onNavigateConsoleSection,
}) => {
  return (
    <header className="relative md:sticky md:top-0 z-40 border-b border-white/8 bg-[#090B10]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 sm:gap-8 px-4 py-3 sm:px-6">
        {/* Zone 1: Single-element wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            onSwitchView('home');
          }}
          className="font-display flex items-center gap-2.5 text-lg font-bold tracking-tight text-[#F1F3F5] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-md"
        >
          <Disc3 className="h-5 w-5 text-amber-400" aria-hidden="true" />
          <span>Rintu Bit DJ</span>
        </a>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#9CA3AF]">
          <button
            type="button"
            onClick={() => onSwitchView('home')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'home' ? 'text-amber-400' : 'hover:text-[#F1F3F5]'
            }`}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => {
              onSwitchView('console');
              setTimeout(() => onNavigateConsoleSection('console'), 40);
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'console' ? 'text-amber-400' : 'hover:text-[#F1F3F5]'
            }`}
          >
            Console
          </button>
          <button
            type="button"
            onClick={() => {
              onSwitchView('console');
              setTimeout(() => onNavigateConsoleSection('ai-picks'), 40);
            }}
            className="hover:text-[#F1F3F5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            AI Picks
          </button>
          <button
            type="button"
            onClick={() => {
              onSwitchView('console');
              setTimeout(() => onNavigateConsoleSection('catalog'), 40);
            }}
            className="hover:text-[#F1F3F5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Genres
          </button>
        </nav>

        {/* Zone 3: Single primary CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onToggleAutoMix}
            aria-pressed={autoMixEnabled}
            className={`min-h-[40px] px-4 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              autoMixEnabled
                ? 'bg-amber-500 text-[#090B10] hover:bg-amber-400'
                : 'bg-[#171B26] text-[#F1F3F5] border border-white/10 hover:bg-[#202636]'
            }`}
          >
            {autoMixEnabled ? 'Auto-Mix On' : 'Auto-Mix Off'}
          </button>
        </div>
      </div>
    </header>
  );
};
