import type { OfflineTrack, Track } from '../types/music';

const DB_NAME = 'swarmix_offline_vault';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

interface StoredRecord {
  id: string;
  track: OfflineTrack;
  audioBlob: Blob;
  artworkDataUrl?: string;
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open offline storage.'));
  });
}

async function blobToDataUrl(blob: Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(blob);
  });
}

export async function saveTrackOffline(track: Track): Promise<OfflineTrack> {
  const audioRes = await fetch(track.audioUrl);
  if (!audioRes.ok) {
    throw new Error('Could not download audio stream for offline storage.');
  }
  const audioBlob = await audioRes.blob();

  let artworkDataUrl: string | undefined;
  if (track.artworkUrl) {
    try {
      const artRes = await fetch(track.artworkUrl);
      if (artRes.ok) {
        const artBlob = await artRes.blob();
        artworkDataUrl = await blobToDataUrl(artBlob);
      }
    } catch {
      // Ignore artwork offline cache failure; fallback cover handles offline display
    }
  }

  const offlineTrack: OfflineTrack = {
    ...track,
    artworkUrl: artworkDataUrl || track.artworkUrl,
    savedAt: Date.now(),
    sizeBytes: audioBlob.size,
  };

  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: StoredRecord = {
      id: track.id,
      track: offlineTrack,
      audioBlob,
      artworkDataUrl,
    };
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save offline track.'));
  });

  return offlineTrack;
}

export async function getOfflineTracks(): Promise<OfflineTrack[]> {
  try {
    const db = await openVaultDb();
    return await new Promise<OfflineTrack[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredRecord[]) || [];
        const tracks = rows
          .map((r) => r.track)
          .sort((a, b) => b.savedAt - a.savedAt);
        resolve(tracks);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getOfflineAudioUrl(trackId: string): Promise<string | null> {
  try {
    const db = await openVaultDb();
    const record = await new Promise<StoredRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(trackId);
      req.onsuccess = () => resolve(req.result as StoredRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!record?.audioBlob) return null;
    return URL.createObjectURL(record.audioBlob);
  } catch {
    return null;
  }
}

export async function removeOfflineTrack(trackId: string): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to remove offline track.'));
  });
}

export async function triggerDeviceDownload(track: Track): Promise<void> {
  // Prefer offline blob if already cached, else download directly via proxy attachment endpoint
  const offlineObjectUrl = await getOfflineAudioUrl(track.id);
  const safeName = `${track.title} - ${track.artist}`
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'swarmix_song';

  if (offlineObjectUrl) {
    const a = document.createElement('a');
    a.href = offlineObjectUrl;
    a.download = `${safeName}.m4a`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(offlineObjectUrl), 3000);
    return;
  }

  const downloadUrl = `/api/audio-proxy?url=${encodeURIComponent(track.previewUrl)}&download=1&filename=${encodeURIComponent(safeName)}`;
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${safeName}.m4a`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
