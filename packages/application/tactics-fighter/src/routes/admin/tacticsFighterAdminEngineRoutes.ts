// Tactics Fighter teacher engine analyze routes
"use strict";

function registerTacticsFighterAdminEngineRoutes(app: any, deps: any, shared: any): void {
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

  // ===== Teacher: Engine analyze (MultiPV + PV length) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess && sfAnalyzeFen && Chess) {
    app.post(
      "/api/teachers/tactics-fighter/engine/analyze",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          const fen = toCleanString(req?.body?.fen || "", 2000);
          if (!fen) return res.status(400).json({ ok: false, error: "Missing fen" });

          try { new Chess(fen); } catch { return res.status(400).json({ ok: false, error: "Invalid FEN" }); }

          const orgId = await resolveOrgId(req).catch(() => null);
          const settings = await getTfSettings(orgId);
          const cap = toRangeInt(settings.stockfishDepthCap, 4, 22, 14);
          const depth = toRangeInt(req?.body?.depth, 4, cap, Math.min(16, cap));
          const multipv = toRangeInt(req?.body?.multipv, 1, 10, 1);
          const pvPlies = toRangeInt(req?.body?.pvPlies, 1, 32, 8);

          const r = await sfAnalyzeFen(fen, { depth, multiPv: multipv, pvPlies });
          const lines = Array.isArray(r?.lines) ? r.lines : [];

          const withSan = lines.map((ln) => {
            const pvUci = Array.isArray(ln?.pv) ? ln.pv : [];
            const pvSan = [];
            try {
              const ch = new Chess(fen);
              for (const u of pvUci) {
                const mv = parseUci(u);
                if (!mv) break;
                const out = ch.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
                if (!out) break;
                pvSan.push(String(out.san || ''));
              }
            } catch {}
            return {
              multiPv: Number(ln?.multiPv || 1),
              score: normalizeScore(ln?.score),
              bestMove: ln?.bestMove ? String(ln.bestMove) : null,
              pvUci,
              pvSan
            };
          });

          return res.json({
            ok: true,
            fen,
            depth,
            multipv,
            pvPlies,
            bestMove: r?.bestMove ? String(r.bestMove) : null,
            lines: withSan
          });
        } catch (e) {
          console.error('[tactics-fighter] analyze error:', e);
          return res.status(500).json({ ok: false, error: "Engine analyze failed" });
        }
      }
    );
  }
}

module.exports = { registerTacticsFighterAdminEngineRoutes };
export {};
