import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Disc3,
  Download,
  FolderDown,
  HardDriveDownload,
  ListPlus,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { DJ_MODES, OFFLINE_BEAT_PACKS } from '../data/modes';
import {
  fetchQuickSearchSuggestions,
  matchesTrackKeyword,
  sortTracksByKeywordRelevance,
} from '../services/clientCatalog';
import type { DeckId, DjModeId, OfflineBeatId, OfflineTrack, Track } from '../types/music';
import { containsMarathiMarker } from '../utils/marathiFilter';

const QUICK_SEARCH_CHIPS = [
  'Arijit Singh',
  'Sidhu Moose Wala',
  'Pawan Singh',
  'Sapna Choudhary',
  'Kumar Sanu 90s',
  'Badshah',
  'Anirudh',
  'AP Dhillon',
];

interface ModeAndTrackBrowserProps {
  activeMode: DjModeId;
  showOfflineTab: boolean;
  searchQuery: string;
  caseSensitive: boolean;
  tracks: Track[];
  totalAvailable: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  isAutoStreamingAll: boolean;
  offlineTracks: OfflineTrack[];
  offlineIds: Set<string>;
  savingIds: Set<string>;
  activeOfflineBeat: OfflineBeatId | null;
  isLoading: boolean;
  error: string | null;
  activeTrackIdA: string | null;
  activeTrackIdB: string | null;
  onSelectMode: (mode: DjModeId) => void;
  onSelectOfflineTab: () => void;
  onSearchSubmit: (query: string) => void;
  onToggleCaseSensitive: () => void;
  onLoadMore: () => void;
  onToggleStreamAll: () => void;
  onPlayNow: (track: Track) => void;
  onInspectTrack: (track: Track) => void;
  onLoadToDeck: (deckId: DeckId, track: Track, autoPlay?: boolean) => void;
  onAddToQueue: (track: Track) => void;
  onSaveOffline: (track: Track) => void;
  onRemoveOffline: (trackId: string) => void;
  onDownloadFile: (track: Track) => void;
  onToggleOfflineBeat: (beatId: OfflineBeatId) => void;
  onRetry: () => void;
}

const TrackArtwork: React.FC<{ src: string; alt: string; mode: DjModeId }> = ({
  src,
  alt,
  mode,
}) => {
  const [failed, setFailed] = useState(false);
  const fallbackSrc =
    mode === '90s' || mode === 'romance' || mode === 'chill'
      ? '/src/assets/images/vinyl_cover_retro_1794994928364.jpg'
      : '/src/assets/images/vinyl_cover_desi_1794994927145.jpg';

  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#090B10]">
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <img src={fallbackSrc} alt={alt} className="h-full w-full object-cover" />
      )}
    </div>
  );
};

function formatBytes(bytes: number): string {
  if (!bytes) return 'Offline';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return 'Full';
  const mins = Math.floor(sec / 60);
  const rem = Math.floor(sec % 60);
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export const ModeAndTrackBrowser: React.FC<ModeAndTrackBrowserProps> = ({
  activeMode,
  showOfflineTab,
  searchQuery,
  caseSensitive,
  tracks,
  totalAvailable,
  hasMore,
  isLoadingMore,
  isAutoStreamingAll,
  offlineTracks,
  offlineIds,
  savingIds,
  activeOfflineBeat,
  isLoading,
  error,
  activeTrackIdA,
  activeTrackIdB,
  onSelectMode,
  onSelectOfflineTab,
  onSearchSubmit,
  onToggleCaseSensitive,
  onLoadMore,
  onToggleStreamAll,
  onPlayNow,
  onInspectTrack,
  onLoadToDeck,
  onAddToQueue,
  onSaveOffline,
  onRemoveOffline,
  onDownloadFile,
  onToggleOfflineBeat,
  onRetry,
}) => {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState<number>(60);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [quickSuggestions, setQuickSuggestions] = useState<Track[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState<boolean>(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  // Keep latest callbacks in refs so 250ms playback timeupdate re-renders NEVER cancel the debounce timer
  const onSearchSubmitRef = useRef(onSearchSubmit);
  onSearchSubmitRef.current = onSearchSubmit;
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  // Reset rendered DOM slice cleanly when query or mode changes
  useEffect(() => {
    setDisplayLimit(60);
  }, [activeMode, searchQuery, showOfflineTab, caseSensitive]);

  // Close suggestions dropdown on outside click
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // Live keyword-sensitive debounced search while typing (>= 2 chars or cleared)
  useEffect(() => {
    const trimmed = localQuery.trim();
    if (trimmed === searchQuery.trim()) return;
    if (trimmed && containsMarathiMarker(trimmed)) return;
    if (trimmed.length === 1) return;

    const timer = window.setTimeout(() => {
      onSearchSubmitRef.current(trimmed);
    }, 340);
    return () => window.clearTimeout(timer);
  }, [localQuery, searchQuery]);

  // Fast live typeahead suggestions for the dropdown as user types
  useEffect(() => {
    const trimmed = localQuery.trim();
    if (!isSearchFocused || trimmed.length < 2 || containsMarathiMarker(trimmed)) {
      if (trimmed.length < 2) setQuickSuggestions([]);
      setIsFetchingSuggestions(false);
      return;
    }

    let cancelled = false;
    setIsFetchingSuggestions(true);
    const timer = window.setTimeout(() => {
      void fetchQuickSearchSuggestions(trimmed, activeMode, caseSensitive)
        .then((results) => {
          if (!cancelled) setQuickSuggestions(results);
        })
        .finally(() => {
          if (!cancelled) setIsFetchingSuggestions(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [localQuery, isSearchFocused, activeMode, caseSensitive]);

  const currentModeObj = DJ_MODES.find((m) => m.id === activeMode) ?? DJ_MODES[0];

  // Instant in-memory ranking + case-sensitive filtering without wiping API results while typing
  const activeFilterText = searchQuery.trim();
  const visibleTracks = useMemo(() => {
    const base = showOfflineTab ? offlineTracks : tracks;
    const typingText = localQuery.trim();

    if (showOfflineTab) {
      const q = (typingText || activeFilterText).trim();
      if (!q) return base;
      const filtered = base.filter((t) => matchesTrackKeyword(t, q, caseSensitive));
      return sortTracksByKeywordRelevance(filtered, q, caseSensitive);
    }

    if (!activeFilterText && !typingText) return base;
    if (caseSensitive) {
      const strictTarget = typingText || activeFilterText;
      const filtered = base.filter((t) => matchesTrackKeyword(t, strictTarget, true));
      return sortTracksByKeywordRelevance(filtered, strictTarget, true);
    }

    // For normal search, rank strong keyword matches to the top while preserving API full-text matches
    const rankTarget = activeFilterText || typingText;
    return sortTracksByKeywordRelevance(base, rankTarget, false);
  }, [showOfflineTab, offlineTracks, tracks, activeFilterText, localQuery, caseSensitive]);

  const displayedTracks = useMemo(
    () => visibleTracks.slice(0, displayLimit),
    [visibleTracks, displayLimit]
  );

  // Smooth infinite scroll expansion + auto-fetch next batch from API near bottom
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || showOfflineTab || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (displayLimit < visibleTracks.length) {
          setDisplayLimit((prev) => Math.min(visibleTracks.length, prev + 60));
        } else if (hasMore && !isLoadingMore) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: '320px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [displayLimit, visibleTracks.length, hasMore, isLoadingMore, showOfflineTab, isLoading]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = localQuery.trim();
    if (q && containsMarathiMarker(q)) {
      setBlockedMsg(
        'Marathi songs are blocked on Rintu Bit DJ. Search any other Indian or World song!'
      );
      return;
    }
    setBlockedMsg(null);
    setIsSearchFocused(false);
    onSearchSubmit(q);
  };

  const applyQuickQuery = (q: string) => {
    setBlockedMsg(null);
    setLocalQuery(q);
    setIsSearchFocused(false);
    onSearchSubmit(q);
  };

  return (
    <section id="catalog" aria-label="Genres, Offline Vault and Song Browser" className="space-y-4">
      {/* Header + Live Keyword-Sensitive Search Bar with Suggestions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#F1F3F5]">
            {showOfflineTab
              ? 'Offline Saved Vault'
              : searchQuery
                ? `Search: "${searchQuery}"`
                : `${currentModeObj.label} Crate`}
          </h2>
          <p className="mt-0.5 text-sm text-[#9CA3AF]">
            {showOfflineTab
              ? 'Play downloaded songs or built-in offline DJ beats with zero internet'
              : `${currentModeObj.tagline} · Marathi excluded`}
          </p>
        </div>

        <div ref={searchBoxRef} className="relative w-full md:w-[440px]">
          <form onSubmit={handleSearch} className="flex items-center gap-2 w-full">
            <div className="relative flex-1 flex items-center">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={localQuery}
                onFocus={() => setIsSearchFocused(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsSearchFocused(false);
                }}
                onChange={(e) => {
                  const next = e.target.value;
                  setLocalQuery(next);
                  setIsSearchFocused(true);
                  if (next && containsMarathiMarker(next)) {
                    setBlockedMsg(
                      'Marathi songs are blocked on Rintu Bit DJ. Search any other Indian or World song!'
                    );
                  } else if (blockedMsg) {
                    setBlockedMsg(null);
                  }
                }}
                placeholder="Search song, artist, or keyword..."
                aria-label="Search songs in music API"
                className="min-h-[44px] sm:min-h-0 w-full rounded-xl border border-white/10 bg-[#12161F]/90 pl-9 pr-12 py-2 text-sm text-[#F1F3F5] placeholder:text-[#6B7280] focus:border-amber-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={onToggleCaseSensitive}
                aria-pressed={caseSensitive}
                title="Toggle Case-Sensitive Keyword Match (Aa)"
                className={`absolute right-1.5 min-h-[30px] rounded-lg px-2 py-0.5 text-xs font-mono-tabular font-bold transition-colors cursor-pointer ${
                  caseSensitive
                    ? 'bg-amber-500 text-[#090B10]'
                    : 'bg-[#1A1E28] text-[#9CA3AF] hover:text-[#F1F3F5]'
                }`}
              >
                Aa
              </button>
            </div>
            <button
              type="submit"
              className="min-h-[44px] sm:min-h-0 rounded-xl border border-white/10 bg-[#1A1E28] px-4 py-2 text-sm font-medium text-[#F1F3F5] hover:bg-[#232836] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Live Search Suggestions Dropdown */}
          {isSearchFocused && !blockedMsg && (
            <div className="absolute left-0 right-0 top-full mt-2 z-40 rounded-2xl border border-white/15 bg-[#12161F]/98 backdrop-blur-xl shadow-2xl p-3 space-y-2.5">
              {localQuery.trim().length < 2 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-[#9CA3AF]">
                    Popular Search Suggestions
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_SEARCH_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => applyQuickQuery(chip)}
                        className="rounded-lg border border-white/10 bg-[#1A1E28] px-2.5 py-1.5 text-xs font-medium text-[#E5E7EB] hover:border-amber-500/45 hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              ) : isFetchingSuggestions && quickSuggestions.length === 0 ? (
                <div className="flex items-center gap-2 py-2 px-1 text-xs text-[#9CA3AF]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" aria-hidden="true" />
                  <span>Finding song suggestions for &ldquo;{localQuery.trim()}&rdquo;...</span>
                </div>
              ) : quickSuggestions.length > 0 ? (
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[11px] font-medium text-[#9CA3AF]">
                      Suggested Songs
                    </span>
                    {isFetchingSuggestions && (
                      <Loader2 className="h-3 w-3 animate-spin text-amber-400" aria-hidden="true" />
                    )}
                  </div>
                  {quickSuggestions.map((item) => (
                    <div
                      key={`qs-${item.id}`}
                      className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-[#1A1E28] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIsSearchFocused(false);
                          onInspectTrack(item);
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <img
                          src={
                            item.artworkUrl ||
                            '/src/assets/images/vinyl_cover_desi_1794994927145.jpg'
                          }
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="h-9 w-9 rounded-lg object-cover border border-white/10 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[#F1F3F5] truncate">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-[#9CA3AF] truncate">
                            {item.artist} · {formatDuration(item.durationSec)}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSearchFocused(false);
                          onPlayNow(item);
                        }}
                        title={`Play ${item.title}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-[#090B10] hover:bg-amber-400 shrink-0 cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 py-1.5 px-1 text-xs text-[#9CA3AF]">
                  <span>Press Search to look up &ldquo;{localQuery.trim()}&rdquo; across 5,000+ songs</span>
                  <button
                    type="button"
                    onClick={() => applyQuickQuery(localQuery.trim())}
                    className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-[#090B10] hover:bg-amber-400 shrink-0 cursor-pointer"
                  >
                    Search
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {blockedMsg && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200"
        >
          {blockedMsg}
        </div>
      )}

      {/* Swipeable Mobile / Wrap Desktop Mode & Regional Genre Tabs + Offline Tab */}
      <div
        role="tablist"
        aria-label="Music modes, global genres, and offline library"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar md:flex-wrap rounded-2xl border border-white/8 bg-[#12161F]/80 backdrop-blur-xl p-1.5"
      >
        {DJ_MODES.map((mode) => {
          const isSelected = !showOfflineTab && mode.id === activeMode && !searchQuery;
          return (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => {
                setLocalQuery('');
                setBlockedMsg(null);
                onSelectMode(mode.id);
              }}
              className={`min-h-[40px] sm:min-h-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isSelected
                  ? 'bg-amber-500 text-[#090B10]'
                  : 'text-[#9CA3AF] hover:bg-[#1A1E28] hover:text-[#F1F3F5]'
              }`}
            >
              {mode.label}
            </button>
          );
        })}

        <button
          id="offline"
          type="button"
          role="tab"
          aria-selected={showOfflineTab}
          onClick={onSelectOfflineTab}
          className={`inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showOfflineTab
              ? 'bg-emerald-400 text-[#090B10]'
              : 'text-emerald-300/90 hover:bg-[#1A1E28] hover:text-emerald-200'
          }`}
        >
          <FolderDown className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Offline Saved ({offlineTracks.length})</span>
        </button>
      </div>

      {/* Live Keyword Match Stats & 5,000+ Song Streamer Controls */}
      {!showOfflineTab && !isLoading && (tracks.length > 0 || searchQuery) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-white/8 bg-[#12161F]/78 backdrop-blur-xl px-4 py-2.5">
          <div className="text-xs font-mono-tabular text-[#D1D5DB]">
            <span className="font-semibold text-amber-400">
              {visibleTracks.length.toLocaleString()}
            </span>{' '}
            matched songs loaded
            {totalAvailable > visibleTracks.length && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-[#9CA3AF]">
                  {totalAvailable.toLocaleString()}+ in catalog
                </span>
              </>
            )}
            {caseSensitive && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-amber-300">Exact Case (Aa)</span>
              </>
            )}
            {displayedTracks.length < visibleTracks.length && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-[#9CA3AF]">Showing top {displayedTracks.length}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasMore && !isAutoStreamingAll && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-white/10 bg-[#1A1E28] px-3 py-1.5 text-xs font-medium text-[#E5E7EB] hover:bg-[#232836] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Load +200</span>
              </button>
            )}

            {(hasMore || isAutoStreamingAll) && (
              <button
                type="button"
                onClick={onToggleStreamAll}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isAutoStreamingAll
                    ? 'bg-rose-500/20 border border-rose-400/50 text-rose-200 hover:bg-rose-500/30'
                    : 'bg-amber-500 text-[#090B10] hover:bg-amber-400'
                }`}
              >
                {isAutoStreamingAll ? (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Stop ({tracks.length.toLocaleString()} loaded)</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Load All 5,000+</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Built-in Zero-Internet Beats inside Offline Vault Tab */}
      {showOfflineTab && (
        <div className="rounded-2xl border border-white/8 bg-[#12161F]/80 backdrop-blur-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-emerald-300">
              Built-in Offline DJ Beats (Plays with Zero Internet)
            </p>
            <span className="text-[11px] text-[#9CA3AF]">Synthesized live</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {OFFLINE_BEAT_PACKS.map((beat) => {
              const active = activeOfflineBeat === beat.id;
              return (
                <button
                  key={beat.id}
                  type="button"
                  onClick={() => onToggleOfflineBeat(beat.id)}
                  className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/8 bg-[#090B10] text-[#D1D5DB] hover:border-white/20'
                  }`}
                >
                  <p className="text-xs font-semibold truncate">{beat.title}</p>
                  <p className="mt-0.5 font-mono-tabular text-[11px] text-[#9CA3AF]">
                    {beat.bpm} BPM · {active ? 'Stop' : 'Play'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Error State (hidden inside Offline Tab so offline vault stays clean when network is down) */}
      {error && !showOfflineTab && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-500/20 px-3.5 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30 cursor-pointer shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading && !showOfflineTab ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3.5 rounded-2xl border border-white/8 bg-[#12161F]/80 p-3.5 animate-pulse"
            >
              <div className="h-14 w-14 rounded-xl bg-[#1A1E28] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-[#1A1E28]" />
                <div className="h-3 w-1/2 rounded bg-[#1A1E28]" />
              </div>
              <div className="h-9 w-24 rounded-xl bg-[#1A1E28] shrink-0" />
            </div>
          ))}
        </div>
      ) : visibleTracks.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/8 bg-[#12161F]/80 backdrop-blur-xl px-6 py-12 text-center">
          <Disc3 className="h-8 w-8 text-[#6B7280]" aria-hidden="true" />
          <h3 className="mt-3 font-display text-base font-semibold text-[#F1F3F5]">
            {showOfflineTab
              ? 'No offline songs saved yet'
              : caseSensitive
                ? `No exact-case matches for "${activeFilterText}"`
                : 'No matching playable tracks found'}
          </h3>
          <p className="mt-1 max-w-md text-xs text-[#9CA3AF]">
            {showOfflineTab
              ? 'Tap "Offline" on any song to store it in your device browser for offline DJ playback.'
              : caseSensitive
                ? 'Case-Sensitive (Aa) mode is active. Check uppercase/lowercase spelling or turn off Aa for broader matches.'
                : 'Try a different artist name, song title, or switch back to one of the curated genre crates.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {caseSensitive && (
              <button
                type="button"
                onClick={onToggleCaseSensitive}
                className="min-h-[42px] rounded-xl border border-white/10 bg-[#1A1E28] px-4 py-2 text-xs font-semibold text-[#F1F3F5] hover:bg-[#232836] cursor-pointer"
              >
                Turn Off Exact Case (Aa)
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setLocalQuery('');
                onSelectMode('banger');
              }}
              className="min-h-[42px] rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-[#090B10] hover:bg-amber-400 cursor-pointer"
            >
              Browse Banger Mode
            </button>
          </div>
        </div>
      ) : (
        /* Populated Track Grid (DOM-windowed for 60fps smooth performance across 5,000+ loaded tracks) */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedTracks.map((track) => {
              const onA = activeTrackIdA === track.id;
              const onB = activeTrackIdB === track.id;
              const isSavedOffline = offlineIds.has(track.id);
              const isSaving = savingIds.has(track.id);
              const offlineRecord = showOfflineTab
                ? (track as OfflineTrack)
                : undefined;

              return (
                <article
                  key={track.id}
                  onClick={() => onInspectTrack(track)}
                  className={`flex flex-col gap-3 rounded-2xl border p-3.5 transition-colors backdrop-blur-lg cursor-pointer ${
                    onA
                      ? 'border-amber-500/40 bg-[#171B26]/90'
                      : onB
                        ? 'border-sky-400/40 bg-[#171B26]/90'
                        : 'border-white/8 bg-[#12161F]/78 hover:bg-[#171C28]/90 hover:border-white/18'
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectTrack(track);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onInspectTrack(track);
                      }
                    }}
                    title="Click to view enlarged cover & song details"
                    className="group flex items-center gap-3.5 min-w-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <div className="transition-transform duration-200 group-hover:scale-[1.04]">
                      <TrackArtwork src={track.artworkUrl} alt={track.title} mode={track.modeTag} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-[#F1F3F5] group-hover:text-amber-300 transition-colors truncate">
                        {track.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-[#9CA3AF] truncate">
                        {track.artist}
                        <span aria-hidden="true"> · </span>
                        {track.genre}
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-tabular">
                          {offlineRecord
                            ? `${formatDuration(track.durationSec)} · ${formatBytes(offlineRecord.sizeBytes)}`
                            : `${formatDuration(track.durationSec)} · ${track.bpm} BPM`}
                        </span>
                      </p>
                      {(onA || onB) && (
                        <p className="mt-1 text-[11px] font-medium text-amber-400">
                          {onA && onB
                            ? 'Loaded on Deck A & Deck B'
                            : onA
                              ? 'Loaded on Deck A'
                              : 'Loaded on Deck B'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Responsive Action Row (comfortable tap targets on mobile & desktop) */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex flex-wrap items-center justify-between gap-1.5 border-t border-white/6 pt-2.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPlayNow(track)}
                        title="Play immediately"
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-[#090B10] hover:bg-amber-400 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Play</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onLoadToDeck('A', track, false)}
                        title="Load to Deck A"
                        className="min-h-[38px] min-w-[36px] rounded-xl border border-white/10 bg-[#1A1E28] px-2.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-[#232836] transition-colors cursor-pointer"
                      >
                        A
                      </button>
                      <button
                        type="button"
                        onClick={() => onLoadToDeck('B', track, false)}
                        title="Load to Deck B"
                        className="min-h-[38px] min-w-[36px] rounded-xl border border-white/10 bg-[#1A1E28] px-2.5 py-1.5 text-xs font-semibold text-sky-300 hover:bg-[#232836] transition-colors cursor-pointer"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => onAddToQueue(track)}
                        title="Add to Up Next Queue"
                        aria-label={`Add ${track.title} to queue`}
                        className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-white/10 bg-[#1A1E28] text-[#D1D5DB] hover:bg-[#232836] hover:text-[#F1F3F5] transition-colors cursor-pointer"
                      >
                        <ListPlus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {showOfflineTab ? (
                        <button
                          type="button"
                          onClick={() => onRemoveOffline(track.id)}
                          title="Remove from offline storage"
                          aria-label={`Remove ${track.title} from offline storage`}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Remove</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSaveOffline(track)}
                          disabled={isSaving || isSavedOffline}
                          title={isSavedOffline ? 'Saved for offline playback' : 'Save for offline playback'}
                          className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                            isSavedOffline
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                              : 'border-white/10 bg-[#1A1E28] text-[#D1D5DB] hover:bg-[#232836]'
                          }`}
                        >
                          {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : isSavedOffline ? (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <HardDriveDownload className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          <span>{isSavedOffline ? 'Saved' : 'Offline'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onDownloadFile(track)}
                        title="Download audio file to device"
                        aria-label={`Download ${track.title}`}
                        className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-white/10 bg-[#1A1E28] text-[#D1D5DB] hover:bg-[#232836] hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Infinite Scroll Sentinel + Manual Show More Control */}
          <div ref={sentinelRef} className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {displayedTracks.length < visibleTracks.length && (
              <button
                type="button"
                onClick={() =>
                  setDisplayLimit((prev) => Math.min(visibleTracks.length, prev + 100))
                }
                className="min-h-[42px] rounded-xl border border-white/10 bg-[#1A1E28] px-5 py-2 text-xs font-semibold text-[#F1F3F5] hover:bg-[#232836] transition-colors cursor-pointer"
              >
                Show +100 More ({(visibleTracks.length - displayedTracks.length).toLocaleString()} ready)
              </button>
            )}
            {!showOfflineTab && hasMore && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/12 px-5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/22 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>{isLoadingMore ? 'Fetching more songs...' : 'Fetch +200 More Songs'}</span>
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
};
