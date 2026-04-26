// JSON file store. One file per key; atomic writes + fsync for crash safety;
// corrupted files are quarantined (.bad-<ts>.bak) so a single bad write never
// silently destroys data on the next launch.

const fs = require('fs');
const path = require('path');

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function checkKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) {
    throw new Error(`[store] invalid key: ${JSON.stringify(key)}`);
  }
}

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.cache = new Map();        // key -> parsed value (in-memory truth)
    this.dirty = new Set();        // keys awaiting flush
    this.flushTimer = null;
    this.flushDelay = 400;
  }

  _file(key) { return path.join(this.dir, key + '.json'); }

  // Read once, then serve from cache. Corrupt files are renamed aside so we
  // never re-read garbage on every call (and the user can recover manually).
  get(key, fallback = null) {
    checkKey(key);
    if (this.cache.has(key)) return this.cache.get(key);

    const f = this._file(key);
    let raw;
    try { raw = fs.readFileSync(f, 'utf8'); }
    catch (e) {
      if (e.code !== 'ENOENT') console.error('[store] read', key, e.code || e.message);
      return fallback;
    }
    try {
      const v = JSON.parse(raw);
      this.cache.set(key, v);
      return v;
    } catch (e) {
      const bak = `${f}.bad-${Date.now()}.bak`;
      try { fs.renameSync(f, bak); } catch {}
      console.error(`[store] corrupt ${key} → quarantined to ${bak}`);
      return fallback;
    }
  }

  set(key, value) {
    checkKey(key);
    this.cache.set(key, value);
    this.dirty.add(key);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), this.flushDelay);
  }

  del(key) {
    checkKey(key);
    this.cache.delete(key);
    this.dirty.delete(key);
    try { fs.unlinkSync(this._file(key)); } catch {}
  }

  // Synchronous + atomic + fsync. Failures keep the key dirty so the next
  // flush retries (e.g. transient ENOSPC) instead of silently losing data.
  flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.dirty.size) return;

    const failed = [];
    for (const key of this.dirty) {
      const f = this._file(key);
      const tmp = f + '.tmp';
      try {
        const fd = fs.openSync(tmp, 'w');
        try {
          fs.writeSync(fd, JSON.stringify(this.cache.get(key), null, 2));
          fs.fsyncSync(fd);                 // durability: bytes hit disk
        } finally {
          fs.closeSync(fd);
        }
        fs.renameSync(tmp, f);              // atomicity: one syscall swap
      } catch (e) {
        console.error('[store] flush failed', key, e.code || e.message);
        failed.push(key);
        try { fs.unlinkSync(tmp); } catch {}
      }
    }
    this.dirty = new Set(failed);            // keep failed keys for retry
    if (failed.length && !this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushDelay * 4);
    }
  }

  keys() {
    try { return fs.readdirSync(this.dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); }
    catch { return []; }
  }
}

module.exports = { Store };
