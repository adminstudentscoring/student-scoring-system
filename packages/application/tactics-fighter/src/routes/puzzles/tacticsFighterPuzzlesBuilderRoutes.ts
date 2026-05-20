// Tactics Fighter teacher builder CRUD routes
"use strict";

function registerTacticsFighterPuzzlesBuilderRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;

  const { toCleanString, toRangeInt, parseUci, normalizeScore, nowIso, parseFenSideToMove,
    getTfSettings, requireDbReady, requirePublicStudent, normalizeBucket, resolveOrgId,
    pool, hasDb } = shared;

  // ===== Teacher: Builder CRUD (Postgres) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess && resolveOrgIdFromUser) {
    // Tree: categories + topics + subtopics (no puzzles yet; puzzles are fetched per subtopic)
    app.get(
      "/api/teachers/tactics-fighter/builder/tree",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const bucket = toCleanString(req.query?.bucket || 'beginner', 32) || 'beginner';

          const cats = await pool.query(
            `SELECT id, name, bucket, created_at, updated_at
             FROM tactics_fighter_categories
             WHERE org_id = $1 AND bucket = $2
             ORDER BY name ASC`,
            [orgId, bucket]
          );
          const catIds = (cats.rows || []).map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
          if (!catIds.length) return res.json({ ok: true, bucket, categories: [] });

          const topics = await pool.query(
            `SELECT id, category_id, name, created_at, updated_at
             FROM tactics_fighter_topics
             WHERE org_id = $1 AND category_id = ANY($2::bigint[])
             ORDER BY name ASC`,
            [orgId, catIds]
          );
          const topicIds = (topics.rows || []).map((t) => Number(t.id)).filter((n) => Number.isFinite(n));
          const subs = topicIds.length ? await pool.query(
            `SELECT id, topic_id, name, message, created_at, updated_at
             FROM tactics_fighter_subtopics
             WHERE org_id = $1 AND topic_id = ANY($2::bigint[])
             ORDER BY name ASC`,
            [orgId, topicIds]
          ) : { rows: [] };

          const subtopicIds = (subs.rows || []).map((s) => Number(s.id)).filter((n) => Number.isFinite(n));
          const countsRes = subtopicIds.length
            ? await pool.query(
                `SELECT subtopic_id, COUNT(*)::int AS cnt
                 FROM tactics_fighter_puzzles
                 WHERE org_id = $1 AND subtopic_id = ANY($2::bigint[])
                 GROUP BY subtopic_id`,
                [orgId, subtopicIds]
              )
            : { rows: [] };
          const cntBySub = new Map(
            (countsRes.rows || []).map((r) => [String(r.subtopic_id), Number(r.cnt || 0)])
          );

          const topicsByCat = new Map();
          for (const t of topics.rows || []) {
            const cid = String(t.category_id);
            if (!topicsByCat.has(cid)) topicsByCat.set(cid, []);
            topicsByCat.get(cid).push({
              id: String(t.id),
              name: String(t.name || ''),
              createdAt: t.created_at ? new Date(t.created_at).toISOString() : null,
              updatedAt: t.updated_at ? new Date(t.updated_at).toISOString() : null
            });
          }

          const subsByTopic = new Map();
          for (const s of subs.rows || []) {
            const tid = String(s.topic_id);
            if (!subsByTopic.has(tid)) subsByTopic.set(tid, []);
            subsByTopic.get(tid).push({
              id: String(s.id),
              name: String(s.name || ''),
              message: s.message == null ? '' : String(s.message),
              puzzleCount: cntBySub.get(String(s.id)) || 0,
              createdAt: s.created_at ? new Date(s.created_at).toISOString() : null,
              updatedAt: s.updated_at ? new Date(s.updated_at).toISOString() : null
            });
          }

          const out = (cats.rows || []).map((c) => {
            const cid = String(c.id);
            const catTopics = topicsByCat.get(cid) || [];
            return {
              id: cid,
              name: String(c.name || ''),
              bucket: String(c.bucket || bucket),
              createdAt: c.created_at ? new Date(c.created_at).toISOString() : null,
              updatedAt: c.updated_at ? new Date(c.updated_at).toISOString() : null,
              topics: catTopics.map((t) => ({
                ...t,
                subtopics: subsByTopic.get(String(t.id)) || []
              }))
            };
          });

          return res.json({ ok: true, bucket, categories: out });
        } catch (e) {
          console.error('[tactics-fighter] builder tree error:', e);
          const msg = String(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to load builder tree", details: msg });
        }
      }
    );

    // Categories
    app.post(
      "/api/teachers/tactics-fighter/builder/categories",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const name = toCleanString(req?.body?.name || '', 120);
          const bucket = toCleanString(req?.body?.bucket || 'beginner', 32) || 'beginner';
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const createdBy = req?.user?.id ? String(req.user.id) : null;
          const r = await pool.query(
            `INSERT INTO tactics_fighter_categories(org_id, bucket, name, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING id, bucket, name, created_at, updated_at`,
            [orgId, bucket, name, createdBy]
          );
          const row = r.rows?.[0];
          return res.json({ ok: true, category: { id: String(row.id), bucket: String(row.bucket || bucket), name: String(row.name), createdAt: row.created_at?.toISOString?.() || nowIso(), updatedAt: row.updated_at?.toISOString?.() || nowIso() } });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Category already exists" : "Create category failed" });
        }
      }
    );

    app.patch(
      "/api/teachers/tactics-fighter/builder/categories/:categoryId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.categoryId || '').trim();
          const hasName = Object.prototype.hasOwnProperty.call(req?.body || {}, 'name');
          const hasBucket = Object.prototype.hasOwnProperty.call(req?.body || {}, 'bucket');
          const name = hasName ? toCleanString(req?.body?.name || '', 120) : null;
          const rawBucket = hasBucket ? toCleanString(req?.body?.bucket || '', 32) : '';
          const bucket = hasBucket ? normalizeBucket(rawBucket) : null;
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
          if (!hasName && !hasBucket) return res.status(400).json({ ok: false, error: "Missing patch" });
          if (hasName && !name) return res.status(400).json({ ok: false, error: "Missing name" });
          if (hasBucket && !rawBucket) return res.status(400).json({ ok: false, error: "Missing bucket" });

          const r = await pool.query(
            `UPDATE tactics_fighter_categories
             SET
               name = COALESCE($1, name),
               bucket = COALESCE($2, bucket),
               updated_at = NOW()
             WHERE org_id = $3 AND id = $4
             RETURNING id, bucket, name, created_at, updated_at`,
            [name, bucket, orgId, id]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Not found" });
          return res.json({
            ok: true,
            category: {
              id: String(row.id),
              bucket: String(row.bucket || ''),
              name: String(row.name),
              createdAt: new Date(row.created_at).toISOString(),
              updatedAt: new Date(row.updated_at).toISOString()
            }
          });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Category already exists" : "Update failed" });
        }
      }
    );

    app.delete(
      "/api/teachers/tactics-fighter/builder/categories/:categoryId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.categoryId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(`DELETE FROM tactics_fighter_categories WHERE org_id = $1 AND id = $2`, [orgId, id]);
          return res.json({ ok: true, deleted: Number(r.rowCount || 0) });
        } catch (e) {
          return res.status(500).json({ ok: false, error: "Delete failed" });
        }
      }
    );

    // Topics
    app.post(
      "/api/teachers/tactics-fighter/builder/categories/:categoryId/topics",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const categoryId = String(req.params.categoryId || '').trim();
          const name = toCleanString(req?.body?.name || '', 120);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!categoryId) return res.status(400).json({ ok: false, error: "Missing categoryId" });
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const createdBy = req?.user?.id ? String(req.user.id) : null;
          const r = await pool.query(
            `INSERT INTO tactics_fighter_topics(org_id, category_id, name, created_by)
             SELECT $1, c.id, $3, $4
             FROM tactics_fighter_categories c
             WHERE c.org_id = $1 AND c.id = $2
             RETURNING id, category_id, name, created_at, updated_at`,
            [orgId, categoryId, name, createdBy]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Category not found" });
          return res.json({ ok: true, topic: { id: String(row.id), categoryId: String(row.category_id), name: String(row.name) } });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Topic already exists" : "Create topic failed" });
        }
      }
    );

    app.patch(
      "/api/teachers/tactics-fighter/builder/topics/:topicId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.topicId || '').trim();
          const name = toCleanString(req?.body?.name || '', 120);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const r = await pool.query(
            `UPDATE tactics_fighter_topics
             SET name = $1, updated_at = NOW()
             WHERE org_id = $2 AND id = $3
             RETURNING id, category_id, name, created_at, updated_at`,
            [name, orgId, id]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Not found" });
          return res.json({ ok: true, topic: { id: String(row.id), categoryId: String(row.category_id), name: String(row.name) } });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Topic already exists" : "Rename failed" });
        }
      }
    );

    app.delete(
      "/api/teachers/tactics-fighter/builder/topics/:topicId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.topicId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(`DELETE FROM tactics_fighter_topics WHERE org_id = $1 AND id = $2`, [orgId, id]);
          return res.json({ ok: true, deleted: Number(r.rowCount || 0) });
        } catch (e) {
          return res.status(500).json({ ok: false, error: "Delete failed" });
        }
      }
    );

    // Subtopics
    app.post(
      "/api/teachers/tactics-fighter/builder/topics/:topicId/subtopics",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const topicId = String(req.params.topicId || '').trim();
          const name = toCleanString(req?.body?.name || '', 120);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!topicId) return res.status(400).json({ ok: false, error: "Missing topicId" });
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const createdBy = req?.user?.id ? String(req.user.id) : null;
          const r = await pool.query(
            `INSERT INTO tactics_fighter_subtopics(org_id, topic_id, name, created_by)
             SELECT $1, t.id, $3, $4
             FROM tactics_fighter_topics t
             WHERE t.org_id = $1 AND t.id = $2
             RETURNING id, topic_id, name, created_at, updated_at`,
            [orgId, topicId, name, createdBy]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Topic not found" });
          return res.json({ ok: true, subtopic: { id: String(row.id), topicId: String(row.topic_id), name: String(row.name) } });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Subtopic already exists" : "Create subtopic failed" });
        }
      }
    );

    app.patch(
      "/api/teachers/tactics-fighter/builder/subtopics/:subtopicId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.subtopicId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
          const hasName = Object.prototype.hasOwnProperty.call(req?.body || {}, 'name');
          const hasMessage = Object.prototype.hasOwnProperty.call(req?.body || {}, 'message');
          if (!hasName && !hasMessage) return res.status(400).json({ ok: false, error: "Missing update fields" });

          const name = hasName ? toCleanString(req?.body?.name || '', 120) : null;
          if (hasName && !name) return res.status(400).json({ ok: false, error: "Missing name" });

          let message = null;
          if (hasMessage) {
            message = String(req?.body?.message ?? '');
            if (message.length > 2000) message = message.slice(0, 2000);
          }

          const sets = [];
          const vals = [];
          let i = 1;
          if (hasName) { sets.push(`name = $${i++}`); vals.push(name); }
          if (hasMessage) { sets.push(`message = $${i++}`); vals.push(message); }
          sets.push(`updated_at = NOW()`);
          vals.push(orgId);
          vals.push(id);

          const r = await pool.query(
            `UPDATE tactics_fighter_subtopics
             SET ${sets.join(', ')}
             WHERE org_id = $${i++} AND id = $${i++}
             RETURNING id, topic_id, name, message, created_at, updated_at`,
            vals
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Not found" });
          return res.json({
            ok: true,
            subtopic: {
              id: String(row.id),
              topicId: String(row.topic_id),
              name: String(row.name || ''),
              message: row.message == null ? '' : String(row.message)
            }
          });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Subtopic already exists" : "Rename failed" });
        }
      }
    );

    app.delete(
      "/api/teachers/tactics-fighter/builder/subtopics/:subtopicId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.subtopicId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(`DELETE FROM tactics_fighter_subtopics WHERE org_id = $1 AND id = $2`, [orgId, id]);
          return res.json({ ok: true, deleted: Number(r.rowCount || 0) });
        } catch (e) {
          return res.status(500).json({ ok: false, error: "Delete failed" });
        }
      }
    );

    // Puzzles under a subtopic
    app.get(
      "/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/puzzles",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const subtopicId = String(req.params.subtopicId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(
            `SELECT id, fen, message, solutions, created_at, updated_at
             FROM (
               SELECT id, fen, message, solutions, created_at, updated_at
               FROM tactics_fighter_puzzles
               WHERE org_id = $1 AND subtopic_id = $2
               ORDER BY created_at DESC, id DESC
               LIMIT 200
             ) x
             ORDER BY x.created_at ASC, x.id ASC`,
            [orgId, subtopicId]
          );
          const puzzles = (r.rows || []).map((p) => ({
            id: String(p.id),
            fen: String(p.fen || ''),
            message: String(p.message || ''),
            solutions: p.solutions || null,
            createdAt: p.created_at ? new Date(p.created_at).toISOString() : null,
            updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : null
          }));
          return res.json({ ok: true, puzzles });
        } catch (e) {
          console.error('[tactics-fighter] list puzzles error:', e);
          return res.status(500).json({ ok: false, error: "Failed to load puzzles" });
        }
      }
    );

    app.post(
      "/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/puzzles",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const subtopicId = String(req.params.subtopicId || '').trim();
          const fen = toCleanString(req?.body?.fen || '', 2000);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!subtopicId) return res.status(400).json({ ok: false, error: "Missing subtopicId" });
          if (!fen) return res.status(400).json({ ok: false, error: "Missing fen" });

          try { new Chess(fen); } catch { return res.status(400).json({ ok: false, error: "Invalid FEN" }); }

          const side = parseFenSideToMove(fen);
          const engineDepth = toRangeInt(req?.body?.engineDepth, 4, 22, 16);
          const multipv = toRangeInt(req?.body?.multipv, 1, 10, 1);
          const pvPlies = toRangeInt(req?.body?.pvPlies, 1, 32, 8);
          const message = toCleanString(req?.body?.message || '', 2000);
          const solutions = (req?.body?.solutions && typeof req.body.solutions === 'object') ? req.body.solutions : null;
          const meta = (req?.body?.meta && typeof req.body.meta === 'object') ? req.body.meta : null;
          const createdBy = req?.user?.id ? String(req.user.id) : null;

          const r = await pool.query(
            `INSERT INTO tactics_fighter_puzzles(org_id, subtopic_id, fen, side_to_move, engine_depth, multipv, pv_plies, message, solutions, meta, created_by)
             SELECT $1, s.id, $3, $4, $5, $6, $7, $8, $9, $10, $11
             FROM tactics_fighter_subtopics s
             WHERE s.org_id = $1 AND s.id = $2
             RETURNING id, fen, message, created_at, updated_at`,
            [orgId, subtopicId, fen, side, engineDepth, multipv, pvPlies, message || null, solutions ? JSON.stringify(solutions) : null, meta ? JSON.stringify(meta) : null, createdBy]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Subtopic not found" });
          return res.json({ ok: true, puzzle: { id: String(row.id), fen: String(row.fen), message: String(row.message || ''), createdAt: new Date(row.created_at).toISOString() } });
        } catch (e) {
          console.error('[tactics-fighter] create puzzle error:', e);
          return res.status(500).json({ ok: false, error: "Create puzzle failed" });
        }
      }
    );

    app.delete(
      "/api/teachers/tactics-fighter/builder/puzzles/:puzzleId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.puzzleId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing puzzleId" });
          const r = await pool.query(
            `DELETE FROM tactics_fighter_puzzles WHERE org_id = $1 AND id = $2`,
            [orgId, id]
          );
          return res.json({ ok: true, deleted: Number(r.rowCount || 0) });
        } catch (e) {
          console.error('[tactics-fighter] delete puzzle error:', e);
          return res.status(500).json({ ok: false, error: "Delete puzzle failed" });
        }
      }
    );

    // Update puzzle (e.g., re-run engine to change PV and save new solutions)
    app.patch(
      "/api/teachers/tactics-fighter/builder/puzzles/:puzzleId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.puzzleId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing puzzleId" });

          const message = (req?.body && Object.prototype.hasOwnProperty.call(req.body, 'message'))
            ? toCleanString(req.body.message || '', 2000)
            : null;
          const solutions = (req?.body?.solutions && typeof req.body.solutions === 'object') ? req.body.solutions : null;

          const wantsMessage = message !== null;
          const wantsSolutions = !!solutions;
          if (!wantsMessage && !wantsSolutions) return res.status(400).json({ ok: false, error: "Nothing to update" });

          const engineDepth = wantsSolutions ? toRangeInt(req?.body?.engineDepth, 4, 22, 16) : null;
          const multipv = wantsSolutions ? toRangeInt(req?.body?.multipv, 1, 10, 1) : null;
          const pvPlies = wantsSolutions ? toRangeInt(req?.body?.pvPlies, 1, 32, 8) : null;

          const r = await pool.query(
            `
            UPDATE tactics_fighter_puzzles
            SET
              engine_depth = COALESCE($1, engine_depth),
              multipv = COALESCE($2, multipv),
              pv_plies = COALESCE($3, pv_plies),
              solutions = COALESCE($4::jsonb, solutions),
              message = COALESCE($5, message),
              updated_at = NOW()
            WHERE org_id = $6 AND id = $7
            RETURNING id, fen, message, solutions, engine_depth, multipv, pv_plies, updated_at
            `,
            [
              (wantsSolutions ? engineDepth : null),
              (wantsSolutions ? multipv : null),
              (wantsSolutions ? pvPlies : null),
              (wantsSolutions ? JSON.stringify(solutions) : null),
              (wantsMessage ? (message || '') : null),
              orgId,
              id
            ]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Not found" });
          return res.json({
            ok: true,
            puzzle: {
              id: String(row.id),
              fen: String(row.fen || ''),
              message: String(row.message || ''),
              solutions: row.solutions || null,
              engineDepth: Number(row.engine_depth || (engineDepth || 0) || 0),
              multipv: Number(row.multipv || (multipv || 0) || 0),
              pvPlies: Number(row.pv_plies || (pvPlies || 0) || 0),
              updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso()
            }
          });
        } catch (e) {
          console.error('[tactics-fighter] update puzzle error:', e);
          const msg = String(e?.message || e);
          return res.status(500).json({ ok: false, error: "Update puzzle failed", details: msg });
        }
      }
    );
  }
}

module.exports = { registerTacticsFighterPuzzlesBuilderRoutes };
export {};
