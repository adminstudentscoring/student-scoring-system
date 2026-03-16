// Attempt recording and statistics routes extracted from tacticsFighterRoutes.js
// Handles: public attempt logger, teacher read attempts, public student stats,
// public student puzzle attempt
"use strict";

function registerTacticsFighterAttemptsRoutes(app, deps, shared) {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const readData = deps?.readData;
  const filterStudentsByOrganization = deps?.filterStudentsByOrganization;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;

  const {
    safeJsonParse, nowIso, toCleanString, toRangeInt, ensureParentDir,
    parseUci, normalizeScore,
    getTfSettings, requireDbReady, requirePublicStudent, normalizeBucket,
    parseAcceptedLinesFromSolutions, prefixMatches, resolveOrgId,
    pool, hasDb,
    fsPromises, path, TACTICS_FIGHTER_ATTEMPTS_FILE
  } = shared;

  // Public: minimal attempt logger (file-based analytics/debug)
  app.post("/api/tactics-fighter/attempts", async (req, res) => {
    try {
      if (!fsPromises || !path) return res.json({ ok: true });
      const studentId = toCleanString(req?.body?.studentId || "", 200);
      if (!studentId) return res.status(400).json({ ok: false, error: "Missing studentId" });

      if (typeof readData === "function") {
        const data = await readData().catch(() => null);
        const students = Array.isArray(data?.students) ? data.students : [];
        const exists = students.some((s) => String(s?.id || "") === studentId);
        if (!exists) return res.status(404).json({ ok: false, error: "Student not found" });
      }

      const entry = {
        ts: nowIso(),
        studentId,
        puzzleId: toCleanString(req?.body?.puzzleId || "", 200),
        answer: toCleanString(req?.body?.answer || "", 2000),
        correct: req?.body?.correct === true,
        meta: req?.body?.meta && typeof req.body.meta === "object" ? req.body.meta : undefined,
        ua: toCleanString(req.get("user-agent") || "", 500),
        ip: toCleanString(req.ip || "", 200)
      };

      if (TACTICS_FIGHTER_ATTEMPTS_FILE) {
        await ensureParentDir(fsPromises, path, TACTICS_FIGHTER_ATTEMPTS_FILE);
        await fsPromises.appendFile(TACTICS_FIGHTER_ATTEMPTS_FILE, JSON.stringify(entry) + "\n", "utf8");
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("[tactics-fighter] log attempt error:", e);
      return res.status(500).json({ ok: false, error: "Failed to log attempt" });
    }
  });

  // Teacher: read attempts (simple file scan)
  if (authenticateUser && authorizeRole && requireOrganizationAccess && resolveOrgIdFromUser) {
    app.get(
      "/api/teachers/tactics-fighter/attempts",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!fsPromises || !path || !TACTICS_FIGHTER_ATTEMPTS_FILE) return res.json({ ok: true, attempts: [] });

          const orgId = await resolveOrgId(req);
          const studentId = toCleanString(req.query?.studentId || "", 200);

          if (studentId && orgId && typeof filterStudentsByOrganization === "function" && typeof readData === "function") {
            const data = await readData().catch(() => null);
            const students = Array.isArray(data?.students) ? data.students : [];
            const orgStudents = filterStudentsByOrganization(students, orgId);
            const ok = orgStudents.some((s) => String(s?.id || "") === studentId);
            if (!ok) return res.status(403).json({ ok: false, error: "Student not in organization" });
          }

          const text = await fsPromises.readFile(TACTICS_FIGHTER_ATTEMPTS_FILE, "utf8").catch(() => "");
          const lines = String(text || "").split("\n").filter(Boolean);

          const tail = lines.slice(Math.max(0, lines.length - 2000));
          const parsed = tail
            .map((l) => safeJsonParse(l))
            .filter(Boolean)
            .filter((a) => (studentId ? String(a.studentId || "") === studentId : true));

          return res.json({ ok: true, attempts: parsed.slice(-500) });
        } catch (e) {
          console.error("[tactics-fighter] teacher attempts error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load attempts" });
        }
      }
    );
  }

  // ===== Public Student: Stats (Home) =====
  app.get('/api/public/students/:id/tactics-fighter/stats', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const orgId = ctx.orgId;
      const studentId = ctx.studentId;
      const bucket = normalizeBucket(req.query?.bucket || '');

      const useBucket = !!String(req.query?.bucket || '').trim();
      if (!useBucket) {
        const r = await pool.query(
          `SELECT COUNT(*)::int AS cnt
           FROM tactics_fighter_student_progress
           WHERE org_id = $1 AND student_id = $2 AND status = 'completed'`,
          [orgId, studentId]
        );
        return res.json({ ok: true, completedCount: Number(r.rows?.[0]?.cnt || 0) });
      }

      const r = await pool.query(
        `
        SELECT COUNT(*)::int AS cnt
        FROM tactics_fighter_student_progress p
        JOIN tactics_fighter_puzzles z ON z.id = p.puzzle_id AND z.org_id = p.org_id
        JOIN tactics_fighter_subtopics s ON s.id = z.subtopic_id AND s.org_id = z.org_id
        JOIN tactics_fighter_topics t ON t.id = s.topic_id AND t.org_id = s.org_id
        JOIN tactics_fighter_categories c ON c.id = t.category_id AND c.org_id = t.org_id
        WHERE p.org_id = $1 AND p.student_id = $2 AND p.status = 'completed' AND c.bucket = $3
        `,
        [orgId, studentId, bucket]
      );
      return res.json({ ok: true, bucket, completedCount: Number(r.rows?.[0]?.cnt || 0) });
    } catch (e) {
      console.error('[tactics-fighter] public stats error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to load stats' });
    }
  });

  app.post('/api/public/students/:id/tactics-fighter/puzzles/:puzzleId/attempt', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const orgId = ctx.orgId;
      const studentId = ctx.studentId;
      const bucket = normalizeBucket(req.body?.bucket || req.query?.bucket || 'beginner');
      const puzzleId = toRangeInt(req.params?.puzzleId, 1, 9_000_000_000_000, 0);
      if (!puzzleId) return res.status(400).json({ ok: false, error: 'Invalid puzzleId' });

      const movesUciRaw = Array.isArray(req.body?.movesUci) ? req.body.movesUci : [];
      const movesUci = movesUciRaw.map((m) => String(m || '').trim().toLowerCase()).filter(Boolean);
      const plyIndex = Number.isFinite(Number(req.body?.plyIndex)) ? Number(req.body.plyIndex) : (movesUci.length ? movesUci.length - 1 : null);
      const moveUci = String(req.body?.moveUci || (movesUci.length ? movesUci[movesUci.length - 1] : '') || '').trim().toLowerCase();
      const subtopicId = req.body?.subtopicId ? toRangeInt(req.body.subtopicId, 1, 1_000_000_000, 0) : null;
      const mode = String(req.body?.mode || '').trim().toLowerCase();

      const pRes = await pool.query(
        `SELECT id, subtopic_id, fen, pv_plies, solutions FROM tactics_fighter_puzzles WHERE org_id = $1 AND id = $2 LIMIT 1`,
        [orgId, puzzleId]
      );
      if (!pRes.rows.length) return res.status(404).json({ ok: false, error: 'Puzzle not found' });

      const puzzle = pRes.rows[0];
      const accepted = parseAcceptedLinesFromSolutions(puzzle.solutions);
      const targetPlies = (() => {
        const pv = Number(puzzle?.pv_plies || 0);
        if (Number.isFinite(pv) && pv > 0) return Math.max(1, Math.min(64, Math.trunc(pv)));
        let maxLen = 0;
        for (const ln of accepted) maxLen = Math.max(maxLen, Array.isArray(ln) ? ln.length : 0);
        return Math.max(1, Math.min(64, maxLen || 8));
      })();

      let correctPrefix = false;
      let completed = false;
      let chosenLine = null;
      let matchCount = 0;
      let engineAccepted = false;
      let engineAcceptance = null;

      for (let i = 0; i < accepted.length; i++) {
        const line = accepted[i];
        if (!prefixMatches(line, movesUci)) continue;
        correctPrefix = true;
        matchCount++;
        if (chosenLine === null) chosenLine = i;
        if (movesUci.length === line.length) {
          completed = true;
          chosenLine = i;
          break;
        }
      }

      if (!correctPrefix && sfAnalyzeFen && Chess && movesUci.length) {
        try {
          const lastIdx = movesUci.length - 1;
          const studentMoveIdx = (lastIdx % 2 === 0) ? lastIdx : (lastIdx - 1);
          const studentMoveUci = movesUci[studentMoveIdx];
          if (studentMoveIdx >= 0 && studentMoveUci) {
            const ch = new Chess(String(puzzle.fen || ''));
            for (let i = 0; i < studentMoveIdx; i++) {
              const mv0 = parseUci(movesUci[i]);
              if (!mv0) throw new Error('Invalid UCI in history');
              const ok0 = ch.move({ from: mv0.from, to: mv0.to, promotion: mv0.promotion });
              if (!ok0) throw new Error('Illegal UCI in history');
            }
            const fenBefore = String(ch.fen() || '');

            const mvS = parseUci(studentMoveUci);
            if (!mvS) throw new Error('Invalid UCI');
            const okS = ch.move({ from: mvS.from, to: mvS.to, promotion: mvS.promotion });
            if (!okS) throw new Error('Illegal move');
            const fenAfterStudent = String(ch.fen() || '');

            const settings = await getTfSettings(orgId);
            const depth = toRangeInt(settings.stockfishDepthCap, 4, 22, 14);

            const best = await sfAnalyzeFen(fenBefore, { depth, multiPv: 1, pvPlies: 6 });
            const bestLine = Array.isArray(best?.lines) ? best.lines[0] : null;
            const bestMove = String(best?.bestMove || bestLine?.bestMove || '').trim().toLowerCase();
            const bestScore = normalizeScore(bestLine?.score);

            const after = await sfAnalyzeFen(fenAfterStudent, { depth, multiPv: 1, pvPlies: 6 });
            const afterLine = Array.isArray(after?.lines) ? after.lines[0] : null;
            const afterScoreRaw = normalizeScore(afterLine?.score);
            const userScore =
              Object.prototype.hasOwnProperty.call(afterScoreRaw, 'mate')
                ? { mate: -Number(afterScoreRaw.mate || 0) }
                : { cp: -Number(afterScoreRaw.cp || 0) };

            const sameBestMove = bestMove && (bestMove === String(studentMoveUci).trim().toLowerCase());

            let acceptedByEval = false;
            if (Object.prototype.hasOwnProperty.call(bestScore, 'mate')) {
              const bm = Number(bestScore.mate || 0);
              const um = Object.prototype.hasOwnProperty.call(userScore, 'mate') ? Number(userScore.mate || 0) : null;
              acceptedByEval = (um !== null) && (um === bm);
            } else {
              const bcp = Number(bestScore.cp || 0);
              const ucp = Object.prototype.hasOwnProperty.call(userScore, 'cp') ? Number(userScore.cp || 0) : null;
              if (ucp !== null) {
                const tol = Math.abs(bcp) * 0.05;
                acceptedByEval = ucp >= (bcp - tol);
              }
            }

            if (sameBestMove || acceptedByEval) {
              correctPrefix = true;
              engineAccepted = true;
              engineAcceptance = {
                depth,
                sameBestMove,
                bestMove: bestMove || null,
                bestScore,
                userScore
              };

              if (movesUci.length >= targetPlies) {
                completed = true;
              }
            }
          }
        } catch (e) {
          console.warn('[tactics-fighter] near-correct eval skipped:', e?.message || e);
        }
      }

      await pool.query(
        `
        INSERT INTO tactics_fighter_student_attempts
          (org_id, student_id, bucket, subtopic_id, puzzle_id, moves_uci, move_uci, ply_index, correct_prefix, completed, chosen_line, meta)
        VALUES
          ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)
        `,
        [
          orgId,
          studentId,
          bucket,
          (subtopicId || Number(puzzle.subtopic_id) || null),
          puzzleId,
          JSON.stringify(movesUci),
          moveUci || null,
          (plyIndex === null ? null : Math.trunc(plyIndex)),
          !!correctPrefix,
          !!completed,
          (chosenLine === null ? null : Math.trunc(chosenLine)),
          JSON.stringify({
            ua: toCleanString(req.get('user-agent') || '', 500),
            ip: toCleanString(req.ip || '', 200),
            mode: mode || null,
            engineAccepted: engineAccepted || false,
            engineAcceptance: engineAcceptance || null
          })
        ]
      );

      await pool.query(
        `
        INSERT INTO tactics_fighter_student_progress
          (org_id, student_id, puzzle_id, status, completed_at, last_attempt_at, attempts_count, wrong_count)
        VALUES
          ($1, $2, $3, $4, $5, NOW(), 1, $6)
        ON CONFLICT (org_id, student_id, puzzle_id) DO UPDATE SET
          status = CASE WHEN EXCLUDED.status = 'completed' THEN 'completed' ELSE tactics_fighter_student_progress.status END,
          completed_at = CASE WHEN EXCLUDED.status = 'completed' THEN COALESCE(tactics_fighter_student_progress.completed_at, EXCLUDED.completed_at) ELSE tactics_fighter_student_progress.completed_at END,
          last_attempt_at = NOW(),
          attempts_count = tactics_fighter_student_progress.attempts_count + 1,
          wrong_count = tactics_fighter_student_progress.wrong_count + EXCLUDED.wrong_count
        `,
        [
          orgId,
          studentId,
          puzzleId,
          completed ? 'completed' : 'in_progress',
          completed ? new Date().toISOString() : null,
          correctPrefix ? 0 : 1
        ]
      );

      if (completed && mode === 'ghost') {
        try {
          await pool.query(
            `
            UPDATE tactics_fighter_student_progress
            SET meta = jsonb_set(
              COALESCE(meta, '{}'::jsonb),
              '{ghostReplays}',
              to_jsonb(COALESCE((meta->>'ghostReplays')::int, 0) + 1),
              true
            )
            WHERE org_id = $1 AND student_id = $2 AND puzzle_id = $3
            `,
            [orgId, studentId, puzzleId]
          );
        } catch (e) {
          console.warn('[tactics-fighter] ghostReplays update failed:', e?.message || e);
        }
      }

      return res.json({
        ok: true,
        puzzleId: String(puzzleId),
        correctPrefix,
        completed,
        matches: matchCount,
        chosenLine,
        engineAccepted
      });
    } catch (e) {
      console.error('[tactics-fighter] public attempt error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to record attempt' });
    }
  });
}

module.exports = { registerTacticsFighterAttemptsRoutes };
