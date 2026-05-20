// Master blunders sync (extracted from sync.ts).
// Do NOT add "use strict" to createBlundersSync parent.

function createMasterSync(d) {
async function syncBlundersForMaster(orgId: any, master: any, opts: any = {}) {
      const oid = String(orgId || '');
      const mid = String(master?.id || '');
      const username = String(master?.username || '').trim();
      if (!oid || !mid || !username) return { ok: false, reason: 'missing org/master/username' };

      const bypassThrottle = String(opts.force || '') === '1';
      const mode = String(opts.mode || '').trim().toLowerCase();
      const historyGames = Math.max(1, Math.min(500, Number(opts.historyGames || 0) || 0));
      const hkDayKey = (mode === 'history' && historyGames) ? '' : (d.normalizeHkDayKey(opts.hkDayKey) || d.todayHkKey());
      const lockKey = (mode === 'history' && historyGames) ? `master:${oid}:${mid}:history` : `master:${oid}:${mid}:${hkDayKey}`;

      const now = Date.now();
      if (mode === 'history' && historyGames) {
        const lastH = d.blundersLastMasterHistoryScan.get(lockKey) || 0;
        if (!bypassThrottle && now - lastH < 10 * 60 * 1000) {
          return { ok: true, skipped: true, reason: 'throttled_history', lastRunAtMs: lastH };
        }
      } else {
        const last = d.blundersLastMasterSync.get(lockKey) || 0;
        if (!bypassThrottle && now - last < 30 * 60 * 1000) {
          return { ok: true, skipped: true, reason: 'throttled', lastRunAtMs: last };
        }
      }

      if (d.blundersMasterLocks.has(lockKey)) return d.blundersMasterLocks.get(lockKey);

      const task = (async () => {
        if (mode === 'history' && historyGames) d.blundersLastMasterHistoryScan.set(lockKey, now);
        else d.blundersLastMasterSync.set(lockKey, now);
        const stKey = `master:${mid}`;
        d.blundersSyncState.set(stKey, {
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

        const cfg = await d.getMasterBlundersConfig(oid);
        const maxGamesPerDay = Math.max(1, Math.min(50, Number(opts.maxGamesPerDay ?? cfg.maxGamesPerDay) || cfg.maxGamesPerDay));
        const thresholdPoints = Math.max(0.1, Math.min(10, Number(opts.thresholdPoints ?? cfg.thresholdPoints) || cfg.thresholdPoints));

        // Best-effort: fetch master's current d.Chess.com rating once per run for auto classification.
        // (We store it on each generated puzzle so Teacher All blunders can bucket/filter it later.)
        let masterRating = null;
        let masterRatingSource = null;
        let masterRatingUpdatedAt = null;
        try {
          const resp = await d.fetchChessComStats(username);
          if (resp?.ok) {
            const picked = d.pickChessComRating(resp.data);
            masterRating = (picked && Number.isFinite(Number(picked.rating)) && Number(picked.rating) > 0) ? Number(picked.rating) : null;
            masterRatingSource = picked?.source || null;
            masterRatingUpdatedAt = new Date().toISOString();
          }
        } catch {}

        d.blundersSyncState.set(stKey, { ...(d.blundersSyncState.get(stKey) || {}), stage: 'fetch-games', updatedAt: new Date().toISOString() });
        let gamesAll = [];
        let historyTargetNew = 0;
        let historyFetchLimit = 0;

        const puzzles = await d.readBlundersPuzzles();
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
            gamesAll = await d.chessComGetRecentGames(username, { limit });
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
          gamesAll = await d.chessComGetGamesForHkDay(username, { hkDayKey, limit: maxGamesPerDay });
        }

        gamesAll = Array.isArray(gamesAll) ? gamesAll : [];
        d.blundersSyncState.set(stKey, {
          ...(d.blundersSyncState.get(stKey) || {}),
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
              d.blundersSyncState.set(stKey, {
                ...(d.blundersSyncState.get(stKey) || {}),
                pliesProcessed,
                blundersAdded: added,
                updatedAt: new Date().toISOString()
              });
            }

            const afterFen = replay.fen();
            const best = await d.sfEvalFen(beforeFen, 16);
            const bestMove = String(best.bestMove || '');
            const bestCp = d.scoreToCp(best.score);
            const after = await d.sfEvalFen(afterFen, 16);
            const userCp = -d.scoreToCp(after.score);
            const v = d.blundersVerdictFromScores(bestCp, userCp, thresholdPoints);
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
            d.blundersSyncState.set(stKey, {
              ...(d.blundersSyncState.get(stKey) || {}),
              lastError: gameFailReason,
              errors,
              updatedAt: new Date().toISOString()
            });
            continue;
          }

          gamesProcessed++;
          d.blundersSyncState.set(stKey, {
            ...(d.blundersSyncState.get(stKey) || {}),
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
              await d.writeBlundersPuzzles(puzzles);
              flushedAdded = added;
              lastFlushAtMs = now;
            } catch (err) {
              errors++;
              d.blundersSyncState.set(stKey, {
                ...(d.blundersSyncState.get(stKey) || {}),
                lastError: `d.writeBlundersPuzzles failed: ${String(err?.message || err || 'unknown')}`,
                errors,
                updatedAt: new Date().toISOString()
              });
            }
          }
        }

        if (added) await d.writeBlundersPuzzles(puzzles);
        return { ok: true, games: games.length, added, gamesProcessed, pliesProcessed, hkDayKey, maxGamesPerDay, thresholdPoints };
      })().finally(() => {
        d.blundersMasterLocks.delete(lockKey);
        const stKey = `master:${String(master?.id || '')}`;
        const st = d.blundersSyncState.get(stKey) || {};
        d.blundersSyncState.set(stKey, {
          ...st,
          running: false,
          stage: 'done',
          updatedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString()
        });
      });

      d.blundersMasterLocks.set(lockKey, task);
      return task.catch((e) => {
        const msg = String(e?.message || e);
        const stKey = `master:${String(master?.id || '')}`;
        const st = d.blundersSyncState.get(stKey) || {};
        d.blundersSyncState.set(stKey, {
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

  return syncBlundersForMaster;
}

module.exports = { createMasterSync };

export {};
