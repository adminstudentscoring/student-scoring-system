// Chess Works public student routes
"use strict";

function registerChessWorksPublicRoutes(app: any, shared: any): void {
  const {
    pool, requireDbReady, requirePublicStudent, isAssignedToStudent, toCleanString, toIdString, nowIso
  } = shared;

  // ===== Public student APIs =====
  app.get("/api/public/students/:id/chess-works/works", async (req, res) => {
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    if (!(await requireDbReady(res))) return;
    try {
      const r = await pool.query(
        `SELECT w.id, w.title, w.updated_at
         FROM chess_works_works w
         WHERE w.org_id = $1
           AND (
             EXISTS (
               SELECT 1 FROM chess_works_assignments a
               WHERE a.org_id = w.org_id AND a.work_id = w.id
                 AND a.assigned_to_type = 'student' AND a.assigned_to_id = $2
             )
             OR EXISTS (
               SELECT 1 FROM chess_works_assignments a
               JOIN chess_works_group_members m
                 ON m.org_id = a.org_id AND m.group_id = CAST(a.assigned_to_id AS BIGINT)
               WHERE a.org_id = w.org_id AND a.work_id = w.id
                 AND a.assigned_to_type = 'group' AND m.student_id = $2
             )
           )
         ORDER BY w.updated_at DESC, w.id DESC`,
        [String(auth.orgId), String(auth.studentId)]
      );
      // Hide works already finished-reviewed in history
      const revR = await pool.query(
        `SELECT work_id FROM chess_works_reviews WHERE org_id = $1 AND student_id = $2 AND finished = TRUE`,
        [String(auth.orgId), String(auth.studentId)]
      );
      const done = new Set((revR.rows || []).map((x) => String(x.work_id)));
      const works = (r.rows || [])
        .map((x) => ({
          id: String(x.id),
          title: String(x.title || ""),
          updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : nowIso()
        }))
        .filter((w) => !done.has(String(w.id)));
      return res.json({ ok: true, works });
    } catch (e) {
      console.error("[chess-works] student list works error:", e);
      return res.status(500).json({ ok: false, error: "Failed to list works" });
    }
  });

  app.get("/api/public/students/:id/chess-works/works/:workId", async (req, res) => {
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    if (!(await requireDbReady(res))) return;
    try {
      const workId = toIdString(req.params.workId || "");
      if (!workId) return res.status(400).json({ ok: false, error: "Missing workId" });
      const assigned = await isAssignedToStudent({ orgId: auth.orgId, workId, studentId: auth.studentId });
      if (!assigned) return res.status(403).json({ ok: false, error: "Not assigned" });
      const r = await pool.query(
        `SELECT id, title, items, updated_at FROM chess_works_works WHERE org_id = $1 AND id = $2 LIMIT 1`,
        [String(auth.orgId), Number(workId)]
      );
      const row = r.rows?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "Work not found" });
      return res.json({
        ok: true,
        work: {
          id: String(row.id),
          title: String(row.title || ""),
          items: row.items && typeof row.items === "object" ? row.items : [],
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso()
        }
      });
    } catch (e) {
      console.error("[chess-works] student get work error:", e);
      return res.status(500).json({ ok: false, error: "Failed to load work" });
    }
  });

  // student save submission (draft)
  app.patch("/api/public/students/:id/chess-works/works/:workId/submission", async (req, res) => {
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    if (!(await requireDbReady(res))) return;
    try {
      const workId = toIdString(req.params.workId || "");
      if (!workId) return res.status(400).json({ ok: false, error: "Missing workId" });
      const assigned = await isAssignedToStudent({ orgId: auth.orgId, workId, studentId: auth.studentId });
      if (!assigned) return res.status(403).json({ ok: false, error: "Not assigned" });
      const answers = (req.body && typeof req.body.answers === "object" && req.body.answers) ? req.body.answers : {};
      await pool.query(
        `INSERT INTO chess_works_submissions(org_id, work_id, student_id, answers, started_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (org_id, work_id, student_id)
         DO UPDATE SET answers = EXCLUDED.answers, updated_at = NOW()`,
        [String(auth.orgId), Number(workId), String(auth.studentId), answers]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error("[chess-works] student save submission error:", e);
      const msg = toCleanString(e?.message || e);
      return res.status(500).json({ ok: false, error: "Failed to save", details: msg });
    }
  });

  // student get submission (draft) + review status (if any)
  app.get("/api/public/students/:id/chess-works/works/:workId/submission", async (req, res) => {
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    if (!(await requireDbReady(res))) return;
    try {
      const workId = toIdString(req.params.workId || "");
      if (!workId) return res.status(400).json({ ok: false, error: "Missing workId" });
      const assigned = await isAssignedToStudent({ orgId: auth.orgId, workId, studentId: auth.studentId });
      if (!assigned) return res.status(403).json({ ok: false, error: "Not assigned" });
      const sR = await pool.query(
        `SELECT answers, updated_at FROM chess_works_submissions WHERE org_id = $1 AND work_id = $2 AND student_id = $3 LIMIT 1`,
        [String(auth.orgId), Number(workId), String(auth.studentId)]
      );
      const sub = sR.rows?.[0] || null;
      const rR = await pool.query(
        `SELECT marks, finished, reviewed_at FROM chess_works_reviews WHERE org_id = $1 AND work_id = $2 AND student_id = $3 LIMIT 1`,
        [String(auth.orgId), Number(workId), String(auth.studentId)]
      );
      const rev = rR.rows?.[0] || null;
      return res.json({
        ok: true,
        submission: sub ? { answers: sub.answers && typeof sub.answers === "object" ? sub.answers : {}, updatedAt: sub.updated_at ? new Date(sub.updated_at).toISOString() : null } : null,
        review: rev ? { marks: rev.marks && typeof rev.marks === "object" ? rev.marks : [], finished: !!rev.finished, reviewedAt: rev.reviewed_at ? new Date(rev.reviewed_at).toISOString() : null } : null
      });
    } catch (e) {
      console.error("[chess-works] student get submission error:", e);
      return res.status(500).json({ ok: false, error: "Failed to load submission" });
    }
  });

  // student history
  app.get("/api/public/students/:id/chess-works/history", async (req, res) => {
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    if (!(await requireDbReady(res))) return;
    try {
      const r = await pool.query(
        `SELECT r.work_id, r.marks, r.reviewed_at, w.title
         FROM chess_works_reviews r
         JOIN chess_works_works w ON w.org_id = r.org_id AND w.id = r.work_id
         WHERE r.org_id = $1 AND r.student_id = $2 AND r.finished = TRUE
         ORDER BY r.reviewed_at DESC NULLS LAST, r.updated_at DESC`,
        [String(auth.orgId), String(auth.studentId)]
      );
      const items = (r.rows || []).map((x) => ({
        workId: String(x.work_id),
        title: String(x.title || ""),
        marks: x.marks && typeof x.marks === "object" ? x.marks : [],
        reviewedAt: x.reviewed_at ? new Date(x.reviewed_at).toISOString() : null
      }));
      return res.json({ ok: true, items });
    } catch (e) {
      console.error("[chess-works] student history error:", e);
      return res.status(500).json({ ok: false, error: "Failed to load history" });
    }
  });
}

module.exports = { registerChessWorksPublicRoutes };
export {};
