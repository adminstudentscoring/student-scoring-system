// Chess Works teacher routes — review
"use strict";

function registerChessWorksTeacherReviewRoutes(app: any, shared: any): void {
  const {
    pool, requireDbReady, resolveOrgId, listOrgStudents, toCleanString, toIdString, nowIso,
    authenticateUser, authorizeRole, requireOrganizationAccess
  } = shared;

  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    // per-work students status (assigned students + submission/review)
    app.get(
      "/api/teachers/chess-works/works/:workId/students",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const workId = toIdString(req.params.workId || "");
          if (!workId) return res.status(400).json({ ok: false, error: "Missing workId" });

          const students = await listOrgStudents(orgId);
          const groupsR = await pool.query(
            `SELECT a.assigned_to_type, a.assigned_to_id
             FROM chess_works_assignments a
             WHERE a.org_id = $1 AND a.work_id = $2`,
            [String(orgId), Number(workId)]
          );
          const direct = new Set();
          const groupIds = new Set();
          for (const row of (groupsR.rows || [])) {
            const t = String(row.assigned_to_type || "");
            const id = String(row.assigned_to_id || "");
            if (t === "student") direct.add(id);
            if (t === "group") groupIds.add(id);
          }
          const members = new Set();
          if (groupIds.size) {
            const gids = Array.from(groupIds).map((x) => Number(x)).filter(Number.isFinite);
            if (gids.length) {
              const mR = await pool.query(
                `SELECT student_id FROM chess_works_group_members WHERE org_id = $1 AND group_id = ANY($2::bigint[])`,
                [String(orgId), gids]
              );
              for (const r0 of (mR.rows || [])) members.add(String(r0.student_id || ""));
            }
          }
          const assigned = new Set([...direct, ...members].map(String));

          const subR = await pool.query(
            `SELECT student_id, updated_at FROM chess_works_submissions WHERE org_id = $1 AND work_id = $2`,
            [String(orgId), Number(workId)]
          );
          const subMap = new Map((subR.rows || []).map((x) => [String(x.student_id || ""), x.updated_at ? new Date(x.updated_at).toISOString() : null]));

          const revR = await pool.query(
            `SELECT student_id, finished, updated_at FROM chess_works_reviews WHERE org_id = $1 AND work_id = $2`,
            [String(orgId), Number(workId)]
          );
          const revMap = new Map((revR.rows || []).map((x) => [String(x.student_id || ""), { finished: !!x.finished, updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : null }]));

          const out = students
            .filter((s) => assigned.has(String(s.id)))
            .map((s) => ({
              id: String(s.id),
              name: String(s.name || ""),
              hasSubmission: subMap.has(String(s.id)),
              submissionUpdatedAt: subMap.get(String(s.id)) || null,
              review: revMap.get(String(s.id)) || { finished: false, updatedAt: null }
            }));

          return res.json({ ok: true, students: out });
        } catch (e) {
          console.error("[chess-works] work students error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load students for work" });
        }
      }
    );

    // teacher: get a student's submission + review marks
    app.get(
      "/api/teachers/chess-works/works/:workId/submissions/:studentId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const workId = toIdString(req.params.workId || "");
          const studentId = toIdString(req.params.studentId || "");
          if (!workId || !studentId) return res.status(400).json({ ok: false, error: "Missing ids" });

          const sR = await pool.query(
            `SELECT answers, updated_at FROM chess_works_submissions WHERE org_id = $1 AND work_id = $2 AND student_id = $3 LIMIT 1`,
            [String(orgId), Number(workId), String(studentId)]
          );
          const sub = sR.rows?.[0] || null;
          const rR = await pool.query(
            `SELECT marks, finished, reviewed_at, updated_at
             FROM chess_works_reviews WHERE org_id = $1 AND work_id = $2 AND student_id = $3 LIMIT 1`,
            [String(orgId), Number(workId), String(studentId)]
          );
          const rev = rR.rows?.[0] || null;
          return res.json({
            ok: true,
            submission: sub ? { answers: sub.answers && typeof sub.answers === "object" ? sub.answers : {}, updatedAt: sub.updated_at ? new Date(sub.updated_at).toISOString() : null } : null,
            review: rev ? { marks: rev.marks && typeof rev.marks === "object" ? rev.marks : [], finished: !!rev.finished, reviewedAt: rev.reviewed_at ? new Date(rev.reviewed_at).toISOString() : null } : null
          });
        } catch (e) {
          console.error("[chess-works] get submission error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load submission" });
        }
      }
    );

    // teacher: upsert review
    app.patch(
      "/api/teachers/chess-works/works/:workId/reviews/:studentId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const workId = toIdString(req.params.workId || "");
          const studentId = toIdString(req.params.studentId || "");
          if (!workId || !studentId) return res.status(400).json({ ok: false, error: "Missing ids" });
          const marks = Array.isArray(req.body?.marks) ? req.body.marks : [];
          const finished = !!req.body?.finished;
          const reviewedBy = req?.user?.id ? String(req.user.id) : null;
          const marksJson = (() => {
            try { return JSON.stringify(marks); } catch { return "[]"; }
          })();
          await pool.query(
            `INSERT INTO chess_works_reviews(org_id, work_id, student_id, marks, finished, reviewed_by, reviewed_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, CASE WHEN $5 THEN NOW() ELSE NULL END, NOW())
             ON CONFLICT (org_id, work_id, student_id)
             DO UPDATE SET
               marks = EXCLUDED.marks,
               finished = EXCLUDED.finished,
               reviewed_by = EXCLUDED.reviewed_by,
               reviewed_at = CASE WHEN EXCLUDED.finished THEN NOW() ELSE chess_works_reviews.reviewed_at END,
               updated_at = NOW()`,
            [String(orgId), Number(workId), String(studentId), marksJson, finished, reviewedBy]
          );
          return res.json({ ok: true });
        } catch (e) {
          console.error("[chess-works] save review error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to save review", details: msg });
        }
      }
    );
  }
}

module.exports = { registerChessWorksTeacherReviewRoutes };
export {};
