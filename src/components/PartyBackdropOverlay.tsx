import React, { useEffect, useRef } from 'react';
import { djAudioEngine } from '../audio/djAudioEngine';

interface PartyBackdropOverlayProps {
  isPlaying: boolean;
  deckAPlaying: boolean;
  deckBPlaying: boolean;
  bangerMode: boolean;
  enabled: boolean;
}

interface PartySpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: 'amber' | 'cyan' | 'rose' | 'violet';
  alpha: number;
  bokeh: boolean;
}

export const PartyBackdropOverlay: React.FC<PartyBackdropOverlayProps> = ({
  isPlaying,
  deckAPlaying,
  deckBPlaying,
  bangerMode,
  enabled,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftOrbRef = useRef<HTMLDivElement | null>(null);
  const rightOrbRef = useRef<HTMLDivElement | null>(null);
  const topWashRef = useRef<HTMLDivElement | null>(null);
  const sparksRef = useRef<PartySpark[]>([]);

  useEffect(() => {
    if (!enabled || !isPlaying) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    if (sparksRef.current.length === 0) {
      const hues: Array<PartySpark['hue']> = ['amber', 'cyan', 'rose', 'violet'];
      sparksRef.current = Array.from({ length: 42 }, (_, idx) => {
        const isBokeh = idx % 3 === 0;
        return {
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * (isBokeh ? 0.45 : 0.8),
          vy: isBokeh ? -0.25 - Math.random() * 0.55 : -0.5 - Math.random() * 1.1,
          size: isBokeh ? 18 + Math.random() * 34 : 2 + Math.random() * 3.5,
          hue: hues[idx % hues.length],
          alpha: isBokeh ? 0.08 + Math.random() * 0.1 : 0.35 + Math.random() * 0.45,
          bokeh: isBokeh,
        };
      });
    }

    let rafId = 0;
    let phase = 0;
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const masterFreq = djAudioEngine.getFrequencyData();
      const freqA = deckAPlaying ? djAudioEngine.getDeckFrequencyData('A') : null;
      const freqB = deckBPlaying ? djAudioEngine.getDeckFrequencyData('B') : null;

      const masterEnergy = djAudioEngine.getFrequencyEnergy(masterFreq);
      const energyA = djAudioEngine.getFrequencyEnergy(freqA);
      const energyB = djAudioEngine.getFrequencyEnergy(freqB);

      const hasRealMaster = Boolean(masterFreq && masterFreq.some((v) => v > 1));
      const bass = hasRealMaster ? masterEnergy.bass : 0.32 + 0.2 * Math.abs(Math.sin(phase * 2.2));
      const mid = hasRealMaster ? masterEnergy.mid : 0.25 + 0.16 * Math.abs(Math.cos(phase * 1.6));
      const high = hasRealMaster ? masterEnergy.high : 0.22 + 0.18 * Math.abs(Math.sin(phase * 3.1));

      const bassA = deckAPlaying
        ? freqA && freqA.some((v) => v > 1)
          ? energyA.bass
          : bass
        : 0.1;
      const bassB = deckBPlaying
        ? freqB && freqB.some((v) => v > 1)
          ? energyB.bass
          : bass
        : 0.1;

      if (!reducedMotion) {
        phase += 0.022 + bass * 0.032;
      }

      // Beat-synced translucent spotlight perimeter orbs floating OVER the screen (mix-blend-screen)
      if (leftOrbRef.current) {
        const scaleA = (0.95 + bassA * 0.65).toFixed(3);
        const opA = (deckAPlaying ? 0.2 + bassA * 0.3 : 0.08).toFixed(2);
        leftOrbRef.current.style.transform = reducedMotion
          ? 'translate3d(0, 0, 0) scale(1)'
          : `translate3d(${Math.sin(phase * 0.85) * 44}px, ${Math.cos(phase * 0.65) * 36}px, 0) scale(${scaleA})`;
        leftOrbRef.current.style.opacity = opA;
      }

      if (rightOrbRef.current) {
        const scaleB = (0.95 + bassB * 0.65).toFixed(3);
        const opB = (deckBPlaying ? 0.2 + bassB * 0.3 : 0.08).toFixed(2);
        rightOrbRef.current.style.transform = reducedMotion
          ? 'translate3d(0, 0, 0) scale(1)'
          : `translate3d(${Math.cos(phase * 0.8) * -44}px, ${Math.sin(phase * 0.7) * 36}px, 0) scale(${scaleB})`;
        rightOrbRef.current.style.opacity = opB;
      }

      if (topWashRef.current) {
        const scaleT = (1 + bass * 0.35).toFixed(3);
        const opT = (0.14 + (bangerMode ? 0.12 : 0.06) + mid * 0.22).toFixed(2);
        topWashRef.current.style.transform = reducedMotion
          ? 'translateX(-50%) scale(1)'
          : `translateX(-50%) scale(${scaleT}) rotate(${Math.round(phase * 22)}deg)`;
        topWashRef.current.style.opacity = opT;
      }

      // Draw translucent sweeping DJ club laser beams from upper corners across the viewport
      const beamCount = bangerMode ? 5 : 3;
      for (let b = 0; b < beamCount; b++) {
        const isLeft = b % 2 === 0;
        const originX = isLeft ? w * (0.1 + (b * 0.08)) : w * (0.9 - (b * 0.06));
        const originY = -30;
        const sweepAngle = isLeft
          ? Math.PI * 0.34 + Math.sin(phase * (1.05 + b * 0.22) + b * 1.4) * 0.38
          : Math.PI * 0.66 + Math.cos(phase * (0.95 + b * 0.22) + b * 1.1) * 0.38;
        const length = Math.hypot(w, h) * 1.05;
        const spread = 0.075 + bass * 0.055;

        const x1 = originX + Math.cos(sweepAngle - spread) * length;
        const y1 = originY + Math.sin(sweepAngle - spread) * length;
        const x2 = originX + Math.cos(sweepAngle + spread) * length;
        const y2 = originY + Math.sin(sweepAngle + spread) * length;

        const beamGrad = ctx.createLinearGradient(originX, originY, (x1 + x2) / 2, (y1 + y2) / 2);
        const alphaBase = 0.07 + bass * 0.12;
        const rgb =
          b % 3 === 0
            ? '245, 158, 11'
            : b % 3 === 1
              ? '56, 189, 248'
              : '251, 113, 133';

        beamGrad.addColorStop(0, `rgba(${rgb}, ${alphaBase.toFixed(2)})`);
        beamGrad.addColorStop(0.55, `rgba(${rgb}, ${(alphaBase * 0.35).toFixed(3)})`);
        beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
      }

      // Draw translucent blurred bokeh club circles & crisp party sparks OVER the screen
      if (!reducedMotion) {
        const speedMult = 1 + bass * 2.1 + high * 1.3;
        for (const spark of sparksRef.current) {
          spark.y += spark.vy * speedMult;
          spark.x += spark.vx * speedMult + Math.sin(phase + spark.y * 0.01) * 0.45;
          if (spark.y < -60) {
            spark.y = h + 50;
            spark.x = Math.random() * w;
          }
          if (spark.x < -60) spark.x = w + 50;
          if (spark.x > w + 60) spark.x = -50;

          const rgb =
            spark.hue === 'amber'
              ? '251, 191, 36'
              : spark.hue === 'cyan'
                ? '56, 189, 248'
                : spark.hue === 'rose'
                  ? '251, 113, 133'
                  : '167, 139, 250';

          if (spark.bokeh) {
            const radius = spark.size * (1 + bass * 0.45);
            const alpha = Math.min(0.22, spark.alpha * (0.7 + bass * 0.8));
            const grad = ctx.createRadialGradient(spark.x, spark.y, 0, spark.x, spark.y, radius);
            grad.addColorStop(0, `rgba(${rgb}, ${alpha.toFixed(3)})`);
            grad.addColorStop(0.55, `rgba(${rgb}, ${(alpha * 0.4).toFixed(3)})`);
            grad.addColorStop(1, `rgba(${rgb}, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(spark.x, spark.y, radius, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const r = spark.size * (1 + high * 0.85);
            const alpha = Math.min(0.7, spark.alpha * (0.5 + high * 0.65));
            ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(spark.x, spark.y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Soft glowing translucent horizon equalizer pulse along bottom edge of viewport
      const barCount = 56;
      const barW = w / barCount;
      for (let i = 0; i < barCount; i++) {
        let ratio = 0.08;
        if (hasRealMaster && masterFreq) {
          const bin = Math.min(
            masterFreq.length - 1,
            Math.floor((i / barCount) * (masterFreq.length * 0.68))
          );
          ratio = masterFreq[bin] / 255;
        } else {
          ratio = 0.2 + 0.26 * Math.abs(Math.sin(phase * 1.9 + i * 0.32));
        }
        const barH = Math.max(3, ratio * (bangerMode ? 68 : 46));
        const rgb = i < barCount / 2 ? '245, 158, 11' : '56, 189, 248';
        const barGrad = ctx.createLinearGradient(0, h - barH, 0, h);
        barGrad.addColorStop(0, `rgba(${rgb}, 0)`);
        barGrad.addColorStop(1, `rgba(${rgb}, ${(0.08 + ratio * 0.22).toFixed(2)})`);
        ctx.fillStyle = barGrad;
        ctx.fillRect(i * barW + 1.5, h - barH, Math.max(2, barW - 3), barH);
      }

      if (!reducedMotion) {
        rafId = requestAnimationFrame(render);
      }
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [enabled, isPlaying, deckAPlaying, deckBPlaying, bangerMode]);

  if (!enabled || !isPlaying) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden mix-blend-screen transition-opacity duration-500"
    >
      {/* Left Amber blurred club light over screen edge */}
      <div
        ref={leftOrbRef}
        className="absolute -left-28 top-1/4 h-[420px] w-[420px] rounded-full bg-amber-500/25 blur-[110px] transition-opacity duration-300"
      />

      {/* Right Cyan blurred club light over screen edge */}
      <div
        ref={rightOrbRef}
        className="absolute -right-28 top-1/3 h-[420px] w-[420px] rounded-full bg-sky-400/25 blur-[110px] transition-opacity duration-300"
      />

      {/* Upper blurred rotating conic club wash */}
      <div
        ref={topWashRef}
        className="absolute left-1/2 -top-44 h-[420px] w-[640px] -translate-x-1/2 rounded-full blur-[115px] transition-opacity duration-300"
        style={{
          background:
            'conic-gradient(from 0deg, rgba(245,158,11,0.28), rgba(251,113,133,0.22), rgba(56,189,248,0.28), rgba(245,158,11,0.28))',
        }}
      />

      {/* Transparent blurred party beams, floating bokeh & horizon equalizers over the viewport */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
};
