// Extracted from blundersTeacherRoutes.ts — uses `with (deps)`.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersTeacherSettingsRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
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

        // When BLUNDERS_USE_DB=1, the canonical dataset is Postgres (blunders_puzzles + blunders_progress).
        // Align students-summary with teacher all-blunders so counts don't diverge.
        const useDb = String(process.env.BLUNDERS_USE_DB || '') === '1';
        const pool = useDb ? appDb.getPool() : null;
        const studentIds = students.map(s => String(s.id || '')).filter(Boolean);
        const countsByStudentId = new Map();
        if (useDb && pool && studentIds.length) {
          try {
            const q = await pool.query(
              `
              WITH base AS (
                SELECT
                  p.student_id,
                  pr.status,
                  pr.completed_at,
                  p.best_cp,
                  p.best_move_uci,
                  p.blunder_move_uci
                FROM blunders_puzzles p
                LEFT JOIN blunders_progress pr
                  ON pr.org_id = p.org_id AND pr.student_id = p.student_id AND pr.puzzle_key = p.key
                WHERE p.org_id = $1
                  AND p.student_id = ANY($2)
                  AND NOT (
                    p.best_cp IS NOT NULL AND ABS(p.best_cp) >= 99999
                    AND p.best_move_uci IS NOT NULL AND p.blunder_move_uci IS NOT NULL
                    AND LOWER(p.best_move_uci) = LOWER(p.blunder_move_uci)
                  )
              )
              SELECT
                student_id,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE (status='completed' OR completed_at IS NOT NULL))::int AS completed,
                COUNT(*) FILTER (WHERE NOT (status='completed' OR completed_at IS NOT NULL))::int AS pending
              FROM base
              GROUP BY student_id
              `,
              [orgId, studentIds]
            );
            for (const r of (q.rows || [])) {
              const sid = String(r.student_id || '');
              if (!sid) continue;
              countsByStudentId.set(sid, {
                total: Number(r.total || 0) || 0,
                pending: Number(r.pending || 0) || 0,
                completed: Number(r.completed || 0) || 0
              });
            }
          } catch (e) {
            console.warn('students-summary BLUNDERS_USE_DB query failed; falling back to file', String(e?.message || e));
          }
        }

        const puzzles = (!useDb || !pool) ? await readBlundersPuzzles() : null;
        const orgPuzzles = puzzles ? puzzles.filter(p => String(p.orgId || '') === orgId && String(p.scope || '') !== 'master') : [];
        const orgsStats = await readBlundersStats();
        const statsOrg = orgsStats?.[orgId] || {};
        const settings = await getOrgBlundersSettings(orgId);
        const chessSettings = await readChessComSettings();
        const chessMap = (chessSettings && chessSettings[orgId] && typeof chessSettings[orgId] === 'object') ? chessSettings[orgId] : {};

        const out = students.map((s) => {
          const sid = String(s.id || '');
          let pending = 0;
          let completed = 0;
          let total = 0;

          const dbCounts = countsByStudentId.get(sid) || null;
          if (dbCounts) {
            pending = dbCounts.pending;
            completed = dbCounts.completed;
            total = dbCounts.total;
          } else if (orgPuzzles.length) {
            const mine = orgPuzzles.filter(p => String(p.studentId || '') === sid);
            const isCompletedPuzzle = (p) => {
              if (String(p?.status || '') === 'completed') return true;
              const t = Date.parse(String(p?.completedAt || ''));
              return Number.isFinite(t) && t > 0;
            };
            completed = mine.filter(isCompletedPuzzle).length;
            pending = mine.filter(p => !isCompletedPuzzle(p) && String(p?.status || 'pending') === 'pending').length;
            total = pending + completed;
          }
          const analyzedGamesTotal = Number(statsOrg?.[sid]?.analyzedCount || 0) || 0;
          const cfg = (settings.student && settings.student[sid]) ? settings.student[sid] : {};
          const chessId = String(chessMap?.[sid]?.chessId || '').trim();
          return {
            id: sid,
            name: String(s.name || ''),
            studentId: String(s.chessComId || ''),
            chessComUsername: chessId || null,
            chessComRating: null,
            chessComRatingSource: null,
            chessComRatingUpdatedAt: null,
            counts: { pending, completed, total },
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

  }
}

module.exports = { registerBlundersTeacherSettingsRoutes };
export {};
