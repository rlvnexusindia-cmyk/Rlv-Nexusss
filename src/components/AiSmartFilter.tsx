import React, { useState } from 'react';
import { Loader2, Play, Wand2 } from 'lucide-react';
import { AI_PROMPT_SUGGESTIONS } from '../data/modes';
import type { AiCrateInfo, MixerPreset } from '../types/music';

interface AiSmartFilterProps {
  isFiltering: boolean;
  error: string | null;
  activeCrate: AiCrateInfo | null;
  activePreset: MixerPreset | null;
  onRunAiFilter: (prompt: string) => void;
}

export const AiSmartFilter: React.FC<AiSmartFilterProps> = ({
  isFiltering,
  error,
  activeCrate,
  activePreset,
  onRunAiFilter,
}) => {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isFiltering) return;
    onRunAiFilter(prompt.trim());
  };

  return (
    <section
      id="ai-filter"
      aria-label="AI Smart Song Filter"
      className="rounded-2xl border border-white/8 bg-[#12161F]/78 backdrop-blur-xl p-4 sm:p-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* Left: Prompt Input & Quick Picks */}
        <div className="lg:col-span-7 space-y-3.5">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#F1F3F5]">
              AI Smart Filter &amp; Auto-Play
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[#9CA3AF]">
              Describe your mood, wedding vibe, or regional taste in Hindi, Hinglish, or English — AI filters the API catalog, tunes the bass EQ, and starts mixing immediately.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <label htmlFor="ai-dj-prompt" className="sr-only">
              Ask AI DJ to filter and play songs
            </label>
            <input
              id="ai-dj-prompt"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Shaadi baraat Bhojpuri + Haryanvi banger high bass..."
              className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-[#090B10] px-4 py-2.5 text-sm text-[#F1F3F5] placeholder:text-[#6B7280] focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isFiltering || !prompt.trim()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-[#090B10] hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFiltering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Filtering...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" aria-hidden="true" />
                  <span>Filter &amp; Play</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Vibe Prompts */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[#9CA3AF]">Try:</span>
            {AI_PROMPT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={isFiltering}
                onClick={() => {
                  setPrompt(suggestion);
                  onRunAiFilter(suggestion);
                }}
                className="rounded-md border border-white/8 bg-[#1A1E28] px-2.5 py-1 text-xs text-[#D1D5DB] hover:border-amber-500/40 hover:text-[#F1F3F5] transition-colors cursor-pointer disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200"
            >
              {error}
            </div>
          )}
        </div>

        {/* Right: Active AI Crate Readout or Studio Card */}
        <div className="lg:col-span-5">
          {activeCrate && activePreset ? (
            <div className="rounded-lg border border-white/8 bg-[#0B0D11] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs text-[#9CA3AF]">
                <span className="font-medium text-amber-400">Active AI Set</span>
                <span className="font-mono-tabular">
                  {activeCrate.recommendedMode.toUpperCase()} · +{activePreset.bassBoostDb}dB Bass ·{' '}
                  {activePreset.targetPitch.toFixed(2)}x
                </span>
              </div>
              <h3 className="font-display text-base font-semibold text-[#F1F3F5]">
                {activeCrate.setTitle}
              </h3>
              <p className="text-xs leading-relaxed text-[#9CA3AF]">{activeCrate.djNote}</p>
              <div className="pt-1 text-xs text-[#6B7280] flex items-center gap-1.5">
                <Play className="h-3 w-3 text-amber-400 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Queries: {activeCrate.searchQueries.join(' · ')}
                </span>
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-lg border border-white/8 bg-[#0B0D11]">
              <img
                src="/src/assets/images/dj_console_studio_1794994927425.jpg"
                alt="Rintu Bit DJ studio mixing console"
                className="h-36 w-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D11] via-[#0B0D11]/55 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="font-display text-sm font-semibold text-[#F1F3F5]">
                  Ready for Smart Set Curation
                </p>
                <p className="mt-0.5 text-xs text-[#D1D5DB]">
                  Type any mood or pick a prompt to auto-load Deck A, Deck B, and your Up-Next queue.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
