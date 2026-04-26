// "daily" — a mix that stays fixed for the calendar day. Re-clicking daily
// inside the same day returns the same queue (matches NCM's 日推 feel:
// you can rely on it through the day). At local-midnight the cache invalidates
// and the next click computes a fresh mix.
//
// Weights favor:
//   (a) songs you haven't heard in the last 7 days (avoid repetition)
//   (b) higher play-count songs (what you actually like)
// Evaluated ONCE per day at first build — so playing songs from the mix
// during the day doesn't reshuffle what's already in it. Cache is session-
// local (not persisted): restart muse and you get a new mix for the day.
// Acceptable first cut; persist to muse.store if stability across launches
// becomes important.

import { weightedSample } from './_util.js';

const MIX_SIZE = 40;
const WEEK = 7 * 24 * 60 * 60 * 1000;

let cache = null; // { dayKey, queue }

function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export default {
  id: 'daily',
  label: 'daily',
  description: 'a mix for today',

  async build({ library, now }) {
    const ts = now ?? Date.now();
    const tracks = library.tracks;
    if (!tracks.length) { cache = null; return { queue: [] }; }

    const key = dayKey(ts);
    // Reuse if same day AND the cached queue still has at least half its
    // tracks in library (guards against a library refresh nuking most of
    // the mix — e.g. user un-hearted a batch on NetEase mid-day).
    if (cache && cache.dayKey === key) {
      const present = cache.queue.filter((t) => tracks.some((x) => x.id === t.id));
      if (present.length >= Math.min(MIX_SIZE, tracks.length) / 2) {
        return { queue: present };
      }
    }

    const queue = weightedSample(tracks, (t) => {
      const stale = ts - (t.lastPlayedAt || 0) > WEEK ? 1.6 : 0.4;
      const loved = 1 + Math.log2(1 + (t.playCount || 0));
      return stale * loved;
    }, MIX_SIZE);
    cache = { dayKey: key, queue };
    return { queue };
  },
};
