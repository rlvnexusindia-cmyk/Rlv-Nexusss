import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Disc3,
  FolderDown,
  Globe,
  Headphones,
  Loader2,
  Play,
  Search,
  Sparkles,
  Square,
} from 'lucide-react';
import { DJ_MODES, OFFLINE_BEAT_PACKS } from '../data/modes';
import { fetchQuickSearchSuggestions } from '../services/clientCatalog';
import type { DjModeId, OfflineBeatId, Track } from '../types/music';
import { containsMarathiMarker } from '../utils/marathiFilter';

const HOME_SUGGESTION_CHIPS = [
  'Arijit Singh',
  'Sidhu Moose Wala',
  'Pawan Singh',
  'Kumar Sanu 90s',
  'Sapna Choudhary',
  'AP Dhillon',
];

interface HomeScreenProps {
  offlineCount: number;
  activeOfflineBeat: OfflineBeatId | null;
  onOpenConsole: () => void;
  onLaunchMode: (mode: DjModeId, autoPlayFirst?: boolean) => void;
  onGlobalSearch: (query: string) => void;
  onOpenOfflineVault: () => void;
  onToggleOfflineBeat: (beatId: OfflineBeatId) => void;
}

const FEATURED_HERO_LAUNCHES: Array<{
  mode: DjModeId;
  label: string;
  detail: string;
}> = [
  { mode: 'banger', label: 'Banger Mode', detail: '128 BPM · Sub-Bass Club' },
  { mode: 'bhojpuri', label: 'Bhojpuri DJ', detail: '132 BPM · Purvanchal Heat' },
  { mode: '90s', label: '90s Bollywood', detail: '102 BPM · Golden Retro' },
  { mode: 'edm', label: 'Global EDM', detail: '128 BPM · Festival Drops' },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  offlineCount,
  activeOfflineBeat,
  onOpenConsole,
  onLaunchMode,
  onGlobalSearch,
  onOpenOfflineVault,
  onToggleOfflineBeat,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [homeSuggestions, setHomeSuggestions] = useState<Track[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);

  const desiModes = DJ_MODES.filter((m) => m.category === 'desi');
  const worldModes = DJ_MODES.filter((m) => m.category === 'world');

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  useEffect(() => {
    const q = searchInput.trim();
    if (!isSearchFocused || q.length < 2 || containsMarathiMarker(q)) {
      if (q.length < 2) setHomeSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }
    let cancelled = false;
    setIsLoadingSuggestions(true);
    const timer = window.setTimeout(() => {
      void fetchQuickSearchSuggestions(q, 'banger', false)
        .then((res) => {
          if (!cancelled) setHomeSuggestions(res);
        })
        .finally(() => {
          if (!cancelled) setIsLoadingSuggestions(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchInput, isSearchFocused]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    if (containsMarathiMarker(q)) {
      setBlockedNotice(
        'Marathi songs are blocked on Rintu Bit DJ. Try Hindi, 90s, Bhojpuri, Haryanvi, Punjabi, Tamil, or any Global hit!'
      );
      return;
    }
    setBlockedNotice(null);
    setIsSearchFocused(false);
    onGlobalSearch(q);
  };

  return (
    <div className="space-y-10">
      {/* Full-Bleed Editorial DJ Hero Stage */}
      <section
        aria-label="Rintu Bit DJ Hero"
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0D1017] min-h-[480px] lg:min-h-[540px] flex items-center"
      >
        {/* Background Studio Visual + Multi-Stop Contrast Scrim */}
        <img
          src="/src/assets/images/dj_console_studio_1794994927425.jpg"
          alt="Rintu Bit DJ dual-deck analog and digital mixing studio"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090B10] via-[#090B10]/85 to-[#090B10]/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090B10] via-transparent to-[#090B10]/55" />

        {/* Foreground Content Grid */}
        <div className="relative z-10 w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center p-6 sm:p-10 lg:p-12">
          {/* Left: Primary Headline, Search & Dominant CTA */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <p className="text-xs sm:text-sm font-medium tracking-wide text-amber-400">
                Rintu Bit DJ · Dual-Deck Web Audio Studio
              </p>
              <h1
                className="font-display font-bold tracking-tight text-[#F1F3F5] text-balance leading-[1.06]"
                style={{ fontSize: 'clamp(2.25rem, 4.4vw, 3.85rem)' }}
              >
                Drop the Beat Across Every Sound on Earth
              </h1>
              <p className="max-w-xl text-sm sm:text-base leading-relaxed text-[#D1D5DB]">
                Mix global chartbusters, EDM drops, 90s Bollywood, Bhojpuri, Haryanvi, Punjabi, and Tamil hits in real time with AI song filtering and offline playback. Marathi songs are filtered out automatically.
              </p>
            </div>

            {/* Integrated World Search with Live Suggestions */}
            <div ref={searchWrapRef} className="relative max-w-xl space-y-2 z-30">
              <form
                onSubmit={handleSearch}
                className="flex flex-col sm:flex-row gap-2.5 rounded-2xl border border-white/15 bg-[#090B10]/85 p-2 backdrop-blur-md"
              >
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchInput}
                    onFocus={() => setIsSearchFocused(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setIsSearchFocused(false);
                    }}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      setIsSearchFocused(true);
                      if (blockedNotice) setBlockedNotice(null);
                    }}
                    placeholder="Search any world or Indian song (Marathi blocked)..."
                    aria-label="Search any world song"
                    className="min-h-[44px] w-full rounded-xl bg-transparent pl-10 pr-3 py-2 text-sm text-[#F1F3F5] placeholder:text-[#9CA3AF] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[44px] rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-[#090B10] hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Find &amp; Mix
                </button>
              </form>

              {isSearchFocused && !blockedNotice && (
                <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl border border-white/15 bg-[#12161F]/98 backdrop-blur-xl shadow-2xl p-3 space-y-2">
                  {searchInput.trim().length < 2 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium text-[#9CA3AF]">Popular Searches</p>
                      <div className="flex flex-wrap gap-1.5">
                        {HOME_SUGGESTION_CHIPS.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => {
                              setSearchInput(chip);
                              setIsSearchFocused(false);
                              onGlobalSearch(chip);
                            }}
                            className="rounded-lg border border-white/10 bg-[#1A1E28] px-2.5 py-1.5 text-xs font-medium text-[#E5E7EB] hover:border-amber-500/45 hover:text-amber-300 transition-colors cursor-pointer"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : isLoadingSuggestions && homeSuggestions.length === 0 ? (
                    <div className="flex items-center gap-2 py-2 px-1 text-xs text-[#9CA3AF]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" aria-hidden="true" />
                      <span>Searching songs for &ldquo;{searchInput.trim()}&rdquo;...</span>
                    </div>
                  ) : homeSuggestions.length > 0 ? (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {homeSuggestions.map((track) => (
                        <button
                          key={`hs-${track.id}`}
                          type="button"
                          onClick={() => {
                            setIsSearchFocused(false);
                            onGlobalSearch(track.title);
                          }}
                          className="w-full flex items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[#1A1E28] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={
                                track.artworkUrl ||
                                '/src/assets/images/vinyl_cover_desi_1794994927145.jpg'
                              }
                              alt={track.title}
                              referrerPolicy="no-referrer"
                              className="h-9 w-9 rounded-lg object-cover border border-white/10 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#F1F3F5] truncate">
                                {track.title}
                              </p>
                              <p className="text-[11px] text-[#9CA3AF] truncate">
                                {track.artist}
                              </p>
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-amber-400 shrink-0">
                            Mix Now
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {blockedNotice && (
                <p role="alert" className="text-xs font-medium text-rose-300 px-1">
                  {blockedNotice}
                </p>
              )}
            </div>

            {/* Primary & Secondary Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onOpenConsole}
                className="inline-flex min-h-[48px] items-center gap-2.5 rounded-xl bg-[#F1F3F5] px-6 py-3 text-sm font-semibold text-[#090B10] hover:bg-white transition-colors cursor-pointer"
              >
                <Disc3 className="h-4 w-4" aria-hidden="true" />
                <span>Launch DJ Console</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => onLaunchMode('banger', true)}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-amber-500/45 bg-amber-500/15 px-5 py-3 text-sm font-semibold text-amber-200 backdrop-blur-md hover:bg-amber-500/25 transition-colors cursor-pointer"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>Start Banger Mix</span>
              </button>

              <button
                type="button"
                onClick={onOpenOfflineVault}
                className="inline-flex min-h-[48px] items-center gap-2 px-3 py-2 text-sm font-medium text-[#D1D5DB] hover:text-emerald-300 transition-colors cursor-pointer"
              >
                <FolderDown className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <span>Offline Vault ({offlineCount})</span>
              </button>
            </div>
          </div>

          {/* Right: Tactile Turntable Stage Quick-Launch Panel */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/12 bg-[#090B10]/80 p-5 backdrop-blur-md space-y-4">
              <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                <div className="relative h-16 w-16 shrink-0 rounded-full border-2 border-amber-500/50 overflow-hidden bg-[#12161F]">
                  <img
                    src="/src/assets/images/vinyl_cover_desi_1794994927145.jpg"
                    alt="Spinning vinyl platter"
                    className="h-full w-full object-cover animate-vinyl"
                  />
                  <span className="absolute inset-0 m-auto h-3 w-3 rounded-full bg-[#090B10] border border-white/40" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-base font-bold text-[#F1F3F5]">
                    Instant Crate Launch
                  </p>
                  <p className="text-xs text-[#9CA3AF]">
                    Pick any stage below to load Deck A &amp; Deck B immediately
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                {FEATURED_HERO_LAUNCHES.map((item) => (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() => onLaunchMode(item.mode, true)}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#12161F]/90 px-4 py-3 text-left hover:border-amber-500/45 hover:bg-[#171D2B] transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#F1F3F5] group-hover:text-amber-300 transition-colors">
                        {item.label}
                      </p>
                      <p className="font-mono-tabular text-[11px] text-[#9CA3AF]">
                        {item.detail}
                      </p>
                    </div>
                    <Play className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Studio Capabilities Strip */}
      <section
        aria-label="Console capabilities"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-y border-white/8 py-6"
      >
        <div className="space-y-1">
          <p className="font-display text-sm font-semibold text-[#F1F3F5]">
            01. Play &amp; Mix Full Songs
          </p>
          <p className="text-xs leading-relaxed text-[#9CA3AF]">
            Stream full-length HD music on dual DJ decks with 3-band EQ, 8D audio, and 2-song Auto DJ cuts.
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-display text-sm font-semibold text-[#F1F3F5]">
            02. Search by Song or Lyrics
          </p>
          <p className="text-xs leading-relaxed text-[#9CA3AF]">
            Find 5,000+ songs instantly by track title, artist, movie, mood, or remembered song lyrics.
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-display text-sm font-semibold text-[#F1F3F5]">
            03. Download &amp; Offline Vault
          </p>
          <p className="text-xs leading-relaxed text-[#9CA3AF]">
            Download music songs directly to your device or save full tracks for zero-internet playback.
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-display text-sm font-semibold text-[#F1F3F5]">
            04. Global &amp; Desi Catalog
          </p>
          <p className="text-xs leading-relaxed text-[#9CA3AF]">
            Hindi, 90s Bollywood, Bhojpuri, Punjabi, Haryanvi, Tamil, EDM &amp; Global hits (Marathi excluded).
          </p>
        </div>
      </section>

      {/* Desi & Regional Mood Crates */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F1F3F5]">
              Indian &amp; Party Crates
            </h2>
            <p className="text-xs sm:text-sm text-[#9CA3AF]">
              90s classics, Bhojpuri, Haryanvi, Punjabi, Tamil, Shaadi &amp; Banger sets (Marathi excluded)
            </p>
          </div>
          <Sparkles className="h-5 w-5 text-amber-400 shrink-0" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {desiModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onLaunchMode(mode.id, true)}
              className="group flex flex-col justify-between text-left rounded-2xl border border-white/8 bg-[#12161F] p-4 hover:border-amber-500/40 hover:bg-[#171C28] transition-colors cursor-pointer min-h-[108px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm sm:text-base font-bold text-[#F1F3F5] group-hover:text-amber-300 transition-colors">
                  {mode.label}
                </span>
                <Play className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-2 text-xs text-[#9CA3AF] line-clamp-2">{mode.tagline}</p>
            </button>
          ))}
        </div>
      </section>

      {/* World & Global Crates */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F1F3F5]">
              World &amp; International Music
            </h2>
            <p className="text-xs sm:text-sm text-[#9CA3AF]">
              Global pop, EDM festival drops, Hip-Hop, Latin reggaeton, K-Pop &amp; Arabic mixes
            </p>
          </div>
          <Globe className="h-5 w-5 text-sky-400 shrink-0" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {worldModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onLaunchMode(mode.id, true)}
              className="group flex flex-col justify-between text-left rounded-2xl border border-white/8 bg-[#12161F] p-4 hover:border-sky-400/40 hover:bg-[#171C28] transition-colors cursor-pointer min-h-[108px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-bold text-[#F1F3F5] group-hover:text-sky-300 transition-colors">
                  {mode.label}
                </span>
                <Play className="h-3.5 w-3.5 text-sky-400 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-2 text-xs text-[#9CA3AF] line-clamp-2">{mode.tagline}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Zero-Internet Built-In Offline DJ Beats */}
      <section className="rounded-2xl border border-white/8 bg-[#12161F] p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Headphones className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-bold text-[#F1F3F5]">
              Zero-Internet Offline DJ Beats
            </h2>
            <p className="text-xs text-[#9CA3AF]">
              Built-in procedural DJ grooves synthesized directly in your browser — plays even with zero internet or audio files
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {OFFLINE_BEAT_PACKS.map((beat) => {
            const isPlaying = activeOfflineBeat === beat.id;
            return (
              <button
                key={beat.id}
                type="button"
                onClick={() => onToggleOfflineBeat(beat.id)}
                className={`flex flex-col justify-between text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                  isPlaying
                    ? 'border-emerald-400/60 bg-emerald-500/12'
                    : 'border-white/8 bg-[#090B10] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-semibold text-[#F1F3F5]">
                    {beat.title}
                  </span>
                  {isPlaying ? (
                    <Square className="h-4 w-4 text-emerald-300 shrink-0" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  )}
                </div>
                <p className="mt-1.5 text-xs text-[#9CA3AF]">{beat.subtitle}</p>
                <p className="mt-2 font-mono-tabular text-[11px] text-emerald-300">
                  {beat.bpm} BPM · {isPlaying ? 'Playing Offline' : 'Tap to Play'}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
