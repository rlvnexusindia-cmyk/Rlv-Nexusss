import type { DeckEq, DeckId } from '../types/music';

export type DjFxType = 'bass_drop' | 'airhorn' | 'riser' | 'scratch';

interface DeckAudioGraph {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  lowFilter: BiquadFilterNode | null;
  midFilter: BiquadFilterNode | null;
  highFilter: BiquadFilterNode | null;
  sweepFilter: BiquadFilterNode | null;
  channelGain: GainNode | null;
  crossfadeGain: GainNode | null;
  volume: number;
}

class DjAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bangerLowShelf: BiquadFilterNode | null = null;
  private bangerHighShelf: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyBuffer: Uint8Array<ArrayBuffer> | null = null;
  private crossfadeValue = 0.5; // 0 = A, 0.5 = Center, 1 = B
  private masterVolume = 0.9;
  private bangerEnabled = false;

  private decks: Record<DeckId, DeckAudioGraph>;

  constructor() {
    this.decks = {
      A: this.createDeckGraph(),
      B: this.createDeckGraph(),
    };
  }

  private createDeckGraph(): DeckAudioGraph {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    return {
      audio,
      source: null,
      lowFilter: null,
      midFilter: null,
      highFilter: null,
      sweepFilter: null,
      channelGain: null,
      crossfadeGain: null,
      volume: 0.9,
    };
  }

  public async ensureContext(): Promise<void> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.bangerLowShelf = this.ctx.createBiquadFilter();
      this.bangerLowShelf.type = 'lowshelf';
      this.bangerLowShelf.frequency.value = 95;
      this.bangerLowShelf.gain.value = this.bangerEnabled ? 6.5 : 0;

      this.bangerHighShelf = this.ctx.createBiquadFilter();
      this.bangerHighShelf.type = 'highshelf';
      this.bangerHighShelf.frequency.value = 9000;
      this.bangerHighShelf.gain.value = this.bangerEnabled ? 2.5 : 0;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.78;
      this.frequencyBuffer = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

      this.bangerLowShelf.connect(this.bangerHighShelf);
      this.bangerHighShelf.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.wireDeckToGraph('A');
      this.wireDeckToGraph('B');
      this.applyCrossfade();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  private wireDeckToGraph(deckId: DeckId): void {
    if (!this.ctx || !this.bangerLowShelf) return;
    const deck = this.decks[deckId];
    if (deck.source) return;

    try {
      const source = this.ctx.createMediaElementSource(deck.audio);
      const lowFilter = this.ctx.createBiquadFilter();
      lowFilter.type = 'lowshelf';
      lowFilter.frequency.value = 120;
      lowFilter.gain.value = 0;

      const midFilter = this.ctx.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 1.0;
      midFilter.gain.value = 0;

      const highFilter = this.ctx.createBiquadFilter();
      highFilter.type = 'highshelf';
      highFilter.frequency.value = 7200;
      highFilter.gain.value = 0;

      const sweepFilter = this.ctx.createBiquadFilter();
      sweepFilter.type = 'allpass';
      sweepFilter.frequency.value = 1000;
      sweepFilter.Q.value = 1.2;

      const channelGain = this.ctx.createGain();
      channelGain.gain.value = deck.volume;

      const crossfadeGain = this.ctx.createGain();
      crossfadeGain.gain.value = 1;

      source.connect(lowFilter);
      lowFilter.connect(midFilter);
      midFilter.connect(highFilter);
      highFilter.connect(sweepFilter);
      sweepFilter.connect(channelGain);
      channelGain.connect(crossfadeGain);
      crossfadeGain.connect(this.bangerLowShelf);

      deck.source = source;
      deck.lowFilter = lowFilter;
      deck.midFilter = midFilter;
      deck.highFilter = highFilter;
      deck.sweepFilter = sweepFilter;
      deck.channelGain = channelGain;
      deck.crossfadeGain = crossfadeGain;
    } catch {
      // Fallback: audio element still plays directly via native output
    }
  }

  public getAudioElement(deckId: DeckId): HTMLAudioElement {
    return this.decks[deckId].audio;
  }

  public async loadAndPlay(deckId: DeckId, audioUrl: string, pitch = 1, loop = false): Promise<void> {
    await this.ensureContext();
    const deck = this.decks[deckId];
    deck.audio.src = audioUrl;
    deck.audio.loop = loop;
    deck.audio.playbackRate = pitch;
    deck.audio.currentTime = 0;
    await deck.audio.play();
  }

  public async play(deckId: DeckId): Promise<void> {
    await this.ensureContext();
    await this.decks[deckId].audio.play();
  }

  public pause(deckId: DeckId): void {
    this.decks[deckId].audio.pause();
  }

  public seek(deckId: DeckId, timeSec: number): void {
    const audio = this.decks[deckId].audio;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.max(0, Math.min(audio.duration, timeSec));
    }
  }

  public setPitch(deckId: DeckId, pitch: number): void {
    const clamped = Math.max(0.75, Math.min(1.3, pitch));
    this.decks[deckId].audio.playbackRate = clamped;
  }

  public setLoop(deckId: DeckId, loop: boolean): void {
    this.decks[deckId].audio.loop = loop;
  }

  public setChannelVolume(deckId: DeckId, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    const deck = this.decks[deckId];
    deck.volume = clamped;
    if (deck.channelGain && this.ctx) {
      deck.channelGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    } else {
      deck.audio.volume = clamped;
    }
  }

  public setDeckEq(deckId: DeckId, eq: DeckEq): void {
    const deck = this.decks[deckId];
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (deck.lowFilter) deck.lowFilter.gain.setTargetAtTime(eq.low, now, 0.02);
    if (deck.midFilter) deck.midFilter.gain.setTargetAtTime(eq.mid, now, 0.02);
    if (deck.highFilter) deck.highFilter.gain.setTargetAtTime(eq.high, now, 0.02);

    if (deck.sweepFilter) {
      if (Math.abs(eq.filter) < 0.05) {
        deck.sweepFilter.type = 'allpass';
        deck.sweepFilter.Q.setTargetAtTime(0.7, now, 0.02);
      } else if (eq.filter < 0) {
        // Low-pass sweep: 20kHz down to 220Hz
        deck.sweepFilter.type = 'lowpass';
        const norm = 1 + eq.filter; // 0 to 1
        const freq = 220 * Math.pow(90, norm);
        deck.sweepFilter.frequency.setTargetAtTime(Math.min(18000, freq), now, 0.03);
        deck.sweepFilter.Q.setTargetAtTime(2.8, now, 0.03);
      } else {
        // High-pass sweep: 60Hz up to 4200Hz
        deck.sweepFilter.type = 'highpass';
        const freq = 60 * Math.pow(70, eq.filter);
        deck.sweepFilter.frequency.setTargetAtTime(Math.min(4500, freq), now, 0.03);
        deck.sweepFilter.Q.setTargetAtTime(2.5, now, 0.03);
      }
    }
  }

  public setCrossfader(value: number): void {
    this.crossfadeValue = Math.max(0, Math.min(1, value));
    this.applyCrossfade();
  }

  private applyCrossfade(): void {
    // Equal-power crossfade curve so center (0.5) keeps rich energy
    const angle = this.crossfadeValue * (Math.PI / 2);
    const gainA = Math.min(1, Math.cos(angle) * 1.15);
    const gainB = Math.min(1, Math.sin(angle) * 1.15);

    if (this.ctx && this.decks.A.crossfadeGain && this.decks.B.crossfadeGain) {
      const now = this.ctx.currentTime;
      this.decks.A.crossfadeGain.gain.setTargetAtTime(gainA, now, 0.02);
      this.decks.B.crossfadeGain.gain.setTargetAtTime(gainB, now, 0.02);
    } else {
      this.decks.A.audio.volume = this.decks.A.volume * gainA * this.masterVolume;
      this.decks.B.audio.volume = this.decks.B.volume * gainB * this.masterVolume;
    }
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.02);
    } else {
      this.applyCrossfade();
    }
  }

  public setBangerMode(enabled: boolean): void {
    this.bangerEnabled = enabled;
    if (!this.ctx || !this.bangerLowShelf || !this.bangerHighShelf) return;
    const now = this.ctx.currentTime;
    this.bangerLowShelf.gain.setTargetAtTime(enabled ? 6.5 : 0, now, 0.05);
    this.bangerHighShelf.gain.setTargetAtTime(enabled ? 2.5 : 0, now, 0.05);
  }

  public getFrequencyData(): Uint8Array | null {
    if (!this.analyser || !this.frequencyBuffer) return null;
    this.analyser.getByteFrequencyData(this.frequencyBuffer);
    return this.frequencyBuffer;
  }

  public async triggerFx(type: DjFxType): Promise<void> {
    await this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (type === 'bass_drop') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.95);
      gain.gain.setValueAtTime(0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.1);
    } else if (type === 'airhorn') {
      const freqs = [440, 554.37, 659.25];
      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.linearRampToValueAtTime(f * 0.96, now + 0.48);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now);
        osc.stop(now + 0.54);
      });
    } else if (type === 'riser') {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 1.1);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.exponentialRampToValueAtTime(3200, now + 1.1);
      filter.Q.value = 3;
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.linearRampToValueAtTime(0.32, now + 0.95);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.2);
    } else if (type === 'scratch') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.linearRampToValueAtTime(180, now + 0.08);
      osc.frequency.linearRampToValueAtTime(520, now + 0.16);
      osc.frequency.linearRampToValueAtTime(120, now + 0.25);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.28);
    }
  }

  private offlineBeatTimer: number | null = null;
  private offlineBeatStep = 0;

  public stopOfflineBeat(): void {
    if (this.offlineBeatTimer !== null) {
      window.clearInterval(this.offlineBeatTimer);
      this.offlineBeatTimer = null;
    }
    this.offlineBeatStep = 0;
  }

  public async startOfflineBeat(beatId: 'dholki' | 'club' | 'lofi90s' | 'punjabitrap'): Promise<void> {
    this.stopOfflineBeat();
    await this.ensureContext();
    if (!this.ctx || !this.bangerLowShelf) return;

    const bpm = beatId === 'dholki' ? 128 : beatId === 'club' ? 130 : beatId === 'lofi90s' ? 88 : 108;
    const stepMs = (60 / bpm / 2) * 1000; // 8th note steps
    const ctx = this.ctx;
    const targetNode = this.bangerLowShelf;

    const playStep = () => {
      const now = ctx.currentTime;
      const step = this.offlineBeatStep % 8;
      this.offlineBeatStep += 1;

      // Kick drum
      const isKick =
        beatId === 'club'
          ? step % 2 === 0
          : beatId === 'dholki'
            ? step === 0 || step === 3 || step === 4 || step === 6
            : beatId === 'punjabitrap'
              ? step === 0 || step === 3 || step === 6
              : step === 0 || step === 4;

      if (isKick) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(beatId === 'lofi90s' ? 95 : 135, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
        gain.gain.setValueAtTime(0.65, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(targetNode);
        osc.start(now);
        osc.stop(now + 0.2);
      }

      // Snare / Dhol slap on off-beats
      if (step === 2 || step === 6 || (beatId === 'dholki' && step === 7)) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = beatId === 'dholki' ? 'triangle' : 'square';
        osc.frequency.setValueAtTime(beatId === 'dholki' ? 240 : 190, now);
        osc.frequency.exponentialRampToValueAtTime(95, now + 0.08);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(targetNode);
        osc.start(now);
        osc.stop(now + 0.11);
      }

      // Melody / Bassline synth
      const scale =
        beatId === 'dholki'
          ? [220, 261.63, 293.66, 329.63, 293.66, 261.63, 220, 196]
          : beatId === 'punjabitrap'
            ? [146.83, 146.83, 174.61, 196, 146.83, 220, 196, 174.61]
            : beatId === 'lofi90s'
              ? [261.63, 329.63, 392, 493.88, 392, 329.63, 293.66, 246.94]
              : [110, 110, 164.81, 146.83, 110, 130.81, 146.83, 196];

      const noteFreq = scale[step];
      if (noteFreq && (beatId !== 'club' || step % 2 === 1)) {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = beatId === 'lofi90s' ? 'sine' : beatId === 'punjabitrap' ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(noteFreq, now);
        filter.type = 'lowpass';
        filter.frequency.value = beatId === 'lofi90s' ? 900 : 1800;
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (stepMs / 1000) * 0.9);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(targetNode);
        osc.start(now);
        osc.stop(now + (stepMs / 1000));
      }
    };

    playStep();
    this.offlineBeatTimer = window.setInterval(playStep, stepMs);
  }
}

export const djAudioEngine = new DjAudioEngine();
