(function () {
  "use strict";
  const MR = window.__MazeRunnerCore;
  if (!MR) {
    console.error("[maze-runner] Missing core.js (window.__MazeRunnerCore).");
    return;
  }

  const {
    escapeHtml,
    getUrlMode,
    setUrlMode,
    normalizeMode,
    renderShell,
    apiRequest,
    mrJson,
    getPublicStudentPassword
  } = MR;

  const DIFFICULTIES = [
    { key: "easy", label: "Easy" },
    { key: "medium", label: "Medium" },
    { key: "hard", label: "Hard" },
    { key: "extremelyhard", label: "Extremely Hard" },
    { key: "master", label: "Master" }
  ];

  const HOME_STORY = [
    "You step into a maze that *moves*.\nNot walls—rocks.\nNot floors—a chessboard.\nThey say only one white piece can slip through the shadow’s trap.",
    "In your palm sits your guide: a single white piece (K / Q / R / B / N / P).\nIt’s not a soldier. It’s *you*.\nEach move spends steps, and the maze never waits.",
    "Rocks block the way—no pushing, no breaking.\nBut a Knight can jump.\nYou learn fast: sometimes the best path isn’t forward… it’s a different kind of move.",
    "Then come the black pieces.\nThey don’t chase you—they *control squares*.\nStep onto a guarded tile and you’re in danger… unless you land there by capturing the black piece.",
    "A goal glows ahead like a quiet beacon.\nYou breathe in, steady your hands, and set the piece down.\nAlright.\nLet’s begin."
  ];

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
      const players = Array.isArray(window.mazeRunnerPlayers) ? window.mazeRunnerPlayers : [];
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
      const resp = await apiRequest(`/api/teachers/maze-runner/stages?difficulty=${encodeURIComponent(diff)}`, { method: "GET" });
      return await mrJson(resp);
    }
    const sid = getPublicStudentIdFromPlayers();
    const pwd = getPublicStudentPassword();
    const qp = new URLSearchParams();
    qp.set("difficulty", diff);
    if (pwd) qp.set("password", pwd);
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(sid)}/maze-runner/stages?${qp.toString()}`, { method: "GET" });
    return await mrJson(resp);
  }

  async function fetchStageDetail({ isTeacher, stageId }) {
    const id = String(stageId || "").trim();
    if (!id) throw new Error("Missing stageId");
    if (isTeacher) {
      const resp = await apiRequest(`/api/teachers/maze-runner/stages/${encodeURIComponent(id)}`, { method: "GET" });
      return await mrJson(resp);
    }
    const sid = getPublicStudentIdFromPlayers();
    const pwd = getPublicStudentPassword();
    const qp = new URLSearchParams();
    if (pwd) qp.set("password", pwd);
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(sid)}/maze-runner/stages/${encodeURIComponent(id)}?${qp.toString()}`, { method: "GET" });
    return await mrJson(resp);
  }

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
      <div class="mr-section-title">Maze Runner</div>
      <div class="mr-card" style="margin-top:12px;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
          <div style="font-weight:1000; color:#111827;">Story</div>
          <div class="mr-muted">${escapeHtml(String(idx + 1))} / ${escapeHtml(String(total))}</div>
        </div>
        <div class="mr-muted" style="margin-top:14px; line-height:1.75; text-align:center; font-size:200%; max-width:920px; margin-left:auto; margin-right:auto;">
          ${storyHtml}
        </div>

        <div style="display:flex; align-items:center; justify-content:center; min-height:150px; margin-top:12px;">
          ${isLast ? `
            <div style="display:flex; flex-direction:column; gap:12px; align-items:center; justify-content:center; width:100%;">
              <button type="button" class="mr-btn" data-mr-home-rules="1" style="width:280px; max-width:80vw;">Rules</button>
              <button type="button" class="mr-btn primary" data-mr-start-game="1" style="width:280px; max-width:80vw;">Start the Game</button>
            </div>
          ` : `
            <button type="button" class="mr-btn primary" data-mr-story-next="1" style="width:280px; max-width:80vw;">Next</button>
          `}
        </div>
      </div>
    `;
  }

  function renderChallenge() {
    return `
      <div class="mr-section-title">Challenge</div>
      <div class="mr-muted" style="margin-top:8px;">Coming soon.</div>
    `;
  }

  function renderSettings() {
    return `
      <div class="mr-section-title">Setting</div>
      <div class="mr-muted" style="margin-top:8px;">Customize the board colors.</div>
      <div class="mr-card" style="margin-top:12px;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; align-items:end;">
          <div>
            <div style="font-weight:950; color:#111827;">Light squares</div>
            <input id="mrSettingLight" type="color" style="margin-top:8px; width:100%; height:46px; border:none; background:transparent; padding:0;">
          </div>
          <div>
            <div style="font-weight:950; color:#111827;">Dark squares</div>
            <input id="mrSettingDark" type="color" style="margin-top:8px; width:100%; height:46px; border:none; background:transparent; padding:0;">
          </div>
        </div>
        <div class="mr-muted" style="margin-top:10px;">Preview</div>
        <div style="margin-top:10px;">
          <div class="mr-board" style="--mr-cell:40px; --mr-gap:2px; --mr-pad:2px; grid-template-columns: repeat(4, var(--mr-cell, 40px));">
            ${Array.from({ length: 16 }).map((_, i) => {
              const r = Math.floor(i / 4);
              const c = i % 4;
              const dark = (r + c) % 2 === 1;
              const cls = `mr-cell ${dark ? "is-dark" : ""}`.trim();
              return `<div class="${cls}" style="cursor:default;"></div>`;
            }).join("")}
          </div>
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; margin-top:14px;">
          <button id="mrSettingReset" type="button" class="mr-btn">Reset</button>
          <button id="mrSettingSave" type="button" class="mr-btn primary">Save</button>
        </div>
        <div id="mrSettingHint" class="mr-muted" style="margin-top:10px;"></div>
      </div>
    `;
  }

  function defaultStageConfig() {
    return {
      board: { rows: 6, cols: 6 },
      piece: { type: "N", start: { r: 5, c: 0 } },
      goals: [{ r: 0, c: 5 }],
      rocks: [],
      blacks: [],
      portals: [],
      maxSteps: 10
    };
  }

  async function createStage({ difficulty, config }) {
    const diff = normalizeDiff(difficulty);
    const resp = await apiRequest(`/api/teachers/maze-runner/stages`, {
      method: "POST",
      body: JSON.stringify({ difficulty: diff, config: config && typeof config === "object" ? config : {} })
    });
    return await mrJson(resp);
  }

  async function updateStage(stageId, config) {
    const id = String(stageId || "").trim();
    if (!id) throw new Error("Missing stageId");
    const resp = await apiRequest(`/api/teachers/maze-runner/stages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ config: config && typeof config === "object" ? config : {} })
    });
    return await mrJson(resp);
  }

  function renderBuilder({ difficulty, stages }) {
    const diff = normalizeDiff(difficulty);
    const list = Array.isArray(stages) ? stages : [];
    return `
      <div class="mr-toolbar">
        <div>
          <div class="mr-section-title">Builder</div>
          <div class="mr-muted" style="margin-top:6px;">Pick a difficulty bucket, then create stages.</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="mr-btn primary" data-mr-builder-create="1">Create</button>
        </div>
      </div>
      <div class="mr-diff-row" role="tablist" aria-label="Difficulty">
        ${DIFFICULTIES.map((d) => `
          <button type="button" class="mr-pill ${d.key === diff ? "is-active" : ""}" data-mr-builder-diff="${escapeHtml(d.key)}">${escapeHtml(d.label)}</button>
        `).join("")}
      </div>
      ${list.length ? `
        <div class="mr-stage-grid">
          ${list.map((s) => `
            <button type="button" class="mr-stage-card" data-mr-builder-edit="${escapeHtml(String(s.id || ''))}" title="Stage ${escapeHtml(String(s.stageNo ?? ""))}">
              ${escapeHtml(String(s.stageNo ?? ""))}
            </button>
          `).join("")}
        </div>
      ` : `
        <div class="mr-muted" style="padding:12px 2px;">No stages in this difficulty yet. Click Create.</div>
      `}
    `;
  }

  function openCreateStageModal({ root, difficulty, stage, onCreated }) {
    const diff = normalizeDiff(stage?.difficulty || difficulty);
    const isEdit = !!(stage && stage.id);
    const stageNo = stage?.stageNo != null ? Number(stage.stageNo) : null;
    let cfg = (stage && typeof stage.config === "object" && stage.config) ? stage.config : defaultStageConfig();
    let tool = "start"; // start | goal | portal | rock | black | erase
    let blackType = "P";
    let portalPending = null; // {r,c} awaiting pair placement

    const clampCfgToBoard = () => {
      const rows = Math.max(2, Number(cfg?.board?.rows || 6) || 6);
      const cols = Math.max(2, Number(cfg?.board?.cols || 6) || 6);
      const clamp = (rc) => ({
        r: Math.max(0, Math.min(rows - 1, Number(rc?.r || 0) || 0)),
        c: Math.max(0, Math.min(cols - 1, Number(rc?.c || 0) || 0))
      });
      cfg.board.rows = rows;
      cfg.board.cols = cols;
      cfg.piece.start = clamp(cfg.piece.start);
      // Back-compat: migrate legacy goal -> goals[]
      if (!Array.isArray(cfg.goals) || !cfg.goals.length) {
        if (cfg.goal && typeof cfg.goal === "object") cfg.goals = [cfg.goal];
        else cfg.goals = [{ r: 0, c: cols - 1 }];
      }
      cfg.goals = (Array.isArray(cfg.goals) ? cfg.goals : []).map(clamp).filter((x) => inBounds(x.r, x.c, rows, cols));
      if (!cfg.goals.length) cfg.goals = [{ r: 0, c: cols - 1 }].map(clamp);
      cfg.rocks = (Array.isArray(cfg.rocks) ? cfg.rocks : []).map(clamp).filter((x) => inBounds(x.r, x.c, rows, cols));
      cfg.blacks = (Array.isArray(cfg.blacks) ? cfg.blacks : []).map((b) => ({ type: String(b?.type || "P").toUpperCase(), ...clamp(b) }))
        .filter((x) => inBounds(x.r, x.c, rows, cols));
      cfg.portals = (Array.isArray(cfg.portals) ? cfg.portals : [])
        .map((p) => ({ a: p?.a ? clamp(p.a) : null, b: p?.b ? clamp(p.b) : null }))
        .filter((p) => p.a && p.b && !(p.a.r === p.b.r && p.a.c === p.b.c));
    };

    const pieceImgSrc = (color, type) => {
      const t = String(type || "").toUpperCase();
      const c = String(color || "").toLowerCase() === "b" ? "black" : "white";
      const map = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" };
      const nm = map[t] || "";
      if (!nm) return "";
      // Use Maze Runner local assets
      return `/application/maze-runner/images/pieces/${c}_${nm}.png`;
    };

    const renderCellContent = (r, c) => {
      if (cfg.piece.start.r === r && cfg.piece.start.c === c) {
        const src = pieceImgSrc("w", cfg.piece.type);
        return src ? `<img src="${escapeHtml(src)}" alt="White ${escapeHtml(cfg.piece.type)}">` : escapeHtml(iconWhite(cfg.piece.type));
      }
      const blk = (Array.isArray(cfg.blacks) ? cfg.blacks : []).find((b) => Number(b.r) === r && Number(b.c) === c);
      if (blk) {
        const src = pieceImgSrc("b", blk.type);
        return src ? `<img src="${escapeHtml(src)}" alt="Black ${escapeHtml(blk.type)}">` : escapeHtml(iconBlack(blk.type));
      }
      const isRock = (Array.isArray(cfg.rocks) ? cfg.rocks : []).some((x) => Number(x.r) === r && Number(x.c) === c);
      if (isRock) return `<img src="/application/maze-runner/images/pieces/rock_1.png" alt="Rock">`;
      const portalsMap = buildPortalsMap(cfg.portals);
      if (portalExit(portalsMap, r, c)) return `<span aria-hidden="true" style="font-size:18px;">🌀</span>`;
      const gi = (Array.isArray(cfg.goals) ? cfg.goals : []).findIndex((g) => Number(g.r) === r && Number(g.c) === c);
      if (gi >= 0) return `<span style="font-weight:1000; color:#16a34a;">G${gi + 1}</span>`;
      return "";
    };

    const renderBuilderBoard = () => {
      clampCfgToBoard();
      const rows = cfg.board.rows;
      const cols = cfg.board.cols;
      const colsCss = `repeat(${cols}, 36px)`;
      const cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dark = (r + c) % 2 === 1;
          const isRock = (Array.isArray(cfg.rocks) ? cfg.rocks : []).some((x) => Number(x.r) === r && Number(x.c) === c);
          const isGoal = (Array.isArray(cfg.goals) ? cfg.goals : []).some((g) => Number(g.r) === r && Number(g.c) === c);
          const classes = [
            "mr-cell",
            dark ? "is-dark" : "",
            isRock ? "is-rock" : "",
            isGoal ? "is-goal" : ""
          ].filter(Boolean).join(" ");
          cells.push(
            `<button type="button" class="${classes}" data-mr-bcell="${r}:${c}" aria-label="Cell ${r + 1},${c + 1}">${renderCellContent(r, c)}</button>`
          );
        }
      }
      return `<div class="mr-board" id="mrBuilderBoard" style="grid-template-columns:${colsCss};">${cells.join("")}</div>`;
    };

    const host = document.createElement("div");
    host.innerHTML = `
      <div class="vcp-modal-backdrop" id="mrCreateBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Create stage" style="width: calc(100vw - 40px); max-width: 1300px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">${isEdit ? `Edit Stage ${escapeHtml(String(stageNo ?? ''))}` : 'Create Stage'} (${escapeHtml(diffLabel(diff))})</div>
            <button id="mrCreateClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div class="mr-muted" style="margin-top:-4px;">Click tools below, then click the board to place.</div>
            <div style="display:grid; grid-template-columns: 420px 1fr; gap:14px; margin-top:12px; align-items:start;">
              <div>
                <div style="font-weight:950; color:#111827;">Settings</div>
                <div class="mr-card" style="margin-top:10px; background:#ffffff;">
                  <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
                    <div style="font-weight:950; color:#111827;">Board size</div>
                  </div>
                  <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap; align-items:center;">
                    <label class="mr-muted">Rows</label>
                    <input id="mrRows" type="number" min="2" step="1" value="${escapeHtml(String(cfg.board.rows))}" style="width:120px; padding:10px; border:1px solid #e5e7eb; border-radius:12px;">
                    <label class="mr-muted">Cols</label>
                    <input id="mrCols" type="number" min="2" step="1" value="${escapeHtml(String(cfg.board.cols))}" style="width:120px; padding:10px; border:1px solid #e5e7eb; border-radius:12px;">
                  </div>
                  <div class="mr-muted" style="margin-top:8px;">(No max limit, but huge boards may be slow.)</div>
                </div>

                <div class="mr-card" style="margin-top:12px; background:#ffffff;">
                  <div style="font-weight:950; color:#111827;">Piece</div>
                  <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap; align-items:center;">
                    <label class="mr-muted">Type</label>
                    <select id="mrPieceType" style="min-width:140px; padding:10px; border:1px solid #e5e7eb; border-radius:12px;">
                      <option value="K">K</option>
                      <option value="Q">Q</option>
                      <option value="R">R</option>
                      <option value="B">B</option>
                      <option value="N" selected>N</option>
                      <option value="P">P</option>
                    </select>
                  </div>
                </div>

                <div class="mr-card" style="margin-top:12px; background:#ffffff;">
                  <div style="font-weight:950; color:#111827;">Step limit</div>
                  <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap; align-items:center;">
                    <input id="mrInfinite" type="checkbox" style="width:18px; height:18px;">
                    <label for="mrInfinite" class="mr-muted">Infinite</label>
                  </div>
                  <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap; align-items:center;">
                    <input id="mrMaxSteps" type="number" min="1" step="1" value="${escapeHtml(String(cfg.maxSteps))}" style="width:180px; padding:10px; border:1px solid #e5e7eb; border-radius:12px;">
                    <span class="mr-muted">Min 1</span>
                  </div>
                </div>

                <div class="mr-card" style="margin-top:12px; background:#ffffff;">
                  <div style="font-weight:950; color:#111827;">Tools</div>
                  <div class="mr-tool-row">
                    <button type="button" class="mr-tool is-active" data-mr-tool="start">Start</button>
                    <button type="button" class="mr-tool" data-mr-tool="goal">Goal</button>
                    <button type="button" class="mr-tool" data-mr-tool="portal">Portal</button>
                    <button type="button" class="mr-tool" data-mr-tool="rock">Rock</button>
                    <button type="button" class="mr-tool" data-mr-tool="black">Black</button>
                    <button type="button" class="mr-tool" data-mr-tool="erase">Eraser</button>
                  </div>
                  <div id="mrBlackTool" style="display:none; margin-top:10px;">
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                      <label class="mr-muted">Black type</label>
                      <select id="mrBlackType" style="min-width:140px; padding:10px; border:1px solid #e5e7eb; border-radius:12px;">
                        <option value="K">K</option>
                        <option value="Q">Q</option>
                        <option value="R">R</option>
                        <option value="B">B</option>
                        <option value="N">N</option>
                        <option value="P" selected>P</option>
                      </select>
                    </div>
                  </div>
                  <div class="mr-muted" style="margin-top:10px;">
                    Rock blocks movement (cannot be captured). Black squares guard squares (cannot enter, except capturing the black piece).
                  </div>
                </div>
              </div>

              <div>
                <div style="font-weight:950; color:#111827;">Board</div>
                <div class="mr-card" style="margin-top:10px; background:#ffffff;">
                  <div id="mrBoardHolder">${renderBuilderBoard()}</div>
                  <div class="mr-muted" style="margin-top:10px;">
                    Start = white piece. Goals = G1, G2, ... (in order). Portal = 🌀 (place in pairs).
                  </div>
                </div>
              </div>
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; margin-top:16px;">
              <button id="mrCreateCancel" class="mr-btn" type="button">Cancel</button>
              <button id="mrCreateSave" class="mr-btn primary" type="button">${isEdit ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    root.appendChild(host);

    const close = () => { try { host.remove(); } catch {} };
    host.querySelector("#mrCreateClose")?.addEventListener("click", close);
    host.querySelector("#mrCreateCancel")?.addEventListener("click", close);
    host.querySelector("#mrCreateBackdrop")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "mrCreateBackdrop") close();
    });

    const toolBtns = Array.from(host.querySelectorAll("[data-mr-tool]"));
    const blackToolWrap = host.querySelector("#mrBlackTool");
    const blackTypeSel = host.querySelector("#mrBlackType");
    if (blackTypeSel) {
      blackTypeSel.value = blackType;
      blackTypeSel.addEventListener("change", () => {
        blackType = String(blackTypeSel.value || "P").trim().toUpperCase() || "P";
      });
    }
