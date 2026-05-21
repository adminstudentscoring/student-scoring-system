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
