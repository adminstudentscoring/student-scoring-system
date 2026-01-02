// Blunders sync logic extracted from server.js.
// NOTE: This module intentionally uses `with (deps)` so we can move code without rewriting identifiers.
// Do NOT add "use strict" to this file (it would break `with`).

function createBlundersSync(deps) {
  // Master sync internal locks (moved with the function)
  const blundersMasterLocks = new Map(); // key -> Promise
  const blundersLastMasterSync = new Map(); // key -> ms
  const blundersLastMasterHistoryScan = new Map(); // key -> ms

  // eslint-disable-next-line no-with
  with (deps) {
    async function syncBlundersForStudent(student, opts = {}) {
      const sid = String(student?.id || '');
      if (!sid) return { ok: false, reason: 'missing student id' };
      const orgId = String(student.organizationId || '');
      const hkDayKey = normalizeHkDayKey(opts.hkDayKey) || todayHkKey();
      const bypassThrottle = String(opts.force || '') === '1';
      const mode = String(opts.mode || '').trim().toLowerCase();
      const historyGames = Math.max(1, Math.min(500, Number(opts.historyGames || 0) || 0));

      // Throttle: at most once per hour per student (for GET auto-refresh)
      const now = Date.now();
      if (mode === 'history' && historyGames) {
        // History scan is heavier; throttle it lightly unless forced.
        const lastH = blundersLastStudentHistoryScan.get(sid) || 0;
        if (!bypassThrottle && now - lastH < 10 * 60 * 1000) return { ok: true, skipped: true, reason: 'throttled_history', lastRunAtMs: lastH };
      } else {
        const last = blundersLastStudentSync.get(sid) || 0;
        if (!bypassThrottle && now - last < 60 * 60 * 1000) return { ok: true, skipped: true, reason: 'throttled', lastRunAtMs: last };
      }

      if (blundersStudentLocks.has(sid)) return blundersStudentLocks.get(sid);

      const task = (async () => {
        if (mode === 'history' && historyGames) blundersLastStudentHistoryScan.set(sid, now);
        else blundersLastStudentSync.set(sid, now);
        blundersSyncState.set(sid, {
          running: true,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          finishedAt: null,
          stage: 'init',
          gamesFetched: 0,
          gamesProcessed: 0,
          pliesProcessed: 0,
          blundersAdded: 0,
          lastError: null
        });
        if (!orgId) return { ok: false, reason: 'missing org' };

        const username = await getChessComUsernameForStudent(orgId, sid);
        if (!username) return { ok: false, reason: 'missing chess.com username' };

        const cfg = await getStudentBlundersConfig(orgId, sid);
        const maxGamesPerDay = Math.max(1, Math.min(50, Number(opts.maxGamesPerDay ?? cfg.maxGamesPerDay) || cfg.maxGamesPerDay));
        const thresholdPoints = Math.max(0.1, Math.min(10, Number(opts.thresholdPoints ?? cfg.thresholdPoints) || cfg.thresholdPoints));

        // Record analyzed games meta (cumulative) so we can compute rolling stats later.
        // We update once per sync to avoid frequent file writes.
        let statsOrgs = null;
        let statsOrg = null;
        let stStats = null;
        try {
          statsOrgs = await readBlundersStats();
          if (!statsOrgs[orgId] || typeof statsOrgs[orgId] !== 'object') statsOrgs[orgId] = {};
          statsOrg = statsOrgs[orgId];
          if (!statsOrg[sid] || typeof statsOrg[sid] !== 'object') statsOrg[sid] = { analyzed: {}, analyzedCount: 0, lastSyncAt: null };
          stStats = statsOrg[sid];
          if (!stStats.analyzed || typeof stStats.analyzed !== 'object') stStats.analyzed = {};
        } catch {
          statsOrgs = null; statsOrg = null; stStats = null;
        }

        // NOTE: For history scan, we "postpone" by fetching more games until we have enough NEW (unanalyzed) games.
        const analyzedMap = (stStats && stStats.analyzed && typeof stStats.analyzed === 'object') ? stStats.analyzed : {};
        const analyzedKeys = new Set(Object.keys(analyzedMap || {}));

        blundersSyncState.set(sid, { ...(blundersSyncState.get(sid) || {}), stage: 'fetch-games', updatedAt: new Date().toISOString() });
        let gamesAll = [];
        let historyTargetNew = 0;
        let historyFetchLimit = 0;
        if (mode === 'history' && historyGames) {
          historyTargetNew = Math.max(1, Math.min(500, Number(historyGames || 0) || 0));
          // Cap to avoid runaway fetch loops while still allowing "find enough new games".
          const maxFetch = Math.max(historyTargetNew, Math.min(5000, historyTargetNew * 20));
          let limit = Math.min(maxFetch, historyTargetNew);
          for (let iter = 0; iter < 10; iter++) {
            gamesAll = await chessComGetRecentGames(username, { studentId: sid, limit });
            historyFetchLimit = limit;
            const newCount = Array.isArray(gamesAll)
              ? gamesAll.filter((g) => {
                const k = String(g?.url || g?.uuid || '').trim();
                if (!k) return true;
                return !analyzedKeys.has(k);
              }).length
              : 0;
            // Got enough new games to analyze
            if (newCount >= historyTargetNew) break;
            // If API returned fewer than requested, likely no more games beyond this.
            if (!Array.isArray(gamesAll) || gamesAll.length < limit) break;
            if (limit >= maxFetch) break;
            const nextLimit = Math.min(maxFetch, Math.max(limit + historyTargetNew, Math.floor(limit * 1.5)));
            if (nextLimit <= limit) break;
            limit = nextLimit;
          }
        } else {
          gamesAll = await chessComGetGamesForHkDay(username, { studentId: sid, hkDayKey, limit: maxGamesPerDay });
        }

        gamesAll = Array.isArray(gamesAll) ? gamesAll : [];
        blundersSyncState.set(sid, { ...(blundersSyncState.get(sid) || {}), gamesFetched: gamesAll.length, stage: 'analyze', updatedAt: new Date().toISOString() });
        if (!gamesAll.length) return { ok: true, games: 0, added: 0 };

        // Skip games already analyzed (avoid re-running Stockfish on the same games).
        let gamesNew = gamesAll.filter((g) => {
          const k = String(g?.url || g?.uuid || '').trim();
          if (!k) return true;
          return !analyzedKeys.has(k);
        });
        // For history, only analyze the first N "new" games (most recent-first).
        if (mode === 'history' && historyTargetNew) {
          gamesNew = gamesNew.slice(0, historyTargetNew);
        }
        if (gamesNew.length !== gamesAll.length || (mode === 'history' && historyTargetNew)) {
          blundersSyncState.set(sid, {
            ...(blundersSyncState.get(sid) || {}),
            stage: 'analyze',
            gamesFetched: gamesAll.length,
            updatedAt: new Date().toISOString(),
            fetchSummary: {
              skippedAlreadyAnalyzed: Math.max(0, gamesAll.length - gamesNew.length),
              toAnalyze: gamesNew.length,
              ...(mode === 'history' ? { targetNew: historyTargetNew, fetchLimit: historyFetchLimit } : {})
            }
          });
        }
        if (!gamesNew.length) {
          // All fetched games were already analyzed; nothing to do.
          return { ok: true, skipped: true, reason: 'already_analyzed', games: gamesAll.length, added: 0, gamesProcessed: 0, pliesProcessed: 0, hkDayKey, maxGamesPerDay, thresholdPoints };
        }

        // IMPORTANT: Do NOT keep and later overwrite the full puzzles array during a long-running sync.
        // We'll collect only "new puzzles" and append them to the latest on-disk bank to preserve progress.
        const puzzlesAtStart = await readBlundersPuzzles();
        const existingKeys = new Set(puzzlesAtStart.map((p) => String(p.key || '')).filter(Boolean));
        const newPuzzles = [];
        let added = 0;
        let gamesProcessed = 0;
        let pliesProcessed = 0;
        let errors = 0;
        let lastFlushAtMs = 0;
        let flushedAdded = 0;

        for (const game of gamesNew) {
          const pgn = String(game.pgn || '');
          if (!pgn) continue;

          const me = username.toLowerCase();
          const whiteU = String(game?.white?.username || '').toLowerCase();
          const blackU = String(game?.black?.username || '').toLowerCase();
          const studentColor = whiteU === me ? 'w' : (blackU === me ? 'b' : '');
          if (!studentColor) continue;

          // Parse PGN and replay to find blunders on student's moves
          let full = null;
          try {
            full = new Chess();
            full.loadPgn(pgn, { sloppy: true });
          } catch {
            full = null;
          }
          if (!full) continue;
          const moves = full.history({ verbose: true }) || [];

          const replay = new Chess();
          let gameFailed = false;
          let gameFailReason = '';

          for (let ply = 0; ply < moves.length; ply++) {
            const beforeFen = replay.fen();
            const turn = replay.turn();
            const mv = moves[ply];
            const prev = ply > 0 ? moves[ply - 1] : null;

            // Apply the move as recorded.
            // IMPORTANT: chess.js move() is strict about input shape; we only pass {from,to,promotion}.
            let applied = null;
            try {
              applied = replay.move({
                from: String(mv?.from || '').toLowerCase(),
                to: String(mv?.to || '').toLowerCase(),
                promotion: mv?.promotion ? String(mv.promotion).toLowerCase() : undefined
              });
            } catch (err) {
              gameFailed = true;
              gameFailReason = `Invalid move (exception) at ply ${ply}: ${String(err?.message || err || 'unknown')}`;
              // Best-effort: include SAN + from/to in debug to help diagnosis without huge payloads.
              console.warn('Blunders: invalid move exception; skipping game', { studentId: sid, gameUrl: String(game?.url || ''), ply, san: String(mv?.san || ''), from: String(mv?.from || ''), to: String(mv?.to || '') });
              break;
            }
            if (!applied) {
              gameFailed = true;
              gameFailReason = `Invalid move (null) at ply ${ply}: san=${String(mv?.san || '')} from=${String(mv?.from || '')} to=${String(mv?.to || '')}`;
              console.warn('Blunders: invalid move returned null; skipping game', { studentId: sid, gameUrl: String(game?.url || ''), ply, san: String(mv?.san || ''), from: String(mv?.from || ''), to: String(mv?.to || '') });
              break;
            }

            if (turn !== studentColor) continue; // only student's moves
            pliesProcessed++;
            if (pliesProcessed % 6 === 0) {
              blundersSyncState.set(sid, {
                ...(blundersSyncState.get(sid) || {}),
                pliesProcessed,
                blundersAdded: added,
                updatedAt: new Date().toISOString()
              });
            }

            const afterFen = replay.fen();
            // Evaluate best at beforeFen (student to move)
            const best = await sfEvalFen(beforeFen, 16);
            const bestMove = String(best.bestMove || '');
            const bestCp = scoreToCp(best.score);
            // Evaluate afterFen (opponent to move), invert to student's POV
            const after = await sfEvalFen(afterFen, 16);
            const userCp = -scoreToCp(after.score);
            const v = blundersVerdictFromScores(bestCp, userCp, thresholdPoints);
            const dropCp = v.dropCp;
            const dropPoints = v.dropPoints;
            if (v.verdict !== 'blunder') continue;

            // Guard: if Stockfish says the played move is the best move, never record it as a blunder.
            // This also fixes weird mate cases where bestCp is "mate" but after-score parsing fails.
            const playedUci = `${String(mv.from || '').toLowerCase()}${String(mv.to || '').toLowerCase()}${mv.promotion ? String(mv.promotion).toLowerCase() : ''}`;
            if (playedUci && bestMove && playedUci === String(bestMove || '').trim().toLowerCase()) continue;

            const key = `${orgId}|${sid}|${String(game.url || game.uuid || '')}|${ply}`;
            if (existingKeys.has(key)) continue;
            existingKeys.add(key);

            const puzzleObj = {
              id: `bl_${Date.now()}_${Math.random().toString(16).slice(2)}`,
              key,
              orgId,
              studentId: sid,
              chessComUsername: username,
              gameUrl: String(game.url || ''),
              timeClass: String(game.time_class || ''),
              endTime: Number(game.end_time || 0),
              studentColor,
              startFEN: beforeFen,
              opponentMoveUci: prev ? `${String(prev.from || '').toLowerCase()}${String(prev.to || '').toLowerCase()}${prev.promotion ? String(prev.promotion).toLowerCase() : ''}` : '',
              opponentSan: prev ? String(prev.san || '') : '',
              blunderMoveUci: playedUci,
              blunderSan: String(mv.san || ''),
              bestMoveUci: bestMove,
              bestCp,
              afterCp: userCp,
              dropCp,
              dropPoints,
              status: 'pending',
              createdAt: new Date().toISOString(),
              attempts: []
            };
            newPuzzles.push(puzzleObj);
            added++;
          }

          if (gameFailed) {
            errors++;
            blundersSyncState.set(sid, {
              ...(blundersSyncState.get(sid) || {}),
              lastError: gameFailReason,
              errors,
              updatedAt: new Date().toISOString()
            });
            // Skip this game (do NOT mark as analyzed; allow retry in future).
            continue;
          }

          // Per-game meta (best-effort): opponent rating + ply count.
          // Only record after a successful replay (prevents skipping forever due to one bad PGN move).
          try {
            if (stStats) {
              const keyGame = String(game.url || game.uuid || '').trim();
              if (keyGame) {
                const oppRatingRaw =
                  studentColor === 'w' ? Number(game?.black?.rating) :
                  studentColor === 'b' ? Number(game?.white?.rating) : NaN;
                const oppRating = Number.isFinite(oppRatingRaw) && oppRatingRaw > 0 ? oppRatingRaw : null;
                stStats.analyzed[keyGame] = {
                  ...(stStats.analyzed[keyGame] || {}),
                  url: String(game?.url || ''),
                  uuid: String(game?.uuid || ''),
                  endTime: Number(game?.end_time || 0),
                  timeClass: String(game?.time_class || ''),
                  plyCount: Array.isArray(moves) ? moves.length : 0,
                  opponentRating: oppRating
                };
              }
            }
          } catch {}

          gamesProcessed++;
          blundersSyncState.set(sid, {
            ...(blundersSyncState.get(sid) || {}),
            gamesProcessed,
            pliesProcessed,
            blundersAdded: added,
            errors,
            updatedAt: new Date().toISOString()
          });

          // Improvement #1: Flush puzzles incrementally so users can see new puzzles sooner.
          // Rate-limit file writes to avoid excessive IO.
          const now = Date.now();
          if (added > flushedAdded && (now - lastFlushAtMs) > 1500) {
            try {
              const batch = newPuzzles.slice(flushedAdded);
              await appendBlundersPuzzlesPreserveProgress(batch, orgId, sid);
              flushedAdded = added;
              lastFlushAtMs = now;
            } catch (err) {
              errors++;
              blundersSyncState.set(sid, {
                ...(blundersSyncState.get(sid) || {}),
                lastError: `writeBlundersPuzzles failed: ${String(err?.message || err || 'unknown')}`,
                errors,
                updatedAt: new Date().toISOString()
              });
            }
          }
        }

        // Persist analyzed games meta (best-effort)
        try {
          if (statsOrgs && statsOrg && stStats) {
            stStats.analyzedCount = Object.keys(stStats.analyzed || {}).length;
            stStats.lastSyncAt = new Date().toISOString();
            statsOrg[sid] = stStats;
            statsOrgs[orgId] = statsOrg;
            await writeBlundersStats(statsOrgs);
          }
        } catch {}

        // Final flush: append any remaining new puzzles without overwriting existing progress.
        if (added > flushedAdded) {
          try {
            const batch = newPuzzles.slice(flushedAdded);
            await appendBlundersPuzzlesPreserveProgress(batch, orgId, sid);
          } catch {}
        }
        return { ok: true, games: gamesAll.length, added, gamesProcessed, pliesProcessed, hkDayKey, maxGamesPerDay, thresholdPoints };
      })().finally(() => {
        blundersStudentLocks.delete(sid);
        const st = blundersSyncState.get(sid) || {};
        blundersSyncState.set(sid, {
          ...st,
          running: false,
          stage: 'done',
          updatedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString()
        });
      });

      blundersStudentLocks.set(sid, task);
      return task.catch((e) => {
        const msg = String(e?.message || e);
        const st = blundersSyncState.get(sid) || {};
        blundersSyncState.set(sid, {
          ...st,
          running: false,
          stage: 'error',
          lastError: msg,
          updatedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString()
        });
        throw e;
      });
    }

    async function syncBlundersForMaster(orgId, master, opts = {}) {
      const oid = String(orgId || '');
      const mid = String(master?.id || '');
      const username = String(master?.username || '').trim();
      if (!oid || !mid || !username) return { ok: false, reason: 'missing org/master/username' };

      const bypassThrottle = String(opts.force || '') === '1';
      const mode = String(opts.mode || '').trim().toLowerCase();
      const historyGames = Math.max(1, Math.min(500, Number(opts.historyGames || 0) || 0));
      const hkDayKey = (mode === 'history' && historyGames) ? '' : (normalizeHkDayKey(opts.hkDayKey) || todayHkKey());
      const lockKey = (mode === 'history' && historyGames) ? `master:${oid}:${mid}:history` : `master:${oid}:${mid}:${hkDayKey}`;

      const now = Date.now();
      if (mode === 'history' && historyGames) {
        const lastH = blundersLastMasterHistoryScan.get(lockKey) || 0;
        if (!bypassThrottle && now - lastH < 10 * 60 * 1000) {
          return { ok: true, skipped: true, reason: 'throttled_history', lastRunAtMs: lastH };
        }
      } else {
        const last = blundersLastMasterSync.get(lockKey) || 0;
        if (!bypassThrottle && now - last < 30 * 60 * 1000) {
          return { ok: true, skipped: true, reason: 'throttled', lastRunAtMs: last };
        }
      }

      if (blundersMasterLocks.has(lockKey)) return blundersMasterLocks.get(lockKey);

      const task = (async () => {
        if (mode === 'history' && historyGames) blundersLastMasterHistoryScan.set(lockKey, now);
        else blundersLastMasterSync.set(lockKey, now);
        const stKey = `master:${mid}`;
        blundersSyncState.set(stKey, {
          running: true,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          finishedAt: null,
          stage: 'init',
          gamesFetched: 0,
          gamesProcessed: 0,
          pliesProcessed: 0,
          blundersAdded: 0,
          lastError: null
        });

        const cfg = await getMasterBlundersConfig(oid);
        const maxGamesPerDay = Math.max(1, Math.min(50, Number(opts.maxGamesPerDay ?? cfg.maxGamesPerDay) || cfg.maxGamesPerDay));
        const thresholdPoints = Math.max(0.1, Math.min(10, Number(opts.thresholdPoints ?? cfg.thresholdPoints) || cfg.thresholdPoints));

        // Best-effort: fetch master's current Chess.com rating once per run for auto classification.
        // (We store it on each generated puzzle so Teacher All blunders can bucket/filter it later.)
        let masterRating = null;
        let masterRatingSource = null;
        let masterRatingUpdatedAt = null;
        try {
          const resp = await fetchChessComStats(username);
          if (resp?.ok) {
            const picked = pickChessComRating(resp.data);
            masterRating = (picked && Number.isFinite(Number(picked.rating)) && Number(picked.rating) > 0) ? Number(picked.rating) : null;
            masterRatingSource = picked?.source || null;
            masterRatingUpdatedAt = new Date().toISOString();
          }
        } catch {}

        blundersSyncState.set(stKey, { ...(blundersSyncState.get(stKey) || {}), stage: 'fetch-games', updatedAt: new Date().toISOString() });
        let gamesAll = [];
        let historyTargetNew = 0;
        let historyFetchLimit = 0;

        const puzzles = await readBlundersPuzzles();
        const existingKeys = new Set(puzzles.map((p) => String(p.key || '')).filter(Boolean));
        // Skip already analyzed master games by game URL/UUID (best-effort).
        const analyzedGameIds = new Set(
          puzzles
            .filter(p => String(p?.orgId || '') === oid && String(p?.scope || '') === 'master' && String(p?.masterId || '') === mid)
            .map(p => String(p?.gameUrl || p?.gameUUID || p?.gameUuid || p?.gameId || '').trim())
            .filter(Boolean)
        );

        if (mode === 'history' && historyGames) {
          historyTargetNew = Math.max(1, Math.min(500, Number(historyGames || 0) || 0));
          const maxFetch = Math.max(historyTargetNew, Math.min(5000, historyTargetNew * 20));
          let limit = Math.min(maxFetch, historyTargetNew);
          for (let iter = 0; iter < 10; iter++) {
            gamesAll = await chessComGetRecentGames(username, { limit });
            historyFetchLimit = limit;
            const newCount = Array.isArray(gamesAll)
              ? gamesAll.filter((g) => {
                const k = String(g?.url || g?.uuid || '').trim();
                if (!k) return true;
                return !analyzedGameIds.has(k);
              }).length
              : 0;
            if (newCount >= historyTargetNew) break;
            if (!Array.isArray(gamesAll) || gamesAll.length < limit) break;
            if (limit >= maxFetch) break;
            const nextLimit = Math.min(maxFetch, Math.max(limit + historyTargetNew, Math.floor(limit * 1.5)));
            if (nextLimit <= limit) break;
            limit = nextLimit;
          }
        } else {
          gamesAll = await chessComGetGamesForHkDay(username, { hkDayKey, limit: maxGamesPerDay });
        }

        gamesAll = Array.isArray(gamesAll) ? gamesAll : [];
        blundersSyncState.set(stKey, {
          ...(blundersSyncState.get(stKey) || {}),
          gamesFetched: gamesAll.length,
          stage: 'analyze',
          updatedAt: new Date().toISOString(),
          history: (mode === 'history' && historyGames) ? { targetNew: historyTargetNew, fetchLimit: historyFetchLimit } : null
        });
        if (!gamesAll.length) return { ok: true, games: 0, added: 0 };

        // Skip games already analyzed (avoid re-running Stockfish on the same games).
        let games = gamesAll.filter((g) => {
          const k = String(g?.url || g?.uuid || '').trim();
          if (!k) return true;
          return !analyzedGameIds.has(k);
        });
        if (mode === 'history' && historyGames) games = games.slice(0, historyTargetNew || historyGames);
        let added = 0;
        let gamesProcessed = 0;
        let pliesProcessed = 0;
        let errors = 0;
        let lastFlushAtMs = 0;
        let flushedAdded = 0;

        for (const game of games) {
          const pgn = String(game.pgn || '');
          if (!pgn) continue;
          // Defensive: if a duplicate slipped through, skip it.
          const gameIdentifier = String(game?.url || game?.uuid || '').trim();
          if (gameIdentifier && analyzedGameIds.has(gameIdentifier)) { gamesProcessed++; continue; }
          const me = username.toLowerCase();
          const whiteU = String(game?.white?.username || '').toLowerCase();
          const blackU = String(game?.black?.username || '').toLowerCase();
          const masterColor = whiteU === me ? 'w' : (blackU === me ? 'b' : '');
          if (!masterColor) continue;

          let full = null;
          try {
            full = new Chess();
            full.loadPgn(pgn, { sloppy: true });
          } catch {
            full = null;
          }
          if (!full) continue;
          const moves = full.history({ verbose: true }) || [];
          const replay = new Chess();
          let gameFailed = false;
          let gameFailReason = '';
          for (let ply = 0; ply < moves.length; ply++) {
            const beforeFen = replay.fen();
            const turn = replay.turn();
            const mv = moves[ply];
            const prev = ply > 0 ? moves[ply - 1] : null;
            let applied = null;
            try {
              applied = replay.move({
                from: String(mv?.from || '').toLowerCase(),
                to: String(mv?.to || '').toLowerCase(),
                promotion: mv?.promotion ? String(mv.promotion).toLowerCase() : undefined
              });
            } catch (err) {
              gameFailed = true;
              gameFailReason = `Invalid move (exception) at ply ${ply}: ${String(err?.message || err || 'unknown')}`;
              console.warn('Blunders(master): invalid move exception; skipping game', { masterId: mid, gameUrl: String(game?.url || ''), ply, san: String(mv?.san || ''), from: String(mv?.from || ''), to: String(mv?.to || '') });
              break;
            }
            if (!applied) {
              gameFailed = true;
              gameFailReason = `Invalid move (null) at ply ${ply}: san=${String(mv?.san || '')} from=${String(mv?.from || '')} to=${String(mv?.to || '')}`;
              console.warn('Blunders(master): invalid move returned null; skipping game', { masterId: mid, gameUrl: String(game?.url || ''), ply, san: String(mv?.san || ''), from: String(mv?.from || ''), to: String(mv?.to || '') });
              break;
            }

            if (turn !== masterColor) continue; // only master's moves
            pliesProcessed++;
            if (pliesProcessed % 6 === 0) {
              blundersSyncState.set(stKey, {
                ...(blundersSyncState.get(stKey) || {}),
                pliesProcessed,
                blundersAdded: added,
                updatedAt: new Date().toISOString()
              });
            }

            const afterFen = replay.fen();
            const best = await sfEvalFen(beforeFen, 16);
            const bestMove = String(best.bestMove || '');
            const bestCp = scoreToCp(best.score);
            const after = await sfEvalFen(afterFen, 16);
            const userCp = -scoreToCp(after.score);
            const v = blundersVerdictFromScores(bestCp, userCp, thresholdPoints);
            const dropCp = v.dropCp;
            const dropPoints = v.dropPoints;
            if (v.verdict !== 'blunder') continue;

            const playedUci = `${String(mv.from || '').toLowerCase()}${String(mv.to || '').toLowerCase()}${mv.promotion ? String(mv.promotion).toLowerCase() : ''}`;
            if (playedUci && bestMove && playedUci === String(bestMove || '').trim().toLowerCase()) continue;

            const key = `${oid}|master|${mid}|${String(game.url || game.uuid || '')}|${ply}`;
            if (existingKeys.has(key)) continue;
            existingKeys.add(key);

            puzzles.push({
              id: `bm_${Date.now()}_${Math.random().toString(16).slice(2)}`,
              key,
              scope: 'master',
              orgId: oid,
              masterId: mid,
              masterName: String(master?.name || ''),
              chessComUsername: username,
              masterChessComRating: masterRating,
              masterChessComRatingSource: masterRatingSource,
              masterChessComRatingUpdatedAt: masterRatingUpdatedAt,
              gameUrl: String(game.url || ''),
              timeClass: String(game.time_class || ''),
              endTime: Number(game.end_time || 0),
              playerColor: masterColor,
              startFEN: beforeFen,
              opponentMoveUci: prev ? `${String(prev.from || '').toLowerCase()}${String(prev.to || '').toLowerCase()}${prev.promotion ? String(prev.promotion).toLowerCase() : ''}` : '',
              opponentSan: prev ? String(prev.san || '') : '',
              blunderMoveUci: playedUci,
              blunderSan: String(mv.san || ''),
              bestMoveUci: bestMove,
              bestCp,
              afterCp: userCp,
              dropCp,
              dropPoints,
              createdAt: new Date().toISOString()
            });
            added++;
          }

          if (gameFailed) {
            errors++;
            blundersSyncState.set(stKey, {
              ...(blundersSyncState.get(stKey) || {}),
              lastError: gameFailReason,
              errors,
              updatedAt: new Date().toISOString()
            });
            continue;
          }

          gamesProcessed++;
          blundersSyncState.set(stKey, {
            ...(blundersSyncState.get(stKey) || {}),
            gamesProcessed,
            pliesProcessed,
            blundersAdded: added,
            errors,
            updatedAt: new Date().toISOString()
          });

          // Incremental flush to make puzzles visible sooner; rate-limited.
          const now = Date.now();
          if (added > flushedAdded && (now - lastFlushAtMs) > 1500) {
            try {
              await writeBlundersPuzzles(puzzles);
              flushedAdded = added;
              lastFlushAtMs = now;
            } catch (err) {
              errors++;
              blundersSyncState.set(stKey, {
                ...(blundersSyncState.get(stKey) || {}),
                lastError: `writeBlundersPuzzles failed: ${String(err?.message || err || 'unknown')}`,
                errors,
                updatedAt: new Date().toISOString()
              });
            }
          }
        }

        if (added) await writeBlundersPuzzles(puzzles);
        return { ok: true, games: games.length, added, gamesProcessed, pliesProcessed, hkDayKey, maxGamesPerDay, thresholdPoints };
      })().finally(() => {
        blundersMasterLocks.delete(lockKey);
        const stKey = `master:${String(master?.id || '')}`;
        const st = blundersSyncState.get(stKey) || {};
        blundersSyncState.set(stKey, {
          ...st,
          running: false,
          stage: 'done',
          updatedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString()
        });
      });

      blundersMasterLocks.set(lockKey, task);
      return task.catch((e) => {
        const msg = String(e?.message || e);
        const stKey = `master:${String(master?.id || '')}`;
        const st = blundersSyncState.get(stKey) || {};
        blundersSyncState.set(stKey, {
          ...st,
          running: false,
          stage: 'error',
          lastError: msg,
          updatedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString()
        });
        throw e;
      });
    }

    return { syncBlundersForStudent, syncBlundersForMaster };
  }
}

module.exports = { createBlundersSync };


