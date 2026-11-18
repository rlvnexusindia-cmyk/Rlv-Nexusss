import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { djAudioEngine, type DjFxType } from './audio/djAudioEngine';
import { AiSmartFilter } from './components/AiSmartFilter';
import { AiSuggestionsPanel } from './components/AiSuggestionsPanel';
import { DjDeck } from './components/DjDeck';
import { HomeScreen } from './components/HomeScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { MasterMixer } from './components/MasterMixer';
import { MobileBottomNav, type MobileNavTarget } from './components/MobileBottomNav';
import { ModeAndTrackBrowser } from './components/ModeAndTrackBrowser';
import { QueuePanel } from './components/QueuePanel';
import { TopBar, type AppView } from './components/TopBar';
import { DJ_MODES } from './data/modes';
import {
  getOfflineAudioUrl,
  getOfflineTracks,
  removeOfflineTrack,
  saveTrackOffline,
  triggerDeviceDownload,
} from './storage/offlineVault';
import type {
  AiCrateInfo,
  AiFilterResponse,
  AiSuggestedTrack,
  AiSuggestResponse,
  DeckEq,
  DeckId,
  DeckState,
  DjModeId,
  MixerPreset,
  OfflineBeatId,
  OfflineTrack,
  Track,
} from './types/music';
import { containsMarathiMarker, isMarathiTrackMeta } from './utils/marathiFilter';

const DEFAULT_EQ: DeckEq = {
  low: 0,
  mid: 0,
  high: 0,
  filter: 0,
};

function createInitialDeck(deckId: DeckId): DeckState {
  return {
    deckId,
    track: null,
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 30,
    volume: 0.9,
    pitch: 1.0,
    loop: false,
    eq: { ...DEFAULT_EQ },
    error: null,
  };
}

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [initialReady, setInitialReady] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<AppView>('home');

  const [deckA, setDeckA] = useState<DeckState>(() => createInitialDeck('A'));
  const [deckB, setDeckB] = useState<DeckState>(() => createInitialDeck('B'));

  const [crossfade, setCrossfade] = useState<number>(0);
  const [masterVolume, setMasterVolume] = useState<number>(0.9);
  const [bangerMode, setBangerMode] = useState<boolean>(true);
  const [autoMixEnabled, setAutoMixEnabled] = useState<boolean>(true);
  const [isAutoTransitioning, setIsAutoTransitioning] = useState<boolean>(false);

  const [mobileDeckTab, setMobileDeckTab] = useState<'A' | 'MIXER' | 'B'>('A');
  const [mobileNavActive, setMobileNavActive] = useState<MobileNavTarget>('home');

  const [activeMode, setActiveMode] = useState<DjModeId>('banger');
  const [showOfflineTab, setShowOfflineTab] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState<boolean>(true);
  const [tracksError, setTracksError] = useState<string | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);

  // Offline Vault & Built-in Synth Beat state
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrack[]>([]);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [offlineStatusMsg, setOfflineStatusMsg] = useState<string | null>(null);
  const [activeOfflineBeat, setActiveOfflineBeat] = useState<OfflineBeatId | null>(null);

  // AI Filter state
  const [isAiFiltering, setIsAiFiltering] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeCrate, setActiveCrate] = useState<AiCrateInfo | null>(null);
  const [activePreset, setActivePreset] = useState<MixerPreset | null>(null);

  // AI Song Recommendations state
  const [suggestHeadline, setSuggestHeadline] = useState<string>('AI Suggested New Songs');
  const [suggestions, setSuggestions] = useState<AiSuggestedTrack[]>([]);
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestBasedOn, setSuggestBasedOn] = useState<string | null>(null);

  const offlineIds = useMemo(
    () => new Set(offlineTracks.map((t) => t.id)),
    [offlineTracks]
  );

  const crossfadeRef = useRef(crossfade);
  crossfadeRef.current = crossfade;
  const autoMixRef = useRef(autoMixEnabled);
  autoMixRef.current = autoMixEnabled;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const deckARef = useRef(deckA);
  deckARef.current = deckA;
  const deckBRef = useRef(deckB);
  deckBRef.current = deckB;
  const transitionRafRef = useRef<number>(0);
  const deckObjectUrlRef = useRef<Record<DeckId, string | null>>({ A: null, B: null });

  const updateDeck = useCallback((deckId: DeckId, updater: (prev: DeckState) => DeckState) => {
    if (deckId === 'A') {
      setDeckA(updater);
    } else {
      setDeckB(updater);
    }
  }, []);

  const resolvePlayableSource = useCallback(async (deckId: DeckId, track: Track): Promise<string> => {
    if (deckObjectUrlRef.current[deckId]) {
      URL.revokeObjectURL(deckObjectUrlRef.current[deckId]!);
      deckObjectUrlRef.current[deckId] = null;
    }
    const offlineUrl = await getOfflineAudioUrl(track.id);
    if (offlineUrl) {
      deckObjectUrlRef.current[deckId] = offlineUrl;
      return offlineUrl;
    }
    return track.audioUrl;
  }, []);

  const loadTrackToDeck = useCallback(
    async (deckId: DeckId, track: Track, autoPlay = false, overridePitch?: number) => {
      if (isMarathiTrackMeta(track)) {
        updateDeck(deckId, (prev) => ({
          ...prev,
          error: 'Marathi tracks are blocked on Rintu Bit DJ.',
        }));
        return;
      }

      const currentDeck = deckId === 'A' ? deckARef.current : deckBRef.current;
      const pitchToUse = overridePitch ?? currentDeck.pitch;
      const audio = djAudioEngine.getAudioElement(deckId);

      updateDeck(deckId, (prev) => ({
        ...prev,
        track,
        isLoading: autoPlay,
        currentTime: 0,
        duration: track.durationSec || 30,
        pitch: pitchToUse,
        error: null,
      }));

      const sourceUrl = await resolvePlayableSource(deckId, track);

      if (autoPlay) {
        try {
          djAudioEngine.stopOfflineBeat();
          setActiveOfflineBeat(null);
          await djAudioEngine.loadAndPlay(deckId, sourceUrl, pitchToUse, currentDeck.loop);
          djAudioEngine.setDeckEq(deckId, currentDeck.eq);
          djAudioEngine.setChannelVolume(deckId, currentDeck.volume);
          updateDeck(deckId, (prev) => ({
            ...prev,
            isPlaying: true,
            isLoading: false,
            error: null,
          }));
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Unable to play this track preview.';
          updateDeck(deckId, (prev) => ({
            ...prev,
            isPlaying: false,
            isLoading: false,
            error: message,
          }));
        }
      } else {
        audio.src = sourceUrl;
        audio.playbackRate = pitchToUse;
        audio.loop = currentDeck.loop;
        audio.currentTime = 0;
        updateDeck(deckId, (prev) => ({
          ...prev,
          isPlaying: false,
          isLoading: false,
        }));
      }
    },
    [resolvePlayableSource, updateDeck]
  );

  const handleCrossfadeChange = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setCrossfade(clamped);
    djAudioEngine.setCrossfader(clamped);
  }, []);

  const triggerSmoothCrossfade = useCallback(
    async (targetDeckId?: DeckId, durationMs = 3200) => {
      if (transitionRafRef.current) {
        cancelAnimationFrame(transitionRafRef.current);
      }

      const startCrossfade = crossfadeRef.current;
      const toDeck: DeckId = targetDeckId ?? (startCrossfade < 0.5 ? 'B' : 'A');
      const fromDeck: DeckId = toDeck === 'A' ? 'B' : 'A';
      const endCrossfade = toDeck === 'A' ? 0 : 1;

      const targetState = toDeck === 'A' ? deckARef.current : deckBRef.current;

      if (!targetState.track && queueRef.current.length > 0) {
        const [nextTrack, ...rest] = queueRef.current;
        setQueue(rest);
        await loadTrackToDeck(toDeck, nextTrack, true);
      } else if (targetState.track && !targetState.isPlaying) {
        try {
          await djAudioEngine.play(toDeck);
          updateDeck(toDeck, (p) => ({ ...p, isPlaying: true, error: null }));
        } catch {
          // Ignore play failure during transition
        }
      }

      setIsAutoTransitioning(true);
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const currentVal = startCrossfade + (endCrossfade - startCrossfade) * eased;
        handleCrossfadeChange(currentVal);

        if (t < 1) {
          transitionRafRef.current = requestAnimationFrame(step);
        } else {
          setIsAutoTransitioning(false);
          djAudioEngine.pause(fromDeck);
          updateDeck(fromDeck, (p) => ({ ...p, isPlaying: false }));

          if (queueRef.current.length > 0) {
            const [upcoming, ...remaining] = queueRef.current;
            setQueue(remaining);
            void loadTrackToDeck(fromDeck, upcoming, false);
          }
        }
      };

      transitionRafRef.current = requestAnimationFrame(step);
    },
    [handleCrossfadeChange, loadTrackToDeck, updateDeck]
  );

  // Sync HTMLAudioElement events
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    (['A', 'B'] as DeckId[]).forEach((deckId) => {
      const audio = djAudioEngine.getAudioElement(deckId);

      const onTimeUpdate = () => {
        updateDeck(deckId, (prev) => ({
          ...prev,
          currentTime: audio.currentTime,
        }));
      };

      const onLoadedMeta = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          updateDeck(deckId, (prev) => ({
            ...prev,
            duration: audio.duration,
          }));
        }
      };

      const onPlay = () => {
        updateDeck(deckId, (prev) => ({ ...prev, isPlaying: true, isLoading: false }));
      };

      const onPause = () => {
        updateDeck(deckId, (prev) => ({ ...prev, isPlaying: false }));
      };

      const onEnded = () => {
        updateDeck(deckId, (prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
        if (autoMixRef.current) {
          const otherDeck: DeckId = deckId === 'A' ? 'B' : 'A';
          const otherState = otherDeck === 'A' ? deckARef.current : deckBRef.current;
          if (otherState.track || queueRef.current.length > 0) {
            void triggerSmoothCrossfade(otherDeck, 2600);
          }
        }
      };

      const onError = () => {
        updateDeck(deckId, (prev) => ({
          ...prev,
          isPlaying: false,
          isLoading: false,
          error: prev.track ? 'Audio preview unavailable for this track.' : null,
        }));
      };

      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('loadedmetadata', onLoadedMeta);
      audio.addEventListener('play', onPlay);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);

      cleanups.push(() => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', onLoadedMeta);
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
      if (transitionRafRef.current) cancelAnimationFrame(transitionRafRef.current);
      djAudioEngine.stopOfflineBeat();
      if (deckObjectUrlRef.current.A) URL.revokeObjectURL(deckObjectUrlRef.current.A);
      if (deckObjectUrlRef.current.B) URL.revokeObjectURL(deckObjectUrlRef.current.B);
    };
  }, [triggerSmoothCrossfade, updateDeck]);

  useEffect(() => {
    djAudioEngine.setBangerMode(bangerMode);
  }, [bangerMode]);

  useEffect(() => {
    void getOfflineTracks().then((saved) => setOfflineTracks(saved));

    // Sync canonical URL & OpenGraph og:url dynamically
    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonicalUrl;

    let ogUrlMeta = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (!ogUrlMeta) {
      ogUrlMeta = document.createElement('meta');
      ogUrlMeta.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrlMeta);
    }
    ogUrlMeta.content = canonicalUrl;
  }, []);

  const fetchTracks = useCallback(
    async (mode: DjModeId, q = '', autoStageDecks = false, autoPlayFirst = false) => {
      if (q && containsMarathiMarker(q)) {
        setTracksError(
          'Marathi songs are blocked on Rintu Bit DJ. Search any other Indian or World song!'
        );
        return;
      }

      setIsLoadingTracks(true);
      setTracksError(null);
      try {
        const params = new URLSearchParams({ genre: mode });
        if (q) params.set('q', q);
        const res = await fetch(`/api/tracks?${params.toString()}`);
        const data = (await res.json()) as { tracks?: Track[]; error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load songs from music API.');
        }
        const fetched = (Array.isArray(data.tracks) ? data.tracks : []).filter(
          (t) => !isMarathiTrackMeta(t)
        );
        setTracks(fetched);

        if (autoStageDecks && fetched.length > 0) {
          if (fetched[0]) void loadTrackToDeck('A', fetched[0], autoPlayFirst);
          if (fetched[1]) void loadTrackToDeck('B', fetched[1], false);
          if (fetched.length > 2) setQueue(fetched.slice(2, 10));
        }
      } catch (err) {
        setTracksError(
          err instanceof Error ? err.message : 'Unable to reach music catalog API.'
        );
      } finally {
        setIsLoadingTracks(false);
        setInitialReady(true);
      }
    },
    [loadTrackToDeck]
  );

  useEffect(() => {
    void fetchTracks('banger', '', true, false);
  }, [fetchTracks]);

  const handleFetchAiSuggestions = useCallback(
    async (seedTrack?: Track | null) => {
      setIsSuggesting(true);
      setSuggestError(null);

      const activeTrack =
        seedTrack ??
        (crossfadeRef.current <= 0.5 ? deckARef.current.track : deckBRef.current.track) ??
        deckARef.current.track ??
        deckBRef.current.track;

      setSuggestBasedOn(activeTrack?.title ?? null);

      const recentTitles = [
        deckARef.current.track?.title,
        deckBRef.current.track?.title,
        ...queueRef.current.slice(0, 6).map((t) => t.title),
        ...suggestions.map((s) => s.track.title),
      ].filter((t): t is string => Boolean(t));

      try {
        const res = await fetch('/api/ai/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentTrack: activeTrack
              ? {
                  title: activeTrack.title,
                  artist: activeTrack.artist,
                  genre: activeTrack.genre,
                  bpm: activeTrack.bpm,
                }
              : undefined,
            activeMode,
            recentTitles,
          }),
        });
        const data = (await res.json()) as Partial<AiSuggestResponse> & { error?: string };
        if (!res.ok || !Array.isArray(data.suggestions)) {
          throw new Error(data.error || 'Could not generate AI song suggestions.');
        }
        setSuggestHeadline(data.headline || 'AI Suggested New Songs');
        setSuggestions(data.suggestions.filter((s) => !isMarathiTrackMeta(s.track)));
      } catch (err) {
        setSuggestError(
          err instanceof Error ? err.message : 'Unable to get AI song suggestions right now.'
        );
      } finally {
        setIsSuggesting(false);
      }
    },
    [activeMode, suggestions]
  );

  const handleSelectMode = (mode: DjModeId) => {
    setShowOfflineTab(false);
    setActiveMode(mode);
    setSearchQuery('');
    const modeConfig = DJ_MODES.find((m) => m.id === mode);
    if (modeConfig) {
      setBangerMode(modeConfig.bangerActive);
    }
    void fetchTracks(mode, '', false, false);
  };

  const handleLaunchModeFromHome = (mode: DjModeId, autoPlayFirst = true) => {
    setShowOfflineTab(false);
    setActiveMode(mode);
    setSearchQuery('');
    const modeConfig = DJ_MODES.find((m) => m.id === mode);
    if (modeConfig) {
      setBangerMode(modeConfig.bangerActive);
    }
    setActiveView('console');
    setMobileNavActive('console');
    setMobileDeckTab('A');
    handleCrossfadeChange(0);
    void fetchTracks(mode, '', true, autoPlayFirst);
  };

  const handleSearchFromHome = (q: string) => {
    setShowOfflineTab(false);
    setSearchQuery(q);
    setActiveView('console');
    setMobileNavActive('console');
    setMobileDeckTab('A');
    handleCrossfadeChange(0);
    void fetchTracks(activeMode, q, true, true);
  };

  const handleSearchSubmit = (q: string) => {
    setShowOfflineTab(false);
    setSearchQuery(q);
    void fetchTracks(activeMode, q, false, false);
  };

  const handlePlayNow = async (track: Track) => {
    const targetDeck: DeckId = crossfadeRef.current <= 0.5 ? 'A' : 'B';
    await loadTrackToDeck(targetDeck, track, true);
  };

  const handleTogglePlay = async (deckId: DeckId) => {
    const state = deckId === 'A' ? deckARef.current : deckBRef.current;
    if (!state.track) return;

    if (state.isPlaying) {
      djAudioEngine.pause(deckId);
    } else {
      try {
        djAudioEngine.stopOfflineBeat();
        setActiveOfflineBeat(null);
        const audio = djAudioEngine.getAudioElement(deckId);
        if (!audio.src) {
          await loadTrackToDeck(deckId, state.track, true);
        } else {
          await djAudioEngine.play(deckId);
          djAudioEngine.setDeckEq(deckId, state.eq);
          djAudioEngine.setChannelVolume(deckId, state.volume);
        }
      } catch (err) {
        updateDeck(deckId, (prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Playback blocked or unavailable.',
        }));
      }
    }
  };

  const handleCueRestart = async (deckId: DeckId) => {
    const state = deckId === 'A' ? deckARef.current : deckBRef.current;
    if (!state.track) return;
    djAudioEngine.seek(deckId, 0);
    if (!state.isPlaying) {
      await handleTogglePlay(deckId);
    }
  };

  const handleToggleLoop = (deckId: DeckId) => {
    updateDeck(deckId, (prev) => {
      const nextLoop = !prev.loop;
      djAudioEngine.setLoop(deckId, nextLoop);
      return { ...prev, loop: nextLoop };
    });
  };

  const handleSeek = (deckId: DeckId, timeSec: number) => {
    djAudioEngine.seek(deckId, timeSec);
    updateDeck(deckId, (prev) => ({ ...prev, currentTime: timeSec }));
  };

  const handleVolumeChange = (deckId: DeckId, val: number) => {
    djAudioEngine.setChannelVolume(deckId, val);
    updateDeck(deckId, (prev) => ({ ...prev, volume: val }));
  };

  const handlePitchChange = (deckId: DeckId, val: number) => {
    djAudioEngine.setPitch(deckId, val);
    updateDeck(deckId, (prev) => ({ ...prev, pitch: val }));
  };

  const handleEqChange = (deckId: DeckId, key: keyof DeckEq, val: number) => {
    updateDeck(deckId, (prev) => {
      const nextEq = { ...prev.eq, [key]: val };
      djAudioEngine.setDeckEq(deckId, nextEq);
      return { ...prev, eq: nextEq };
    });
  };

  const handleResetEq = (deckId: DeckId) => {
    const reset: DeckEq = { ...DEFAULT_EQ };
    djAudioEngine.setDeckEq(deckId, reset);
    djAudioEngine.setPitch(deckId, 1.0);
    updateDeck(deckId, (prev) => ({ ...prev, eq: reset, pitch: 1.0 }));
  };

  const handleLoadNextToDeck = (deckId: DeckId) => {
    if (queue.length === 0) return;
    const [nextTrack, ...rest] = queue;
    setQueue(rest);
    const shouldAutoPlay = deckId === 'A' ? deckA.isPlaying : deckB.isPlaying;
    void loadTrackToDeck(deckId, nextTrack, shouldAutoPlay);
  };

  const handleMasterVolumeChange = (val: number) => {
    setMasterVolume(val);
    djAudioEngine.setMasterVolume(val);
  };

  const handleTriggerFx = (fx: DjFxType) => {
    void djAudioEngine.triggerFx(fx);
  };

  const handleToggleOfflineBeat = (beatId: OfflineBeatId) => {
    if (activeOfflineBeat === beatId) {
      djAudioEngine.stopOfflineBeat();
      setActiveOfflineBeat(null);
      return;
    }
    djAudioEngine.pause('A');
    djAudioEngine.pause('B');
    setActiveOfflineBeat(beatId);
    void djAudioEngine.startOfflineBeat(beatId);
  };

  const handleSaveOffline = async (track: Track) => {
    if (offlineIds.has(track.id) || savingIds.has(track.id)) return;
    setSavingIds((prev) => {
      const next = new Set(prev);
      next.add(track.id);
      return next;
    });
    setOfflineStatusMsg(null);
    try {
      const saved = await saveTrackOffline(track);
      setOfflineTracks((prev) => [saved, ...prev.filter((t) => t.id !== saved.id)]);
      setOfflineStatusMsg(`Saved "${track.title}" for offline mixing.`);
    } catch (err) {
      setOfflineStatusMsg(
        err instanceof Error ? err.message : 'Unable to save track for offline use.'
      );
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  };

  const handleRemoveOffline = async (trackId: string) => {
    await removeOfflineTrack(trackId);
    setOfflineTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const handleDownloadFile = (track: Track) => {
    void triggerDeviceDownload(track);
    setOfflineStatusMsg(`Downloading "${track.title}" to your device.`);
  };

  const handleRunAiFilter = async (prompt: string) => {
    if (containsMarathiMarker(prompt)) {
      setAiError(
        'Marathi songs are blocked on Rintu Bit DJ. Ask for Hindi, 90s, Bhojpuri, Haryanvi, Punjabi, Tamil, or any World song!'
      );
      return;
    }

    setIsAiFiltering(true);
    setAiError(null);
    setShowOfflineTab(false);
    try {
      const res = await fetch('/api/ai/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, currentMode: activeMode }),
      });

      const data = (await res.json()) as Partial<AiFilterResponse> & { error?: string };
      if (!res.ok || !data.tracks || !data.crate || !data.mixerPreset) {
        throw new Error(data.error || 'AI filter request failed.');
      }

      const cleanTracks = data.tracks.filter((t) => !isMarathiTrackMeta(t));
      setActiveCrate(data.crate);
      setActivePreset(data.mixerPreset);
      setActiveMode(data.crate.recommendedMode);
      setSearchQuery('');
      setTracks(cleanTracks);
      setBangerMode(data.mixerPreset.bangerMode);

      const bassEq = Math.max(-6, Math.min(10, Math.round(data.mixerPreset.bassBoostDb)));
      const targetPitch = data.mixerPreset.targetPitch || 1.0;

      const aiEq: DeckEq = { low: bassEq, mid: 0, high: 1, filter: 0 };
      updateDeck('A', (prev) => ({ ...prev, eq: aiEq, pitch: targetPitch }));
      updateDeck('B', (prev) => ({ ...prev, eq: aiEq, pitch: targetPitch }));

      if (cleanTracks.length > 0) {
        djAudioEngine.pause('B');
        handleCrossfadeChange(0);
        setMobileDeckTab('A');
        await loadTrackToDeck('A', cleanTracks[0], true, targetPitch);
        djAudioEngine.setDeckEq('A', aiEq);

        if (cleanTracks[1]) {
          await loadTrackToDeck('B', cleanTracks[1], false, targetPitch);
          djAudioEngine.setDeckEq('B', aiEq);
        }
        setQueue(cleanTracks.slice(2));
      }
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Unable to run AI song filter right now.'
      );
    } finally {
      setIsAiFiltering(false);
    }
  };

  const handleNavigateConsoleSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleMobileNavSelect = (target: MobileNavTarget) => {
    setMobileNavActive(target);
    if (target === 'home') {
      setActiveView('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setActiveView('console');
    if (target === 'offline') {
      setShowOfflineTab(true);
      setTimeout(() => handleNavigateConsoleSection('catalog'), 50);
    } else {
      setTimeout(() => handleNavigateConsoleSection(target), 50);
    }
  };

  return (
    <div className="min-h-screen bg-[#090B10] text-[#F1F3F5] flex flex-col">
      {showSplash && (
        <LoadingScreen
          isReady={initialReady}
          onFinish={() => setShowSplash(false)}
        />
      )}

      <TopBar
        activeView={activeView}
        autoMixEnabled={autoMixEnabled}
        onSwitchView={(view) => {
          setActiveView(view);
          setMobileNavActive(view);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onToggleAutoMix={() => setAutoMixEnabled((v) => !v)}
        onNavigateConsoleSection={handleNavigateConsoleSection}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-3.5 py-5 pb-20 sm:px-6 md:pb-8 space-y-6">
        {activeView === 'home' ? (
          <HomeScreen
            offlineCount={offlineTracks.length}
            activeOfflineBeat={activeOfflineBeat}
            onOpenConsole={() => {
              setActiveView('console');
              setMobileNavActive('console');
            }}
            onLaunchMode={handleLaunchModeFromHome}
            onGlobalSearch={handleSearchFromHome}
            onOpenOfflineVault={() => {
              setActiveView('console');
              setShowOfflineTab(true);
              setMobileNavActive('offline');
              setTimeout(() => handleNavigateConsoleSection('catalog'), 60);
            }}
            onToggleOfflineBeat={handleToggleOfflineBeat}
          />
        ) : (
          <>
            {/* Console Header + Mobile Deck Switcher */}
            <section id="console" aria-label="Dual-Deck DJ Mixing Console" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F1F3F5]">
                    Rintu Bit DJ Console
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-[#9CA3AF]">
                    Mix World &amp; Indian music (90s, Bhojpuri, Haryanvi, Punjabi, Tamil, EDM, Global) — Marathi blocked.
                  </p>
                </div>
                <div className="text-xs font-mono-tabular text-[#9CA3AF]">
                  <span>
                    Mode: {showOfflineTab ? 'Offline Vault' : DJ_MODES.find((m) => m.id === activeMode)?.label ?? activeMode}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>{bangerMode ? 'Bass Boost Active' : 'Balanced Studio EQ'}</span>
                </div>
              </div>

              {/* Mobile & Tablet Switcher for Deck A / Mixer / Deck B */}
              <div
                role="tablist"
                aria-label="Mobile DJ deck view switcher"
                className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/8 bg-[#12161F] p-1.5 lg:hidden"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileDeckTab === 'A'}
                  onClick={() => setMobileDeckTab('A')}
                  className={`min-h-[42px] rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    mobileDeckTab === 'A'
                      ? 'bg-amber-500 text-[#090B10]'
                      : 'text-[#9CA3AF] hover:text-[#F1F3F5]'
                  }`}
                >
                  Deck A {deckA.isPlaying ? '· Playing' : ''}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileDeckTab === 'MIXER'}
                  onClick={() => setMobileDeckTab('MIXER')}
                  className={`min-h-[42px] rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    mobileDeckTab === 'MIXER'
                      ? 'bg-[#F1F3F5] text-[#090B10]'
                      : 'text-[#9CA3AF] hover:text-[#F1F3F5]'
                  }`}
                >
                  Mixer &amp; FX
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileDeckTab === 'B'}
                  onClick={() => setMobileDeckTab('B')}
                  className={`min-h-[42px] rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    mobileDeckTab === 'B'
                      ? 'bg-sky-400 text-[#090B10]'
                      : 'text-[#9CA3AF] hover:text-[#F1F3F5]'
                  }`}
                >
                  Deck B {deckB.isPlaying ? '· Playing' : ''}
                </button>
              </div>

              {/* Dual Decks + Center Master Mixer */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                <div className={`lg:col-span-4 flex flex-col ${mobileDeckTab === 'A' ? 'block' : 'hidden lg:flex'}`}>
                  <DjDeck
                    deck={deckA}
                    isSavedOffline={deckA.track ? offlineIds.has(deckA.track.id) : false}
                    isSavingOffline={deckA.track ? savingIds.has(deckA.track.id) : false}
                    onTogglePlay={() => void handleTogglePlay('A')}
                    onCueRestart={() => void handleCueRestart('A')}
                    onToggleLoop={() => handleToggleLoop('A')}
                    onSeek={(t) => handleSeek('A', t)}
                    onVolumeChange={(v) => handleVolumeChange('A', v)}
                    onPitchChange={(p) => handlePitchChange('A', p)}
                    onEqChange={(k, v) => handleEqChange('A', k, v)}
                    onResetEq={() => handleResetEq('A')}
                    onLoadNextFromQueue={() => handleLoadNextToDeck('A')}
                    onSaveOffline={(t) => void handleSaveOffline(t)}
                    onDownloadFile={handleDownloadFile}
                    onSuggestSimilar={(t) => {
                      void handleFetchAiSuggestions(t);
                      handleNavigateConsoleSection('ai-picks');
                    }}
                    hasQueue={queue.length > 0}
                  />
                </div>

                <div className={`lg:col-span-4 flex flex-col ${mobileDeckTab === 'MIXER' ? 'block' : 'hidden lg:flex'}`}>
                  <MasterMixer
                    crossfade={crossfade}
                    masterVolume={masterVolume}
                    bangerMode={bangerMode}
                    isAnyPlaying={deckA.isPlaying || deckB.isPlaying || activeOfflineBeat !== null}
                    isAutoTransitioning={isAutoTransitioning}
                    onCrossfadeChange={handleCrossfadeChange}
                    onMasterVolumeChange={handleMasterVolumeChange}
                    onToggleBangerMode={() => setBangerMode((b) => !b)}
                    onTriggerCrossfadeMix={() => void triggerSmoothCrossfade()}
                    onTriggerFx={handleTriggerFx}
                  />
                </div>

                <div className={`lg:col-span-4 flex flex-col ${mobileDeckTab === 'B' ? 'block' : 'hidden lg:flex'}`}>
                  <DjDeck
                    deck={deckB}
                    isSavedOffline={deckB.track ? offlineIds.has(deckB.track.id) : false}
                    isSavingOffline={deckB.track ? savingIds.has(deckB.track.id) : false}
                    onTogglePlay={() => void handleTogglePlay('B')}
                    onCueRestart={() => void handleCueRestart('B')}
                    onToggleLoop={() => handleToggleLoop('B')}
                    onSeek={(t) => handleSeek('B', t)}
                    onVolumeChange={(v) => handleVolumeChange('B', v)}
                    onPitchChange={(p) => handlePitchChange('B', p)}
                    onEqChange={(k, v) => handleEqChange('B', k, v)}
                    onResetEq={() => handleResetEq('B')}
                    onLoadNextFromQueue={() => handleLoadNextToDeck('B')}
                    onSaveOffline={(t) => void handleSaveOffline(t)}
                    onDownloadFile={handleDownloadFile}
                    onSuggestSimilar={(t) => {
                      void handleFetchAiSuggestions(t);
                      handleNavigateConsoleSection('ai-picks');
                    }}
                    hasQueue={queue.length > 0}
                  />
                </div>
              </div>
            </section>

            {/* Offline / Download Feedback Banner */}
            {offlineStatusMsg && (
              <div
                role="status"
                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200"
              >
                <span>{offlineStatusMsg}</span>
                <button
                  type="button"
                  onClick={() => setOfflineStatusMsg(null)}
                  className="text-emerald-300 hover:text-white font-medium cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* AI Smart Filter Section */}
            <AiSmartFilter
              isFiltering={isAiFiltering}
              error={aiError}
              activeCrate={activeCrate}
              activePreset={activePreset}
              onRunAiFilter={(p) => void handleRunAiFilter(p)}
            />

            {/* AI New Song Recommendations Section */}
            <AiSuggestionsPanel
              headline={suggestHeadline}
              suggestions={suggestions}
              isLoading={isSuggesting}
              error={suggestError}
              basedOnTrackTitle={suggestBasedOn}
              offlineIds={offlineIds}
              savingIds={savingIds}
              onRefreshSuggestions={() => void handleFetchAiSuggestions()}
              onPlayNow={(t) => void handlePlayNow(t)}
              onLoadToDeck={(d, t) => void loadTrackToDeck(d, t, false)}
              onAddToQueue={(t) => setQueue((prev) => [...prev, t])}
              onSaveOffline={(t) => void handleSaveOffline(t)}
              onDownloadFile={handleDownloadFile}
            />

            {/* Genre Browser + Up Next Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8">
                <ModeAndTrackBrowser
                  activeMode={activeMode}
                  showOfflineTab={showOfflineTab}
                  searchQuery={searchQuery}
                  tracks={tracks}
                  offlineTracks={offlineTracks}
                  offlineIds={offlineIds}
                  savingIds={savingIds}
                  activeOfflineBeat={activeOfflineBeat}
                  isLoading={isLoadingTracks}
                  error={tracksError}
                  activeTrackIdA={deckA.track?.id ?? null}
                  activeTrackIdB={deckB.track?.id ?? null}
                  onSelectMode={handleSelectMode}
                  onSelectOfflineTab={() => setShowOfflineTab(true)}
                  onSearchSubmit={handleSearchSubmit}
                  onPlayNow={(t) => void handlePlayNow(t)}
                  onLoadToDeck={(d, t, auto) => void loadTrackToDeck(d, t, auto)}
                  onAddToQueue={(t) => setQueue((prev) => [...prev, t])}
                  onSaveOffline={(t) => void handleSaveOffline(t)}
                  onRemoveOffline={(id) => void handleRemoveOffline(id)}
                  onDownloadFile={handleDownloadFile}
                  onToggleOfflineBeat={handleToggleOfflineBeat}
                  onRetry={() => void fetchTracks(activeMode, searchQuery, false, false)}
                />
              </div>

              <div className="lg:col-span-4 lg:sticky lg:top-20">
                <QueuePanel
                  queue={queue}
                  onPlayQueueItem={(idx) => {
                    const selected = queue[idx];
                    if (!selected) return;
                    setQueue((prev) => prev.filter((_, i) => i !== idx));
                    void handlePlayNow(selected);
                  }}
                  onMoveUp={(idx) => {
                    if (idx <= 0) return;
                    setQueue((prev) => {
                      const copy = [...prev];
                      const item = copy[idx];
                      copy[idx] = copy[idx - 1];
                      copy[idx - 1] = item;
                      return copy;
                    });
                  }}
                  onRemove={(idx) => setQueue((prev) => prev.filter((_, i) => i !== idx))}
                  onClear={() => setQueue([])}
                  onMixNext={() => void triggerSmoothCrossfade()}
                />
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-white/8 bg-[#090B10] py-8 px-4 pb-24 md:pb-8 sm:px-6 mt-10">
        <div className="mx-auto max-w-[1440px] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <p className="font-display text-base font-bold text-[#F1F3F5]">
              Rintu Bit DJ
            </p>
            <p className="text-xs text-[#9CA3AF]">
              Built &amp; Powered by <span className="font-semibold text-amber-400">RLV Nexus</span> · World &amp; Indian Dual-Deck Music Studio
            </p>
          </div>

          <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-5 text-xs font-medium text-[#9CA3AF]">
            <button
              type="button"
              onClick={() => {
                setActiveView('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-[#F1F3F5] transition-colors cursor-pointer"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('console');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-[#F1F3F5] transition-colors cursor-pointer"
            >
              DJ Console
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('console');
                setTimeout(() => handleNavigateConsoleSection('ai-picks'), 50);
              }}
              className="hover:text-[#F1F3F5] transition-colors cursor-pointer"
            >
              AI Song Picks
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('console');
                setShowOfflineTab(true);
                setTimeout(() => handleNavigateConsoleSection('catalog'), 50);
              }}
              className="hover:text-[#F1F3F5] transition-colors cursor-pointer"
            >
              Offline Vault
            </button>
          </nav>

          <p className="text-xs text-[#6B7280]">
            © {new Date().getFullYear()} RLV Nexus. All rights reserved.
          </p>
        </div>
      </footer>

      <MobileBottomNav
        activeSection={mobileNavActive}
        offlineCount={offlineTracks.length}
        onSelect={handleMobileNavSelect}
      />
    </div>
  );
}
