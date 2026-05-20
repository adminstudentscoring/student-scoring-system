// Extracted from blundersTeacherRoutes.ts — uses `with (deps)`.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersTeacherAllBlundersRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
    app.get('/api/teachers/blunders/all-blunders', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });

        const duration = String(req.query.duration || 'all'); // week | month | halfYear | year | all
        const rating = String(req.query.rating || 'any'); // any | 100-400 | 401-700 | 701-1000 | 1001-1500 | 1501-2000 | 2001-2300 | 2201-2500 | 2501-2800 | 2801-3000 | 3001up
        const tag = String(req.query.tag || 'any').trim(); // any | <tag>
        const bucketKey = String(req.query.bucket || '').trim(); // '' | missMate | d1 | d2 | d3 | d4
        const pageSize = 50; // Fixed (UI requirement)
        const pageIn = Number(req.query.page || 1);
        const page = Number.isFinite(pageIn) ? Math.max(1, Math.floor(pageIn)) : 1;

        const users = await readUsers();
        const teacher = users.find(u => u.id === req.user.id);
        const assignedIds = (teacher && Array.isArray(teacher.assignedStudents) && teacher.assignedStudents.length) ? new Set(teacher.assignedStudents) : null;

        const data = await readData();
        const studentsAll = Array.isArray(data?.students) ? data.students.filter(s => String(s.organizationId || '') === orgId) : [];
        const students = assignedIds ? studentsAll.filter(s => assignedIds.has(s.id)) : studentsAll;
        const allowedStudentIds = new Set(students.map(s => String(s.id || '')));
        const studentMap = new Map(students.map(s => [String(s.id || ''), { name: String(s.name || 'Student'), studentId: String(s.chessComId || '') }]));

        // Ratings cache (best-effort)
        const ratingMap = new Map();
        try {
          const { orgs } = await readChessComRatings();
          const bucket = (orgs && orgs[orgId] && typeof orgs[orgId] === 'object') ? orgs[orgId] : {};
          for (const sid of allowedStudentIds) {
            const ent = bucket[sid] && typeof bucket[sid] === 'object' ? bucket[sid] : null;
            if (ent) {
              ratingMap.set(String(sid), {
                rating: (ent.rating === null || ent.rating === undefined) ? null : Number(ent.rating),
                source: ent.source || null,
                updatedAt: ent.updatedAt || null
              });
            }
          }
        } catch {}

        const startMs = (() => {
          const now = Date.now();
          const day = 24 * 60 * 60 * 1000;
          if (duration === 'week') return now - 7 * day;
          if (duration === 'month') return now - 30 * day;
          if (duration === 'halfYear') return now - 182 * day;
          if (duration === 'year') return now - 365 * day;
          return 0;
        })();

        const inBucket = (r) => {
          const v = (r === null || r === undefined || Number.isNaN(Number(r))) ? null : Number(r);
          if (rating === 'any') return true;
          if (v === null) return false;
          if (rating === '100-400') return v >= 100 && v <= 400;
          if (rating === '401-700') return v >= 401 && v <= 700;
          if (rating === '701-1000') return v >= 701 && v <= 1000;
          if (rating === '1001-1500') return v >= 1001 && v <= 1500;
          if (rating === '1501-2000') return v >= 1501 && v <= 2000;
          if (rating === '2001-2300') return v >= 2001 && v <= 2300;
          if (rating === '2201-2500') return v >= 2201 && v <= 2500;
          if (rating === '2501-2800') return v >= 2501 && v <= 2800;
          if (rating === '2801-3000') return v >= 2801 && v <= 3000;
          if (rating === '3001up') return v >= 3001;
          return true;
        };

        // Feature flag: use Postgres-backed queries (requires importing data to DB first).
        if (String(process.env.BLUNDERS_USE_DB || '') === '1') {
          const pool = appDb.getPool();
          if (!pool) return res.status(500).json({ error: 'Postgres not configured for BLUNDERS_USE_DB' });

          const allowedIdsArr = Array.from(allowedStudentIds);
          const filteredIds = (rating === 'any')
            ? allowedIdsArr
            : allowedIdsArr.filter((sid) => inBucket(ratingMap.get(String(sid))?.rating));
          if (!filteredIds.length) {
            const emptyCounts = { missMate: 0, d1: 0, d2: 0, d3: 0, d4: 0, total: 0 };
            return res.json({ ok: true, orgId, duration, rating, tag, pageSize, counts: emptyCounts, tagCounts: {} });
          }

          const startMs = (() => {
            const now = Date.now();
            const day = 24 * 60 * 60 * 1000;
            if (duration === 'week') return now - 7 * day;
            if (duration === 'month') return now - 30 * day;
            if (duration === 'halfYear') return now - 182 * day;
            if (duration === 'year') return now - 365 * day;
            return 0;
          })();
          const cutoffTs = startMs ? new Date(startMs).toISOString() : null;

          const client = await pool.connect();
          try {
            // Backward-compatible: tags columns may not exist yet if migrations haven't run.
            // In that case, fall back to reading tags from raw JSON (if present).
            let hasTagsCols = false;
            try {
              const chk = await client.query(
                `SELECT 1
                 FROM information_schema.columns
                 WHERE table_schema='public'
                   AND table_name='blunders_puzzles'
                   AND column_name='tags'
                 LIMIT 1`,
                []
              );
              hasTagsCols = !!chk?.rows?.length;
            } catch { hasTagsCols = false; }

            const tagsSrcExpr = hasTagsCols ? 'p.tags' : `COALESCE(p.raw->'tags', '[]'::jsonb)`;
            const tagsArrExpr = `CASE WHEN jsonb_typeof(${tagsSrcExpr})='array' THEN ${tagsSrcExpr} ELSE '[]'::jsonb END`;
            const taggerVersionExpr = hasTagsCols ? 'p.tagger_version' : `NULLIF(p.raw->>'taggerVersion','')`;
            const taggedAtExpr = hasTagsCols ? 'p.tagged_at' : `NULLIF(p.raw->>'taggedAt','')::timestamptz`;

            const baseCte = `
              WITH base0 AS (
                SELECT
                  p.key,
                  p.org_id,
                  p.student_id,
                  p.chesscom_username,
                  p.game_url,
                  p.time_class,
                  p.end_time_sec,
                  p.student_color,
                  p.start_fen,
                  p.opponent_move_uci,
                  p.opponent_san,
                  p.blunder_move_uci,
                  p.blunder_san,
                  p.best_move_uci,
                  p.best_cp,
                  p.after_cp,
                  p.drop_cp,
                  p.drop_points,
                  ${tagsArrExpr} AS tags,
                  ${taggerVersionExpr} AS tagger_version,
                  ${taggedAtExpr} AS tagged_at,
                  p.created_at,
                  pr.status,
                  pr.completed_at,
                  COALESCE(pr.completed_at, to_timestamp(p.end_time_sec), p.created_at, to_timestamp(p.sort_at_ms/1000.0)) AS sort_ts,
                  CASE
                    WHEN (p.best_cp IS NOT NULL AND ABS(p.best_cp) >= 99999) THEN 'missMate'
                    WHEN (p.drop_points IS NULL) THEN 'd1'
                    WHEN (p.drop_points >= 1.0 AND p.drop_points <= 1.5) THEN 'd1'
                    WHEN (p.drop_points > 1.5 AND p.drop_points <= 2.0) THEN 'd2'
                    WHEN (p.drop_points > 2.0 AND p.drop_points <= 3.0) THEN 'd3'
                    WHEN (p.drop_points > 3.0) THEN 'd4'
                    ELSE 'd1'
                  END AS bucket
                FROM blunders_puzzles p
                LEFT JOIN blunders_progress pr
                  ON pr.org_id = p.org_id AND pr.student_id = p.student_id AND pr.puzzle_key = p.key
                WHERE p.org_id = $1
                  AND p.student_id = ANY($2)
                  AND ($3::timestamptz IS NULL OR COALESCE(pr.completed_at, to_timestamp(p.end_time_sec), p.created_at, to_timestamp(p.sort_at_ms/1000.0)) >= $3::timestamptz)
                  AND NOT (
                    p.best_cp IS NOT NULL AND ABS(p.best_cp) >= 99999
                    AND p.best_move_uci IS NOT NULL AND p.blunder_move_uci IS NOT NULL
                    AND LOWER(p.best_move_uci) = LOWER(p.blunder_move_uci)
                  )
              )
              , base AS (
                SELECT * FROM base0
                WHERE ($4::text = 'any' OR (COALESCE(tags, '[]'::jsonb) ? $4::text))
              )
            `;

            const tagCountsRes = await client.query(
              `${baseCte}
               SELECT
                 t.tag AS tag,
                 COUNT(*)::int AS count
               FROM base0
               CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(base0.tags, '[]'::jsonb)) AS t(tag)
               GROUP BY t.tag
               ORDER BY count DESC, tag ASC
               LIMIT 200
              `,
              [orgId, filteredIds, cutoffTs, 'any']
            );
            const tagCounts = {};
            for (const r of (tagCountsRes.rows || [])) {
              const k = String(r.tag || '').trim();
              if (!k) continue;
              tagCounts[k] = Number(r.count || 0) || 0;
            }

            const countsRes = await client.query(
              `${baseCte}
               SELECT
                 COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE bucket='missMate')::int AS "missMate",
                 COUNT(*) FILTER (WHERE bucket='d1')::int AS "d1",
                 COUNT(*) FILTER (WHERE bucket='d2')::int AS "d2",
                 COUNT(*) FILTER (WHERE bucket='d3')::int AS "d3",
                 COUNT(*) FILTER (WHERE bucket='d4')::int AS "d4"
               FROM base
              `,
              [orgId, filteredIds, cutoffTs, tag]
            );
            const c0 = countsRes.rows[0] || {};
            const counts = {
              missMate: Number(c0.missMate || 0) || 0,
              d1: Number(c0.d1 || 0) || 0,
              d2: Number(c0.d2 || 0) || 0,
              d3: Number(c0.d3 || 0) || 0,
              d4: Number(c0.d4 || 0) || 0,
              total: Number(c0.total || 0) || 0
            };

            if (!bucketKey) {
              return res.json({ ok: true, orgId, duration, rating, tag, pageSize, counts, tagCounts });
            }
            if (!['missMate', 'd1', 'd2', 'd3', 'd4'].includes(bucketKey)) {
              return res.status(400).json({ error: 'Invalid bucket (use: missMate, d1, d2, d3, d4)' });
            }

            const totalBucket = Number(counts[bucketKey] || 0) || 0;
            const totalPages = Math.max(1, Math.ceil(totalBucket / pageSize));
            const safePage = Math.max(1, Math.min(totalPages, page));
            const offset = (safePage - 1) * pageSize;

            const pageRes = await client.query(
              `${baseCte}
               SELECT
                 key,
                 student_id,
                 chesscom_username,
                 game_url,
                 time_class,
                 end_time_sec,
                 student_color,
                 start_fen,
                 opponent_move_uci,
                 opponent_san,
                 blunder_move_uci,
                 blunder_san,
                 best_move_uci,
                 best_cp,
                 after_cp,
                 drop_cp,
                 drop_points,
                 tags,
                 tagger_version,
                 tagged_at,
                 created_at,
                 status,
                 completed_at,
                 EXTRACT(EPOCH FROM sort_ts) * 1000 AS "sortAtMs"
               FROM base
               WHERE bucket = $5
               ORDER BY sort_ts DESC
               LIMIT $6 OFFSET $7
              `,
              [orgId, filteredIds, cutoffTs, tag, bucketKey, pageSize, offset]
            );

            const entries = (pageRes.rows || []).map((r) => {
              const sid = String(r.student_id || '');
              const stu = studentMap.get(sid) || { name: 'Student', studentId: '' };
              const rt = ratingMap.get(sid) || { rating: null, source: null, updatedAt: null };
              const completedAt = r.completed_at ? new Date(r.completed_at).toISOString() : null;
              const endTime = Number(r.end_time_sec || 0) || 0;
              const dropPoints = Number(r.drop_points ?? 0) || 0;
              const tags = Array.isArray(r.tags) ? r.tags.map(String).filter(Boolean) : [];
              return {
                // Keep client-compatible shape (subset used by UI)
                key: String(r.key || ''),
                orgId,
                studentId: sid,
                chessComUsername: r.chesscom_username ? String(r.chesscom_username) : null,
                gameUrl: r.game_url ? String(r.game_url) : '',
                timeClass: r.time_class ? String(r.time_class) : '',
                endTime,
                studentColor: r.student_color ? String(r.student_color) : '',
                startFEN: r.start_fen ? String(r.start_fen) : '',
                opponentMoveUci: r.opponent_move_uci ? String(r.opponent_move_uci) : '',
                opponentSan: r.opponent_san ? String(r.opponent_san) : '',
                blunderMoveUci: r.blunder_move_uci ? String(r.blunder_move_uci) : '',
                blunderSan: r.blunder_san ? String(r.blunder_san) : '',
                bestMoveUci: r.best_move_uci ? String(r.best_move_uci) : '',
                bestCp: (r.best_cp === null || r.best_cp === undefined) ? null : Number(r.best_cp),
                afterCp: (r.after_cp === null || r.after_cp === undefined) ? null : Number(r.after_cp),
                dropCp: (r.drop_cp === null || r.drop_cp === undefined) ? null : Number(r.drop_cp),
                dropPoints,
                tags,
                taggerVersion: r.tagger_version ? String(r.tagger_version) : null,
                taggedAt: r.tagged_at ? new Date(r.tagged_at).toISOString() : null,
                status: r.status ? String(r.status) : '',
                completedAt: completedAt || null,
                sortAtMs: Number(r.sortAtMs || 0) || 0,
                // Teacher UI extras
                studentName: stu.name,
                studentStudentId: stu.studentId,
                chessComRating: (rt.rating === null || rt.rating === undefined) ? null : Number(rt.rating),
                chessComRatingSource: rt.source,
                chessComRatingUpdatedAt: rt.updatedAt
              };
            });

            return res.json({
              ok: true,
              orgId,
              duration,
              rating,
              tag,
              pageSize,
              bucket: bucketKey,
              page: safePage,
              totalPages,
              totalBucket,
              counts,
              entries,
              tagCounts
            });
          } finally {
            try { client.release(); } catch {}
          }
        }

        const puzzles = await readBlundersPuzzles();

        const mineStudents = puzzles
          .filter(p => String(p.orgId || '') === orgId && String(p.scope || '') !== 'master')
          .filter(p => allowedStudentIds.has(String(p.studentId || '')))
          .filter(p => !isInvalidSameBestMovePuzzle(p));

        const mineMasters = puzzles
          .filter(p => String(p.orgId || '') === orgId && String(p.scope || '') === 'master');

        const entriesStudents = mineStudents
          .map(p => {
            const sid = String(p.studentId || '');
            const stu = studentMap.get(sid) || { name: 'Student', studentId: '' };
            const rt = ratingMap.get(sid) || { rating: null, source: null, updatedAt: null };
            const completedAt = String(p.completedAt || '');
            const sortAtMs = puzzleSortKeyMs(p);
            const dropPoints = (typeof p.dropPoints === 'number')
              ? Number(p.dropPoints)
              : (Number(p.dropCp || 0) / 100);
            return {
              ...p,
              studentName: stu.name,
              studentStudentId: stu.studentId,
              chessComRating: (rt.rating === null || rt.rating === undefined) ? null : Number(rt.rating),
              chessComRatingSource: rt.source,
              chessComRatingUpdatedAt: rt.updatedAt,
              completedAt: completedAt || null,
              sortAtMs: Number.isFinite(sortAtMs) ? sortAtMs : 0,
              dropPoints: Number.isFinite(dropPoints) ? dropPoints : 0
            };
          })
          .filter(p => !startMs || (p.sortAtMs && p.sortAtMs >= startMs))
          .filter(p => inBucket(p.chessComRating));

        // Master puzzles: use stored master rating (if available) so they can be bucketed/filtered.
        const entriesMasters = mineMasters
          .map(p => {
            const label = String(p?.masterName || p?.masterId || 'Master');
            const completedAt = String(p.completedAt || '');
            const sortAtMs = puzzleSortKeyMs(p);
            const dropPoints = (typeof p.dropPoints === 'number')
              ? Number(p.dropPoints)
              : (Number(p.dropCp || 0) / 100);
            const mr = (p?.masterChessComRating === null || p?.masterChessComRating === undefined) ? null : Number(p.masterChessComRating);
            const ms = p?.masterChessComRatingSource ? String(p.masterChessComRatingSource) : null;
            const mu = p?.masterChessComRatingUpdatedAt ? String(p.masterChessComRatingUpdatedAt) : null;
            return {
              ...p,
              studentName: `Master: ${label}`,
              studentStudentId: '',
              chessComRating: Number.isFinite(mr) ? mr : null,
              chessComRatingSource: ms,
              chessComRatingUpdatedAt: mu,
              completedAt: completedAt || null,
              sortAtMs: Number.isFinite(sortAtMs) ? sortAtMs : 0,
              dropPoints: Number.isFinite(dropPoints) ? dropPoints : 0
            };
          })
          .filter(p => !startMs || (p.sortAtMs && p.sortAtMs >= startMs))
          .filter(p => inBucket(p.chessComRating));

        const entriesAll = entriesStudents
          .concat(entriesMasters)
          .sort((a, b) => (b.sortAtMs || 0) - (a.sortAtMs || 0));

        // Tag counts for filter UI (computed before tag filter)
        const tagCounts = {};
        for (const p of entriesAll) {
          const tags = Array.isArray(p?.tags) ? p.tags.map(String).filter(Boolean) : [];
          for (const t of tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
        }

        // Apply tag filter (server-side, correct counts/pagination)
        const entries = (tag && tag !== 'any')
          ? entriesAll.filter((p) => (Array.isArray(p?.tags) ? p.tags.map(String) : []).includes(tag))
          : entriesAll;

        const isMissMate = (p) => {
          const bestCp = Number(p?.bestCp ?? 0);
          return Number.isFinite(bestCp) && Math.abs(bestCp) >= 99999;
        };
        const bucketOf = (p) => {
          if (isMissMate(p)) return 'missMate';
          const d = Number(p?.dropPoints ?? 0) || 0;
          if (d >= 1.0 && d <= 1.5) return 'd1';
          if (d > 1.5 && d <= 2.0) return 'd2';
          if (d > 2.0 && d <= 3.0) return 'd3';
          if (d > 3.0) return 'd4';
          return 'd1';
        };

        const counts = { missMate: 0, d1: 0, d2: 0, d3: 0, d4: 0, total: entries.length };
        for (const p of entries) {
          const bk = bucketOf(p);
          if (bk && Object.prototype.hasOwnProperty.call(counts, bk)) counts[bk]++;
        }

        // Summary-only (default): return counts without entries to keep payload small.
        if (!bucketKey) {
          return res.json({ ok: true, orgId, duration, rating, tag, pageSize, counts, tagCounts });
        }
        if (!['missMate', 'd1', 'd2', 'd3', 'd4'].includes(bucketKey)) {
          return res.status(400).json({ error: 'Invalid bucket (use: missMate, d1, d2, d3, d4)' });
        }
        const bucketEntries = entries.filter((p) => bucketOf(p) === bucketKey);
        const totalBucket = bucketEntries.length;
        const totalPages = Math.max(1, Math.ceil(totalBucket / pageSize));
        const safePage = Math.max(1, Math.min(totalPages, page));
        const start = (safePage - 1) * pageSize;
        const pageEntries = bucketEntries.slice(start, start + pageSize);

        return res.json({
          ok: true,
          orgId,
          duration,
          rating,
          tag,
          pageSize,
          bucket: bucketKey,
          page: safePage,
          totalPages,
          totalBucket,
          counts,
          entries: pageEntries,
          tagCounts
        });
      } catch (e) {
        console.error('GET /api/teachers/blunders/all-blunders error:', e);
        return res.status(500).json({ error: 'Failed to load all blunders' });
      }
    });

    // Teacher: storage stats for Blunders (help estimate scale/performance).
  }
}

module.exports = { registerBlundersTeacherAllBlundersRoutes };
export {};
