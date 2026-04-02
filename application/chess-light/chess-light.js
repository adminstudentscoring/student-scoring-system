// Chess Light main (teacher + student)
(function () {
  "use strict";
  const CL = window.__ChessLightCore;
  if (!CL) {
    console.error("[chess-light] Missing core.js (window.__ChessLightCore).");
    return;
  }

  const {
    escapeHtml,
    getUrlMode,
    setUrlMode,
    normalizeMode,
    apiRequest,
    clJson,
    getPublicStudentPassword,
    renderShell
  } = CL;

  const DIFFICULTIES = [
    { key: "easy", label: "Easy" },
    { key: "medium", label: "Medium" },
    { key: "hard", label: "Hard" },
    { key: "extremelyhard", label: "Extremely Hard" },
    { key: "master", label: "Master" }
  ];

  const HOME_STORY = [
    `In the city of Slateblue, the streets are laid out like a chessboard—cold, quiet, and waiting. Tonight, the lamps have gone out, and the only way to bring the light back is to place your pieces with intention.`,
    `Here, light is not a glow you carry—it is a path you cast. Each piece shines along its attack lines, painting pale gold across the board wherever it can reach.`,
    `But there is a twist: your own square is never lit by your own power. A piece stands in shadow unless another ally’s line touches it. You will need harmony, not just strength.`,
    `Some squares have vanished from the map, like broken tiles in an old temple. They don’t block the light’s travel, but they change the shape of what must be illuminated—and what can be ignored.`,
    `And in the missing places, darkness hides its guardians. Black pieces block your rays, and their attacks forbid your placements. Outsmart the shadows, light every remaining square, and Slateblue will wake again.`
  ];

  function renderHome({ storyIndex = 0 } = {}) {
    const idx = Math.max(0, Math.min(4, Number(storyIndex) || 0));
    const total = HOME_STORY.length;
    const raw = HOME_STORY[idx] || "";
    const lines = String(raw)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const storyHtml = lines.map((ln) => `<div style="margin-top:10px;">${escapeHtml(ln)}</div>`).join("");
    const isLast = idx >= total - 1;

    return `
      <div style="font-weight:1000; color:var(--cl-ink);">Chess Light</div>
      <div class="cl-card" style="margin-top:12px;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
          <div style="font-weight:1000; color:var(--cl-ink);">Story</div>
          <div class="cl-muted">${escapeHtml(String(idx + 1))} / ${escapeHtml(String(total))}</div>
        </div>
        <div class="cl-muted" style="margin-top:14px; line-height:1.75; text-align:center; font-size:200%; max-width:920px; margin-left:auto; margin-right:auto;">
          ${storyHtml}
        </div>

        <div style="display:flex; align-items:center; justify-content:center; min-height:150px; margin-top:12px;">
          ${isLast ? `
            <div style="display:flex; flex-direction:column; gap:12px; align-items:center; justify-content:center; width:100%;">
              <button type="button" class="cl-btn" data-cl-home-rules="1" style="width:280px; max-width:80vw;">Rules</button>
              <button type="button" class="cl-btn primary" data-cl-start-game="1" style="width:280px; max-width:80vw;">Start the Game</button>
            </div>
          ` : `
            <button type="button" class="cl-btn primary" data-cl-story-next="1" style="width:280px; max-width:80vw;">Next</button>
          `}
        </div>
      </div>
    `;
  }

  function openRulesModal(root) {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="vcp-modal-backdrop" id="clRulesBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Rules" style="width: calc(100vw - 40px); max-width: 980px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Rules</div>
            <button id="clRulesClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div style="font-weight:950; color:var(--cl-ink);">Chess Light</div>
            <div class="cl-muted" style="margin-top:8px; line-height:1.55;">
              - Place the required white pieces on the board.<br>
              - A square is lit only if it is attacked by at least one <strong>other</strong> white piece.<br>
              - Your own square is <strong>not</strong> lit unless attacked by another piece.<br>
              - Removed cells disappear but do <strong>not</strong> block white attack lines.<br>
              - Black pieces block white attack lines, and squares attacked by black pieces cannot be used for placement.
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
              <button id="clRulesOk" type="button" class="cl-btn primary">OK</button>
            </div>
          </div>
        </div>
      </div>
    `;
    root.appendChild(host);
    const close = () => { try { host.remove(); } catch {} };
    host.querySelector("#clRulesClose")?.addEventListener("click", close);
    host.querySelector("#clRulesOk")?.addEventListener("click", close);
    host.querySelector("#clRulesBackdrop")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "clRulesBackdrop") close();
    });
  }

  function diffLabel(key) {
    const k = String(key || "").toLowerCase();
    return DIFFICULTIES.find((d) => d.key === k)?.label || k || "Easy";
  }

  function normalizeDiff(key) {
    const k = String(key || "").trim().toLowerCase();
    if (!k) return "easy";
    if (k === "extremely hard" || k === "extremely_hard" || k === "extremely-hard") return "extremelyhard";
    return DIFFICULTIES.some((d) => d.key === k) ? k : "easy";
  }

  function getPublicStudentIdFromPlayers() {
    try {
      const players = Array.isArray(window.chessLightPlayers) ? window.chessLightPlayers : [];
      return String(players?.[0]?.id || "").trim();
    } catch {}
    return "";
  }

  function setUrlParam(key, value) {
    try {
      const url = new URL(window.location.href);
      if (value == null || String(value).trim() === "") url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }

  function getUrlParam(key) {
    try {
      const url = new URL(window.location.href);
      return String(url.searchParams.get(key) || "");
    } catch {}
    return "";
  }

  async function fetchStages({ isTeacher, difficulty }) {
    const diff = normalizeDiff(difficulty);
    if (isTeacher) {
      const resp = await apiRequest(`/api/teachers/chess-light/stages?difficulty=${encodeURIComponent(diff)}`, { method: "GET" });
      return await clJson(resp);
    }
    const sid = getPublicStudentIdFromPlayers();
    const pwd = getPublicStudentPassword();
    const qp = new URLSearchParams();
    qp.set("difficulty", diff);
    if (pwd) qp.set("password", pwd);
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(sid)}/chess-light/stages?${qp.toString()}`, { method: "GET" });
    return await clJson(resp);
  }

  async function fetchStageDetail({ isTeacher, stageId }) {
    const id = String(stageId || "").trim();
    if (!id) throw new Error("Missing stageId");
    if (isTeacher) {
      const resp = await apiRequest(`/api/teachers/chess-light/stages/${encodeURIComponent(id)}`, { method: "GET" });
      return await clJson(resp);
    }
    const sid = getPublicStudentIdFromPlayers();
    const pwd = getPublicStudentPassword();
    const qp = new URLSearchParams();
    if (pwd) qp.set("password", pwd);
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(sid)}/chess-light/stages/${encodeURIComponent(id)}?${qp.toString()}`, { method: "GET" });
    return await clJson(resp);
  }

  async function createStage({ difficulty, config }) {
    const diff = normalizeDiff(difficulty);
    const resp = await apiRequest(`/api/teachers/chess-light/stages`, {
      method: "POST",
      body: JSON.stringify({ difficulty: diff, config: config && typeof config === "object" ? config : {} })
    });
    return await clJson(resp);
  }

  async function updateStage(stageId, config) {
    const id = String(stageId || "").trim();
    if (!id) throw new Error("Missing stageId");
    const resp = await apiRequest(`/api/teachers/chess-light/stages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ config: config && typeof config === "object" ? config : {} })
    });
    return await clJson(resp);
  }

  // ===== Config + rules =====
  const PIECE_TYPES = ["K", "Q", "R", "B", "N", "P"];
  function isPieceType(t) {
    return PIECE_TYPES.includes(String(t || "").toUpperCase());
  }

  function inBounds(r, c, rows, cols) {
    return r >= 0 && c >= 0 && r < rows && c < cols;
  }

  function keyOf(rc) {
    return `${Number(rc.r)}:${Number(rc.c)}`;
  }

  function computeCellPx({ rows, cols, targetPx = 520, gapPx = 2, padPx = 2 }) {
    const r = Math.max(1, Number(rows) || 1);
    const c = Math.max(1, Number(cols) || 1);
    const availW = targetPx - (padPx * 2) - (gapPx * Math.max(0, c - 1));
    const availH = targetPx - (padPx * 2) - (gapPx * Math.max(0, r - 1));
    const cellW = Math.floor(availW / c);
    const cellH = Math.floor(availH / r);
    return Math.max(12, Math.min(cellW, cellH));
  }

  function normalizeStageConfig(raw) {
    const cfg = raw && typeof raw === "object" ? raw : {};
    const rows = Math.max(3, Number(cfg?.board?.rows || 6) || 6);
    const cols = Math.max(3, Number(cfg?.board?.cols || 6) || 6);
    const pieces = Array.isArray(cfg?.pieces) ? cfg.pieces
      .map((p) => ({ type: String(p?.type || "").trim().toUpperCase() }))
      .filter((p) => isPieceType(p.type))
      : [];
    const piecesFixed = pieces.length ? pieces : [{ type: "N" }];
    const removed = Array.isArray(cfg?.removed) ? cfg.removed
      .map((x) => ({ r: Number(x?.r), c: Number(x?.c) }))
      .filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c) && inBounds(x.r, x.c, rows, cols))
      : [];
    const removedSet = new Set(removed.map(keyOf));
    const blacks = Array.isArray(cfg?.blacks) ? cfg.blacks
      .map((b) => ({ type: String(b?.type || "P").trim().toUpperCase(), r: Number(b?.r), c: Number(b?.c) }))
      .filter((b) => isPieceType(b.type) && Number.isFinite(b.r) && Number.isFinite(b.c) && inBounds(b.r, b.c, rows, cols))
      // black pieces can ONLY be on removed squares
      .filter((b) => removedSet.has(`${b.r}:${b.c}`))
      : [];
    return { board: { rows, cols }, pieces: piecesFixed, removed, blacks };
  }

  function buildRemovedSet(removed) {
    const s = new Set();
    for (const rc of (Array.isArray(removed) ? removed : [])) s.add(keyOf(rc));
    return s;
  }

  function buildBlacksMap(blacks) {
    const m = new Map();
    for (const b of (Array.isArray(blacks) ? blacks : [])) {
      m.set(`${Number(b.r)}:${Number(b.c)}`, { type: String(b.type || "P").toUpperCase(), r: Number(b.r), c: Number(b.c) });
    }
    return m;
  }

  function attacksForPiece({ type, from, rows, cols, occupiedSet }) {
    const t = String(type || "N").toUpperCase();
    const fr = Number(from?.r), fc = Number(from?.c);
    const occ = occupiedSet instanceof Set ? occupiedSet : new Set();
    const attacked = new Set();
    const add = (r, c) => { if (inBounds(r, c, rows, cols)) attacked.add(`${r}:${c}`); };
    const ray = (dr, dc) => {
      let r = fr + dr;
      let c = fc + dc;
      while (inBounds(r, c, rows, cols)) {
        add(r, c);
        if (occ.has(`${r}:${c}`)) break; // pieces block rays
        r += dr;
        c += dc;
      }
    };
    if (t === "K") {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) add(fr + dr, fc + dc);
      return attacked;
    }
    if (t === "N") {
      const ds = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      ds.forEach(([dr, dc]) => add(fr + dr, fc + dc));
      return attacked;
    }
    if (t === "P") {
      // white pawn attacks upward
      add(fr - 1, fc - 1);
      add(fr - 1, fc + 1);
      return attacked;
    }
    if (t === "R" || t === "Q") {
      ray(-1, 0); ray(1, 0); ray(0, -1); ray(0, 1);
    }
    if (t === "B" || t === "Q") {
      ray(-1, -1); ray(-1, 1); ray(1, -1); ray(1, 1);
    }
    return attacked;
  }

  function squaresAttackedByBlack({ blacks, rows, cols }) {
    const occ = buildBlacksMap(blacks);
    const attacked = new Set();
    const add = (r, c) => { if (inBounds(r, c, rows, cols)) attacked.add(`${r}:${c}`); };
    const ray = (r0, c0, dr, dc) => {
      let r = r0 + dr;
      let c = c0 + dc;
      while (inBounds(r, c, rows, cols)) {
        add(r, c);
        if (occ.get(`${r}:${c}`)) break; // other blacks block
        r += dr;
        c += dc;
      }
    };
    for (const b of (Array.isArray(blacks) ? blacks : [])) {
      const t = String(b.type || "P").toUpperCase();
      const r = Number(b.r), c = Number(b.c);
      if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
      if (t === "K") {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) add(r + dr, c + dc);
        continue;
      }
      if (t === "N") {
        const ds = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        ds.forEach(([dr, dc]) => add(r + dr, c + dc));
        continue;
      }
      if (t === "P") {
        // black pawn attacks downward (for symmetry)
        add(r + 1, c - 1);
        add(r + 1, c + 1);
        continue;
      }
      if (t === "R" || t === "Q") {
        ray(r, c, -1, 0); ray(r, c, 1, 0); ray(r, c, 0, -1); ray(r, c, 0, 1);
      }
      if (t === "B" || t === "Q") {
        ray(r, c, -1, -1); ray(r, c, -1, 1); ray(r, c, 1, -1); ray(r, c, 1, 1);
      }
    }
    return attacked;
  }

  function clPieceImgSrc(color, type) {
    const t = String(type || "").toUpperCase();
    const c = String(color || "").toLowerCase() === "b" ? "black" : "white";
    const map = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" };
    const nm = map[t] || "";
    if (!nm) return "";
    return `/application/chess-light/pieces/${c}_${nm}.png`;
  }

  function renderBoardHtml({ rows, cols, removedSet, forbiddenSet, highlightSet, piecesByCell, disableRemoved = false }) {
    const colsCss = `repeat(${cols}, var(--cl-cell, 36px))`;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dark = (r + c) % 2 === 1;
        const key = `${r}:${c}`;
        const isRemoved = removedSet.has(key);
        const isForbidden = forbiddenSet.has(key);
        const isHighlight = highlightSet.has(key);
        const p = piecesByCell.get(key) || null;
        const classes = [
          "cl-cell",
          dark ? "is-dark" : "",
          isRemoved ? "is-removed" : "",
          (!isRemoved && isForbidden) ? "is-forbidden" : "",
          (!isRemoved && isHighlight) ? "is-highlight" : ""
        ].filter(Boolean).join(" ");
        let inner = "";
        if (p) {
          const src = clPieceImgSrc(p.color || "w", p.type);
          inner = src
            ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(String(p.color || "w"))} ${escapeHtml(String(p.type || ""))}" style="width: calc(var(--cl-cell, 36px) - 10px); height: calc(var(--cl-cell, 36px) - 10px); object-fit:contain;">`
            : `<span style="font-weight:1000; color:#0f172a;">${escapeHtml(p.type)}</span>`;
        }
        const disabled = (disableRemoved && isRemoved) ? "disabled" : "";
        cells.push(`<button type="button" class="${classes}" data-cl-cell="${r}:${c}" ${disabled} aria-label="Cell ${r + 1},${c + 1}">${inner}</button>`);
      }
    }
    return `<div class="cl-board" style="grid-template-columns:${colsCss};">${cells.join("")}</div>`;
  }

  function renderStageList({ difficulty, stages }) {
    const diff = normalizeDiff(difficulty);
    const list = Array.isArray(stages) ? stages : [];
    return `
      <div class="cl-toolbar">
        <div></div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <div class="cl-badge">${escapeHtml(diffLabel(diff))}</div>
        </div>
      </div>
      <div class="cl-pill-row" role="tablist" aria-label="Difficulty">
        ${DIFFICULTIES.map((d) => `
          <button type="button" class="cl-pill ${d.key === diff ? "is-active" : ""}" data-cl-diff="${escapeHtml(d.key)}">${escapeHtml(d.label)}</button>
        `).join("")}
      </div>
      ${list.length ? `
        <div class="cl-stage-grid">
          ${list.map((s) => `
            <button type="button" class="cl-stage-card" data-cl-stage="${escapeHtml(String(s.id || ""))}" aria-label="Stage ${escapeHtml(String(s.stageNo ?? ""))}">
              ${escapeHtml(String(s.stageNo ?? ""))}
            </button>
          `).join("")}
        </div>
      ` : `
        <div class="cl-muted" style="padding:12px 2px;">No stages in this difficulty yet.</div>
      `}
    `;
  }

  function renderStagePlayShell({ stage }) {
    const st = stage && typeof stage === "object" ? stage : {};
    return `
      <div class="cl-toolbar">
        <div>
          <div style="font-weight:1000; color:var(--cl-ink);">Stage ${escapeHtml(String(st.stageNo ?? ""))}</div>
          <div class="cl-muted" style="margin-top:6px;">${escapeHtml(diffLabel(st.difficulty || ""))}</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="cl-btn" data-cl-back-stage="1">← Back</button>
        </div>
      </div>
      <div id="clStagePlayHost"></div>
    `;
  }

  function renderBuilder({ difficulty, stages }) {
    const diff = normalizeDiff(difficulty);
    const list = Array.isArray(stages) ? stages : [];
    return `
      <div class="cl-toolbar">
        <div>
          <div style="font-weight:1000; color:var(--cl-ink);">Builder</div>
          <div class="cl-muted" style="margin-top:6px;">Pick a difficulty bucket, then create stages.</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="cl-btn primary" data-cl-builder-create="1">Create</button>
        </div>
      </div>
      <div class="cl-pill-row" role="tablist" aria-label="Difficulty">
        ${DIFFICULTIES.map((d) => `
          <button type="button" class="cl-pill ${d.key === diff ? "is-active" : ""}" data-cl-builder-diff="${escapeHtml(d.key)}">${escapeHtml(d.label)}</button>
        `).join("")}
      </div>
      ${list.length ? `
        <div class="cl-stage-grid">
          ${list.map((s) => `
            <button type="button" class="cl-stage-card" data-cl-builder-edit="${escapeHtml(String(s.id || ""))}" title="Stage ${escapeHtml(String(s.stageNo ?? ""))}">
              ${escapeHtml(String(s.stageNo ?? ""))}
            </button>
          `).join("")}
        </div>
      ` : `
        <div class="cl-muted" style="padding:12px 2px;">No stages in this difficulty yet. Click Create.</div>
      `}
    `;
  }

  function openSuccessModal(root, opts = {}) {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="vcp-modal-backdrop" id="clSuccessBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Success" style="width: calc(100vw - 40px); max-width: 720px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Success</div>
            <button id="clSuccessClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div style="font-weight:1000; color:#16a34a; font-size:26px; letter-spacing:0.2px;">
              Congrats! You lit the whole board.
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px; flex-wrap:wrap;">
              <button id="clSuccessNext" type="button" class="cl-btn primary">Next</button>
            </div>
          </div>
        </div>
      </div>
    `;
    root.appendChild(host);
    const close = () => { try { host.remove(); } catch {} };
    host.querySelector("#clSuccessClose")?.addEventListener("click", close);
    host.querySelector("#clSuccessBackdrop")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "clSuccessBackdrop") close();
    });
    host.querySelector("#clSuccessNext")?.addEventListener("click", async () => {
      try { if (typeof opts.onNext === "function") await opts.onNext(); } finally { close(); }
    });
  }

  function openStageEditorModal({ root, difficulty, stage, onSaved }) {
    const diff = normalizeDiff(stage?.difficulty || difficulty);
    const isEdit = !!(stage && stage.id);
    const stageNo = stage?.stageNo != null ? Number(stage.stageNo) : null;
    let cfg = (stage && typeof stage.config === "object" && stage.config) ? stage.config : {};
    cfg = normalizeStageConfig(cfg);
    let tool = "remove"; // remove | black
    let blackType = "P";

    const host = document.createElement("div");
    host.innerHTML = `
      <div class="vcp-modal-backdrop" id="clEditBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Edit stage" style="width: calc(100vw - 40px); max-width: 1300px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">${isEdit ? `Edit Stage ${escapeHtml(String(stageNo ?? ""))}` : "Create Stage"} (${escapeHtml(diffLabel(diff))})</div>
            <button id="clEditClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div class="cl-muted" style="margin-top:-4px;">Configure the board, pieces, removed cells, and black pieces.</div>
            <div style="display:grid; grid-template-columns: 440px 1fr; gap:14px; margin-top:12px; align-items:start;">
              <div>
                <div style="font-weight:950; color:var(--cl-ink);">Settings</div>
                <div class="cl-card" style="margin-top:10px; background:#ffffff;">
                  <div style="font-weight:950; color:var(--cl-ink);">Board size</div>
                  <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap; align-items:center;">
                    <label class="cl-muted">Rows</label>
                    <input id="clRows" type="number" min="3" step="1" value="${escapeHtml(String(cfg.board.rows))}" style="width:120px; padding:10px; border:1px solid var(--cl-border); border-radius:12px;">
                    <label class="cl-muted">Cols</label>
                    <input id="clCols" type="number" min="3" step="1" value="${escapeHtml(String(cfg.board.cols))}" style="width:120px; padding:10px; border:1px solid var(--cl-border); border-radius:12px;">
                  </div>
                  <div class="cl-muted" style="margin-top:8px;">Min 3×3. No max limit (but huge boards may be slow).</div>
                </div>

                <div class="cl-card" style="margin-top:12px; background:#ffffff;">
                  <div style="font-weight:950; color:var(--cl-ink);">Pieces to place</div>
                  <div class="cl-muted" style="margin-top:8px;">Minimum 1. No max limit.</div>
                  <div id="clPiecesList" style="margin-top:10px;"></div>
                  <div style="display:flex; justify-content:flex-end; margin-top:10px;">
                    <button type="button" class="cl-btn" id="clAddPiece">+ Add piece</button>
                  </div>
                </div>

                <div class="cl-card" style="margin-top:12px; background:#ffffff;">
                  <div style="font-weight:950; color:var(--cl-ink);">Tools</div>
                  <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                    <button type="button" class="cl-btn" data-cl-tool="remove">Remove Cell</button>
                    <button type="button" class="cl-btn" data-cl-tool="black">Black Piece</button>
                  </div>
                  <div id="clBlackTool" style="display:none; margin-top:10px;">
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                      <label class="cl-muted">Black type</label>
                      <select id="clBlackType" style="min-width:140px; padding:10px; border:1px solid var(--cl-border); border-radius:12px;">
                        ${PIECE_TYPES.map((t) => `<option value="${escapeHtml(t)}"${t === "P" ? " selected" : ""}>${escapeHtml(t)}</option>`).join("")}
                      </select>
                    </div>
                    <div class="cl-muted" style="margin-top:8px;">Black pieces can only be placed on removed cells.</div>
                  </div>
                </div>
              </div>

              <div>
                <div style="font-weight:950; color:var(--cl-ink);">Board</div>
                <div class="cl-card" style="margin-top:10px; background:#ffffff;">
                  <div id="clBoardHolder"></div>
                  <div class="cl-muted" style="margin-top:10px;">
                    Removed cells disappear but do not block attack paths. Black pieces must sit on removed cells.
                  </div>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; margin-top:16px;">
              <button id="clEditCancel" class="cl-btn" type="button">Cancel</button>
              <button id="clEditSave" class="cl-btn primary" type="button">${isEdit ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    root.appendChild(host);
    const close = () => { try { host.remove(); } catch {} };
    host.querySelector("#clEditClose")?.addEventListener("click", close);
    host.querySelector("#clEditCancel")?.addEventListener("click", close);
    host.querySelector("#clEditBackdrop")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "clEditBackdrop") close();
    });

    const rowsInput = host.querySelector("#clRows");
    const colsInput = host.querySelector("#clCols");
    const blackTypeSel = host.querySelector("#clBlackType");
    const blackToolWrap = host.querySelector("#clBlackTool");
    const boardHolder = host.querySelector("#clBoardHolder");
    const piecesList = host.querySelector("#clPiecesList");

    const clampAll = () => {
      cfg.board.rows = Math.max(3, Number(cfg.board.rows || 3) || 3);
      cfg.board.cols = Math.max(3, Number(cfg.board.cols || 3) || 3);
      cfg.pieces = Array.isArray(cfg.pieces) ? cfg.pieces.filter((p) => isPieceType(p?.type)) : [{ type: "N" }];
      if (!cfg.pieces.length) cfg.pieces = [{ type: "N" }];
      cfg.removed = Array.isArray(cfg.removed) ? cfg.removed : [];
      cfg.blacks = Array.isArray(cfg.blacks) ? cfg.blacks : [];
      // keep in-bounds
      const rows = cfg.board.rows, cols = cfg.board.cols;
      const inb = (x) => inBounds(Number(x?.r), Number(x?.c), rows, cols);
      cfg.removed = cfg.removed.filter(inb).map((x) => ({ r: Number(x.r), c: Number(x.c) }));
      const removedSet = buildRemovedSet(cfg.removed);
      cfg.blacks = cfg.blacks.filter(inb).map((b) => ({ type: String(b.type || "P").toUpperCase(), r: Number(b.r), c: Number(b.c) }))
        .filter((b) => isPieceType(b.type) && removedSet.has(`${b.r}:${b.c}`));
    };

    const renderPieces = () => {
      if (!piecesList) return;
      const items = Array.isArray(cfg.pieces) ? cfg.pieces : [];
      piecesList.innerHTML = items.map((p, idx) => `
        <div style="display:flex; gap:10px; align-items:center; margin-top:${idx ? "10px" : "0"};">
          <div class="cl-badge">#${escapeHtml(String(idx + 1))}</div>
          <select data-cl-piece-idx="${escapeHtml(String(idx))}" style="min-width:120px; padding:10px; border:1px solid var(--cl-border); border-radius:12px;">
            ${PIECE_TYPES.map((t) => `<option value="${escapeHtml(t)}"${t === String(p.type || "N").toUpperCase() ? " selected" : ""}>${escapeHtml(t)}</option>`).join("")}
          </select>
          <button type="button" class="cl-btn" data-cl-piece-del="${escapeHtml(String(idx))}">Remove</button>
        </div>
      `).join("");
      piecesList.querySelectorAll("[data-cl-piece-idx]").forEach((sel) => {
        sel.addEventListener("change", () => {
          const i = Number(sel.getAttribute("data-cl-piece-idx"));
          const v = String(sel.value || "N").toUpperCase();
          if (cfg.pieces[i]) cfg.pieces[i].type = isPieceType(v) ? v : "N";
        });
      });
      piecesList.querySelectorAll("[data-cl-piece-del]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-cl-piece-del"));
          cfg.pieces.splice(i, 1);
          if (!cfg.pieces.length) cfg.pieces.push({ type: "N" });
          renderPieces();
        });
      });
    };

    const renderBoard = () => {
      clampAll();
      const rows = cfg.board.rows, cols = cfg.board.cols;
      const removedSet = buildRemovedSet(cfg.removed);
      const forbidden = squaresAttackedByBlack({ blacks: cfg.blacks, rows, cols });
      const piecesByCell = new Map();
      // show black pieces on removed cells
      for (const b of cfg.blacks) piecesByCell.set(`${b.r}:${b.c}`, { color: "b", type: String(b.type || "P").toUpperCase() });
      const cellPx = computeCellPx({ rows, cols, targetPx: 520, gapPx: 2, padPx: 2 });
      if (boardHolder) {
        boardHolder.innerHTML = `
          <div class="cl-board-wrap-520" style="--cl-cell:${escapeHtml(String(cellPx))}px; --cl-gap:2px; --cl-pad:2px;">
            ${renderBoardHtml({ rows, cols, removedSet, forbiddenSet: forbidden, highlightSet: new Set(), piecesByCell, disableRemoved: false })}
          </div>
        `;
      }
      bindBoardClicks();
    };

    const setTool = (t) => {
      tool = String(t || "remove");
      host.querySelectorAll("[data-cl-tool]").forEach((b) => {
        b.classList.toggle("primary", String(b.getAttribute("data-cl-tool")) === tool);
      });
      if (blackToolWrap) blackToolWrap.style.display = tool === "black" ? "block" : "none";
    };

    const bindBoardClicks = () => {
      const board = host.querySelector(".cl-board");
      if (!board) return;
      board.querySelectorAll("[data-cl-cell]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const rc = String(btn.getAttribute("data-cl-cell") || "");
          const m = rc.match(/^(\d+):(\d+)$/);
          if (!m) return;
          const r = Number(m[1]), c = Number(m[2]);
          const key = `${r}:${c}`;

          const removedSet = buildRemovedSet(cfg.removed);
          const blacksMap = buildBlacksMap(cfg.blacks);

          if (tool === "remove") {
            const exists = removedSet.has(key);
            if (exists) {
              // unremove: also remove black piece if exists (black only allowed on removed)
              cfg.removed = cfg.removed.filter((x) => !(Number(x.r) === r && Number(x.c) === c));
              cfg.blacks = cfg.blacks.filter((b) => !(Number(b.r) === r && Number(b.c) === c));
            } else {
              cfg.removed = [...cfg.removed, { r, c }];
            }
            renderBoard();
            return;
          }

          if (tool === "black") {
            // black can only be on removed cell
            if (!removedSet.has(key)) return;
            const existing = blacksMap.get(key);
            if (existing) {
              // toggle off if same type, else replace
              const nextType = String(blackType || "P").toUpperCase();
              if (String(existing.type) === nextType) cfg.blacks = cfg.blacks.filter((b) => !(Number(b.r) === r && Number(b.c) === c));
              else {
                cfg.blacks = cfg.blacks.filter((b) => !(Number(b.r) === r && Number(b.c) === c));
                cfg.blacks.push({ type: nextType, r, c });
              }
            } else {
              cfg.blacks.push({ type: String(blackType || "P").toUpperCase(), r, c });
            }
            renderBoard();
          }
        });
      });
    };

    rowsInput?.addEventListener("input", () => { cfg.board.rows = Math.max(3, Number(rowsInput.value || 3) || 3); renderBoard(); });
    colsInput?.addEventListener("input", () => { cfg.board.cols = Math.max(3, Number(colsInput.value || 3) || 3); renderBoard(); });
    blackTypeSel?.addEventListener("change", () => { blackType = String(blackTypeSel.value || "P").toUpperCase(); });

    host.querySelector("#clAddPiece")?.addEventListener("click", () => {
      cfg.pieces.push({ type: "N" });
      renderPieces();
    });

    host.querySelectorAll("[data-cl-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.getAttribute("data-cl-tool"))));
    setTool(tool);
    renderPieces();
    renderBoard();

    host.querySelector("#clEditSave")?.addEventListener("click", async () => {
      try {
        clampAll();
        if (isEdit) await updateStage(String(stage.id), cfg);
        else await createStage({ difficulty: diff, config: cfg });
        close();
        if (typeof onSaved === "function") onSaved();
      } catch (e) {
        alert(e?.message || String(e));
      }
    });
  }

  function renderPlayView({ stage, state }) {
    const cfg = normalizeStageConfig(stage?.config || {});
    const rows = cfg.board.rows, cols = cfg.board.cols;
    const removedSet = buildRemovedSet(cfg.removed);
    const forbidden = squaresAttackedByBlack({ blacks: cfg.blacks, rows, cols });
    const cellPx = computeCellPx({ rows, cols, targetPx: 520, gapPx: 2, padPx: 2 });

    const piecesByCell = new Map();
    for (const p of (Array.isArray(state.placed) ? state.placed : [])) {
      piecesByCell.set(`${p.r}:${p.c}`, { color: "w", type: String(p.type || "N").toUpperCase(), i: Number(p.i) });
    }
    // Display black pieces (they live on removed cells)
    for (const b of (Array.isArray(cfg.blacks) ? cfg.blacks : [])) {
      piecesByCell.set(`${Number(b.r)}:${Number(b.c)}`, { color: "b", type: String(b.type || "P").toUpperCase() });
    }

    // IMPORTANT RULE:
    // - Removed cells do not block attack paths (by themselves)
    // - BUT black pieces DO block white attack rays (even if they sit on removed cells)
    const occAll = new Set(Array.from(piecesByCell.keys()));

    // Persistent highlight: ALL placed pieces' attack lines stay lit.
    // NOTE: A piece does NOT light its own square automatically.
    const highlight = new Set();
    for (const p of (Array.isArray(state.placed) ? state.placed : [])) {
      const att = attacksForPiece({ type: p.type, from: p, rows, cols, occupiedSet: occAll });
      for (const k of att) if (!removedSet.has(k)) highlight.add(k);
    }

    // Lit squares (win condition): ONLY squares attacked by (any) white pieces.
    // A piece's own square only becomes lit if attacked by OTHER piece(s).
    const lit = new Set(highlight);
    const totalCells = rows * cols;
    const removedCount = removedSet.size;
    const targetCount = totalCells - removedCount;

    const inv = Array.isArray(cfg.pieces) ? cfg.pieces : [];
    const placedByI = new Map((Array.isArray(state.placed) ? state.placed : []).map((p) => [Number(p.i), p]));

    return `
      <div class="cl-toolbar" style="margin-top:0;">
        <div></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="cl-btn" data-cl-reset="1">Reset</button>
        </div>
      </div>

      <div class="cl-card" style="margin-top:12px;">
        <div class="cl-piece-row">
          ${inv.map((p, idx) => {
            const isActive = Number(state.activeI) === idx;
            const src = clPieceImgSrc("w", p.type);
            return `
              <button type="button" class="cl-btn ${isActive ? "primary" : ""}" data-cl-piece-slot="${escapeHtml(String(idx))}" aria-label="Piece ${escapeHtml(String(p.type || ""))}">
                <img src="${escapeHtml(src)}" alt="${escapeHtml(String(p.type || ""))}" style="width:22px; height:22px; object-fit:contain;">
              </button>
            `;
          }).join("")}
        </div>
      </div>

      <div class="cl-board-wrap-520" style="--cl-cell:${escapeHtml(String(cellPx))}px; --cl-gap:2px; --cl-pad:2px; margin-top:14px;">
        ${renderBoardHtml({ rows, cols, removedSet, forbiddenSet: forbidden, highlightSet: highlight, piecesByCell, disableRemoved: true })}
      </div>
    `;
  }

  window.initChessLight = async function initChessLight() {
    const root = document.getElementById("chessLightRoot");
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const role = String(params.get("role") || "");
    const isTeacher = role.toLowerCase() === "teacher";

    const ui = {
      mode: normalizeMode(getUrlMode() || "home", isTeacher),
      home: {
        storyIndex: 0
      },
      stage: {
        difficulty: normalizeDiff(getUrlParam("difficulty") || "easy"),
        view: "list",
        stages: [],
        stageId: "",
        stageDetail: null,
        playState: null
      }
    };

    root.innerHTML = renderShell({ role, mode: ui.mode });

    let mainRenderToken = 0;
    const setMain = (html) => {
      const el = document.getElementById("clMain");
      if (!el) return Promise.resolve();
      const token = ++mainRenderToken;
      el.classList.add("cl-fade", "is-out");
      return new Promise((resolve) => {
        setTimeout(() => {
          if (token !== mainRenderToken) return resolve();
          try { el.innerHTML = html; } catch {}
          requestAnimationFrame(() => {
            if (token !== mainRenderToken) return resolve();
            try { el.classList.remove("is-out"); } catch {}
            setTimeout(resolve, 260);
          });
        }, 120);
      });
    };

    const rerenderShell = () => {
      root.innerHTML = renderShell({ role, mode: ui.mode });
      bindNav();
    };

    async function loadStageList() {
      await setMain(`<div class="cl-muted">Loading...</div>`);
      try {
        const data = await fetchStages({ isTeacher, difficulty: ui.stage.difficulty });
        ui.stage.stages = Array.isArray(data?.stages) ? data.stages : [];
        ui.stage.view = "list";
        ui.stage.stageId = "";
        ui.stage.stageDetail = null;
        setUrlParam("difficulty", ui.stage.difficulty);
        setUrlParam("stageId", "");
        await setMain(renderStageList({ difficulty: ui.stage.difficulty, stages: ui.stage.stages }));
        bindStageHandlers();
      } catch (e) {
        await setMain(`<div class="cl-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function openStage(stageId) {
      ui.stage.stageId = String(stageId || "").trim();
      setUrlParam("stageId", ui.stage.stageId);
      await setMain(`<div class="cl-muted">Loading stage...</div>`);
      try {
        const data = await fetchStageDetail({ isTeacher, stageId: ui.stage.stageId });
        ui.stage.stageDetail = data?.stage || null;
        ui.stage.view = "play";
        await setMain(renderStagePlayShell({ stage: ui.stage.stageDetail }));
        bindStageHandlers();

        const cfg = normalizeStageConfig(ui.stage.stageDetail?.config || {});
        ui.stage.playState = {
          placed: [],
          activeI: 0
        };
        const host = document.getElementById("clStagePlayHost");
        if (host) host.innerHTML = renderPlayView({ stage: ui.stage.stageDetail, state: ui.stage.playState });
        bindPlayHandlers(cfg);
      } catch (e) {
        await setMain(`<div class="cl-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function rerenderMain() {
      if (ui.mode === "home") {
        await setMain(renderHome({ storyIndex: ui.home.storyIndex }));
        bindHomeHandlers();
        return;
      }
      if (ui.mode === "challenge") {
        await setMain(`<div class="cl-muted">Coming soon.</div>`);
        return;
      }
      if (ui.mode === "settings") {
        await setMain(`<div class="cl-muted">Coming soon.</div>`);
        return;
      }
      if (ui.mode === "stage") {
        const deep = String(getUrlParam("stageId") || "").trim();
        if (deep) return await openStage(deep);
        return await loadStageList();
      }
      // Builder
      if (!isTeacher) {
        await setMain(`<div class="cl-muted">Builder is for teachers only.</div>`);
        return;
      }
      await setMain(`<div class="cl-muted">Loading...</div>`);
      try {
        const data = await fetchStages({ isTeacher: true, difficulty: ui.stage.difficulty });
        ui.stage.stages = Array.isArray(data?.stages) ? data.stages : [];
        await setMain(renderBuilder({ difficulty: ui.stage.difficulty, stages: ui.stage.stages }));
        bindBuilderHandlers();
      } catch (e) {
        await setMain(`<div class="cl-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    function bindNav() {
      root.querySelectorAll(".cl-nav-btn[data-cl-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = String(btn.getAttribute("data-cl-mode") || "").trim().toLowerCase();
          const normalized = normalizeMode(next, isTeacher);
          if (normalized === ui.mode) return;
          ui.mode = normalized;
          setUrlMode(ui.mode);
          rerenderShell();
          void rerenderMain();
        });
      });
    }

    function bindHomeHandlers() {
      const main = root.querySelector("#clMain");
      if (!main) return;

      const nextBtn = main.querySelector('[data-cl-story-next="1"]');
      if (nextBtn) {
        nextBtn.addEventListener("click", async () => {
          ui.home.storyIndex = Math.min(4, Number(ui.home.storyIndex || 0) + 1);
          await setMain(renderHome({ storyIndex: ui.home.storyIndex }));
          bindHomeHandlers();
        });
      }

      const rulesBtn = main.querySelector('[data-cl-home-rules="1"]');
      if (rulesBtn) {
        rulesBtn.addEventListener("click", () => openRulesModal(root));
      }

      const startBtn = main.querySelector('[data-cl-start-game="1"]');
      if (startBtn) {
        startBtn.addEventListener("click", () => {
          ui.mode = "stage";
          ui.stage.difficulty = "easy";
          ui.home.storyIndex = 0;
          setUrlMode(ui.mode);
          setUrlParam("difficulty", ui.stage.difficulty);
          rerenderShell();
          void rerenderMain();
        });
      }
    }

    function bindStageHandlers() {
      root.querySelectorAll("[data-cl-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = normalizeDiff(btn.getAttribute("data-cl-diff"));
          if (next === ui.stage.difficulty) return;
          ui.stage.difficulty = next;
          loadStageList();
        });
      });
      root.querySelectorAll("[data-cl-stage]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = String(btn.getAttribute("data-cl-stage") || "").trim();
          if (!id) return;
          openStage(id);
        });
      });
      root.querySelectorAll("[data-cl-back-stage]").forEach((btn) => {
        btn.addEventListener("click", () => loadStageList());
      });
    }

    function bindBuilderHandlers() {
      root.querySelectorAll("[data-cl-builder-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = normalizeDiff(btn.getAttribute("data-cl-builder-diff"));
          if (next === ui.stage.difficulty) return;
          ui.stage.difficulty = next;
          rerenderMain();
        });
      });
      root.querySelectorAll("[data-cl-builder-create]").forEach((btn) => {
        btn.addEventListener("click", () => {
          openStageEditorModal({
            root,
            difficulty: ui.stage.difficulty,
            onSaved: () => rerenderMain()
          });
        });
      });
      root.querySelectorAll("[data-cl-builder-edit]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            const stageId = String(btn.getAttribute("data-cl-builder-edit") || "").trim();
            if (!stageId) return;
            const data = await fetchStageDetail({ isTeacher: true, stageId });
            const st = data?.stage || null;
            if (!st) return;
            openStageEditorModal({
              root,
              difficulty: String(st.difficulty || ui.stage.difficulty),
              stage: st,
              onSaved: () => rerenderMain()
            });
          } catch (e) {
            alert(e?.message || String(e));
          }
        });
      });
    }

    function bindPlayHandlers(cfg) {
      const host = document.getElementById("clStagePlayHost");
      if (!host) return;

      const rerenderPlay = () => {
        host.innerHTML = renderPlayView({ stage: ui.stage.stageDetail, state: ui.stage.playState });
        bindPlayHandlers(cfg);
      };

      const reset = () => {
        ui.stage.playState = { placed: [], activeI: 0 };
        rerenderPlay();
      };

      host.querySelectorAll("[data-cl-reset]").forEach((btn) => btn.addEventListener("click", () => reset()));

      host.querySelectorAll("[data-cl-piece-slot]").forEach((btn) => {
        btn.addEventListener("click", () => {
          ui.stage.playState.activeI = Number(btn.getAttribute("data-cl-piece-slot"));
          rerenderPlay();
        });
      });

      host.querySelectorAll("[data-cl-cell]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const rc = String(btn.getAttribute("data-cl-cell") || "");
          const m = rc.match(/^(\d+):(\d+)$/);
          if (!m) return;
          const r = Number(m[1]), c = Number(m[2]);

          const rows = cfg.board.rows, cols = cfg.board.cols;
          const removedSet = buildRemovedSet(cfg.removed);
          const forbidden = squaresAttackedByBlack({ blacks: cfg.blacks, rows, cols });
          const key = `${r}:${c}`;
          if (removedSet.has(key)) return;
          if (forbidden.has(key)) return; // cannot place on black-attacked squares

          const pieces = Array.isArray(ui.stage.playState.placed) ? ui.stage.playState.placed : [];
          // if clicking a square with an existing piece: select it
          const hit = pieces.find((p) => Number(p.r) === r && Number(p.c) === c);
          if (hit) {
            ui.stage.playState.activeI = Number(hit.i);
            rerenderPlay();
            return;
          }
          // cannot stack
          if (pieces.some((p) => Number(p.r) === r && Number(p.c) === c)) return;

          const i = Number(ui.stage.playState.activeI) || 0;
          const type = String(cfg.pieces[i]?.type || "N").toUpperCase();
          const existing = pieces.find((p) => Number(p.i) === i);
          if (existing) {
            existing.r = r;
            existing.c = c;
          } else {
            pieces.push({ i, type, r, c });
          }
          ui.stage.playState.placed = pieces;

          // win check:
          // - all required pieces are placed
          // - every non-removed square is lit by at least one white piece attack
          //   (a piece's own square is NOT lit unless attacked by other piece(s))
          const occ = new Set(pieces.map((p) => `${p.r}:${p.c}`));
          const occAll = new Set(Array.from(occ));
          // include black pieces as blockers (even on removed cells)
          for (const b of (Array.isArray(cfg.blacks) ? cfg.blacks : [])) {
            occAll.add(`${Number(b.r)}:${Number(b.c)}`);
          }
          const lit = new Set();
          for (const p of pieces) {
            const att = attacksForPiece({ type: p.type, from: p, rows, cols, occupiedSet: occAll });
            for (const k2 of att) if (!removedSet.has(k2)) lit.add(k2);
          }
          const targetCount = (rows * cols) - removedSet.size;
          const allPiecesPlaced = pieces.length >= cfg.pieces.length;
          if (allPiecesPlaced && lit.size >= targetCount) {
            openSuccessModal(root, {
              onNext: async () => {
                const curNo = Number(ui.stage.stageDetail?.stageNo || 0) || 0;
                const list = Array.isArray(ui.stage.stages) ? ui.stage.stages : [];
                const next = list.find((s) => Number(s.stageNo) === curNo + 1);
                if (next && next.id) await openStage(next.id);
              }
            });
          }

          rerenderPlay();
        });
      });
    }

    bindNav();
    await rerenderMain();
  };
})();

