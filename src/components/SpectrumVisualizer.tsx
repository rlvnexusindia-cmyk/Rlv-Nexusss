import React, { useEffect, useRef, useState } from 'react';
import { djAudioEngine } from '../audio/djAudioEngine';
import type { DeckId } from '../types/music';

export type VisualizerMode = 'bars' | 'wave' | 'pulse';
export type ActiveVisualizerDeck = DeckId | 'MIX';

interface SpectrumVisualizerProps {
  isAnyPlaying: boolean;
  bangerMode: boolean;
  activeDeck: ActiveVisualizerDeck;
  activeTrackTitle: string | null;
}

export const SpectrumVisualizer: React.FC<SpectrumVisualizerProps> = ({
  isAnyPlaying,
  bangerMode,
  activeDeck,
  activeTrackTitle,
}) => {
  const [visMode, setVisMode] = useState<VisualizerMode>('bars');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakHoldRef = useRef<Float32Array>(new Float32Array(40));
  const bassBarRef = useRef<HTMLDivElement | null>(null);
  const midBarRef = useRef<HTMLDivElement | null>(null);
  const highBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;

    const getAccentColors = () => {
      if (activeDeck === 'A') {
        return {
          primary: '#F59E0B',
          secondary: '#FBBF24',
          glow: 'rgba(245, 158, 11, 0.28)',
          cap: '#FDE68A',
        };
      }
      if (activeDeck === 'B') {
        return {
          primary: '#38BDF8',
          secondary: '#0EA5E9',
          glow: 'rgba(56, 189, 248, 0.28)',
          cap: '#BAE6FD',
        };
      }
      return {
        primary: '#F59E0B',
        secondary: '#38BDF8',
        glow: 'rgba(245, 158, 11, 0.24)',
        cap: '#F1F3F5',
      };
    };

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Subtle studio grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.5);
      ctx.lineTo(width, height * 0.5);
      ctx.stroke();

      const freqData =
        activeDeck === 'MIX'
          ? djAudioEngine.getFrequencyData()
          : djAudioEngine.getDeckFrequencyData(activeDeck) ?? djAudioEngine.getFrequencyData();

      const timeData =
        activeDeck === 'MIX'
          ? djAudioEngine.getTimeDomainData()
          : djAudioEngine.getDeckTimeDomainData(activeDeck) ?? djAudioEngine.getTimeDomainData();

      const hasRealFreqSignal =
        Boolean(freqData && freqData.length > 0) &&
        freqData!.some((v) => v > 1);

      const colors = getAccentColors();
      const energy = hasRealFreqSignal
        ? djAudioEngine.getFrequencyEnergy(freqData)
        : { bass: isAnyPlaying ? 0.22 : 0.04, mid: isAnyPlaying ? 0.18 : 0.03, high: isAnyPlaying ? 0.14 : 0.02, peak: 0.2 };

      if (bassBarRef.current) {
        bassBarRef.current.style.width = `${Math.round(Math.max(4, energy.bass * 100))}%`;
      }
      if (midBarRef.current) {
        midBarRef.current.style.width = `${Math.round(Math.max(4, energy.mid * 100))}%`;
      }
      if (highBarRef.current) {
        highBarRef.current.style.width = `${Math.round(Math.max(4, energy.high * 100))}%`;
      }

      phase += 0.045;

      if (visMode === 'bars') {
        const barCount = 36;
        const gap = 3;
        const barWidth = (width - gap * (barCount - 1)) / barCount;
        const peaks = peakHoldRef.current;

        const barGrad = ctx.createLinearGradient(0, height, 0, 0);
        barGrad.addColorStop(0, colors.primary);
        barGrad.addColorStop(0.65, colors.secondary);
        barGrad.addColorStop(1, bangerMode ? '#FB7185' : colors.cap);

        for (let i = 0; i < barCount; i++) {
          let ratio = 0.05;
          if (isAnyPlaying && hasRealFreqSignal && freqData) {
            const binIdx = Math.min(
              freqData.length - 1,
              Math.floor((i / barCount) * (freqData.length * 0.72))
            );
            ratio = Math.max(0.05, freqData[binIdx] / 255);
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

          // Peak hold tick
          const peakY = Math.max(2, height - peaks[i] * usableH - 3);
          ctx.fillStyle = colors.cap;
          ctx.fillRect(x, peakY, barWidth, 2);
        }
      } else if (visMode === 'wave') {
        const midY = height / 2;
        const lineGrad = ctx.createLinearGradient(0, 0, width, 0);
        lineGrad.addColorStop(0, colors.primary);
        lineGrad.addColorStop(1, colors.secondary);

        const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
        fillGrad.addColorStop(0, colors.glow);
        fillGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
        fillGrad.addColorStop(1, colors.glow);

        const hasRealWave =
          isAnyPlaying &&
          Boolean(timeData && timeData.length > 0) &&
          timeData!.some((v) => Math.abs(v - 128) > 1);

        const sampleCount = hasRealWave && timeData ? Math.min(128, timeData.length) : 64;
        ctx.beginPath();
        for (let i = 0; i < sampleCount; i++) {
          const x = (i / (sampleCount - 1)) * width;
          let norm = 0;
          if (hasRealWave && timeData) {
            const idx = Math.floor((i / sampleCount) * timeData.length);
            norm = (timeData[idx] - 128) / 128;
          } else if (isAnyPlaying) {
            norm = 0.25 * Math.sin(phase * 1.8 + i * 0.22) * Math.cos(i * 0.08 + phase);
          } else {
            norm = 0.04 * Math.sin(phase * 0.6 + i * 0.2);
          }
          const amp = bangerMode ? 1.2 : 1.0;
          const y = Math.max(4, Math.min(height - 4, midY + norm * (midY - 6) * amp));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Fill subtle area back to center line
        ctx.lineTo(width, midY);
        ctx.lineTo(0, midY);
        ctx.closePath();
        ctx.fillStyle = fillGrad;
        ctx.fill();
      } else {
        // Symmetric center-out bass pulse spectrum
        const halfBars = 18;
        const gap = 2.5;
        const totalBars = halfBars * 2;
        const barW = (width - gap * (totalBars - 1)) / totalBars;
        const centerX = width / 2;
        const midY = height / 2;

        const symGrad = ctx.createLinearGradient(0, 0, width, 0);
        symGrad.addColorStop(0, colors.secondary);
        symGrad.addColorStop(0.5, colors.primary);
        symGrad.addColorStop(1, colors.secondary);

        ctx.fillStyle = symGrad;
        for (let i = 0; i < halfBars; i++) {
          let ratio = 0.08;
          if (isAnyPlaying && hasRealFreqSignal && freqData) {
            const binIdx = Math.min(freqData.length - 1, i * 2);
            ratio = Math.max(0.08, freqData[binIdx] / 255);
          } else if (isAnyPlaying) {
            ratio = 0.2 + 0.28 * Math.abs(Math.cos(phase + i * 0.28));
          } else {
            ratio = 0.05 + 0.02 * Math.abs(Math.sin(phase * 0.5 + i * 0.3));
          }

          const barH = Math.max(4, ratio * (height - 8));
          const y = midY - barH / 2;
          const offset = i * (barW + gap) + gap / 2;

          // Right wing
          ctx.beginPath();
          ctx.roundRect(centerX + offset, y, barW, barH, 2);
          ctx.fill();

          // Left wing
          ctx.beginPath();
          ctx.roundRect(centerX - offset - barW, y, barW, barH, 2);
          ctx.fill();
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [isAnyPlaying, bangerMode, activeDeck, visMode]);

  const deckLabel =
    activeDeck === 'A'
      ? 'Deck A Live'
      : activeDeck === 'B'
        ? 'Deck B Live'
        : 'Dual Mix A+B';

  const deckBadgeColor =
    activeDeck === 'A'
      ? 'text-amber-400'
      : activeDeck === 'B'
        ? 'text-sky-400'
        : 'text-[#F1F3F5]';

  return (
    <div className="w-full rounded-xl bg-[#0B0D11] border border-white/8 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-semibold shrink-0 ${deckBadgeColor}`}>{deckLabel}</span>
          <span className="text-white/20" aria-hidden="true">·</span>
          <span className="truncate text-[#9CA3AF]">
            {isAnyPlaying && activeTrackTitle ? activeTrackTitle : 'Web Audio Spectrum'}
          </span>
        </div>

        <div
          role="group"
          aria-label="Visualizer mode"
          className="flex items-center gap-0.5 rounded-lg border border-white/8 bg-[#12161F] p-0.5 shrink-0"
        >
          {(
            [
              { id: 'bars', label: 'Bars' },
              { id: 'wave', label: 'Wave' },
              { id: 'pulse', label: 'Pulse' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setVisMode(tab.id)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                visMode === tab.id
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
        className="h-20 w-full block rounded-lg bg-[#090B10]"
        aria-label={`Real-time Web Audio visualizer reacting to ${deckLabel}`}
      />

      {/* Reactive Sub / Mid / High Web Audio Band Meters */}
      <div className="grid grid-cols-3 gap-2 pt-0.5 text-[10px] font-mono-tabular text-[#9CA3AF]">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span>SUB</span>
            <span>{bangerMode ? '+6dB' : '0dB'}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
            <div
              ref={bassBarRef}
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
              ref={midBarRef}
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
              ref={highBarRef}
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
