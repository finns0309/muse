// NetEase "similar songs" helper. Wraps /simi/song into a fetch + normalize
// that returns Tracks in the same shape library.js uses, so the result can be
// fed straight into player.setQueue(). Kept as its own module (rather than
// inlined in the radio mode) so cmdk can call it too — they share the "seed
// a queue from one song" primitive.

import { api } from '../api.js';

// Fetch songs similar to `seedId` and return a normalized queue. Deduplicates
// against `seedId` itself (NetEase occasionally includes the seed) and caps
// length to `limit`. Throws ApiError on network/API failure — callers toast.
//
// These tracks are ephemeral recommendations; they do NOT get added to the
// local library. The library stays strictly 红心 — the user likes songs on
// NetEase, and muse mirrors that. Playing a simi-song is like putting on a
// radio: you hear it, you don't "own" it.
export async function fetchSimilar(seedId, { limit = 30 } = {}) {
  if (typeof seedId !== 'number') throw new TypeError('fetchSimilar: seedId must be a number');

  const r = await api('/simi/song', { id: seedId, limit });
  const songs = r?.songs || [];
  return songs
    .filter((s) => s.id !== seedId)
    .map((s) => ({
      id: s.id,
      name: s.name,
      // /simi/song uses the "artists"/"album" names rather than ar/al — normalize.
      ar: (s.artists || []).map((a) => ({ id: a.id, name: a.name })),
      al: { id: s.album?.id, name: s.album?.name, picUrl: s.album?.picUrl },
      dt: s.duration || 0,
    }));
}
