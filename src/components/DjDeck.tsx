import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  HardDriveDownload,
  Loader2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SkipForward,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { djAudioEngine } from '../audio/djAudioEngine';
import type { DeckEq, DeckState, Track } from '../types/music';

interface DjDeckProps {
  deck: DeckState;
  isSavedOffline: boolean;
  isSavingOffline: boolean;
  onTogglePlay: () => void;
  onCueRestart: () => void;
  onToggleLoop: () => void;
  onSeek: (timeSec: number) => void;
  onVolumeChange: (val: number) => void;
  onPitchChange: (val: number) => void;
  onEqChange: (key: keyof DeckEq, val: number) => void;
  onResetEq: () => void;
  onLoadNextFromQueue: () => void;
  onSaveOffline: (track: Track) => void;
  onDownloadFile: (track: Track) => void;
  onSuggestSimilar: (track: Track) => void;
  hasQueue: boolean;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const s = Math.floor(sec);
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export const DjDeck: React.FC<DjDeckProps> = ({
  deck,
  isSavedOffline,
  isSavingOffline,
  onTogglePlay,
  onCueRestart,
  onToggleLoop,
  onSeek,
  onVolumeChange,
  onPitchChange,
  onEqChange,
  onResetEq,
  onLoadNextFromQueue,
  onSaveOffline,
  onDownloadFile,
  onSuggestSimilar,
  hasQueue,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const deckCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vinylHaloRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setImgFailed(false);
  }, [deck.track?.id]);

  useEffect(() => {
    const canvas = deckCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const isDeckA = deck.deckId === 'A';
    const barColor = isDeckA ? '#F59E0B' : '#38BDF8';
    const waveColor = isDeckA ? '#FDE68A' : '#BAE6FD';

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const freq = djAudioEngine.getDeckFrequencyData(deck.deckId);
      const wave = djAudioEngine.getDeckTimeDomainData(deck.deckId);
      const hasFreq = Boolean(freq && freq.length > 0 && freq.some((v) => v > 1));
      const energy = hasFreq
        ? djAudioEngine.getFrequencyEnergy(freq)
        : { bass: 0, mid: 0, high: 0, peak: 0 };

      if (vinylHaloRef.current) {
        if (deck.isPlaying) {
          const glowPx = Math.round(10 + energy.bass * 24);
          const alpha = (0.18 + energy.bass * 0.42).toFixed(2);
          vinylHaloRef.current.style.boxShadow = isDeckA
            ? `0 0 ${glowPx}px rgba(245, 158, 11, ${alpha})`
            : `0 0 ${glowPx}px rgba(56, 189, 248, ${alpha})`;
        } else {
          vinylHaloRef.current.style.boxShadow = 'none';
        }
      }

      // Background bars from deck FFT
      const barCount = 28;
      const gap = 2;
      const barW = (w - gap * (barCount - 1)) / barCount;
      ctx.fillStyle = isDeckA ? 'rgba(245, 158, 11, 0.34)' : 'rgba(56, 189, 248, 0.34)';

      for (let i = 0; i < barCount; i++) {
        let ratio = 0.08;
        if (deck.isPlaying && hasFreq && freq) {
          const idx = Math.min(freq.length - 1, Math.floor((i / barCount) * (freq.length * 0.65)));
          ratio = Math.max(0.08, freq[idx] / 255);
        }
        const barH = Math.max(2, ratio * (h - 4));
        ctx.fillRect(i * (barW + gap), h - barH, barW, barH);
      }

      // Crisp live waveform overlay
      const hasWave = Boolean(
        deck.isPlaying && wave && wave.length > 0 && wave.some((v) => Math.abs(v - 128) > 1)
      );
      ctx.beginPath();
      const midY = h / 2;
      const steps = 64;
      for (let i = 0; i < steps; i++) {
        const x = (i / (steps - 1)) * w;
        let offset = 0;
        if (hasWave && wave) {
          const idx = Math.floor((i / steps) * wave.length);
          offset = ((wave[idx] - 128) / 128) * (midY - 3);
        }
        const y = Math.max(2, Math.min(h - 2, midY + offset));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = deck.isPlaying ? waveColor : barColor;
      ctx.globalAlpha = deck.isPlaying ? 0.92 : 0.25;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [deck.deckId, deck.isPlaying]);

  const isDeckA = deck.deckId === 'A';
  const accentText = isDeckA ? 'text-amber-400' : 'text-sky-400';
  const accentBg = isDeckA
    ? 'bg-amber-500 text-[#090B10] hover:bg-amber-400'
    : 'bg-sky-400 text-[#090B10] hover:bg-sky-300';
  const sliderAccent = isDeckA ? 'dj-slider-amber' : 'dj-slider-cyan';
  const ringBorder = isDeckA ? 'border-amber-500/40' : 'border-sky-400/40';
  const fallbackCover = isDeckA
    ? '/src/assets/images/vinyl_cover_desi_1794994927145.jpg'
    : '/src/assets/images/vinyl_cover_retro_1794994928364.jpg';

  const track = deck.track;
  const effectiveBpm = track ? Math.round(track.bpm * deck.pitch) : 120;
  const progressPct =
    deck.duration > 0 ? Math.min(100, (deck.currentTime / deck.duration) * 100) : 0;

  return (
    <section
      aria-label={`Deck ${deck.deckId}`}
      className="flex h-full flex-col justify-between rounded-2xl border border-white/8 bg-[#12161F] p-4 sm:p-5"
    >
      {/* Deck Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`font-display text-base font-bold tracking-tight ${accentText}`}>
            Deck {deck.deckId}
          </span>
          <span className="text-xs text-[#9CA3AF] truncate">
            {track ? `${track.genre} · ${track.releaseYear}` : 'No track loaded'}
          </span>
        </div>
        <div className="flex items-center gap-2.5 font-mono-tabular text-xs text-[#D1D5DB] shrink-0">
          <span>{effectiveBpm} BPM</span>
          <span aria-hidden="true" className="text-white/20">·</span>
          <span>{track ? track.musicalKey : '8A · Am'}</span>
        </div>
      </div>

      {/* Turntable + Track Info */}
      <div className="my-4 flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
        {/* Spinning Vinyl Platter */}
        <div className="relative shrink-0">
          <div
            ref={vinylHaloRef}
            className={`relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-full border-2 ${ringBorder} bg-[#090B10] shadow-lg transition-shadow duration-75 ${
              deck.isPlaying ? 'animate-vinyl' : 'animate-vinyl-paused'
            }`}
          >
            <div className="absolute inset-2 rounded-full border border-white/8" />
            <div className="absolute inset-4 rounded-full border border-white/6" />
            <div className="relative h-14 w-14 sm:h-16 sm:w-16 overflow-hidden rounded-full border border-white/20 bg-[#1A1E28]">
              {track?.artworkUrl && !imgFailed ? (
                <img
                  src={track.artworkUrl}
                  alt={`${track.title} cover`}
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={fallbackCover}
                  alt="Vinyl center artwork"
                  className="h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="h-2.5 w-2.5 rounded-full bg-[#090B10] border border-white/40" />
              </div>
            </div>
          </div>
        </div>

        {/* Track Title & Transport */}
        <div className="flex-1 min-w-0 w-full text-center sm:text-left">
          <h3 className="font-display text-lg font-semibold text-[#F1F3F5] truncate">
            {track ? track.title : `Load a song to Deck ${deck.deckId}`}
          </h3>
          <p className="mt-0.5 text-sm text-[#9CA3AF] truncate">
            {track ? `${track.artist} · ${track.album}` : 'Pick a song below or run AI Filter'}
          </p>

          {deck.error && (
            <p className="mt-1.5 text-xs text-rose-400" role="alert">
              {deck.error}
            </p>
          )}

          {/* Per-Deck Live Web Audio Waveform Strip */}
          <div className="mt-2.5 overflow-hidden rounded-lg border border-white/6 bg-[#090B10] px-2 py-1">
            <canvas
              ref={deckCanvasRef}
              width={260}
              height={32}
              className="h-8 w-full block"
              aria-label={`Live Web Audio waveform for Deck ${deck.deckId}`}
            />
          </div>

          {/* Seek & Timecode */}
          <div className="mt-2.5">
            <div className="mb-1 flex items-center justify-between font-mono-tabular text-xs text-[#9CA3AF]">
              <span>{formatTime(deck.currentTime)}</span>
              <span>{formatTime(deck.duration)}</span>
            </div>
            <div className="relative flex items-center">
              <input
                type="range"
                min={0}
                max={deck.duration || 30}
                step={0.1}
                value={deck.currentTime}
                disabled={!track}
                onChange={(e) => onSeek(Number(e.target.value))}
                aria-label={`Seek Deck ${deck.deckId}`}
                className={`dj-slider ${sliderAccent} w-full disabled:opacity-40`}
                style={{
                  background: `linear-gradient(to right, ${isDeckA ? '#f59e0b' : '#38bdf8'} ${progressPct}%, transparent ${progressPct}%)`,
                  borderRadius: '999px',
                }}
              />
            </div>
          </div>

          {/* Transport Buttons (touch-friendly >= 44px on mobile) */}
          <div className="mt-3.5 flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!track || deck.isLoading}
              className={`inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${accentBg}`}
            >
              {deck.isPlaying ? (
                <>
                  <Pause className="h-4 w-4" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>{deck.isLoading ? 'Loading' : 'Play'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onCueRestart}
              disabled={!track}
              title="Cue / Restart"
              className="inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-xl border border-white/10 bg-[#1A1E28] px-3 py-2 text-xs font-medium text-[#E5E7EB] hover:bg-[#232836] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cue</span>
            </button>

            <button
              type="button"
              onClick={onToggleLoop}
              disabled={!track}
              aria-pressed={deck.loop}
              className={`inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 ${
                deck.loop
                  ? isDeckA
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                    : 'border-sky-400/60 bg-sky-400/15 text-sky-300'
                  : 'border-white/10 bg-[#1A1E28] text-[#9CA3AF] hover:text-[#F1F3F5]'
              }`}
            >
              <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Loop</span>
            </button>

            <button
              type="button"
              onClick={onLoadNextFromQueue}
              disabled={!hasQueue}
              title="Load next track from queue"
              className="inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-xl border border-white/10 bg-[#1A1E28] px-3 py-2 text-xs font-medium text-[#E5E7EB] hover:bg-[#232836] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Next</span>
            </button>
          </div>

          {/* Quick Track Utility Strip: Offline Save, File Download, AI Suggest Similar */}
          {track && (
            <div className="mt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <button
                type="button"
                onClick={() => onSuggestSimilar(track)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>AI Similar</span>
              </button>
              <button
                type="button"
                onClick={() => onSaveOffline(track)}
                disabled={isSavingOffline || isSavedOffline}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  isSavedOffline
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-white/10 bg-[#171B26] text-[#D1D5DB] hover:bg-[#232836]'
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
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/10 bg-[#171B26] px-2.5 py-1 text-[11px] font-medium text-[#D1D5DB] hover:bg-[#232836] hover:text-[#F1F3F5] transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Download</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3-Band EQ + Filter + Pitch + Channel Volume */}
      <div className="border-t border-white/8 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-[#9CA3AF]">Channel EQ &amp; Tempo</span>
          <button
            type="button"
            onClick={onResetEq}
            className="text-xs font-medium text-[#9CA3AF] hover:text-[#F1F3F5] transition-colors cursor-pointer"
          >
            Reset EQ
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3.5">
          <div>
            <div className="mb-1 flex justify-between text-[11px] font-mono-tabular">
              <span className="text-[#9CA3AF]">Low Bass</span>
              <span className="text-[#E5E7EB]">
                {deck.eq.low > 0 ? `+${deck.eq.low}` : deck.eq.low} dB
              </span>
            </div>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={deck.eq.low}
              onChange={(e) => onEqChange('low', Number(e.target.value))}
              aria-label={`Deck ${deck.deckId} Low Bass EQ`}
              className={`dj-slider ${sliderAccent} w-full`}
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px] font-mono-tabular">
              <span className="text-[#9CA3AF]">Mid Vocal</span>
              <span className="text-[#E5E7EB]">
                {deck.eq.mid > 0 ? `+${deck.eq.mid}` : deck.eq.mid} dB
              </span>
            </div>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={deck.eq.mid}
              onChange={(e) => onEqChange('mid', Number(e.target.value))}
              aria-label={`Deck ${deck.deckId} Mid Vocal EQ`}
              className={`dj-slider ${sliderAccent} w-full`}
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px] font-mono-tabular">
              <span className="text-[#9CA3AF]">High Treble</span>
              <span className="text-[#E5E7EB]">
                {deck.eq.high > 0 ? `+${deck.eq.high}` : deck.eq.high} dB
              </span>
            </div>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={deck.eq.high}
              onChange={(e) => onEqChange('high', Number(e.target.value))}
              aria-label={`Deck ${deck.deckId} High Treble EQ`}
              className={`dj-slider ${sliderAccent} w-full`}
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px] font-mono-tabular">
              <span className="text-[#9CA3AF]">Sweep Filter</span>
              <span className="text-[#E5E7EB]">
                {Math.abs(deck.eq.filter) < 0.05
                  ? 'Flat'
                  : deck.eq.filter < 0
                    ? `LPF ${Math.round(Math.abs(deck.eq.filter) * 100)}%`
                    : `HPF ${Math.round(deck.eq.filter * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={deck.eq.filter}
              onChange={(e) => onEqChange('filter', Number(e.target.value))}
              aria-label={`Deck ${deck.deckId} Sweep Filter`}
              className={`dj-slider ${sliderAccent} w-full`}
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px] font-mono-tabular">
              <span className="text-[#9CA3AF]">Tempo</span>
              <span className="text-[#E5E7EB]">{deck.pitch.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0.8}
              max={1.25}
              step={0.01}
              value={deck.pitch}
              onChange={(e) => onPitchChange(Number(e.target.value))}
              aria-label={`Deck ${deck.deckId} Tempo`}
              className={`dj-slider ${sliderAccent} w-full`}
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px] font-mono-tabular">
              <span className="inline-flex items-center gap-1 text-[#9CA3AF]">
                <Volume2 className="h-3 w-3" aria-hidden="true" />
                Level
              </span>
              <span className="text-[#E5E7EB]">{Math.round(deck.volume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={deck.volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label={`Deck ${deck.deckId} Volume`}
              className={`dj-slider ${sliderAccent} w-full`}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
