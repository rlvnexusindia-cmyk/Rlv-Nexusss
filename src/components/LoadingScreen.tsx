import React, { useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';

interface LoadingScreenProps {
  isReady: boolean;
  onFinish: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ isReady, onFinish }) => {
  const [progress, setProgress] = useState(18);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const minDuration = 1250;

    const timer = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const pct = Math.min(isReady ? 100 : 88, Math.round(18 + (elapsed / minDuration) * 82));
      setProgress(pct);

      if (elapsed >= minDuration && isReady) {
        window.clearInterval(timer);
        setExiting(true);
        window.setTimeout(onFinish, 260);
      }
    }, 45);

    return () => window.clearInterval(timer);
  }, [isReady, onFinish]);

  const handleSkip = () => {
    setExiting(true);
    window.setTimeout(onFinish, 180);
  };

  return (
    <div
      role="status"
      aria-label="Loading Rintu Bit DJ"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090B10] px-6 transition-opacity duration-300 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="w-full max-w-sm flex flex-col items-center text-center space-y-6">
        {/* Vinyl Emblem */}
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-amber-500/45 bg-[#12161F] shadow-2xl">
          <div className="absolute inset-2 rounded-full border border-white/10" />
          <Disc3 className="h-12 w-12 text-amber-400 animate-vinyl" aria-hidden="true" />
        </div>

        {/* Brand Lockup */}
        <div className="space-y-1.5">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#F1F3F5]">
            Rintu Bit DJ
          </h1>
          <p className="text-sm text-[#9CA3AF]">
            World Music &amp; Desi Dual-Deck Studio
          </p>
        </div>

        {/* Progress Track */}
        <div className="w-full space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#171B26]">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs font-mono-tabular text-[#6B7280]">
            <span>Preparing DJ Decks</span>
            <span>{progress}%</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSkip}
          className="min-h-[42px] rounded-xl border border-white/10 bg-[#12161F] px-5 py-2 text-xs font-semibold text-[#D1D5DB] hover:bg-[#1A1E28] hover:text-[#F1F3F5] transition-colors cursor-pointer"
        >
          Enter Studio
        </button>
      </div>
    </div>
  );
};
