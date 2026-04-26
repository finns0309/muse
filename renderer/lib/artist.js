// NetEase artist helper. Used by immersive mode to extend a single-artist
// queue beyond the local liked library without turning it into "similar radio".

import { api } from '../api.js';

export async function fetchArtistSongs(artistId, { limit = 80 } = {}) {
  if (!artistId) return [];
  const r = await api('/artist/songs', {
    id: artistId,
    limit,
    order: 'hot',
  });
  const songs = r?.songs || r?.data?.songs || [];
  return songs.map(normalizeSong).filter((s) => s?.id);
}

function normalizeSong(s) {
  return {
    id: s.id,
    name: s.name,
    ar: (s.ar || s.artists || []).map((a) => ({ id: a.id, name: a.name })),
    al: {
      id: s.al?.id ?? s.album?.id,
      name: s.al?.name ?? s.album?.name,
      picUrl: s.al?.picUrl ?? s.album?.picUrl,
    },
    dt: s.dt || s.duration || 0,
    addedAt: Date.now(),
    lastPlayedAt: 0,
    playCount: 0,
  };
}
