// "immersive" — deep-dive the currently playing primary artist. It behaves
// like similar mode in shape (seed current song, replace queue), but unlike
// similar it never broadens into recommendation radio: every queued track is
// from that one artist.

import { shuffle } from './_util.js';
import { fetchArtistSongs } from '../lib/artist.js';

export default {
  id: 'immersive',
  label: 'immersive',
  description: 'one artist, deep',

  async build({ library, player }) {
    const seed = player?.track || pickRandom(library?.tracks);
    const artist = seed?.ar?.[0];
    if (!seed?.id || !artist?.id) return { queue: [] };

    const local = (library?.tracks || []).filter((t) => t.ar?.[0]?.id === artist.id);
    let remote = [];
    try { remote = await fetchArtistSongs(artist.id, { limit: 80 }); }
    catch (e) { console.warn('[immersive] artist songs failed', e.message); }

    const queue = dedupeById([
      seed,
      ...shuffle(local.filter((t) => t.id !== seed.id).slice()),
      ...shuffle(remote.filter((t) => t.id !== seed.id && t.ar?.[0]?.id === artist.id).slice()),
    ]);

    return { queue, startIdx: 0 };
  },
};

function pickRandom(arr) {
  if (!arr?.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function dedupeById(tracks) {
  const seen = new Set();
  const out = [];
  for (const track of tracks) {
    if (!track?.id || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}
