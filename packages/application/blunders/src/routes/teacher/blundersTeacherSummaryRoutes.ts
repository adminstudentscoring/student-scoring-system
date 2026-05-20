// Extracted from blundersTeacherRoutes.ts — uses `with (deps)`.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersTeacherSummaryRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
    app.get('/api/teachers/blunders/masters-summary', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
        const org = await getOrgBlundersSettings(orgId);
        const puzzles = await readBlundersPuzzles();
        const masterPuzzles = puzzles.filter(p => String(p.orgId || '') === orgId && String(p.scope || '') === 'master');
        const masters = (Array.isArray(org.masters) ? org.masters : []).map((m) => {
          const mid = String(m.id || '');
          const mine = masterPuzzles.filter(p => String(p.masterId || '') === mid);
          // Best-effort: show last known master rating based on most recent master puzzle.
          const last = mine.slice().sort((a, b) => (puzzleSortKeyMs(b) - puzzleSortKeyMs(a)))[0] || null;
          const mr = last && last.masterChessComRating !== null && last.masterChessComRating !== undefined ? Number(last.masterChessComRating) : null;
          const ms = last && last.masterChessComRatingSource ? String(last.masterChessComRatingSource) : null;
          return {
            ...m,
            counts: { total: mine.length },
            rating: Number.isFinite(mr) ? mr : null,
            ratingSource: ms,
            ratingUpdatedAt: last?.masterChessComRatingUpdatedAt || null
          };
        });
        return res.json({ ok: true, orgId, masters, masterConfig: await getMasterBlundersConfig(orgId) });
      } catch (e) {
        console.error('GET /api/teachers/blunders/masters-summary error:', e);
        return res.status(500).json({ error: 'Failed to load masters summary' });
      }
    });
    app.get('/api/teachers/blunders/tag-stats', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });

        const duration = String(req.query.duration || 'month'); // week | month | halfYear | year | all
        const startMs = (() => {
          const now = Date.now();
          const day = 24 * 60 * 60 * 1000;
          if (duration === 'week') return now - 7 * day;
          if (duration === 'month') return now - 30 * day;
          if (duration === 'halfYear') return now - 182 * day;
          if (duration === 'year') return now - 365 * day;
          return 0;
        })();

        const users = await readUsers();
        const teacher = users.find(u => u.id === req.user.id);
        const assignedIds = (teacher && Array.isArray(teacher.assignedStudents) && teacher.assignedStudents.length) ? new Set(teacher.assignedStudents) : null;

        const data = await readData();
        const studentsAll = Array.isArray(data?.students) ? data.students.filter(s => String(s.organizationId || '') === orgId) : [];
        const students = assignedIds ? studentsAll.filter(s => assignedIds.has(s.id)) : studentsAll;
        const allowedStudentIds = new Set(students.map(s => String(s.id || '')));
        const studentMap = new Map(students.map(s => [String(s.id || ''), { name: String(s.name || 'Student'), studentId: String(s.chessComId || '') }]));

        const puzzles = await readBlundersPuzzles();
        const mine = puzzles
          .filter(p => String(p?.orgId || '') === orgId)
          .filter(p => String(p?.scope || '') !== 'master')
          .filter(p => allowedStudentIds.has(String(p?.studentId || '')))
          .filter(p => !startMs || (puzzleSortKeyMs(p) >= startMs));

        const overall = new Map(); // tag -> count
        const perStudent = new Map(); // sid -> Map(tag,count)

        for (const p of mine) {
          const sid = String(p?.studentId || '');
          const tags = Array.isArray(p?.tags) ? p.tags.map(String).filter(Boolean) : [];
          if (!tags.length) continue;
          if (!perStudent.has(sid)) perStudent.set(sid, new Map());
          const m = perStudent.get(sid);
          for (const t of tags) {
            m.set(t, (m.get(t) || 0) + 1);
            overall.set(t, (overall.get(t) || 0) + 1);
          }
        }

        const topOverall = Array.from(overall.entries())
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => (b.count - a.count) || String(a.tag).localeCompare(String(b.tag)))
          .slice(0, 20);

        const studentsOut = Array.from(perStudent.entries()).map(([sid, map]) => {
          const info = studentMap.get(String(sid)) || { name: 'Student', studentId: '' };
          const top = Array.from(map.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => (b.count - a.count) || String(a.tag).localeCompare(String(a.tag)))
            .slice(0, 10);
          return { id: String(sid), name: info.name, studentId: info.studentId, top };
        }).sort((a, b) => String(a.name).localeCompare(String(b.name)));

        return res.json({
          ok: true,
          orgId,
          duration,
          taggerVersion: BLUNDERS_TAGGER_VERSION,
          puzzlesConsidered: mine.length,
          topOverall,
          students: studentsOut
        });
      } catch (e) {
        console.error('GET /api/teachers/blunders/tag-stats error:', e);
        return res.status(500).json({ error: 'Failed to load tag stats' });
      }
    });
  }
}

module.exports = { registerBlundersTeacherSummaryRoutes };
export {};
