export type DjModeId =
  | 'banger'
  | 'dance'
  | 'romance'
  | 'chill'
  | 'shaadi'
  | '90s'
  | 'bhojpuri'
  | 'haryanvi'
  | 'punjabi'
  | 'tamil'
  | 'global'
  | 'edm'
  | 'hiphop'
  | 'latin'
  | 'kpop'
  | 'arabic';

export type OfflineBeatId = 'dholki' | 'club' | 'lofi90s' | 'punjabitrap';

export interface DjModeOption {
  id: DjModeId;
  label: string;
  tagline: string;
  category: 'desi' | 'world';
  defaultBassBoostDb: number;
  defaultPitch: number;
  bangerActive: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  audioUrl: string;
  previewUrl: string;
  durationSec: number;
  releaseYear: string;
  genre: string;
  modeTag: DjModeId;
  bpm: number;
  musicalKey: string;
  source: 'saavn' | 'audius';
}

export interface OfflineTrack extends Track {
  savedAt: number;
  sizeBytes: number;
}

export type DeckId = 'A' | 'B';

export interface DeckEq {
  low: number; // -12 to +12 dB
  mid: number; // -12 to +12 dB
  high: number; // -12 to +12 dB
  filter: number; // -1 (LPF) to 0 (flat) to +1 (HPF)
}

export interface DeckState {
  deckId: DeckId;
  track: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number; // 0 to 1
  pitch: number; // 0.8 to 1.25
  loop: boolean;
  eq: DeckEq;
  error: string | null;
}

export interface MixerPreset {
  bassBoostDb: number;
  targetPitch: number;
  crossfadeDurationSec: number;
  bangerMode: boolean;
}

export interface AiCrateInfo {
  setTitle: string;
  djNote: string;
  recommendedMode: DjModeId;
  searchQueries: string[];
  autoPlayFirst: boolean;
}

export interface AiFilterResponse {
  crate: AiCrateInfo;
  mixerPreset: MixerPreset;
  tracks: Track[];
}

export interface AiSuggestedTrack {
  track: Track;
  aiReason: string;
}

export interface AiSuggestResponse {
  headline: string;
  suggestions: AiSuggestedTrack[];
}
