// QR-code login flow. Resolves once the user's NetEase profile is loaded into
// the store; the shell only renders the workspace after that.

import { api, setCookie, onAuthFail } from './api.js';
import { store } from './store.js';

let loginPaneRef = null;
let reLoginInFlight = false;

export async function bootAuth(loginPaneEl) {
  loginPaneRef = loginPaneEl;
  const cookie = (await window.muse.loadCookie()) || '';
  setCookie(cookie);
  if (await tryLoadProfile()) return;
  await runQrFlow(loginPaneEl);
}

// If any NCM call reports "cookie expired", drop back into the QR flow once.
// Wrapped with a guard so a storm of simultaneous 401s only opens it once.
onAuthFail(() => {
  if (reLoginInFlight || !loginPaneRef) return;
  reLoginInFlight = true;
  store.set({ user: null });
  runQrFlow(loginPaneRef).finally(() => { reLoginInFlight = false; });
});

async function tryLoadProfile() {
  try {
    const r = await api('/login/status');
    const p = r?.data?.profile || r?.profile;
    if (p?.userId) {
      store.set({ user: { uid: p.userId, nickname: p.nickname, avatarUrl: p.avatarUrl } });
      return true;
    }
  } catch {}
  return false;
}

async function runQrFlow(pane) {
  pane.classList.remove('hidden');
  const status = pane.querySelector('[data-role=qr-status]');
  const img = pane.querySelector('[data-role=qr-img]');

  while (true) {
    status.textContent = '生成二维码中…';
    const k = await api('/login/qr/key');
    const key = k?.data?.unikey;
    if (!key) { status.textContent = '获取 key 失败，重试中…'; await sleep(2000); continue; }
    const q = await api('/login/qr/create', { key, qrimg: true });
    img.src = q?.data?.qrimg || '';
    status.textContent = '请用网易云手机 App 扫描';

    const result = await pollQr(key, status);
    if (result.code === 803) {
      setCookie(result.cookie || '');
      await window.muse.saveCookie(result.cookie || '');
      if (await tryLoadProfile()) {
        pane.classList.add('hidden');
        return;
      }
    }
    // expired or unknown — loop and regenerate
  }
}

async function pollQr(key, status) {
  while (true) {
    const r = await api('/login/qr/check', { key });
    if (r.code === 800) { status.textContent = '二维码过期，重新生成…'; return r; }
    if (r.code === 801) { status.textContent = '等待扫码…'; await sleep(1500); continue; }
    if (r.code === 802) { status.textContent = '扫码成功，请在手机上确认'; await sleep(1500); continue; }
    if (r.code === 803) { return r; }
    await sleep(2000);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
