// Extracted from server.js to keep the main entry file smaller.
// NOTE: This module intentionally uses `with (deps)` so we can move code without rewriting thousands of identifiers.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersTeacherRoutes(app, deps) {
  // eslint-disable-next-line no-with
  with (deps) {
    // Teacher: trigger Blunders sync (today, rapid/blitz, max 10 games per student)
    app.post('/api/teachers/blunders/sync-today', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const data = await readData();
        const students = Array.isArray(data?.students) ? data.students.filter(s => String(s.organizationId || '') === orgId) : [];
        // Fire-and-forget per student (throttled inside)
        for (const s of students) {
          syncBlundersForStudent(s).catch(() => {});
        }
        return res.json({ ok: true, message: 'Sync started', students: students.length });
      } catch (e) {
        console.error('POST /api/teachers/blunders/sync-today error:', e);
        return res.status(500).json({ error: 'Failed to start sync' });
      }
    });

    // Teacher: Blunders settings & sync controls (per-student config + masters)
    app.get('/api/teachers/blunders/settings', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const org = await getOrgBlundersSettings(orgId);
        return res.json({ ok: true, orgId, settings: org, defaults: BLUNDERS_DEFAULTS });
      } catch (e) {
        console.error('GET /api/teachers/blunders/settings error:', e);
        return res.status(500).json({ error: 'Failed to load blunders settings' });
      }
    });

    app.put('/api/teachers/blunders/settings', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const incoming = req.body && typeof req.body === 'object' ? req.body : {};
        const masters = Array.isArray(incoming.masters) ? incoming.masters : null;
        const student = (incoming.student && typeof incoming.student === 'object') ? incoming.student : null;
        const masterCfg = (incoming.master && typeof incoming.master === 'object') ? incoming.master : null;

        const orgs = await readBlundersSettings();
        if (!orgs[orgId] || typeof orgs[orgId] !== 'object') orgs[orgId] = {};
        const org = orgs[orgId];

        if (masters) {
          const clean = masters.map(sanitizeMasterEntry).filter(Boolean);
          org.masters = clean.length ? clean : defaultMastersPreset();
        }
        if (student) {
          const cleanStudent = {};
          for (const [sid, cfg] of Object.entries(student)) {
            const id = String(sid || '').trim();
            if (!id) continue;
            const maxGamesPerDay = Math.max(1, Math.min(50, Number(cfg?.maxGamesPerDay ?? BLUNDERS_DEFAULTS.maxGamesPerDay) || BLUNDERS_DEFAULTS.maxGamesPerDay));
            const thresholdPoints = Math.max(0.1, Math.min(10, Number(cfg?.thresholdPoints ?? BLUNDERS_DEFAULTS.thresholdPoints) || BLUNDERS_DEFAULTS.thresholdPoints));
            cleanStudent[id] = { maxGamesPerDay, thresholdPoints, updatedAt: new Date().toISOString() };
          }
          org.student = cleanStudent;
        }
        if (masterCfg) {
          const maxGamesPerDay = Math.max(1, Math.min(50, Number(masterCfg?.maxGamesPerDay ?? BLUNDERS_DEFAULTS.masterMaxGamesPerDay) || BLUNDERS_DEFAULTS.masterMaxGamesPerDay));
          const thresholdPoints = Math.max(0.1, Math.min(10, Number(masterCfg?.thresholdPoints ?? BLUNDERS_DEFAULTS.masterThresholdPoints) || BLUNDERS_DEFAULTS.masterThresholdPoints));
          org.master = { maxGamesPerDay, thresholdPoints, updatedAt: new Date().toISOString() };
        }

        orgs[orgId] = org;
        const ok = await writeBlundersSettings(orgs);
        if (!ok) return res.status(500).json({ error: 'Failed to save blunders settings' });
        return res.json({ ok: true, orgId, settings: await getOrgBlundersSettings(orgId) });
      } catch (e) {
        console.error('PUT /api/teachers/blunders/settings error:', e);
        return res.status(500).json({ error: 'Failed to save blunders settings' });
      }
    });

    app.get('/api/teachers/blunders/students-summary', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const data = await readData();
        const users = await readUsers();
        const teacher = users.find(u => u.id === req.user.id);
        const assignedIds = (teacher && Array.isArray(teacher.assignedStudents) && teacher.assignedStudents.length) ? new Set(teacher.assignedStudents) : null;
        const studentsAll = Array.isArray(data?.students) ? data.students.filter(s => String(s.organizationId || '') === orgId) : [];
        const students = assignedIds ? studentsAll.filter(s => assignedIds.has(s.id)) : studentsAll;

        const puzzles = await readBlundersPuzzles();
        const orgPuzzles = puzzles.filter(p => String(p.orgId || '') === orgId && String(p.scope || '') !== 'master');
        const orgsStats = await readBlundersStats();
        const statsOrg = orgsStats?.[orgId] || {};
        const settings = await getOrgBlundersSettings(orgId);
        const chessSettings = await readChessComSettings();
        const chessMap = (chessSettings && chessSettings[orgId] && typeof chessSettings[orgId] === 'object') ? chessSettings[orgId] : {};

        const out = students.map((s) => {
          const sid = String(s.id || '');
          const mine = orgPuzzles.filter(p => String(p.studentId || '') === sid);
          const pending = mine.filter(p => String(p.status || 'pending') === 'pending').length;
          const completed = mine.filter(p => String(p.status || '') === 'completed').length;
          const analyzedGamesTotal = Number(statsOrg?.[sid]?.analyzedCount || 0) || 0;
          const cfg = (settings.student && settings.student[sid]) ? settings.student[sid] : {};
          const chessId = String(chessMap?.[sid]?.chessId || '').trim();
          return {
            id: sid,
            name: String(s.name || ''),
            studentId: String(s.studentId || ''),
            chessComUsername: chessId || null,
            chessComRating: null,
            chessComRatingSource: null,
            chessComRatingUpdatedAt: null,
            counts: { pending, completed, total: pending + completed },
            analyzedGamesTotal,
            config: {
              maxGamesPerDay: Number(cfg.maxGamesPerDay || BLUNDERS_DEFAULTS.maxGamesPerDay),
              thresholdPoints: Number(cfg.thresholdPoints || BLUNDERS_DEFAULTS.thresholdPoints)
            }
          };
        });

        // Attach cached ratings (daily refresh)
        try {
          const { orgs, meta } = await readChessComRatings();
          const bucket = (orgs && orgs[orgId] && typeof orgs[orgId] === 'object') ? orgs[orgId] : {};
          for (const s of out) {
            const sid = String(s.id || '');
            const ent = bucket[sid] && typeof bucket[sid] === 'object' ? bucket[sid] : null;
            if (ent && String(ent.chessId || '') === String(s.chessComUsername || '')) {
              s.chessComRating = (ent.rating === null || ent.rating === undefined) ? null : Number(ent.rating);
              s.chessComRatingSource = ent.source || null;
              s.chessComRatingUpdatedAt = ent.updatedAt || null;
            }
          }
          const schedule = {
            time: formatHkTime(CHESSCOM_RATINGS_REFRESH_HK_HOUR, CHESSCOM_RATINGS_REFRESH_HK_MIN),
            lastRunAt: meta?.lastRunAt || null,
            lastRunHkDay: meta?.lastRunHkDay || null,
            nextRunAt: computeNextRatingsRunIso()
          };
          const blSchedule = {
            time: formatHkTime(BLUNDERS_DAILY_SYNC_HK_HOUR, BLUNDERS_DAILY_SYNC_HK_MIN),
            lastRunAt: blundersDailySyncMeta.lastRunAt,
            lastRunHkDay: blundersDailySyncMeta.lastRunHkDay,
            nextRunAt: computeNextBlundersDailyRunIso(),
            lastRunOk: blundersDailySyncMeta.lastRunOk,
            lastRunErr: blundersDailySyncMeta.lastRunErr
          };
          return res.json({ ok: true, orgId, students: out, ratingsSchedule: schedule, blundersSchedule: blSchedule });
        } catch {
          const schedule = { time: formatHkTime(CHESSCOM_RATINGS_REFRESH_HK_HOUR, CHESSCOM_RATINGS_REFRESH_HK_MIN), lastRunAt: null, lastRunHkDay: null, nextRunAt: computeNextRatingsRunIso() };
          const blSchedule = {
            time: formatHkTime(BLUNDERS_DAILY_SYNC_HK_HOUR, BLUNDERS_DAILY_SYNC_HK_MIN),
            lastRunAt: blundersDailySyncMeta.lastRunAt,
            lastRunHkDay: blundersDailySyncMeta.lastRunHkDay,
            nextRunAt: computeNextBlundersDailyRunIso(),
            lastRunOk: blundersDailySyncMeta.lastRunOk,
            lastRunErr: blundersDailySyncMeta.lastRunErr
          };
          return res.json({ ok: true, orgId, students: out, ratingsSchedule: schedule, blundersSchedule: blSchedule });
        }
      } catch (e) {
        console.error('GET /api/teachers/blunders/students-summary error:', e);
        return res.status(500).json({ error: 'Failed to load students summary' });
      }
    });

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
        const studentMap = new Map(students.map(s => [String(s.id || ''), { name: String(s.name || 'Student'), studentId: String(s.studentId || '') }]));

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
    app.get('/api/teachers/blunders/storage-stats', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });

        const safeStat = async (filePath) => {
          try {
            const st = await fs.stat(filePath);
            return { ok: true, path: filePath, sizeBytes: Number(st.size || 0) || 0, mtime: st.mtime ? st.mtime.toISOString() : null };
          } catch (e) {
            return { ok: false, path: filePath, sizeBytes: 0, mtime: null, error: String(e?.message || e) };
          }
        };

        const [pzSt, stSt, setSt, jobsSt] = await Promise.all([
          safeStat(BLUNDERS_PUZZLES_FILE),
          safeStat(BLUNDERS_STATS_FILE),
          safeStat(BLUNDERS_SETTINGS_FILE),
          safeStat(BLUNDERS_TEACHER_JOBS_FILE)
        ]);

        const puzzlesAll = await readBlundersPuzzles();
        const puzzles = puzzlesAll.filter(p => String(p?.orgId || '') === orgId && String(p?.scope || '') !== 'master');
        const total = puzzles.length;

        // Buckets (same definition as Teacher All blunders)
        const isMissMate = (p) => {
          const bestCp = Number(p?.bestCp ?? 0);
          return Number.isFinite(bestCp) && Math.abs(bestCp) >= 99999;
        };
        const dropOf = (p) => Number(p?.dropPoints ?? (Number(p?.dropCp || 0) / 100)) || 0;
        const counts = { missMate: 0, d1: 0, d2: 0, d3: 0, d4: 0, total };
        const perStudent = new Map();
        for (const p of puzzles) {
          const sid = String(p?.studentId || '');
          if (sid) perStudent.set(sid, (perStudent.get(sid) || 0) + 1);
          if (isMissMate(p)) { counts.missMate++; continue; }
          const d = dropOf(p);
          if (d >= 1.0 && d <= 1.5) counts.d1++;
          else if (d > 1.5 && d <= 2.0) counts.d2++;
          else if (d > 2.0 && d <= 3.0) counts.d3++;
          else if (d > 3.0) counts.d4++;
          else counts.d1++;
        }
        const topStudents = Array.from(perStudent.entries())
          .sort((a, b) => (b[1] - a[1]))
          .slice(0, 10)
          .map(([studentId, n]) => ({ studentId, puzzles: n }));

        // Stats map size (analyzed games keys count) for this org (best-effort)
        let analyzedKeys = 0;
        try {
          const orgs = await readBlundersStats();
          const org = orgs?.[orgId] || {};
          for (const st of Object.values(org)) {
            if (!st || typeof st !== 'object') continue;
            const analyzed = st.analyzed && typeof st.analyzed === 'object' ? st.analyzed : {};
            analyzedKeys += Object.keys(analyzed).length;
          }
        } catch {}

        return res.json({
          ok: true,
          orgId,
          files: {
            puzzles: pzSt,
            stats: stSt,
            settings: setSt,
            teacherJobs: jobsSt
          },
          counts,
          analyzedKeys,
          topStudents,
          now: new Date().toISOString()
        });
      } catch (e) {
        console.error('GET /api/teachers/blunders/storage-stats error:', e);
        return res.status(500).json({ error: 'Failed to load storage stats' });
      }
    });

    app.post('/api/teachers/blunders/sync-student', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const studentId = String(body.studentId || '').trim();
        const hkDayKey = normalizeHkDayKey(body.hkDayKey) || todayHkKey();
        const mode = String(body.mode || '').trim().toLowerCase(); // '' | 'history'
        const historyGames = Number(body.historyGames || 0) || 0;
        const force = body.force ? '1' : '0';
        const maxGamesPerDay = body.maxGamesPerDay;
        const thresholdPoints = body.thresholdPoints;
        if (!studentId) return res.status(400).json({ error: 'studentId is required' });
        const data = await readData();
        const student = (Array.isArray(data?.students) ? data.students : []).find(s => String(s.id || '') === studentId && String(s.organizationId || '') === orgId);
        if (!student) return res.status(404).json({ error: 'Student not found in your organization' });
        // For history mode, enqueue a background job (avoid long HTTP requests / timeouts).
        if (mode === 'history' && historyGames) {
          const jobId = `blj_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          const jobs = await readBlundersTeacherJobs();
          jobs[jobId] = {
            id: jobId,
            type: 'blunders_history_scan',
            orgId,
            teacherId: String(req.user.id || ''),
            status: 'queued', // queued | running | done | error | cancelled
            createdAt: nowIso(),
            updatedAt: nowIso(),
            startedAt: null,
            finishedAt: null,
            error: null,
            params: {
              studentIds: [studentId],
              historyGames: Math.max(1, Math.min(500, Number(historyGames || 0) || 200)),
              force: force === '1',
              thresholdPoints
            },
            progress: { total: 1, done: 0, message: 'Queued.', currentStudentId: studentId, currentStudentName: String(student.name || 'Student') }
          };
          await writeBlundersTeacherJobs(jobs);
          blundersTeacherJobQueue.push(jobId);
          blundersTeacherRunNextJob().catch(() => {});
          return res.json({ ok: true, queued: true, jobId });
        }

        const result = await syncBlundersForStudent(student, { hkDayKey, force, maxGamesPerDay, thresholdPoints, mode, historyGames });
        return res.json({ ok: true, result });
      } catch (e) {
        console.error('POST /api/teachers/blunders/sync-student error:', e);
        return res.status(500).json({ error: 'Failed to sync student' });
      }
    });

    // Teacher Jobs: create history scan job for multiple students
    app.post('/api/teachers/blunders/jobs/history-scan', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const idsIn = Array.isArray(body.studentIds) ? body.studentIds : [];
        const ids = Array.from(new Set(idsIn.map(x => String(x || '').trim()).filter(Boolean)));
        const historyGames = Math.max(1, Math.min(500, Number(body.historyGames || 0) || 200));
        const force = !!body.force;

        if (!ids.length) return res.status(400).json({ error: 'Missing studentIds' });

        // Respect assignedStudents restriction (if present).
        const users = await readUsers();
        const teacher = users.find(u => u.id === req.user.id);
        const assignedIds = (teacher && Array.isArray(teacher.assignedStudents) && teacher.assignedStudents.length) ? new Set(teacher.assignedStudents) : null;
        const allowedIds = assignedIds ? ids.filter(id => assignedIds.has(id)) : ids;
        if (!allowedIds.length) return res.status(403).json({ error: 'No allowed students selected' });

        const jobId = `blj_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const jobs = await readBlundersTeacherJobs();
        jobs[jobId] = {
          id: jobId,
          type: 'blunders_history_scan',
          orgId,
          teacherId: String(req.user.id || ''),
          status: 'queued',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          startedAt: null,
          finishedAt: null,
          error: null,
          params: { studentIds: allowedIds, historyGames, force },
          progress: { total: allowedIds.length, done: 0, message: 'Queued.', currentStudentId: null, currentStudentName: null }
        };
        const okWrite = await writeBlundersTeacherJobs(jobs);
        if (!okWrite) return res.status(500).json({ error: 'Failed to persist job. Please retry.' });
        blundersTeacherJobQueue.push(jobId);
        blundersTeacherRunNextJob().catch(() => {});
        return res.json({ ok: true, jobId, total: allowedIds.length });
      } catch (e) {
        console.error('POST /api/teachers/blunders/jobs/history-scan error:', e);
        return res.status(500).json({ error: 'Failed to create job' });
      }
    });

    // Teacher: enqueue Master History scan as a background job (avoid long-running request timeouts).
    app.post('/api/teachers/blunders/jobs/master-history-scan', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const idsIn = Array.isArray(body.masterIds) ? body.masterIds : [];
        const ids = Array.from(new Set(idsIn.map(x => String(x || '').trim()).filter(Boolean)));
        const historyGames = Math.max(1, Math.min(500, Number(body.historyGames || 0) || 200));
        const force = body.force ? '1' : '0';
        if (!ids.length) return res.status(400).json({ error: 'Missing masterIds' });

        const org = await getOrgBlundersSettings(orgId);
        const mastersAll = Array.isArray(org?.masters) ? org.masters : [];
        const masterSet = new Set(mastersAll.map(m => String(m?.id || '')).filter(Boolean));
        const allowed = ids.filter(id => masterSet.has(id));
        if (!allowed.length) return res.status(404).json({ error: 'No valid masters selected' });

        const jobs = await readBlundersTeacherJobs();
        const jobId = `blj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        jobs[jobId] = {
          id: jobId,
          orgId,
          teacherId: String(req.user.id || ''),
          type: 'blunders_master_history_scan',
          status: 'queued',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          startedAt: null,
          finishedAt: null,
          error: null,
          params: { masterIds: allowed, historyGames, force },
          progress: { total: allowed.length, done: 0, message: `Queued (${allowed.length})`, currentMasterId: null, currentMasterName: null }
        };
        const okWrite = await writeBlundersTeacherJobs(jobs);
        if (!okWrite) return res.status(500).json({ error: 'Failed to persist job. Please retry.' });
        blundersTeacherJobQueue.push(jobId);
        blundersTeacherRunNextJob().catch(() => {});
        return res.json({ ok: true, orgId, jobId, queued: allowed.length });
      } catch (e) {
        console.error('POST /api/teachers/blunders/jobs/master-history-scan error:', e);
        return res.status(500).json({ error: 'Failed to enqueue master history scan' });
      }
    });

    // Teacher: enqueue Blunders tagging as a background job (A: tactical themes).
    app.post('/api/teachers/blunders/jobs/tag-puzzles', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const scope = String(body.scope || 'student'); // student | master | all
        const recompute = !!body.recompute;
        const syncDb = body.syncDb !== undefined ? !!body.syncDb : true;
        if (!['student', 'master', 'all'].includes(scope)) return res.status(400).json({ error: 'Invalid scope (use: student, master, all)' });

        const jobs = await readBlundersTeacherJobs();
        const jobId = `blj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        jobs[jobId] = {
          id: jobId,
          orgId,
          teacherId: String(req.user.id || ''),
          type: 'blunders_tag_puzzles',
          status: 'queued',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          startedAt: null,
          finishedAt: null,
          error: null,
          params: { scope, recompute, syncDb },
          progress: { total: 0, done: 0, tagged: 0, skipped: 0, scope, message: 'Queued' }
        };
        const okWrite = await writeBlundersTeacherJobs(jobs);
        if (!okWrite) return res.status(500).json({ error: 'Failed to persist job. Please retry.' });
        blundersTeacherJobQueue.push(jobId);
        blundersTeacherRunNextJob().catch(() => {});
        return res.json({ ok: true, orgId, jobId, scope, recompute, syncDb });
      } catch (e) {
        console.error('POST /api/teachers/blunders/jobs/tag-puzzles error:', e);
        return res.status(500).json({ error: 'Failed to enqueue tag job' });
      }
    });

    app.get('/api/teachers/blunders/jobs/:jobId', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const jobId = String(req.params.jobId || '').trim();
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const jobs = await readBlundersTeacherJobs();
        const job = jobs[jobId] || null;
        if (!job) return res.status(404).json({ error: 'Job not found' });
        if (String(job.orgId || '') !== orgId) return res.status(403).json({ error: 'Access denied' });
        // Only allow owner teacher to read (tighten)
        if (String(job.teacherId || '') !== String(req.user.id || '')) return res.status(403).json({ error: 'Access denied' });
        return res.json({ ok: true, job });
      } catch (e) {
        console.error('GET /api/teachers/blunders/jobs/:jobId error:', e);
        return res.status(500).json({ error: 'Failed to load job' });
      }
    });

    app.post('/api/teachers/blunders/jobs/:jobId/cancel', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const jobId = String(req.params.jobId || '').trim();
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const jobs = await readBlundersTeacherJobs();
        const job = jobs[jobId] || null;
        if (!job) return res.status(404).json({ error: 'Job not found' });
        if (String(job.orgId || '') !== orgId) return res.status(403).json({ error: 'Access denied' });
        if (String(job.teacherId || '') !== String(req.user.id || '')) return res.status(403).json({ error: 'Access denied' });
        blundersTeacherJobCancel.add(jobId);
        if (job.status === 'queued') {
          job.status = 'cancelled';
          job.finishedAt = nowIso();
          job.updatedAt = nowIso();
          job.progress = { ...(job.progress || {}), message: 'Cancelled.' };
          jobs[jobId] = job;
          await writeBlundersTeacherJobs(jobs);
        }
        return res.json({ ok: true, cancelled: true });
      } catch (e) {
        console.error('POST /api/teachers/blunders/jobs/:jobId/cancel error:', e);
        return res.status(500).json({ error: 'Failed to cancel job' });
      }
    });

    app.get('/api/teachers/blunders/masters-summary', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const org = await getOrgBlundersSettings(orgId);
        const puzzles = await readBlundersPuzzles();
        const masterPuzzles = puzzles.filter(p => String(p.orgId || '') === orgId && String(p.scope || '') === 'master');
        const masters = (Array.isArray(org.masters) ? org.masters : []).map((m) => {
          const mid = String(m.id || '');
          const mine = masterPuzzles.filter(p => String(p.masterId || '') === mid);
          // Best-effort: show last known master rating based on most recent master puzzle.
          const last = mine.slice().sort((a, b) => (puzzleSortKeyMs(b) - puzzleSortKeyMs(a)))[0] || null;
          const mr = last && last.masterChessComRating !== null && last.masterChessComRating !== undefined ? Number(last.masterChessComRating) : null;
          const ms = last && last.masterChessComRatingSource ? String(last.masterChessComRatingSource) : null;
          return {
            ...m,
            counts: { total: mine.length },
            rating: Number.isFinite(mr) ? mr : null,
            ratingSource: ms,
            ratingUpdatedAt: last?.masterChessComRatingUpdatedAt || null
          };
        });
        return res.json({ ok: true, orgId, masters, masterConfig: await getMasterBlundersConfig(orgId) });
      } catch (e) {
        console.error('GET /api/teachers/blunders/masters-summary error:', e);
        return res.status(500).json({ error: 'Failed to load masters summary' });
      }
    });

    app.post('/api/teachers/blunders/sync-master', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const masterId = String(body.masterId || '').trim();
        const hkDayKey = normalizeHkDayKey(body.hkDayKey) || todayHkKey();
        const force = body.force ? '1' : '0';
        if (!masterId) return res.status(400).json({ error: 'masterId is required' });
        const org = await getOrgBlundersSettings(orgId);
        const master = (Array.isArray(org.masters) ? org.masters : []).find(m => String(m.id || '') === masterId);
        if (!master) return res.status(404).json({ error: 'Master not found' });
        const result = await syncBlundersForMaster(orgId, master, { hkDayKey, force });
        return res.json({ ok: true, result });
      } catch (e) {
        console.error('POST /api/teachers/blunders/sync-master error:', e);
        return res.status(500).json({ error: 'Failed to sync master' });
      }
    });

    // Teacher: bulk mark all pending puzzles as completed for selected students (org-scoped).
    app.post('/api/teachers/blunders/complete-pending', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const idsIn = Array.isArray(body.studentIds) ? body.studentIds : [];
        const ids = Array.from(new Set(idsIn.map(x => String(x || '').trim()).filter(Boolean)));
        if (!ids.length) return res.status(400).json({ error: 'Missing studentIds' });

        // Respect assignedStudents restriction (if present).
        const users = await readUsers();
        const teacher = users.find(u => u.id === req.user.id);
        const assignedIds = (teacher && Array.isArray(teacher.assignedStudents) && teacher.assignedStudents.length) ? new Set(teacher.assignedStudents) : null;
        const allowedIds = assignedIds ? ids.filter(id => assignedIds.has(id)) : ids;
        if (!allowedIds.length) return res.status(403).json({ error: 'No allowed students selected' });

        const puzzles = await readBlundersPuzzles();
        const nowIso = new Date().toISOString();
        let changed = 0;
        let considered = 0;
        for (const p of puzzles) {
          if (String(p.orgId || '') !== orgId) continue;
          if (String(p.scope || '') === 'master') continue;
          const sid = String(p.studentId || '');
          if (!allowedIds.includes(sid)) continue;
          considered++;
          if (String(p.status || 'pending') === 'pending') {
            p.status = 'completed';
            if (!p.completedAt) p.completedAt = nowIso;
            changed++;
          }
        }
        if (changed) await writeBlundersPuzzles(puzzles);

        return res.json({ ok: true, orgId, selected: ids.length, allowed: allowedIds.length, considered, changed });
      } catch (e) {
        console.error('POST /api/teachers/blunders/complete-pending error:', e);
        return res.status(500).json({ error: 'Failed to complete pending puzzles' });
      }
    });

    // Teacher: tag stats (A: tactical themes) for students in org.
    app.get('/api/teachers/blunders/tag-stats', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });

        const duration = String(req.query.duration || 'month'); // week | month | halfYear | year | all
        const startMs = (() => {
          const now = Date.now();
          const day = 24 * 60 * 60 * 1000;
          if (duration === 'week') return now - 7 * day;
          if (duration === 'month') return now - 30 * day;
          if (duration === 'halfYear') return now - 182 * day;
          if (duration === 'year') return now - 365 * day;
          return 0;
        })();

        const users = await readUsers();
        const teacher = users.find(u => u.id === req.user.id);
        const assignedIds = (teacher && Array.isArray(teacher.assignedStudents) && teacher.assignedStudents.length) ? new Set(teacher.assignedStudents) : null;

        const data = await readData();
        const studentsAll = Array.isArray(data?.students) ? data.students.filter(s => String(s.organizationId || '') === orgId) : [];
        const students = assignedIds ? studentsAll.filter(s => assignedIds.has(s.id)) : studentsAll;
        const allowedStudentIds = new Set(students.map(s => String(s.id || '')));
        const studentMap = new Map(students.map(s => [String(s.id || ''), { name: String(s.name || 'Student'), studentId: String(s.studentId || '') }]));

        const puzzles = await readBlundersPuzzles();
        const mine = puzzles
          .filter(p => String(p?.orgId || '') === orgId)
          .filter(p => String(p?.scope || '') !== 'master')
          .filter(p => allowedStudentIds.has(String(p?.studentId || '')))
          .filter(p => !startMs || (puzzleSortKeyMs(p) >= startMs));

        const overall = new Map(); // tag -> count
        const perStudent = new Map(); // sid -> Map(tag,count)

        for (const p of mine) {
          const sid = String(p?.studentId || '');
          const tags = Array.isArray(p?.tags) ? p.tags.map(String).filter(Boolean) : [];
          if (!tags.length) continue;
          if (!perStudent.has(sid)) perStudent.set(sid, new Map());
          const m = perStudent.get(sid);
          for (const t of tags) {
            m.set(t, (m.get(t) || 0) + 1);
            overall.set(t, (overall.get(t) || 0) + 1);
          }
        }

        const topOverall = Array.from(overall.entries())
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => (b.count - a.count) || String(a.tag).localeCompare(String(b.tag)))
          .slice(0, 20);

        const studentsOut = Array.from(perStudent.entries()).map(([sid, map]) => {
          const info = studentMap.get(String(sid)) || { name: 'Student', studentId: '' };
          const top = Array.from(map.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => (b.count - a.count) || String(a.tag).localeCompare(String(a.tag)))
            .slice(0, 10);
          return { id: String(sid), name: info.name, studentId: info.studentId, top };
        }).sort((a, b) => String(a.name).localeCompare(String(b.name)));

        return res.json({
          ok: true,
          orgId,
          duration,
          taggerVersion: BLUNDERS_TAGGER_VERSION,
          puzzlesConsidered: mine.length,
          topOverall,
          students: studentsOut
        });
      } catch (e) {
        console.error('GET /api/teachers/blunders/tag-stats error:', e);
        return res.status(500).json({ error: 'Failed to load tag stats' });
      }
    });
  }
}

module.exports = { registerBlundersTeacherRoutes };


