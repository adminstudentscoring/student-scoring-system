// Chess.com helpers extracted from server.js.
// Includes HK day helpers, Chess.com fetch helpers, ratings cache refresh,
// and Blunders daily auto sync scheduler.

function createBlundersChessCom(deps: any): any {
  const fs = deps?.fs;
  const CHESSCOM_RATINGS_FILE = deps?.CHESSCOM_RATINGS_FILE;

  const readData = deps?.readData;
  const readChessComSettings = deps?.readChessComSettings;
  const getOrgBlundersSettings = deps?.getOrgBlundersSettings;
  const normalizeHkDayKey = deps?.normalizeHkDayKey;

  const BLUNDERS_ALLOWED_TIME_CLASSES = deps?.BLUNDERS_ALLOWED_TIME_CLASSES;
  const BLUNDERS_MAX_GAMES_PER_DAY = deps?.BLUNDERS_MAX_GAMES_PER_DAY;
  const blundersSyncState = deps?.blundersSyncState;

  const nowIso = deps?.nowIso;
  const getSyncBlundersForStudent = deps?.getSyncBlundersForStudent;

  if (!fs) throw new Error('createBlundersChessCom: missing deps.fs');
  if (!CHESSCOM_RATINGS_FILE) throw new Error('createBlundersChessCom: missing deps.CHESSCOM_RATINGS_FILE');
  if (typeof readData !== 'function') throw new Error('createBlundersChessCom: missing deps.readData');
  if (typeof readChessComSettings !== 'function') throw new Error('createBlundersChessCom: missing deps.readChessComSettings');
  if (typeof getOrgBlundersSettings !== 'function') throw new Error('createBlundersChessCom: missing deps.getOrgBlundersSettings');
  if (typeof normalizeHkDayKey !== 'function') throw new Error('createBlundersChessCom: missing deps.normalizeHkDayKey');
  if (!(BLUNDERS_ALLOWED_TIME_CLASSES instanceof Set)) throw new Error('createBlundersChessCom: missing deps.BLUNDERS_ALLOWED_TIME_CLASSES (Set)');
  if (typeof BLUNDERS_MAX_GAMES_PER_DAY !== 'number') throw new Error('createBlundersChessCom: missing deps.BLUNDERS_MAX_GAMES_PER_DAY');
  if (!(blundersSyncState instanceof Map)) throw new Error('createBlundersChessCom: missing deps.blundersSyncState (Map)');
  if (typeof nowIso !== 'function') throw new Error('createBlundersChessCom: missing deps.nowIso');
  if (typeof getSyncBlundersForStudent !== 'function') throw new Error('createBlundersChessCom: missing deps.getSyncBlundersForStudent');

  // Day key based on Hong Kong time (UTC+8, no DST) to match your user base and Chess.com UI date.
  const HK_OFFSET_SEC = 8 * 3600;
  function hkDayKeyFromEpochSec(sec) {
    const d = new Date((Number(sec || 0) + HK_OFFSET_SEC) * 1000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }

  function todayHkKey() {
    const nowSec = Math.floor(Date.now() / 1000);
    return hkDayKeyFromEpochSec(nowSec);
  }

  function hkNow() {
    // Create a Date object representing HK local time (using UTC math, since HK has no DST).
    const d = new Date(Date.now() + HK_OFFSET_SEC * 1000);
    return {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth() + 1,
      d: d.getUTCDate(),
      hh: d.getUTCHours(),
      mm: d.getUTCMinutes(),
      ss: d.getUTCSeconds()
    };
  }

  function pad2(n) { return String(Number(n) || 0).padStart(2, '0'); }

  function formatHkTime(hh, mm) {
    return `${pad2(hh)}:${pad2(mm)} HK`;
  }

  async function fetchJsonWithTimeout(url, timeoutMs = 15000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'student-scoring-system/1.0' } });
      const data = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: String(e?.message || e) } };
    } finally {
      clearTimeout(t);
    }
  }

  // ===== Chess.com ratings cache (daily refresh) =====
  const CHESSCOM_RATINGS_REFRESH_HK_HOUR = Number(process.env.CHESSCOM_RATINGS_REFRESH_HK_HOUR || 5); // default 05:00 HK
  const CHESSCOM_RATINGS_REFRESH_HK_MIN = Number(process.env.CHESSCOM_RATINGS_REFRESH_HK_MIN || 0);

  async function readChessComRatings() {
    try {
      const content = await fs.readFile(CHESSCOM_RATINGS_FILE, 'utf8');
      const data = JSON.parse(content);
      const orgs = data && typeof data === 'object' ? (data.orgs || {}) : {};
      const meta = data && typeof data === 'object' ? (data.meta || {}) : {};
      return { orgs: (orgs && typeof orgs === 'object') ? orgs : {}, meta: (meta && typeof meta === 'object') ? meta : {} };
    } catch (error) {
      console.error('Error reading chesscom ratings:', error);
      return { orgs: {}, meta: {} };
    }
  }

  async function writeChessComRatings(orgs, meta) {
    try {
      const cleanOrgs = orgs && typeof orgs === 'object' ? orgs : {};
      const cleanMeta = meta && typeof meta === 'object' ? meta : {};
      await fs.writeFile(CHESSCOM_RATINGS_FILE, JSON.stringify({ orgs: cleanOrgs, meta: cleanMeta }, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing chesscom ratings:', error);
      return false;
    }
  }

  function pickChessComRating(stats) {
    // Prefer rapid, then blitz.
    const r = Number(stats?.chess_rapid?.last?.rating);
    if (Number.isFinite(r) && r > 0) return { rating: r, source: 'rapid' };
    const b = Number(stats?.chess_blitz?.last?.rating);
    if (Number.isFinite(b) && b > 0) return { rating: b, source: 'blitz' };
    return { rating: null, source: null };
  }

  async function fetchChessComStats(username) {
    const u = String(username || '').trim();
    if (!u) return { ok: false, status: 0, data: { error: 'missing username' } };
    const url = `https://api.chess.com/pub/player/${encodeURIComponent(u)}/stats`;
    return await fetchJsonWithTimeout(url, 15000);
  }

  async function getCachedChessComRating(orgId, studentId, chessId) {
    const oid = String(orgId || '');
    const sid = String(studentId || '');
    const cid = String(chessId || '').trim();
    if (!oid || !sid || !cid) return { rating: null, source: null, updatedAt: null };
    const { orgs } = await readChessComRatings();
    const org = orgs[oid] && typeof orgs[oid] === 'object' ? orgs[oid] : {};
    const ent = org[sid] && typeof org[sid] === 'object' ? org[sid] : null;
    if (!ent || String(ent.chessId || '') !== cid) return { rating: null, source: null, updatedAt: null };
    return { rating: Number(ent.rating ?? null), source: ent.source || null, updatedAt: ent.updatedAt || null };
  }

  async function refreshChessComRatingsForOrg(orgId) {
    const oid = String(orgId || '');
    if (!oid) return { ok: false, updated: 0 };
    const data = await readData();
    const students = Array.isArray(data?.students) ? data.students.filter(s => String(s.organizationId || '') === oid) : [];
    // Keep for parity with original server.js (even if not used right now)
    await getOrgBlundersSettings(oid).catch(() => {});
    // Use chesscom settings mapping (studentId -> chessId)
    const chessSettingsAll = await readChessComSettings();
    const mapping = (chessSettingsAll && chessSettingsAll[oid] && typeof chessSettingsAll[oid] === 'object') ? chessSettingsAll[oid] : {};

    const { orgs, meta } = await readChessComRatings();
    if (!orgs[oid] || typeof orgs[oid] !== 'object') orgs[oid] = {};
    const bucket = orgs[oid];

    let updated = 0;
    for (const s of students) {
      const sid = String(s.id || '');
      const chessId = String(mapping?.[sid]?.chessId || '').trim();
      if (!chessId) continue;
      const resp = await fetchChessComStats(chessId);
      if (!resp.ok) continue;
      const picked = pickChessComRating(resp.data);
      bucket[sid] = {
        chessId,
        rating: picked.rating,
        source: picked.source,
        updatedAt: nowIso()
      };
      updated++;
    }
    orgs[oid] = bucket;
    meta.lastRunAt = nowIso();
    meta.lastRunHkDay = todayHkKey();
    await writeChessComRatings(orgs, meta);
    return { ok: true, updated };
  }

  function computeNextRatingsRunIso() {
    const now = hkNow();
    // Build next run in HK date space, then convert back to UTC ISO via subtracting offset.
    let y = now.y, m = now.m, d = now.d;
    const afterToday =
      (now.hh > CHESSCOM_RATINGS_REFRESH_HK_HOUR) ||
      (now.hh === CHESSCOM_RATINGS_REFRESH_HK_HOUR && now.mm >= CHESSCOM_RATINGS_REFRESH_HK_MIN);
    if (afterToday) {
      const t = new Date(Date.UTC(y, m - 1, d) + 24 * 3600 * 1000);
      y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate();
    }
    const runUtcMs = Date.UTC(y, m - 1, d, CHESSCOM_RATINGS_REFRESH_HK_HOUR, CHESSCOM_RATINGS_REFRESH_HK_MIN) - HK_OFFSET_SEC * 1000;
    return new Date(runUtcMs).toISOString();
  }

  async function maybeRunChessComRatingsRefreshAllOrgs() {
    const { meta } = await readChessComRatings();
    const hk = hkNow();
    const hkDay = todayHkKey();
    const alreadyRanToday = String(meta?.lastRunHkDay || '') === hkDay;
    const isAfterTarget =
      (hk.hh > CHESSCOM_RATINGS_REFRESH_HK_HOUR) ||
      (hk.hh === CHESSCOM_RATINGS_REFRESH_HK_HOUR && hk.mm >= CHESSCOM_RATINGS_REFRESH_HK_MIN);
    if (alreadyRanToday || !isAfterTarget) return { ok: true, skipped: true };

    // Run refresh for all orgs that have mappings.
    const chessSettingsAll = await readChessComSettings();
    const orgs = chessSettingsAll && chessSettingsAll.orgs ? chessSettingsAll.orgs : chessSettingsAll; // backward compatibility
    const orgIds = orgs && typeof orgs === 'object' ? Object.keys(orgs) : [];
    for (const oid of orgIds) {
      await refreshChessComRatingsForOrg(oid).catch(() => {});
    }
    return { ok: true, ran: true };
  }

  // ===== Blunders: daily auto sync (all students) =====
  const BLUNDERS_DAILY_SYNC_HK_HOUR = Number(process.env.BLUNDERS_DAILY_SYNC_HK_HOUR || 4); // default 04:00 HK
  const BLUNDERS_DAILY_SYNC_HK_MIN = Number(process.env.BLUNDERS_DAILY_SYNC_HK_MIN || 0);
  const blundersDailySyncMeta = { lastRunAt: null, lastRunHkDay: null, lastRunOk: 0, lastRunErr: 0 };

  function computeNextBlundersDailyRunIso() {
    const now = hkNow();
    let y = now.y, m = now.m, d = now.d;
    const afterToday =
      (now.hh > BLUNDERS_DAILY_SYNC_HK_HOUR) ||
      (now.hh === BLUNDERS_DAILY_SYNC_HK_HOUR && now.mm >= BLUNDERS_DAILY_SYNC_HK_MIN);
    if (afterToday) {
      const t = new Date(Date.UTC(y, m - 1, d) + 24 * 3600 * 1000);
      y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate();
    }
    const runUtcMs = Date.UTC(y, m - 1, d, BLUNDERS_DAILY_SYNC_HK_HOUR, BLUNDERS_DAILY_SYNC_HK_MIN) - HK_OFFSET_SEC * 1000;
    return new Date(runUtcMs).toISOString();
  }

  async function maybeRunBlundersDailySyncAllStudents() {
    const hk = hkNow();
    const hkDay = todayHkKey();
    const alreadyRanToday = String(blundersDailySyncMeta.lastRunHkDay || '') === hkDay;
    const isAfterTarget =
      (hk.hh > BLUNDERS_DAILY_SYNC_HK_HOUR) ||
      (hk.hh === BLUNDERS_DAILY_SYNC_HK_HOUR && hk.mm >= BLUNDERS_DAILY_SYNC_HK_MIN);
    if (alreadyRanToday || !isAfterTarget) return { ok: true, skipped: true };

    let okCount = 0;
    let errCount = 0;
    try {
      const data = await readData();
      const students = Array.isArray(data?.students) ? data.students : [];
      const syncBlundersForStudent = getSyncBlundersForStudent();
      for (const s of students) {
        try {
          // Non-forced daily run: respects per-student throttle and avoids excessive load.
          await syncBlundersForStudent(s, { hkDayKey: hkDay, force: '0' });
          okCount++;
        } catch {
          errCount++;
        }
      }
    } finally {
      blundersDailySyncMeta.lastRunAt = nowIso();
      blundersDailySyncMeta.lastRunHkDay = hkDay;
      blundersDailySyncMeta.lastRunOk = okCount;
      blundersDailySyncMeta.lastRunErr = errCount;
    }
    return { ok: true, ran: true, okCount, errCount };
  }

  // ===== Blunders: Chess.com games fetch (rapid/blitz) =====
  async function chessComGetGamesForHkDay(username, opts = {}) {
    const u = String(username || '').trim();
    if (!u) return [];
    const sid = String(opts.studentId || '');
    const hkDay = normalizeHkDayKey(opts.hkDayKey) || todayHkKey();
    const limit = Math.max(1, Math.min(50, Number(opts.limit || 0) || BLUNDERS_MAX_GAMES_PER_DAY));

    if (sid) {
      const st0 = blundersSyncState.get(sid) || {};
      blundersSyncState.set(sid, { ...st0, stage: 'fetch-archives', updatedAt: nowIso(), fetch: { label: 'archives', url: null, startedAtMs: Date.now(), timeoutMs: 15000 } });
    }
    const archivesUrl = `https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`;
    const a = await fetchJsonWithTimeout(archivesUrl, 15000);
    if (sid) {
      const st1 = blundersSyncState.get(sid) || {};
      blundersSyncState.set(sid, { ...st1, fetch: { ...(st1.fetch || {}), url: archivesUrl, ok: !!a.ok, status: a.status, error: a.data?.error || null } });
    }
    const archives = Array.isArray(a.data?.archives) ? a.data.archives : [];
    if (!archives.length) return [];
    // Find month archive URL for requested HK day
    const ym = hkDay.slice(0, 7);
    const monthArchiveUrl = String(archives.find((x) => String(x || '').includes(`/${ym}`)) || archives[archives.length - 1] || '');
    if (!monthArchiveUrl) return [];

    if (sid) {
      const st2 = blundersSyncState.get(sid) || {};
      blundersSyncState.set(sid, { ...st2, stage: 'fetch-month-archive', updatedAt: nowIso(), fetch: { label: 'month-archive', url: monthArchiveUrl, startedAtMs: Date.now(), timeoutMs: 20000 } });
    }
    const g = await fetchJsonWithTimeout(monthArchiveUrl, 20000);
    if (sid) {
      const st3 = blundersSyncState.get(sid) || {};
      blundersSyncState.set(sid, { ...st3, fetch: { ...(st3.fetch || {}), ok: !!g.ok, status: g.status, error: g.data?.error || null } });
    }
    const games = Array.isArray(g.data?.games) ? g.data.games : [];
    const filtered = games
      .filter((x) => x && BLUNDERS_ALLOWED_TIME_CLASSES.has(String(x.time_class || '').toLowerCase()))
      .filter((x) => hkDayKeyFromEpochSec(x.end_time) === hkDay)
      .filter((x) => {
        const w = String(x?.white?.username || '').toLowerCase();
        const b = String(x?.black?.username || '').toLowerCase();
        const me = u.toLowerCase();
        return w === me || b === me;
      })
      .sort((a2, b2) => Number(b2.end_time || 0) - Number(a2.end_time || 0))
      .slice(0, limit);

    if (sid) {
      const st4 = blundersSyncState.get(sid) || {};
      const withPgn = filtered.filter(x => typeof x?.pgn === 'string' && x.pgn.trim().length > 0).length;
      blundersSyncState.set(sid, {
        ...st4,
        stage: 'filter',
        updatedAt: nowIso(),
        fetchSummary: { archivesCount: archives.length, rawGamesInMonth: games.length, matchedToday: filtered.length, withPgn }
      });
    }
    return filtered;
  }

  async function chessComGetTodayGames(username, opts = {}) {
    return chessComGetGamesForHkDay(username, { ...opts, hkDayKey: todayHkKey() });
  }

  // Fetch most recent N games across Chess.com month archives (rapid+blitz by default).
  // This is used by teacher "History scan" to build a larger puzzle bank.
  async function chessComGetRecentGames(username, opts = {}) {
    const u = String(username || '').trim();
    if (!u) return [];
    const sid = String(opts.studentId || '');
    const limit = Math.max(1, Math.min(500, Number(opts.limit || 0) || 100));
    const includeWithoutPgn = !!opts.includeWithoutPgn;
    const allowed = opts.allowedTimeClasses instanceof Set ? opts.allowedTimeClasses : BLUNDERS_ALLOWED_TIME_CLASSES;

    if (sid) {
      const st0 = blundersSyncState.get(sid) || {};
      blundersSyncState.set(sid, { ...st0, stage: 'fetch-archives', updatedAt: nowIso(), fetch: { label: 'archives', url: null, startedAtMs: Date.now(), timeoutMs: 15000 } });
    }

    const archivesUrl = `https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`;
    const a = await fetchJsonWithTimeout(archivesUrl, 15000);
    if (sid) {
      const st1 = blundersSyncState.get(sid) || {};
      blundersSyncState.set(sid, { ...st1, fetch: { ...(st1.fetch || {}), url: archivesUrl, ok: !!a.ok, status: a.status, error: a.data?.error || null } });
    }
    const archives = Array.isArray(a.data?.archives) ? a.data.archives : [];
    if (!archives.length) return [];

    const me = u.toLowerCase();
    const out = [];
    let monthsFetched = 0;
    let rawGamesScanned = 0;
    let collectedWithPgn = 0;

    for (let i = archives.length - 1; i >= 0 && out.length < limit; i--) {
      const monthUrl = String(archives[i] || '');
      if (!monthUrl) continue;
      monthsFetched++;

      if (sid) {
        const st2 = blundersSyncState.get(sid) || {};
        blundersSyncState.set(sid, { ...st2, stage: 'fetch-month-archive', updatedAt: nowIso(), fetch: { label: `month-archive-${monthsFetched}`, url: monthUrl, startedAtMs: Date.now(), timeoutMs: 20000 } });
      }

      const g = await fetchJsonWithTimeout(monthUrl, 20000);
      const games = Array.isArray(g.data?.games) ? g.data.games : [];
      rawGamesScanned += games.length;

      const filtered = games
        .filter((x) => x && allowed.has(String(x.time_class || '').toLowerCase()))
        .filter((x) => {
          const w = String(x?.white?.username || '').toLowerCase();
          const b = String(x?.black?.username || '').toLowerCase();
          return w === me || b === me;
        })
        .sort((a2, b2) => Number(b2.end_time || 0) - Number(a2.end_time || 0));

      for (const game of filtered) {
        const pgn = String(game?.pgn || '');
        if (!includeWithoutPgn && !pgn.trim()) continue;
        out.push(game);
        if (pgn.trim()) collectedWithPgn++;
        if (out.length >= limit) break;
      }

      if (sid) {
        const st3 = blundersSyncState.get(sid) || {};
        blundersSyncState.set(sid, {
          ...st3,
          stage: 'filter',
          updatedAt: nowIso(),
          fetchSummary: {
            archivesCount: archives.length,
            monthsFetched,
            rawGamesScanned,
            collected: out.length,
            withPgn: collectedWithPgn
          }
        });
      }
    }

    out.sort((a2, b2) => Number(b2.end_time || 0) - Number(a2.end_time || 0));
    return out.slice(0, limit);
  }

  async function getChessComUsernameForStudent(orgId, studentId) {
    const o = String(orgId || '');
    const sid = String(studentId || '');
    if (!o || !sid) return '';
    const orgs = await readChessComSettings();
    const orgSettings = orgs && orgs[o] ? orgs[o] : {};
    const entry = orgSettings && orgSettings[sid] ? orgSettings[sid] : null;
    return String(entry?.chessId || '').trim();
  }

  return {
    // time helpers
    HK_OFFSET_SEC,
    hkDayKeyFromEpochSec,
    todayHkKey,
    hkNow,
    formatHkTime,

    // fetch helper
    fetchJsonWithTimeout,

    // ratings cache
    CHESSCOM_RATINGS_REFRESH_HK_HOUR,
    CHESSCOM_RATINGS_REFRESH_HK_MIN,
    readChessComRatings,
    writeChessComRatings,
    pickChessComRating,
    fetchChessComStats,
    getCachedChessComRating,
    refreshChessComRatingsForOrg,
    computeNextRatingsRunIso,
    maybeRunChessComRatingsRefreshAllOrgs,

    // daily sync
    BLUNDERS_DAILY_SYNC_HK_HOUR,
    BLUNDERS_DAILY_SYNC_HK_MIN,
    blundersDailySyncMeta,
    computeNextBlundersDailyRunIso,
    maybeRunBlundersDailySyncAllStudents,

    // chess.com games
    chessComGetGamesForHkDay,
    chessComGetTodayGames,
    chessComGetRecentGames,
    getChessComUsernameForStudent
  };
}

module.exports = { createBlundersChessCom };


