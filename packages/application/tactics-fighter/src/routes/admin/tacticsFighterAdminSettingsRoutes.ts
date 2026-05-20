// Tactics Fighter teacher debug + settings routes
"use strict";

function registerTacticsFighterAdminSettingsRoutes(app: any, deps: any, shared: any): void {
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

  // ===== Teacher debug: verify deployed routes (helps diagnose 404 on Railway) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    app.get(
      '/api/teachers/tactics-fighter/debug/routes',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      async (req, res) => {
        return res.json({
          ok: true,
          app: 'tactics-fighter',
          hasPhotoRecognize: true,
          endpoints: {
            photoUpload: '/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/photo-recognize/upload',
            photoJob: '/api/teachers/tactics-fighter/builder/photo-recognize/jobs/:jobId',
            photoFens: '/api/teachers/tactics-fighter/builder/photo-recognize/jobs/:jobId/fens'
          }
        });
      }
    );
  }

  // ===== Teacher: Settings (org-level) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess && resolveOrgIdFromUser) {
    app.get(
      "/api/teachers/tactics-fighter/settings",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!(await requireDbReady(res))) return;
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(403).json({ ok: false, error: "Missing orgId" });
          const s = await getTfSettings(orgId);
          return res.json({ ok: true, ...s });
        } catch (e) {
          console.error("[tactics-fighter] teacher settings get error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load settings" });
        }
      }
    );

    app.put(
      "/api/teachers/tactics-fighter/settings",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!(await requireDbReady(res))) return;
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(403).json({ ok: false, error: "Missing orgId" });
          const out = await upsertTfSettings(orgId, { stockfishDepthCap: req?.body?.stockfishDepthCap }, req?.user?.id || req?.user?.email || null);
          return res.json({ ok: true, ...out });
        } catch (e) {
          console.error("[tactics-fighter] teacher settings put error:", e);
          return res.status(500).json({ ok: false, error: "Failed to save settings" });
        }
      }
    );
  }
}

module.exports = { registerTacticsFighterAdminSettingsRoutes };
export {};
