// Extracted from blundersPublicRoutes.ts — uses `with (deps)` for dependency injection.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersPublicTeacherRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
    app.post('/api/teachers/blunders/students/:studentId/ai-comment', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const studentId = String(req.params.studentId || '').trim();
        if (!studentId) return res.status(400).json({ error: 'Missing studentId' });
        const force = !!(req.body && typeof req.body === 'object' && req.body.force);
        const out = await generateStudentAiCommentMonth({ orgId, studentId, force });
        if (!out.ok) return res.status(400).json({ error: out.error || 'Failed to generate', cached: !!out.entry, entry: out.entry || null });
        return res.json({ ok: true, cached: !!out.cached, entry: out.entry || null });
      } catch (e) {
        console.error('POST /api/teachers/blunders/students/:studentId/ai-comment error:', e);
        return res.status(500).json({ error: 'Failed to generate AI comment' });
      }
    });

    // Teacher: Ping OpenAI to validate API key/model quickly.
    app.get('/api/teachers/blunders/ai/ping', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        if (!openAiEnabled()) return res.status(400).json({ ok: false, error: 'OpenAI not configured (missing OPENAI_API_KEY)' });
        const system = 'Return JSON only.';
        const user = JSON.stringify({ ping: true, now: nowIso() });
        const out = await openAiJson({ system, user, maxOutputTokens: 20 });
        return res.json({ ok: true, model: String(process.env.OPENAI_MODEL || 'gpt-4o-mini'), usage: out?.usage || null, sample: out?.json || out?.text || null });
      } catch (e) {
        return res.status(400).json({ ok: false, error: String(e?.message || e) });
      }
    });

    // Teacher: DB sync retry status (best-effort). Useful for verifying tags are catching up in Postgres.
    app.get('/api/teachers/blunders/db-sync-status', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const store = await readBlundersDbRetry();
        const items = Array.isArray(store.items) ? store.items : [];
        const now = Date.now();
        const stats = {
          total: items.length,
          readyNow: items.filter(it => Number(it?.nextAtMs || 0) <= now).length,
          upsert_puzzles: items.filter(it => String(it?.type || '') === 'upsert_puzzles').length,
          upsert_tags: items.filter(it => String(it?.type || '') === 'upsert_tags').length,
          dropped: items.filter(it => !!it?.dropped).length
        };
        const lastErr = items
          .filter(it => it?.lastError)
          .slice(-10)
          .map(it => ({ type: it.type, attempts: it.attempts, lastError: it.lastError, nextAtMs: it.nextAtMs, id: it.id }));
        return res.json({ ok: true, updatedAt: store.updatedAt || null, stats, lastErrors: lastErr });
      } catch (e) {
        return res.status(500).json({ error: 'Failed to load db sync status' });
      }
    });

    // Public Student Access: Fetch AI coach comment (last 30 days). Password protected.
    app.get('/api/public/students/:id/blunders/ai-comment', async (req, res) => {
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
        const key = aiCommentCacheKey({ orgId, studentId: String(student.id), range: 'month' });
        const store = await readBlundersAiComments();
        const entry = store?.[key] || null;
        const fresh = entry?.updatedAt && aiCommentIsFresh(entry.updatedAt, 24 * 60 * 60 * 1000);
        const errFresh = entry?.failedAt && aiCommentIsFresh(entry.failedAt, 10 * 60 * 1000);

        if (!fresh && !errFresh && openAiEnabled()) {
          generateStudentAiCommentMonth({ orgId, studentId: String(student.id), force: false }).catch(() => {});
        }

        return res.json({
          ok: true,
          status: openAiEnabled()
            ? (entry?.error ? 'error' : (fresh ? 'cached' : 'generating'))
            : 'disabled',
          updatedAt: entry?.updatedAt || null,
          error: entry?.error || null,
          failedAt: entry?.failedAt || null,
          comment: entry?.comment || (entry?.text ? { text: entry.text } : null),
          stats: entry?.stats || null
        });
      } catch (e) {
        console.error('GET /api/public/students/:id/blunders/ai-comment error:', e);
        return res.status(500).json({ error: 'Failed to load AI comment' });
      }
    });

  }
}

module.exports = { registerBlundersPublicTeacherRoutes };
