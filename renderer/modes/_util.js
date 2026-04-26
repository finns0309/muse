// Shared helpers for modes. Kept underscore-prefixed so the index import
// loop (mode registry) doesn't accidentally include it.

export function shuffle(arr) {
  // In-place Fisher–Yates. Caller should .slice() first if it wants to keep
  // the source array intact.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pick `n` items without replacement, weighted by `weight(item)`. Items whose
// weight is 0 or negative are skipped entirely. If the weighted set is smaller
// than n, returns whatever is available.
export function weightedSample(items, weight, n) {
  const pool = items.map((it) => ({ it, w: Math.max(0, weight(it)) })).filter((p) => p.w > 0);
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = Math.random() * total;
    let i = 0;
    for (; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) break;
    }
    const [taken] = pool.splice(Math.min(i, pool.length - 1), 1);
    out.push(taken.it);
  }
  return out;
}
