// Extracted from blundersPublicRoutes.ts — uses `with (deps)` for dependency injection.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersPublicAttemptRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
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

module.exports = { registerBlundersPublicAttemptRoutes };
export {};
