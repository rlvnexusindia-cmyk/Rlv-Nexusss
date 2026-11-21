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
import { PartyBackdropOverlay } from './components/PartyBackdropOverlay';
import { QueuePanel } from './components/QueuePanel';
import { SongDetailModal } from './components/SongDetailModal';
import { TopBar, type AppView } from './components/TopBar';
import { DJ_MODES } from './data/modes';
import {
  buildClientAiFilterFallback,
  buildClientAiSuggestFallback,
  safeParseApiJson,
  searchPaginatedDirectCatalog,
  type CatalogBatchResult,
} from './services/clientCatalog';
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

function getInitialUrlState(): { view: AppView; mode: DjModeId; query: string } {
  if (typeof window === 'undefined') {
    return { view: 'home', mode: 'banger', query: '' };
  }
  const params = new URLSearchParams(window.location.search);
  const genreParam = params.get('genre') as DjModeId | null;
  const viewParam = params.get('view');
  const queryParam = (params.get('q') || '').trim();
  const validMode =
    genreParam && DJ_MODES.some((m) => m.id === genreParam) ? genreParam : 'banger';
  const view: AppView =
    viewParam === 'console' ||
    Boolean(queryParam) ||
    (genreParam && DJ_MODES.some((m) => m.id === genreParam))
      ? 'console'
      : 'home';
  return { view, mode: validMode, query: queryParam };
}

export default function App() {
  const [initialUrlState] = useState(getInitialUrlState);
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [initialReady, setInitialReady] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<AppView>(initialUrlState.view);

  const [deckA, setDeckA] = useState<DeckState>(() => createInitialDeck('A'));
  const [deckB, setDeckB] = useState<DeckState>(() => createInitialDeck('B'));

  const [crossfade, setCrossfade] = useState<number>(0);
  const [masterVolume, setMasterVolume] = useState<number>(0.9);
  const [bangerMode, setBangerMode] = useState<boolean>(true);
  const [partyLightsEnabled, setPartyLightsEnabled] = useState<boolean>(true);
  const [is8dEnabled, setIs8dEnabled] = useState<boolean>(false);
  const [autoMixEnabled, setAutoMixEnabled] = useState<boolean>(true);
  const [autoDj20s, setAutoDj20s] = useState<boolean>(false);
  const [autoDjMode, setAutoDjMode] = useState<'two_song' | 'playlist'>('two_song');
  const [autoDjIntervalSec, setAutoDjIntervalSec] = useState<12 | 20>(20);
  const [autoDjCountdown, setAutoDjCountdown] = useState<number>(20);
  const [isAutoTransitioning, setIsAutoTransitioning] = useState<boolean>(false);

  const [mobileDeckTab, setMobileDeckTab] = useState<'A' | 'MIXER' | 'B'>('A');
  const [mobileNavActive, setMobileNavActive] = useState<MobileNavTarget>(
    initialUrlState.view === 'console' ? 'console' : 'home'
  );

  const [activeMode, setActiveMode] = useState<DjModeId>(initialUrlState.mode);
  const [showOfflineTab, setShowOfflineTab] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>(initialUrlState.query);
  const [caseSensitiveSearch, setCaseSensitiveSearch] = useState<boolean>(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [totalAvailableTracks, setTotalAvailableTracks] = useState<number>(0);
  const [catalogNextPage, setCatalogNextPage] = useState<number>(1);
  const [hasMoreTracks, setHasMoreTracks] = useState<boolean>(false);
  const [isLoadingMoreTracks, setIsLoadingMoreTracks] = useState<boolean>(false);
  const [isAutoStreamingAll, setIsAutoStreamingAll] = useState<boolean>(false);
  const [isLoadingTracks, setIsLoadingTracks] = useState<boolean>(true);
  const [tracksError, setTracksError] = useState<string | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [inspectedTrack, setInspectedTrack] = useState<Track | null>(null);
  const [visitorStats, setVisitorStats] = useState<{
    totalVisitors: number;
    todayVisitors: number;
  } | null>(null);

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
  const autoDjModeRef = useRef(autoDjMode);
  autoDjModeRef.current = autoDjMode;
  const autoDjIntervalRef = useRef(autoDjIntervalSec);
  autoDjIntervalRef.current = autoDjIntervalSec;
  const isAutoTransitioningRef = useRef(isAutoTransitioning);
  isAutoTransitioningRef.current = isAutoTransitioning;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const deckARef = useRef(deckA);
  deckARef.current = deckA;
  const deckBRef = useRef(deckB);
  deckBRef.current = deckB;
  const transitionRafRef = useRef<number>(0);
  const autoDjCutCountRef = useRef<number>(0);
  const autoDjSliceRef = useRef<{ A: number; B: number }>({ A: 0, B: 0 });
  const searchSessionRef = useRef<number>(0);
  const isAutoStreamingRef = useRef<boolean>(false);
  const nextPageRef = useRef<number>(1);
  nextPageRef.current = catalogNextPage;
  const hasMoreRef = useRef<boolean>(false);
  hasMoreRef.current = hasMoreTracks;
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
          if (deckId === 'B' && crossfadeRef.current < 0.35) {
            const nextCf = deckARef.current.isPlaying ? 0.5 : 1;
            setCrossfade(nextCf);
            crossfadeRef.current = nextCf;
            djAudioEngine.setCrossfader(nextCf);
          } else if (deckId === 'A' && crossfadeRef.current > 0.65) {
            const nextCf = deckBRef.current.isPlaying ? 0.5 : 0;
            setCrossfade(nextCf);
            crossfadeRef.current = nextCf;
            djAudioEngine.setCrossfader(nextCf);
          }
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
          if (
            track.previewUrl &&
            sourceUrl.includes('/api/audio-proxy') &&
            sourceUrl !== track.previewUrl
          ) {
            try {
              await djAudioEngine.loadAndPlay(deckId, track.previewUrl, pitchToUse, currentDeck.loop);
              djAudioEngine.setDeckEq(deckId, currentDeck.eq);
              djAudioEngine.setChannelVolume(deckId, currentDeck.volume);
              updateDeck(deckId, (prev) => ({
                ...prev,
                isPlaying: true,
                isLoading: false,
                error: null,
              }));
              return;
            } catch {
              // Fall through to standard error state
            }
          }
          const message =
            err instanceof Error ? err.message : 'Unable to stream this track right now.';
          updateDeck(deckId, (prev) => ({
            ...prev,
            isPlaying: false,
            isLoading: false,
            error: message,
          }));
        }
      } else {
        audio.src = sourceUrl;
        audio.load();
        audio.playbackRate = pitchToUse;
        audio.loop = currentDeck.loop;
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
    crossfadeRef.current = clamped;
    djAudioEngine.setCrossfader(clamped);
  }, []);

  const pullNextTrackForDeck = useCallback((avoidIds: Set<string>): Track | null => {
    if (queueRef.current.length > 0) {
      const [nextTrack, ...rest] = queueRef.current;
      queueRef.current = rest;
      setQueue(rest);
      return nextTrack;
    }
    const pool = tracksRef.current.filter((t) => !avoidIds.has(t.id) && !isMarathiTrackMeta(t));
    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * Math.min(pool.length, 10))];
    }
    const anyTrack = tracksRef.current.find((t) => !isMarathiTrackMeta(t));
    return anyTrack ?? null;
  }, []);

  const triggerSmoothCrossfade = useCallback(
    async (targetDeckId?: DeckId, durationMs = 3000, mashupCut = false) => {
      if (transitionRafRef.current) {
        cancelAnimationFrame(transitionRafRef.current);
      }

      const startCrossfade = crossfadeRef.current;
      const toDeck: DeckId = targetDeckId ?? (startCrossfade < 0.5 ? 'B' : 'A');
      const fromDeck: DeckId = toDeck === 'A' ? 'B' : 'A';
      const endCrossfade = toDeck === 'A' ? 0 : 1;

      const targetState = toDeck === 'A' ? deckARef.current : deckBRef.current;
      const sourceState = fromDeck === 'A' ? deckARef.current : deckBRef.current;

      const avoid = new Set<string>();
      if (sourceState.track?.id) avoid.add(sourceState.track.id);
      if (targetState.track?.id) avoid.add(targetState.track.id);

      let activeIncomingTrack = targetState.track;
      if (!activeIncomingTrack) {
        const nextTrack = pullNextTrackForDeck(avoid);
        if (nextTrack) {
          activeIncomingTrack = nextTrack;
          await loadTrackToDeck(toDeck, nextTrack, true);
        }
      } else if (!targetState.isPlaying) {
        try {
          await djAudioEngine.play(toDeck);
          updateDeck(toDeck, (p) => ({ ...p, isPlaying: true, error: null }));
        } catch {
          await loadTrackToDeck(toDeck, activeIncomingTrack, true);
        }
      }

      if (mashupCut && activeIncomingTrack) {
        const audio = djAudioEngine.getAudioElement(toDeck);
        const dur =
          (Number.isFinite(audio.duration) && audio.duration > 10
            ? audio.duration
            : activeIncomingTrack.durationSec) || 180;

        if (autoDjModeRef.current === 'two_song') {
          const sliceOffsets = [0.22, 0.46, 0.68, 0.34];
          const sliceIdx = autoDjSliceRef.current[toDeck];
          autoDjSliceRef.current[toDeck] = sliceIdx + 1;
          const targetRatio = sliceOffsets[sliceIdx % sliceOffsets.length];
          const maxSafeSeek = Math.max(8, dur - 22);
          const cutCueSec = Math.min(maxSafeSeek, Math.max(8, Math.round(dur * targetRatio)));
          if (Number.isFinite(cutCueSec) && cutCueSec > 0) {
            if (audio.readyState >= 1) {
              djAudioEngine.seek(toDeck, cutCueSec);
            } else {
              audio.addEventListener('loadedmetadata', () => djAudioEngine.seek(toDeck, cutCueSec), {
                once: true,
              });
            }
          }
        } else {
          const dropCueSec =
            dur >= 90 ? Math.min(42, Math.round(dur * 0.24)) : Math.min(18, Math.round(dur * 0.2));
          if (audio.currentTime < 6 && Number.isFinite(dropCueSec) && dropCueSec > 0) {
            if (audio.readyState >= 1) {
              djAudioEngine.seek(toDeck, dropCueSec);
            } else {
              audio.addEventListener('loadedmetadata', () => djAudioEngine.seek(toDeck, dropCueSec), {
                once: true,
              });
            }
          }
        }

        autoDjCutCountRef.current += 1;
        if (autoDjCutCountRef.current % 2 === 1) {
          void djAudioEngine.triggerFx('riser');
        } else {
          void djAudioEngine.triggerFx('bass_drop');
        }
      }

      setIsAutoTransitioning(true);
      isAutoTransitioningRef.current = true;
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const currentVal = startCrossfade + (endCrossfade - startCrossfade) * eased;
        handleCrossfadeChange(currentVal);

        // Smooth DJ high-pass exit sweep + bass swap during mashup cut
        if (mashupCut) {
          const outEq = fromDeck === 'A' ? deckARef.current.eq : deckBRef.current.eq;
          djAudioEngine.setDeckEq(fromDeck, {
            ...outEq,
            low: Math.max(-10, outEq.low - eased * 8),
            filter: Math.min(0.65, eased * 0.65),
          });
        }

        if (t < 1) {
          transitionRafRef.current = requestAnimationFrame(step);
        } else {
          setIsAutoTransitioning(false);
          isAutoTransitioningRef.current = false;
          djAudioEngine.pause(fromDeck);
          const restoredEq = fromDeck === 'A' ? deckARef.current.eq : deckBRef.current.eq;
          djAudioEngine.setDeckEq(fromDeck, { ...restoredEq, filter: 0 });
          updateDeck(fromDeck, (p) => ({ ...p, isPlaying: false, eq: { ...p.eq, filter: 0 } }));

          // In 2-Song Cut mode, keep both loaded tracks on Deck A & Deck B intact so they cut back & forth
          if (!mashupCut || autoDjModeRef.current === 'playlist') {
            const nextAvoid = new Set<string>();
            const currentTarget = toDeck === 'A' ? deckARef.current : deckBRef.current;
            if (currentTarget.track?.id) nextAvoid.add(currentTarget.track.id);
            if (sourceState.track?.id) nextAvoid.add(sourceState.track.id);
            const upcoming = pullNextTrackForDeck(nextAvoid);
            if (upcoming) {
              void loadTrackToDeck(fromDeck, upcoming, false);
            }
          }
        }
      };

      transitionRafRef.current = requestAnimationFrame(step);
    },
    [handleCrossfadeChange, loadTrackToDeck, pullNextTrackForDeck, updateDeck]
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
        const currentDeck = deckId === 'A' ? deckARef.current : deckBRef.current;
        const directFallbackUrl = currentDeck.track?.previewUrl;
        if (
          directFallbackUrl &&
          audio.src.includes('/api/audio-proxy') &&
          audio.src !== directFallbackUrl
        ) {
          audio.src = directFallbackUrl;
          audio.playbackRate = currentDeck.pitch;
          audio.loop = currentDeck.loop;
          void djAudioEngine.play(deckId).catch(() => {
            updateDeck(deckId, (prev) => ({
              ...prev,
              isPlaying: false,
              isLoading: false,
              error: prev.track ? 'Unable to stream this track right now.' : null,
            }));
          });
          return;
        }
        updateDeck(deckId, (prev) => ({
          ...prev,
          isPlaying: false,
          isLoading: false,
          error: prev.track ? 'Unable to stream this track right now.' : null,
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
    djAudioEngine.set8dMode(is8dEnabled);
  }, [is8dEnabled]);

  useEffect(() => {
    if (!autoDj20s) {
      setAutoDjCountdown(autoDjIntervalSec);
      return;
    }

    const timer = window.setInterval(() => {
      if (isAutoTransitioningRef.current) return;
      const playingA = deckARef.current.isPlaying;
      const playingB = deckBRef.current.isPlaying;
      if (!playingA && !playingB) return;

      setAutoDjCountdown((prev) => {
        if (prev <= 1) {
          const toDeck: DeckId = crossfadeRef.current <= 0.5 ? 'B' : 'A';
          void triggerSmoothCrossfade(toDeck, 2200, true);
          return autoDjIntervalRef.current;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [autoDj20s, autoDjIntervalSec, triggerSmoothCrossfade]);

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

    // Record & fetch real Total Visitors & Today's Visitors (with static fallback)
    const todayKey = new Date().toISOString().slice(0, 10);
    const sessionFlag = `rintu_visit_${todayKey}`;
    let shouldCountVisit = true;
    try {
      shouldCountVisit = !sessionStorage.getItem(sessionFlag);
      if (shouldCountVisit) sessionStorage.setItem(sessionFlag, '1');
    } catch {
      shouldCountVisit = true;
    }

    void (async () => {
      try {
        const res = await fetch('/api/visitors/hit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ countVisit: shouldCountVisit }),
        });
        const data = await safeParseApiJson<{
          totalVisitors?: number;
          todayVisitors?: number;
        }>(res);
        if (
          res.ok &&
          data &&
          typeof data.totalVisitors === 'number' &&
          typeof data.todayVisitors === 'number'
        ) {
          setVisitorStats({
            totalVisitors: data.totalVisitors,
            todayVisitors: data.todayVisitors,
          });
          return;
        }
      } catch {
        // Static-hosting fallback below
      }

      try {
        const raw = localStorage.getItem('rintu_visitor_stats');
        const parsed = raw
          ? (JSON.parse(raw) as { totalVisitors?: number; todayDate?: string; todayVisitors?: number })
          : {};
        const prevTotal = typeof parsed.totalVisitors === 'number' ? parsed.totalVisitors : 0;
        const prevToday =
          parsed.todayDate === todayKey && typeof parsed.todayVisitors === 'number'
            ? parsed.todayVisitors
            : 0;
        const next = {
          totalVisitors: shouldCountVisit ? prevTotal + 1 : Math.max(1, prevTotal),
          todayDate: todayKey,
          todayVisitors: shouldCountVisit ? prevToday + 1 : Math.max(1, prevToday),
        };
        localStorage.setItem('rintu_visitor_stats', JSON.stringify(next));
        setVisitorStats({
          totalVisitors: next.totalVisitors,
          todayVisitors: next.todayVisitors,
        });
      } catch {
        setVisitorStats({ totalVisitors: 1, todayVisitors: 1 });
      }
    })();
  }, []);

  // Dynamically update document title & meta description for searched songs, genres, and lyrics discovery
  useEffect(() => {
    const modeObj = DJ_MODES.find((m) => m.id === activeMode);
    let nextTitle = 'Rintu Bit DJ – Play, Download MP3 Songs, Lyrics & DJ Mix';
    let nextDesc =
      'Search any song by title, artist, or lyrics. Play full HD tracks, download MP3 & M4A music offline, and mix 8D & Auto DJ sets free on Rintu Bit DJ.';

    if (inspectedTrack) {
      nextTitle = `${inspectedTrack.title} – ${inspectedTrack.artist} | Play & Download | Rintu Bit DJ`;
      nextDesc = `Play & download ${inspectedTrack.title} by ${inspectedTrack.artist} (${inspectedTrack.album || 'Single'}). Stream full audio, view cover details, and mix live on Rintu Bit DJ.`;
    } else if (searchQuery.trim()) {
      const q = searchQuery.trim();
      nextTitle = `${q} Songs Play & Download | Rintu Bit DJ`;
      nextDesc = `Play and download full MP3 & HD songs matching "${q}". Search by song title, artist, or lyrics free on Rintu Bit DJ.`;
    } else if (activeView === 'console' && modeObj) {
      nextTitle = `${modeObj.label} Songs & Live DJ Mix | Rintu Bit DJ`;
      nextDesc = `Stream and download ${modeObj.label} songs (${modeObj.tagline}) with AI smart suggestions, Auto DJ cuts, and offline vault on Rintu Bit DJ.`;
    }

    document.title = nextTitle;
    const updateMeta = (selector: string, val: string) => {
      const el = document.querySelector<HTMLMetaElement>(selector);
      if (el) el.content = val;
    };
    updateMeta('meta[name="description"]', nextDesc);
    updateMeta('meta[property="og:title"]', nextTitle);
    updateMeta('meta[property="og:description"]', nextDesc);
    updateMeta('meta[name="twitter:title"]', nextTitle);
    updateMeta('meta[name="twitter:description"]', nextDesc);
  }, [activeMode, activeView, inspectedTrack, searchQuery]);

  const fetchCatalogPageBatch = useCallback(
    async (
      mode: DjModeId,
      q: string,
      page: number,
      pagesPerBatch: number,
      caseSensitive: boolean
    ): Promise<CatalogBatchResult> => {
      const params = new URLSearchParams({
        genre: mode,
        page: String(page),
        pages: String(pagesPerBatch),
        caseSensitive: caseSensitive ? '1' : '0',
      });
      if (q) params.set('q', q);

      let batch: CatalogBatchResult | null = null;
      try {
        const res = await fetch(`/api/tracks?${params.toString()}`);
        const data = await safeParseApiJson<{
          tracks?: Track[];
          totalAvailable?: number;
          page?: number;
          nextPage?: number;
          hasMore?: boolean;
          error?: string;
          blocked?: boolean;
        }>(res);

        if (res.status === 403 && data?.blocked) {
          throw new Error(data.error || 'Marathi songs are blocked on Rintu Bit DJ.');
        }
        if (res.ok && data && Array.isArray(data.tracks)) {
          const clean = data.tracks.filter((t) => !isMarathiTrackMeta(t));
          batch = {
            tracks: clean,
            totalAvailable:
              typeof data.totalAvailable === 'number' ? data.totalAvailable : clean.length,
            page: typeof data.page === 'number' ? data.page : page,
            nextPage:
              typeof data.nextPage === 'number' ? data.nextPage : page + pagesPerBatch,
            hasMore: Boolean(data.hasMore),
          };
        }
      } catch (apiErr) {
        if (apiErr instanceof Error && apiErr.message.includes('Marathi')) {
          throw apiErr;
        }
      }

      if (!batch) {
        batch = await searchPaginatedDirectCatalog({
          mode,
          query: q,
          page,
          pagesPerBatch,
          caseSensitive,
        });
      }

      return batch;
    },
    []
  );

  const mergeDeduplicatedTracks = useCallback((existing: Track[], incoming: Track[]): Track[] => {
    const seen = new Set<string>(existing.map((t) => t.id));
    const normSeen = new Set<string>(
      existing.map(
        (t) =>
          `${t.title.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim()}::${t.artist.toLowerCase().split(',')[0].trim()}`
      )
    );
    const next = [...existing];
    for (const track of incoming) {
      if (track.durationSec < 60 || isMarathiTrackMeta(track)) continue;
      if (seen.has(track.id)) continue;
      const normKey = `${track.title.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim()}::${track.artist.toLowerCase().split(',')[0].trim()}`;
      if (normSeen.has(normKey)) continue;
      seen.add(track.id);
      normSeen.add(normKey);
      next.push(track);
    }
    return next;
  }, []);

  const streamCatalogWaves = useCallback(
    async (
      sessionId: number,
      mode: DjModeId,
      q: string,
      caseSensitive: boolean,
      targetTrackCount: number,
      startPage: number
    ) => {
      isAutoStreamingRef.current = true;
      setIsAutoStreamingAll(true);
      let cursorPage = startPage;
      let canContinue = true;

      try {
        while (
          isAutoStreamingRef.current &&
          searchSessionRef.current === sessionId &&
          canContinue &&
          tracksRef.current.length < targetTrackCount
        ) {
          setIsLoadingMoreTracks(true);
          const batch = await fetchCatalogPageBatch(mode, q, cursorPage, 6, caseSensitive);
          if (searchSessionRef.current !== sessionId || !isAutoStreamingRef.current) break;

          setTracks((prev) => mergeDeduplicatedTracks(prev, batch.tracks));
          setTotalAvailableTracks((prev) => Math.max(prev, batch.totalAvailable));
          cursorPage = batch.nextPage;
          setCatalogNextPage(batch.nextPage);
          nextPageRef.current = batch.nextPage;
          canContinue = batch.hasMore && batch.tracks.length > 0;
          setHasMoreTracks(canContinue);
          hasMoreRef.current = canContinue;

          // Yield briefly to keep UI scrolling silky smooth at 60fps
          await new Promise((r) => setTimeout(r, 80));
        }
      } finally {
        if (searchSessionRef.current === sessionId) {
          isAutoStreamingRef.current = false;
          setIsAutoStreamingAll(false);
          setIsLoadingMoreTracks(false);
        }
      }
    },
    [fetchCatalogPageBatch, mergeDeduplicatedTracks]
  );

  const fetchTracks = useCallback(
    async (
      mode: DjModeId,
      q = '',
      autoStageDecks = false,
      autoPlayFirst = false,
      caseSensitiveOverride?: boolean
    ) => {
      const cleanQ = q.trim();
      if (cleanQ && containsMarathiMarker(cleanQ)) {
        setTracksError(
          'Marathi songs are blocked on Rintu Bit DJ. Search any other Indian or World song!'
        );
        return;
      }

      const sessionId = ++searchSessionRef.current;
      isAutoStreamingRef.current = false;
      setIsAutoStreamingAll(false);
      setIsLoadingMoreTracks(false);
      setIsLoadingTracks(true);
      setTracksError(null);

      const useCaseSensitive = caseSensitiveOverride ?? caseSensitiveSearch;

      try {
        const firstBatch = await fetchCatalogPageBatch(
          mode,
          cleanQ,
          1,
          cleanQ ? 5 : 2,
          useCaseSensitive
        );
        if (searchSessionRef.current !== sessionId) return;

        setTracks(firstBatch.tracks);
        tracksRef.current = firstBatch.tracks;
        setTotalAvailableTracks(firstBatch.totalAvailable);
        setCatalogNextPage(firstBatch.nextPage);
        nextPageRef.current = firstBatch.nextPage;
        setHasMoreTracks(firstBatch.hasMore);
        hasMoreRef.current = firstBatch.hasMore;

        if (autoStageDecks && firstBatch.tracks.length > 0) {
          if (firstBatch.tracks[0]) void loadTrackToDeck('A', firstBatch.tracks[0], autoPlayFirst);
          if (firstBatch.tracks[1]) void loadTrackToDeck('B', firstBatch.tracks[1], false);
          if (firstBatch.tracks.length > 2) setQueue(firstBatch.tracks.slice(2, 10));
        }

        // Automatically warm 2nd fast wave when user runs a keyword search so hundreds of matches appear right away
        if (cleanQ && firstBatch.hasMore) {
          void (async () => {
            try {
              const secondBatch = await fetchCatalogPageBatch(
                mode,
                cleanQ,
                firstBatch.nextPage,
                5,
                useCaseSensitive
              );
              if (searchSessionRef.current !== sessionId) return;
              setTracks((prev) => mergeDeduplicatedTracks(prev, secondBatch.tracks));
              setTotalAvailableTracks((prev) => Math.max(prev, secondBatch.totalAvailable));
              setCatalogNextPage(secondBatch.nextPage);
              nextPageRef.current = secondBatch.nextPage;
              setHasMoreTracks(secondBatch.hasMore);
              hasMoreRef.current = secondBatch.hasMore;
            } catch {
              // Silent background wave error
            }
          })();
        }
      } catch (err) {
        if (searchSessionRef.current === sessionId) {
          setTracksError(
            err instanceof Error ? err.message : 'Unable to reach music catalog API.'
          );
        }
      } finally {
        if (searchSessionRef.current === sessionId) {
          setIsLoadingTracks(false);
          setInitialReady(true);
        }
      }
    },
    [caseSensitiveSearch, fetchCatalogPageBatch, loadTrackToDeck, mergeDeduplicatedTracks]
  );

  const handleLoadMoreTracks = useCallback(async () => {
    if (isLoadingMoreTracks || !hasMoreRef.current) return;
    const sessionId = searchSessionRef.current;
    setIsLoadingMoreTracks(true);
    try {
      const batch = await fetchCatalogPageBatch(
        activeMode,
        searchQuery.trim(),
        nextPageRef.current,
        5,
        caseSensitiveSearch
      );
      if (searchSessionRef.current !== sessionId) return;
      setTracks((prev) => mergeDeduplicatedTracks(prev, batch.tracks));
      setTotalAvailableTracks((prev) => Math.max(prev, batch.totalAvailable));
      setCatalogNextPage(batch.nextPage);
      nextPageRef.current = batch.nextPage;
      setHasMoreTracks(batch.hasMore);
      hasMoreRef.current = batch.hasMore;
    } finally {
      if (searchSessionRef.current === sessionId) {
        setIsLoadingMoreTracks(false);
      }
    }
  }, [activeMode, caseSensitiveSearch, fetchCatalogPageBatch, isLoadingMoreTracks, mergeDeduplicatedTracks, searchQuery]);

  const handleToggleStreamAll5000 = useCallback(() => {
    if (isAutoStreamingRef.current) {
      isAutoStreamingRef.current = false;
      setIsAutoStreamingAll(false);
      setIsLoadingMoreTracks(false);
      return;
    }
    if (!hasMoreRef.current) return;
    void streamCatalogWaves(
      searchSessionRef.current,
      activeMode,
      searchQuery.trim(),
      caseSensitiveSearch,
      5500,
      nextPageRef.current
    );
  }, [activeMode, caseSensitiveSearch, searchQuery, streamCatalogWaves]);

  useEffect(() => {
    void fetchTracks(initialUrlState.mode, initialUrlState.query, true, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        let resolved: AiSuggestResponse | null = null;
        try {
          const ctrl = new AbortController();
          const timer = window.setTimeout(() => ctrl.abort(), 7500);
          try {
            const res = await fetch('/api/ai/suggest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: ctrl.signal,
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
            const data = await safeParseApiJson<Partial<AiSuggestResponse> & { error?: string }>(res);
            if (res.ok && data && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
              resolved = {
                headline: data.headline || 'AI Suggested New Songs',
                suggestions: data.suggestions,
              };
            }
          } finally {
            window.clearTimeout(timer);
          }
        } catch {
          // Fall back to direct catalog suggestion matching
        }

        if (!resolved || resolved.suggestions.length === 0) {
          resolved = await buildClientAiSuggestFallback(
            activeTrack
              ? {
                  title: activeTrack.title,
                  artist: activeTrack.artist,
                  genre: activeTrack.genre,
                  bpm: activeTrack.bpm,
                }
              : undefined,
            activeMode,
            recentTitles
          );
        }

        setSuggestHeadline(resolved.headline || 'AI Suggested New Songs');
        setSuggestions(resolved.suggestions.filter((s) => !isMarathiTrackMeta(s.track)));
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

  const hasAutoSuggestedRef = useRef(false);
  useEffect(() => {
    if (!initialReady || hasAutoSuggestedRef.current) return;
    hasAutoSuggestedRef.current = true;
    void handleFetchAiSuggestions(tracksRef.current[0] ?? null);
  }, [initialReady, handleFetchAiSuggestions]);

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

  const handleSearchSubmit = useCallback(
    (q: string) => {
      setShowOfflineTab(false);
      setSearchQuery(q);
      void fetchTracks(activeMode, q, false, false, caseSensitiveSearch);
    },
    [activeMode, caseSensitiveSearch, fetchTracks]
  );

  const handleToggleCaseSensitive = useCallback(() => {
    setCaseSensitiveSearch((prev) => {
      const next = !prev;
      if (searchQuery.trim()) {
        void fetchTracks(activeMode, searchQuery, false, false, next);
      }
      return next;
    });
  }, [activeMode, fetchTracks, searchQuery]);

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

        // Automatically bring Deck B (or Deck A) into audible crossfade range when user hits Play
        if (deckId === 'B' && crossfadeRef.current < 0.35) {
          handleCrossfadeChange(deckARef.current.isPlaying ? 0.5 : 1);
        } else if (deckId === 'A' && crossfadeRef.current > 0.65) {
          handleCrossfadeChange(deckBRef.current.isPlaying ? 0.5 : 0);
        }

        const audio = djAudioEngine.getAudioElement(deckId);
        if (!audio.src || audio.error) {
          await loadTrackToDeck(deckId, state.track, true);
        } else {
          try {
            await djAudioEngine.play(deckId);
            djAudioEngine.setDeckEq(deckId, state.eq);
            djAudioEngine.setChannelVolume(deckId, state.volume);
          } catch {
            await loadTrackToDeck(deckId, state.track, true);
          }
        }
      } catch (err) {
        updateDeck(deckId, (prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Playback blocked or unavailable.',
        }));
      }
    }
  };

  const handleToggleAutoDj20s = () => {
    setAutoDj20s((prev) => {
      const next = !prev;
      if (next) {
        setAutoMixEnabled(true);
        setAutoDjCountdown(autoDjIntervalRef.current);

        // Ensure both Deck A and Deck B have songs loaded so 2-Song Cut mashup can alternate seamlessly
        if (!deckBRef.current.track) {
          const avoid = new Set<string>();
          if (deckARef.current.track?.id) avoid.add(deckARef.current.track.id);
          const secondTrack = pullNextTrackForDeck(avoid);
          if (secondTrack) {
            void loadTrackToDeck('B', secondTrack, false);
          }
        }
        if (!deckARef.current.track) {
          const avoid = new Set<string>();
          if (deckBRef.current.track?.id) avoid.add(deckBRef.current.track.id);
          const firstTrack = pullNextTrackForDeck(avoid);
          if (firstTrack) {
            void loadTrackToDeck('A', firstTrack, true);
            handleCrossfadeChange(0);
            return next;
          }
        }

        const playingA = deckARef.current.isPlaying;
        const playingB = deckBRef.current.isPlaying;
        if (!playingA && !playingB) {
          if (deckARef.current.track) {
            handleCrossfadeChange(0);
            void loadTrackToDeck('A', deckARef.current.track, true);
          } else if (deckBRef.current.track) {
            handleCrossfadeChange(1);
            void loadTrackToDeck('B', deckBRef.current.track, true);
          }
        }
      }
      return next;
    });
  };

  const handleToggleAutoDjInterval = () => {
    setAutoDjIntervalSec((prev) => {
      const next = prev === 20 ? 12 : 20;
      setAutoDjCountdown(next);
      return next;
    });
  };

  const handleInstantMashupCut = () => {
    const toDeck: DeckId = crossfadeRef.current <= 0.5 ? 'B' : 'A';
    setAutoDjCountdown(autoDjIntervalRef.current);
    void triggerSmoothCrossfade(toDeck, 2200, true);
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
      let resolved: AiFilterResponse | null = null;
      try {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 7500);
        try {
          const res = await fetch('/api/ai/filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ctrl.signal,
            body: JSON.stringify({ prompt, currentMode: activeMode }),
          });

          const data = await safeParseApiJson<
            Partial<AiFilterResponse> & { error?: string; blocked?: boolean }
          >(res);

          if (res.status === 403 && data?.blocked) {
            throw new Error(data.error || 'Marathi songs are blocked on Rintu Bit DJ.');
          }
          if (res.ok && data && data.tracks && data.crate && data.mixerPreset) {
            resolved = {
              crate: data.crate,
              mixerPreset: data.mixerPreset,
              tracks: data.tracks,
            };
          }
        } finally {
          window.clearTimeout(timer);
        }
      } catch (apiErr) {
        if (apiErr instanceof Error && apiErr.message.includes('Marathi')) {
          throw apiErr;
        }
      }

      if (!resolved) {
        resolved = await buildClientAiFilterFallback(prompt, activeMode);
      }

      const cleanTracks = resolved.tracks.filter((t) => !isMarathiTrackMeta(t));
      setActiveCrate(resolved.crate);
      setActivePreset(resolved.mixerPreset);
      setActiveMode(resolved.crate.recommendedMode);
      setSearchQuery('');
      setTracks(cleanTracks);
      setBangerMode(resolved.mixerPreset.bangerMode);

      const bassEq = Math.max(-6, Math.min(10, Math.round(resolved.mixerPreset.bassBoostDb)));
      const targetPitch = resolved.mixerPreset.targetPitch || 1.0;

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

  const isPartyStageActive =
    deckA.isPlaying ||
    deckB.isPlaying ||
    deckA.isLoading ||
    deckB.isLoading ||
    activeOfflineBeat !== null;

  return (
    <div className="relative min-h-screen bg-[#090B10] text-[#F1F3F5] flex flex-col overflow-x-hidden">
      <PartyBackdropOverlay
        isPlaying={isPartyStageActive}
        deckAPlaying={deckA.isPlaying || deckA.isLoading}
        deckBPlaying={deckB.isPlaying || deckB.isLoading}
        bangerMode={bangerMode}
        enabled={partyLightsEnabled}
      />

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

      <main className="relative z-10 mx-auto w-full max-w-[1440px] flex-1 px-3.5 py-5 pb-20 sm:px-6 md:pb-8 space-y-6">
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
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F1F3F5]">
                    Rintu Bit DJ Console
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-[#9CA3AF]">
                    Mix World &amp; Indian music (90s, Bhojpuri, Haryanvi, Punjabi, Tamil, EDM, Global) — Marathi blocked.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-xs font-mono-tabular text-[#9CA3AF]">
                    <span>
                      Mode: {showOfflineTab ? 'Offline Vault' : DJ_MODES.find((m) => m.id === activeMode)?.label ?? activeMode}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span>{bangerMode ? 'Bass Boost Active' : 'Balanced Studio EQ'}</span>
                    {is8dEnabled && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="text-sky-400">8D Spatial</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAutoDj20s}
                    aria-pressed={autoDj20s}
                    className={`min-h-[38px] rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      autoDj20s
                        ? 'bg-emerald-400 text-[#090B10] hover:bg-emerald-300'
                        : 'border border-emerald-400/40 bg-emerald-400/12 text-emerald-300 hover:bg-emerald-400/20'
                    }`}
                  >
                    {autoDj20s
                      ? `Auto DJ ${autoDjMode === 'two_song' ? '2-Song Cut' : 'Queue'} · ${autoDjCountdown}s`
                      : `Auto DJ (${autoDjMode === 'two_song' ? '2-Song Cut' : 'Queue'})`}
                  </button>
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
                    is8dEnabled={is8dEnabled}
                    autoDj20s={autoDj20s}
                    autoDjCountdown={autoDjCountdown}
                    autoDjMode={autoDjMode}
                    autoDjIntervalSec={autoDjIntervalSec}
                    partyLightsEnabled={partyLightsEnabled}
                    isAnyPlaying={deckA.isPlaying || deckB.isPlaying || activeOfflineBeat !== null}
                    activeDeck={
                      activeOfflineBeat !== null
                        ? 'MIX'
                        : deckA.isPlaying && deckB.isPlaying && crossfade > 0.15 && crossfade < 0.85
                          ? 'MIX'
                          : deckA.isPlaying && !deckB.isPlaying
                            ? 'A'
                            : deckB.isPlaying && !deckA.isPlaying
                              ? 'B'
                              : crossfade <= 0.5
                                ? 'A'
                                : 'B'
                    }
                    activeTrackTitle={
                      activeOfflineBeat !== null
                        ? `Offline Beat (${activeOfflineBeat})`
                        : deckA.isPlaying && deckB.isPlaying && crossfade > 0.15 && crossfade < 0.85
                          ? `${deckA.track?.title ?? 'Deck A'} × ${deckB.track?.title ?? 'Deck B'}`
                          : deckA.isPlaying && !deckB.isPlaying
                            ? deckA.track?.title ?? null
                            : deckB.isPlaying && !deckA.isPlaying
                              ? deckB.track?.title ?? null
                              : (crossfade <= 0.5 ? deckA.track?.title : deckB.track?.title) ?? null
                    }
                    isAutoTransitioning={isAutoTransitioning}
                    onCrossfadeChange={handleCrossfadeChange}
                    onMasterVolumeChange={handleMasterVolumeChange}
                    onToggleBangerMode={() => setBangerMode((b) => !b)}
                    onToggle8dMode={() => setIs8dEnabled((v) => !v)}
                    onToggleAutoDj20s={handleToggleAutoDj20s}
                    onToggleAutoDjMode={() =>
                      setAutoDjMode((m) => (m === 'two_song' ? 'playlist' : 'two_song'))
                    }
                    onToggleAutoDjInterval={handleToggleAutoDjInterval}
                    onInstantMashupCut={handleInstantMashupCut}
                    onTogglePartyLights={() => setPartyLightsEnabled((v) => !v)}
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
              onInspectTrack={setInspectedTrack}
            />

            {/* Genre Browser + Up Next Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8">
                <ModeAndTrackBrowser
                  activeMode={activeMode}
                  showOfflineTab={showOfflineTab}
                  searchQuery={searchQuery}
                  caseSensitive={caseSensitiveSearch}
                  tracks={tracks}
                  totalAvailable={totalAvailableTracks}
                  hasMore={hasMoreTracks}
                  isLoadingMore={isLoadingMoreTracks}
                  isAutoStreamingAll={isAutoStreamingAll}
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
                  onToggleCaseSensitive={handleToggleCaseSensitive}
                  onLoadMore={() => void handleLoadMoreTracks()}
                  onToggleStreamAll={handleToggleStreamAll5000}
                  onPlayNow={(t) => void handlePlayNow(t)}
                  onLoadToDeck={(d, t, auto) => void loadTrackToDeck(d, t, auto)}
                  onAddToQueue={(t) => setQueue((prev) => [...prev, t])}
                  onSaveOffline={(t) => void handleSaveOffline(t)}
                  onRemoveOffline={(id) => void handleRemoveOffline(id)}
                  onDownloadFile={handleDownloadFile}
                  onToggleOfflineBeat={handleToggleOfflineBeat}
                  onInspectTrack={setInspectedTrack}
                  onRetry={() => void fetchTracks(activeMode, searchQuery, false, false, caseSensitiveSearch)}
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

      <footer className="relative z-10 border-t border-white/8 bg-[#090B10]/80 backdrop-blur-md py-8 px-4 pb-24 md:pb-8 sm:px-6 mt-10">
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

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            {visitorStats && (
              <div
                aria-label="Website visitor statistics"
                className="flex items-center gap-4 sm:border-l sm:border-white/10 sm:pl-4 text-xs"
              >
                <div>
                  <span className="text-[#9CA3AF]">Today&apos;s Visitors</span>
                  <p className="font-mono-tabular text-sm font-semibold text-amber-400">
                    {visitorStats.todayVisitors.toLocaleString()}
                  </p>
                </div>
                <div className="h-6 w-px bg-white/10" aria-hidden="true" />
                <div>
                  <span className="text-[#9CA3AF]">Total Visitors</span>
                  <p className="font-mono-tabular text-sm font-semibold text-[#F1F3F5]">
                    {visitorStats.totalVisitors.toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-[#6B7280]">
              © {new Date().getFullYear()} RLV Nexus. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <MobileBottomNav
        activeSection={mobileNavActive}
        offlineCount={offlineTracks.length}
        onSelect={handleMobileNavSelect}
      />

      <SongDetailModal
        track={inspectedTrack}
        isSavedOffline={inspectedTrack ? offlineIds.has(inspectedTrack.id) : false}
        isSavingOffline={inspectedTrack ? savingIds.has(inspectedTrack.id) : false}
        loadedOnDeckA={Boolean(inspectedTrack && deckA.track?.id === inspectedTrack.id)}
        loadedOnDeckB={Boolean(inspectedTrack && deckB.track?.id === inspectedTrack.id)}
        isPlayingOnDeckA={deckA.isPlaying}
        isPlayingOnDeckB={deckB.isPlaying}
        onClose={() => setInspectedTrack(null)}
        onPlayNow={(t) => void handlePlayNow(t)}
        onLoadToDeck={(d, t) => void loadTrackToDeck(d, t, false)}
        onAddToQueue={(t) => setQueue((prev) => [...prev, t])}
        onSaveOffline={(t) => void handleSaveOffline(t)}
        onDownloadFile={handleDownloadFile}
        onSuggestSimilar={(t) => {
          void handleFetchAiSuggestions(t);
          handleNavigateConsoleSection('ai-picks');
        }}
      />
    </div>
  );
}
