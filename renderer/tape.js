// Tape tab — what muse has been listening to.
//
// Reads the per-play event log persisted under the `history` store key (see
// lib/library.js: recordHistory). One focused view per the design spec's
// variant ① 时间尺度: 24h timeline + chronological play list. The other five
// variants are exploration; muse stays a runtime, not a browsing surface.
//
// Refetch strategy: on mount, on tab activation, on player track change
// (proxy for "a new scrobble was just appended"), and a 60s heartbeat while
// the tab is visible. No reactive subscription — history lives in main and
// the IPC roundtrip is the boundary.

import { store } from './store.js';

const HOURS_OF_DAY = 24;
const HISTORY_KEY = 'history';

let rootEl = null;
let heartbeat = null;
let lastTrackId = null;

export function mount(el) {
  rootEl = el;
  rootEl.innerHTML = `
    <div class="tape-timeline" data-role="timeline">
      <div class="tape-timeline__bar" data-role="bar"></div>
      <div class="tape-timeline__axis" data-role="axis"></div>
    </div>
    <div class="tape-list" data-role="list"></div>`;

  // Render whenever the tab is shown. Reading from main on every show is
  // cheap (one IPC, one JSON) and keeps the view current after plays
  // recorded in another tab.
  store.select((s) => s.tab, (tab) => {
    if (tab === 'tape') {
      refresh();
      heartbeat = setInterval(refresh, 60_000);
    } else if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  });

  // A track change is the most reliable signal that a new event was just
  // recorded — recordHistory fires when the *previous* track crosses 30s
  // or ends. Refetch shortly after so the new row shows up.
  store.select((s) => s.player.track?.id ?? null, (id) => {
    if (id !== lastTrackId) {
      lastTrackId = id;
      if (store.get().tab === 'tape') setTimeout(refresh, 800);
    }
  });
}

async function refresh() {
  const all = (await window.muse.store.get(HISTORY_KEY, [])) || [];
  const today = startOfDay(Date.now());
  const todays = all.filter((e) => e && e.at >= today).sort((a, b) => a.at - b.at);
  paint(todays);
}

function paint(events) {
  const bar = rootEl.querySelector('[data-role=bar]');
  const axis = rootEl.querySelector('[data-role=axis]');
  const list = rootEl.querySelector('[data-role=list]');

  if (!events.length) {
    bar.innerHTML = '';
    axis.innerHTML = '';
    list.innerHTML = '';
    return;
  }

  // Timeline blocks — each play is a colored sliver positioned by its hour.
  // Use the song's NetEase id as a deterministic hue so repeats of the same
  // song share a color in the bar.
  bar.innerHTML = events.map((e) => {
    const hour = hourOf(e.at);
    const left = (hour / HOURS_OF_DAY) * 100;
    // Width is a flat token, not duration-scaled — actual durations vary 2-5
    // minutes which becomes invisibly thin at 24h scale; uniform sliver reads
    // as "a play happened here" which is the only thing that fits the space.
    return `<span class="tape-block"
      style="left:${left.toFixed(2)}%; --tape-hue:${hueFor(e.songId)}"
      title="${escape(fmtTime(new Date(e.at)) + '  ' + e.name + ' · ' + e.artist)}"></span>`;
  }).join('');

  // Hour ticks — 00 / 06 / 12 / 18 / now. The "now" tick anchors the right
  // edge so the bar doesn't feel like it's missing the present.
  const now = new Date();
  const nowPct = (hourOf(now.getTime()) / HOURS_OF_DAY) * 100;
  axis.innerHTML = `
    <span style="left:0%">00</span>
    <span style="left:25%">06</span>
    <span style="left:50%">12</span>
    <span style="left:75%">18</span>
    <span class="tape-axis__now" style="left:${nowPct.toFixed(2)}%">now</span>`;

  // Newest first feels right for a "what just happened" surface — same logic
  // as a chat scroll. Group adjacent same-song plays into a "× N" badge so
  // repeat-on-loop sessions don't fill the page with duplicates.
  const collapsed = collapse(events.slice().reverse());
  list.innerHTML = collapsed.map((row) => `
    <div class="tape-row">
      <span class="tape-row__time">${fmtTime(new Date(row.at))}</span>
      <span class="tape-row__bullet" style="--tape-hue:${hueFor(row.songId)}"></span>
      <span class="tape-row__name" title="${escape(row.name)}">${escape(row.name)}</span>
      <span class="tape-row__artist" title="${escape(row.artist)}">${escape(row.artist)}</span>
      <span class="tape-row__count">${row.count > 1 ? '× ' + row.count : ''}</span>
    </div>`).join('');
}

function collapse(events) {
  const out = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (last && last.songId === e.songId) { last.count += 1; }
    else out.push({ ...e, count: 1 });
  }
  return out;
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function hourOf(ms) {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60;
}

// Stable per-song hue derived from the NetEase id. Avoids needing a color
// extraction pass over picUrl while still giving every track a consistent
// stripe across the day.
function hueFor(songId) {
  if (!songId) return 40;
  return ((songId * 47) % 360 + 360) % 360;
}

function fmtTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
