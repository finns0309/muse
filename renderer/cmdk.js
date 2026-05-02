// Command palette. ⌘K opens; the input dispatches to one of several command
// builders. Each builder is a pure function (query) => Entry[] that runs
// either synchronously (modes, tabs) or asynchronously (NCM search).
//
// Adding a command type = append one async builder to BUILDERS. The runner
// races async results against the latest keystroke via store.race('cmdk').

import { store, actions } from './store.js';
import { MODES } from './modes/index.js';
import * as player from './player.js';
import { fetchSimilar } from './lib/similar.js';
import { toggleHeart } from './lib/library.js';
import { api } from './api.js';

let rootEl, inputEl, listEl, toastEl, hintEl, nowEl, nowCoverEl, nowTitleEl, nowArtistEl, nowTimeEl, nowProgressEl;
let entries = [];
let cursor = 0;
let toastTimer = null;

export function mount(el) {
  rootEl = el;
  rootEl.innerHTML = `
    <div class="cmdk-backdrop"></div>
    <div class="cmdk-panel">
      <div class="cmdk-now" data-role="now" hidden>
        <div class="cmdk-now__cover" data-role="now-cover"></div>
        <div class="cmdk-now__meta">
          <div class="cmdk-now__title" data-role="now-title"></div>
          <div class="cmdk-now__artist" data-role="now-artist"></div>
          <div class="cmdk-now__progress"><span data-role="now-progress"></span></div>
        </div>
        <div class="cmdk-now__time" data-role="now-time">0:00</div>
      </div>
      <div class="cmdk-input-row">
        <span class="cmdk-mark" aria-hidden="true">❯</span>
        <input class="cmdk-input" spellcheck="false" aria-label="Search songs or commands">
      </div>
      <ul class="cmdk-list"></ul>
      <div class="cmdk-toast" role="status"></div>
      <div class="cmdk-hint muted"></div>
    </div>`;
  inputEl = rootEl.querySelector('.cmdk-input');
  listEl  = rootEl.querySelector('.cmdk-list');
  toastEl = rootEl.querySelector('.cmdk-toast');
  hintEl  = rootEl.querySelector('.cmdk-hint');
  nowEl = rootEl.querySelector('[data-role=now]');
  nowCoverEl = rootEl.querySelector('[data-role=now-cover]');
  nowTitleEl = rootEl.querySelector('[data-role=now-title]');
  nowArtistEl = rootEl.querySelector('[data-role=now-artist]');
  nowTimeEl = rootEl.querySelector('[data-role=now-time]');
  nowProgressEl = rootEl.querySelector('[data-role=now-progress]');

  rootEl.querySelector('.cmdk-backdrop').addEventListener('click', actions.closeCmdk);
  inputEl.addEventListener('input', refresh);
  inputEl.addEventListener('keydown', onKey);

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); actions.openCmdk(); }
    if (e.key === 'Escape' && store.get().cmdkOpen) actions.closeCmdk();
  });

  store.select((s) => s.cmdkOpen, (open) => {
    rootEl.classList.toggle('open', open);
    if (open) {
      // Allow callers (e.g. radio.js queue badge click) to pre-fill the input
      // via openWith() before this subscriber fires. Consumed-once, so the
      // next plain ⌘K open shows the normal empty state.
      inputEl.value = pendingOpenInput;
      pendingOpenInput = '';
      refresh();
      setTimeout(() => inputEl.focus(), 10);
    }
  });
  store.selectKey(
    (s) => `${s.player.track?.id ?? 0}|${Math.floor(s.player.currentTime)}|${Math.floor(s.player.duration)}`,
    renderNow
  );
}

function renderNow() {
  const p = store.get().player;
  const t = p.track;
  if (!t) {
    nowEl.hidden = true;
    return;
  }
  nowEl.hidden = false;
  nowTitleEl.textContent = t.name || '';
  nowArtistEl.textContent = formatArtists(t) || t.al?.name || '';
  nowTimeEl.textContent = fmtTime(p.currentTime || 0);
  const pct = p.duration ? Math.max(0, Math.min(100, p.currentTime / p.duration * 100)) : 0;
  nowProgressEl.style.width = `${pct}%`;
  const cover = t.al?.picUrl;
  if (cover) nowCoverEl.style.setProperty('--cover', `url("${cover}")`);
  else nowCoverEl.style.removeProperty('--cover');
}

// Programmatic entry point for non-keyboard openings (e.g. clicking the
// queue badge in the radio tab). Pre-fills the input before the cmdkOpen
// observer resets it, so the caller gets exactly the view they asked for.
let pendingOpenInput = '';
export function openWith(prefill) {
  pendingOpenInput = String(prefill || '');
  actions.openCmdk();
}

// ---- Command builders ------------------------------------------------------

const COMMAND_BUILDERS = [
  // Queue — peek at what's up next (and jump to any position). Placed first
  // because a `/`-prefix browse surface should lead with the thing the user
  // is most likely actually reaching for mid-listen.
  //   `/`          → a single "queue · …" hint line (if a queue exists)
  //   `/q` / `/qu` / … / `/queue` → full queue listing (any prefix expands,
  //       so intermediate typing doesn't flicker between hint and expanded)
  //   `/queue foo` → queue filtered to entries containing "foo"
  (q) => {
    const tokens = (q || '').trim().split(/\s+/).filter(Boolean);
    const head = normalizeCommand(tokens[0] || '');
    const { queue, queueIdx } = store.get().player;
    // Any non-empty prefix of 'queue' → expand. No other commands start
    // with 'q' right now, so the ambiguity is theoretical.
    if (head && 'queue'.startsWith(head)) {
      return buildQueueEntries(tokens.slice(1).join(' '), queue, queueIdx);
    }
    if (!queue.length) return [];
    // Empty command input: show a discoverable hint entry users can Enter on.
    if (head) return [];
    const remaining = Math.max(0, queue.length - (queueIdx + 1));
    return [{
      kind: 'queue-hint',
      label: 'queue · 看看队列',
      hint: remaining ? `后面还有 ${remaining} 首` : '当前歌曲是最后一首',
      // Enter on the hint expands the view. Don't close the palette — the
      // user asked to peek, not to re-open it.
      run: () => { inputEl.value = '/queue'; refresh(); return {}; },
    }];
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
        run: () => ({ warn: '输入 /accent #d8b35f' }),
      });
    }
    return out;
  },
];

const SONG_BUILDERS = [
  // Local library search comes before remote NetEase search: muse is primarily
  // a router for the user's own library, with cloud search as a fallback.
  (q) => {
    if (q.length < 1) return [];
    return scoreLibrary(q, store.get().library.tracks)
      .slice(0, 8)
      .map(({ track }) => songEntry(track, { prefix: '♥  ' }));
  },
];

const ASYNC_BUILDERS = [
  // NetEase search — only fires for query length >= 2 to keep keystrokes cheap.
  async (q, { signal, ok }) => {
    if (q.length < 2) return [];
    let songs = [];
    try {
      const r = await api('/cloudsearch', { keywords: q, type: 1, limit: 8 }, { signal });
      songs = r.result?.songs || [];
    } catch { return []; }
    if (!ok()) return [];
    // Drop cloud hits that are already in library — they already rendered via
    // SONG_BUILDERS with the ♥ prefix, no point showing them twice.
    const inLib = new Set(store.get().library.tracks.map((t) => t.id));
    return songs
      .filter((s) => !inLib.has(s.id))
      .map((s) => songEntry(
        { id: s.id, name: s.name, ar: s.ar, al: s.al, dt: s.dt },
        { prefix: '▶  ' }
      ));
  },
];

// Empty-query state: show the user's 红心 sorted by recency-of-use. Driven by
// lastPlayedAt, falling back to addedAt for songs never played through muse so
// a fresh install still has something in the palette. This is the "⌘K Enter
// keeps the vibe going" affordance — which is 80% of the daily use pattern.
function buildRecents(limit = 8) {
  const tracks = store.get().library.tracks;
  if (!tracks.length) return [];
  return tracks
    .slice()
    .sort((a, b) => (b.lastPlayedAt || b.addedAt || 0) - (a.lastPlayedAt || a.addedAt || 0))
    .slice(0, limit)
    .map((t) => songEntry(t, { prefix: t.lastPlayedAt ? '↺  ' : '♥  ' }));
}

// Queue entries. Primary action JUMPS to that position in the current queue
// (different from songEntry, which REPLACES the queue). Radio / heart actions
// are the same as the generic song entry so keybindings stay consistent.
function buildQueueEntries(filter, queue, queueIdx) {
  if (!queue.length) {
    return [{ kind: 'queue-empty', label: 'queue · 空', hint: '先挑首歌听', run: () => ({}) }];
  }
  const f = (filter || '').trim().toLowerCase();
  const entries = [];
  queue.forEach((track, i) => {
    if (f) {
      const name = (track.name || '').toLowerCase();
      const artists = (track.ar || []).map((a) => a.name).join(' ').toLowerCase();
      if (!name.includes(f) && !artists.includes(f)) return;
    }
    entries.push(queueEntry(track, i, i === queueIdx));
  });
  return entries;
}

function queueEntry(track, idx, isCurrent) {
  const isHearted = store.get().library.tracks.some((t) => t.id === track.id);
  return {
    kind: isCurrent ? 'queue-current' : 'queue-item',
    // ▶ marks the currently playing track so the user can orient; other rows
    // are prefixed with a subtle arrow to signal "will play".
    label: (isCurrent ? '▶  ' : '↳  ') + track.name,
    hint: formatArtists(track) || track.al?.name || '',
    // Enter → jump to this position. We close the palette because the user's
    // intent was navigation, not browsing — they got what they came for.
    run: () => {
      if (isCurrent) return { close: true }; // already playing — just dismiss
      player.playAt(idx);
      return { ok: `playing · ${track.name}`, close: true };
    },
    altRun: async () => {
      const similars = await fetchSimilar(track.id, { limit: 30 });
      await player.setQueue([track, ...similars], { startIdx: 0 });
      return similars.length
        ? { ok: `电台已生成 · 1 + ${similars.length} 首` }
        : { warn: '没有找到相似歌曲，只播了这一首' };
    },
    altLabel: '以此开电台',
    heartRun: () => toggleHeart(track).then((r) => ({
      ok: r.isHearted ? `红心 · ${track.name}` : `取消红心 · ${track.name}`,
    })),
    heartLabel: isHearted ? '取消红心' : '加红心',
  };
}

// Single factory for every song-shaped entry (library, cloud search, recents).
// Unified because all three need the same three actions: play (Enter), radio
// (⌥Enter), heart toggle (⌘D). Duplicating them across three builders was
// costing more than the abstraction.
function songEntry(track, { prefix = '' } = {}) {
  const isHearted = store.get().library.tracks.some((t) => t.id === track.id);
  return {
    kind: isHearted ? 'library-song' : 'song',
    label: prefix + track.name,
    hint: formatArtists(track) || track.al?.name || '',
    run: () => Promise.resolve(player.setQueue([track], { startIdx: 0 }))
      .then(() => ({ ok: `playing · ${track.name}` })),
    // ⌥Enter — start a radio seeded from this song (NCM /simi/song). The
    // seed plays first, similars queue behind it.
    altRun: async () => {
      const similars = await fetchSimilar(track.id, { limit: 30 });
      await player.setQueue([track, ...similars], { startIdx: 0 });
      return similars.length
        ? { ok: `电台已生成 · 1 + ${similars.length} 首` }
        : { warn: '没有找到相似歌曲，只播了这一首' };
    },
    altLabel: '以此开电台',
    // ⌘D — toggle 红心. The label captures the state at build time; it'll
    // drift if the user toggles without re-rendering, but the next keystroke
    // fixes it. Not worth a live subscription inside the entry.
    heartRun: () => toggleHeart(track).then((r) => ({
      ok: r.isHearted ? `红心 · ${track.name}` : `取消红心 · ${track.name}`,
    })),
    heartLabel: isHearted ? '取消红心' : '加红心',
  };
}

// ---- Runner ----------------------------------------------------------------

let searchCtrl = null;

async function refresh() {
  const raw = inputEl.value.trim();
  const isCommandQuery = raw.startsWith('/');
  const q = isCommandQuery ? raw.slice(1).trim() : raw;

  // Strict dispatch — no more bleeding commands into bare song search.
  //   `/` prefix    → commands only
  //   empty bare    → recents (so ⌘K⏎ replays the last thing)
  //   non-empty bare→ song search (library + cloud)
  if (isCommandQuery) {
    entries = COMMAND_BUILDERS.flatMap((b) => b(q));
  } else if (!q) {
    entries = buildRecents();
  } else {
    entries = SONG_BUILDERS.flatMap((b) => b(q));
  }
  cursor = 0;
  renderList();

  searchCtrl?.abort();
  searchCtrl = new AbortController();
  const ok = store.race('cmdk');
  if (isCommandQuery || !q) return;

  // Run all async builders concurrently; merge whichever resolve first.
  for (const b of ASYNC_BUILDERS) {
    b(q, { signal: searchCtrl.signal, ok })
      .then((res) => {
        if (!ok()) return;
        entries.push(...res);
        renderList();
      })
      .catch(() => {});
  }
}

function matches(q, label) { return label.toLowerCase().includes(q.toLowerCase()); }
function commandMatches(q, parts) {
  if (!q) return true;
  const query = normalizeCommand(q);
  return parts.some((p) => normalizeCommand(p).includes(query));
}

function normalizeCommand(s) {
  return String(s || '').toLowerCase().replace(/[\s._-]+/g, '');
}

function parseAccentCommand(q) {
  const m = String(q || '').trim().match(/^accent\s+(#[0-9a-f]{6})$/i);
  return m ? m[1].toLowerCase() : null;
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

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

function formatArtists(track) {
  return (track.ar || track.artists || []).map((a) => a.name).join(', ');
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Rebuild the full <li> list. Call ONLY when `entries` changes — cursor
// movement should go through setCursor() so we don't nuke the DOM underneath
// a mousedown (which drops the subsequent click) or re-trigger mouseenter on
// the element the mouse happens to sit on (which stomped keyboard nav).
function renderList() {
  listEl.innerHTML = '';
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'cmdk-empty';
    li.textContent = inputEl.value.trim() ? '无结果' : '输入歌曲，或 / 过滤命令';
    listEl.appendChild(li);
    return;
  }
  entries.forEach((e, i) => {
    const li = document.createElement('li');
    if (i === cursor) li.classList.add('sel');
    const label = document.createElement('span'); label.className = 'lbl'; label.textContent = e.label;
    const hint  = document.createElement('span'); hint.className = 'hint'; hint.textContent = e.hint || '';
    li.append(label, hint);
    // click, not mousedown — letting mouseup complete on the same element
    // is exactly the native click semantics we want. Modifier-click mirrors
    // the keyboard variants: ⌘ → heart, ⌥ → radio, plain → play.
    li.addEventListener('click', (ev) => execute(i, pickVariant(ev)));
    // `mousemove` rather than `mouseenter`: mouseenter auto-fires on DOM
    // insertion if the cursor already sits over the element, which would
    // instantly override any keyboard-driven cursor change.
    li.addEventListener('mousemove', () => setCursor(i));
    listEl.appendChild(li);
  });
  renderHint();
}

function pickVariant(ev) {
  if (ev.metaKey && !ev.altKey) return 'heart';
  if (ev.altKey) return 'alt';
  return 'primary';
}

function setCursor(i) {
  if (i === cursor || i < 0 || i >= entries.length) return;
  const prev = listEl.children[cursor];
  if (prev) prev.classList.remove('sel');
  cursor = i;
  const next = listEl.children[cursor];
  if (next) {
    next.classList.add('sel');
    // Keep the selected row visible when navigating by keyboard past the
    // viewport edge. No-op if it's already in view.
    next.scrollIntoView({ block: 'nearest' });
  }
  renderHint();
}

// Footer text adapts to the selected entry: show each alternate binding only
// when the current entry actually supports it. Keeps the hint line honest
// instead of advertising keys that would just beep.
function renderHint() {
  if (!hintEl) return;
  const entry = entries[cursor];
  const parts = ['↑↓', 'Enter', 'Esc'];
  if (entry?.altRun)   parts.push(`⌥Enter ${entry.altLabel || ''}`.trim());
  if (entry?.heartRun) parts.push(`⌘D ${entry.heartLabel || ''}`.trim());
  hintEl.textContent = parts.join(' · ');
}

function onKey(e) {
  if (e.key === 'ArrowDown') { setCursor(Math.min(cursor + 1, entries.length - 1)); e.preventDefault(); return; }
  if (e.key === 'ArrowUp') { setCursor(Math.max(cursor - 1, 0)); e.preventDefault(); return; }
  // ⌘D — toggle 红心 on the highlighted song. Deliberately not Enter+modifier:
  // ⌘/⇧+Enter are kept as the Alt-fallback for macOS Electron's occasional
  // ⌥ swallow (see Enter handler below).
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
    if (entries[cursor]?.heartRun) { execute(cursor, 'heart'); e.preventDefault(); }
    return;
  }
  if (e.key === 'Enter') {
    // ⌥Enter = radio. ⌘Enter / ⇧Enter kept as Alt-fallbacks — macOS Electron
    // occasionally swallows ⌥ on single-line inputs, and we need something
    // that reliably routes to altRun when that happens.
    const variant = (e.altKey || e.metaKey || e.shiftKey) ? 'alt' : 'primary';
    execute(cursor, variant);
    e.preventDefault();
  }
}

function execute(i, variant = 'primary') {
  const entry = entries[i]; if (!entry) return;
  // Route by variant; fall back to `run` if the requested variant isn't
  // supported by this entry kind (e.g. ⌘D on a mode entry → plays the mode).
  const handler =
    variant === 'heart' && entry.heartRun ? entry.heartRun :
    variant === 'alt'   && entry.altRun   ? entry.altRun   :
    entry.run;
  Promise.resolve()
    .then(() => handler())
    .then((res) => {
      if (res?.ok) showToast(res.ok, 'ok');
      if (res?.warn) showToast(res.warn, 'warn');
      if (res?.close) actions.closeCmdk();
      // Heart may have flipped — rebuild entries so labels (加红心 ↔ 取消红心)
      // reflect the new state without waiting for the next keystroke.
      if (variant === 'heart') refresh();
    })
    .catch((err) => {
      console.warn('cmdk run', err);
      showToast(err?.message || String(err), 'error');
    });
}

// `level` drives the toast color: 'error' (red), 'warn' (amber), 'ok' (green).
function showToast(msg, level = 'error') {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.dataset.level = level;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}
