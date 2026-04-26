// "discover" — NetEase personalized recommendations. Uses /recommend/songs
// (daily personalized, requires login cookie, matches the user's long-term
// taste). Falls back to an empty queue on error; radio.js surfaces that.

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
      // Surface to the user via radio.js — the empty-queue path reads
      // `error` and shows it in the status line. Without this the UI was
      // indistinguishable from "mode selected, nothing happened".
      return { queue: [], error: 'NetEase 推荐暂不可用' };
    }

    const daily = r?.data?.dailySongs || [];
    if (!daily.length) return { queue: [], error: 'NetEase 今日暂无推荐' };

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
