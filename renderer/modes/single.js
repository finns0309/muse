// "single" — loop the track you're currently listening to. If nothing is
// playing yet, anchors to the last track in player state; failing that, the
// most-recently-played song in the library. The singleLoop flag tells the
// player to loop this one track (manually, so each round is counted/scrobbled).

export default {
  id: 'single',
  label: 'single',
  description: 'loop this one',
  singleLoop: true,

  async build({ library, player }) {
    let anchor = player?.track;

    if (!anchor) {
      const tracks = library.tracks;
      if (!tracks.length) return { queue: [] };
      anchor = tracks.slice().sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))[0];
    }
    return { queue: anchor ? [anchor] : [] };
  },
};
