import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { containsMarathiMarker, isMarathiTrackMeta } from './src/utils/marathiFilter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

type DjModeId =
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

interface ServerTrack {
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

const MODE_SEARCH_QUERIES: Record<
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

function createProxiedUrl(rawUrl: string): string {
  return `/api/audio-proxy?url=${encodeURIComponent(rawUrl)}`;
}

const trackCache = new Map<string, { timestamp: number; tracks: ServerTrack[] }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

async function fetchSaavnFullTracks(
  query: string,
  modeTag: DjModeId,
  limit = 14
): Promise<ServerTrack[]> {
  if (containsMarathiMarker(query)) return [];
  const url = `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const payload = (await res.json()) as {
      success?: boolean;
      data?: { results?: Array<Record<string, unknown>> };
    };
    const results = Array.isArray(payload?.data?.results) ? payload.data.results : [];

    const tracks: ServerTrack[] = [];
    for (const item of results) {
      const lang = typeof item.language === 'string' ? item.language.toLowerCase() : '';
      if (lang === 'marathi') continue;

      const rawName = typeof item.name === 'string' ? decodeHtmlEntities(item.name) : '';
      const duration = typeof item.duration === 'number' ? item.duration : Number(item.duration ?? 0);
      // Enforce full songs only (skip short clips < 60s)
      if (!rawName || !Number.isFinite(duration) || duration < 60) continue;

      const artistsObj = item.artists as { primary?: Array<{ name?: string }> } | undefined;
      const primaryArtists = Array.isArray(artistsObj?.primary)
        ? artistsObj.primary.map((a) => decodeHtmlEntities(a.name || '')).filter(Boolean)
        : [];
      const artistName = primaryArtists.join(', ') || 'Featured Artist';

      const albumObj = item.album as { name?: string } | undefined;
      const albumName = typeof albumObj?.name === 'string' ? decodeHtmlEntities(albumObj.name) : 'Single';

      const genreLabel = lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : modeTag;

      if (isMarathiTrackMeta({ title: rawName, artist: artistName, album: albumName, genre: genreLabel })) {
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
        audioUrl: createProxiedUrl(bestAudio),
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
    return tracks;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAudiusFullTracks(
  query: string,
  modeTag: DjModeId,
  limit = 10
): Promise<ServerTrack[]> {
  if (containsMarathiMarker(query)) return [];
  const url = `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=RintuBitDJ&limit=${limit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const items = Array.isArray(data.data) ? data.data : [];

    const tracks: ServerTrack[] = [];
    for (const item of items) {
      const id = typeof item.id === 'string' ? item.id : '';
      const title = typeof item.title === 'string' ? item.title : '';
      const userObj = item.user as Record<string, unknown> | undefined;
      const artistName = typeof userObj?.name === 'string' ? userObj.name : '';
      const genre = typeof item.genre === 'string' ? item.genre : 'DJ Mix';
      const duration = typeof item.duration === 'number' ? item.duration : 0;

      // Enforce full songs only (>= 60 seconds)
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
        audioUrl: createProxiedUrl(streamUrl),
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
    return tracks;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function searchFullSongCatalog(
  saavnQueries: string[],
  audiusQueries: string[],
  modeTag: DjModeId,
  maxResults = 24,
  preferAudius = false
): Promise<ServerTrack[]> {
  const safeSaavn = saavnQueries.filter((q) => !containsMarathiMarker(q));
  const safeAudius = audiusQueries.filter((q) => !containsMarathiMarker(q));
  if (safeSaavn.length === 0 && safeAudius.length === 0) return [];

  const cacheKey = `full::${modeTag}::${preferAudius}::${safeSaavn.join('|')}::${safeAudius.join('|')}::${maxResults}`;
  const cached = trackCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.tracks;
  }

  const [saavnBatches, audiusBatches] = await Promise.all([
    Promise.all(safeSaavn.map((q) => fetchSaavnFullTracks(q, modeTag, 12))),
    Promise.all(safeAudius.map((q) => fetchAudiusFullTracks(q, modeTag, 10))),
  ]);

  const saavnFlat = saavnBatches.flat();
  const audiusFlat = audiusBatches.flat();

  const combined = preferAudius
    ? [...audiusFlat, ...saavnFlat]
    : [...saavnFlat, ...audiusFlat];

  const seen = new Set<string>();
  const deduped: ServerTrack[] = [];
  for (const track of combined) {
    if (track.durationSec < 60) continue;
    if (isMarathiTrackMeta(track)) continue;
    const normKey = `${track.title.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim()}::${track.artist.toLowerCase().split(',')[0].trim()}`;
    if (seen.has(normKey)) continue;
    seen.add(normKey);
    deduped.push(track);
    if (deduped.length >= maxResults) break;
  }

  if (deduped.length > 0) {
    trackCache.set(cacheKey, { timestamp: Date.now(), tracks: deduped });
  }
  return deduped;
}

function isAllowedAudioHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith('.saavncdn.com') ||
      host.endsWith('.audius.co') ||
      host.endsWith('.mzstatic.com') ||
      host.endsWith('.apple.com')
    );
  } catch {
    return false;
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Full-Length World & Indian Music Catalog Endpoint (Zero-Key, No 30s Clips, Marathi Blocked)
  app.get('/api/tracks', async (req: Request, res: Response) => {
    try {
      const genreParam = typeof req.query.genre === 'string' ? req.query.genre.toLowerCase() : 'banger';
      const queryParam = typeof req.query.q === 'string' ? req.query.q.trim() : '';

      if (queryParam && containsMarathiMarker(queryParam)) {
        res.status(403).json({
          blocked: true,
          error:
            'Marathi songs are blocked on Rintu Bit DJ. Search any Hindi, 90s, Bhojpuri, Haryanvi, Punjabi, Tamil, or Global song instead.',
          tracks: [],
        });
        return;
      }

      const validModes = Object.keys(MODE_SEARCH_QUERIES) as DjModeId[];
      const mode: DjModeId = validModes.includes(genreParam as DjModeId)
        ? (genreParam as DjModeId)
        : 'banger';

      const modeConfig = MODE_SEARCH_QUERIES[mode];
      const tracks = queryParam
        ? await searchFullSongCatalog([queryParam], [queryParam], mode, 24, false)
        : await searchFullSongCatalog(
            modeConfig.saavnQueries,
            modeConfig.audiusQueries,
            mode,
            24,
            Boolean(modeConfig.preferAudius)
          );

      res.json({
        mode,
        query: queryParam || null,
        tracks,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch full-song catalog.';
      res.status(500).json({ error: msg });
    }
  });

  // 2. Streaming CORS-Safe Audio Proxy with Range Support & Optional File Download
  app.get('/api/audio-proxy', async (req: Request, res: Response) => {
    const targetUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const isDownload = req.query.download === '1' || req.query.download === 'true';
    const rawFilename = typeof req.query.filename === 'string' ? req.query.filename : 'rintu-bit-dj-track';

    if (!targetUrl || !isAllowedAudioHost(targetUrl)) {
      res.status(400).json({ error: 'Invalid or disallowed audio URL.' });
      return;
    }

    try {
      const upstreamHeaders: Record<string, string> = {};
      if (typeof req.headers.range === 'string' && !isDownload) {
        upstreamHeaders.Range = req.headers.range;
      }

      const upstreamRes = await fetch(targetUrl, { headers: upstreamHeaders, redirect: 'follow' });
      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        res.status(upstreamRes.status).end();
        return;
      }

      res.status(upstreamRes.status);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');

      const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      for (const h of forwardHeaders) {
        const val = upstreamRes.headers.get(h);
        if (val) res.setHeader(h, val);
      }

      if (isDownload) {
        const contentType = upstreamRes.headers.get('content-type') || '';
        const ext = contentType.includes('mpeg') || targetUrl.includes('audius') ? 'mp3' : 'm4a';
        const safeName =
          rawFilename
            .replace(/[^a-zA-Z0-9\s_-]/g, '')
            .trim()
            .replace(/\s+/g, '_')
            .slice(0, 64) || 'rintu_bit_dj_track';
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${ext}"`);
      }

      if (upstreamRes.body) {
        const nodeStream = Readable.fromWeb(upstreamRes.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
        nodeStream.on('error', () => {
          if (!res.headersSent) res.status(502).end();
          else res.end();
        });
        nodeStream.pipe(res);
      } else {
        const arrayBuffer = await upstreamRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      }
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Unable to proxy audio stream.' });
      }
    }
  });

  // 3. AI Smart DJ Filter & Set Curator Endpoint (Full Songs Only, Marathi Strictly Blocked)
  app.post('/api/ai/filter', async (req: Request, res: Response) => {
    try {
      const promptText = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      const currentMode = typeof req.body?.currentMode === 'string' ? req.body.currentMode : 'banger';

      if (!promptText) {
        res.status(400).json({ error: 'Please describe a mood, genre, artist, or party vibe to filter.' });
        return;
      }

      if (containsMarathiMarker(promptText)) {
        res.status(403).json({
          blocked: true,
          error:
            'Marathi songs are blocked by the console filter. Ask for Hindi, 90s, Bhojpuri, Haryanvi, Punjabi, Tamil, EDM, Hip-Hop, or any other world music!',
        });
        return;
      }

      const ai = getGeminiClient();

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `User DJ Request: "${promptText}"\nCurrent Console Mode: "${currentMode}"`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are Rintu Bit DJ AI Curator specializing in ALL full-length world & Indian music EXCEPT Marathi: ' +
            'Global Hits, EDM/House, Hip-Hop/Rap, Latin/Reggaeton, K-Pop, Arabic/Sufi, Banger Mode, Dance, Romance, Chill, Shaadi, 90s Bollywood (Kumar Sanu, Udit Narayan, Alka Yagnik), Bhojpuri (Pawan Singh, Khesari Lal Yadav), Haryanvi (Sapna Choudhary, Masoom Sharma), Punjabi (Sidhu Moose Wala, Diljit Dosanjh, Karan Aujla, AP Dhillon, Shubh), and Tamil (Anirudh Ravichander, AR Rahman, Vijay). ' +
            'STRICT RULE: NEVER suggest, search for, or include ANY Marathi songs, Marathi artists (e.g. Ajay-Atul, Adarsh Shinde, Sanju Rathod, Kratex, Avadhoot Gupte, Bela Shende), or Marathi albums. ' +
            'Generate 2 to 3 crisp single-artist or focused song queries (e.g. "Pawan Singh", "Sapna Choudhary", "Kumar Sanu", "Anirudh", "Alan Walker") for clean full-track lookup.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              setTitle: {
                type: Type.STRING,
                description: 'Short evocative DJ set name (max 5 words).',
              },
              djNote: {
                type: Type.STRING,
                description: 'One-sentence energetic DJ mixing tip or track vibe summary.',
              },
              recommendedMode: {
                type: Type.STRING,
                description:
                  'One of: banger, dance, romance, chill, shaadi, 90s, bhojpuri, haryanvi, punjabi, tamil, global, edm, hiphop, latin, kpop, arabic.',
              },
              searchQueries: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 to 3 crisp non-Marathi artist or song search queries.',
              },
              bassBoostDb: {
                type: Type.NUMBER,
                description: 'Recommended low EQ bass boost in dB between -4 and 10.',
              },
              targetPitch: {
                type: Type.NUMBER,
                description: 'Recommended playback speed/tempo multiplier between 0.92 and 1.12.',
              },
              crossfadeDurationSec: {
                type: Type.NUMBER,
                description: 'Recommended crossfade duration in seconds between 2 and 6.',
              },
              bangerMode: {
                type: Type.BOOLEAN,
                description: 'True for high-energy banger, shaadi, dance, edm, or mass bass vibes.',
              },
            },
            required: [
              'setTitle',
              'djNote',
              'recommendedMode',
              'searchQueries',
              'bassBoostDb',
              'targetPitch',
              'crossfadeDurationSec',
              'bangerMode',
            ],
          },
        },
      });

      const rawJson = (aiResponse.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson) as {
        setTitle?: string;
        djNote?: string;
        recommendedMode?: string;
        searchQueries?: string[];
        bassBoostDb?: number;
        targetPitch?: number;
        crossfadeDurationSec?: number;
        bangerMode?: boolean;
      };

      const validModes = Object.keys(MODE_SEARCH_QUERIES) as DjModeId[];
      const recommendedMode: DjModeId = validModes.includes(parsed.recommendedMode as DjModeId)
        ? (parsed.recommendedMode as DjModeId)
        : 'banger';

      const modeConfig = MODE_SEARCH_QUERIES[recommendedMode];
      const aiQueries = Array.isArray(parsed.searchQueries)
        ? parsed.searchQueries.filter((q) => !containsMarathiMarker(q)).slice(0, 3)
        : [];
      const searchQueries = aiQueries.length > 0 ? aiQueries : modeConfig.saavnQueries;

      let tracks = await searchFullSongCatalog(
        searchQueries,
        searchQueries.slice(0, 1),
        recommendedMode,
        20,
        Boolean(modeConfig.preferAudius)
      );
      if (tracks.length === 0) {
        tracks = await searchFullSongCatalog(
          modeConfig.saavnQueries,
          modeConfig.audiusQueries,
          recommendedMode,
          20,
          Boolean(modeConfig.preferAudius)
        );
      }

      res.json({
        crate: {
          setTitle: parsed.setTitle || `${recommendedMode.toUpperCase()} AI Mix`,
          djNote: parsed.djNote || 'Full-length tracks filtered and matched for seamless dual-deck transitions.',
          recommendedMode,
          searchQueries,
          autoPlayFirst: true,
        },
        mixerPreset: {
          bassBoostDb: Math.max(-6, Math.min(10, Number(parsed.bassBoostDb ?? 4))),
          targetPitch: Math.max(0.85, Math.min(1.2, Number(parsed.targetPitch ?? 1.0))),
          crossfadeDurationSec: Math.max(2, Math.min(8, Number(parsed.crossfadeDurationSec ?? 4))),
          bangerMode: Boolean(parsed.bangerMode),
        },
        tracks,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI DJ filter encountered an error.';
      res.status(500).json({ error: msg });
    }
  });

  // 4. AI Next Song Recommendation Engine (Full Songs Only, Marathi Blocked)
  app.post('/api/ai/suggest', async (req: Request, res: Response) => {
    try {
      const currentTrack = req.body?.currentTrack as
        | { title?: string; artist?: string; genre?: string; bpm?: number }
        | undefined;
      const activeModeParam = typeof req.body?.activeMode === 'string' ? req.body.activeMode : 'banger';
      const recentTitles = Array.isArray(req.body?.recentTitles)
        ? (req.body.recentTitles as string[]).slice(0, 12)
        : [];

      const validModes = Object.keys(MODE_SEARCH_QUERIES) as DjModeId[];
      const mode: DjModeId = validModes.includes(activeModeParam as DjModeId)
        ? (activeModeParam as DjModeId)
        : 'banger';

      const ai = getGeminiClient();

      const contextText = currentTrack?.title
        ? `Currently Playing Track: "${currentTrack.title}" by ${currentTrack.artist ?? 'Unknown'} (Genre: ${currentTrack.genre ?? mode}, ~${currentTrack.bpm ?? 120} BPM). Active Mode: ${mode}. Avoid repeating: ${recentTitles.join(', ') || 'none'}.`
        : `Active DJ Mode: ${mode}. Avoid repeating: ${recentTitles.join(', ') || 'none'}. Suggest fresh, exciting non-Marathi songs for this mood.`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: contextText,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are Rintu Bit DJ AI Recommender. Suggest 5 fresh, real popular Indian or global songs (Hindi, 90s, Punjabi, Bhojpuri, Haryanvi, Tamil, English Pop, EDM, Hip-Hop, Latin, K-Pop, Arabic) that pair seamlessly with the playing track or mode. ' +
            'STRICT RULE: NEVER recommend any Marathi song or Marathi artist. ' +
            'For each suggestion, provide a crisp searchQuery ("Song Title" or "Song Title Artist") plus a brief 1-sentence reason.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: {
                type: Type.STRING,
                description: 'Short catchy title for these AI song picks (max 6 words).',
              },
              picks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    searchQuery: {
                      type: Type.STRING,
                      description: 'Exact real non-Marathi song title and artist name.',
                    },
                    reason: {
                      type: Type.STRING,
                      description: 'Brief 6-12 word reason why this song fits the current vibe or BPM.',
                    },
                  },
                  required: ['searchQuery', 'reason'],
                },
              },
            },
            required: ['headline', 'picks'],
          },
        },
      });

      const rawJson = (aiResponse.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson) as {
        headline?: string;
        picks?: Array<{ searchQuery?: string; reason?: string }>;
      };

      const picks = Array.isArray(parsed.picks) ? parsed.picks.slice(0, 6) : [];
      if (picks.length === 0) {
        res.status(500).json({ error: 'AI did not return song suggestions. Try again.' });
        return;
      }

      const recentLower = new Set(recentTitles.map((t) => t.toLowerCase()));
      const lookupResults = await Promise.all(
        picks.map(async (pick) => {
          const q = (pick.searchQuery || '').trim();
          if (!q || containsMarathiMarker(q)) return null;
          let found = await fetchSaavnFullTracks(q, mode, 5);
          if (found.length === 0) {
            found = await fetchAudiusFullTracks(q, mode, 4);
          }
          const match = found.find((t) => !recentLower.has(t.title.toLowerCase())) || found[0];
          if (!match || isMarathiTrackMeta(match) || match.durationSec < 60) return null;
          return {
            track: match,
            aiReason: pick.reason || 'Matched by AI for energy and groove continuity.',
          };
        })
      );

      const seenIds = new Set<string>();
      const suggestions = lookupResults.filter((item): item is { track: ServerTrack; aiReason: string } => {
        if (!item) return false;
        if (seenIds.has(item.track.id)) return false;
        seenIds.add(item.track.id);
        return true;
      });

      res.json({
        headline: parsed.headline || 'AI Picks For Your Mix',
        suggestions,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI song suggestion failed.';
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Rintu Bit DJ server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
