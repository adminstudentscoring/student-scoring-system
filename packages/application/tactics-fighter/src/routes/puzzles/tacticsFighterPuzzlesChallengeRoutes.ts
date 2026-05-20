// Tactics Fighter public challenge ghost routes
"use strict";

function registerTacticsFighterPuzzlesChallengeRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;

  const { toCleanString, toRangeInt, parseUci, normalizeScore, nowIso, parseFenSideToMove,
    getTfSettings, requireDbReady, requirePublicStudent, normalizeBucket, resolveOrgId,
    pool, hasDb } = shared;

  // ===== Public Student: Challenge - Dancing with your Ghost =====
  app.get('/api/public/students/:id/tactics-fighter/challenge/ghost', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const orgId = ctx.orgId;
      const studentId = ctx.studentId;
      const bucket = normalizeBucket(req.query?.bucket || 'beginner');
      const limit = toRangeInt(req.query?.limit, 1, 500, 120);

      const rowsRes = await pool.query(
        `
        SELECT
          z.id,
          z.fen,
          z.solutions,
          p.wrong_count,
          COALESCE((p.meta->>'ghostReplays')::int, 0) AS ghost_replays
        FROM tactics_fighter_student_progress p
        JOIN tactics_fighter_puzzles z ON z.id = p.puzzle_id AND z.org_id = p.org_id
        JOIN tactics_fighter_subtopics s ON s.id = z.subtopic_id AND s.org_id = z.org_id
        JOIN tactics_fighter_topics t ON t.id = s.topic_id AND t.org_id = s.org_id
        JOIN tactics_fighter_categories c ON c.id = t.category_id AND c.org_id = t.org_id
        WHERE
          p.org_id = $1
          AND p.student_id = $2
          AND c.bucket = $3
          AND p.wrong_count > 0
          AND COALESCE((p.meta->>'ghostReplays')::int, 0) < 3
        `,
        [orgId, studentId, bucket]
      );

      const rows = rowsRes.rows || [];
      if (!rows.length) return res.json({ ok: true, bucket, puzzles: [] });

      const g0 = [];
      const g1 = [];
      const g2 = [];
      for (const r of rows) {
        const gr = Number(r.ghost_replays || 0);
        const item = {
          id: String(r.id),
          fen: String(r.fen || ''),
          solutions: (r.solutions && typeof r.solutions === 'object') ? r.solutions : {},
          ghostReplays: Math.max(0, Math.min(2, gr))
        };
        if (gr <= 0) g0.push(item);
        else if (gr === 1) g1.push(item);
        else g2.push(item);
      }

      function shuffleInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
      }
      shuffleInPlace(g0); shuffleInPlace(g1); shuffleInPlace(g2);

      const out = [];
      while (out.length < limit && (g0.length || g1.length || g2.length)) {
        const choices = [];
        if (g0.length) choices.push({ w: 0.60, arr: g0 });
        if (g1.length) choices.push({ w: 0.30, arr: g1 });
        if (g2.length) choices.push({ w: 0.10, arr: g2 });
        const sum = choices.reduce((a, c) => a + c.w, 0);
        let r = Math.random() * (sum || 1);
        let picked = choices[choices.length - 1];
        for (const c of choices) {
          r -= c.w;
          if (r <= 0) { picked = c; break; }
        }
        const item = picked.arr.pop();
        if (item) out.push(item);
      }

      return res.json({ ok: true, bucket, puzzles: out });
    } catch (e) {
      console.error('[tactics-fighter] ghost challenge error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to load ghost puzzles' });
    }
  });
}

module.exports = { registerTacticsFighterPuzzlesChallengeRoutes };
export {};
