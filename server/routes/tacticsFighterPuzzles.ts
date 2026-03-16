// Puzzle CRUD, generation, and fetching routes extracted from tacticsFighterRoutes.js
// Handles: public config, public student settings, public student engine analyze,
// public student apply-move, teacher builder CRUD, public student tree,
// public student puzzles, public student challenge ghost
"use strict";

function registerTacticsFighterPuzzlesRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;

  const {
    toCleanString, toRangeInt, parseUci, normalizeScore, nowIso, parseFenSideToMove,
    getTfSettings, requireDbReady, requirePublicStudent, normalizeBucket, resolveOrgId,
    pool, hasDb
  } = shared;

  // Public (used by game-window UI)
  app.get("/api/tactics-fighter/config", async (req, res) => {
    res.json({
      ok: true,
      app: "tactics-fighter",
      version: "v1",
      updatedAt: nowIso(),
      defaults: {
        stockfishDepthCap: 14
      },
      endpoints: {
        logAttempt: "/api/tactics-fighter/attempts",
        teacherAttempts: "/api/teachers/tactics-fighter/attempts",
        builderTree: "/api/teachers/tactics-fighter/builder/tree",
        engineAnalyze: "/api/teachers/tactics-fighter/engine/analyze"
      }
    });
  });

  // ===== Public Student: Settings (read-only) =====
  app.get("/api/public/students/:id/tactics-fighter/settings", async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;
      const s = await getTfSettings(ctx.orgId);
      return res.json({ ok: true, ...s });
    } catch (e) {
      console.error("[tactics-fighter] public settings get error:", e);
      return res.status(500).json({ ok: false, error: "Failed to load settings" });
    }
  });

  // ===== Public Student: Engine analyze (single best line) =====
  if (sfAnalyzeFen && Chess) {
    app.post('/api/public/students/:id/tactics-fighter/engine/analyze', async (req, res) => {
      try {
        const ctx = await requirePublicStudent(req, res);
        if (!ctx) return;
        if (!(await requireDbReady(res))) return;

        const fen = toCleanString(req?.body?.fen || '', 2000);
        if (!fen) return res.status(400).json({ ok: false, error: 'Missing fen' });

        try { new Chess(fen); } catch { return res.status(400).json({ ok: false, error: 'Invalid FEN' }); }

        const settings = await getTfSettings(ctx.orgId);
        const cap = toRangeInt(settings.stockfishDepthCap, 4, 22, 14);
        const depth = toRangeInt(req?.body?.depth, 4, cap, Math.min(12, cap));
        const pvPlies = toRangeInt(req?.body?.pvPlies, 1, 16, 6);
        const multipv = 1;

        const r = await sfAnalyzeFen(fen, { depth, multiPv: multipv, pvPlies });
        const lines = Array.isArray(r?.lines) ? r.lines : [];

        const withSan = lines.map((ln) => {
          const pvUci = Array.isArray(ln?.pv) ? ln.pv : [];
          const pvSan = [];
          try {
            const ch = new Chess(fen);
            for (const u of pvUci) {
              const mv = parseUci(u);
              if (!mv) break;
              const out = ch.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
              if (!out) break;
              pvSan.push(String(out.san || ''));
            }
          } catch {}
          return {
            multiPv: Number(ln?.multiPv || 1),
            score: normalizeScore(ln?.score),
            bestMove: ln?.bestMove ? String(ln.bestMove) : null,
            pvUci,
            pvSan
          };
        });

        return res.json({
          ok: true,
          fen,
          depth,
          multipv,
          pvPlies,
          bestMove: r?.bestMove ? String(r.bestMove) : null,
          lines: withSan
        });
      } catch (e) {
        console.error('[tactics-fighter] public engine analyze error:', e);
        return res.status(500).json({ ok: false, error: 'Engine analyze failed' });
      }
    });
  }

  // ===== Public Student: Apply move (UCI -> SAN + next FEN) =====
  if (Chess) {
    app.post('/api/public/students/:id/tactics-fighter/apply-move', async (req, res) => {
      try {
        const ctx = await requirePublicStudent(req, res);
        if (!ctx) return;

        const fen = toCleanString(req?.body?.fen || '', 2000);
        const uci = toCleanString(req?.body?.uci || '', 50).toLowerCase();
        if (!fen) return res.status(400).json({ ok: false, error: 'Missing fen' });
        if (!uci) return res.status(400).json({ ok: false, error: 'Missing uci' });

        let ch;
        try { ch = new Chess(fen); } catch { return res.status(400).json({ ok: false, error: 'Invalid FEN' }); }

        const mv = parseUci(uci);
        if (!mv) return res.status(400).json({ ok: false, error: 'Invalid UCI' });

        const out = ch.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
        if (!out) return res.status(400).json({ ok: false, error: 'Illegal move' });

        return res.json({
          ok: true,
          uci,
          san: String(out.san || ''),
          fenAfter: String(ch.fen() || '')
        });
      } catch (e) {
        console.error('[tactics-fighter] public apply-move error:', e);
        return res.status(500).json({ ok: false, error: 'Failed to apply move' });
      }
    });
  }

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

  // ----------------------------
  // Public Student APIs (bucket scoped)
  // ----------------------------

  app.get('/api/public/students/:id/tactics-fighter/tree', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const bucket = normalizeBucket(req.query?.bucket || 'beginner');
      const orgId = ctx.orgId;

      const catsRes = await pool.query(
        `SELECT id, name FROM tactics_fighter_categories WHERE org_id = $1 AND bucket = $2 ORDER BY name ASC`,
        [orgId, bucket]
      );
      const cats = catsRes.rows.map((r) => ({ id: String(r.id), name: String(r.name || ''), topics: [] }));
      const catIds = cats.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));

      const topicsRes = catIds.length ? await pool.query(
        `SELECT id, category_id, name FROM tactics_fighter_topics WHERE org_id = $1 AND category_id = ANY($2::bigint[]) ORDER BY name ASC`,
        [orgId, catIds]
      ) : { rows: [] };

      const topicsByCat = new Map();
      for (const t of topicsRes.rows) {
        const cid = String(t.category_id);
        if (!topicsByCat.has(cid)) topicsByCat.set(cid, []);
        topicsByCat.get(cid).push({ id: String(t.id), name: String(t.name || ''), subtopics: [] });
      }

      const topicIds = topicsRes.rows.map((t) => Number(t.id)).filter((n) => Number.isFinite(n));
      const subsRes = topicIds.length ? await pool.query(
        `SELECT id, topic_id, name FROM tactics_fighter_subtopics WHERE org_id = $1 AND topic_id = ANY($2::bigint[]) ORDER BY name ASC`,
        [orgId, topicIds]
      ) : { rows: [] };

      const subsByTopic = new Map();
      for (const s of subsRes.rows) {
        const tid = String(s.topic_id);
        if (!subsByTopic.has(tid)) subsByTopic.set(tid, []);
        subsByTopic.get(tid).push({ id: String(s.id), name: String(s.name || ''), puzzleCount: 0 });
      }

      const subtopicIds = subsRes.rows.map((s) => Number(s.id)).filter((n) => Number.isFinite(n));
      const countsRes = subtopicIds.length ? await pool.query(
        `SELECT subtopic_id, COUNT(*)::int AS cnt FROM tactics_fighter_puzzles WHERE org_id = $1 AND subtopic_id = ANY($2::bigint[]) GROUP BY subtopic_id`,
        [orgId, subtopicIds]
      ) : { rows: [] };
      const cntBySub = new Map(countsRes.rows.map((r) => [String(r.subtopic_id), Number(r.cnt || 0)]));

      for (const c of cats) {
        const topics = topicsByCat.get(String(c.id)) || [];
        for (const t of topics) {
          const subs = subsByTopic.get(String(t.id)) || [];
          for (const s of subs) {
            s.puzzleCount = cntBySub.get(String(s.id)) || 0;
          }
          t.subtopics = subs;
        }
        c.topics = topics;
      }

      return res.json({ ok: true, bucket, categories: cats });
    } catch (e) {
      console.error('[tactics-fighter] public tree error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to load tree' });
    }
  });

  app.get('/api/public/students/:id/tactics-fighter/subtopics/:subtopicId/puzzles', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const bucket = normalizeBucket(req.query?.bucket || 'beginner');
      const orgId = ctx.orgId;
      const studentId = ctx.studentId;
      const subtopicId = toRangeInt(req.params?.subtopicId, 1, 1_000_000_000, 0);
      if (!subtopicId) return res.status(400).json({ ok: false, error: 'Invalid subtopicId' });

      const okRes = await pool.query(
        `
        SELECT s.id AS subtopic_id, COALESCE(s.message, '') AS message
        FROM tactics_fighter_subtopics s
        JOIN tactics_fighter_topics t ON t.id = s.topic_id
        JOIN tactics_fighter_categories c ON c.id = t.category_id
        WHERE s.org_id = $1 AND s.id = $2 AND c.bucket = $3
        LIMIT 1
        `,
        [orgId, subtopicId, bucket]
      );
      if (!okRes.rows.length) return res.status(404).json({ ok: false, error: 'Subtopic not found' });
      const subtopicMessage = String(okRes.rows?.[0]?.message || '');

      const page = toRangeInt(req.query?.page, 1, 1000000, 1);
      const pageSize = toRangeInt(req.query?.pageSize, 1, 50, 10);
      const offset = (page - 1) * pageSize;

      const puzzlesRes = await pool.query(
        `
        SELECT id, fen, message, solutions, created_at
        FROM tactics_fighter_puzzles
        WHERE org_id = $1 AND subtopic_id = $2
        ORDER BY created_at ASC, id ASC
        LIMIT $3 OFFSET $4
        `,
        [orgId, subtopicId, pageSize, offset]
      );

      const totalRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM tactics_fighter_puzzles WHERE org_id = $1 AND subtopic_id = $2`,
        [orgId, subtopicId]
      );
      const total = Number(totalRes.rows?.[0]?.cnt || 0);

      const puzzleIds = puzzlesRes.rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
      const progRes = puzzleIds.length ? await pool.query(
        `
        SELECT puzzle_id, status, completed_at
        FROM tactics_fighter_student_progress
        WHERE org_id = $1 AND student_id = $2 AND puzzle_id = ANY($3::bigint[])
        `,
        [orgId, studentId, puzzleIds]
      ) : { rows: [] };
      const completedIds = new Set(progRes.rows.filter((r) => String(r.status) === 'completed').map((r) => String(r.puzzle_id)));

      const puzzles = puzzlesRes.rows.map((r) => ({
        id: String(r.id),
        fen: String(r.fen || ''),
        message: String(r.message || ''),
        solutions: r.solutions && typeof r.solutions === 'object' ? r.solutions : {},
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        completed: completedIds.has(String(r.id))
      }));

      return res.json({
        ok: true,
        bucket,
        subtopicId: String(subtopicId),
        subtopicMessage,
        page,
        pageSize,
        total,
        puzzles
      });
    } catch (e) {
      console.error('[tactics-fighter] public puzzles error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to load puzzles' });
    }
  });

  // ===== Public Student: Challenge - Dancing with your Ghost =====
  app.get('/api/public/students/:id/tactics-fighter/challenge/ghost', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const orgId = ctx.orgId;
      const studentId = ctx.studentId;
      const bucket = normalizeBucket(req.query?.bucket || 'beginner');
      const limit = toRangeInt(req.query?.limit, 1, 500, 120);

      const rowsRes = await pool.query(
        `
        SELECT
          z.id,
          z.fen,
          z.solutions,
          p.wrong_count,
          COALESCE((p.meta->>'ghostReplays')::int, 0) AS ghost_replays
        FROM tactics_fighter_student_progress p
        JOIN tactics_fighter_puzzles z ON z.id = p.puzzle_id AND z.org_id = p.org_id
        JOIN tactics_fighter_subtopics s ON s.id = z.subtopic_id AND s.org_id = z.org_id
        JOIN tactics_fighter_topics t ON t.id = s.topic_id AND t.org_id = s.org_id
        JOIN tactics_fighter_categories c ON c.id = t.category_id AND c.org_id = t.org_id
        WHERE
          p.org_id = $1
          AND p.student_id = $2
          AND c.bucket = $3
          AND p.wrong_count > 0
          AND COALESCE((p.meta->>'ghostReplays')::int, 0) < 3
        `,
        [orgId, studentId, bucket]
      );

      const rows = rowsRes.rows || [];
      if (!rows.length) return res.json({ ok: true, bucket, puzzles: [] });

      const g0 = [];
      const g1 = [];
      const g2 = [];
      for (const r of rows) {
        const gr = Number(r.ghost_replays || 0);
        const item = {
          id: String(r.id),
          fen: String(r.fen || ''),
          solutions: (r.solutions && typeof r.solutions === 'object') ? r.solutions : {},
          ghostReplays: Math.max(0, Math.min(2, gr))
        };
        if (gr <= 0) g0.push(item);
        else if (gr === 1) g1.push(item);
        else g2.push(item);
      }

      function shuffleInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
      }
      shuffleInPlace(g0); shuffleInPlace(g1); shuffleInPlace(g2);

      const out = [];
      while (out.length < limit && (g0.length || g1.length || g2.length)) {
        const choices = [];
        if (g0.length) choices.push({ w: 0.60, arr: g0 });
        if (g1.length) choices.push({ w: 0.30, arr: g1 });
        if (g2.length) choices.push({ w: 0.10, arr: g2 });
        const sum = choices.reduce((a, c) => a + c.w, 0);
        let r = Math.random() * (sum || 1);
        let picked = choices[choices.length - 1];
        for (const c of choices) {
          r -= c.w;
          if (r <= 0) { picked = c; break; }
        }
        const item = picked.arr.pop();
        if (item) out.push(item);
      }

      return res.json({ ok: true, bucket, puzzles: out });
    } catch (e) {
      console.error('[tactics-fighter] ghost challenge error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to load ghost puzzles' });
    }
  });
}

module.exports = { registerTacticsFighterPuzzlesRoutes };
