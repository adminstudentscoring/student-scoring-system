// Blunders Postgres DB helpers extracted from server.js.
// Focused on upsert helpers used by tagging + DB sync retry queue.

function createBlundersDb(deps: any): any {
  const nowIso = deps?.nowIso;
  const enqueueBlundersDbRetry = deps?.enqueueBlundersDbRetry;
  const puzzleSortKeyMs = deps?.puzzleSortKeyMs;
  const BLUNDERS_TAGGER_VERSION = deps?.BLUNDERS_TAGGER_VERSION;

  if (typeof nowIso !== 'function') throw new Error('createBlundersDb: missing deps.nowIso');
  if (typeof enqueueBlundersDbRetry !== 'function') throw new Error('createBlundersDb: missing deps.enqueueBlundersDbRetry');
  if (typeof puzzleSortKeyMs !== 'function') throw new Error('createBlundersDb: missing deps.puzzleSortKeyMs');

  async function dbUpsertPuzzleTags(pool, rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!pool || !list.length) return { ok: true, updated: 0 };
    const payload = list.map((x) => ({
      key: String(x?.key || ''),
      tags: Array.isArray(x?.tags) ? x.tags : [],
      tagger_version: String(x?.taggerVersion || BLUNDERS_TAGGER_VERSION),
      tagged_at: x?.taggedAt || nowIso()
    })).filter((x) => x.key);
    if (!payload.length) return { ok: true, updated: 0 };
    const sql = `
    WITH data AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb)
      AS t(key text, tags jsonb, tagger_version text, tagged_at timestamptz)
    )
    UPDATE blunders_puzzles p
    SET
      tags = COALESCE(data.tags, '[]'::jsonb),
      tagger_version = data.tagger_version,
      tagged_at = data.tagged_at
    FROM data
    WHERE p.key = data.key
  `;
    try {
      await pool.query(sql, [JSON.stringify(payload)]);
      return { ok: true, updated: payload.length };
    } catch (e) {
      // Best-effort: queue tag updates for retry if DB is temporarily unavailable.
      try { await enqueueBlundersDbRetry('upsert_tags', { rows: payload }, e); } catch {}
      throw e;
    }
  }

  async function dbUpsertPuzzlesFromObjects(pool, orgId, studentId, puzzles) {
    const oid = String(orgId || '').trim();
    const sid = String(studentId || '').trim();
    const list = Array.isArray(puzzles) ? puzzles : [];
    if (!pool || !oid || !sid || !list.length) return { ok: true, upserted: 0 };

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
    for (const pz of list.slice(0, 500)) {
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

    if (!placeholders.length) return { ok: true, upserted: 0 };
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
    return { ok: true, upserted: placeholders.length };
  }

  return { dbUpsertPuzzleTags, dbUpsertPuzzlesFromObjects };
}

module.exports = { createBlundersDb };


