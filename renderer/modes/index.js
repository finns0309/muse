// Mode registry. Adding a new mode = create a sibling file that default-exports
// a mode object, then add one line of import + one entry in MODES below.
// Nothing else needs to change: command entries render from this array.
//
// Mode contract (see ./all.js for the simplest example):
//   {
//     id:          string        // stable — persisted in ui-prefs
//     label:       string        // shown to user
//     description: string        // one-liner tooltip/hint
//     singleLoop?: boolean       // if true, audio.loop = true on activation
//     async build(ctx):          // compute the queue + starting track
//       returns { queue, startIdx? }
//       where queue is an array of Track (from library.tracks) and startIdx
//       picks where to begin (defaults to 0).
//   }
// ctx = { library, player, likedIds, now } — all read-only snapshots. Modes
// should NOT mutate state directly; returning a queue is the whole job.

import all from './all.js';
import daily from './daily.js';
import discover from './discover.js';
import digup from './digup.js';
import immersive from './immersive.js';
import similar from './similar.js';
import single from './single.js';

export const MODES = [all, daily, discover, digup, immersive, similar, single];
export const byId = Object.fromEntries(MODES.map((m) => [m.id, m]));
