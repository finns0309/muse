// Radio tab. Renders the mode grid from modes/index.js, reacts to user
// selection, and drives the player. Designed so the only thing you ever need
// to touch when adding a new mode is its own file under modes/ — the tab
// layout, persistence, and keyboard wiring are all data-driven from MODES.

import { store, actions } from './store.js';
import { MODES, byId } from './modes/index.js';
import * as player from './player.js';
import * as cmdk from './cmdk.js';
import { toggleHeart } from './lib/library.js';

let rootEl = null;
// Transient status line: mode.build may surface a user-facing hint (e.g.
// "NetEase 推荐暂不可用") that outranks the normal library-state message.
// Cleared on the next successful activate().
let modeStatus = '';
let modesEl = null;
let coverEl = null;
let titleEl = null;
let artistEl = null;
let likeBtn = null;
let queueBadgeEl = null;
let queueCountEl = null;
let statusEl = null;
let activeModeEl = null;
let activeMetaEl = null;
let progressEl = null;

// Inline SVGs so we don't ship an icon file; `currentColor` lets CSS control
// hue. Stroke weights tuned to match the 12–13px meta text.
const ICON_NEXT = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polygon points="5 4 17 12 5 20" fill="currentColor"/>
    <rect x="18" y="4" width="2" height="16" fill="currentColor"/>
  </svg>`;
const ICON_HEART = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 21.35 L10.55 20.03 C 5.4 15.36 2 12.28 2 8.5 C 2 5.42 4.42 3 7.5 3 C 9.24 3 10.91 3.81 12 5.08 C 13.09 3.81 14.76 3 16.5 3 C 19.58 3 22 5.42 22 8.5 C 22 12.28 18.6 15.36 13.45 20.04 L 12 21.35 Z"/>
  </svg>`;

export function mount(el) {
  rootEl = el;
  // Layout inversion: modes are the hero now (they're the reason you open
  // this tab — to switch). The now-playing strip is compact, at the top,
  // and auto-hides when nothing is loaded. echo handles the
  // "show me what's playing" job for most of the session.
  rootEl.innerHTML = `
    <div class="radio-status" data-role="status"></div>
    <div class="radio-backdrop" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <div class="radio-stage">
      <div class="radio-signal" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
      <div class="now-strip" data-role="now" hidden>
        <div class="cover cover-sm empty" data-role="cover"></div>
        <div class="now-meta">
          <div class="title" data-role="title"></div>
          <div class="artist" data-role="artist"></div>
          <div class="now-progress" aria-hidden="true"><span data-role="progress"></span></div>
        </div>
        <div class="now-actions">
          <button class="now-queue-btn" data-act="queue" title="queue · 打开队列" hidden>
            <span data-role="queue-count">0</span>
          </button>
          <button class="icon-btn" data-act="next" title="next (n)">${ICON_NEXT}</button>
          <button class="icon-btn heart" data-act="like" title="like (l)">${ICON_HEART}</button>
        </div>
      </div>
      <div class="radio-readout" aria-hidden="true">
        <div class="radio-readout__mode" data-role="active-mode">all</div>
        <div class="radio-readout__meta" data-role="active-meta">everything, shuffled</div>
      </div>
    </div>
    <div class="mode-cards" data-role="modes"></div>`;

  statusEl = rootEl.querySelector('[data-role=status]');
  modesEl  = rootEl.querySelector('[data-role=modes]');
  coverEl  = rootEl.querySelector('[data-role=cover]');
  titleEl  = rootEl.querySelector('[data-role=title]');
  artistEl = rootEl.querySelector('[data-role=artist]');
  likeBtn  = rootEl.querySelector('[data-act=like]');
  queueBadgeEl = rootEl.querySelector('[data-act=queue]');
  queueCountEl = rootEl.querySelector('[data-role=queue-count]');
  activeModeEl = rootEl.querySelector('[data-role=active-mode]');
  activeMetaEl = rootEl.querySelector('[data-role=active-meta]');
  progressEl = rootEl.querySelector('[data-role=progress]');
  const nowEl = rootEl.querySelector('[data-role=now]');
  rootEl._nowEl = nowEl;

  renderModes();
  wireControls();

  // Activate the persisted mode once the library is ready. Library state can
  // flip ready → false if a refresh fails, so we latch it with `started`.
  let started = false;
  store.select((s) => s.library.ready, (ready) => {
    if (ready && !started) {
      started = true;
      activate(store.get().mode);
    }
  });

  // Re-activate whenever the mode changes, or when cmdk explicitly re-runs
  // the already-active mode by bumping modeRun.
  store.selectKey((s) => `${s.mode}|${s.modeRun}`, (s, prevKey) => {
    markActive();
    if (prevKey !== undefined && s.library.ready) {
      activate(s.mode);
    }
  });

  // Immersive is a "current artist" mode. If the user manually plays another
  // song while staying in immersive, rebuild the queue around that new song
  // instead of leaving a one-track queue behind.
  store.selectKey(
    (s) => `${s.mode}|${s.player.track?.id ?? ''}|${s.player.track?.ar?.[0]?.id ?? ''}`,
    (s, prevKey) => {
      if (prevKey === undefined) return;
      const prevMode = String(prevKey).split('|')[0];
      if (prevMode !== 'immersive' || s.mode !== 'immersive' || !s.library.ready) return;
      const artistId = s.player.track?.ar?.[0]?.id;
      if (!artistId || hasImmersiveQueueForArtist(s.player.queue, artistId)) return;
      activate('immersive');
    }
  );

  // Reflect playback in the now-line.
  store.select((s) => s.player.track, renderNow);
  store.selectKey(
    (s) => `${Math.floor(s.player.currentTime)}|${Math.floor(s.player.duration)}`,
    renderProgress
  );

  // Queue badge: "up next" counter. Hidden when the queue is empty or the
  // current track is the tail — no point showing "0". Subscribed on a
  // composite key of (queueLen, queueIdx) so normal timeupdate ticks don't
  // re-render it 4×/sec.
  store.selectKey(
    (s) => `${s.player.queue.length}|${s.player.queueIdx}`,
    renderQueueBadge
  );

  // Heart state is derived: a track is "hearted" iff it's in library.tracks
  // (library mirrors 我喜欢). Re-render when the track changes OR when the
  // library membership for the current track flips — the latter covers both
  // clicks on this button AND toggles from cmdk (⌘D) or a background library
  // refresh that adds/removes the song.
  store.selectKey(
    (s) => {
      const id = s.player.track?.id ?? 0;
      const hearted = id ? s.library.tracks.some((t) => t.id === id) : false;
      return `${id}|${hearted}`;
    },
    renderHeart
  );

  // Status hint: loading / empty library.
  store.select((s) => s.library, renderStatus);
}

// ---- Rendering -------------------------------------------------------------

function renderModes() {
  modesEl.innerHTML = '';
  // Each card carries a style index so CSS can rotate through accent hues
  // without hardcoding per-mode colors (adding a mode just gets the next hue).
  MODES.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = 'mode-card';
    btn.dataset.id = m.id;
    btn.dataset.accent = (i % 6).toString();
    btn.title = m.description || '';
    btn.innerHTML = `
      <span class="mode-card__label">${escape(m.label)}</span>
      <span class="mode-card__desc">${escape(m.description || '')}</span>
      <span class="mode-card__index">${String(i + 1).padStart(2, '0')}</span>
      <span class="mode-card__pulse" aria-hidden="true"></span>`;
    btn.addEventListener('click', () => onModeClick(m.id));
    modesEl.appendChild(btn);
  });
  markActive();
}

function markActive() {
  const cur = store.get().mode;
  const active = MODES.find((m) => m.id === cur) || MODES[0];
  if (activeModeEl) activeModeEl.textContent = active?.label || '';
  if (activeMetaEl) activeMetaEl.textContent = active?.description || '';
  modesEl.querySelectorAll('.mode-card').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === cur);
  });
}

function renderNow() {
  const t = store.get().player.track;
  const nowEl = rootEl._nowEl;
  if (!t) {
    // Strip is hidden entirely when nothing's playing — the radio tab is then
    // purely a mode picker, which matches the product's "切歌器" intent.
    nowEl.hidden = true;
    return;
  }
  nowEl.hidden = false;
  titleEl.textContent = t.name || '';
  artistEl.textContent = (t.ar || []).map((a) => a.name).join(', ');
  const url = t.al?.picUrl;
  if (url) {
    coverEl.classList.remove('empty');
    coverEl.style.setProperty('--cover', `url("${url}")`);
  } else {
    coverEl.classList.add('empty');
    coverEl.style.removeProperty('--cover');
  }
  renderProgress();
}

function renderProgress() {
  if (!progressEl) return;
  const { currentTime, duration } = store.get().player;
  const pct = duration ? Math.max(0, Math.min(100, currentTime / duration * 100)) : 0;
  progressEl.style.width = `${pct}%`;
}

function renderQueueBadge() {
  if (!queueBadgeEl) return;
  const { queue, queueIdx } = store.get().player;
  const remaining = Math.max(0, queue.length - (queueIdx + 1));
  queueCountEl.textContent = String(remaining);
  queueBadgeEl.hidden = remaining === 0;
  queueBadgeEl.title = `queue · 后面还有 ${remaining} 首`;
}

function renderHeart() {
  if (!likeBtn) return;
  const s = store.get();
  const t = s.player.track;
  const hearted = !!t && s.library.tracks.some((x) => x.id === t.id);
  likeBtn.classList.toggle('liked', hearted);
  likeBtn.title = hearted ? '取消红心' : '红心';
  likeBtn.disabled = !t;
}

function renderStatus(lib) {
  // Mode status (if set) wins over library state — if a mode explicitly
  // reports a reason for an empty queue, hide the generic library hint.
  if (modeStatus) { statusEl.textContent = modeStatus; return; }
  if (!lib.ready && lib.loading) { statusEl.textContent = 'syncing your library…'; return; }
  if (lib.ready && !lib.tracks.length && !lib.error) { statusEl.textContent = 'empty library. try /我喜欢 on NetEase first.'; return; }
  if (lib.error) { statusEl.textContent = 'library error · ' + lib.error; return; }
  statusEl.textContent = '';
}

// ---- Actions ---------------------------------------------------------------

function onModeClick(id) {
  // Clicking the already-active mode re-rolls the queue (useful for shuffle,
  // daily, digup). This is free behavior — activate() runs unconditionally.
  if (id === store.get().mode) {
    if (store.get().library.ready) activate(id);
    return;
  }
  actions.setMode(id);
}

function wireControls() {
  rootEl.querySelector('[data-act=next]').addEventListener('click', () => player.next());
  queueBadgeEl.addEventListener('click', () => cmdk.openWith('/queue'));
  likeBtn.addEventListener('click', async () => {
    const t = store.get().player.track;
    if (!t) return;
    // Optimistic update is handled inside toggleHeart: it flips the library
    // slice immediately, our renderHeart subscription picks it up, and the
    // visual snaps before the network round-trip. Rollback on failure is
    // also inside toggleHeart; we just log here.
    try { await toggleHeart(t); }
    catch (e) { console.warn('[radio] heart toggle failed', e?.message || e); }
  });
}

// Build and commit the queue for the given mode.
async function activate(modeId) {
  const mode = byId[modeId] || byId.all;
  const ok = store.race('radio-activate');

  const ctx = {
    library: store.get().library,
    player: store.get().player,
    now: Date.now(),
  };

  let result;
  try { result = await mode.build(ctx); }
  catch (e) { console.error('[radio] mode build failed', modeId, e); return; }
  if (!ok()) return;          // a newer activate() superseded us

  const queue = result?.queue || [];
  if (!queue.length) {
    // No playable tracks for this mode; keep the currently-playing track
    // rather than yanking audio out from under the user. Surface the mode's
    // own error hint (e.g. "NetEase 推荐暂不可用") if it supplied one.
    modeStatus = result?.error ? `${mode.label} · ${result.error}` : '';
    console.info('[radio] mode produced empty queue:', modeId, result?.error || '');
    renderStatus(store.get().library);
    return;
  }
  modeStatus = '';
  // Order matters: setQueue clears audio.loop (to avoid single-mode carryover
  // leaking into other modes' playback), so setLoop MUST come after.
  player.setQueue(queue, { startIdx: result.startIdx || 0 });
  player.setLoop(!!mode.singleLoop);
  renderStatus(store.get().library);
}

// ---- Misc ------------------------------------------------------------------

function hasImmersiveQueueForArtist(queue, artistId) {
  if (!Array.isArray(queue) || queue.length <= 1) return false;
  return queue.every((track) => track?.ar?.[0]?.id === artistId);
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
