// "similar" — build a radio from songs similar to what's currently playing.
// If nothing is playing, seed from a random liked track so the mode still
// works from a cold start (rather than producing an empty queue and confusing
// the user). Results come from NetEase /simi/song — curated by them, so this
// mode naturally reaches *outside* the local library.

import { fetchSimilar } from '../lib/similar.js';

export default {
  id: 'similar',
  label: 'similar',
  description: 'more like what you’re playing',

  async build({ library, player }) {
    const seed = player?.track || pickRandom(library?.tracks);
    if (!seed?.id) return { queue: [] };

    let similar = [];
    try { similar = await fetchSimilar(seed.id, { limit: 30 }); }
    catch (e) { console.warn('[similar] fetch failed', e.message); return { queue: [] }; }
    if (!similar.length) return { queue: [] };

    // Prepend the seed so the transition feels continuous — you hear the song
    // that triggered the mode, then similars. If the seed is already playing
    // (most common case), setQueue no-ops the audio element and just swaps
    // the queue behind the scenes.
    return { queue: [seed, ...similar], startIdx: 0 };
  },
};

function pickRandom(arr) {
  if (!arr?.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}
