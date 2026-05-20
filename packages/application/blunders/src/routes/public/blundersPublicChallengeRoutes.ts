// Extracted from blundersPublicRoutes.ts — uses `with (deps)` for dependency injection.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersPublicChallengeRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
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

      let chess;
      try {
        chess = new Chess(startFen);
      } catch {
        return { ok: false, error: 'Invalid startFEN' };
      }
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

  }
}

module.exports = { registerBlundersPublicChallengeRoutes };
export {};
