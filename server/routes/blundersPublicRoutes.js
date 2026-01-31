// Extracted from server.js to keep the main entry file smaller.
// NOTE: This module intentionally uses `with (deps)` so we can move code without rewriting thousands of identifiers.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersPublicRoutes(app, deps) {
  // eslint-disable-next-line no-with
  with (deps) {
    // Public Student Access: Blunders puzzles (No Auth required, Password protected)
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

    // Teacher: Generate AI coach comment (last 30 days) for a student (cached for 24h).
    app.post('/api/teachers/blunders/students/:studentId/ai-comment', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const studentId = String(req.params.studentId || '').trim();
        if (!studentId) return res.status(400).json({ error: 'Missing studentId' });
        const force = !!(req.body && typeof req.body === 'object' && req.body.force);
        const out = await generateStudentAiCommentMonth({ orgId, studentId, force });
        if (!out.ok) return res.status(400).json({ error: out.error || 'Failed to generate', cached: !!out.entry, entry: out.entry || null });
        return res.json({ ok: true, cached: !!out.cached, entry: out.entry || null });
      } catch (e) {
        console.error('POST /api/teachers/blunders/students/:studentId/ai-comment error:', e);
        return res.status(500).json({ error: 'Failed to generate AI comment' });
      }
    });

    // Teacher: Ping OpenAI to validate API key/model quickly.
    app.get('/api/teachers/blunders/ai/ping', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        if (!openAiEnabled()) return res.status(400).json({ ok: false, error: 'OpenAI not configured (missing OPENAI_API_KEY)' });
        const system = 'Return JSON only.';
        const user = JSON.stringify({ ping: true, now: nowIso() });
        const out = await openAiJson({ system, user, maxOutputTokens: 20 });
        return res.json({ ok: true, model: String(process.env.OPENAI_MODEL || 'gpt-4o-mini'), usage: out?.usage || null, sample: out?.json || out?.text || null });
      } catch (e) {
        return res.status(400).json({ ok: false, error: String(e?.message || e) });
      }
    });

    // Teacher: DB sync retry status (best-effort). Useful for verifying tags are catching up in Postgres.
    app.get('/api/teachers/blunders/db-sync-status', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const store = await readBlundersDbRetry();
        const items = Array.isArray(store.items) ? store.items : [];
        const now = Date.now();
        const stats = {
          total: items.length,
          readyNow: items.filter(it => Number(it?.nextAtMs || 0) <= now).length,
          upsert_puzzles: items.filter(it => String(it?.type || '') === 'upsert_puzzles').length,
          upsert_tags: items.filter(it => String(it?.type || '') === 'upsert_tags').length,
          dropped: items.filter(it => !!it?.dropped).length
        };
        const lastErr = items
          .filter(it => it?.lastError)
          .slice(-10)
          .map(it => ({ type: it.type, attempts: it.attempts, lastError: it.lastError, nextAtMs: it.nextAtMs, id: it.id }));
        return res.json({ ok: true, updatedAt: store.updatedAt || null, stats, lastErrors: lastErr });
      } catch (e) {
        return res.status(500).json({ error: 'Failed to load db sync status' });
      }
    });

    // Public Student Access: Fetch AI coach comment (last 30 days). Password protected.
    app.get('/api/public/students/:id/blunders/ai-comment', async (req, res) => {
      try {
        const { id } = req.params;
        const { password } = req.query;

        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) return res.status(401).json({ error: 'Invalid password' });
        }

        const orgId = String(student.organizationId || '');
        const key = aiCommentCacheKey({ orgId, studentId: String(student.id), range: 'month' });
        const store = await readBlundersAiComments();
        const entry = store?.[key] || null;
        const fresh = entry?.updatedAt && aiCommentIsFresh(entry.updatedAt, 24 * 60 * 60 * 1000);
        const errFresh = entry?.failedAt && aiCommentIsFresh(entry.failedAt, 10 * 60 * 1000);

        if (!fresh && !errFresh && openAiEnabled()) {
          generateStudentAiCommentMonth({ orgId, studentId: String(student.id), force: false }).catch(() => {});
        }

        return res.json({
          ok: true,
          status: openAiEnabled()
            ? (entry?.error ? 'error' : (fresh ? 'cached' : 'generating'))
            : 'disabled',
          updatedAt: entry?.updatedAt || null,
          error: entry?.error || null,
          failedAt: entry?.failedAt || null,
          comment: entry?.comment || (entry?.text ? { text: entry.text } : null),
          stats: entry?.stats || null
        });
      } catch (e) {
        console.error('GET /api/public/students/:id/blunders/ai-comment error:', e);
        return res.status(500).json({ error: 'Failed to load AI comment' });
      }
    });

    // ===== Public Student Access: Blunders Challenge Mode (No Auth required, Password protected) =====
    app.post('/api/public/students/:id/blunders/challenge/start', async (req, res) => {
      try {
        const { id } = req.params;
        const { password } = req.query;
        const { difficulty } = req.body || {};

        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) return res.status(401).json({ error: 'Invalid password' });
        }

        const orgId = String(student.organizationId || '');
        if (!orgId) return res.status(400).json({ error: 'Student missing organization' });
        const cfg = blundersChallengeDifficultyConfig(difficulty);
        if (!cfg) return res.status(400).json({ error: 'Invalid difficulty (use: easy, medium, hard)' });

        const ratings = await readChessComRatings().catch(() => ({ orgs: {}, meta: {} }));
        const { rating, source } = pickStudentRatingFromCache(orgId, String(student.id), ratings.orgs || {});
        const bucket = blundersRatingBucket(rating);

        const puzzlesAll = await readBlundersPuzzles();
        const picks = pickChallengePuzzlesFromAllBlunders({
          orgId,
          difficultyCfg: cfg,
          challengerBucket: bucket,
          puzzles: puzzlesAll,
          ratingsOrgs: ratings.orgs || {},
          limit: 10
        });
        if (!picks.length) return res.status(400).json({ error: 'No eligible puzzles in pool yet' });

        const sessionKey = `${orgId}:${String(student.id)}`;
        const sessions = await readBlundersChallengeSessions();
        const sessionId = `bch_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const snapshot = picks.map((p) => ({
          id: String(p.id || ''),
          startFEN: String(p.startFEN || ''),
          studentColor: String(p.studentColor || ''),
          dropPoints: Number(p.dropPoints ?? (Number(p.dropCp || 0) / 100)) || 0,
          bestMoveUci: String(p.bestMoveUci || ''),
          bestCp: (p.bestCp === null || p.bestCp === undefined) ? null : Number(p.bestCp),
          orgId: String(p.orgId || ''),
          scope: String(p.scope || ''),
          gameUrl: String(p.gameUrl || '')
        }));

        sessions[sessionKey] = {
          id: sessionId,
          orgId,
          studentId: String(student.id),
          studentName: String(student.name || 'Student'),
          studentStudentId: String(student.chessComId || ''),
          difficulty: cfg.key,
          pointsAward: cfg.points,
          rating: (rating === null || rating === undefined) ? null : Number(rating),
          ratingSource: source || null,
          ratingBucket: bucket,
          target: 10,
          correct: 0,
          idx: 0,
          puzzles: snapshot,
          completed: false,
          awarded: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await writeBlundersChallengeSessions(sessions);

        const first = snapshot[0] || null;
        return res.json({
          ok: true,
          sessionId,
          difficulty: cfg.key,
          pointsAward: cfg.points,
          rating: rating || null,
          ratingBucket: bucket,
          target: 10,
          correct: 0,
          idx: 0,
          puzzle: first ? { id: first.id, startFEN: first.startFEN, studentColor: first.studentColor, dropPoints: first.dropPoints, gameUrl: first.gameUrl || undefined } : null
        });
      } catch (e) {
        console.error('POST /api/public/students/:id/blunders/challenge/start error:', e);
        return res.status(500).json({ error: 'Failed to start challenge' });
      }
    });

    async function evalChallengeAttemptAtPuzzle(orgId, studentId, puzzleSnap, moveUci, revealBest) {
      const sid = String(studentId || '');
      const oid = String(orgId || '');
      const startFen = String(puzzleSnap?.startFEN || '');
      if (!oid || !sid) return { ok: false, error: 'Missing org/student' };
      if (!startFen) return { ok: false, error: 'Puzzle missing startFEN' };

      // Challenge mode: reveal best move is disabled (per requirement).
      if (revealBest && !String(moveUci || '').trim()) {
        return { ok: false, error: 'Show best move is disabled in Challenge mode' };
      }

      const parsed = parseUciMove(moveUci);
      if (!parsed) return { ok: false, error: 'Invalid moveUci (use UCI like e2e4 or e7e8q)' };

      let chess = null;
      try { chess = new Chess(startFen); } catch { chess = null; }
      if (!chess) return { ok: false, error: 'Invalid startFEN' };

      const mv = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion });
      if (!mv) return { ok: false, error: 'Illegal move' };

      const afterFen = chess.fen();
      const playedSan = String(mv.san || '');

      // Speed optimization: use precomputed bestMoveUci captured in the session snapshot.
      // This makes feedback near-instant (no Stockfish calls during attempts).
      let bestMove = String(puzzleSnap?.bestMoveUci || '').trim().split(/\s+/)[0] || '';
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) bestMove = '';
      if (!bestMove) {
        return { ok: false, error: 'Puzzle missing best move (re-start the challenge)' };
      }
      const isBest = parsed.uci === bestMove;

      return {
        ok: !!isBest,
        verdict: isBest ? 'best' : 'blunder',
        afterFEN: afterFen,
        playedUci: parsed.uci,
        playedSan: playedSan || undefined,
        origin: 'attempt'
      };
    }

    app.post('/api/public/students/:id/blunders/challenge/attempt', async (req, res) => {
      try {
        const { id } = req.params;
        const { password } = req.query;
        const { sessionId, moveUci, revealBest } = req.body || {};

        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) return res.status(401).json({ error: 'Invalid password' });
        }
        const orgId = String(student.organizationId || '');
        if (!orgId) return res.status(400).json({ error: 'Student missing organization' });

        const sessions = await readBlundersChallengeSessions();
        const sessionKey = `${orgId}:${String(student.id)}`;
        const sess = sessions[sessionKey] || null;
        if (!sess || String(sess.id || '') !== String(sessionId || '')) return res.status(404).json({ error: 'Session not found (start a new challenge)' });
        if (sess.completed) {
          return res.json({ ok: true, done: true, pointsAward: Number(sess.pointsAward || 0) || 0, totalAwarded: true });
        }

        const idx = Math.max(0, Math.min((Array.isArray(sess.puzzles) ? sess.puzzles.length : 0) - 1, Number(sess.idx || 0)));
        const puzzle = Array.isArray(sess.puzzles) ? sess.puzzles[idx] : null;
        if (!puzzle) return res.status(400).json({ error: 'Session puzzle missing' });

        const out = await evalChallengeAttemptAtPuzzle(orgId, String(student.id), puzzle, String(moveUci || ''), !!revealBest);
        if (out && out.error) return res.status(400).json({ error: out.error });

        // Reveal best is disabled for challenge mode; keep logic but always false for now.
        const isRevealOnly = false;

        let advanced = false;
        let nextPuzzle = null;
        let done = false;
        let awardedPoints = 0;

        if (!isRevealOnly && out && out.ok) {
          sess.correct = Math.max(0, Number(sess.correct || 0)) + 1;
          sess.idx = idx + 1;
          advanced = true;
          if (sess.correct >= Number(sess.target || 10)) {
            sess.completed = true;
            done = true;
            if (!sess.awarded) {
              awardedPoints = Number(sess.pointsAward || 0) || 0;
              const lb = await readBlundersChallengeLeaderboard();
              if (!lb[orgId] || typeof lb[orgId] !== 'object') lb[orgId] = {};
              const orgLb = lb[orgId];
              const sid = String(student.id);
              const cur = orgLb[sid] && typeof orgLb[sid] === 'object' ? orgLb[sid] : { totalPoints: 0 };
              const total = (Number(cur.totalPoints || 0) || 0) + awardedPoints;
              orgLb[sid] = {
                studentId: String(student.chessComId || ''),
                name: String(student.name || 'Student'),
                totalPoints: total,
                updatedAt: new Date().toISOString()
              };
              lb[orgId] = orgLb;
              await writeBlundersChallengeLeaderboard(lb);
              sess.awarded = true;
            }
          } else {
            const nextIdx = Math.max(0, Math.min((Array.isArray(sess.puzzles) ? sess.puzzles.length : 0) - 1, Number(sess.idx || 0)));
            const np = Array.isArray(sess.puzzles) ? sess.puzzles[nextIdx] : null;
            nextPuzzle = np ? { id: np.id, startFEN: np.startFEN, studentColor: np.studentColor, dropPoints: np.dropPoints, gameUrl: np.gameUrl || undefined } : null;
          }
        }

        sess.updatedAt = new Date().toISOString();
        sessions[sessionKey] = sess;
        await writeBlundersChallengeSessions(sessions);

        // Return current leaderboard total (best-effort)
        let myTotal = null;
        try {
          const lb = await readBlundersChallengeLeaderboard();
          const ent = lb?.[orgId]?.[String(student.id)] || null;
          myTotal = ent ? Number(ent.totalPoints || 0) || 0 : 0;
        } catch { myTotal = null; }

        return res.json({
          // ok here means "correct move" (like normal blunders attempt endpoints)
          ok: !!out?.ok && !isRevealOnly,
          verdict: out?.verdict,
          correctMove: !!out?.ok && !isRevealOnly,
          afterFEN: out?.afterFEN,
          playedUci: out?.playedUci,
          playedSan: out?.playedSan,
          origin: out?.origin,
          advanced,
          correct: Number(sess.correct || 0) || 0,
          target: Number(sess.target || 10) || 10,
          idx: Number(sess.idx || 0) || 0,
          nextPuzzle,
          done,
          pointsAward: Number(sess.pointsAward || 0) || 0,
          pointsGained: awardedPoints,
          totalPoints: myTotal
        });
      } catch (e) {
        console.error('POST /api/public/students/:id/blunders/challenge/attempt error:', e);
        return res.status(500).json({ error: 'Failed to attempt challenge' });
      }
    });

    app.get('/api/public/students/:id/blunders/challenge/leaderboard', async (req, res) => {
      try {
        const { id } = req.params;
        const { password } = req.query;
        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) return res.status(401).json({ error: 'Invalid password' });
        }
        const orgId = String(student.organizationId || '');
        if (!orgId) return res.status(400).json({ error: 'Student missing organization' });

        const lb = await readBlundersChallengeLeaderboard();
        const orgLb = (lb && lb[orgId] && typeof lb[orgId] === 'object') ? lb[orgId] : {};
        const orgStudents = Array.isArray(data?.students) ? data.students.filter(s => String(s.organizationId || '') === orgId) : [];
        const map = new Map(orgStudents.map(s => [String(s.id), { name: String(s.name || 'Student'), studentId: String(s.chessComId || '') }]));

        const entries = Object.entries(orgLb).map(([sid, v]) => {
          const info = map.get(String(sid)) || { name: String(v?.name || 'Student'), studentId: String(v?.studentId || '') };
          return {
            id: String(sid),
            name: info.name,
            studentId: info.studentId,
            totalPoints: Number(v?.totalPoints || 0) || 0,
            updatedAt: v?.updatedAt || null
          };
        }).sort((a, b) => (b.totalPoints - a.totalPoints) || String(a.name).localeCompare(String(b.name)));

        const myTotal = (orgLb[String(student.id)] && typeof orgLb[String(student.id)] === 'object')
          ? (Number(orgLb[String(student.id)].totalPoints || 0) || 0)
          : 0;

        return res.json({ ok: true, orgId, myTotal, entries });
      } catch (e) {
        console.error('GET /api/public/students/:id/blunders/challenge/leaderboard error:', e);
        return res.status(500).json({ error: 'Failed to load leaderboard' });
      }
    });

    // Public Student Access: Master Game (masters + puzzles) (No Auth required, Password protected)
    app.get('/api/public/students/:id/blunders/master', async (req, res) => {
      try {
        const { id } = req.params;
        const { password, masterId } = req.query;
        const bucketKey = String(req.query.bucket || '').trim(); // '' | missMate | d1 | d2 | d3 | d4
        const pageSize = 50; // Fixed (UI requirement)
        const pageIn = Number(req.query.page || 1);
        const page = Number.isFinite(pageIn) ? Math.max(1, Math.floor(pageIn)) : 1;
        const wantsPaged = !!(bucketKey || req.query.paged || req.query.page);

        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) {
            return res.status(401).json({ error: 'Invalid password' });
          }
        }

        const orgId = String(student.organizationId || '');
        const org = await getOrgBlundersSettings(orgId);
        const masters = Array.isArray(org.masters) ? org.masters : defaultMastersPreset();

        const puzzles = await readBlundersPuzzles();
        const masterPuzzles = puzzles.filter(p => String(p.orgId || '') === orgId && String(p.scope || '') === 'master');
        const progressAll = await readBlundersMasterProgress();
        const progOrg = (progressAll?.[orgId] && typeof progressAll[orgId] === 'object') ? progressAll[orgId] : {};
        const progStu = (progOrg?.[String(student.id)] && typeof progOrg[String(student.id)] === 'object') ? progOrg[String(student.id)] : {};

        const list = masters.map((m) => {
          const mid = String(m.id || '');
          const mine = masterPuzzles.filter(p => String(p.masterId || '') === mid);
          let completed = 0;
          for (const pz of mine) {
            const pid = String(pz.id || '');
            if (pid && progStu[pid] && String(progStu[pid].status || '') === 'completed') completed++;
          }
          return {
            id: mid,
            name: String(m.name || ''),
            username: String(m.username || ''),
            counts: { total: mine.length, completed, pending: Math.max(0, mine.length - completed) }
          };
        });

        const selectedMasterId = String(masterId || '').trim();
        if (!selectedMasterId) {
          return res.json({ ok: true, masters: list });
        }

        const selected = masterPuzzles
          .filter(p => String(p.masterId || '') === selectedMasterId)
          .sort((a, b) => Number(b.endTime || 0) - Number(a.endTime || 0));

        const completedIds = new Set(Object.entries(progStu).filter(([, v]) => v && String(v.status || '') === 'completed').map(([k]) => k));

        // New: bucketed paging response (like Teacher All blunders / Student Review).
        if (wantsPaged) {
          const normalizeEntry = (p) => {
            const pid = String(p?.id || '');
            const pr = pid ? (progStu?.[pid] || null) : null;
            const status = (pr && String(pr.status || '').trim()) ? String(pr.status) : (completedIds.has(pid) ? 'completed' : 'pending');
            const completedAt = pr?.completedAt || null;
            const dropPoints = (typeof p.dropPoints === 'number')
              ? Number(p.dropPoints)
              : (Number(p.dropCp || 0) / 100);
            return {
              ...p,
              status,
              completedAt,
              dropPoints: Number.isFinite(dropPoints) ? dropPoints : 0
            };
          };

          const entriesAll = selected.map(normalizeEntry);
          const counts = { missMate: 0, d1: 0, d2: 0, d3: 0, d4: 0, total: entriesAll.length };
          for (const p of entriesAll) {
            const bk = blundersBucketKeyOfPuzzle(p);
            if (bk && Object.prototype.hasOwnProperty.call(counts, bk)) counts[bk]++;
          }

          if (!bucketKey) {
            return res.json({ ok: true, masters: list, masterId: selectedMasterId, pageSize, counts });
          }
          if (!['missMate', 'd1', 'd2', 'd3', 'd4'].includes(bucketKey)) {
            return res.status(400).json({ error: 'Invalid bucket (use: missMate, d1, d2, d3, d4)' });
          }

          const bucketEntries = entriesAll.filter((p) => blundersBucketKeyOfPuzzle(p) === bucketKey);
          const totalBucket = bucketEntries.length;
          const totalPages = Math.max(1, Math.ceil(totalBucket / pageSize));
          const safePage = Math.max(1, Math.min(totalPages, page));
          const start = (safePage - 1) * pageSize;
          const pageEntries = bucketEntries.slice(start, start + pageSize);

          return res.json({
            ok: true,
            masters: list,
            masterId: selectedMasterId,
            pageSize,
            counts,
            bucket: bucketKey,
            page: safePage,
            totalPages,
            totalBucket,
            entries: pageEntries
          });
        }

        const pending = selected.filter(p => !completedIds.has(String(p.id || '')));
        const completed = selected.filter(p => completedIds.has(String(p.id || '')));

        return res.json({
          ok: true,
          masters: list,
          masterId: selectedMasterId,
          pending,
          completed,
          counts: { pending: pending.length, completed: completed.length, total: selected.length }
        });
      } catch (e) {
        console.error('GET /api/public/students/:id/blunders/master error:', e);
        return res.status(500).json({ error: 'Failed to load master puzzles' });
      }
    });

    app.post('/api/public/students/:id/blunders/master/:puzzleId/attempt', async (req, res) => {
      try {
        const { id, puzzleId } = req.params;
        const { password } = req.query;
        const { moveUci, revealBest, practice } = req.body || {};

        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) {
            return res.status(401).json({ error: 'Invalid password' });
          }
        }

        const orgId = String(student.organizationId || '');
        const puzzles = await readBlundersPuzzles();
        const puzzle = puzzles.find(p => String(p.id || '') === String(puzzleId) && String(p.orgId || '') === orgId && String(p.scope || '') === 'master');
        if (!puzzle) return res.status(404).json({ error: 'Puzzle not found' });

        const progressAll = await readBlundersMasterProgress();
        if (!progressAll[orgId] || typeof progressAll[orgId] !== 'object') progressAll[orgId] = {};
        const orgProg = progressAll[orgId];
        const sid = String(student.id);
        if (!orgProg[sid] || typeof orgProg[sid] !== 'object') orgProg[sid] = {};
        const stuProg = orgProg[sid];
        if (!stuProg[String(puzzleId)] || typeof stuProg[String(puzzleId)] !== 'object') stuProg[String(puzzleId)] = { status: 'pending', attempts: [] };
        const pr = stuProg[String(puzzleId)];

        // Reveal-only (return best move + SAN + afterFEN so client can animate on board)
        if (revealBest && !moveUci) {
          const startFen = String(puzzle.startFEN || '');
          if (!startFen) return res.status(400).json({ error: 'Puzzle missing startFEN' });
          try {
            let bestMove = String(puzzle.bestMoveUci || '').trim();
            if (!bestMove) {
              const best = await sfEvalFen(startFen, 16);
              bestMove = String(best.bestMove || '').trim();
              // Normalize unexpected formats
              bestMove = bestMove.split(/\s+/)[0] || '';
              if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) {
                puzzle.bestMoveUci = bestMove;
                puzzle.bestCp = scoreToCp(best.score);
                await writeBlundersPuzzles(puzzles);
              } else {
                bestMove = '';
              }
            } else {
              bestMove = bestMove.split(/\s+/)[0] || '';
              if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) bestMove = '';
            }

            let afterFEN = '';
            let bestSan = '';
            try {
              if (bestMove) {
                const b = parseUciMove(bestMove);
                if (b) {
                  let ch = null;
                  try { ch = new Chess(startFen); } catch { ch = null; }
                  if (ch) {
                    const mv = ch.move({ from: b.from, to: b.to, promotion: b.promotion });
                    if (mv) {
                      afterFEN = ch.fen();
                      bestSan = String(mv.san || '');
                    }
                  }
                }
              }
            } catch {}
            return res.json({
              ok: true,
              bestMove: bestMove || undefined,
              bestSan: bestSan || undefined,
              afterFEN: afterFEN || undefined,
              playedUci: bestMove || undefined,
              playedSan: bestSan || undefined
            });
          } catch (e) {
            // Don't fail the whole UX on engine hiccups.
            return res.json({ ok: true, bestMove: undefined, afterFEN: undefined, playedUci: undefined, engineError: String(e?.message || e) });
          }
        }

        if ((String(pr.status || 'pending') === 'completed' || (Number.isFinite(Date.parse(String(pr.completedAt || ''))) && Date.parse(String(pr.completedAt || '')) > 0)) && !practice) {
          return res.json({ ok: true, alreadyCompleted: true, bestMove: revealBest ? (String(puzzle.bestMoveUci || '') || undefined) : undefined });
        }

        const parsed = parseUciMove(moveUci);
        if (!parsed) return res.status(400).json({ error: 'Invalid moveUci (use UCI like e2e4 or e7e8q)' });

        const startFen = String(puzzle.startFEN || '');
        if (!startFen) return res.status(400).json({ error: 'Puzzle missing startFEN' });

        let chess = null;
        try { chess = new Chess(startFen); } catch { chess = null; }
        if (!chess) return res.status(400).json({ error: 'Invalid startFEN' });

        const mv = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion });
        if (!mv) return res.status(400).json({ error: 'Illegal move' });

        const afterFen = chess.fen();
        const playedSan = String(mv.san || '');
        const best = await sfEvalFen(startFen, 16);
        const bestMove = String(best.bestMove || '');
        const bestCp = scoreToCp(best.score);
        const after = await sfEvalFen(afterFen, 16);
        const userCp = -scoreToCp(after.score);
        const dropCp = bestCp - userCp;
        const dropPoints = dropCp / 100;
        const isBest = bestMove && parsed.uci === bestMove;

        const cfg = await getMasterBlundersConfig(orgId);
        const thresholdPoints = cfg.thresholdPoints;
        const v = blundersVerdictFromScores(bestCp, userCp, thresholdPoints);
        const verdict = isBest ? 'best' : v.verdict; // 'best' | 'good' | 'blunder'
        const ok = isBest ? true : !!v.ok;

        if (!practice) {
          const attempts = Array.isArray(pr.attempts) ? pr.attempts : [];
          attempts.push({ at: new Date().toISOString(), moveUci: parsed.uci, san: String(mv.san || ''), bestMove, bestCp, userCp: isBest ? bestCp : userCp, dropCp: isBest ? 0 : dropCp });
          pr.attempts = attempts;
          if (ok) {
            pr.status = 'completed';
            pr.completedAt = new Date().toISOString();
          }
          stuProg[String(puzzleId)] = pr;
          orgProg[sid] = stuProg;
          progressAll[orgId] = orgProg;
          await writeBlundersMasterProgress(progressAll);
        }

        const exposeBest = !!revealBest || (bestMove && parsed.uci === bestMove);
        const bestSan = exposeBest ? uciToSanAtFen(startFen, bestMove) : '';
        return res.json({
          ok,
          verdict,
          dropPoints: isBest ? 0 : dropPoints,
          afterFEN: afterFen,
          playedUci: parsed.uci,
          playedSan: playedSan || undefined,
          bestMove: exposeBest ? bestMove : undefined,
          bestSan: bestSan || undefined
        });
      } catch (e) {
        console.error('POST /api/public/students/:id/blunders/master/:puzzleId/attempt error:', e);
        return res.status(500).json({ error: 'Failed to evaluate move' });
      }
    });

    // Attempt a blunders puzzle move (engine-checked)
    app.post('/api/public/students/:id/blunders/:puzzleId/attempt', async (req, res) => {
      try {
        const { id, puzzleId } = req.params;
        const { password } = req.query;
        const { moveUci, revealBest, practice } = req.body || {};

        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) {
            return res.status(401).json({ error: 'Invalid password' });
          }
        }

        const orgId = String(student.organizationId || '');
        const puzzles = await readBlundersPuzzles();
        const idx = puzzles.findIndex(p => String(p.id || '') === String(puzzleId) && String(p.orgId || '') === orgId && String(p.studentId || '') === String(student.id));
        if (idx < 0) return res.status(404).json({ error: 'Puzzle not found' });

        const puzzle = puzzles[idx];
        // Reveal-only: return best move + SAN + afterFEN so client can animate on board.
        if (revealBest && !moveUci) {
          const startFen = String(puzzle.startFEN || '');
          if (!startFen) return res.status(400).json({ error: 'Puzzle missing startFEN' });
          try {
            // Use cached value if present; otherwise compute and persist.
            let bestMove = String(puzzle.bestMoveUci || '').trim();
            if (!bestMove) {
              const best = await sfEvalFen(startFen, 16);
              bestMove = String(best.bestMove || '').trim();
              bestMove = bestMove.split(/\s+/)[0] || '';
              if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) {
                puzzle.bestMoveUci = bestMove;
                puzzle.bestCp = scoreToCp(best.score);
                puzzles[idx] = puzzle;
                await writeBlundersPuzzles(puzzles);
              } else {
                bestMove = '';
              }
            } else {
              bestMove = bestMove.split(/\s+/)[0] || '';
              if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) bestMove = '';
            }

            let afterFEN = '';
            let bestSan = '';
            try {
              if (bestMove) {
                const b = parseUciMove(bestMove);
                if (b) {
                  let ch = null;
                  try { ch = new Chess(startFen); } catch { ch = null; }
                  if (ch) {
                    const mv = ch.move({ from: b.from, to: b.to, promotion: b.promotion });
                    if (mv) {
                      afterFEN = ch.fen();
                      bestSan = String(mv.san || '');
                    }
                  }
                }
              }
            } catch {}
            return res.json({
              ok: true,
              bestMove: bestMove || undefined,
              bestSan: bestSan || undefined,
              afterFEN: afterFEN || undefined,
              playedUci: bestMove || undefined,
              playedSan: bestSan || undefined
            });
          } catch (e) {
            return res.json({ ok: true, bestMove: undefined, afterFEN: undefined, playedUci: undefined, engineError: String(e?.message || e) });
          }
        }
        if ((String(puzzle.status || 'pending') === 'completed' || (Number.isFinite(Date.parse(String(puzzle.completedAt || ''))) && Date.parse(String(puzzle.completedAt || '')) > 0)) && !practice) {
          return res.json({
            ok: true,
            alreadyCompleted: true,
            bestMove: revealBest ? (String(puzzle.bestMoveUci || '') || undefined) : undefined
          });
        }

        const parsed = parseUciMove(moveUci);
        if (!parsed) return res.status(400).json({ error: 'Invalid moveUci (use UCI like e2e4 or e7e8q)' });

        const startFen = String(puzzle.startFEN || '');
        const studentColor = String(puzzle.studentColor || '');
        if (!startFen) return res.status(400).json({ error: 'Puzzle missing startFEN' });

        let chess = null;
        try { chess = new Chess(startFen); } catch { chess = null; }
        if (!chess) return res.status(400).json({ error: 'Invalid startFEN' });

        const turn = chess.turn(); // 'w' | 'b'
        if (studentColor && turn !== studentColor) {
          // Still allow but warn; puzzle generator should ensure this is student's turn.
        }

        const mv = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion });
        if (!mv) return res.status(400).json({ error: 'Illegal move' });

        const afterFen = chess.fen();
        const playedSan = String(mv.san || '');

        // Evaluate best move at start (student to move)
        const best = await sfEvalFen(startFen, 16);
        const bestMove = String(best.bestMove || '');
        const bestCp = scoreToCp(best.score);

        // Evaluate student's move result at after position (opponent to move), invert to student's POV
        const after = await sfEvalFen(afterFen, 16);
        const afterCpOppPov = scoreToCp(after.score);
        const userCp = -afterCpOppPov;

        const dropCp = bestCp - userCp; // positive means worse than best for student
        const dropPoints = dropCp / 100;

        const isBest = bestMove && parsed.uci === bestMove;
        const cfg = await getStudentBlundersConfig(orgId, student.id);
        const thresholdPoints = cfg.thresholdPoints;
        const v = blundersVerdictFromScores(bestCp, userCp, thresholdPoints);
        // If the player literally played the engine's best move, always treat it as Best,
        // even if Stockfish score parsing/normalization behaves oddly in mate positions.
        const verdict = isBest ? 'best' : v.verdict; // 'best' | 'good' | 'blunder'
        const ok = isBest ? true : !!v.ok;

        if (!practice) {
          // Persist attempts + completion
          const attempts = Array.isArray(puzzle.attempts) ? puzzle.attempts : [];
          attempts.push({
            at: new Date().toISOString(),
            moveUci: parsed.uci,
            san: String(mv.san || ''),
            bestMove,
            bestCp,
            userCp: isBest ? bestCp : userCp,
            dropCp: isBest ? 0 : dropCp
          });
          puzzle.attempts = attempts;

          if (ok) {
            puzzle.status = 'completed';
            puzzle.completedAt = new Date().toISOString();
          }
          // Keep best fields updated (useful for later UI)
          puzzle.bestMoveUci = bestMove;
          puzzle.bestCp = bestCp;
          puzzle.lastUserMoveUci = parsed.uci;
          puzzle.lastUserCp = isBest ? bestCp : userCp;
          puzzle.lastDropCp = isBest ? 0 : dropCp;

          puzzles[idx] = puzzle;
          await writeBlundersPuzzles(puzzles);

          // Optional dual-write: keep Postgres progress in sync (so BLUNDERS_USE_DB remains accurate).
          // This is best-effort and never blocks the student flow.
          try {
            if (appDb.getPool()) {
              const key = String(puzzle.key || '').trim();
              if (key) {
                const pool = appDb.getPool();
                const status = String(puzzle.status || 'pending') === 'completed' ? 'completed' : 'pending';
                const completedAt = status === 'completed' ? String(puzzle.completedAt || '') : '';
                const attempts = Array.isArray(puzzle.attempts) ? puzzle.attempts : [];
                await pool.query(
                  `
                  INSERT INTO blunders_progress(org_id, student_id, puzzle_key, status, completed_at, attempts, updated_at)
                  VALUES ($1, $2, $3, $4, $5::timestamptz, $6::jsonb, NOW())
                  ON CONFLICT (org_id, student_id, puzzle_key) DO UPDATE SET
                    status=EXCLUDED.status,
                    completed_at=EXCLUDED.completed_at,
                    attempts=EXCLUDED.attempts,
                    updated_at=NOW()
                `,
                  [
                    String(orgId),
                    String(student.id),
                    key,
                    status,
                    completedAt ? new Date(completedAt).toISOString() : null,
                    JSON.stringify(attempts)
                  ]
                );
              }
            }
          } catch {}
        }

        const exposeBest = !!revealBest || (bestMove && parsed.uci === bestMove);
        const bestSan = exposeBest ? uciToSanAtFen(startFen, bestMove) : '';
        return res.json({
          ok,
          verdict, // 'best' | 'good' | 'blunder'
          dropPoints: isBest ? 0 : dropPoints,
          afterFEN: afterFen,
          playedUci: parsed.uci,
          playedSan: playedSan || undefined,
          bestMove: exposeBest ? bestMove : undefined,
          bestSan: bestSan || undefined
        });
      } catch (e) {
        console.error('POST /api/public/students/:id/blunders/:puzzleId/attempt error:', e);
        return res.status(500).json({ error: 'Failed to evaluate move' });
      }
    });
  }
}

module.exports = { registerBlundersPublicRoutes };


