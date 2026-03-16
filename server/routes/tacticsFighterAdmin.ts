// Admin/builder routes extracted from tacticsFighterRoutes.js
// Handles: teacher debug, teacher settings, teacher engine analyze,
// teacher apply-move, teacher photo recognize
"use strict";

function registerTacticsFighterAdminRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;

  const {
    toCleanString, toRangeInt, parseUci, normalizeScore, nowIso,
    getTfSettings, upsertTfSettings, requireDbReady, resolveOrgId,
    pool, hasDb, parseFenSideToMove
  } = shared;

  // ===== Teacher debug: verify deployed routes (helps diagnose 404 on Railway) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    app.get(
      '/api/teachers/tactics-fighter/debug/routes',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      async (req, res) => {
        return res.json({
          ok: true,
          app: 'tactics-fighter',
          hasPhotoRecognize: true,
          endpoints: {
            photoUpload: '/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/photo-recognize/upload',
            photoJob: '/api/teachers/tactics-fighter/builder/photo-recognize/jobs/:jobId',
            photoFens: '/api/teachers/tactics-fighter/builder/photo-recognize/jobs/:jobId/fens'
          }
        });
      }
    );
  }

  // ===== Teacher: Settings (org-level) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess && resolveOrgIdFromUser) {
    app.get(
      "/api/teachers/tactics-fighter/settings",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!(await requireDbReady(res))) return;
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(403).json({ ok: false, error: "Missing orgId" });
          const s = await getTfSettings(orgId);
          return res.json({ ok: true, ...s });
        } catch (e) {
          console.error("[tactics-fighter] teacher settings get error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load settings" });
        }
      }
    );

    app.put(
      "/api/teachers/tactics-fighter/settings",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!(await requireDbReady(res))) return;
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(403).json({ ok: false, error: "Missing orgId" });
          const out = await upsertTfSettings(orgId, { stockfishDepthCap: req?.body?.stockfishDepthCap }, req?.user?.id || req?.user?.email || null);
          return res.json({ ok: true, ...out });
        } catch (e) {
          console.error("[tactics-fighter] teacher settings put error:", e);
          return res.status(500).json({ ok: false, error: "Failed to save settings" });
        }
      }
    );
  }

  // ===== Teacher: Engine analyze (MultiPV + PV length) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess && sfAnalyzeFen && Chess) {
    app.post(
      "/api/teachers/tactics-fighter/engine/analyze",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          const fen = toCleanString(req?.body?.fen || "", 2000);
          if (!fen) return res.status(400).json({ ok: false, error: "Missing fen" });

          try { new Chess(fen); } catch { return res.status(400).json({ ok: false, error: "Invalid FEN" }); }

          const orgId = await resolveOrgId(req).catch(() => null);
          const settings = await getTfSettings(orgId);
          const cap = toRangeInt(settings.stockfishDepthCap, 4, 22, 14);
          const depth = toRangeInt(req?.body?.depth, 4, cap, Math.min(16, cap));
          const multipv = toRangeInt(req?.body?.multipv, 1, 10, 1);
          const pvPlies = toRangeInt(req?.body?.pvPlies, 1, 32, 8);

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
          console.error('[tactics-fighter] analyze error:', e);
          return res.status(500).json({ ok: false, error: "Engine analyze failed" });
        }
      }
    );
  }

  // ===== Teacher: Apply move (UCI -> SAN + next FEN) =====
  if (Chess && authenticateUser && authorizeRole && requireOrganizationAccess) {
    app.post(
      '/api/teachers/tactics-fighter/apply-move',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      async (req, res) => {
        try {
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
          console.error('[tactics-fighter] teacher apply-move error:', e);
          return res.status(500).json({ ok: false, error: 'Failed to apply move' });
        }
      }
    );
  }

  // ===== Teacher: Photo Recognize (upload -> job -> fens) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    let multer = null;
    try { multer = require('multer'); } catch {}
    let OpenAI = null;
    try { OpenAI = require('openai'); } catch {}
    let sharp = null;
    try { sharp = require('sharp'); } catch {}

    const openAiKey = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
    const upload = multer ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }) : null;

    function makeId(prefix = 'job') {
      return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    }

    function isPdfMime(m) {
      const s = String(m || '').toLowerCase();
      return s === 'application/pdf' || s === 'application/x-pdf';
    }

    function bufferToDataUrl(file) {
      const mime = String(file?.mimetype || 'image/png');
      const b64 = Buffer.from(file?.buffer || Buffer.alloc(0)).toString('base64');
      return `data:${mime};base64,${b64}`;
    }

    function clampInt(n, min, max) {
      const x = Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : min;
      return Math.max(min, Math.min(max, x));
    }

    async function segmentBoardsFromImageBuffer(fileBuffer) {
      if (!sharp) return [];
      const base = sharp(fileBuffer, { failOnError: false });
      const meta = await base.metadata().catch(() => null);
      const w0 = Number(meta?.width || 0);
      const h0 = Number(meta?.height || 0);
      if (!w0 || !h0) return [];

      const targetW = w0 > 900 ? 900 : w0;
      const scale = targetW / w0;

      const resized = (targetW !== w0) ? base.clone().resize({ width: targetW }) : base.clone();
      const rawObj = await resized.clone().raw().toBuffer({ resolveWithObject: true }).catch(() => null);
      if (!rawObj || !rawObj.data || !rawObj.info) return [];
      const data = rawObj.data;
      const info = rawObj.info;
      const width = info.width;
      const height = info.height;
      const channels = info.channels;

      const xLimit = clampInt(Math.floor(width * 0.55), 1, width);
      const rowCount = new Array(height).fill(0);
      const lumThr = 240;
      for (let y = 0; y < height; y++) {
        let cnt = 0;
        const rowOff = y * width * channels;
        for (let x = 0; x < xLimit; x++) {
          const idx = rowOff + x * channels;
          const r = data[idx] || 0;
          const g = data[idx + 1] || 0;
          const b = data[idx + 2] || 0;
          const lum = (r * 3 + g * 4 + b) / 8;
          if (lum < lumThr) cnt++;
        }
        rowCount[y] = cnt;
      }

      const sorted = rowCount.slice().sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.50)] || 0;
      const p90 = sorted[Math.floor(sorted.length * 0.90)] || 0;
      const thrRow = Math.max(25, Math.floor(p50 + (p90 - p50) * 0.55));

      const segments = [];
      let start = -1;
      let gap = 0;
      const maxGap = 6;
      for (let y = 0; y < height; y++) {
        const on = rowCount[y] >= thrRow;
        if (on) {
          if (start === -1) start = y;
          gap = 0;
        } else if (start !== -1) {
          gap++;
          if (gap > maxGap) {
            const end = y - gap;
            segments.push({ start, end });
            start = -1;
            gap = 0;
          }
        }
      }
      if (start !== -1) segments.push({ start, end: height - 1 });

      const out = [];
      for (const seg of segments) {
        const hSeg = seg.end - seg.start + 1;
        if (hSeg < 40 || hSeg > 520) continue;

        const colCount = new Array(xLimit).fill(0);
        for (let y = seg.start; y <= seg.end; y++) {
          const rowOff = y * width * channels;
          for (let x = 0; x < xLimit; x++) {
            const idx = rowOff + x * channels;
            const r = data[idx] || 0;
            const g = data[idx + 1] || 0;
            const b = data[idx + 2] || 0;
            const lum = (r * 3 + g * 4 + b) / 8;
            if (lum < lumThr) colCount[x]++;
          }
        }
        const thrCol = Math.max(8, Math.floor(hSeg * 0.10));
        let x0 = -1;
        let x1 = -1;
        for (let x = 0; x < xLimit; x++) {
          if (colCount[x] >= thrCol) { x0 = x; break; }
        }
        for (let x = xLimit - 1; x >= 0; x--) {
          if (colCount[x] >= thrCol) { x1 = x; break; }
        }
        if (x0 === -1 || x1 === -1 || x1 <= x0) continue;
        const wSeg = x1 - x0 + 1;
        if (wSeg < 40) continue;

        const size = Math.min(wSeg, hSeg);
        const cy = (seg.start + seg.end) / 2;
        const cx = (x0 + x1) / 2;
        const topR = clampInt(Math.round(cy - size / 2), 0, height - size);
        const leftR = clampInt(Math.round(cx - size / 2), 0, width - size);

        const pad = 2;
        const leftO = clampInt(Math.floor(leftR / scale) - pad, 0, w0 - 1);
        const topO = clampInt(Math.floor(topR / scale) - pad, 0, h0 - 1);
        const sizeO = clampInt(Math.floor(size / scale) + pad * 2, 10, Math.min(w0 - leftO, h0 - topO));

        out.push({ left: leftO, top: topO, width: sizeO, height: sizeO });
        if (out.length >= 140) break;
      }

      const dedup = [];
      for (const c of out) {
        const overlaps = dedup.some((d) => {
          const ix = Math.max(0, Math.min(c.left + c.width, d.left + d.width) - Math.max(c.left, d.left));
          const iy = Math.max(0, Math.min(c.top + c.height, d.top + d.height) - Math.max(c.top, d.top));
          const inter = ix * iy;
          const area = Math.min(c.width * c.height, d.width * d.height);
          return area > 0 && inter / area > 0.65;
        });
        if (!overlaps) dedup.push(c);
      }

      return dedup;
    }

    function normalizeOpenAiBaseUrl(raw) {
      let u = String(raw || '').trim();
      if (!u) return 'https://api.openai.com/v1';
      u = u.replace(/\/+$/, '');
      if (/^https:\/\/api\.openai\.com$/i.test(u)) return 'https://api.openai.com/v1';
      if (!/\/v1$/i.test(u)) u = `${u}/v1`;
      return u;
    }

    async function openAiExtractFensFromImage({ imageDataUrl, defaultSide = 'w' }) {
      if (!OpenAI) throw new Error('OpenAI SDK not installed');
      if (!openAiKey) throw new Error('OPENAI_API_KEY not configured');
      const baseURL = normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL);
      const client = new OpenAI({ apiKey: openAiKey, baseURL });
      const model = String(process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini');

      const prompt = [
        'You are extracting chess positions from screenshots of chess puzzles.',
        'Return ONLY valid FEN lines, one per line. No numbering, no commentary.',
        'Each line MUST be a 6-field FEN: "<placement> <side> - - 0 1".',
        `If side-to-move is not explicitly stated in nearby text, use "${defaultSide}".`,
        'If there are multiple chess diagrams in the image, output one FEN per diagram, in top-to-bottom order.',
        'If a diagram is too small/unclear, skip it.'
      ].join('\n');

      const resp = await client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 2500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
            ]
          }
        ]
      });

      const text = String(resp?.choices?.[0]?.message?.content || '').trim();
      if (!text) return [];
      return text.split(/\r?\n/).map((l) => String(l || '').trim()).filter(Boolean);
    }

    function normalizeFenLine(s, defaultSide = 'w') {
      const line = String(s || '').trim();
      if (!line) return '';
      const parts = line.split(/\s+/);
      if (parts.length < 2) return '';
      const placement = parts[0];
      const side = (parts[1] === 'b') ? 'b' : (parts[1] === 'w') ? 'w' : (String(defaultSide) === 'b' ? 'b' : 'w');
      return `${placement} ${side} - - 0 1`;
    }

    function validateFenWithChessJs(fen) {
      try { new Chess(fen); return true; } catch { return false; }
    }

    app.post(
      '/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/photo-recognize/upload',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      ...(upload ? [upload.array('files', 20)] : []),
      async (req, res) => {
        try {
          if (!upload) return res.status(501).json({ ok: false, error: 'Upload not configured (multer missing)' });
          if (!(await requireDbReady(res))) return;

          const orgId = String(req.user.organizationId || req.organizationFilter || '');
          if (!orgId) return res.status(403).json({ ok: false, error: 'Missing org' });

          const subtopicId = toRangeInt(req.params?.subtopicId, 1, 1_000_000_000, 0);
          if (!subtopicId) return res.status(400).json({ ok: false, error: 'Invalid subtopicId' });

          const okRes = await pool.query(
            `SELECT id FROM tactics_fighter_subtopics WHERE org_id = $1 AND id = $2 LIMIT 1`,
            [orgId, subtopicId]
          );
          if (!okRes.rows.length) return res.status(404).json({ ok: false, error: 'Subtopic not found' });

          const files = Array.isArray(req.files) ? req.files : [];
          if (!files.length) return res.status(400).json({ ok: false, error: 'No files uploaded' });

          const jobId = makeId('tfpr');
          const createdBy = String(req.user.id || '');
          await pool.query(
            `INSERT INTO tf_photo_recognize_jobs (id, org_id, subtopic_id, created_by, status, total_files, updated_at)
             VALUES ($1, $2, $3, $4, 'queued', $5, NOW())`,
            [jobId, orgId, subtopicId, createdBy, files.length]
          );

          setTimeout(async () => {
            try {
              await pool.query(`UPDATE tf_photo_recognize_jobs SET status='running', message=NULL, updated_at=NOW() WHERE id=$1 AND org_id=$2`, [jobId, orgId]);
              let outIdx = 0;
              let totalFens = 0;
              let totalSegments = 0;
              const defaultSide = 'w';

              for (let fi = 0; fi < files.length; fi++) {
                const f = files[fi];
                const mime = String(f?.mimetype || '');
                if (isPdfMime(mime)) {
                  throw new Error('PDF upload is not supported in this build yet. Please convert PDF pages to images.');
                }

                const buf = Buffer.from(f?.buffer || Buffer.alloc(0));
                let crops = [];
                try { crops = await segmentBoardsFromImageBuffer(buf); } catch { crops = []; }
                if (!crops.length) {
                  crops = [{ left: 0, top: 0, width: null, height: null }];
                }

                for (let ci = 0; ci < crops.length; ci++) {
                  const c = crops[ci];
                  let imgBuf = buf;
                  if (sharp && c.width && c.height) {
                    imgBuf = await sharp(buf, { failOnError: false })
                      .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
                      .png()
                      .toBuffer();
                  }

                  const imageDataUrl = `data:image/png;base64,${imgBuf.toString('base64')}`;
                  const extracted = await openAiExtractFensFromImage({ imageDataUrl, defaultSide });
                  totalSegments += 1;

                  const normalized = extracted.map((x) => normalizeFenLine(x, defaultSide)).filter(Boolean);
                  const valid = normalized.filter(validateFenWithChessJs);

                  for (const fen of valid) {
                    await pool.query(
                      `INSERT INTO tf_photo_recognize_items(job_id, idx, fen, meta)
                       VALUES ($1, $2, $3, $4::jsonb)
                       ON CONFLICT (job_id, idx) DO NOTHING`,
                      [jobId, outIdx++, fen, JSON.stringify({
                        fileName: String(f?.originalname || ''),
                        fileIndex: fi,
                        cropIndex: ci,
                        crop: (c.width && c.height) ? c : null
                      })]
                    );
                  }

                  totalFens += valid.length;
                  await pool.query(
                    `UPDATE tf_photo_recognize_jobs SET total_segments=$3, total_fens=$4, updated_at=NOW() WHERE id=$1 AND org_id=$2`,
                    [jobId, orgId, totalSegments, totalFens]
                  );

                  if (outIdx >= 3000) break;
                }
                if (outIdx >= 3000) break;
              }

              await pool.query(
                `UPDATE tf_photo_recognize_jobs SET status='done', message=NULL, total_segments=$3, total_fens=$4, updated_at=NOW() WHERE id=$1 AND org_id=$2`,
                [jobId, orgId, totalSegments, totalFens]
              );
            } catch (e) {
              const msg = String(e?.message || e);
              console.error('[tactics-fighter] photo recognize job error:', msg);
              try {
                await pool.query(
                  `UPDATE tf_photo_recognize_jobs SET status='error', message=$3, updated_at=NOW() WHERE id=$1 AND org_id=$2`,
                  [jobId, orgId, msg.slice(0, 500)]
                );
              } catch {}
            }
          }, 30);

          return res.json({ ok: true, jobId });
        } catch (e) {
          console.error('[tactics-fighter] photo recognize upload error:', e);
          return res.status(500).json({ ok: false, error: 'Upload failed', details: String(e?.message || e) });
        }
      }
    );

    app.get(
      '/api/teachers/tactics-fighter/builder/photo-recognize/jobs/:jobId',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!(await requireDbReady(res))) return;
          const orgId = String(req.user.organizationId || req.organizationFilter || '');
          const jobId = toCleanString(req.params?.jobId || '', 200);
          if (!orgId || !jobId) return res.status(400).json({ ok: false, error: 'Missing org/jobId' });

          const r = await pool.query(
            `SELECT id, subtopic_id, status, message, total_files, total_segments, total_fens, created_at, updated_at
             FROM tf_photo_recognize_jobs WHERE org_id=$1 AND id=$2 LIMIT 1`,
            [orgId, jobId]
          );
          if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Job not found' });
          return res.json({ ok: true, job: r.rows[0] });
        } catch (e) {
          console.error('[tactics-fighter] photo recognize job status error:', e);
          return res.status(500).json({ ok: false, error: 'Failed to load job' });
        }
      }
    );

    app.get(
      '/api/teachers/tactics-fighter/builder/photo-recognize/jobs/:jobId/fens',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!(await requireDbReady(res))) return;
          const orgId = String(req.user.organizationId || req.organizationFilter || '');
          const jobId = toCleanString(req.params?.jobId || '', 200);
          const limit = toRangeInt(req.query?.limit, 1, 2000, 500);
          if (!orgId || !jobId) return res.status(400).json({ ok: false, error: 'Missing org/jobId' });

          const jr = await pool.query(`SELECT id FROM tf_photo_recognize_jobs WHERE org_id=$1 AND id=$2 LIMIT 1`, [orgId, jobId]);
          if (!jr.rows.length) return res.status(404).json({ ok: false, error: 'Job not found' });

          const items = await pool.query(
            `SELECT idx, fen FROM tf_photo_recognize_items WHERE job_id=$1 ORDER BY idx ASC LIMIT $2`,
            [jobId, limit]
          );
          const fens = (items.rows || []).map((r) => String(r.fen || '')).filter(Boolean);
          return res.json({ ok: true, jobId, fens, count: fens.length });
        } catch (e) {
          console.error('[tactics-fighter] photo recognize fens error:', e);
          return res.status(500).json({ ok: false, error: 'Failed to load fens' });
        }
      }
    );
  }
}

module.exports = { registerTacticsFighterAdminRoutes };
