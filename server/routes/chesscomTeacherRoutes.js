// Teacher Chess.com settings routes extracted from server.js.

function registerChessComTeacherRoutes(app, deps) {
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const readChessComSettings = deps?.readChessComSettings;
  const writeChessComSettings = deps?.writeChessComSettings;
  const getOrgChessComSettings = deps?.getOrgChessComSettings;
  const upsertOrgChessComSettings = deps?.upsertOrgChessComSettings;

  if (!app) throw new Error('registerChessComTeacherRoutes: missing app');
  if (typeof authenticateUser !== 'function') throw new Error('registerChessComTeacherRoutes: missing authenticateUser');
  if (typeof authorizeRole !== 'function') throw new Error('registerChessComTeacherRoutes: missing authorizeRole');
  if (typeof requireOrganizationAccess !== 'function') throw new Error('registerChessComTeacherRoutes: missing requireOrganizationAccess');
  // Backward compatibility: routes can use Postgres helpers if provided, otherwise fall back to file store.
  const hasDbHelpers = (typeof getOrgChessComSettings === 'function') && (typeof upsertOrgChessComSettings === 'function');
  if (!hasDbHelpers) {
    if (typeof readChessComSettings !== 'function') throw new Error('registerChessComTeacherRoutes: missing readChessComSettings');
    if (typeof writeChessComSettings !== 'function') throw new Error('registerChessComTeacherRoutes: missing writeChessComSettings');
  }

  // Teacher: Chess.com settings (persisted on server, org-scoped)
  app.get('/api/teachers/chesscom/settings', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
    try {
      const orgId = String(req.user.organizationId || req.organizationFilter || '');
      if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
      if (!hasDbHelpers) {
        const orgs = await readChessComSettings();
        const picked = (orgs && orgs[orgId] && typeof orgs[orgId] === 'object') ? orgs[orgId] : {};
        return res.json({ ok: true, orgId, settings: picked });
      }
      const settings = (await getOrgChessComSettings(orgId)) || {};
      return res.json({ ok: true, orgId, settings });
    } catch (e) {
      console.error('GET /api/teachers/chesscom/settings error:', e);
      return res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  app.put('/api/teachers/chesscom/settings', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
    try {
      const orgId = String(req.user.organizationId || req.organizationFilter || '');
      if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
      const incoming = req.body && typeof req.body === 'object' ? req.body : {};
      const settings = incoming.settings && typeof incoming.settings === 'object' ? incoming.settings : null;
      if (!settings) return res.status(400).json({ error: 'settings is required' });

      // Validate + normalize
      const clean = {};
      for (const [studentId, entry] of Object.entries(settings)) {
        const sid = String(studentId || '').trim();
        if (!sid) continue;
        const chessId = String(entry?.chessId ?? '').trim();
        if (!chessId) continue;
        const hasPassword = !!(entry && Object.prototype.hasOwnProperty.call(entry, 'password'));
        const password = hasPassword ? String(entry?.password ?? '') : undefined;
        clean[sid] = {
          chessId,
          ...(hasPassword ? { password } : {}),
          updatedAt: new Date().toISOString()
        };
      }

      if (hasDbHelpers) {
        const prev = (await getOrgChessComSettings(orgId)) || {};
        // Merge updates so partial pushes won't wipe existing mappings.
        // IMPORTANT: if payload omits "password", we preserve existing password in DB.
        const merged = { ...(prev || {}) };
        for (const [sid, ent] of Object.entries(clean)) {
          if (!merged[sid] || typeof merged[sid] !== 'object') merged[sid] = {};
          merged[sid].chessId = String(ent.chessId || '').trim();
          if (Object.prototype.hasOwnProperty.call(ent, 'password')) {
            merged[sid].password = String(ent.password ?? '');
          }
          merged[sid].updatedAt = new Date().toISOString();
        }
        const out = await upsertOrgChessComSettings(orgId, merged);
        if (!out || out.ok !== true) return res.status(500).json({ error: 'Failed to save settings' });
        console.log('[chesscom] settings saved (db)', { orgId, count: Object.keys(clean).length });
        return res.json({ ok: true, orgId, count: Object.keys(clean).length, upserted: Number(out.upserted || 0), source: 'db' });
      }

      // File store fallback
      const orgs = await readChessComSettings();
      const prev = (orgs && orgs[orgId] && typeof orgs[orgId] === 'object') ? orgs[orgId] : {};
      // Merge updates so partial pushes won't wipe existing mappings.
      orgs[orgId] = { ...prev, ...clean };
      const ok = await writeChessComSettings(orgs);
      if (!ok) return res.status(500).json({ error: 'Failed to save settings' });
      console.log('[chesscom] settings saved (file)', { orgId, count: Object.keys(clean).length });
      return res.json({ ok: true, orgId, count: Object.keys(clean).length, source: 'file' });
    } catch (e) {
      console.error('PUT /api/teachers/chesscom/settings error:', e);
      return res.status(500).json({ error: 'Failed to save settings' });
    }
  });
}

module.exports = { registerChessComTeacherRoutes };


