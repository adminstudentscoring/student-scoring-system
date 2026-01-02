// Blunders puzzle helpers extracted from server.js.
// Includes: bucketing, sorting, drop/mate helpers, pruning, preserve-progress merge,
// and Challenge-mode puzzle picking.

function createBlundersPuzzles(deps) {
  const readBlundersPuzzles = deps?.readBlundersPuzzles;
  const writeBlundersPuzzles = deps?.writeBlundersPuzzles;
  const appDb = deps?.appDb;
  const BLUNDERS_MAX_PUZZLES_PER_STUDENT = deps?.BLUNDERS_MAX_PUZZLES_PER_STUDENT;
  const enqueueBlundersDbRetry = (typeof deps?.enqueueBlundersDbRetry === 'function') ? deps.enqueueBlundersDbRetry : (async () => false);

  if (typeof readBlundersPuzzles !== 'function') throw new Error('createBlundersPuzzles: missing deps.readBlundersPuzzles');
  if (typeof writeBlundersPuzzles !== 'function') throw new Error('createBlundersPuzzles: missing deps.writeBlundersPuzzles');
  if (!appDb || typeof appDb.getPool !== 'function') throw new Error('createBlundersPuzzles: missing deps.appDb.getPool');

  function puzzleSortKeyMs(p) {
    const done = Date.parse(String(p?.completedAt || ''));
    if (Number.isFinite(done) && done > 0) return done;
    const end = Number(p?.endTime || 0);
    if (Number.isFinite(end) && end > 0) return end * 1000;
    const created = Date.parse(String(p?.createdAt || ''));
    return Number.isFinite(created) ? created : 0;
  }

  function threeMonthsAgoMs() {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.getTime();
  }

  function puzzleDropPoints(p) {
    const dp = (typeof p?.dropPoints === 'number') ? p.dropPoints : (Number(p?.dropCp || 0) / 100);
    return Number.isFinite(dp) ? dp : 0;
  }

  function isMissMatePuzzle(p) {
    const bestCp = Number(p?.bestCp ?? 0);
    return Number.isFinite(bestCp) && Math.abs(bestCp) >= 99999;
  }

  function isInvalidSameBestMovePuzzle(p) {
    // If the played move equals engine best move AND engine indicates a mate score,
    // this is not a missed mate blunder; it typically means score parsing failed for the played move.
    const bestCp = Number(p?.bestCp ?? 0);
    if (!(Number.isFinite(bestCp) && Math.abs(bestCp) >= 99999)) return false;
    const bm = String(p?.bestMoveUci || '').trim().toLowerCase();
    const um = String(p?.blunderMoveUci || '').trim().toLowerCase();
    return !!bm && !!um && bm === um;
  }

  function blundersBucketKeyOfPuzzle(p) {
    if (isMissMatePuzzle(p)) return 'missMate';
    const d = puzzleDropPoints(p);
    if (d >= 1.0 && d <= 1.5) return 'd1';
    if (d > 1.5 && d <= 2.0) return 'd2';
    if (d > 2.0 && d <= 3.0) return 'd3';
    if (d > 3.0) return 'd4';
    return 'd1';
  }

  function blundersRatingBucket(rating) {
    const r = Number(rating);
    if (!Number.isFinite(r) || r <= 0) return 'below400';
    if (r <= 400) return 'below400';
    if (r <= 700) return '401-700';
    if (r <= 1000) return '701-1000';
    if (r <= 1500) return '1001-1500';
    return '1501up';
  }

  function pickStudentRatingFromCache(orgId, studentId, ratingsOrgs) {
    const oid = String(orgId || '');
    const sid = String(studentId || '');
    if (!oid || !sid) return { rating: null, source: null };
    const bucket = (ratingsOrgs && ratingsOrgs[oid] && typeof ratingsOrgs[oid] === 'object') ? ratingsOrgs[oid] : {};
    const ent = bucket[sid] && typeof bucket[sid] === 'object' ? bucket[sid] : null;
    const rating = (ent && ent.rating !== null && ent.rating !== undefined) ? Number(ent.rating) : null;
    const source = ent ? (ent.source || null) : null;
    return { rating: Number.isFinite(rating) ? rating : null, source };
  }

  function pickChallengePuzzlesFromAllBlunders({ orgId, difficultyCfg, challengerBucket, puzzles, ratingsOrgs, limit = 10 }) {
    const oid = String(orgId || '');
    const list = Array.isArray(puzzles) ? puzzles : [];
    const cfg = difficultyCfg;
    const wantedBucket = String(challengerBucket || '');
    const lim = Math.max(1, Math.min(50, Number(limit) || 10));

    const eligible = (p) => {
      if (String(p?.orgId || '') !== oid) return false;
      if (String(p?.scope || '') === 'master') return false;
      if (isMissMatePuzzle(p)) return false;
      const dp = puzzleDropPoints(p);
      if (!Number.isFinite(dp)) return false;
      if (dp < cfg.min) return false;
      if (dp >= cfg.max) return false;
      return true;
    };

    const poolAll = list.filter(eligible);
    const poolBucket = poolAll.filter((p) => {
      const ownerId = String(p?.studentId || '');
      const ownerRating = pickStudentRatingFromCache(oid, ownerId, ratingsOrgs).rating;
      const ownerBucket = blundersRatingBucket(ownerRating);
      return ownerBucket === wantedBucket;
    });

    const pool = poolBucket.length >= lim ? poolBucket : poolAll;
    // Shuffle (Fisher-Yates)
    const arr = pool.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr.slice(0, lim);
  }

  function pruneStudentBlundersInPlace(puzzles, orgId, studentId, limit = BLUNDERS_MAX_PUZZLES_PER_STUDENT) {
    const oid = String(orgId || '');
    const sid = String(studentId || '');
    const limIn = Number(limit);
    const limDefault = Number(BLUNDERS_MAX_PUZZLES_PER_STUDENT);
    const limRaw = Number.isFinite(limIn) ? limIn : limDefault;
    // 0 or negative => unlimited (no pruning)
    if (limRaw <= 0) return { changed: false, removed: 0 };
    // Hard upper bound to avoid runaway pruning configs
    const lim = Math.max(1, Math.min(500, limRaw));
    if (!oid || !sid) return { changed: false, removed: 0 };
    const list = Array.isArray(puzzles) ? puzzles : [];
    const mine = list
      .filter(p => String(p.orgId || '') === oid && String(p.scope || '') !== 'master' && String(p.studentId || '') === sid)
      .slice()
      .sort((a, b) => puzzleSortKeyMs(b) - puzzleSortKeyMs(a));
    if (mine.length <= lim) return { changed: false, removed: 0 };
    const keepIds = new Set(mine.slice(0, lim).map(p => String(p.id || '')).filter(Boolean));
    const before = list.length;
    const kept = [];
    for (const p of list) {
      const isMine = String(p.orgId || '') === oid && String(p.scope || '') !== 'master' && String(p.studentId || '') === sid;
      if (isMine) {
        const pid = String(p.id || '');
        if (pid && keepIds.has(pid)) kept.push(p);
      } else {
        kept.push(p);
      }
    }
    puzzles.length = 0;
    puzzles.push(...kept);
    const after = puzzles.length;
    return { changed: after !== before, removed: Math.max(0, before - after) };
  }

  // Merge-only helper: append new puzzles (by stable `key`) to the latest on-disk puzzle bank.
  // This prevents "lost updates" where a long-running sync overwrites recent status changes
  // (e.g., completed -> pending) written by student attempts.
  async function appendBlundersPuzzlesPreserveProgress(newPuzzles, orgId, studentId) {
    const oid = String(orgId || '');
    const sid = String(studentId || '');
    const incoming = Array.isArray(newPuzzles) ? newPuzzles : [];
    if (!incoming.length) return { ok: true, changed: false, added: 0, total: 0 };

    const puzzlesLatest = await readBlundersPuzzles();
    const list = Array.isArray(puzzlesLatest) ? puzzlesLatest : [];
    const keys = new Set(list.map((p) => String(p?.key || '')).filter(Boolean));

    let added = 0;
    const newlyAdded = [];
    for (const p of incoming) {
      const k = String(p?.key || '').trim();
      if (!k) continue;
      if (keys.has(k)) continue; // never overwrite existing puzzle (preserve status/attempts)
      list.push(p);
      keys.add(k);
      added++;
      newlyAdded.push(p);
    }

    // Keep bounded if configured (0 => unlimited).
    const pr = pruneStudentBlundersInPlace(list, oid, sid, BLUNDERS_MAX_PUZZLES_PER_STUDENT);
    const changed = added > 0 || !!pr.changed;
    if (changed) await writeBlundersPuzzles(list);

    // Optional DB write: keep Postgres in sync with new puzzles so BLUNDERS_USE_DB stays fresh.
    // Best-effort and never blocks JSON persistence.
    try {
      const pool = appDb.getPool();
      if (pool && newlyAdded.length) {
        const cols = [
          'key',
          'org_id',
          'student_id',
          'chesscom_username',
          'game_url',
          'time_class',
          'end_time_sec',
          'sort_at_ms',
          'student_color',
          'start_fen',
          'opponent_move_uci',
          'opponent_san',
          'blunder_move_uci',
          'blunder_san',
          'best_move_uci',
          'best_cp',
          'after_cp',
          'drop_cp',
          'drop_points',
          'tags',
          'tagger_version',
          'tagged_at',
          'created_at',
          'raw'
        ];

        const values = [];
        const placeholders = [];
        let pi = 1;
        for (const pz of newlyAdded) {
          const key = String(pz?.key || '').trim();
          if (!key) continue;
          const dp = (typeof pz?.dropPoints === 'number') ? Number(pz.dropPoints) : (Number(pz?.dropCp || 0) / 100);
          const createdAt = (() => {
            const t = Date.parse(String(pz?.createdAt || ''));
            return Number.isFinite(t) ? new Date(t).toISOString() : null;
          })();
          const tags = Array.isArray(pz?.tags) ? pz.tags.map(String).filter(Boolean) : [];
          const taggerVersion = pz?.taggerVersion ? String(pz.taggerVersion) : (pz?.tagger_version ? String(pz.tagger_version) : null);
          const taggedAt = (() => {
            const t = Date.parse(String(pz?.taggedAt || ''));
            return Number.isFinite(t) ? new Date(t).toISOString() : null;
          })();
          const row = [
            key,
            oid,
            sid,
            pz?.chessComUsername ? String(pz.chessComUsername) : null,
            pz?.gameUrl ? String(pz.gameUrl) : null,
            pz?.timeClass ? String(pz.timeClass) : null,
            Number(pz?.endTime || 0) || null,
            puzzleSortKeyMs(pz),
            pz?.studentColor ? String(pz.studentColor) : null,
            pz?.startFEN ? String(pz.startFEN) : null,
            pz?.opponentMoveUci ? String(pz.opponentMoveUci) : null,
            pz?.opponentSan ? String(pz.opponentSan) : null,
            pz?.blunderMoveUci ? String(pz.blunderMoveUci) : null,
            pz?.blunderSan ? String(pz.blunderSan) : null,
            pz?.bestMoveUci ? String(pz.bestMoveUci) : null,
            (pz?.bestCp === null || pz?.bestCp === undefined) ? null : Number(pz.bestCp),
            (pz?.afterCp === null || pz?.afterCp === undefined) ? null : Number(pz.afterCp),
            (pz?.dropCp === null || pz?.dropCp === undefined) ? null : Number(pz.dropCp),
            Number.isFinite(dp) ? dp : 0,
            JSON.stringify(tags),
            taggerVersion,
            taggedAt,
            createdAt,
            JSON.stringify(pz || {})
          ];
          values.push(...row);
          placeholders.push(`(${row.map(() => `$${pi++}`).join(',')})`);
        }

        if (placeholders.length) {
          await pool.query(
            `
            INSERT INTO blunders_puzzles (${cols.join(',')})
            VALUES ${placeholders.join(',')}
            ON CONFLICT (key) DO UPDATE SET
              org_id=EXCLUDED.org_id,
              student_id=EXCLUDED.student_id,
              chesscom_username=EXCLUDED.chesscom_username,
              game_url=EXCLUDED.game_url,
              time_class=EXCLUDED.time_class,
              end_time_sec=EXCLUDED.end_time_sec,
              sort_at_ms=EXCLUDED.sort_at_ms,
              student_color=EXCLUDED.student_color,
              start_fen=EXCLUDED.start_fen,
              opponent_move_uci=EXCLUDED.opponent_move_uci,
              opponent_san=EXCLUDED.opponent_san,
              blunder_move_uci=EXCLUDED.blunder_move_uci,
              blunder_san=EXCLUDED.blunder_san,
              best_move_uci=EXCLUDED.best_move_uci,
              best_cp=EXCLUDED.best_cp,
              after_cp=EXCLUDED.after_cp,
              drop_cp=EXCLUDED.drop_cp,
              drop_points=EXCLUDED.drop_points,
              tags=COALESCE(EXCLUDED.tags, blunders_puzzles.tags),
              tagger_version=COALESCE(EXCLUDED.tagger_version, blunders_puzzles.tagger_version),
              tagged_at=COALESCE(EXCLUDED.tagged_at, blunders_puzzles.tagged_at),
              created_at=COALESCE(EXCLUDED.created_at, blunders_puzzles.created_at),
              raw=EXCLUDED.raw
          `,
            values
          );
        }

        // Ensure progress rows exist (pending by default)
        try {
          const pCols = ['org_id', 'student_id', 'puzzle_key', 'status', 'completed_at', 'attempts', 'updated_at'];
          const pVals = [];
          const pPh = [];
          let pj = 1;
          for (const pz of newlyAdded) {
            const key = String(pz?.key || '').trim();
            if (!key) continue;
            const status = String(pz?.status || 'pending') === 'completed' ? 'completed' : 'pending';
            const completedAt = status === 'completed' ? (() => {
              const t = Date.parse(String(pz?.completedAt || ''));
              return Number.isFinite(t) ? new Date(t).toISOString() : null;
            })() : null;
            const attempts = Array.isArray(pz?.attempts) ? pz.attempts : [];
            const row = [oid, sid, key, status, completedAt, JSON.stringify(attempts), new Date().toISOString()];
            pVals.push(...row);
            pPh.push(`(${row.map(() => `$${pj++}`).join(',')})`);
          }
          if (pPh.length) {
            await pool.query(
              `
              INSERT INTO blunders_progress (${pCols.join(',')})
              VALUES ${pPh.join(',')}
              ON CONFLICT (org_id, student_id, puzzle_key) DO NOTHING
            `,
              pVals
            );
          }
        } catch {}
      }
    } catch (e) {
      // Queue for retry so tags stay in sync even if DB has a transient error.
      try {
        const retryPuzzles = newlyAdded.slice(0, 500).map((pz) => (pz && typeof pz === 'object') ? pz : null).filter(Boolean);
        if (retryPuzzles.length) {
          await enqueueBlundersDbRetry('upsert_puzzles', { orgId: String(orgId || ''), studentId: String(studentId || ''), puzzles: retryPuzzles }, e);
        }
      } catch {}
    }

    return { ok: true, changed, added, removed: pr.removed, total: list.length };
  }

  return {
    puzzleSortKeyMs,
    threeMonthsAgoMs,
    puzzleDropPoints,
    isMissMatePuzzle,
    isInvalidSameBestMovePuzzle,
    blundersBucketKeyOfPuzzle,
    blundersRatingBucket,
    pickStudentRatingFromCache,
    pickChallengePuzzlesFromAllBlunders,
    pruneStudentBlundersInPlace,
    appendBlundersPuzzlesPreserveProgress
  };
}

module.exports = { createBlundersPuzzles };


