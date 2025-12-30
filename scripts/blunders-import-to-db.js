// One-off importer: JSON files -> Postgres (student blunders only; no master).
// Safe to run multiple times (UPSERT by key).
//
// Usage:
//   node scripts/blunders-import-to-db.js
//   node scripts/blunders-import-to-db.js --org <orgId>
//   node scripts/blunders-import-to-db.js --dry-run
//
// Env:
//   DATABASE_URL or DATABASE_PUBLIC_URL (or PGHOST/PGUSER/...)
//   DATA_DIR (optional; default: data)
//   BLUNDERS_PUZZLES_FILE / BLUNDERS_STATS_FILE (optional)

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { getPool } = require('../db/postgres');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function chunk(arr, size) {
  const out = [];
  const s = Math.max(1, Number(size || 0) || 200);
  for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
  return out;
}

function parseIsoToPgTs(iso) {
  const s = String(iso || '').trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function puzzleSortKeyMs(p) {
  const done = Date.parse(String(p?.completedAt || ''));
  if (Number.isFinite(done) && done > 0) return done;
  const end = Number(p?.endTime || 0);
  if (Number.isFinite(end) && end > 0) return end * 1000;
  const created = Date.parse(String(p?.createdAt || ''));
  return Number.isFinite(created) ? created : 0;
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const txt = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function resolveDataPath(p) {
  const raw = String(p || '').trim();
  if (!raw) return '';
  if (path.isAbsolute(raw)) return raw;
  return path.join(process.cwd(), raw);
}

function detectPaths() {
  const dataDir = String(process.env.DATA_DIR || 'data').trim() || 'data';
  const puzzlesFile = resolveDataPath(process.env.BLUNDERS_PUZZLES_FILE || path.join(dataDir, 'blunders-puzzles.json'));
  const statsFile = resolveDataPath(process.env.BLUNDERS_STATS_FILE || path.join(dataDir, 'blunders-stats.json'));
  return { puzzlesFile, statsFile };
}

async function upsertPuzzles(client, rows) {
  if (!rows.length) return 0;
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
    'created_at',
    'raw'
  ];

  const values = [];
  const placeholders = [];
  let p = 1;
  for (const r of rows) {
    const rowVals = cols.map((c) => (r[c] === undefined ? null : r[c]));
    values.push(...rowVals);
    placeholders.push(`(${rowVals.map(() => `$${p++}`).join(',')})`);
  }

  const sql = `
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
      created_at=COALESCE(EXCLUDED.created_at, blunders_puzzles.created_at),
      raw=EXCLUDED.raw
  `;
  await client.query(sql, values);
  return rows.length;
}

async function upsertProgress(client, rows) {
  if (!rows.length) return 0;
  const cols = ['org_id', 'student_id', 'puzzle_key', 'status', 'completed_at', 'attempts', 'updated_at'];
  const values = [];
  const placeholders = [];
  let p = 1;
  for (const r of rows) {
    const rowVals = cols.map((c) => (r[c] === undefined ? null : r[c]));
    values.push(...rowVals);
    placeholders.push(`(${rowVals.map(() => `$${p++}`).join(',')})`);
  }
  const sql = `
    INSERT INTO blunders_progress (${cols.join(',')})
    VALUES ${placeholders.join(',')}
    ON CONFLICT (org_id, student_id, puzzle_key) DO UPDATE SET
      status=EXCLUDED.status,
      completed_at=EXCLUDED.completed_at,
      attempts=EXCLUDED.attempts,
      updated_at=NOW()
  `;
  await client.query(sql, values);
  return rows.length;
}

async function upsertAnalyzedGames(client, rows) {
  if (!rows.length) return 0;
  const cols = ['org_id', 'student_id', 'game_key', 'url', 'uuid', 'end_time_sec', 'time_class', 'ply_count', 'opponent_rating', 'updated_at'];
  const values = [];
  const placeholders = [];
  let p = 1;
  for (const r of rows) {
    const rowVals = cols.map((c) => (r[c] === undefined ? null : r[c]));
    values.push(...rowVals);
    placeholders.push(`(${rowVals.map(() => `$${p++}`).join(',')})`);
  }
  const sql = `
    INSERT INTO blunders_analyzed_games (${cols.join(',')})
    VALUES ${placeholders.join(',')}
    ON CONFLICT (org_id, student_id, game_key) DO UPDATE SET
      url=EXCLUDED.url,
      uuid=EXCLUDED.uuid,
      end_time_sec=EXCLUDED.end_time_sec,
      time_class=EXCLUDED.time_class,
      ply_count=EXCLUDED.ply_count,
      opponent_rating=EXCLUDED.opponent_rating,
      updated_at=NOW()
  `;
  await client.query(sql, values);
  return rows.length;
}

async function main() {
  const pool = getPool();
  if (!pool) throw new Error('Postgres not configured (missing DATABASE_URL / DATABASE_PUBLIC_URL / PG* vars)');

  const onlyOrg = String(argValue('--org') || '').trim();
  const dryRun = hasFlag('--dry-run');
  const { puzzlesFile, statsFile } = detectPaths();

  const puzzlesJson = readJsonFile(puzzlesFile, {});
  const puzzlesAll = Array.isArray(puzzlesJson?.puzzles) ? puzzlesJson.puzzles : [];
  const puzzles = puzzlesAll
    .filter((p) => String(p?.scope || '') !== 'master')
    .filter((p) => !onlyOrg || String(p?.orgId || '') === onlyOrg);

  const statsJson = readJsonFile(statsFile, {});
  const analyzedRows = [];
  try {
    for (const [orgId, orgObj] of Object.entries(statsJson || {})) {
      if (!orgObj || typeof orgObj !== 'object') continue;
      if (onlyOrg && String(orgId) !== onlyOrg) continue;
      for (const [studentId, st] of Object.entries(orgObj || {})) {
        if (!st || typeof st !== 'object') continue;
        const analyzed = (st.analyzed && typeof st.analyzed === 'object') ? st.analyzed : {};
        for (const [gameKey, v] of Object.entries(analyzed)) {
          const gk = String(gameKey || '').trim();
          if (!gk) continue;
          analyzedRows.push({
            org_id: String(orgId),
            student_id: String(studentId),
            game_key: gk,
            url: v?.url ? String(v.url) : null,
            uuid: v?.uuid ? String(v.uuid) : null,
            end_time_sec: Number(v?.endTime || 0) || null,
            time_class: v?.timeClass ? String(v.timeClass) : null,
            ply_count: Number(v?.plyCount || 0) || null,
            opponent_rating: Number(v?.opponentRating || 0) || null,
            updated_at: new Date().toISOString()
          });
        }
      }
    }
  } catch {}

  const puzzleRows = [];
  const progressRows = [];

  for (const pz of puzzles) {
    const orgId = String(pz?.orgId || '').trim();
    const studentId = String(pz?.studentId || '').trim();
    const key = String(pz?.key || '').trim();
    if (!orgId || !studentId || !key) continue;

    const createdAt = parseIsoToPgTs(pz?.createdAt || '');
    puzzleRows.push({
      key,
      org_id: orgId,
      student_id: studentId,
      chesscom_username: pz?.chessComUsername ? String(pz.chessComUsername) : null,
      game_url: pz?.gameUrl ? String(pz.gameUrl) : null,
      time_class: pz?.timeClass ? String(pz.timeClass) : null,
      end_time_sec: Number(pz?.endTime || 0) || null,
      sort_at_ms: puzzleSortKeyMs(pz),
      student_color: pz?.studentColor ? String(pz.studentColor) : null,
      start_fen: pz?.startFEN ? String(pz.startFEN) : null,
      opponent_move_uci: pz?.opponentMoveUci ? String(pz.opponentMoveUci) : null,
      opponent_san: pz?.opponentSan ? String(pz.opponentSan) : null,
      blunder_move_uci: pz?.blunderMoveUci ? String(pz.blunderMoveUci) : null,
      blunder_san: pz?.blunderSan ? String(pz.blunderSan) : null,
      best_move_uci: pz?.bestMoveUci ? String(pz.bestMoveUci) : null,
      best_cp: Number.isFinite(Number(pz?.bestCp)) ? Number(pz.bestCp) : null,
      after_cp: Number.isFinite(Number(pz?.afterCp)) ? Number(pz.afterCp) : null,
      drop_cp: Number.isFinite(Number(pz?.dropCp)) ? Number(pz.dropCp) : null,
      drop_points: Number.isFinite(Number(pz?.dropPoints)) ? Number(pz.dropPoints) : (Number(pz?.dropCp || 0) / 100) || 0,
      created_at: createdAt,
      raw: pz
    });

    const status = String(pz?.status || 'pending') === 'completed' ? 'completed' : 'pending';
    const attempts = Array.isArray(pz?.attempts) ? pz.attempts : [];
    progressRows.push({
      org_id: orgId,
      student_id: studentId,
      puzzle_key: key,
      status,
      completed_at: status === 'completed' ? parseIsoToPgTs(pz?.completedAt || '') : null,
      attempts,
      updated_at: new Date().toISOString()
    });
  }

  console.log(`Import source: puzzles=${puzzleRows.length} progress=${progressRows.length} analyzedGames=${analyzedRows.length} (org=${onlyOrg || 'ALL'})`);
  if (dryRun) {
    console.log('Dry-run: no writes performed.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let insPz = 0;
    for (const part of chunk(puzzleRows, 200)) insPz += await upsertPuzzles(client, part);
    let insPr = 0;
    for (const part of chunk(progressRows, 200)) insPr += await upsertProgress(client, part);
    let insAg = 0;
    for (const part of chunk(analyzedRows, 200)) insAg += await upsertAnalyzedGames(client, part);
    await client.query('COMMIT');
    console.log(`Import done: puzzles=${insPz} progress=${insPr} analyzedGames=${insAg}`);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  });


