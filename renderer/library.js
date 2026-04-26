// Library tab. Phase-1 shape: a single scrollable column grouped by add-date,
// with one filter input on top. The filter is plain-substring only for now —
// a parser for `tag:... artist:... sort:...` can land on top of `applyFilter`
// without touching the render path.
//
// No sidebar. No inspector. No per-view chrome. Anything fancier (inline
// expand, stats overlay) gets added by making it toggled from ⌘K and mounted
// into this same container.

import { store, actions } from './store.js';
import * as player from './player.js';

let rootEl = null;
let inputEl = null;
let listEl = null;

export function mount(el) {
  rootEl = el;
  rootEl.innerHTML = `
    <div class="lib-filter">
      <input data-role="filter" placeholder="/ filter — substring, empty to show all" spellcheck="false">
    </div>
    <div class="lib-list" data-role="list"></div>`;

  inputEl = rootEl.querySelector('[data-role=filter]');
  listEl  = rootEl.querySelector('[data-role=list]');

  inputEl.addEventListener('input', () => actions.setFilter(inputEl.value));

  // Re-render on library changes, filter changes, or the currently-playing
  // track changing (so the "playing" row indicator moves correctly).
  store.selectKey(
    (s) => `${s.library.tracks.length}|${s.filter}|${s.player.track?.id ?? 0}`,
    render
  );
}

function render() {
  const s = store.get();
  const tracks = applyFilter(s.library.tracks, s.filter);
  if (!tracks.length) {
    listEl.innerHTML = `<div class="lib-empty">${s.library.ready ? 'no matches' : 'loading library…'}</div>`;
    return;
  }

  // Group by YYYY-MM-DD of addedAt (descending).
  const byDate = new Map();
  for (const t of tracks) {
    const key = fmtDate(t.addedAt);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(t);
  }
  const sortedDates = [...byDate.keys()].sort().reverse();

  const currentId = s.player.track?.id;
  const html = [];
  for (const d of sortedDates) {
    html.push(`<div class="lib-date">${d}</div>`);
    const rows = byDate.get(d);
    rows.forEach((t, i) => {
      html.push(`
        <div class="lib-row ${t.id === currentId ? 'playing' : ''}" data-id="${t.id}">
          <span class="idx">${i + 1}</span>
          <span class="nm">${escape(t.name)}</span>
          <span class="ar">${escape((t.ar || []).map((a) => a.name).join(', '))}</span>
          <span class="dt">${fmtDur(t.dt)}</span>
          <span class="pc">${t.playCount ? '↻' + t.playCount : ''}</span>
        </div>`);
    });
  }
  listEl.innerHTML = html.join('');

  listEl.querySelectorAll('.lib-row').forEach((row) => {
    row.addEventListener('click', () => {
      const id = Number(row.dataset.id);
      const track = s.library.tracks.find((t) => t.id === id);
      if (track) player.setQueue([track], { startIdx: 0 });
    });
  });
}

function applyFilter(tracks, text) {
  const q = (text || '').trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter((t) => {
    if (t.name?.toLowerCase().includes(q)) return true;
    if ((t.ar || []).some((a) => a.name?.toLowerCase().includes(q))) return true;
    if (t.al?.name?.toLowerCase().includes(q)) return true;
    return false;
  });
}

function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getFullYear()}  ${pad2(d.getMonth() + 1)}  ${pad2(d.getDate())}`;
}
function pad2(n) { return String(n).padStart(2, '0'); }

function fmtDur(ms) {
  if (!ms) return '';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
