// "all" — everything in your library, shuffled.

import { shuffle } from './_util.js';

export default {
  id: 'all',
  label: 'all',
  description: 'everything, shuffled',

  async build({ library }) {
    const queue = shuffle(library.tracks.slice());
    return { queue };
  },
};
