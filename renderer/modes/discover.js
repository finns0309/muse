// "discover" — NetEase personalized recommendations. Uses /recommend/songs
// (daily personalized, requires login cookie, matches the user's long-term
// taste). Falls back to an empty queue on error; the mode runner logs that.

import { api } from '../api.js';
import { shuffle } from './_util.js';

export default {
  id: 'discover',
  label: 'discover',
  description: 'fresh picks from NetEase',

  async build({ player } = {}) {
    let r;
    try { r = await api('/recommend/songs'); }
    catch (e) {
      console.warn('[discover] /recommend/songs failed', e.message);
      return { queue: [], error: 'NetEase recommendations unavailable' };
    }

    const daily = r?.data?.dailySongs || [];
    if (!daily.length) return { queue: [], error: 'no recommendations today' };

    // Normalize into the Track shape the player expects, but DON'T add these
    // to the local library — discover songs are ephemeral recommendations,
    // not things the user has committed to liking. library stays 红心-only.
    const queue = shuffle(daily.map((s) => ({
      id: s.id,
      name: s.name,
      ar: (s.ar || []).map((a) => ({ id: a.id, name: a.name })),
      al: { id: s.al?.id, name: s.al?.name, picUrl: s.al?.picUrl },
      dt: s.dt || 0,
    })));

    // /recommend/songs is a daily list, so NetEase often returns the same
    // ordered payload all day. Shuffle locally, then avoid starting on the
    // current track when the user clicks discover again.
    if (queue.length > 1 && player?.track?.id === queue[0].id) {
      queue.push(queue.shift());
    }
    return { queue };
  },
};
