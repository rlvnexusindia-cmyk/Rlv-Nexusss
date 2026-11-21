import React, { useState } from 'react';
import {
  Check,
  Download,
  HardDriveDownload,
  ListPlus,
  Loader2,
  Play,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import type { AiSuggestedTrack, DeckId, Track } from '../types/music';

interface AiSuggestionsPanelProps {
  headline: string;
  suggestions: AiSuggestedTrack[];
  isLoading: boolean;
  error: string | null;
  basedOnTrackTitle: string | null;
  offlineIds: Set<string>;
  savingIds: Set<string>;
  onRefreshSuggestions: () => void;
  onInspectTrack?: (track: Track) => void;
  onPlayNow: (track: Track) => void;
  onLoadToDeck: (deckId: DeckId, track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onSaveOffline: (track: Track) => void;
  onDownloadFile: (track: Track) => void;
}

const SuggestionArt: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#0B0D11]">
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <img
          src="/src/assets/images/vinyl_cover_desi_1794994927145.jpg"
          alt={alt}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
};

export const AiSuggestionsPanel: React.FC<AiSuggestionsPanelProps> = ({
  headline,
  suggestions,
  isLoading,
  error,
  basedOnTrackTitle,
  offlineIds,
  savingIds,
  onRefreshSuggestions,
  onInspectTrack,
  onPlayNow,
  onLoadToDeck,
  onAddToQueue,
  onSaveOffline,
  onDownloadFile,
}) => {
  return (
    <section
      id="ai-picks"
      aria-label="AI Suggested New Songs"
      className="rounded-2xl border border-white/8 bg-[#12161F]/78 backdrop-blur-xl p-4 sm:p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-[#F1F3F5]">
            {headline || 'AI Suggested New Songs'}
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-[#9CA3AF]">
            {basedOnTrackTitle
              ? `Fresh tracks picked by AI to mix smoothly after "${basedOnTrackTitle}"`
              : 'Tap Suggest New Songs to let AI recommend fresh hits matched to your active vibe'}
          </p>
        </div>

        <button
          type="button"
          onClick={onRefreshSuggestions}
          disabled={isLoading}
          className="inline-flex min-h-[44px] sm:min-h-0 items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/12 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Finding New Songs...</span>
            </>
          ) : suggestions.length > 0 ? (
            <>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Refresh AI Picks</span>
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              <span>Suggest New Songs</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      {isLoading && suggestions.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-white/8 bg-[#0B0D11] p-3.5 space-y-3 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-[#1A1E28]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-3/4 rounded bg-[#1A1E28]" />
                  <div className="h-3 w-1/2 rounded bg-[#1A1E28]" />
                </div>
              </div>
              <div className="h-3 w-full rounded bg-[#1A1E28]" />
            </div>
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-[#0B0D11]/70 px-4 py-6 text-center">
          <p className="text-sm font-medium text-[#D1D5DB]">
            Want AI to discover fresh songs for your set?
          </p>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            Click "Suggest New Songs" above or tap "Suggest Similar" on any active deck.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {suggestions.map(({ track, aiReason }) => {
            const isSavedOffline = offlineIds.has(track.id);
            const isSaving = savingIds.has(track.id);
            return (
              <article
                key={track.id}
                onClick={() => onInspectTrack?.(track)}
                className="flex flex-col justify-between gap-3 rounded-xl border border-white/8 bg-[#0B0D11]/85 p-3.5 hover:border-white/20 transition-colors cursor-pointer"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspectTrack?.(track);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onInspectTrack?.(track);
                    }
                  }}
                  title="Click to view enlarged cover & song details"
                  className="group space-y-2 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="transition-transform duration-200 group-hover:scale-[1.04]">
                      <SuggestionArt src={track.artworkUrl} alt={track.title} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-[#F1F3F5] group-hover:text-amber-300 transition-colors truncate">
                        {track.title}
                      </h3>
                      <p className="text-xs text-[#9CA3AF] truncate">
                        {track.artist}
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-tabular">
                          {Math.floor(track.durationSec / 60)}:{String(Math.floor(track.durationSec % 60)).padStart(2, '0')} · {track.bpm} BPM
                        </span>
                      </p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-[#D1D5DB]">{aiReason}</p>
                </div>

                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/6"
                >
                  <button
                    type="button"
                    onClick={() => onPlayNow(track)}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-[#0B0D11] hover:bg-amber-400 transition-colors cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Play</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onLoadToDeck('A', track)}
                    className="min-h-[38px] rounded-lg border border-white/10 bg-[#1A1E28] px-2.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-[#232836] cursor-pointer"
                  >
                    A
                  </button>
                  <button
                    type="button"
                    onClick={() => onLoadToDeck('B', track)}
                    className="min-h-[38px] rounded-lg border border-white/10 bg-[#1A1E28] px-2.5 py-1.5 text-xs font-semibold text-sky-300 hover:bg-[#232836] cursor-pointer"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddToQueue(track)}
                    title="Add to queue"
                    aria-label={`Add ${track.title} to queue`}
                    className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-white/10 bg-[#1A1E28] text-[#D1D5DB] hover:bg-[#232836] cursor-pointer"
                  >
                    <ListPlus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSaveOffline(track)}
                    disabled={isSaving || isSavedOffline}
                    title={isSavedOffline ? 'Saved for offline playback' : 'Save for offline playback'}
                    aria-label={isSavedOffline ? `${track.title} saved offline` : `Save ${track.title} offline`}
                    className={`inline-flex min-h-[38px] items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
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
                  <button
                    type="button"
                    onClick={() => onDownloadFile(track)}
                    title="Download audio file to device"
                    aria-label={`Download ${track.title}`}
                    className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-white/10 bg-[#1A1E28] text-[#D1D5DB] hover:bg-[#232836] hover:text-amber-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
