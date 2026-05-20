// Student blunders sync (extracted from sync.ts).
// Do NOT add "use strict" to createBlundersSync parent.

function createStudentSync(d) {
async function syncBlundersForStudent(student: any, opts: any = {}) {
      const sid = String(student?.id || '');
      if (!sid) return { ok: false, reason: 'missing student id' };
      const orgId = String(student.organizationId || '');
      const hkDayKey = d.normalizeHkDayKey(opts.hkDayKey) || d.todayHkKey();
      const bypassThrottle = String(opts.force || '') === '1';
      const mode = String(opts.mode || '').trim().toLowerCase();
      const historyGames = Math.max(1, Math.min(500, Number(opts.historyGames || 0) || 0));

      // Throttle: at most once per hour per student (for GET auto-refresh)
      const now = Date.now();
      if (mode === 'history' && historyGames) {
        // History scan is heavier; throttle it lightly unless forced.
        const lastH = d.blundersLastStudentHistoryScan.get(sid) || 0;
        if (!bypassThrottle && now - lastH < 10 * 60 * 1000) return { ok: true, skipped: true, reason: 'throttled_history', lastRunAtMs: lastH };
      } else {
        const last = d.blundersLastStudentSync.get(sid) || 0;
        if (!bypassThrottle && now - last < 60 * 60 * 1000) return { ok: true, skipped: true, reason: 'throttled', lastRunAtMs: last };
      }

      if (d.blundersStudentLocks.has(sid)) return d.blundersStudentLocks.get(sid);

      const task = (async () => {
        if (mode === 'history' && historyGames) d.blundersLastStudentHistoryScan.set(sid, now);
        else d.blundersLastStudentSync.set(sid, now);
        d.blundersSyncState.set(sid, {
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

        const username = await d.getChessComUsernameForStudent(orgId, sid);
        if (!username) return { ok: false, reason: 'missing chess.com username' };

        const cfg = await d.getStudentBlundersConfig(orgId, sid);
        const maxGamesPerDay = Math.max(1, Math.min(50, Number(opts.maxGamesPerDay ?? cfg.maxGamesPerDay) || cfg.maxGamesPerDay));
        const thresholdPoints = Math.max(0.1, Math.min(10, Number(opts.thresholdPoints ?? cfg.thresholdPoints) || cfg.thresholdPoints));

        // Record analyzed games meta (cumulative) so we can compute rolling stats later.
        // We update once per sync to avoid frequent file writes.
        let statsOrgs;
        let statsOrg;
        let stStats;
        try {
          statsOrgs = await d.readBlundersStats();
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

        d.blundersSyncState.set(sid, { ...(d.blundersSyncState.get(sid) || {}), stage: 'fetch-games', updatedAt: new Date().toISOString() });
        let gamesAll = [];
        let historyTargetNew = 0;
        let historyFetchLimit = 0;
        if (mode === 'history' && historyGames) {
          historyTargetNew = Math.max(1, Math.min(500, Number(historyGames || 0) || 0));
          // Cap to avoid runaway fetch loops while still allowing "find enough new games".
          const maxFetch = Math.max(historyTargetNew, Math.min(5000, historyTargetNew * 20));
          let limit = Math.min(maxFetch, historyTargetNew);
          for (let iter = 0; iter < 10; iter++) {
            gamesAll = await d.chessComGetRecentGames(username, { studentId: sid, limit });
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
          gamesAll = await d.chessComGetGamesForHkDay(username, { studentId: sid, hkDayKey, limit: maxGamesPerDay });
        }

        gamesAll = Array.isArray(gamesAll) ? gamesAll : [];
        d.blundersSyncState.set(sid, { ...(d.blundersSyncState.get(sid) || {}), gamesFetched: gamesAll.length, stage: 'analyze', updatedAt: new Date().toISOString() });
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
          d.blundersSyncState.set(sid, {
            ...(d.blundersSyncState.get(sid) || {}),
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
        const puzzlesAtStart = await d.readBlundersPuzzles();
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
          let full;
          try {
            full = new d.Chess();
            full.loadPgn(pgn, { sloppy: true });
          } catch {
            continue;
          }
          if (!full) continue;
          const moves = full.history({ verbose: true }) || [];

          const replay = new d.Chess();
          let gameFailed = false;
          let gameFailReason = '';

          for (let ply = 0; ply < moves.length; ply++) {
            const beforeFen = replay.fen();
            const turn = replay.turn();
            const mv = moves[ply];
            const prev = ply > 0 ? moves[ply - 1] : null;

            // Apply the move as recorded.
            // IMPORTANT: chess.js move() is strict about input shape; we only pass {from,to,promotion}.
            let applied;
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
              d.blundersSyncState.set(sid, {
                ...(d.blundersSyncState.get(sid) || {}),
                pliesProcessed,
                blundersAdded: added,
                updatedAt: new Date().toISOString()
              });
            }

            const afterFen = replay.fen();
            // Evaluate best at beforeFen (student to move)
            const best = await d.sfEvalFen(beforeFen, 16);
            const bestMove = String(best.bestMove || '');
            const bestCp = d.scoreToCp(best.score);
            // Evaluate afterFen (opponent to move), invert to student's POV
            const after = await d.sfEvalFen(afterFen, 16);
            const userCp = -d.scoreToCp(after.score);
            const v = d.blundersVerdictFromScores(bestCp, userCp, thresholdPoints);
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
            d.blundersSyncState.set(sid, {
              ...(d.blundersSyncState.get(sid) || {}),
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
          d.blundersSyncState.set(sid, {
            ...(d.blundersSyncState.get(sid) || {}),
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
              await d.appendBlundersPuzzlesPreserveProgress(batch, orgId, sid);
              flushedAdded = added;
              lastFlushAtMs = now;
            } catch (err) {
              errors++;
              d.blundersSyncState.set(sid, {
                ...(d.blundersSyncState.get(sid) || {}),
                lastError: `d.writeBlundersPuzzles failed: ${String(err?.message || err || 'unknown')}`,
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
            await d.writeBlundersStats(statsOrgs);
          }
        } catch {}

        // Final flush: append any remaining new puzzles without overwriting existing progress.
        if (added > flushedAdded) {
          try {
            const batch = newPuzzles.slice(flushedAdded);
            await d.appendBlundersPuzzlesPreserveProgress(batch, orgId, sid);
          } catch {}
        }
        return { ok: true, games: gamesAll.length, added, gamesProcessed, pliesProcessed, hkDayKey, maxGamesPerDay, thresholdPoints };
      })().finally(() => {
        d.blundersStudentLocks.delete(sid);
        const st = d.blundersSyncState.get(sid) || {};
        d.blundersSyncState.set(sid, {
          ...st,
          running: false,
          stage: 'done',
          updatedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString()
        });
      });

      d.blundersStudentLocks.set(sid, task);
      return task.catch((e) => {
        const msg = String(e?.message || e);
        const st = d.blundersSyncState.get(sid) || {};
        d.blundersSyncState.set(sid, {
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

  return syncBlundersForStudent;
}

module.exports = { createStudentSync };

export {};
