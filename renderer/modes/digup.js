// "dig up" — songs you haven't played in a long while, or never. Threshold
// auto-relaxes from 180d down to 30d if the library is young. The final
// 0d tier would always match everything (so a library with any track at
// all will always hit one of the earlier tiers first); dropping it keeps
// the intent explicit — "you're supposed to have ignored these for a bit".

import { shuffle } from './_util.js';

const THRESHOLDS_MS = [180, 90, 30].map((d) => d * 24 * 60 * 60 * 1000);
const MAX_QUEUE = 50;

export default {
  id: 'digup',
  label: 'dig up',
  description: 'long forgotten',

  async build({ library, now }) {
    const ts = now ?? Date.now();
    const tracks = library.tracks;
    if (!tracks.length) return { queue: [] };

    for (const cutoff of THRESHOLDS_MS) {
      const hit = tracks.filter((t) => {
        const last = t.lastPlayedAt || 0;
        return last === 0 || (ts - last) >= cutoff;
      });
      if (hit.length) return { queue: shuffle(hit.slice()).slice(0, MAX_QUEUE) };
    }
    // Brand-new library where every song was just played within 30 days.
    // Rare but possible on fresh installs — fall back to the full library
    // so the user still hears something rather than staring at a silent UI.
    return { queue: shuffle(tracks.slice()).slice(0, MAX_QUEUE) };
  },
};
