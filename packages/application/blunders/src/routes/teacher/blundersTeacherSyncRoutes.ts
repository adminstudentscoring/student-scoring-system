// Extracted from blundersTeacherRoutes.ts — uses `with (deps)`.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersTeacherSyncRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
    app.post('/api/teachers/blunders/sync-today', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const data = await readData();
        const students = Array.isArray(data?.students) ? data.students.filter(s => String(s.organizationId || '') === orgId) : [];
        // Fire-and-forget per student (throttled inside)
        for (const s of students) {
          syncBlundersForStudent(s).catch(() => {});
        }
        return res.json({ ok: true, message: 'Sync started', students: students.length });
      } catch (e) {
        console.error('POST /api/teachers/blunders/sync-today error:', e);
        return res.status(500).json({ error: 'Failed to start sync' });
      }
    });

    // Teacher: Blunders settings & sync controls (per-student config + masters)
    app.post('/api/teachers/blunders/sync-student', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const studentId = String(body.studentId || '').trim();
        const hkDayKey = normalizeHkDayKey(body.hkDayKey) || todayHkKey();
        const mode = String(body.mode || '').trim().toLowerCase(); // '' | 'history'
        const historyGames = Number(body.historyGames || 0) || 0;
        const force = body.force ? '1' : '0';
        const maxGamesPerDay = body.maxGamesPerDay;
        const thresholdPoints = body.thresholdPoints;
        if (!studentId) return res.status(400).json({ error: 'studentId is required' });
        const data = await readData();
        const student = (Array.isArray(data?.students) ? data.students : []).find(s => String(s.id || '') === studentId && String(s.organizationId || '') === orgId);
        if (!student) return res.status(404).json({ error: 'Student not found in your organization' });
        // For history mode, enqueue a background job (avoid long HTTP requests / timeouts).
        if (mode === 'history' && historyGames) {
          const jobId = `blj_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          const jobs = await readBlundersTeacherJobs();
          jobs[jobId] = {
            id: jobId,
            type: 'blunders_history_scan',
            orgId,
            teacherId: String(req.user.id || ''),
            status: 'queued', // queued | running | done | error | cancelled
            createdAt: nowIso(),
            updatedAt: nowIso(),
            startedAt: null,
            finishedAt: null,
            error: null,
            params: {
              studentIds: [studentId],
              historyGames: Math.max(1, Math.min(500, Number(historyGames || 0) || 200)),
              force: force === '1',
              thresholdPoints
            },
            progress: { total: 1, done: 0, message: 'Queued.', currentStudentId: studentId, currentStudentName: String(student.name || 'Student') }
          };
          await writeBlundersTeacherJobs(jobs);
          blundersTeacherJobQueue.push(jobId);
          blundersTeacherRunNextJob().catch(() => {});
          return res.json({ ok: true, queued: true, jobId });
        }

        const result = await syncBlundersForStudent(student, { hkDayKey, force, maxGamesPerDay, thresholdPoints, mode, historyGames });
        return res.json({ ok: true, result });
      } catch (e) {
        console.error('POST /api/teachers/blunders/sync-student error:', e);
        return res.status(500).json({ error: 'Failed to sync student' });
      }
    });

    // Teacher Jobs: create history scan job for multiple students
    app.post('/api/teachers/blunders/sync-master', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const masterId = String(body.masterId || '').trim();
        const hkDayKey = normalizeHkDayKey(body.hkDayKey) || todayHkKey();
        const force = body.force ? '1' : '0';
        if (!masterId) return res.status(400).json({ error: 'masterId is required' });
        const org = await getOrgBlundersSettings(orgId);
        const master = (Array.isArray(org.masters) ? org.masters : []).find(m => String(m.id || '') === masterId);
        if (!master) return res.status(404).json({ error: 'Master not found' });
        const result = await syncBlundersForMaster(orgId, master, { hkDayKey, force });
        return res.json({ ok: true, result });
      } catch (e) {
        console.error('POST /api/teachers/blunders/sync-master error:', e);
        return res.status(500).json({ error: 'Failed to sync master' });
      }
    });

    app.post('/api/teachers/blunders/complete-pending', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const idsIn = Array.isArray(body.studentIds) ? body.studentIds : [];
        const ids = Array.from(new Set(idsIn.map(x => String(x || '').trim()).filter(Boolean)));
        if (!ids.length) return res.status(400).json({ error: 'Missing studentIds' });

        // Respect assignedStudents restriction (if present).
        const users = await readUsers();
        const teacher = users.find(u => u.id === req.user.id);
        const assignedIds = (teacher && Array.isArray(teacher.assignedStudents) && teacher.assignedStudents.length) ? new Set(teacher.assignedStudents) : null;
        const allowedIds = assignedIds ? ids.filter(id => assignedIds.has(id)) : ids;
        if (!allowedIds.length) return res.status(403).json({ error: 'No allowed students selected' });

        const puzzles = await readBlundersPuzzles();
        const nowIso = new Date().toISOString();
        let changed = 0;
        let considered = 0;
        for (const p of puzzles) {
          if (String(p.orgId || '') !== orgId) continue;
          if (String(p.scope || '') === 'master') continue;
          const sid = String(p.studentId || '');
          if (!allowedIds.includes(sid)) continue;
          considered++;
          if (String(p.status || 'pending') === 'pending') {
            p.status = 'completed';
            if (!p.completedAt) p.completedAt = nowIso;
            changed++;
          }
        }
        if (changed) await writeBlundersPuzzles(puzzles);

        return res.json({ ok: true, orgId, selected: ids.length, allowed: allowedIds.length, considered, changed });
      } catch (e) {
        console.error('POST /api/teachers/blunders/complete-pending error:', e);
        return res.status(500).json({ error: 'Failed to complete pending puzzles' });
      }
    });
  }
}

module.exports = { registerBlundersTeacherSyncRoutes };
