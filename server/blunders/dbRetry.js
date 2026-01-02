// Blunders DB retry queue extracted from server.js.
// This is a best-effort persistence layer to survive transient Postgres outages.

function createBlundersDbRetry(deps) {
  const fs = deps?.fs;
  const appDb = deps?.appDb;
  const nowIso = deps?.nowIso;
  const BLUNDERS_DB_RETRY_FILE = deps?.BLUNDERS_DB_RETRY_FILE;
  const dbUpsertPuzzleTags = deps?.dbUpsertPuzzleTags;
  const dbUpsertPuzzlesFromObjects = deps?.dbUpsertPuzzlesFromObjects;

  if (!fs) throw new Error('createBlundersDbRetry: missing deps.fs');
  if (!appDb) throw new Error('createBlundersDbRetry: missing deps.appDb');
  if (typeof nowIso !== 'function') throw new Error('createBlundersDbRetry: missing deps.nowIso');
  if (!BLUNDERS_DB_RETRY_FILE) throw new Error('createBlundersDbRetry: missing deps.BLUNDERS_DB_RETRY_FILE');
  if (typeof dbUpsertPuzzleTags !== 'function') throw new Error('createBlundersDbRetry: missing deps.dbUpsertPuzzleTags');
  if (typeof dbUpsertPuzzlesFromObjects !== 'function') throw new Error('createBlundersDbRetry: missing deps.dbUpsertPuzzlesFromObjects');

  let blundersDbRetryLock = Promise.resolve();
  async function withDbRetryLock(fn) {
    const prev = blundersDbRetryLock;
    let release;
    blundersDbRetryLock = new Promise((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async function readBlundersDbRetry() {
    return await withDbRetryLock(async () => {
      try {
        const raw = await fs.readFile(BLUNDERS_DB_RETRY_FILE, 'utf8');
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') return parsed;
        return { updatedAt: nowIso(), items: [] };
      } catch {
        return { updatedAt: nowIso(), items: [] };
      }
    });
  }

  async function writeBlundersDbRetry(obj) {
    return await withDbRetryLock(async () => {
      const out = (obj && typeof obj === 'object') ? obj : { items: [] };
      out.updatedAt = nowIso();
      if (!Array.isArray(out.items)) out.items = [];
      await fs.writeFile(BLUNDERS_DB_RETRY_FILE, JSON.stringify(out, null, 2), 'utf8');
      return true;
    });
  }

  function dbRetryBackoffMs(attempts) {
    const n = Math.max(0, Number(attempts || 0) || 0);
    const base = 10_000; // 10s
    const max = 10 * 60_000; // 10m
    const ms = Math.min(max, base * Math.pow(2, Math.min(6, n))); // cap exponent
    return ms;
  }

  async function enqueueBlundersDbRetry(type, payload, err) {
    const t = String(type || '').trim();
    if (!t) return false;
    const msg = err ? String(err?.message || err) : '';
    const now = Date.now();
    const store = await readBlundersDbRetry();
    const items = Array.isArray(store.items) ? store.items : [];
    const id = `dbr_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    items.push({
      id,
      type: t, // upsert_puzzles | upsert_tags
      createdAt: nowIso(),
      attempts: 0,
      nextAtMs: now,
      lastError: msg || null,
      payload: payload && typeof payload === 'object' ? payload : {}
    });
    // Bound size to prevent unbounded growth
    store.items = items.slice(-3000);
    await writeBlundersDbRetry(store);
    return true;
  }

  async function blundersDbRetryTick() {
    const pool = appDb.getPool();
    if (!pool) return;
    const store = await readBlundersDbRetry();
    const items = Array.isArray(store.items) ? store.items : [];
    if (!items.length) return;
    const now = Date.now();
    let changed = false;

    // process a small batch per tick
    const ready = items
      .filter(it => it && typeof it === 'object')
      .filter(it => Number(it.nextAtMs || 0) <= now)
      .sort((a, b) => Number(a.nextAtMs || 0) - Number(b.nextAtMs || 0))
      .slice(0, 40);
    if (!ready.length) return;

    const keep = [];
    for (const it of items) {
      const isReady = ready.includes(it);
      if (!isReady) keep.push(it);
    }

    for (const it of ready) {
      const type = String(it.type || '');
      const attempts = Math.max(0, Number(it.attempts || 0) || 0);
      const payload = it.payload && typeof it.payload === 'object' ? it.payload : {};
      try {
        if (type === 'upsert_tags') {
          const rows = Array.isArray(payload.rows) ? payload.rows : [];
          if (rows.length) await dbUpsertPuzzleTags(pool, rows);
        } else if (type === 'upsert_puzzles') {
          const oid = String(payload.orgId || '');
          const sid = String(payload.studentId || '');
          const puzzles = Array.isArray(payload.puzzles) ? payload.puzzles : [];
          if (puzzles.length) await dbUpsertPuzzlesFromObjects(pool, oid, sid, puzzles);
        }
        changed = true;
      } catch (e) {
        const nextAttempts = attempts + 1;
        const maxAttempts = 12;
        const msg = String(e?.message || e);
        if (nextAttempts >= maxAttempts) {
          // Drop it but keep a marker record (so you can see something went wrong in the file)
          keep.push({
            ...it,
            attempts: nextAttempts,
            nextAtMs: now + 365 * 24 * 60 * 60 * 1000,
            lastError: msg,
            dropped: true,
            droppedAt: nowIso()
          });
        } else {
          keep.push({
            ...it,
            attempts: nextAttempts,
            nextAtMs: now + dbRetryBackoffMs(nextAttempts),
            lastError: msg
          });
        }
        changed = true;
      }
    }

    if (changed) {
      store.items = keep.slice(-3000);
      await writeBlundersDbRetry(store);
    }
  }

  return {
    readBlundersDbRetry,
    writeBlundersDbRetry,
    enqueueBlundersDbRetry,
    blundersDbRetryTick,
    dbRetryBackoffMs
  };
}

module.exports = { createBlundersDbRetry };


