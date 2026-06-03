// Cover accent extraction — ported from echo's extractAccent. 24×24 canvas,
// pick the most saturated mid-bright pixel as the vivid accent, compute the
// average as the ambient tint. Cached per URL.

const accentCache = new Map();
let lastAccentUrl = '';
let ambientEl = null;

export function init(el) { ambientEl = el; }

export function update(coverUrl) {
  if (!coverUrl || coverUrl === lastAccentUrl) return;
  lastAccentUrl = coverUrl;

  const cached = accentCache.get(coverUrl);
  if (cached !== undefined) { if (cached) apply(cached); return; }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = 24; c.height = 24;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 24, 24);
      const d = ctx.getImageData(0, 0, 24, 24).data;
      let bs = -1, vr = 200, vg = 200, vb = 200;
      let ar = 0, ag = 0, ab = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        ar += r; ag += g; ab += b; n++;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        const lum = (r + g + b) / 3;
        const score = sat * 2 + (1 - Math.abs(lum - 150) / 200);
        if (score > bs) { bs = score; vr = r; vg = g; vb = b; }
      }
      const result = { vivid: [vr, vg, vb], avg: [ar / n | 0, ag / n | 0, ab / n | 0] };
      accentCache.set(coverUrl, result);
      apply(result);
    } catch {
      accentCache.set(coverUrl, null);
      applyFallback();
    }
  };
  img.onerror = () => { accentCache.set(coverUrl, null); applyFallback(); };
  img.src = coverUrl;
}

function apply({ vivid, avg }) {
  const hex = '#' + vivid.map((v) => v.toString(16).padStart(2, '0')).join('');
  document.body.style.setProperty('--muse-accent', hex);
  if (ambientEl) ambientEl.style.setProperty('--amb', `rgb(${avg[0]}, ${avg[1]}, ${avg[2]})`);
}

function applyFallback() {
  const fallback = getComputedStyle(document.body).getPropertyValue('--muse-accent').trim() || '#6eb5ff';
  if (ambientEl) ambientEl.style.setProperty('--amb', fallback);
}
