// Tactics Fighter teacher apply-move routes
"use strict";

function registerTacticsFighterAdminApplyMoveRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;

  const {
    toCleanString, toRangeInt, parseUci, normalizeScore, nowIso,
    getTfSettings, upsertTfSettings, requireDbReady, resolveOrgId,
    pool, hasDb, parseFenSideToMove
  } = shared;

  // ===== Teacher: Apply move (UCI -> SAN + next FEN) =====
  if (Chess && authenticateUser && authorizeRole && requireOrganizationAccess) {
    app.post(
      '/api/teachers/tactics-fighter/apply-move',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          const fen = toCleanString(req?.body?.fen || '', 2000);
          const uci = toCleanString(req?.body?.uci || '', 50).toLowerCase();
          if (!fen) return res.status(400).json({ ok: false, error: 'Missing fen' });
          if (!uci) return res.status(400).json({ ok: false, error: 'Missing uci' });

          let ch;
          try { ch = new Chess(fen); } catch { return res.status(400).json({ ok: false, error: 'Invalid FEN' }); }

          const mv = parseUci(uci);
          if (!mv) return res.status(400).json({ ok: false, error: 'Invalid UCI' });

          const out = ch.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
          if (!out) return res.status(400).json({ ok: false, error: 'Illegal move' });

          return res.json({
            ok: true,
            uci,
            san: String(out.san || ''),
            fenAfter: String(ch.fen() || '')
          });
        } catch (e) {
          console.error('[tactics-fighter] teacher apply-move error:', e);
          return res.status(500).json({ ok: false, error: 'Failed to apply move' });
        }
      }
    );
  }
}

module.exports = { registerTacticsFighterAdminApplyMoveRoutes };
export {};
