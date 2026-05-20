// Extracted from blundersTeacherRoutes.ts — uses `with (deps)`.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersTeacherJobRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
    app.post('/api/teachers/blunders/jobs/history-scan', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const idsIn = Array.isArray(body.studentIds) ? body.studentIds : [];
        const ids = Array.from(new Set(idsIn.map(x => String(x || '').trim()).filter(Boolean)));
        const historyGames = Math.max(1, Math.min(500, Number(body.historyGames || 0) || 200));
        const force = !!body.force;

        if (!ids.length) return res.status(400).json({ error: 'Missing studentIds' });

        // Respect assignedStudents restriction (if present).
        const users = await readUsers();
        const teacher = users.find(u => u.id === req.user.id);
        const assignedIds = (teacher && Array.isArray(teacher.assignedStudents) && teacher.assignedStudents.length) ? new Set(teacher.assignedStudents) : null;
        const allowedIds = assignedIds ? ids.filter(id => assignedIds.has(id)) : ids;
        if (!allowedIds.length) return res.status(403).json({ error: 'No allowed students selected' });

        const jobId = `blj_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const jobs = await readBlundersTeacherJobs();
        jobs[jobId] = {
          id: jobId,
          type: 'blunders_history_scan',
          orgId,
          teacherId: String(req.user.id || ''),
          status: 'queued',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          startedAt: null,
          finishedAt: null,
          error: null,
          params: { studentIds: allowedIds, historyGames, force },
          progress: { total: allowedIds.length, done: 0, message: 'Queued.', currentStudentId: null, currentStudentName: null }
        };
        const okWrite = await writeBlundersTeacherJobs(jobs);
        if (!okWrite) return res.status(500).json({ error: 'Failed to persist job. Please retry.' });
        blundersTeacherJobQueue.push(jobId);
        blundersTeacherRunNextJob().catch(() => {});
        return res.json({ ok: true, jobId, total: allowedIds.length });
      } catch (e) {
        console.error('POST /api/teachers/blunders/jobs/history-scan error:', e);
        return res.status(500).json({ error: 'Failed to create job' });
      }
    });

    // Teacher: enqueue Master History scan as a background job (avoid long-running request timeouts).
    app.post('/api/teachers/blunders/jobs/master-history-scan', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const idsIn = Array.isArray(body.masterIds) ? body.masterIds : [];
        const ids = Array.from(new Set(idsIn.map(x => String(x || '').trim()).filter(Boolean)));
        const historyGames = Math.max(1, Math.min(500, Number(body.historyGames || 0) || 200));
        const force = body.force ? '1' : '0';
        if (!ids.length) return res.status(400).json({ error: 'Missing masterIds' });

        const org = await getOrgBlundersSettings(orgId);
        const mastersAll = Array.isArray(org?.masters) ? org.masters : [];
        const masterSet = new Set(mastersAll.map(m => String(m?.id || '')).filter(Boolean));
        const allowed = ids.filter(id => masterSet.has(id));
        if (!allowed.length) return res.status(404).json({ error: 'No valid masters selected' });

        const jobs = await readBlundersTeacherJobs();
        const jobId = `blj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        jobs[jobId] = {
          id: jobId,
          orgId,
          teacherId: String(req.user.id || ''),
          type: 'blunders_master_history_scan',
          status: 'queued',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          startedAt: null,
          finishedAt: null,
          error: null,
          params: { masterIds: allowed, historyGames, force },
          progress: { total: allowed.length, done: 0, message: `Queued (${allowed.length})`, currentMasterId: null, currentMasterName: null }
        };
        const okWrite = await writeBlundersTeacherJobs(jobs);
        if (!okWrite) return res.status(500).json({ error: 'Failed to persist job. Please retry.' });
        blundersTeacherJobQueue.push(jobId);
        blundersTeacherRunNextJob().catch(() => {});
        return res.json({ ok: true, orgId, jobId, queued: allowed.length });
      } catch (e) {
        console.error('POST /api/teachers/blunders/jobs/master-history-scan error:', e);
        return res.status(500).json({ error: 'Failed to enqueue master history scan' });
      }
    });

    // Teacher: enqueue Blunders tagging as a background job (A: tactical themes).
    app.post('/api/teachers/blunders/jobs/tag-puzzles', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const scope = String(body.scope || 'student'); // student | master | all
        const recompute = !!body.recompute;
        const syncDb = body.syncDb !== undefined ? !!body.syncDb : true;
        if (!['student', 'master', 'all'].includes(scope)) return res.status(400).json({ error: 'Invalid scope (use: student, master, all)' });

        const jobs = await readBlundersTeacherJobs();
        const jobId = `blj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        jobs[jobId] = {
          id: jobId,
          orgId,
          teacherId: String(req.user.id || ''),
          type: 'blunders_tag_puzzles',
          status: 'queued',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          startedAt: null,
          finishedAt: null,
          error: null,
          params: { scope, recompute, syncDb },
          progress: { total: 0, done: 0, tagged: 0, skipped: 0, scope, message: 'Queued' }
        };
        const okWrite = await writeBlundersTeacherJobs(jobs);
        if (!okWrite) return res.status(500).json({ error: 'Failed to persist job. Please retry.' });
        blundersTeacherJobQueue.push(jobId);
        blundersTeacherRunNextJob().catch(() => {});
        return res.json({ ok: true, orgId, jobId, scope, recompute, syncDb });
      } catch (e) {
        console.error('POST /api/teachers/blunders/jobs/tag-puzzles error:', e);
        return res.status(500).json({ error: 'Failed to enqueue tag job' });
      }
    });

    app.get('/api/teachers/blunders/jobs/:jobId', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const jobId = String(req.params.jobId || '').trim();
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const jobs = await readBlundersTeacherJobs();
        const job = jobs[jobId] || null;
        if (!job) return res.status(404).json({ error: 'Job not found' });
        if (String(job.orgId || '') !== orgId) return res.status(403).json({ error: 'Access denied' });
        // Only allow owner teacher to read (tighten)
        if (String(job.teacherId || '') !== String(req.user.id || '')) return res.status(403).json({ error: 'Access denied' });
        return res.json({ ok: true, job });
      } catch (e) {
        console.error('GET /api/teachers/blunders/jobs/:jobId error:', e);
        return res.status(500).json({ error: 'Failed to load job' });
      }
    });

    app.post('/api/teachers/blunders/jobs/:jobId/cancel', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const jobId = String(req.params.jobId || '').trim();
        if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
        const jobs = await readBlundersTeacherJobs();
        const job = jobs[jobId] || null;
        if (!job) return res.status(404).json({ error: 'Job not found' });
        if (String(job.orgId || '') !== orgId) return res.status(403).json({ error: 'Access denied' });
        if (String(job.teacherId || '') !== String(req.user.id || '')) return res.status(403).json({ error: 'Access denied' });
        blundersTeacherJobCancel.add(jobId);
        if (job.status === 'queued') {
          job.status = 'cancelled';
          job.finishedAt = nowIso();
          job.updatedAt = nowIso();
          job.progress = { ...(job.progress || {}), message: 'Cancelled.' };
          jobs[jobId] = job;
          await writeBlundersTeacherJobs(jobs);
        }
        return res.json({ ok: true, cancelled: true });
      } catch (e) {
        console.error('POST /api/teachers/blunders/jobs/:jobId/cancel error:', e);
        return res.status(500).json({ error: 'Failed to cancel job' });
      }
    });

  }
}

module.exports = { registerBlundersTeacherJobRoutes };
