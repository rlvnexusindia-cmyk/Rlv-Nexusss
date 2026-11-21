import React, { useEffect, useState } from 'react';
import {
  Check,
  Download,
  HardDriveDownload,
  ListPlus,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import type { DeckId, OfflineTrack, Track } from '../types/music';

interface SongDetailModalProps {
  track: Track | null;
  isSavedOffline: boolean;
  isSavingOffline: boolean;
  loadedOnDeckA: boolean;
  loadedOnDeckB: boolean;
  isPlayingOnDeckA: boolean;
  isPlayingOnDeckB: boolean;
  onClose: () => void;
  onPlayNow: (track: Track) => void;
  onLoadToDeck: (deckId: DeckId, track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onSaveOffline: (track: Track) => void;
  onDownloadFile: (track: Track) => void;
  onSuggestSimilar: (track: Track) => void;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return 'Full';
  const mins = Math.floor(sec / 60);
  const rem = Math.floor(sec % 60);
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

function getHighResCoverUrl(url?: string): string {
  if (!url) return '';
  // Upgrade lower-res Saavn CDN thumbnails if present
  return url
    .replace(/-150x150(\.[a-z]+)$/i, '-500x500$1')
    .replace(/-50x50(\.[a-z]+)$/i, '-500x500$1')
    .replace(/_150x150(\.[a-z]+)$/i, '_500x500$1');
}

export const SongDetailModal: React.FC<SongDetailModalProps> = ({
  track,
  isSavedOffline,
  isSavingOffline,
  loadedOnDeckA,
  loadedOnDeckB,
  isPlayingOnDeckA,
  isPlayingOnDeckB,
  onClose,
  onPlayNow,
  onLoadToDeck,
  onAddToQueue,
  onSaveOffline,
  onDownloadFile,
  onSuggestSimilar,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [isCoverSpotlight, setIsCoverSpotlight] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    setIsCoverSpotlight(false);
  }, [track?.id]);

  useEffect(() => {
    if (!track) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCoverSpotlight) {
          setIsCoverSpotlight(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [track, isCoverSpotlight, onClose]);

  if (!track) return null;

  const fallbackCover =
    track.modeTag === '90s' || track.modeTag === 'romance' || track.modeTag === 'chill'
      ? '/src/assets/images/vinyl_cover_retro_1794994928364.jpg'
      : '/src/assets/images/vinyl_cover_desi_1794994927145.jpg';

  const preferredCover = getHighResCoverUrl(track.artworkUrl);
  const coverSrc = preferredCover && !imgFailed ? preferredCover : fallbackCover;
  const isActivelyPlaying =
    (loadedOnDeckA && isPlayingOnDeckA) || (loadedOnDeckB && isPlayingOnDeckB);
  const offlineBytes =
    'sizeBytes' in track ? (track as OfflineTrack).sizeBytes : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="song-detail-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090B10]/85 backdrop-blur-xl p-3 sm:p-6 lg:p-10 animate-modal-fade overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full my-auto overflow-hidden rounded-3xl border border-white/14 bg-[#12161F]/95 shadow-2xl animate-modal-zoom ${
          isCoverSpotlight ? 'max-w-3xl' : 'max-w-5xl'
        }`}
      >
        {/* Ambient Blurred Cover Atmosphere Backdrop */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src={coverSrc}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full scale-125 object-cover opacity-30 blur-[70px]"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#090B10]/50 via-[#12161F]/88 to-[#090B10]" />
        </div>

        {/* Top Modal Action Bar */}
        <div className="relative z-20 flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-6">
          <div className="flex items-center gap-2 text-xs text-[#9CA3AF] min-w-0">
            <span className="font-semibold text-amber-400 shrink-0">
              {track.genre}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{track.album || 'Single'}</span>
            {isSavedOffline && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-300 font-medium shrink-0">Offline Ready</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsCoverSpotlight((v) => !v)}
              aria-label={isCoverSpotlight ? 'Show cover with song details' : 'Expand full cover photo'}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-[#090B10]/70 px-3.5 text-xs font-medium text-[#E5E7EB] hover:bg-[#1A1E28] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isCoverSpotlight ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Show Details</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Full Cover</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close song details"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#090B10]/70 text-[#E5E7EB] hover:bg-[#1A1E28] hover:text-white transition-colors shrink-0 cursor-pointer"
            >
              <X className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {isCoverSpotlight ? (
          /* Full Cover Spotlight Mode — Huge unobstructed album artwork */
          <div className="relative z-10 flex flex-col items-center px-5 pb-7 pt-4 sm:px-10 sm:pb-10 space-y-5">
            <button
              type="button"
              onClick={() => setIsCoverSpotlight(false)}
              title="Click to return to song details"
              className="group relative w-full max-w-[520px] aspect-square overflow-hidden rounded-2xl border border-white/20 bg-[#090B10] shadow-2xl animate-cover-reveal cursor-pointer"
            >
              <img
                src={coverSrc}
                alt={`${track.title} album cover`}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            </button>

            <div className="text-center max-w-xl space-y-1.5">
              <h2
                id="song-detail-title"
                className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F1F3F5] [text-wrap:balance]"
              >
                {track.title}
              </h2>
              <p className="text-sm sm:text-base text-[#D1D5DB]">
                {track.artist} · {track.album || 'Single'} · {formatDuration(track.durationSec)}
              </p>
            </div>
          </div>
        ) : (
          /* Standard Large 2-Column Studio Detail View */
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 items-center gap-7 lg:gap-10 px-5 pb-7 pt-5 sm:px-8 sm:pb-9 sm:pt-6">
            {/* Left Stage: Extra-Large Crisp Album Cover + Peeking Vinyl Record */}
            <div className="lg:col-span-6 flex justify-center">
              <div className="relative w-full max-w-[330px] sm:max-w-[400px] lg:max-w-[430px] pr-8 sm:pr-12">
                {/* Sliding & Spinning Vinyl Disc Behind Jacket */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 top-1/2 h-[86%] aspect-square animate-vinyl-slide-out"
                >
                  <div
                    className={`h-full w-full rounded-full border-2 border-white/15 bg-[#090B10] shadow-2xl flex items-center justify-center ${
                      isActivelyPlaying ? 'animate-vinyl' : 'animate-vinyl-paused'
                    }`}
                  >
                    <div className="absolute inset-4 rounded-full border border-white/10" />
                    <div className="absolute inset-9 rounded-full border border-white/10" />
                    <div className="absolute inset-14 rounded-full border border-white/6" />
                    <div className="h-[32%] w-[32%] rounded-full overflow-hidden border-2 border-amber-400/50 shadow-inner">
                      <img
                        src={coverSrc}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                </div>

                {/* Large Front Album Cover Photo (clickable to expand even larger) */}
                <button
                  type="button"
                  onClick={() => setIsCoverSpotlight(true)}
                  aria-label={`Expand ${track.title} album cover`}
                  className="group relative block w-full aspect-square overflow-hidden rounded-2xl border border-white/20 bg-[#090B10] shadow-2xl animate-cover-reveal cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  <img
                    src={coverSrc}
                    alt={`${track.title} album cover`}
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </button>
              </div>
            </div>

            {/* Right Stage: Song Info, Specs & Full Controls */}
            <div className="lg:col-span-6 min-w-0 flex flex-col justify-between space-y-6">
              <div className="space-y-3 text-center lg:text-left">
                {(loadedOnDeckA || loadedOnDeckB) && (
                  <p className="text-xs font-semibold text-amber-400">
                    {loadedOnDeckA && loadedOnDeckB
                      ? 'Loaded on Deck A & Deck B'
                      : loadedOnDeckA
                        ? `Loaded on Deck A${isPlayingOnDeckA ? ' · Now Playing' : ''}`
                        : `Loaded on Deck B${isPlayingOnDeckB ? ' · Now Playing' : ''}`}
                  </p>
                )}

                <h2
                  id="song-detail-title"
                  className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-[#F1F3F5] leading-[1.15] [text-wrap:balance]"
                >
                  {track.title}
                </h2>

                <p className="text-base sm:text-lg font-semibold text-amber-300">
                  {track.artist}
                </p>

                <p className="text-sm text-[#D1D5DB]">
                  Album: <span className="text-[#F1F3F5] font-medium">{track.album || 'Single'}</span>
                </p>
              </div>

              {/* Structured Song Technical Specs */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-white/12 py-5">
                <div>
                  <p className="text-xs text-[#9CA3AF]">Genre / Language</p>
                  <p className="mt-1 text-base font-semibold text-[#F1F3F5] truncate">
                    {track.genre}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#9CA3AF]">Duration</p>
                  <p className="mt-1 font-mono-tabular text-base font-semibold text-[#F1F3F5]">
                    {formatDuration(track.durationSec)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#9CA3AF]">Tempo &amp; Musical Key</p>
                  <p className="mt-1 font-mono-tabular text-base font-semibold text-[#F1F3F5]">
                    {track.bpm} BPM · {track.musicalKey}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#9CA3AF]">
                    {offlineBytes ? 'Offline File Size' : 'Release & Audio Source'}
                  </p>
                  <p className="mt-1 font-mono-tabular text-base font-semibold text-[#F1F3F5]">
                    {offlineBytes
                      ? `${(offlineBytes / (1024 * 1024)).toFixed(1)} MB`
                      : `${track.releaseYear} · ${track.source === 'saavn' ? 'Saavn 320k' : 'Audius'}`}
                  </p>
                </div>
              </div>

              {/* Primary + Secondary DJ Actions */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onPlayNow(track);
                      onClose();
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-[#090B10] hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    <span>Play Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onLoadToDeck('A', track);
                      onClose();
                    }}
                    className="min-h-[44px] rounded-xl border border-amber-500/35 bg-amber-500/12 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/22 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Load Deck A
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onLoadToDeck('B', track);
                      onClose();
                    }}
                    className="min-h-[44px] rounded-xl border border-sky-400/35 bg-sky-400/12 px-4 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-400/22 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Load Deck B
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => onAddToQueue(track)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/12 bg-[#1A1E28] px-4 py-2 text-xs font-medium text-[#E5E7EB] hover:bg-[#232836] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ListPlus className="h-4 w-4" aria-hidden="true" />
                    <span>Add to Queue</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onSuggestSimilar(track);
                      onClose();
                    }}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>AI Similar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSaveOffline(track)}
                    disabled={isSavingOffline || isSavedOffline}
                    className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isSavedOffline
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/12 bg-[#1A1E28] text-[#E5E7EB] hover:bg-[#232836]'
                    }`}
                  >
                    {isSavingOffline ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : isSavedOffline ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <HardDriveDownload className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{isSavedOffline ? 'Offline Saved' : 'Save Offline'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDownloadFile(track)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/12 bg-[#1A1E28] px-4 py-2 text-xs font-medium text-[#E5E7EB] hover:bg-[#232836] hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
