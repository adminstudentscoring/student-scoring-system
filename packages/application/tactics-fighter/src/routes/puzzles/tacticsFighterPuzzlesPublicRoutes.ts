// Tactics Fighter public config + student utility routes
"use strict";

function registerTacticsFighterPuzzlesPublicRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;

  const { toCleanString, toRangeInt, parseUci, normalizeScore, nowIso, parseFenSideToMove,
    getTfSettings, requireDbReady, requirePublicStudent, normalizeBucket, resolveOrgId,
    pool, hasDb } = shared;

  // Public (used by game-window UI)
  app.get("/api/tactics-fighter/config", async (req, res) => {
    res.json({
      ok: true,
      app: "tactics-fighter",
      version: "v1",
      updatedAt: nowIso(),
      defaults: {
        stockfishDepthCap: 14
      },
      endpoints: {
        logAttempt: "/api/tactics-fighter/attempts",
        teacherAttempts: "/api/teachers/tactics-fighter/attempts",
        builderTree: "/api/teachers/tactics-fighter/builder/tree",
        engineAnalyze: "/api/teachers/tactics-fighter/engine/analyze"
      }
    });
  });

  // ===== Public Student: Settings (read-only) =====
  app.get("/api/public/students/:id/tactics-fighter/settings", async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;
      const s = await getTfSettings(ctx.orgId);
      return res.json({ ok: true, ...s });
    } catch (e) {
      console.error("[tactics-fighter] public settings get error:", e);
      return res.status(500).json({ ok: false, error: "Failed to load settings" });
    }
  });

  // ===== Public Student: Engine analyze (single best line) =====
  if (sfAnalyzeFen && Chess) {
    app.post('/api/public/students/:id/tactics-fighter/engine/analyze', async (req, res) => {
      try {
        const ctx = await requirePublicStudent(req, res);
        if (!ctx) return;
        if (!(await requireDbReady(res))) return;

        const fen = toCleanString(req?.body?.fen || '', 2000);
        if (!fen) return res.status(400).json({ ok: false, error: 'Missing fen' });

        try { new Chess(fen); } catch { return res.status(400).json({ ok: false, error: 'Invalid FEN' }); }

        const settings = await getTfSettings(ctx.orgId);
        const cap = toRangeInt(settings.stockfishDepthCap, 4, 22, 14);
        const depth = toRangeInt(req?.body?.depth, 4, cap, Math.min(12, cap));
        const pvPlies = toRangeInt(req?.body?.pvPlies, 1, 16, 6);
        const multipv = 1;

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
        console.error('[tactics-fighter] public engine analyze error:', e);
        return res.status(500).json({ ok: false, error: 'Engine analyze failed' });
      }
    });
  }

  // ===== Public Student: Apply move (UCI -> SAN + next FEN) =====
  if (Chess) {
    app.post('/api/public/students/:id/tactics-fighter/apply-move', async (req, res) => {
      try {
        const ctx = await requirePublicStudent(req, res);
        if (!ctx) return;

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
        console.error('[tactics-fighter] public apply-move error:', e);
        return res.status(500).json({ ok: false, error: 'Failed to apply move' });
      }
    });
  }
}

module.exports = { registerTacticsFighterPuzzlesPublicRoutes };
export {};
