// State transition animations. Every visual "moment" (track change, window
// appear/hide, cover tilt, title scramble) lives here. cmdk.js calls these;
// CSS keyframes handle the actual rendering.

// ---- Helpers ----------------------------------------------------------------

export function popEl(el) {
  if (!el) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function replayClass(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ---- Track change -----------------------------------------------------------

export function onTrackChange(nowEl) {
  if (!nowEl || nowEl.hidden) return;
  replayClass(nowEl, 'changing');
}

// ---- Window appear / hide ---------------------------------------------------

export function animateAppear(panelEl) {
  replayClass(panelEl, 'appear');
}

export function animateHide(panelEl, then) {
  if (!panelEl) { then?.(); return; }
  let done = false;
  const finish = () => { if (done) return; done = true; panelEl.classList.remove('leaving'); then?.(); };
  panelEl.classList.add('leaving');
  panelEl.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 300);
}

// ---- Cover 3D tilt ----------------------------------------------------------

export function initCoverTilt(coverEl) {
  coverEl.addEventListener('mousemove', (e) => {
    const r = coverEl.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    coverEl.style.setProperty('--ry', `${x * 8}deg`);
    coverEl.style.setProperty('--rx', `${-y * 8}deg`);
  });
  coverEl.addEventListener('mouseleave', () => {
    coverEl.style.setProperty('--ry', '0deg');
    coverEl.style.setProperty('--rx', '0deg');
  });
}

// ---- Title scramble ---------------------------------------------------------

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function scrambleText(el, finalText, duration = 380) {
  const len = finalText.length;
  const steps = 6;
  const interval = duration / steps;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    if (step >= steps) {
      clearInterval(timer);
      el.textContent = finalText;
      return;
    }
    const progress = step / steps;
    let out = '';
    for (let i = 0; i < len; i++) {
      out += (i / len < progress) ? finalText[i] : CHARS[Math.random() * CHARS.length | 0];
    }
    el.textContent = out;
  }, interval);
}
