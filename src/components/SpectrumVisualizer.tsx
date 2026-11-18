import React, { useEffect, useRef } from 'react';
import { djAudioEngine } from '../audio/djAudioEngine';

interface SpectrumVisualizerProps {
  isAnyPlaying: boolean;
  bangerMode: boolean;
}

export const SpectrumVisualizer: React.FC<SpectrumVisualizerProps> = ({
  isAnyPlaying,
  bangerMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const data = djAudioEngine.getFrequencyData();
      const barCount = 32;
      const gap = 3;
      const barWidth = (width - gap * (barCount - 1)) / barCount;

      phase += 0.04;

      for (let i = 0; i < barCount; i++) {
        let ratio = 0.08;
        if (isAnyPlaying && data && data.length > 0) {
          const binIdx = Math.min(data.length - 1, Math.floor((i / barCount) * (data.length * 0.72)));
          ratio = Math.max(0.08, data[binIdx] / 255);
        } else if (isAnyPlaying) {
          ratio = 0.25 + 0.35 * Math.abs(Math.sin(phase + i * 0.35));
        } else {
          ratio = 0.06 + 0.04 * Math.abs(Math.sin(phase * 0.5 + i * 0.25));
        }

        const barH = Math.max(3, ratio * (height - 6));
        const x = i * (barWidth + gap);
        const y = height - barH;

        if (bangerMode) {
          ctx.fillStyle = i < 10 ? '#F59E0B' : i < 22 ? '#FBBF24' : '#38BDF8';
        } else {
          ctx.fillStyle = i < 16 ? '#F59E0B' : '#38BDF8';
        }

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [isAnyPlaying, bangerMode]);

  return (
    <div className="w-full rounded-lg bg-[#0B0D11] border border-white/8 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#9CA3AF]">
        <span>Master Output Spectrum</span>
        <span className="font-mono-tabular text-[#D1D5DB]">
          {isAnyPlaying ? (bangerMode ? 'Bass Boosted' : 'Active') : 'Standby'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={340}
        height={64}
        className="h-16 w-full block"
        aria-label="Real-time audio frequency spectrum visualizer"
      />
    </div>
  );
};
