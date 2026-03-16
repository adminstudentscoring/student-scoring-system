// Blunders AI coach comment logic extracted from server.js.
// Includes file cache (with lock), cache helpers, and OpenAI generation.

function createBlundersAi(deps: any): any {
  const fs = deps?.fs;
  const BLUNDERS_AI_COMMENTS_FILE = deps?.BLUNDERS_AI_COMMENTS_FILE;
  const nowIso = deps?.nowIso;
  const openAiEnabled = deps?.openAiEnabled;
  const openAiJson = deps?.openAiJson;
  const readBlundersPuzzles = deps?.readBlundersPuzzles;
  const readBlundersStats = deps?.readBlundersStats;
  const computeStudentMonthStats = deps?.computeStudentMonthStats;

  if (!fs) throw new Error('createBlundersAi: missing deps.fs');
  if (!BLUNDERS_AI_COMMENTS_FILE) throw new Error('createBlundersAi: missing deps.BLUNDERS_AI_COMMENTS_FILE');
  if (typeof nowIso !== 'function') throw new Error('createBlundersAi: missing deps.nowIso');
  if (typeof openAiEnabled !== 'function') throw new Error('createBlundersAi: missing deps.openAiEnabled');
  if (typeof openAiJson !== 'function') throw new Error('createBlundersAi: missing deps.openAiJson');
  if (typeof readBlundersPuzzles !== 'function') throw new Error('createBlundersAi: missing deps.readBlundersPuzzles');
  if (typeof readBlundersStats !== 'function') throw new Error('createBlundersAi: missing deps.readBlundersStats');
  if (typeof computeStudentMonthStats !== 'function') throw new Error('createBlundersAi: missing deps.computeStudentMonthStats');

  let blundersAiCommentsLock = Promise.resolve();
  async function withAiCommentsLock(fn) {
    const prev = blundersAiCommentsLock;
    let release;
    blundersAiCommentsLock = new Promise((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async function readBlundersAiComments() {
    return await withAiCommentsLock(async () => {
      try {
        const raw = await fs.readFile(BLUNDERS_AI_COMMENTS_FILE, 'utf8');
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
      } catch {
        return {};
      }
    });
  }

  async function writeBlundersAiComments(obj) {
    return await withAiCommentsLock(async () => {
      const out = (obj && typeof obj === 'object') ? obj : {};
      await fs.writeFile(BLUNDERS_AI_COMMENTS_FILE, JSON.stringify(out, null, 2), 'utf8');
      return true;
    });
  }

  const blundersAiCommentInFlight = new Set(); // cacheKey strings

  function aiCommentCacheKey({ orgId, studentId, range = 'month' }) {
    return `${String(orgId || '')}|${String(studentId || '')}|${String(range || 'month')}`;
  }

  function aiCommentIsFresh(updatedAtIso, ttlMs) {
    const t = Date.parse(String(updatedAtIso || ''));
    return Number.isFinite(t) && (Date.now() - t) < ttlMs;
  }

  async function generateStudentAiCommentMonth({ orgId, studentId, force = false }) {
    const oid = String(orgId || '');
    const sid = String(studentId || '');
    if (!oid || !sid) throw new Error('Missing orgId/studentId');

    const range = 'month';
    const ttlMs = 24 * 60 * 60 * 1000; // low-cost: max once/day per student
    const errTtlMs = 10 * 60 * 1000; // if it fails, pause retries for a short window to avoid infinite "generating"
    const key = aiCommentCacheKey({ orgId: oid, studentId: sid, range });
    const store = await readBlundersAiComments();
    const cur = store?.[key] || null;
    if (!force && cur?.updatedAt && aiCommentIsFresh(cur.updatedAt, ttlMs)) return { ok: true, cached: true, entry: cur };
    if (!force && cur?.error && cur?.failedAt && aiCommentIsFresh(cur.failedAt, errTtlMs)) return { ok: false, error: cur.error, cached: true, entry: cur };
    if (!openAiEnabled()) return { ok: false, error: 'OpenAI not configured', cached: !!cur, entry: cur };

    // Avoid duplicate concurrent generations
    if (!force && blundersAiCommentInFlight.has(key)) return { ok: true, cached: true, inFlight: true, entry: cur };
    blundersAiCommentInFlight.add(key);
    try {
      const puzzles = await readBlundersPuzzles();
      let analyzedMap = {};
      try {
        const orgs = await readBlundersStats();
        analyzedMap = orgs?.[oid]?.[sid]?.analyzed || {};
      } catch {}

      const monthStats = computeStudentMonthStats({ orgId: oid, studentId: sid, puzzles, analyzedMap });

      const topTags = Object.entries(monthStats?.current?.topTags || {})
        .map(([t, n]) => ({ t, n: Number(n || 0) || 0 }))
        .sort((a, b) => (b.n - a.n) || a.t.localeCompare(b.t))
        .slice(0, 10);

      const compact = {
        range: 'last_30_days',
        nowIso: monthStats.nowIso,
        completionRate: monthStats.current.completionRate,
        completionRateDelta: monthStats.delta.completionRate,
        puzzles: {
          total: monthStats.current.total,
          completed: monthStats.current.completed,
          pending: monthStats.current.pending
        },
        difficultyBuckets: {
          missMate: monthStats.current.missMate,
          d1: monthStats.current.buckets.d1,
          d2: monthStats.current.buckets.d2,
          d3: monthStats.current.buckets.d3,
          d4: monthStats.current.buckets.d4
        },
        avgDrop: monthStats.current.avgDrop,
        avgDropDelta: monthStats.delta.avgDrop,
        topTags,
        opponentAvgRating: monthStats?.rolling30d?.avgOpponentRating,
        analyzedGames: monthStats?.rolling30d?.analyzedGames,
        totalPlies: monthStats?.rolling30d?.totalPlies,
        blunderRatesMovesPer: monthStats?.rolling30d?.movesPer
      };

      const system = [
        'You are a chess coach writing a short performance comment for a student.',
        'Write in English.',
        'Be constructive, specific, and data-grounded.',
        'Output JSON only with key: article.',
        'The article must be 2-3 short paragraphs, flowing naturally (no bullet lists).',
        'Keep it under 120 words total. No emojis.'
      ].join(' ');

      const user = `Student stats JSON (last 30 days):\n${JSON.stringify(compact)}\n\nGenerate the JSON comment now.`;
      const out = await openAiJson({ system, user, maxOutputTokens: 220 });

      const entry = {
        range,
        updatedAt: nowIso(),
        model: String(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
        stats: compact,
        comment: out?.json || null,
        text: out?.text || null,
        usage: out?.usage || null,
        error: null,
        failedAt: null
      };
      store[key] = entry;
      await writeBlundersAiComments(store);
      return { ok: true, cached: false, entry };
    } catch (e) {
      const msg = String(e?.message || e);
      const entry = {
        range,
        updatedAt: cur?.updatedAt || null,
        model: String(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
        stats: cur?.stats || null,
        comment: cur?.comment || null,
        text: cur?.text || null,
        usage: cur?.usage || null,
        error: msg,
        failedAt: nowIso()
      };
      store[key] = entry;
      try { await writeBlundersAiComments(store); } catch {}
      return { ok: false, error: msg, cached: false, entry };
    } finally {
      blundersAiCommentInFlight.delete(key);
    }
  }

  return {
    readBlundersAiComments,
    writeBlundersAiComments,
    aiCommentCacheKey,
    aiCommentIsFresh,
    generateStudentAiCommentMonth
  };
}

module.exports = { createBlundersAi };


