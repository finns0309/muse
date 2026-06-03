// Command builders. Each is a pure function (query) => Entry[] that produces
// the list items for a given input. Sync builders run on every keystroke;
// async builders race against the latest input via store.race('cmdk').

import { store, actions } from './store.js';
import { MODES } from './modes/index.js';
import {
  buildQueueForPickedTrack,
  describeSession,
  setManualSession,
  setRadioSession,
} from './modes/session.js';
import * as player from './player.js';
import { fetchSimilar } from './lib/similar.js';
import { toggleHeart } from './lib/library.js';
import { api } from './api.js';
import * as playlist from './playlist.js';

// ---- Shared entry factories -------------------------------------------------

export function formatArtists(track) {
  return (track.ar || track.artists || []).map((a) => a.name).join(', ');
}

function sharedActions(track) {
  const isHearted = store.get().library.tracks.some((t) => t.id === track.id);
  return {
    altRun: async () => {
      const ok = store.race('song-run');
      const similars = await fetchSimilar(track.id, { limit: 30 });
      if (!ok()) return {};
      setRadioSession(track);
      await player.setQueue([track, ...similars], { startIdx: 0 });
      return similars.length
        ? { ok: `radio · 1 + ${similars.length} tracks` }
        : { warn: 'no similar tracks found, playing this one only' };
    },
    altLabel: 'start radio',
    heartRun: () => toggleHeart(track).then((r) => ({
      ok: r.isHearted ? `liked · ${track.name}` : `unliked · ${track.name}`,
    })),
    heartLabel: isHearted ? 'unlike' : 'like',
  };
}

export function songEntry(track, { prefix = '' } = {}) {
  const isHearted = store.get().library.tracks.some((t) => t.id === track.id);
  return {
    kind: isHearted ? 'library-song' : 'song',
    label: prefix + track.name,
    hint: formatArtists(track) || track.al?.name || '',
    run: async () => {
      const ok = store.race('song-run');
      const result = await buildQueueForPickedTrack(track, { preserveMode: isHearted });
      if (!ok()) return {};
      if (!result.mode) setManualSession(track);
      await player.setQueue(result.queue, { startIdx: 0 });
      player.setLoop(!!result.mode?.singleLoop);
      return { ok: `${describeSession()} · ${track.name}` };
    },
    ...sharedActions(track),
  };
}

function queueEntry(track, idx, isCurrent) {
  return {
    kind: isCurrent ? 'queue-current' : 'queue-item',
    label: (isCurrent ? '▶  ' : '↳  ') + track.name,
    hint: formatArtists(track) || track.al?.name || '',
    run: () => {
      if (isCurrent) return { close: true };
      player.playAt(idx);
      return { ok: `playing · ${track.name}`, close: true };
    },
    ...sharedActions(track),
  };
}

// ---- List builders ----------------------------------------------------------

function buildQueueEntries(filter, queue, queueIdx) {
  if (!queue.length) {
    return [{ kind: 'queue-empty', label: 'queue · empty', hint: 'search for a song first', run: () => ({}) }];
  }
  const f = (filter || '').trim().toLowerCase();
  const out = [];
  queue.forEach((track, i) => {
    if (f) {
      const name = (track.name || '').toLowerCase();
      const artists = (track.ar || []).map((a) => a.name).join(' ').toLowerCase();
      if (!name.includes(f) && !artists.includes(f)) return;
    }
    out.push(queueEntry(track, i, i === queueIdx));
  });
  return out;
}

function buildLibraryEntries(filter, tracks) {
  if (!tracks.length) {
    return [{ kind: 'library-empty', label: 'library · empty', hint: 'like songs on NetEase first', run: () => ({}) }];
  }
  const f = (filter || '').trim().toLowerCase();
  const sorted = tracks.slice().sort((a, b) =>
    (b.lastPlayedAt || b.addedAt || 0) - (a.lastPlayedAt || a.addedAt || 0)
  );
  const filtered = f
    ? sorted.filter((t) => {
        const name = (t.name || '').toLowerCase();
        const artists = (t.ar || []).map((a) => a.name).join(' ').toLowerCase();
        return name.includes(f) || artists.includes(f);
      })
    : sorted;
  if (f && !filtered.length) {
    return [{ kind: 'library-empty', label: 'no matches', hint: '', run: () => ({}) }];
  }
  return filtered.map((t) => songEntry(t, { prefix: '♥  ' }));
}

// ---- Helpers ----------------------------------------------------------------

function normalizeCommand(s) {
  return String(s || '').toLowerCase().replace(/[\s._-]+/g, '');
}

function commandMatches(q, parts) {
  if (!q) return true;
  const query = normalizeCommand(q);
  return parts.some((p) => normalizeCommand(p).includes(query));
}

function parseAccentCommand(q) {
  const m = String(q || '').trim().match(/^accent\s+(#[0-9a-f]{6})$/i);
  return m ? m[1].toLowerCase() : null;
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

function scoreLibrary(q, tracks) {
  const query = normalize(q);
  if (!query) return [];
  return tracks
    .map((track) => {
      const name = normalize(track.name);
      const artists = normalize(formatArtists(track));
      const album = normalize(track.al?.name || '');
      let score = 0;
      if (name === query) score += 100;
      else if (name.startsWith(query)) score += 80;
      else if (name.includes(query)) score += 55;
      if (artists.includes(query)) score += 35;
      if (album.includes(query)) score += 20;
      if (!score) return null;
      score += Math.min(12, Math.log2(1 + (track.playCount || 0)) * 3);
      if (track.lastPlayedAt) score += Math.max(0, 8 - (Date.now() - track.lastPlayedAt) / 86400000);
      return { track, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

// ---- Exported builder arrays ------------------------------------------------

// `setInput` is injected by cmdk.js so builders can programmatically fill the
// search box (e.g. expanding a hint into a full view). Avoids a circular import.
let setInput = () => {};
export function injectSetInput(fn) { setInput = fn; }

export const COMMAND_BUILDERS = [
  // Queue
  (q) => {
    const tokens = (q || '').trim().split(/\s+/).filter(Boolean);
    const head = normalizeCommand(tokens[0] || '');
    const { queue, queueIdx } = store.get().player;
    if (head && 'queue'.startsWith(head)) {
      return buildQueueEntries(tokens.slice(1).join(' '), queue, queueIdx);
    }
    if (!queue.length) return [];
    if (head) return [];
    const remaining = Math.max(0, queue.length - (queueIdx + 1));
    return [{
      kind: 'queue-hint',
      label: describeSession() + ' · queue',
      hint: remaining ? `${remaining} up next` : 'last track',
      run: () => { setInput('/queue'); return {}; },
    }];
  },
  // Library
  (q) => {
    const tokens = (q || '').trim().split(/\s+/).filter(Boolean);
    const head = normalizeCommand(tokens[0] || '');
    const tracks = store.get().library.tracks;
    if (head && 'library'.startsWith(head) && !'queue'.startsWith(head)) {
      return buildLibraryEntries(tokens.slice(1).join(' '), tracks);
    }
    if (!tracks.length || head) return [];
    return [{
      kind: 'library-hint',
      label: `library · ${tracks.length} songs`,
      hint: 'browse liked',
      run: () => { setInput('/library'); return {}; },
    }];
  },
  // Playlist
  (q) => {
    const tokens = (q || '').trim().split(/\s+/).filter(Boolean);
    const head = normalizeCommand(tokens[0] || '');
    const saved = playlist.getAll();
    if (!head || (!'playlist'.startsWith(head) && head !== 'pl')) {
      if (!head && saved.length) {
        return [{
          kind: 'playlist-hint',
          label: `playlist · ${saved.length} saved`,
          hint: 'browse playlists',
          run: () => { setInput('/pl'); return {}; },
        }];
      }
      return [];
    }
    const rawArg = tokens.slice(1).join(' ').trim();
    const plId = playlist.parseId(rawArg);
    if (plId) {
      const existing = saved.find((p) => p.id === plId);
      return [{
        kind: 'playlist-load',
        label: existing ? `playlist · ${existing.name}` : `playlist · load #${plId}`,
        hint: existing ? `${existing.trackCount} tracks · Enter to play` : 'Enter to load & play',
        run: () => playlist.load(plId),
      }];
    }
    const filter = rawArg.toLowerCase();
    const filtered = filter ? saved.filter((p) => p.name.toLowerCase().includes(filter)) : saved;
    const entries = filtered.map((p) => ({
      kind: 'playlist-saved',
      label: `▸  ${p.name}`,
      hint: `${p.trackCount} tracks`,
      run: () => playlist.load(p.id),
    }));
    entries.push({
      kind: 'playlist-add',
      label: 'playlist · add new',
      hint: 'paste ID or URL after /pl',
      run: () => ({ warn: 'usage: /pl <id or URL>' }),
    });
    return entries;
  },
  // Modes
  (q) => MODES
    .filter((m) => commandMatches(q, ['mode', 'radio', m.id, m.label, m.description || '']))
    .map((m) => ({
      kind: 'mode',
      label: 'mode · ' + m.label,
      hint: m.description || '',
      run: () => { actions.setMode(m.id); return { ok: `mode · ${m.label}` }; },
    })),
  // Appearance
  (q) => {
    const out = [];
    if (commandMatches(q, ['light', 'appearance', 'scheme'])) {
      out.push({
        kind: 'appearance',
        label: 'appearance · light',
        hint: 'quiet light surface',
        run: () => { actions.setAppearanceScheme('light'); return { ok: 'appearance · light' }; },
      });
    }
    if (commandMatches(q, ['dark', 'appearance', 'scheme'])) {
      out.push({
        kind: 'appearance',
        label: 'appearance · dark',
        hint: 'quiet dark surface',
        run: () => { actions.setAppearanceScheme('dark'); return { ok: 'appearance · dark' }; },
      });
    }
    const accent = parseAccentCommand(q);
    if (accent) {
      out.push({
        kind: 'appearance',
        label: 'appearance · accent',
        hint: accent,
        run: () => { actions.setAccent(accent); return { ok: `accent · ${accent}` }; },
      });
    } else if (commandMatches(q, ['accent', 'color', 'colour'])) {
      out.push({
        kind: 'appearance',
        label: 'appearance · accent #rrggbb',
        hint: `current ${store.get().appearance.accent}`,
        run: () => ({ warn: 'usage: /accent #d8b35f' }),
      });
    }
    return out;
  },
];

export const SONG_BUILDERS = [
  (q) => {
    if (q.length < 1) return [];
    return scoreLibrary(q, store.get().library.tracks)
      .slice(0, 8)
      .map(({ track }) => songEntry(track, { prefix: '♥  ' }));
  },
];

export const ASYNC_BUILDERS = [
  async (q, { signal, ok }) => {
    if (q.length < 2) return [];
    let songs = [];
    try {
      const r = await api('/cloudsearch', { keywords: q, type: 1, limit: 8 }, { signal });
      songs = r.result?.songs || [];
    } catch { return []; }
    if (!ok()) return [];
    const inLib = new Set(store.get().library.tracks.map((t) => t.id));
    return songs
      .filter((s) => !inLib.has(s.id))
      .map((s) => songEntry(
        { id: s.id, name: s.name, ar: s.ar, al: s.al, dt: s.dt },
        { prefix: '▶  ' }
      ));
  },
];
