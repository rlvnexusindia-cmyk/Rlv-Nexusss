import { DJ_MODES } from '../data/modes';
import type {
  AiFilterResponse,
  AiSuggestResponse,
  DjModeId,
  Track,
} from '../types/music';
import { containsMarathiMarker, isMarathiTrackMeta } from '../utils/marathiFilter';

const CLIENT_MODE_QUERIES: Record<
  DjModeId,
  { saavnQueries: string[]; audiusQueries: string[]; preferAudius?: boolean }
> = {
  banger: {
    saavnQueries: ['Badshah party', 'Yo Yo Honey Singh', 'Diljit Dosanjh'],
    audiusQueries: ['bollywood dj remix bass'],
  },
  dance: {
    saavnQueries: ['Bollywood dance party', 'Neha Kakkar', 'Badshah'],
    audiusQueries: ['bollywood club dance'],
  },
  romance: {
    saavnQueries: ['Arijit Singh', 'Atif Aslam', 'Shreya Ghoshal'],
    audiusQueries: ['hindi romantic mashup'],
  },
  chill: {
    saavnQueries: ['AP Dhillon', 'Prateek Kuhad', 'Anuv Jain'],
    audiusQueries: ['lofi chill beats'],
  },
  shaadi: {
    saavnQueries: ['Bollywood wedding shaadi', 'Mika Singh', 'Sukhbir'],
    audiusQueries: ['bhangra dhol remix'],
  },
  '90s': {
    saavnQueries: ['Kumar Sanu 90s', 'Udit Narayan', 'Alka Yagnik'],
    audiusQueries: ['90s bollywood remix'],
  },
  bhojpuri: {
    saavnQueries: ['Pawan Singh Bhojpuri', 'Khesari Lal Yadav', 'Shilpi Raj'],
    audiusQueries: ['bhojpuri dj'],
  },
  haryanvi: {
    saavnQueries: ['Sapna Choudhary', 'Masoom Sharma', 'Khasaa Aala Chahar'],
    audiusQueries: ['haryanvi dj'],
  },
  punjabi: {
    saavnQueries: ['Sidhu Moose Wala', 'Karan Aujla', 'Shubh'],
    audiusQueries: ['punjabi trap remix'],
  },
  tamil: {
    saavnQueries: ['Vaathi Coming Tamil', 'Arabic Kuthu Tamil', 'AR Rahman Tamil'],
    audiusQueries: ['tamil kuthu remix'],
  },
  global: {
    saavnQueries: ['Alan Walker', 'Dua Lipa', 'Coldplay'],
    audiusQueries: ['pop dance hits', 'top global remix'],
    preferAudius: true,
  },
  edm: {
    saavnQueries: ['Martin Garrix', 'Marshmello', 'David Guetta'],
    audiusQueries: ['progressive house festival edm', 'electronic bass drop'],
    preferAudius: true,
  },
  hiphop: {
    saavnQueries: ['Raftaar', 'Divine', 'Eminem'],
    audiusQueries: ['hip hop rap 808', 'desi hip hop'],
    preferAudius: true,
  },
  latin: {
    saavnQueries: ['Despacito', 'Shakira', 'J Balvin'],
    audiusQueries: ['reggaeton latin club', 'latin moombahton'],
    preferAudius: true,
  },
  kpop: {
    saavnQueries: ['Jungkook', 'Blackpink', 'BTS'],
    audiusQueries: ['kpop remix', 'korean pop dance'],
    preferAudius: true,
  },
  arabic: {
    saavnQueries: ['Nusrat Fateh Ali Khan', 'Habibi', 'Amr Diab'],
    audiusQueries: ['arabic house remix', 'middle eastern club'],
    preferAudius: true,
  },
};

const MODE_BPM_BASE: Record<DjModeId, number> = {
  banger: 128,
  dance: 124,
  romance: 88,
  chill: 84,
  shaadi: 130,
  '90s': 102,
  bhojpuri: 132,
  haryanvi: 126,
  punjabi: 108,
  tamil: 125,
  global: 118,
  edm: 128,
  hiphop: 96,
  latin: 104,
  kpop: 122,
  arabic: 114,
};

const MUSICAL_KEYS = [
  '1A · Abm',
  '2B · F#',
  '4A · Fm',
  '5A · Cm',
  '7B · F',
  '8A · Am',
  '9A · Em',
  '10B · D',
  '11A · F#m',
  '12B · E',
];

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function computeDeterministicMeta(seedStr: string, mode: DjModeId): { bpm: number; musicalKey: string } {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const baseBpm = MODE_BPM_BASE[mode] ?? 120;
  const bpmOffset = (hash % 17) - 8;
  const bpm = Math.max(72, Math.min(150, baseBpm + bpmOffset));
  const musicalKey = MUSICAL_KEYS[hash % MUSICAL_KEYS.length];
  return { bpm, musicalKey };
}

export async function safeParseApiJson<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!text) return null;
  const trimmed = text.trim();
  const looksLikeJson =
    contentType.toLowerCase().includes('application/json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');
  if (!looksLikeJson) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

const CLIENT_SEARCH_STOP_WORDS = new Set([
  'song',
  'songs',
  'gaana',
  'gana',
  'music',
  'mp3',
  'audio',
  'track',
  'tracks',
  'full',
  'hd',
  'video',
  'new',
  'latest',
  'hit',
  'hits',
  'best',
  'top',
  'download',
  'play',
]);

export function extractCoreSearchQuery(rawQuery: string): string {
  const words = rawQuery
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !CLIENT_SEARCH_STOP_WORDS.has(w.toLowerCase()));
  return words.join(' ').trim() || rawQuery.trim();
}

export function matchesTrackKeyword(
  track: Pick<Track, 'title' | 'artist' | 'album' | 'genre'>,
  rawQuery: string,
  caseSensitive: boolean
): boolean {
  const q = rawQuery.trim();
  if (!q) return true;
  const haystack = `${track.title} ${track.artist} ${track.album} ${track.genre}`;
  if (caseSensitive) {
    if (haystack.includes(q)) return true;
    const tokens = q.split(/\s+/).filter(Boolean);
    return tokens.length > 1 && tokens.every((tok) => haystack.includes(tok));
  }
  const lowerHay = haystack.toLowerCase();
  const core = extractCoreSearchQuery(q).toLowerCase();
  if (lowerHay.includes(q.toLowerCase()) || (core && lowerHay.includes(core))) {
    return true;
  }
  const coreTokens = core.split(/\s+/).filter((t) => t.length >= 2);
  if (coreTokens.length === 0) return true;
  return coreTokens.some((tok) => lowerHay.includes(tok));
}

export function sortTracksByKeywordRelevance(
  tracks: Track[],
  rawQuery: string,
  caseSensitive: boolean
): Track[] {
  const q = rawQuery.trim();
  if (!q) return tracks;
  const target = caseSensitive ? q : extractCoreSearchQuery(q).toLowerCase();
  const tokens = target.split(/\s+/).filter((t) => t.length >= 2);
  const score = (t: Track) => {
    const title = caseSensitive ? t.title : t.title.toLowerCase();
    const artist = caseSensitive ? t.artist : t.artist.toLowerCase();
    const haystack = caseSensitive
      ? `${t.title} ${t.artist} ${t.album} ${t.genre}`
      : `${t.title} ${t.artist} ${t.album} ${t.genre}`.toLowerCase();
    let s = 0;
    if (title === target) s += 140;
    else if (title.startsWith(target)) s += 90;
    else if (title.includes(target)) s += 60;
    if (artist.includes(target)) s += 45;
    if (tokens.length > 0) {
      const matched = tokens.filter((tok) => haystack.includes(tok)).length;
      s += matched * 15;
      if (matched === tokens.length) s += 35;
    }
    return s;
  };
  return [...tracks].sort((a, b) => score(b) - score(a));
}

async function fetchDirectSaavnTracks(
  query: string,
  modeTag: DjModeId,
  limit = 40,
  page = 1
): Promise<{ tracks: Track[]; total: number; rawCount: number }> {
  if (!query || containsMarathiMarker(query)) return { tracks: [], total: 0, rawCount: 0 };
  const url = `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { tracks: [], total: 0, rawCount: 0 };
    const payload = await safeParseApiJson<{
      data?: { total?: number; results?: Array<Record<string, unknown>> };
    }>(res);
    const results = Array.isArray(payload?.data?.results) ? payload.data.results : [];
    const total = typeof payload?.data?.total === 'number' ? payload.data.total : results.length;

    const tracks: Track[] = [];
    for (const item of results) {
      const lang = typeof item.language === 'string' ? item.language.toLowerCase() : '';
      if (lang === 'marathi') continue;

      const rawName = typeof item.name === 'string' ? decodeHtmlEntities(item.name) : '';
      const duration = typeof item.duration === 'number' ? item.duration : Number(item.duration ?? 0);
      if (!rawName || !Number.isFinite(duration) || duration < 60) continue;

      const artistsObj = item.artists as { primary?: Array<{ name?: string }> } | undefined;
      const primaryArtists = Array.isArray(artistsObj?.primary)
        ? artistsObj.primary.map((a) => decodeHtmlEntities(a.name || '')).filter(Boolean)
        : [];
      const artistName = primaryArtists.join(', ') || 'Featured Artist';

      const albumObj = item.album as { name?: string } | undefined;
      const albumName =
        typeof albumObj?.name === 'string' ? decodeHtmlEntities(albumObj.name) : 'Single';
      const genreLabel = lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : modeTag;

      if (
        isMarathiTrackMeta({
          title: rawName,
          artist: artistName,
          album: albumName,
          genre: genreLabel,
        })
      ) {
        continue;
      }

      const dlArr = Array.isArray(item.downloadUrl)
        ? (item.downloadUrl as Array<{ quality?: string; url?: string }>)
        : [];
      const bestAudio =
        dlArr.find((d) => d.quality === '320kbps')?.url ||
        dlArr.find((d) => d.quality === '160kbps')?.url ||
        dlArr[dlArr.length - 1]?.url ||
        '';
      if (!bestAudio) continue;

      const imgArr = Array.isArray(item.image)
        ? (item.image as Array<{ quality?: string; url?: string }>)
        : [];
      const artworkUrl =
        imgArr.find((i) => i.quality === '500x500')?.url ||
        imgArr[imgArr.length - 1]?.url ||
        '';

      const id = String(item.id ?? `${rawName}-${artistName}`);
      const releaseYear = typeof item.year === 'string' && item.year ? item.year : 'Full';
      const meta = computeDeterministicMeta(id, modeTag);

      tracks.push({
        id: `saavn-${id}`,
        title: rawName,
        artist: artistName,
        album: albumName,
        artworkUrl,
        audioUrl: bestAudio,
        previewUrl: bestAudio,
        durationSec: Math.round(duration),
        releaseYear,
        genre: genreLabel,
        modeTag,
        bpm: meta.bpm,
        musicalKey: meta.musicalKey,
        source: 'saavn',
      });
    }
    return { tracks, total, rawCount: results.length };
  } catch {
    return { tracks: [], total: 0, rawCount: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDirectAudiusTracks(
  query: string,
  modeTag: DjModeId,
  limit = 60,
  offset = 0
): Promise<{ tracks: Track[]; rawCount: number }> {
  if (!query || containsMarathiMarker(query)) return { tracks: [], rawCount: 0 };
  const url = `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=RintuBitDJ&limit=${limit}&offset=${offset}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { tracks: [], rawCount: 0 };
    const data = await safeParseApiJson<{ data?: Array<Record<string, unknown>> }>(res);
    const items = Array.isArray(data?.data) ? data.data : [];

    const tracks: Track[] = [];
    for (const item of items) {
      const id = typeof item.id === 'string' ? item.id : '';
      const title = typeof item.title === 'string' ? item.title : '';
      const userObj = item.user as Record<string, unknown> | undefined;
      const artistName = typeof userObj?.name === 'string' ? userObj.name : '';
      const genre = typeof item.genre === 'string' ? item.genre : 'DJ Mix';
      const duration = typeof item.duration === 'number' ? item.duration : 0;

      if (!id || !title || !artistName || duration < 60) continue;
      if (isMarathiTrackMeta({ title, artist: artistName, genre })) continue;

      const artworkObj = item.artwork as Record<string, unknown> | undefined;
      const artworkUrl =
        (typeof artworkObj?.['480x480'] === 'string' && artworkObj['480x480']) ||
        (typeof artworkObj?.['150x150'] === 'string' && artworkObj['150x150']) ||
        '';

      const streamUrl = `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(id)}/stream?app_name=RintuBitDJ`;
      const meta = computeDeterministicMeta(id, modeTag);

      tracks.push({
        id: `audius-${id}`,
        title,
        artist: artistName,
        album: 'Full DJ Track',
        artworkUrl,
        audioUrl: streamUrl,
        previewUrl: streamUrl,
        durationSec: Math.round(duration),
        releaseYear: 'Full',
        genre,
        modeTag,
        bpm: meta.bpm,
        musicalKey: meta.musicalKey,
        source: 'audius',
      });
    }
    return { tracks, rawCount: items.length };
  } catch {
    return { tracks: [], rawCount: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export interface CatalogBatchResult {
  tracks: Track[];
  totalAvailable: number;
  page: number;
  nextPage: number;
  hasMore: boolean;
}

export async function searchPaginatedDirectCatalog(options: {
  mode: DjModeId;
  query?: string;
  page?: number;
  pagesPerBatch?: number;
  caseSensitive?: boolean;
}): Promise<CatalogBatchResult> {
  const {
    mode,
    query = '',
    page = 1,
    pagesPerBatch = query.trim() ? 5 : 2,
    caseSensitive = false,
  } = options;
  const trimmed = query.trim();
  const coreQuery = trimmed ? extractCoreSearchQuery(trimmed) : '';
  const searchQueryList =
    trimmed && coreQuery.toLowerCase() !== trimmed.toLowerCase()
      ? [trimmed, coreQuery]
      : [trimmed];
  const cfg = CLIENT_MODE_QUERIES[mode] || CLIENT_MODE_QUERIES.banger;
  const saavnQueries = trimmed ? searchQueryList : cfg.saavnQueries;
  const audiusQueries = trimmed ? searchQueryList : cfg.audiusQueries;
  const preferAudius = trimmed ? false : Boolean(cfg.preferAudius);

  const safeSaavn = saavnQueries.filter((q) => !containsMarathiMarker(q));
  const safeAudius = audiusQueries.filter((q) => !containsMarathiMarker(q));
  if (safeSaavn.length === 0 && safeAudius.length === 0) {
    return { tracks: [], totalAvailable: 0, page, nextPage: page, hasMore: false };
  }

  const pageNumbers = Array.from({ length: pagesPerBatch }, (_, idx) => page + idx);
  const audiusOffset = Math.max(0, Math.floor((page - 1) / Math.max(1, pagesPerBatch)) * 80);

  const [saavnResults, audiusResults] = await Promise.all([
    Promise.all(safeSaavn.flatMap((q) => pageNumbers.map((p) => fetchDirectSaavnTracks(q, mode, 40, p)))),
    Promise.all(safeAudius.map((q) => fetchDirectAudiusTracks(q, mode, 80, audiusOffset))),
  ]);

  const saavnFlat = saavnResults.flatMap((r) => r.tracks);
  const audiusFlat = audiusResults.flatMap((r) => r.tracks);
  const saavnRawTotal = saavnResults.reduce((acc, r) => acc + r.rawCount, 0);
  const audiusRawTotal = audiusResults.reduce((acc, r) => acc + r.rawCount, 0);
  const maxSaavnTotal = saavnResults.reduce((mx, r) => Math.max(mx, r.total), 0);

  const combined = preferAudius ? [...audiusFlat, ...saavnFlat] : [...saavnFlat, ...audiusFlat];

  const seen = new Set<string>();
  const deduped: Track[] = [];
  const apiFallbackPool: Track[] = [];
  for (const track of combined) {
    if (track.durationSec < 60 || isMarathiTrackMeta(track)) continue;
    const normKey = `${track.title.toLowerCase().trim()}::${track.artist.toLowerCase().split(',')[0].trim()}`;
    if (seen.has(normKey)) continue;
    seen.add(normKey);

    if (trimmed) {
      if (matchesTrackKeyword(track, trimmed, caseSensitive)) {
        deduped.push(track);
      } else if (!caseSensitive) {
        apiFallbackPool.push(track);
      }
    } else {
      deduped.push(track);
    }
  }

  if (trimmed && !caseSensitive && deduped.length < 18 && apiFallbackPool.length > 0) {
    deduped.push(...apiFallbackPool);
  }

  const sorted = trimmed ? sortTracksByKeywordRelevance(deduped, trimmed, caseSensitive) : deduped;
  const nextPage = page + pagesPerBatch;

  return {
    tracks: sorted,
    totalAvailable: Math.max(sorted.length, maxSaavnTotal + audiusFlat.length),
    page,
    nextPage,
    hasMore: (saavnRawTotal >= 10 || audiusRawTotal >= 20) && nextPage <= 165,
  };
}

export async function fetchQuickSearchSuggestions(
  query: string,
  mode: DjModeId,
  caseSensitive = false
): Promise<Track[]> {
  const clean = query.trim();
  if (clean.length < 2 || containsMarathiMarker(clean)) return [];

  try {
    const params = new URLSearchParams({
      genre: mode,
      q: clean,
      page: '1',
      pages: '1',
      caseSensitive: caseSensitive ? '1' : '0',
    });
    const res = await fetch(`/api/tracks?${params.toString()}`);
    const data = await safeParseApiJson<{ tracks?: Track[] }>(res);
    if (res.ok && data && Array.isArray(data.tracks) && data.tracks.length > 0) {
      return data.tracks.filter((t) => !isMarathiTrackMeta(t)).slice(0, 8);
    }
  } catch {
    // Fall back to direct Saavn + Audius lookup below
  }

  const core = extractCoreSearchQuery(clean);
  const [saavnRes, audiusRes] = await Promise.all([
    fetchDirectSaavnTracks(core || clean, mode, 10, 1),
    fetchDirectAudiusTracks(core || clean, mode, 6, 0),
  ]);
  const combined = [...saavnRes.tracks, ...audiusRes.tracks].filter((t) => !isMarathiTrackMeta(t));
  const sorted = sortTracksByKeywordRelevance(combined, clean, caseSensitive);
  if (caseSensitive) {
    return sorted.filter((t) => matchesTrackKeyword(t, clean, true)).slice(0, 8);
  }
  return sorted.slice(0, 8);
}

export async function searchDirectFullCatalog(
  saavnQueries: string[],
  audiusQueries: string[],
  modeTag: DjModeId,
  maxResults = 40,
  preferAudius = false
): Promise<Track[]> {
  const safeSaavn = saavnQueries.filter((q) => !containsMarathiMarker(q));
  const safeAudius = audiusQueries.filter((q) => !containsMarathiMarker(q));
  if (safeSaavn.length === 0 && safeAudius.length === 0) return [];

  const [saavnBatches, audiusBatches] = await Promise.all([
    Promise.all(safeSaavn.map((q) => fetchDirectSaavnTracks(q, modeTag, 24, 1))),
    Promise.all(safeAudius.map((q) => fetchDirectAudiusTracks(q, modeTag, 24, 0))),
  ]);

  const saavnFlat = saavnBatches.flatMap((b) => b.tracks);
  const audiusFlat = audiusBatches.flatMap((b) => b.tracks);
  const combined = preferAudius ? [...audiusFlat, ...saavnFlat] : [...saavnFlat, ...audiusFlat];

  const seen = new Set<string>();
  const deduped: Track[] = [];
  for (const track of combined) {
    if (track.durationSec < 60 || isMarathiTrackMeta(track)) continue;
    const normKey = `${track.title.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim()}::${track.artist.toLowerCase().split(',')[0].trim()}`;
    if (seen.has(normKey)) continue;
    seen.add(normKey);
    deduped.push(track);
    if (deduped.length >= maxResults) break;
  }

  return deduped;
}

export async function fetchDirectCatalog(mode: DjModeId, query = ''): Promise<Track[]> {
  const batch = await searchPaginatedDirectCatalog({ mode, query, page: 1, pagesPerBatch: query.trim() ? 4 : 2 });
  return batch.tracks;
}

function inferModeFromPrompt(prompt: string, fallbackMode: DjModeId): DjModeId {
  const lower = prompt.toLowerCase();
  if (/(bhojpuri|pawan|khesari|shilpi|purvanchal)/.test(lower)) return 'bhojpuri';
  if (/(haryanvi|sapna|masoom|jaat|desi bass)/.test(lower)) return 'haryanvi';
  if (/(punjabi|sidhu|moose|karan aujla|diljit|bhangra|shubh)/.test(lower)) return 'punjabi';
  if (/(tamil|kuthu|anirudh|rahman|kollywood|chennai)/.test(lower)) return 'tamil';
  if (/(90s|retro|kumar sanu|udit|alka|old school|classic)/.test(lower)) return '90s';
  if (/(shaadi|wedding|baraat|sangeet|haldi|mehndi|dhol)/.test(lower)) return 'shaadi';
  if (/(romanc|love|ishq|pyar|arijit|atif|couples|rain)/.test(lower)) return 'romance';
  if (/(chill|lofi|lo-fi|night|drive|relax|sleep|indie|anuv|prateek)/.test(lower)) return 'chill';
  if (/(edm|festival|house|techno|drop|electro|garrix|marshmello)/.test(lower)) return 'edm';
  if (/(hip\s*hop|rap|808|eminem|divine|raftaar|trap)/.test(lower)) return 'hiphop';
  if (/(latin|reggaeton|shakira|balvin|salsa|despacito)/.test(lower)) return 'latin';
  if (/(kpop|k-pop|bts|blackpink|jungkook|korean)/.test(lower)) return 'kpop';
  if (/(arabic|sufi|habibi|qawwali|nusrat|middle east)/.test(lower)) return 'arabic';
  if (/(global|english|pop|dua lipa|weeknd|taylor|international)/.test(lower)) return 'global';
  if (/(dance|party|club|floor|disco|gym|workout)/.test(lower)) return 'dance';
  if (/(banger|hard|bass|dj|remix|hype)/.test(lower)) return 'banger';
  return fallbackMode;
}

export async function buildClientAiFilterFallback(
  prompt: string,
  currentMode: DjModeId
): Promise<AiFilterResponse> {
  const recommendedMode = inferModeFromPrompt(prompt, currentMode);
  const modeMeta = DJ_MODES.find((m) => m.id === recommendedMode) || DJ_MODES[0];
  const cfg = CLIENT_MODE_QUERIES[recommendedMode];

  const cleanedPrompt = prompt
    .replace(/\b(songs?|music|mix|crate|play|dj|please|banao|sunao|chalao|chahiye|best|hits?)\b/gi, '')
    .trim();

  const searchQueries = cleanedPrompt
    ? [cleanedPrompt, ...cfg.saavnQueries.slice(0, 2)]
    : cfg.saavnQueries.slice(0, 3);

  let tracks = await searchDirectFullCatalog(
    searchQueries,
    cfg.audiusQueries,
    recommendedMode,
    24,
    Boolean(cfg.preferAudius)
  );

  if (tracks.length === 0) {
    tracks = await fetchDirectCatalog(recommendedMode, '');
  }

  return {
    crate: {
      setTitle: `${modeMeta.label} Smart Crate`,
      djNote: `Matched full-length ${modeMeta.label} tracks for "${prompt}" with Marathi excluded.`,
      recommendedMode,
      searchQueries,
      autoPlayFirst: true,
    },
    mixerPreset: {
      bassBoostDb: modeMeta.defaultBassBoostDb,
      targetPitch: modeMeta.defaultPitch,
      crossfadeDurationSec: 4,
      bangerMode: modeMeta.bangerActive,
    },
    tracks,
  };
}

export async function buildClientAiSuggestFallback(
  currentTrack: { title: string; artist: string; genre: string; bpm: number } | undefined,
  activeMode: DjModeId,
  recentTitles: string[]
): Promise<AiSuggestResponse> {
  const cfg = CLIENT_MODE_QUERIES[activeMode] || CLIENT_MODE_QUERIES.banger;
  const queries = [
    currentTrack?.artist ? currentTrack.artist.split(',')[0].trim() : '',
    ...cfg.saavnQueries.slice(0, 2),
  ].filter(Boolean);

  const candidates = await searchDirectFullCatalog(
    queries,
    cfg.audiusQueries,
    activeMode,
    18,
    Boolean(cfg.preferAudius)
  );

  const recentSet = new Set(recentTitles.map((t) => t.toLowerCase()));
  const picked = candidates.filter((t) => !recentSet.has(t.title.toLowerCase())).slice(0, 6);
  const finalPicks = picked.length > 0 ? picked : candidates.slice(0, 6);

  return {
    headline: currentTrack
      ? `Next Mix Picks after "${currentTrack.title}"`
      : 'AI Curated Next Tracks',
    suggestions: finalPicks.map((track) => ({
      track,
      aiReason: currentTrack
        ? `Matches ${activeMode.toUpperCase()} groove near ${currentTrack.bpm} BPM for smooth transition.`
        : `High-energy ${activeMode.toUpperCase()} full-length pick ready for Deck B.`,
    })),
  };
}
