import React from 'react';
import { ArrowLeftRight, Flame, Headphones, Radio, Sparkles, Volume2, Zap } from 'lucide-react';
import type { DjFxType } from '../audio/djAudioEngine';
import { AudioVisualizer, type ActiveVisualizerDeck } from './AudioVisualizer';

interface MasterMixerProps {
  crossfade: number; // 0 (A) to 1 (B)
  masterVolume: number; // 0 to 1
  bangerMode: boolean;
  is8dEnabled: boolean;
  autoDj20s: boolean;
  autoDjCountdown: number;
  autoDjMode: 'two_song' | 'playlist';
  autoDjIntervalSec: 12 | 20;
  partyLightsEnabled: boolean;
  isAnyPlaying: boolean;
  activeDeck: ActiveVisualizerDeck;
  activeTrackTitle: string | null;
  isAutoTransitioning: boolean;
  onCrossfadeChange: (val: number) => void;
  onMasterVolumeChange: (val: number) => void;
  onToggleBangerMode: () => void;
  onToggle8dMode: () => void;
  onToggleAutoDj20s: () => void;
  onToggleAutoDjMode: () => void;
  onToggleAutoDjInterval: () => void;
  onInstantMashupCut: () => void;
  onTogglePartyLights: () => void;
  onTriggerCrossfadeMix: () => void;
  onTriggerFx: (fx: DjFxType) => void;
}

export const MasterMixer: React.FC<MasterMixerProps> = ({
  crossfade,
  masterVolume,
  bangerMode,
  is8dEnabled,
  autoDj20s,
  autoDjCountdown,
  autoDjMode,
  autoDjIntervalSec,
  partyLightsEnabled,
  isAnyPlaying,
  activeDeck,
  activeTrackTitle,
  isAutoTransitioning,
  onCrossfadeChange,
  onMasterVolumeChange,
  onToggleBangerMode,
  onToggle8dMode,
  onToggleAutoDj20s,
  onToggleAutoDjMode,
  onToggleAutoDjInterval,
  onInstantMashupCut,
  onTogglePartyLights,
  onTriggerCrossfadeMix,
  onTriggerFx,
}) => {
  const deckAPct = Math.round((1 - crossfade) * 100);
  const deckBPct = Math.round(crossfade * 100);

  return (
    <section
      aria-label="Master Mixer Console"
      className={`flex h-full flex-col justify-between gap-4 rounded-2xl border bg-[#12161F]/78 backdrop-blur-xl p-4 sm:p-5 transition-colors duration-300 ${
        isAnyPlaying && partyLightsEnabled ? 'border-amber-500/25' : 'border-white/8'
      }`}
    >
      {/* Master Header + Party FX & Banger Mode Toggles */}
      <div className="flex items-center justify-between gap-2 border-b border-white/8 pb-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-[#F1F3F5] truncate">Master Mixer</h2>
          <p className="text-xs text-[#9CA3AF] truncate">Crossfade, Bass &amp; Live FX</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onTogglePartyLights}
            aria-pressed={partyLightsEnabled}
            title="Toggle blurred DJ party backdrop lights"
            className={`inline-flex min-h-[40px] sm:min-h-0 items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              partyLightsEnabled
                ? 'border border-sky-400/50 bg-sky-400/15 text-sky-300 hover:bg-sky-400/25'
                : 'border border-white/10 bg-[#1A1E28] text-[#9CA3AF] hover:bg-[#232836] hover:text-[#F1F3F5]'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Party FX</span>
          </button>
          <button
            type="button"
            onClick={onToggleBangerMode}
            aria-pressed={bangerMode}
            className={`inline-flex min-h-[40px] sm:min-h-0 items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              bangerMode
                ? 'bg-amber-500 text-[#090B10] hover:bg-amber-400'
                : 'border border-white/10 bg-[#1A1E28] text-[#D1D5DB] hover:bg-[#232836]'
            }`}
          >
            <Flame className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{bangerMode ? 'Banger On' : 'Banger'}</span>
          </button>
        </div>
      </div>

      {/* Master Audio Visualizer above the crossfader */}
      <AudioVisualizer
        isAnyPlaying={isAnyPlaying}
        bangerMode={bangerMode}
        activeDeck={activeDeck}
        activeTrackTitle={activeTrackTitle}
      />

      {/* Crossfader */}
      <div className="rounded-xl border border-white/8 bg-[#090B10] p-3.5">
        <div className="mb-2 flex items-center justify-between text-xs font-mono-tabular">
          <span className="font-semibold text-amber-400">Deck A {deckAPct}%</span>
          <span className="text-[#9CA3AF]">Crossfader</span>
          <span className="font-semibold text-sky-400">{deckBPct}% Deck B</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={crossfade}
          onChange={(e) => onCrossfadeChange(Number(e.target.value))}
          aria-label="Master Crossfader between Deck A and Deck B"
          className="dj-slider w-full"
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onCrossfadeChange(0)}
            className="min-h-[40px] sm:min-h-0 rounded-lg border border-white/10 bg-[#1A1E28] py-1.5 text-xs font-medium text-[#E5E7EB] hover:bg-[#232836] transition-colors cursor-pointer whitespace-nowrap"
          >
            Solo A
          </button>
          <button
            type="button"
            onClick={() => onCrossfadeChange(0.5)}
            className="min-h-[40px] sm:min-h-0 rounded-lg border border-white/10 bg-[#1A1E28] py-1.5 text-xs font-medium text-[#E5E7EB] hover:bg-[#232836] transition-colors cursor-pointer whitespace-nowrap"
          >
            Blend 50/50
          </button>
          <button
            type="button"
            onClick={() => onCrossfadeChange(1)}
            className="min-h-[40px] sm:min-h-0 rounded-lg border border-white/10 bg-[#1A1E28] py-1.5 text-xs font-medium text-[#E5E7EB] hover:bg-[#232836] transition-colors cursor-pointer whitespace-nowrap"
          >
            Solo B
          </button>
        </div>

        <button
          type="button"
          onClick={onTriggerCrossfadeMix}
          disabled={isAutoTransitioning}
          className="mt-2.5 flex min-h-[44px] sm:min-h-[38px] w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isAutoTransitioning ? 'Mixing Decks...' : 'Smooth Mix Switch (A ↔ B)'}</span>
        </button>

        {/* Auto DJ 2-Song Cut Mashup & 8D Spatial Audio Controls */}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleAutoDj20s}
            aria-pressed={autoDj20s}
            className={`flex min-h-[44px] sm:min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              autoDj20s
                ? 'bg-emerald-400 text-[#090B10] hover:bg-emerald-300'
                : 'border border-white/10 bg-[#1A1E28] text-[#E5E7EB] hover:bg-[#232836]'
            }`}
          >
            <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {autoDj20s
                ? `${autoDjMode === 'two_song' ? '2-Song Cut' : 'Queue Auto'} · ${autoDjCountdown}s`
                : `Auto DJ (${autoDjIntervalSec}s)`}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggle8dMode}
            aria-pressed={is8dEnabled}
            className={`flex min-h-[44px] sm:min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              is8dEnabled
                ? 'bg-sky-400 text-[#090B10] hover:bg-sky-300'
                : 'border border-white/10 bg-[#1A1E28] text-[#E5E7EB] hover:bg-[#232836]'
            }`}
          >
            <Headphones className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{is8dEnabled ? '8D Audio On' : '8D Audio'}</span>
          </button>
        </div>

        {/* Fine-grained 2-Song Cut Mashup Options */}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={onToggleAutoDjMode}
            title="Switch between cutting 2 loaded songs back & forth or cycling through Queue"
            className={`min-h-[36px] rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              autoDjMode === 'two_song'
                ? 'border-emerald-400/50 bg-emerald-400/12 text-emerald-300'
                : 'border-white/10 bg-[#1A1E28] text-[#9CA3AF] hover:text-[#F1F3F5]'
            }`}
          >
            {autoDjMode === 'two_song' ? '2-Song Cut' : 'Queue Mix'}
          </button>
          <button
            type="button"
            onClick={onToggleAutoDjInterval}
            title="Switch auto cut timer between 12 seconds and 20 seconds"
            className="min-h-[36px] rounded-lg border border-white/10 bg-[#1A1E28] px-2 py-1 text-[11px] font-mono-tabular font-medium text-[#D1D5DB] hover:bg-[#232836] transition-colors cursor-pointer whitespace-nowrap"
          >
            Every {autoDjIntervalSec}s
          </button>
          <button
            type="button"
            onClick={onInstantMashupCut}
            disabled={isAutoTransitioning}
            title="Cut & blend into the other song right now"
            className="min-h-[36px] rounded-lg border border-amber-500/35 bg-amber-500/12 px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/22 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-45"
          >
            Cut Now
          </button>
        </div>
      </div>

      {/* Master Gain & Live FX Pads */}
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-mono-tabular">
            <span className="inline-flex items-center gap-1.5 text-[#9CA3AF]">
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              Master Output
            </span>
            <span className="text-[#F1F3F5]">{Math.round(masterVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => onMasterVolumeChange(Number(e.target.value))}
            aria-label="Master Output Volume"
            className="dj-slider dj-slider-amber w-full"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-[#9CA3AF]">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Zap className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              DJ Soundboard FX
            </span>
            <span>Instant Drop</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onTriggerFx('bass_drop')}
              className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-white/10 bg-[#1A1E28] px-3 py-2 text-xs font-medium text-[#F1F3F5] hover:border-amber-500/40 hover:bg-[#232836] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
            >
              Bass Drop
            </button>
            <button
              type="button"
              onClick={() => onTriggerFx('airhorn')}
              className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-white/10 bg-[#1A1E28] px-3 py-2 text-xs font-medium text-[#F1F3F5] hover:border-amber-500/40 hover:bg-[#232836] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
            >
              DJ Airhorn
            </button>
            <button
              type="button"
              onClick={() => onTriggerFx('riser')}
              className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-white/10 bg-[#1A1E28] px-3 py-2 text-xs font-medium text-[#F1F3F5] hover:border-sky-400/40 hover:bg-[#232836] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
            >
              Club Riser
            </button>
            <button
              type="button"
              onClick={() => onTriggerFx('scratch')}
              className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-white/10 bg-[#1A1E28] px-3 py-2 text-xs font-medium text-[#F1F3F5] hover:border-sky-400/40 hover:bg-[#232836] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
            >
              Vinyl Scratch
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
