// Extracted from blundersPublicRoutes.ts — uses `with (deps)` for dependency injection.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersPublicListRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
    app.get('/api/public/students/:id/blunders', async (req, res) => {
      try {
        const { id } = req.params;
        const { password, force } = req.query;

        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) {
            return res.status(401).json({ error: 'Invalid password' });
          }
        }

        const orgId = String(student.organizationId || '');
        const useDb = String(process.env.BLUNDERS_USE_DB || '') === '1';
        const pool = useDb ? appDb.getPool() : null;
        // Diagnostics (fast): do we have chess.com username on server? how many games found today?
        const chessComUsername = await getChessComUsernameForStudent(orgId, student.id);
        const orgsAll = await readChessComSettings();
        const orgSettings = (orgsAll && orgsAll[orgId] && typeof orgsAll[orgId] === 'object') ? orgsAll[orgId] : {};
        const orgSettingsCount = orgSettings ? Object.keys(orgSettings).length : 0;
        const hasStudentKey = !!(orgSettings && Object.prototype.hasOwnProperty.call(orgSettings, String(student.id)));
        let gamesToday = 0;
        let gamesTodayErr = null;
        if (chessComUsername) {
          try {
            const cfg = await getStudentBlundersConfig(orgId, student.id);
            const g = await chessComGetGamesForHkDay(chessComUsername, { hkDayKey: todayHkKey(), limit: cfg.maxGamesPerDay });
            gamesToday = Array.isArray(g) ? g.length : 0;
          } catch (e) {
            gamesTodayErr = String(e?.message || e);
          }
        }

        // Best-effort background sync (poll Chess.com) when student opens Blunders
        try {
          if (String(force || '') === '1') {
            blundersLastStudentSync.delete(String(student.id));
          }
        } catch {}
        syncBlundersForStudent(student, { force: String(force || '') === '1' ? '1' : '0' }).catch((e) => console.warn('blunders sync failed:', e));
        // If BLUNDERS_USE_DB=1, read puzzles/progress from Postgres so student view matches teacher all-blunders.
        // Otherwise fall back to JSON file storage.
        let mineAll = [];
        let mineFiltered = [];
        let source = 'file';
        if (useDb && pool) {
          source = 'db';
          const sid = String(student.id || '');
          const limit = Math.max(100, Math.min(5000, Number(BLUNDERS_MAX_PUZZLES_PER_STUDENT || 500) || 500));
          const q = await pool.query(
            `
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
              p.created_at,
              pr.status,
              pr.completed_at
            FROM blunders_puzzles p
            LEFT JOIN blunders_progress pr
              ON pr.org_id = p.org_id AND pr.student_id = p.student_id AND pr.puzzle_key = p.key
            WHERE p.org_id = $1
              AND p.student_id = $2
              AND NOT (
                p.best_cp IS NOT NULL AND ABS(p.best_cp) >= 99999
                AND p.best_move_uci IS NOT NULL AND p.blunder_move_uci IS NOT NULL
                AND LOWER(p.best_move_uci) = LOWER(p.blunder_move_uci)
              )
            ORDER BY COALESCE(pr.completed_at, to_timestamp(p.end_time_sec), p.created_at, to_timestamp(p.sort_at_ms/1000.0)) DESC
            LIMIT $3
            `,
            [orgId, sid, limit]
          );
          mineAll = (q.rows || []).map((r) => {
            const completedAt = r.completed_at ? new Date(r.completed_at).toISOString() : null;
            const endTime = Number(r.end_time_sec || 0) || 0;
            return {
              key: String(r.key || ''),
              id: String(r.key || ''),
              orgId: String(r.org_id || ''),
              studentId: String(r.student_id || ''),
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
              dropPoints: Number(r.drop_points ?? 0) || 0,
              status: r.status ? String(r.status) : '',
              completedAt: completedAt || null,
              createdAt: r.created_at ? new Date(r.created_at).toISOString() : null
            };
          });
          mineFiltered = mineAll;
        } else {
          const puzzles = await readBlundersPuzzles();
          // Keep only latest N puzzles per student if configured to prevent unbounded growth.
          const pr = pruneStudentBlundersInPlace(puzzles, orgId, String(student.id), BLUNDERS_MAX_PUZZLES_PER_STUDENT);
          if (pr.changed) {
            try { await writeBlundersPuzzles(puzzles); } catch {}
          }
          mineAll = puzzles
            .filter(p => String(p.orgId || '') === orgId && String(p.scope || '') !== 'master' && String(p.studentId || '') === String(student.id));
          mineFiltered = mineAll.filter(p => !isInvalidSameBestMovePuzzle(p));
        }

        // If the invalid-filter suddenly drops everything (common after data/schema changes),
        // fall back to showing raw puzzles so the student UI doesn't go blank.
        const invalidFilterDroppedAll = (source === 'file') && mineAll.length > 0 && mineFiltered.length === 0;
        const mine = invalidFilterDroppedAll ? mineAll : mineFiltered;

        const isCompletedPuzzle = (p) => {
          if (String(p?.status || '') === 'completed') return true;
          const t = Date.parse(String(p?.completedAt || ''));
          return Number.isFinite(t) && t > 0;
        };

        const completed = mine.filter(isCompletedPuzzle);
        const pending = mine.filter(p => !isCompletedPuzzle(p) && String(p?.status || 'pending') === 'pending');

        // Cumulative analyzed games count (+ rolling 3-month stats)
        let analyzedGamesTotal = 0;
        let rolling3m = null;
        try {
          const orgs = await readBlundersStats();
          const st = orgs?.[orgId]?.[String(student.id)] || null;
          analyzedGamesTotal = Number(st?.analyzedCount || 0) || 0;
          rolling3m = computeRolling3mStats({ analyzedMap: st?.analyzed || {}, puzzles: mine });
        } catch {}

        // AI coach comment (cached; best-effort background refresh)
        let aiCommentMonth = null;
        let aiCommentUpdatedAt = null;
        let aiCommentStatus = 'disabled'; // disabled | cached | generating | error
        let aiCommentError = null;
        try {
          const key = aiCommentCacheKey({ orgId, studentId: String(student.id), range: 'month' });
          const store = await readBlundersAiComments();
          const entry = store?.[key] || null;
          if (entry) {
            aiCommentMonth = entry.comment || { text: entry.text || '' };
            aiCommentUpdatedAt = entry.updatedAt || null;
            aiCommentStatus = entry?.error ? 'error' : 'cached';
            aiCommentError = entry?.error || null;
          }
          const fresh = entry?.updatedAt && aiCommentIsFresh(entry.updatedAt, 24 * 60 * 60 * 1000);
          const errFresh = entry?.failedAt && aiCommentIsFresh(entry.failedAt, 10 * 60 * 1000);
          if (!fresh && !errFresh && openAiEnabled()) {
            aiCommentStatus = entry ? (entry?.error ? 'error' : 'cached') : 'generating';
            generateStudentAiCommentMonth({ orgId, studentId: String(student.id), force: false }).catch(() => {});
          }
        } catch {}

        return res.json({
          ok: true,
          student: { id: String(student.id), name: String(student.name || 'Student'), studentId: String(student.chessComId || '') },
          stats: { analyzedGamesTotal, rolling3m: rolling3m || undefined },
          ai: { monthComment: aiCommentMonth || undefined, monthCommentUpdatedAt: aiCommentUpdatedAt || undefined, monthCommentStatus: aiCommentStatus, monthCommentError: aiCommentError || undefined },
          pending,
          completed,
          counts: { pending: pending.length, completed: completed.length, total: mine.length },
          debug: {
            hkDay: todayHkKey(),
            orgId: orgId || null,
            studentInternalId: String(student.id || ''),
            chessComUsername: chessComUsername || null,
            orgSettingsCount,
            hasStudentKey,
            gamesTodayRapidBlitz: gamesToday,
            gamesTodayErr,
            source,
            invalidFilterDroppedAll,
            mineCounts: { all: mineAll.length, filtered: mineFiltered.length, used: mine.length },
            sync: (() => {
              const st = blundersSyncState.get(String(student.id)) || null;
              if (!st) return null;
              if (st.fetch && typeof st.fetch.startedAtMs === 'number') {
                const elapsedMs = Math.max(0, Date.now() - st.fetch.startedAtMs);
                return { ...st, fetch: { ...st.fetch, elapsedMs } };
              }
              return st;
            })()
          }
        });
      } catch (e) {
        console.error('GET /api/public/students/:id/blunders error:', e);
        return res.status(500).json({ error: 'Failed to load blunders puzzles' });
      }
    });

    // Public Student Access: Recent games (with PGN + simple move list) + blunders per game.
    // Note: We do NOT persist PGNs; we fetch the most recent games on demand (cached briefly in-memory).
    const blundersRecentGamesCache = new Map(); // key: orgId|studentId -> { atMs, data }
    app.get('/api/public/students/:id/blunders/recent-games', async (req, res) => {
      try {
        const { id } = req.params;
        const { password } = req.query;
        const limitIn = Number(req.query.limit || 5);
        const limit = Number.isFinite(limitIn) ? Math.max(1, Math.min(10, Math.floor(limitIn))) : 5;

        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) return res.status(401).json({ error: 'Invalid password' });
        }
        const orgId = String(student.organizationId || '');
        if (!orgId) return res.status(400).json({ error: 'Student missing organization' });

        const cacheKey = `${orgId}|${String(student.id || '')}`;
        const cached = blundersRecentGamesCache.get(cacheKey) || null;
        const now = Date.now();
        if (cached && (now - Number(cached.atMs || 0)) < 3 * 60 * 1000 && cached.data) {
          return res.json({ ok: true, cached: true, ...cached.data });
        }

        const chessComUsername = await getChessComUsernameForStudent(orgId, student.id);
        if (!chessComUsername) return res.json({ ok: true, games: [] });

        const games = await chessComGetRecentGames(chessComUsername, { limit });
        const puzzlesAll = await readBlundersPuzzles();
        const mine = puzzlesAll.filter(p => String(p.orgId || '') === orgId && String(p.scope || '') !== 'master' && String(p.studentId || '') === String(student.id));

        const outGames = [];
        for (const g of (Array.isArray(games) ? games : []).slice(0, limit)) {
          const url = String(g?.url || '').trim();
          const pgn = String(g?.pgn || '').trim();
          let fens = [];
          let movesSan = [];
          if (pgn) {
            try {
              const ch = new Chess();
              ch.loadPgn(pgn, { sloppy: true });
              const hist = ch.history({ verbose: true }) || [];
              const replay = new Chess();
              fens = [replay.fen()];
              movesSan = [];
              for (const mv of hist) {
                const applied = replay.move({
                  from: String(mv?.from || '').toLowerCase(),
                  to: String(mv?.to || '').toLowerCase(),
                  promotion: mv?.promotion ? String(mv.promotion).toLowerCase() : undefined
                });
                if (!applied) break;
                movesSan.push(String(applied.san || ''));
                fens.push(replay.fen());
              }
            } catch {
              fens = [];
              movesSan = [];
            }
          }

          const gameKey = url || String(g?.uuid || '').trim();
          const blunders = mine
            .filter(p => {
              const pu = String(p?.gameUrl || '').trim();
              const pk = String(p?.gameUUID || p?.gameUuid || '').trim();
              return (gameKey && (pu === gameKey || pk === gameKey));
            })
            .sort((a, b) => (puzzleSortKeyMs(b) - puzzleSortKeyMs(a)))
            .map((p) => ({
              id: String(p?.id || ''),
              key: String(p?.key || ''),
              startFEN: String(p?.startFEN || ''),
              blunderSan: String(p?.blunderSan || p?.blunderMoveUci || ''),
              dropPoints: Number(p?.dropPoints ?? (Number(p?.dropCp || 0) / 100)) || 0,
              tags: Array.isArray(p?.tags) ? p.tags : [],
              createdAt: p?.createdAt || null
            }));

          outGames.push({
            url,
            uuid: g?.uuid ? String(g.uuid) : null,
            endTime: Number(g?.end_time || 0) || 0,
            timeClass: g?.time_class ? String(g.time_class) : '',
            white: g?.white?.username ? String(g.white.username) : '',
            black: g?.black?.username ? String(g.black.username) : '',
            pgn,
            fens,
            movesSan,
            blunders
          });
        }

        const payload = { games: outGames };
        blundersRecentGamesCache.set(cacheKey, { atMs: now, data: payload });
        return res.json({ ok: true, cached: false, ...payload });
      } catch (e) {
        console.error('GET /api/public/students/:id/blunders/recent-games error:', e);
        return res.status(500).json({ error: 'Failed to load recent games' });
      }
    });
  }
}

module.exports = { registerBlundersPublicListRoutes };
