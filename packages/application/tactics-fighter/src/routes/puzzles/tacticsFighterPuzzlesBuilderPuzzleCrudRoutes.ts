// Tactics Fighter builder routes — puzzlecrud
"use strict";

function registerTacticsFighterPuzzlesBuilderPuzzleCrudRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;
  const { toCleanString, toRangeInt, parseUci, normalizeScore, nowIso, parseFenSideToMove,
    getTfSettings, requireDbReady, requirePublicStudent, normalizeBucket, resolveOrgId, pool, hasDb } = shared;

  if (authenticateUser && authorizeRole && requireOrganizationAccess && resolveOrgIdFromUser) {
    // Puzzles under a subtopic
    app.get(
      "/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/puzzles",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const subtopicId = String(req.params.subtopicId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(
            `SELECT id, fen, message, solutions, created_at, updated_at
             FROM (
               SELECT id, fen, message, solutions, created_at, updated_at
               FROM tactics_fighter_puzzles
               WHERE org_id = $1 AND subtopic_id = $2
               ORDER BY created_at DESC, id DESC
               LIMIT 200
             ) x
             ORDER BY x.created_at ASC, x.id ASC`,
            [orgId, subtopicId]
          );
          const puzzles = (r.rows || []).map((p) => ({
            id: String(p.id),
            fen: String(p.fen || ''),
            message: String(p.message || ''),
            solutions: p.solutions || null,
            createdAt: p.created_at ? new Date(p.created_at).toISOString() : null,
            updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : null
          }));
          return res.json({ ok: true, puzzles });
        } catch (e) {
          console.error('[tactics-fighter] list puzzles error:', e);
          return res.status(500).json({ ok: false, error: "Failed to load puzzles" });
        }
      }
    );

    app.post(
      "/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/puzzles",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const subtopicId = String(req.params.subtopicId || '').trim();
          const fen = toCleanString(req?.body?.fen || '', 2000);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!subtopicId) return res.status(400).json({ ok: false, error: "Missing subtopicId" });
          if (!fen) return res.status(400).json({ ok: false, error: "Missing fen" });

          try { new Chess(fen); } catch { return res.status(400).json({ ok: false, error: "Invalid FEN" }); }

          const side = parseFenSideToMove(fen);
          const engineDepth = toRangeInt(req?.body?.engineDepth, 4, 22, 16);
          const multipv = toRangeInt(req?.body?.multipv, 1, 10, 1);
          const pvPlies = toRangeInt(req?.body?.pvPlies, 1, 32, 8);
          const message = toCleanString(req?.body?.message || '', 2000);
          const solutions = (req?.body?.solutions && typeof req.body.solutions === 'object') ? req.body.solutions : null;
          const meta = (req?.body?.meta && typeof req.body.meta === 'object') ? req.body.meta : null;
          const createdBy = req?.user?.id ? String(req.user.id) : null;

          const r = await pool.query(
            `INSERT INTO tactics_fighter_puzzles(org_id, subtopic_id, fen, side_to_move, engine_depth, multipv, pv_plies, message, solutions, meta, created_by)
             SELECT $1, s.id, $3, $4, $5, $6, $7, $8, $9, $10, $11
             FROM tactics_fighter_subtopics s
             WHERE s.org_id = $1 AND s.id = $2
             RETURNING id, fen, message, created_at, updated_at`,
            [orgId, subtopicId, fen, side, engineDepth, multipv, pvPlies, message || null, solutions ? JSON.stringify(solutions) : null, meta ? JSON.stringify(meta) : null, createdBy]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Subtopic not found" });
          return res.json({ ok: true, puzzle: { id: String(row.id), fen: String(row.fen), message: String(row.message || ''), createdAt: new Date(row.created_at).toISOString() } });
        } catch (e) {
          console.error('[tactics-fighter] create puzzle error:', e);
          return res.status(500).json({ ok: false, error: "Create puzzle failed" });
        }
      }
    );

    app.delete(
      "/api/teachers/tactics-fighter/builder/puzzles/:puzzleId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.puzzleId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing puzzleId" });
          const r = await pool.query(
            `DELETE FROM tactics_fighter_puzzles WHERE org_id = $1 AND id = $2`,
            [orgId, id]
          );
          return res.json({ ok: true, deleted: Number(r.rowCount || 0) });
        } catch (e) {
          console.error('[tactics-fighter] delete puzzle error:', e);
          return res.status(500).json({ ok: false, error: "Delete puzzle failed" });
        }
      }
    );

    // Update puzzle (e.g., re-run engine to change PV and save new solutions)
    app.patch(
      "/api/teachers/tactics-fighter/builder/puzzles/:puzzleId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.puzzleId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing puzzleId" });

          const message = (req?.body && Object.prototype.hasOwnProperty.call(req.body, 'message'))
            ? toCleanString(req.body.message || '', 2000)
            : null;
          const solutions = (req?.body?.solutions && typeof req.body.solutions === 'object') ? req.body.solutions : null;

          const wantsMessage = message !== null;
          const wantsSolutions = !!solutions;
          if (!wantsMessage && !wantsSolutions) return res.status(400).json({ ok: false, error: "Nothing to update" });

          const engineDepth = wantsSolutions ? toRangeInt(req?.body?.engineDepth, 4, 22, 16) : null;
          const multipv = wantsSolutions ? toRangeInt(req?.body?.multipv, 1, 10, 1) : null;
          const pvPlies = wantsSolutions ? toRangeInt(req?.body?.pvPlies, 1, 32, 8) : null;

          const r = await pool.query(
            `
            UPDATE tactics_fighter_puzzles
            SET
              engine_depth = COALESCE($1, engine_depth),
              multipv = COALESCE($2, multipv),
              pv_plies = COALESCE($3, pv_plies),
              solutions = COALESCE($4::jsonb, solutions),
              message = COALESCE($5, message),
              updated_at = NOW()
            WHERE org_id = $6 AND id = $7
            RETURNING id, fen, message, solutions, engine_depth, multipv, pv_plies, updated_at
            `,
            [
              (wantsSolutions ? engineDepth : null),
              (wantsSolutions ? multipv : null),
              (wantsSolutions ? pvPlies : null),
              (wantsSolutions ? JSON.stringify(solutions) : null),
              (wantsMessage ? (message || '') : null),
              orgId,
              id
            ]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Not found" });
          return res.json({
            ok: true,
            puzzle: {
              id: String(row.id),
              fen: String(row.fen || ''),
              message: String(row.message || ''),
              solutions: row.solutions || null,
              engineDepth: Number(row.engine_depth || (engineDepth || 0) || 0),
              multipv: Number(row.multipv || (multipv || 0) || 0),
              pvPlies: Number(row.pv_plies || (pvPlies || 0) || 0),
              updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso()
            }
          });
        } catch (e) {
          console.error('[tactics-fighter] update puzzle error:', e);
          const msg = String(e?.message || e);
          return res.status(500).json({ ok: false, error: "Update puzzle failed", details: msg });
        }
      }
    );
  }
}

module.exports = { registerTacticsFighterPuzzlesBuilderPuzzleCrudRoutes };
export {};
