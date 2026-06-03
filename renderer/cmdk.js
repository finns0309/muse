// Command palette — the sole UI surface of muse.
//
// Idle state: large centered now-playing hero + search input at bottom.
// Search state: compact now-playing strip + input + results list.
// The morph between the two is driven by the `.idle` class on `.cmdk-panel`.
//
// This file owns: DOM mount, rendering, cursor, keyboard dispatch, and window
// resize. Business logic (builders, playlists, accent, transitions) is in
// sibling modules to keep this file focused on the view.

import { store, actions } from './store.js';
import * as player from './player.js';
import * as accent from './accent.js';
import * as playlist from './playlist.js';
import * as tx from './transitions.js';
import { COMMAND_BUILDERS, SONG_BUILDERS, ASYNC_BUILDERS, injectSetInput, formatArtists } from './commands.js';

// ---- DOM refs ---------------------------------------------------------------

let rootEl, panelEl, inputEl, listEl, toastEl, nowEl, nowCoverEl, nowTitleEl, nowArtistEl, nowTimeEl, nowProgressEl;
let cursorEl = null;

// ---- State ------------------------------------------------------------------

let entries = [];
let cursor = 0;
let introPending = false;
let lastNowCover = '';
let lastRenderedTrackId = null;
let toastTimer = null;

// ---- Window resize ----------------------------------------------------------

const IDLE_H = 405;
const MAX_H = 560;
const WIN_W = 720;
let lastResizeH = 0;

function resizeToContent() {
  const panel = panelEl;
  if (!panel) return;
  const isIdle = panel.classList.contains('idle');
  const h = isIdle ? IDLE_H : Math.max(IDLE_H, Math.min(MAX_H, panel.scrollHeight));
  if (h === lastResizeH) return;
  lastResizeH = h;
  window.muse.resizeWindow?.(WIN_W, h);
}

// ---- Mount ------------------------------------------------------------------

export function mount(el) {
  rootEl = el;
  rootEl.innerHTML = `
    <div class="cmdk-ambient" data-role="ambient" aria-hidden="true"></div>
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
      <div class="cmdk-list-wrap">
        <ul class="cmdk-list"></ul>
      </div>
      <div class="cmdk-toast" role="status"></div>
    </div>`;

  panelEl      = rootEl.querySelector('.cmdk-panel');
  inputEl      = rootEl.querySelector('.cmdk-input');
  listEl       = rootEl.querySelector('.cmdk-list');
  toastEl      = rootEl.querySelector('.cmdk-toast');
  nowEl        = rootEl.querySelector('[data-role=now]');
  nowCoverEl   = rootEl.querySelector('[data-role=now-cover]');
  nowTitleEl   = rootEl.querySelector('[data-role=now-title]');
  nowArtistEl  = rootEl.querySelector('[data-role=now-artist]');
  nowTimeEl    = rootEl.querySelector('[data-role=now-time]');
  nowProgressEl = rootEl.querySelector('[data-role=now-progress]');

  // Gliding cursor — lives in the list wrapper, not inside the <ul>.
  cursorEl = document.createElement('div');
  cursorEl.className = 'cmdk-cursor';
  cursorEl.setAttribute('aria-hidden', 'true');
  rootEl.querySelector('.cmdk-list-wrap').appendChild(cursorEl);

  // Init subsystems
  accent.init(rootEl.querySelector('[data-role=ambient]'));
  tx.initCoverTilt(nowCoverEl);
  playlist.boot();
  injectSetInput((v) => { inputEl.value = v; refresh(); });

  // Event listeners
  listEl.addEventListener('scroll', () => positionCursor(true), { passive: true });
  rootEl.querySelector('.cmdk-backdrop').addEventListener('click', doHide);
  inputEl.addEventListener('input', refresh);
  inputEl.addEventListener('keydown', onKey);

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); actions.openCmdk(); }
    if (e.key === 'Escape' && store.get().cmdkOpen) {
      if (inputEl.value.trim()) { inputEl.value = ''; refresh(); }
      else doHide();
    }
  });

  // Store subscriptions
  store.select((s) => s.cmdkOpen, (open) => {
    rootEl.classList.toggle('open', open);
    if (open) { introPending = true; inputEl.value = pendingOpenInput; pendingOpenInput = ''; refresh(); setTimeout(() => inputEl.focus(), 10); }
  });
  store.selectKey(
    (s) => `${s.player.track?.id ?? 0}|${Math.floor(s.player.currentTime)}|${Math.floor(s.player.duration)}`,
    renderNow
  );
  store.select((s) => s.player.track?.id ?? null, (id, prevId) => {
    if (prevId !== undefined && id !== prevId && id !== null) tx.onTrackChange(nowEl);
  });

  // Window appear (global hotkey)
  window.muse.onWindowAppear?.(() => {
    tx.animateAppear(panelEl);
    setTimeout(() => inputEl.focus(), 10);
  });
}

// ---- Now-playing ------------------------------------------------------------

function renderNow() {
  const p = store.get().player;
  const t = p.track;
  if (!t) { nowEl.hidden = true; return; }
  nowEl.hidden = false;

  const isNewTrack = t.id !== lastRenderedTrackId;
  lastRenderedTrackId = t.id;
  if (isNewTrack) {
    if (t.name) tx.scrambleText(nowTitleEl, t.name, 380);
    else nowTitleEl.textContent = t.name || '';
    nowArtistEl.textContent = formatArtists(t) || t.al?.name || '';
  }

  nowTimeEl.textContent = fmtTime(p.currentTime || 0);
  const pct = p.duration ? Math.max(0, Math.min(1, p.currentTime / p.duration)) : 0;
  nowProgressEl.style.width = `${pct * 100}%`;

  const cover = t.al?.picUrl;
  if (cover && cover !== lastNowCover) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (store.get().player.track?.al?.picUrl !== cover) return;
      nowCoverEl.style.setProperty('--cover', `url("${cover}")`);
      tx.popEl(nowCoverEl);
      accent.update(cover);
    };
    img.src = cover;
  } else if (!cover) {
    nowCoverEl.style.removeProperty('--cover');
  }
  lastNowCover = cover || '';
}

// ---- Refresh (main dispatch) ------------------------------------------------

let pendingOpenInput = '';
export function openWith(prefill) { pendingOpenInput = String(prefill || ''); actions.openCmdk(); }

let searchCtrl = null;

function refresh() {
  const raw = inputEl.value.trim();
  const isCmd = raw.startsWith('/');
  const q = isCmd ? raw.slice(1).trim() : raw;

  if (isCmd)     entries = COMMAND_BUILDERS.flatMap((b) => b(q));
  else if (!q)   entries = [];
  else           entries = SONG_BUILDERS.flatMap((b) => b(q));

  cursor = 0;
  renderList();

  const panel = panelEl;
  if (panel) panel.classList.toggle('idle', !raw);
  requestAnimationFrame(resizeToContent);

  searchCtrl?.abort();
  searchCtrl = new AbortController();
  const ok = store.race('cmdk');
  if (isCmd || !q) return;

  for (const b of ASYNC_BUILDERS) {
    b(q, { signal: searchCtrl.signal, ok })
      .then((res) => { if (ok()) { entries.push(...res); renderList(); requestAnimationFrame(resizeToContent); } })
      .catch(() => {});
  }
}

// ---- List rendering ---------------------------------------------------------

function renderList() {
  listEl.innerHTML = '';
  if (!entries.length) {
    if (inputEl.value.trim()) {
      const li = document.createElement('li');
      li.className = 'cmdk-empty';
      li.textContent = 'no results';
      listEl.appendChild(li);
    }
    return;
  }
  const intro = introPending;
  introPending = false;
  entries.forEach((e, i) => {
    const li = document.createElement('li');
    if (i === cursor) li.classList.add('sel');
    if (intro) { li.classList.add('in'); li.style.animationDelay = `${Math.min(i, 10) * 24}ms`; }
    const label = document.createElement('span'); label.className = 'lbl'; label.textContent = e.label;
    const hint  = document.createElement('span'); hint.className = 'hint'; hint.textContent = e.hint || '';
    li.append(label, hint);
    li.addEventListener('click', (ev) => execute(i, pickVariant(ev)));
    li.addEventListener('mousemove', () => setCursor(i));
    listEl.appendChild(li);
  });
  positionCursor(false);
}

// ---- Cursor -----------------------------------------------------------------

function setCursor(i) {
  if (i === cursor || i < 0 || i >= entries.length) return;
  const prev = listEl.children[cursor];
  if (prev) prev.classList.remove('sel');
  cursor = i;
  const next = listEl.children[cursor];
  if (next) { next.classList.add('sel'); next.scrollIntoView({ block: 'nearest' }); }
  positionCursor(true);
}

function positionCursor(animate) {
  if (!cursorEl) return;
  const li = listEl.children[cursor];
  if (!li || li.classList.contains('cmdk-empty')) { cursorEl.style.opacity = '0'; return; }
  const place = () => {
    const y = li.offsetTop - listEl.scrollTop;
    cursorEl.style.opacity = '1';
    cursorEl.style.transform = `translate(${li.offsetLeft}px, ${y}px)`;
    cursorEl.style.width = `${li.offsetWidth}px`;
    cursorEl.style.height = `${li.offsetHeight}px`;
  };
  if (animate) { place(); return; }
  cursorEl.style.transition = 'none';
  place();
  void cursorEl.offsetWidth;
  cursorEl.style.transition = '';
}

// ---- Keyboard ---------------------------------------------------------------

function pickVariant(ev) {
  if (ev.metaKey && !ev.altKey) return 'heart';
  if (ev.altKey) return 'alt';
  return 'primary';
}

function onKey(e) {
  if (e.key === 'ArrowDown') { setCursor(Math.min(cursor + 1, entries.length - 1)); e.preventDefault(); return; }
  if (e.key === 'ArrowUp')   { setCursor(Math.max(cursor - 1, 0)); e.preventDefault(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
    if (entries[cursor]?.heartRun) { execute(cursor, 'heart'); e.preventDefault(); }
    return;
  }
  if (e.key === 'Enter') {
    const variant = (e.altKey || e.metaKey || e.shiftKey) ? 'alt' : 'primary';
    execute(cursor, variant);
    e.preventDefault();
  }
}

function execute(i, variant = 'primary') {
  const entry = entries[i]; if (!entry) return;
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
      if (variant === 'heart') refresh();
    })
    .catch((err) => { console.warn('cmdk run', err); showToast(err?.message || String(err), 'error'); });
}

// ---- Helpers ----------------------------------------------------------------

function doHide() {
  tx.animateHide(panelEl, () => window.muse.hideWindow?.());
}

function showToast(msg, level = 'error') {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.dataset.level = level;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
