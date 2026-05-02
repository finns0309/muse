// Boot sequence:
//   1. Hydrate UI prefs (tab / mode / appearance) from muse.store
//   2. Auth (QR flow if no cookie) — blocks until user is signed in
//   3. Mount cmdk + the tab views (tab swap happens via body[data-tab])
//   4. Boot the local library mirror (may kick a NetEase sync)
//   5. Radio tab auto-activates the persisted mode as soon as library ready
//
// Tab navigation is driven by ⌘K only — there's no chrome nav. Adding a tab
// means: <section> in index.html, mount block below, and a cmdk tab entry.

import { store, actions } from './store.js';
import { bootAuth } from './auth.js';
import * as cmdk from './cmdk.js';
import * as player from './player.js';
import * as radio from './radio.js';
import * as library from './library.js';
import * as tape from './tape.js';
import { bootLibrary, wirePlayTracking } from './lib/library.js';

const els = {
  loginPane: document.getElementById('loginPane'),
  shell:     document.getElementById('shell'),
  radio:     document.getElementById('radio'),
  library:   document.getElementById('library'),
  tape:      document.getElementById('tape'),
  cmdk:      document.getElementById('cmdk'),
};

// Tab switching is driven entirely through ⌘K now. We keep `body[data-tab]`
// in sync so CSS can swap panes.
function reflectTabState() {
  document.body.dataset.tab = store.get().tab;
}

// ---- Boot -------------------------------------------------------------------

(async () => {
  // 1. Hydrate persisted UI prefs. `tab` / `mode` / `appearance` are the only
  //    durable UI state.
  const prefs = await window.muse.store.get('ui-prefs', null);
  if (prefs) {
    store.set({
      tab: prefs.tab || 'radio',
      mode: prefs.mode || 'all',
      appearance: {
        scheme: prefs.appearance?.scheme === 'light' ? 'light' : 'dark',
        accent: /^#[0-9a-f]{6}$/i.test(prefs.appearance?.accent || '') ? prefs.appearance.accent.toLowerCase() : '#c6a15b',
      },
    });
  }
  applyAppearance(store.get().appearance);
  store.selectKey((s) => `${s.appearance.scheme}|${s.appearance.accent}`, (s) => {
    applyAppearance(s.appearance);
  });

  // 2. Auth gate. bootAuth handles the QR flow inline; resolves once signed in.
  await bootAuth(els.loginPane);

  // 3. Reveal shell + mount everything.
  els.shell.classList.remove('hidden');
  reflectTabState();
  cmdk.mount(els.cmdk);
  radio.mount(els.radio);
  library.mount(els.library);
  tape.mount(els.tape);
  // cmdk is opened on demand (⌘K, global shortcut, dock-click re-open) — not
  // auto-opened on boot. The first thing users should see is the radio tab.

  // Reflect tab changes on the body so CSS can swap panes without JS churn.
  store.select((s) => s.tab, () => reflectTabState());
  window.muse.onOpenCommandSurface(() => actions.openCmdk());

  // 4. Library. This is async (first launch pulls 我喜欢 over the network); the
  //    radio tab watches `library.ready` and activates its mode when it flips.
  wirePlayTracking();
  bootLibrary().catch((e) => console.error('[app] bootLibrary', e));

  // 5. Global shortcuts. Keep this list short — anything specific to a tab
  //    should live in that tab's module instead.
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'ArrowRight') { e.preventDefault(); player.next(); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); player.prev(); return; }
      if (e.key.toLowerCase() === 'p') { e.preventDefault(); player.toggle(); return; }
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); actions.setTab('radio');   actions.closeCmdk(); return; }
      if (e.key.toLowerCase() === 'l') { e.preventDefault(); actions.setTab('library'); actions.closeCmdk(); return; }
      if (e.key.toLowerCase() === 't') { e.preventDefault(); actions.setTab('tape');    actions.closeCmdk(); return; }
    }
    const t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    if (e.key === ' ') { e.preventDefault(); player.toggle(); }
    if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); player.next(); }
  });
})();

function applyAppearance(appearance) {
  const scheme = appearance?.scheme === 'light' ? 'light' : 'dark';
  const accent = /^#[0-9a-f]{6}$/i.test(appearance?.accent || '') ? appearance.accent : '#c6a15b';
  document.body.dataset.scheme = scheme;
  document.body.style.setProperty('--muse-accent', accent);
}
