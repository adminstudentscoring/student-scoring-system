// Extracted from blundersTeacherRoutes.ts — uses `with (deps)`.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersTeacherStorageRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
    app.get('/api/teachers/blunders/storage-stats', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
      try {
        const orgId = String(req.user.organizationId || req.organizationFilter || '');
        if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });

        const safeStat = async (filePath) => {
          try {
            const st = await fs.stat(filePath);
            return { ok: true, path: filePath, sizeBytes: Number(st.size || 0) || 0, mtime: st.mtime ? st.mtime.toISOString() : null };
          } catch (e) {
            return { ok: false, path: filePath, sizeBytes: 0, mtime: null, error: String(e?.message || e) };
          }
        };

        const [pzSt, stSt, setSt, jobsSt] = await Promise.all([
          safeStat(BLUNDERS_PUZZLES_FILE),
          safeStat(BLUNDERS_STATS_FILE),
          safeStat(BLUNDERS_SETTINGS_FILE),
          safeStat(BLUNDERS_TEACHER_JOBS_FILE)
        ]);

        const puzzlesAll = await readBlundersPuzzles();
        const puzzles = puzzlesAll.filter(p => String(p?.orgId || '') === orgId && String(p?.scope || '') !== 'master');
        const total = puzzles.length;

        // Buckets (same definition as Teacher All blunders)
        const isMissMate = (p) => {
          const bestCp = Number(p?.bestCp ?? 0);
          return Number.isFinite(bestCp) && Math.abs(bestCp) >= 99999;
        };
        const dropOf = (p) => Number(p?.dropPoints ?? (Number(p?.dropCp || 0) / 100)) || 0;
        const counts = { missMate: 0, d1: 0, d2: 0, d3: 0, d4: 0, total };
        const perStudent = new Map();
        for (const p of puzzles) {
          const sid = String(p?.studentId || '');
          if (sid) perStudent.set(sid, (perStudent.get(sid) || 0) + 1);
          if (isMissMate(p)) { counts.missMate++; continue; }
          const d = dropOf(p);
          if (d >= 1.0 && d <= 1.5) counts.d1++;
          else if (d > 1.5 && d <= 2.0) counts.d2++;
          else if (d > 2.0 && d <= 3.0) counts.d3++;
          else if (d > 3.0) counts.d4++;
          else counts.d1++;
        }
        const topStudents = Array.from(perStudent.entries())
          .sort((a, b) => (b[1] - a[1]))
          .slice(0, 10)
          .map(([studentId, n]) => ({ studentId, puzzles: n }));

        // Stats map size (analyzed games keys count) for this org (best-effort)
        let analyzedKeys = 0;
        try {
          const orgs = await readBlundersStats();
          const org = orgs?.[orgId] || {};
          for (const st of Object.values(org)) {
            if (!st || typeof st !== 'object') continue;
            const analyzed = st.analyzed && typeof st.analyzed === 'object' ? st.analyzed : {};
            analyzedKeys += Object.keys(analyzed).length;
          }
        } catch {}

        return res.json({
          ok: true,
          orgId,
          files: {
            puzzles: pzSt,
            stats: stSt,
            settings: setSt,
            teacherJobs: jobsSt
          },
          counts,
          analyzedKeys,
          topStudents,
          now: new Date().toISOString()
        });
      } catch (e) {
        console.error('GET /api/teachers/blunders/storage-stats error:', e);
        return res.status(500).json({ error: 'Failed to load storage stats' });
      }
    });

  }
}

module.exports = { registerBlundersTeacherStorageRoutes };
