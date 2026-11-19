import React, { useEffect, useRef, useState } from 'react';
import { djAudioEngine } from '../audio/djAudioEngine';
import type { DeckId } from '../types/music';

export type ActiveVisualizerDeck = DeckId | 'MIX';
type AudioVisualizerMode = 'spectrum' | 'waveform' | 'mirror';

interface AudioVisualizerProps {
  isAnyPlaying: boolean;
  bangerMode: boolean;
  activeDeck: ActiveVisualizerDeck;
  activeTrackTitle: string | null;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isAnyPlaying,
  bangerMode,
  activeDeck,
  activeTrackTitle,
}) => {
  const [mode, setMode] = useState<AudioVisualizerMode>('spectrum');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakHoldRef = useRef<Float32Array>(new Float32Array(40));
  const subMeterRef = useRef<HTMLDivElement | null>(null);
  const midMeterRef = useRef<HTMLDivElement | null>(null);
  const highMeterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;

    const getPalette = () => {
      if (activeDeck === 'B') {
        return {
          start: '#0EA5E9',
          mid: '#38BDF8',
          top: bangerMode ? '#FB7185' : '#BAE6FD',
          glow: 'rgba(56, 189, 248, 0.25)',
        };
      }
      if (activeDeck === 'MIX') {
        return {
          start: '#F59E0B',
          mid: '#38BDF8',
          top: bangerMode ? '#FB7185' : '#F1F3F5',
          glow: 'rgba(245, 158, 11, 0.24)',
        };
      }
      return {
        start: '#D97706',
        mid: '#F59E0B',
        top: bangerMode ? '#FB7185' : '#FDE68A',
        glow: 'rgba(245, 158, 11, 0.26)',
      };
    };

    const drawFrame = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Subtle reference grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.5);
      ctx.lineTo(width, height * 0.5);
      ctx.stroke();

      // Pull frequency & waveform buffers from djAudioEngine master analyser
      const masterFreq = djAudioEngine.getFrequencyData();
      const masterWave = djAudioEngine.getTimeDomainData();

      const hasRealSignal = Boolean(
        masterFreq && masterFreq.length > 0 && masterFreq.some((val) => val > 1)
      );

      const energy = hasRealSignal
        ? djAudioEngine.getFrequencyEnergy(masterFreq)
        : {
            bass: isAnyPlaying ? 0.22 : 0.04,
            mid: isAnyPlaying ? 0.18 : 0.03,
            high: isAnyPlaying ? 0.14 : 0.02,
            peak: isAnyPlaying ? 0.24 : 0.04,
          };

      if (subMeterRef.current) {
        subMeterRef.current.style.width = `${Math.round(Math.max(4, energy.bass * 100))}%`;
      }
      if (midMeterRef.current) {
        midMeterRef.current.style.width = `${Math.round(Math.max(4, energy.mid * 100))}%`;
      }
      if (highMeterRef.current) {
        highMeterRef.current.style.width = `${Math.round(Math.max(4, energy.high * 100))}%`;
      }

      const palette = getPalette();
      phase += 0.045;

      if (mode === 'spectrum') {
        const barCount = 36;
        const gap = 3;
        const barWidth = (width - gap * (barCount - 1)) / barCount;
        const peaks = peakHoldRef.current;

        const barGrad = ctx.createLinearGradient(0, height, 0, 0);
        barGrad.addColorStop(0, palette.start);
        barGrad.addColorStop(0.65, palette.mid);
        barGrad.addColorStop(1, palette.top);

        for (let i = 0; i < barCount; i++) {
          let ratio = 0.05;
          if (isAnyPlaying && hasRealSignal && masterFreq) {
            const binIdx = Math.min(
              masterFreq.length - 1,
              Math.floor((i / barCount) * (masterFreq.length * 0.72))
            );
            ratio = Math.max(0.05, masterFreq[binIdx] / 255);
          } else if (isAnyPlaying) {
            ratio = 0.16 + 0.22 * Math.abs(Math.sin(phase + i * 0.35));
          } else {
            ratio = 0.04 + 0.025 * Math.abs(Math.sin(phase * 0.4 + i * 0.25));
          }

          if (ratio > peaks[i]) {
            peaks[i] = ratio;
          } else {
            peaks[i] = Math.max(ratio, peaks[i] - 0.012);
          }

          const usableH = height - 8;
          const barH = Math.max(3, ratio * usableH);
          const x = i * (barWidth + gap);
          const y = height - barH;

          ctx.fillStyle = barGrad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barH, 2);
          ctx.fill();

          const peakY = Math.max(2, height - peaks[i] * usableH - 3);
          ctx.fillStyle = palette.top;
          ctx.fillRect(x, peakY, barWidth, 2);
        }
      } else if (mode === 'waveform') {
        const midY = height / 2;
        const strokeGrad = ctx.createLinearGradient(0, 0, width, 0);
        strokeGrad.addColorStop(0, palette.start);
        strokeGrad.addColorStop(0.5, palette.mid);
        strokeGrad.addColorStop(1, palette.top);

        const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
        fillGrad.addColorStop(0, palette.glow);
        fillGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
        fillGrad.addColorStop(1, palette.glow);

        const hasWave =
          isAnyPlaying &&
          Boolean(masterWave && masterWave.length > 0) &&
          masterWave!.some((v) => Math.abs(v - 128) > 1);

        const sampleCount = hasWave && masterWave ? Math.min(128, masterWave.length) : 64;
        ctx.beginPath();
        for (let i = 0; i < sampleCount; i++) {
          const x = (i / (sampleCount - 1)) * width;
          let norm = 0;
          if (hasWave && masterWave) {
            const idx = Math.floor((i / sampleCount) * masterWave.length);
            norm = (masterWave[idx] - 128) / 128;
          } else if (isAnyPlaying) {
            norm = 0.24 * Math.sin(phase * 1.8 + i * 0.22) * Math.cos(i * 0.08 + phase);
          } else {
            norm = 0.03 * Math.sin(phase * 0.6 + i * 0.2);
          }
          const boost = bangerMode ? 1.2 : 1.0;
          const y = Math.max(4, Math.min(height - 4, midY + norm * (midY - 6) * boost));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = 2.2;
        ctx.stroke();

        ctx.lineTo(width, midY);
        ctx.lineTo(0, midY);
        ctx.closePath();
        ctx.fillStyle = fillGrad;
        ctx.fill();
      } else {
        // Mirrored center-out master frequency bars
        const halfBars = 18;
        const gap = 2.5;
        const totalBars = halfBars * 2;
        const barW = (width - gap * (totalBars - 1)) / totalBars;
        const centerX = width / 2;
        const midY = height / 2;

        const symGrad = ctx.createLinearGradient(0, 0, width, 0);
        symGrad.addColorStop(0, palette.mid);
        symGrad.addColorStop(0.5, palette.start);
        symGrad.addColorStop(1, palette.mid);

        ctx.fillStyle = symGrad;
        for (let i = 0; i < halfBars; i++) {
          let ratio = 0.08;
          if (isAnyPlaying && hasRealSignal && masterFreq) {
            const binIdx = Math.min(masterFreq.length - 1, i * 2);
            ratio = Math.max(0.08, masterFreq[binIdx] / 255);
          } else if (isAnyPlaying) {
            ratio = 0.2 + 0.28 * Math.abs(Math.cos(phase + i * 0.28));
          } else {
            ratio = 0.05 + 0.02 * Math.abs(Math.sin(phase * 0.5 + i * 0.3));
          }

          const barH = Math.max(4, ratio * (height - 8));
          const y = midY - barH / 2;
          const offset = i * (barW + gap) + gap / 2;

          ctx.beginPath();
          ctx.roundRect(centerX + offset, y, barW, barH, 2);
          ctx.fill();

          ctx.beginPath();
          ctx.roundRect(centerX - offset - barW, y, barW, barH, 2);
          ctx.fill();
        }
      }

      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, [isAnyPlaying, bangerMode, activeDeck, mode]);

  const deckLabel =
    activeDeck === 'A'
      ? 'Deck A Master'
      : activeDeck === 'B'
        ? 'Deck B Master'
        : 'Dual Mix A+B';

  const deckAccent =
    activeDeck === 'A'
      ? 'text-amber-400'
      : activeDeck === 'B'
        ? 'text-sky-400'
        : 'text-[#F1F3F5]';

  return (
    <div className="w-full rounded-xl border border-white/8 bg-[#0B0D11] px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-semibold shrink-0 ${deckAccent}`}>{deckLabel}</span>
          <span className="text-white/20" aria-hidden="true">·</span>
          <span className="truncate text-[#9CA3AF]">
            {isAnyPlaying && activeTrackTitle ? activeTrackTitle : 'Master Analyser'}
          </span>
        </div>

        <div
          role="group"
          aria-label="Audio visualizer mode"
          className="flex items-center gap-0.5 rounded-lg border border-white/8 bg-[#12161F] p-0.5 shrink-0"
        >
          {(
            [
              { id: 'spectrum', label: 'Bars' },
              { id: 'waveform', label: 'Wave' },
              { id: 'mirror', label: 'Pulse' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                mode === tab.id
                  ? 'bg-[#232836] text-[#F1F3F5]'
                  : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={340}
        height={80}
        className="block h-20 w-full rounded-lg bg-[#090B10]"
        aria-label="Master Web Audio frequency visualizer"
      />

      <div className="grid grid-cols-3 gap-2 pt-0.5 text-[10px] font-mono-tabular text-[#9CA3AF]">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span>SUB</span>
            <span>{bangerMode ? '+6dB' : '0dB'}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
            <div
              ref={subMeterRef}
              className={`h-full rounded-full transition-[width] duration-75 ${
                activeDeck === 'B' ? 'bg-sky-400' : 'bg-amber-500'
              }`}
              style={{ width: '4%' }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span>MID</span>
            <span>VOCAL</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
            <div
              ref={midMeterRef}
              className="h-full rounded-full bg-emerald-400 transition-[width] duration-75"
              style={{ width: '4%' }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span>HIGH</span>
            <span>AIR</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
            <div
              ref={highMeterRef}
              className={`h-full rounded-full transition-[width] duration-75 ${
                activeDeck === 'A' ? 'bg-amber-300' : 'bg-sky-300'
              }`}
              style={{ width: '4%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
