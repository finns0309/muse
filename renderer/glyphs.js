// Canonical glyph vocabulary — the single source of truth for every Unicode
// mark used in the command surface. Mirrors the design-system spec
// (brand-glyphs). Change a glyph here and it changes everywhere.
//
// muse deliberately uses Unicode glyphs (not an icon font / SVG set): the
// surface is text-first, and these read crisply at the list's 13.5px.

export const GLYPH = {
  MARK:     '❯', // U+276F  the prompt mark — mono, accent, breathes (.cmdk-mark)
  SEP:      '·', // U+00B7  separator — "noun · detail"

  // row markers — prefix a result row to signal its kind
  LIKED:    '♥', // U+2665  a hearted / library track
  PLAYING:  '▶', // U+25B6  the currently-playing track (queue view)
  QUEUED:   '↳', // U+21B3  an up-next track (queue view)
  PLAYLIST: '▸', // U+25B8  a saved playlist
  MODE:     '◆', // U+25C6  a radio mode
  NETEASE:  '↓', // U+2193  a NetEase cloud-search hit (not in your library)

  // keyboard keycaps — documented by the spec; rendered only if a hint bar
  // is ever reintroduced (the Spotlight surface currently has none)
  CMD: '⌘', OPT: '⌥', SHIFT: '⇧', ENTER: '↵', ESC: '⎋', UP: '↑', DOWN: '↓',
};

// Row prefix = marker + the standard two-space gutter before the label.
export const prefix = (mark) => `${mark}  `;
