// Teacher Chess.com settings routes extracted from server.js.

function registerChessComTeacherRoutes(app, deps) {
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const readChessComSettings = deps?.readChessComSettings;
  const writeChessComSettings = deps?.writeChessComSettings;

  if (!app) throw new Error('registerChessComTeacherRoutes: missing app');
  if (typeof authenticateUser !== 'function') throw new Error('registerChessComTeacherRoutes: missing authenticateUser');
  if (typeof authorizeRole !== 'function') throw new Error('registerChessComTeacherRoutes: missing authorizeRole');
  if (typeof requireOrganizationAccess !== 'function') throw new Error('registerChessComTeacherRoutes: missing requireOrganizationAccess');
  if (typeof readChessComSettings !== 'function') throw new Error('registerChessComTeacherRoutes: missing readChessComSettings');
  if (typeof writeChessComSettings !== 'function') throw new Error('registerChessComTeacherRoutes: missing writeChessComSettings');

  // Teacher: Chess.com settings (persisted on server, org-scoped)
  app.get('/api/teachers/chesscom/settings', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
    try {
      const orgId = String(req.user.organizationId || req.organizationFilter || '');
      if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
      const orgs = await readChessComSettings();
      const settings = (orgs && orgs[orgId] && typeof orgs[orgId] === 'object') ? orgs[orgId] : {};
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
        clean[sid] = { chessId, updatedAt: new Date().toISOString() };
      }

      const orgs = await readChessComSettings();
      const prev = (orgs && orgs[orgId] && typeof orgs[orgId] === 'object') ? orgs[orgId] : {};
      // Merge updates so partial pushes won't wipe existing mappings.
      orgs[orgId] = { ...prev, ...clean };
      const ok = await writeChessComSettings(orgs);
      if (!ok) return res.status(500).json({ error: 'Failed to save settings' });
      console.log('[chesscom] settings saved', { orgId, count: Object.keys(clean).length });
      return res.json({ ok: true, orgId, count: Object.keys(clean).length });
    } catch (e) {
      console.error('PUT /api/teachers/chesscom/settings error:', e);
      return res.status(500).json({ error: 'Failed to save settings' });
    }
  });
}

module.exports = { registerChessComTeacherRoutes };


