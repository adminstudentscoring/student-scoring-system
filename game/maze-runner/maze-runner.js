// Maze Runner main (teacher + student shell)
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
    const storyHtml = lines.map((ln) => `<div style="margin-top:8px;">${escapeHtml(ln)}</div>`).join("");
    const isLast = idx >= total - 1;

    return `
      <div class="mr-section-title">Maze Runner</div>
      <div class="mr-card" style="margin-top:12px;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
          <div style="font-weight:1000; color:#111827;">Story</div>
          <div class="mr-muted">${escapeHtml(String(idx + 1))} / ${escapeHtml(String(total))}</div>
        </div>
        <div class="mr-muted" style="margin-top:12px; line-height:1.7;">
          ${storyHtml}
        </div>

        <div style="display:flex; align-items:center; justify-content:center; min-height:150px; margin-top:12px;">
          ${isLast ? `
            <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
              <button type="button" class="mr-btn" data-mr-home-rules="1" style="min-width:160px;">Rules</button>
              <button type="button" class="mr-btn primary" data-mr-start-game="1" style="min-width:220px;">Start the Game</button>
            </div>
          ` : `
            <button type="button" class="mr-btn primary" data-mr-story-next="1" style="min-width:200px;">Next</button>
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
      goal: { r: 0, c: 5 },
      rocks: [],
      blacks: [],
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
    let tool = "start"; // start | goal | rock | black | erase
    let blackType = "P";

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
      cfg.goal = clamp(cfg.goal);
      cfg.rocks = (Array.isArray(cfg.rocks) ? cfg.rocks : []).map(clamp).filter((x) => inBounds(x.r, x.c, rows, cols));
      cfg.blacks = (Array.isArray(cfg.blacks) ? cfg.blacks : []).map((b) => ({ type: String(b?.type || "P").toUpperCase(), ...clamp(b) }))
        .filter((x) => inBounds(x.r, x.c, rows, cols));
    };

    const pieceImgSrc = (color, type) => {
      const t = String(type || "").toUpperCase();
      const c = String(color || "").toLowerCase() === "b" ? "black" : "white";
      const map = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" };
      const nm = map[t] || "";
      if (!nm) return "";
      // Use Maze Runner local assets
      return `/game/maze-runner/images/pieces/${c}_${nm}.png`;
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
      if (isRock) return `<img src="/game/maze-runner/images/pieces/rock_1.png" alt="Rock">`;
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
          const isGoal = cfg.goal.r === r && cfg.goal.c === c;
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
                    Start = white piece. Goal = green outline. Rock = ⬛.
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

    const setTool = (t) => {
      tool = String(t || "start");
      toolBtns.forEach((b) => b.classList.toggle("is-active", String(b.getAttribute("data-mr-tool")) === tool));
      if (blackToolWrap) blackToolWrap.style.display = tool === "black" ? "block" : "none";
    };
    toolBtns.forEach((b) => b.addEventListener("click", () => setTool(b.getAttribute("data-mr-tool"))));
    setTool(tool);

    const rowsInput = host.querySelector("#mrRows");
    const colsInput = host.querySelector("#mrCols");
    const pieceSel = host.querySelector("#mrPieceType");
    const boardHolder = host.querySelector("#mrBoardHolder");
    const infiniteCb = host.querySelector("#mrInfinite");
    const maxStepsInput = host.querySelector("#mrMaxSteps");

    const renderToDom = () => {
      if (pieceSel) pieceSel.value = String(cfg.piece.type || "N");
      if (rowsInput) rowsInput.value = String(cfg.board.rows);
      if (colsInput) colsInput.value = String(cfg.board.cols);
      if (infiniteCb) infiniteCb.checked = cfg.maxSteps == null;
      if (maxStepsInput) {
        maxStepsInput.disabled = cfg.maxSteps == null;
        maxStepsInput.value = cfg.maxSteps == null ? "" : String(cfg.maxSteps);
      }
      if (boardHolder) boardHolder.innerHTML = renderBuilderBoard();
      bindBoardClicks();
    };

    const removeRockAt = (r, c) => {
      cfg.rocks = (Array.isArray(cfg.rocks) ? cfg.rocks : []).filter((x) => !(Number(x.r) === r && Number(x.c) === c));
    };
    const removeBlackAt = (r, c) => {
      cfg.blacks = (Array.isArray(cfg.blacks) ? cfg.blacks : []).filter((x) => !(Number(x.r) === r && Number(x.c) === c));
    };

    const bindBoardClicks = () => {
      const board = host.querySelector("#mrBuilderBoard");
      if (!board) return;
      board.querySelectorAll("[data-mr-bcell]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const rc = String(btn.getAttribute("data-mr-bcell") || "");
          const m = rc.match(/^(\d+):(\d+)$/);
          if (!m) return;
          const r = Number(m[1]), c = Number(m[2]);
          // apply tool
          if (tool === "start") {
            // cannot place start on rock
            removeRockAt(r, c);
            removeBlackAt(r, c);
            cfg.piece.start = { r, c };
            // if goal overlaps start, keep it (allowed) but typically not desired; let teacher decide
            renderToDom();
            return;
          }
          if (tool === "goal") {
            // cannot place goal on rock
            removeRockAt(r, c);
            cfg.goal = { r, c };
            renderToDom();
            return;
          }
          if (tool === "rock") {
            // cannot place rock on start/goal
            if ((cfg.piece.start.r === r && cfg.piece.start.c === c) || (cfg.goal.r === r && cfg.goal.c === c)) return;
            const exists = (Array.isArray(cfg.rocks) ? cfg.rocks : []).some((x) => Number(x.r) === r && Number(x.c) === c);
            if (exists) removeRockAt(r, c);
            else cfg.rocks = [...(Array.isArray(cfg.rocks) ? cfg.rocks : []), { r, c }];
            // remove any black on rock
            removeBlackAt(r, c);
            renderToDom();
            return;
          }
          if (tool === "black") {
            // cannot place black on start; allow on goal (capture on goal is possible)
            if (cfg.piece.start.r === r && cfg.piece.start.c === c) return;
            // cannot place black on rock
            const rockExists = (Array.isArray(cfg.rocks) ? cfg.rocks : []).some((x) => Number(x.r) === r && Number(x.c) === c);
            if (rockExists) return;
            // place/replace
            removeBlackAt(r, c);
            cfg.blacks = [...(Array.isArray(cfg.blacks) ? cfg.blacks : []), { type: blackType, r, c }];
            renderToDom();
            return;
          }
          if (tool === "erase") {
            removeRockAt(r, c);
            removeBlackAt(r, c);
            // do not erase start/goal with eraser (keep stable)
            renderToDom();
          }
        });
      });
    };

    rowsInput?.addEventListener("input", () => {
      cfg.board.rows = Math.max(2, Number(rowsInput.value || 2) || 2);
      renderToDom();
    });
    colsInput?.addEventListener("input", () => {
      cfg.board.cols = Math.max(2, Number(colsInput.value || 2) || 2);
      renderToDom();
    });
    pieceSel?.addEventListener("change", () => {
      cfg.piece.type = String(pieceSel.value || "N").trim().toUpperCase() || "N";
      renderToDom();
    });
    infiniteCb?.addEventListener("change", () => {
      if (infiniteCb.checked) cfg.maxSteps = null;
      else cfg.maxSteps = Math.max(1, Number(maxStepsInput?.value || 10) || 10);
      renderToDom();
    });
    maxStepsInput?.addEventListener("input", () => {
      if (cfg.maxSteps == null) return;
      const v = String(maxStepsInput.value ?? "").trim();
      cfg.maxSteps = v ? Math.max(1, Number(v) || 1) : 1;
    });

    renderToDom();

    host.querySelector("#mrCreateSave")?.addEventListener("click", async () => {
      try {
        clampCfgToBoard();
        if (isEdit) {
          await updateStage(String(stage.id), cfg);
        } else {
          await createStage({ difficulty: diff, config: cfg });
        }
        close();
        if (typeof onCreated === "function") onCreated();
      } catch (e) {
        // simple inline alert for now
        alert(e?.message || String(e));
      }
    });
  }

  function renderStageList({ difficulty, stages }) {
    const diff = normalizeDiff(difficulty);
    const list = Array.isArray(stages) ? stages : [];
    const pickerHidden = !!stages?.__hideDiffPicker; // internal flag
    return `
      <div class="mr-toolbar">
        <div></div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <div class="mr-badge">${escapeHtml(diffLabel(diff))}</div>
          <button type="button" class="mr-btn" data-mr-change-diff="1" style="display:${pickerHidden ? "inline-flex" : "none"};">Change</button>
        </div>
      </div>
      <div class="mr-diff-picker ${pickerHidden ? "is-hidden" : ""}">
        <div class="mr-diff-grid" role="tablist" aria-label="Difficulty">
          ${DIFFICULTIES.map((d) => `
            <button type="button" class="mr-diff-square ${d.key === diff ? "is-active" : ""}" data-mr-diff="${escapeHtml(d.key)}">${escapeHtml(d.label)}</button>
          `).join("")}
        </div>
      </div>
      ${list.length ? `
        <div class="mr-stage-grid">
          ${list.map((s) => `
            <button type="button" class="mr-stage-card ${s.__isComplete ? "is-complete" : ""}" data-mr-stage="${escapeHtml(String(s.id || ""))}" aria-label="Stage ${escapeHtml(String(s.stageNo ?? ""))}">
              ${escapeHtml(String(s.stageNo ?? ""))}
            </button>
          `).join("")}
        </div>
      ` : `
        <div class="mr-muted" style="padding:12px 2px;">No stages in this difficulty yet.</div>
      `}
    `;
  }

  function renderStagePlayShell({ stage }) {
    const st = stage && typeof stage === "object" ? stage : {};
    return `
      <div class="mr-toolbar">
        <div>
          <div class="mr-section-title">Stage ${escapeHtml(String(st.stageNo ?? ""))}</div>
          <div class="mr-muted" style="margin-top:6px;">${escapeHtml(diffLabel(st.difficulty || ""))}</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="mr-btn" data-mr-back-stage="1">← Back</button>
        </div>
      </div>
      <div id="mrStagePlayHost"></div>
    `;
  }

  function inBounds(r, c, rows, cols) {
    return r >= 0 && c >= 0 && r < rows && c < cols;
  }

  function posEq(a, b) {
    return !!a && !!b && Number(a.r) === Number(b.r) && Number(a.c) === Number(b.c);
  }

  function keyOf(rc) {
    return `${Number(rc.r)}:${Number(rc.c)}`;
  }

  function iconWhite(type) {
    const t = String(type || "").toUpperCase();
    const map = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" };
    return map[t] || t || "♙";
  }

  function iconBlack(type) {
    const t = String(type || "").toUpperCase();
    const map = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
    return map[t] || t || "♟";
  }

  function mrPieceImgSrc(color, type) {
    const t = String(type || "").toUpperCase();
    const c = String(color || "").toLowerCase() === "b" ? "black" : "white";
    const map = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" };
    const nm = map[t] || "";
    if (!nm) return "";
    return `/game/maze-runner/images/pieces/${c}_${nm}.png`;
  }

  function mrRockImgSrc() {
    return "/game/maze-runner/images/pieces/rock_1.png";
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
    const rows = Math.max(2, Number(cfg?.board?.rows || 6) || 6);
    const cols = Math.max(2, Number(cfg?.board?.cols || 6) || 6);
    const pieceType = String(cfg?.piece?.type || "N").trim().toUpperCase() || "N";
    const start = {
      r: Math.max(0, Math.min(rows - 1, Number(cfg?.piece?.start?.r || rows - 1) || 0)),
      c: Math.max(0, Math.min(cols - 1, Number(cfg?.piece?.start?.c || 0) || 0))
    };
    const goal = {
      r: Math.max(0, Math.min(rows - 1, Number(cfg?.goal?.r || 0) || 0)),
      c: Math.max(0, Math.min(cols - 1, Number(cfg?.goal?.c || cols - 1) || 0))
    };
    const rocks = Array.isArray(cfg?.rocks) ? cfg.rocks
      .map((x) => ({ r: Number(x?.r), c: Number(x?.c) }))
      .filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c) && inBounds(x.r, x.c, rows, cols))
      : [];
    const blacks = Array.isArray(cfg?.blacks) ? cfg.blacks
      .map((x) => ({ type: String(x?.type || "P").trim().toUpperCase(), r: Number(x?.r), c: Number(x?.c) }))
      .filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c) && inBounds(x.r, x.c, rows, cols))
      : [];
    const maxStepsRaw = cfg?.maxSteps;
    const maxSteps = (maxStepsRaw == null || String(maxStepsRaw).trim() === "") ? null : Math.max(1, Number(maxStepsRaw) || 1);
    return { board: { rows, cols }, piece: { type: pieceType, start }, goal, rocks, blacks, maxSteps };
  }

  function isRockAt(rocksSet, r, c) {
    return rocksSet.has(`${r}:${c}`);
  }

  function blackAt(blacksMap, r, c) {
    return blacksMap.get(`${r}:${c}`) || null;
  }

  function buildRocksSet(rocks) {
    const s = new Set();
    for (const rc of (Array.isArray(rocks) ? rocks : [])) s.add(keyOf(rc));
    return s;
  }

  function buildBlacksMap(blacks) {
    const m = new Map();
    for (const b of (Array.isArray(blacks) ? blacks : [])) {
      m.set(`${Number(b.r)}:${Number(b.c)}`, { type: String(b.type || "P").toUpperCase(), r: Number(b.r), c: Number(b.c) });
    }
    return m;
  }

  function squaresAttackedByBlack({ blacks, rocksSet, rows, cols }) {
    const attacked = new Set();
    const occ = buildBlacksMap(blacks);

    const add = (r, c) => { if (inBounds(r, c, rows, cols)) attacked.add(`${r}:${c}`); };

    const ray = (r0, c0, dr, dc) => {
      let r = r0 + dr;
      let c = c0 + dc;
      while (inBounds(r, c, rows, cols)) {
        if (isRockAt(rocksSet, r, c)) break;
        add(r, c);
        if (blackAt(occ, r, c)) break; // blocked by another black
        r += dr;
        c += dc;
      }
    };

    for (const b of blacks) {
      const t = String(b.type || "P").toUpperCase();
      const r = Number(b.r);
      const c = Number(b.c);
      if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
      if (t === "P") {
        // black pawn attacks "down" (increasing row)
        add(r + 1, c - 1);
        add(r + 1, c + 1);
      } else if (t === "N") {
        const ds = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
        for (const [dr, dc] of ds) add(r + dr, c + dc);
      } else if (t === "K") {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) add(r + dr, c + dc);
      } else if (t === "B" || t === "Q") {
        ray(r, c, 1, 1); ray(r, c, 1, -1); ray(r, c, -1, 1); ray(r, c, -1, -1);
      }
      if (t === "R" || t === "Q") {
        ray(r, c, 1, 0); ray(r, c, -1, 0); ray(r, c, 0, 1); ray(r, c, 0, -1);
      }
    }
    return attacked;
  }

  function legalMovesForWhite({ type, from, rocksSet, blacksMap, rows, cols }) {
    const moves = [];
    const fr = Number(from.r), fc = Number(from.c);
    const occBlack = (r, c) => !!blackAt(blacksMap, r, c);
    const blocked = (r, c) => isRockAt(rocksSet, r, c) || occBlack(r, c);

    const pushIf = (r, c) => {
      if (!inBounds(r, c, rows, cols)) return;
      if (isRockAt(rocksSet, r, c)) return;
      moves.push({ r, c });
    };

    const ray = (dr, dc) => {
      let r = fr + dr, c = fc + dc;
      while (inBounds(r, c, rows, cols)) {
        if (isRockAt(rocksSet, r, c)) break;
        moves.push({ r, c });
        if (occBlack(r, c)) break; // can capture but cannot pass through
        r += dr; c += dc;
      }
    };

    const t = String(type || "N").toUpperCase();
    if (t === "K") {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) pushIf(fr + dr, fc + dc);
    } else if (t === "N") {
      const ds = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
      for (const [dr, dc] of ds) pushIf(fr + dr, fc + dc);
    } else if (t === "B") {
      ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1);
    } else if (t === "R") {
      ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1);
    } else if (t === "Q") {
      ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1);
      ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1);
    } else if (t === "P") {
      // white pawn: forward is "up" (decreasing row)
      const fwdR = fr - 1;
      if (inBounds(fwdR, fc, rows, cols) && !blocked(fwdR, fc)) moves.push({ r: fwdR, c: fc });
      // captures
      const cap1 = { r: fr - 1, c: fc - 1 };
      const cap2 = { r: fr - 1, c: fc + 1 };
      if (inBounds(cap1.r, cap1.c, rows, cols) && occBlack(cap1.r, cap1.c)) moves.push(cap1);
      if (inBounds(cap2.r, cap2.c, rows, cols) && occBlack(cap2.r, cap2.c)) moves.push(cap2);
    }
    return moves;
  }

  function renderBoardHtml({ rows, cols, rocksSet, blacksMap, goal, pos, selected, pieceType }) {
    const colsCss = `repeat(${cols}, var(--mr-cell, 36px))`;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dark = (r + c) % 2 === 1;
        const isRock = isRockAt(rocksSet, r, c);
        const blk = blackAt(blacksMap, r, c);
        const isGoal = posEq(goal, { r, c });
        const isSel = selected && Number(selected.r) === r && Number(selected.c) === c;
        const isPos = posEq(pos, { r, c });
        const classes = [
          "mr-cell",
          dark ? "is-dark" : "",
          isRock ? "is-rock" : "",
          blk ? "is-black" : "",
          isGoal ? "is-goal" : "",
          isSel ? "is-selected" : ""
        ].filter(Boolean).join(" ");
        let inner = "";
        if (isRock) {
          inner = `<img src="${escapeHtml(mrRockImgSrc())}" alt="Rock">`;
        } else if (blk) {
          const src = mrPieceImgSrc("b", blk.type);
          inner = src ? `<img src="${escapeHtml(src)}" alt="Black ${escapeHtml(String(blk.type || ''))}">` : escapeHtml(iconBlack(blk.type));
        } else if (isPos) {
          const src = mrPieceImgSrc("w", pieceType);
          inner = src ? `<img src="${escapeHtml(src)}" alt="White ${escapeHtml(String(pieceType || ''))}">` : escapeHtml(iconWhite(pieceType));
        }
        cells.push(`<button type="button" class="${classes}" data-mr-cell="${r}:${c}" aria-label="Cell ${r + 1},${c + 1}">${inner}</button>`);
      }
    }
    return `<div class="mr-board" style="grid-template-columns:${colsCss};">${cells.join("")}</div>`;
  }

  function renderPlayView({ stage, state }) {
    const cfg = normalizeStageConfig(stage?.config || {});
    const rows = cfg.board.rows;
    const cols = cfg.board.cols;
    const rocksSet = buildRocksSet(state.rocks);
    const blacksMap = buildBlacksMap(state.blacks);
    const maxStepsLabel = cfg.maxSteps == null ? "∞" : String(cfg.maxSteps);
    const attacked = squaresAttackedByBlack({ blacks: state.blacks, rocksSet, rows, cols });
    const cellPx = computeCellPx({ rows, cols, targetPx: 520, gapPx: 2, padPx: 2 });

    return `
      <div class="mr-hud">
        <div class="mr-badge">Steps: ${escapeHtml(String(state.stepsUsed))} / ${escapeHtml(maxStepsLabel)}</div>
      </div>
      <div class="mr-toolbar" style="margin-top:0;">
        <div></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="mr-btn" data-mr-reset="1">Reset</button>
        </div>
      </div>
      <div class="mr-board-wrap-520" style="--mr-cell:${escapeHtml(String(cellPx))}px; --mr-gap:2px; --mr-pad:2px;">
        ${renderBoardHtml({ rows, cols, rocksSet, blacksMap, goal: cfg.goal, pos: state.pos, selected: state.selected, pieceType: cfg.piece.type })}
      </div>
    `;
  }

  function openRulesModal(root) {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="vcp-modal-backdrop" id="mrRulesBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Rules" style="width: calc(100vw - 40px); max-width: 980px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Rules</div>
            <button id="mrRulesClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div style="font-weight:950; color:#111827;">Maze Runner</div>
            <div class="mr-muted" style="margin-top:8px; line-height:1.55;">
              - You control only <strong>one</strong> white piece (K/Q/R/B/N/P).<br>
              - Reach the goal within the step limit.<br>
              - Rocks cannot be captured and cannot be passed through (Knight can jump).<br>
              - You cannot move onto squares attacked by black pieces, <strong>except</strong> you may move to capture the black piece on that square.<br>
              - If you exceed the step limit, the stage restarts.
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
              <button id="mrRulesOk" type="button" class="mr-btn primary">OK</button>
            </div>
          </div>
        </div>
      </div>
    `;
    root.appendChild(host);
    const close = () => { try { host.remove(); } catch {} };
    host.querySelector("#mrRulesClose")?.addEventListener("click", close);
    host.querySelector("#mrRulesOk")?.addEventListener("click", close);
    host.querySelector("#mrRulesBackdrop")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "mrRulesBackdrop") close();
    });
  }

  function openAttackModal(root) {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="vcp-modal-backdrop" id="mrAttackBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Attack warning" style="width: calc(100vw - 40px); max-width: 720px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Warning</div>
            <button id="mrAttackClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div style="font-weight:1000; color:#ef4444; font-size:28px; letter-spacing:0.5px;">
              YOU ARE BEING ATTACK!!!
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
              <button id="mrAttackOk" type="button" class="mr-btn primary">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
    root.appendChild(host);
    const close = () => { try { host.remove(); } catch {} };
    host.querySelector("#mrAttackClose")?.addEventListener("click", close);
    host.querySelector("#mrAttackOk")?.addEventListener("click", close);
    host.querySelector("#mrAttackBackdrop")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "mrAttackBackdrop") close();
    });
  }

  function openSuccessModal(root, opts = {}) {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="vcp-modal-backdrop" id="mrSuccessBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Success" style="width: calc(100vw - 40px); max-width: 720px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Success</div>
            <button id="mrSuccessClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div style="font-weight:1000; color:#16a34a; font-size:26px; letter-spacing:0.2px;">
              Congrarts! You have done this
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px; flex-wrap:wrap;">
              <button id="mrSuccessNext" type="button" class="mr-btn primary">Next</button>
            </div>
          </div>
        </div>
      </div>
    `;
    root.appendChild(host);
    const close = () => { try { host.remove(); } catch {} };
    host.querySelector("#mrSuccessClose")?.addEventListener("click", close);
    host.querySelector("#mrSuccessBackdrop")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "mrSuccessBackdrop") close();
    });
    host.querySelector("#mrSuccessNext")?.addEventListener("click", async () => {
      try {
        if (typeof opts.onNext === "function") await opts.onNext();
      } finally {
        close();
      }
    });
  }

  function flashIllegalMove(root) {
    const app = root.querySelector(".mr-app");
    if (!app) return;
    app.classList.remove("mr-flash-illegal");
    // Force reflow so animation restarts
    // eslint-disable-next-line no-unused-expressions
    app.offsetHeight;
    app.classList.add("mr-flash-illegal");
    setTimeout(() => {
      try { app.classList.remove("mr-flash-illegal"); } catch {}
    }, 800);
  }

  window.initMazeRunner = async function initMazeRunner() {
    const root = document.getElementById("mazeRunnerRoot");
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
        view: "list", // list | play
        stages: [],
        stageId: "",
        stageDetail: null
      },
      progress: {
        completed: new Set(),
        storageKey: ""
      },
      theme: {
        light: "#ffffff",
        dark: "#f3f4f6"
      }
    };

    root.innerHTML = renderShell({ role, mode: ui.mode });

    // ---- progress: completed stages (local only) ----
    const progressKey = () => {
      if (isTeacher) return "mazeRunnerCompletedStages:teacher";
      const sid = getPublicStudentIdFromPlayers();
      return `mazeRunnerCompletedStages:student:${sid || "unknown"}`;
    };
    ui.progress.storageKey = progressKey();

    const loadCompleted = () => {
      try {
        const raw = localStorage.getItem(ui.progress.storageKey);
        const arr = raw ? JSON.parse(raw) : [];
        ui.progress.completed = new Set(Array.isArray(arr) ? arr.map((x) => String(x)) : []);
      } catch {
        ui.progress.completed = new Set();
      }
    };
    const saveCompleted = () => {
      try {
        localStorage.setItem(ui.progress.storageKey, JSON.stringify(Array.from(ui.progress.completed)));
      } catch {}
    };
    const isStageComplete = (stageId) => ui.progress.completed.has(String(stageId || "").trim());
    const markStageComplete = (stageId) => {
      const id = String(stageId || "").trim();
      if (!id) return;
      ui.progress.completed.add(id);
      // keep in-memory stage list in sync
      const st = Array.isArray(ui.stage.stages) ? ui.stage.stages.find((s) => String(s?.id || "") === id) : null;
      if (st) st.__isComplete = true;
      saveCompleted();
    };
    loadCompleted();

    function isHexColor(s) {
      return /^#[0-9a-fA-F]{6}$/.test(String(s || "").trim());
    }

    function loadTheme() {
      try {
        const l = String(localStorage.getItem("mazeRunnerBoardLight") || "").trim();
        const d = String(localStorage.getItem("mazeRunnerBoardDark") || "").trim();
        if (isHexColor(l)) ui.theme.light = l;
        if (isHexColor(d)) ui.theme.dark = d;
      } catch {}
    }

    function applyTheme() {
      try {
        root.style.setProperty("--mr-light", ui.theme.light);
        root.style.setProperty("--mr-dark", ui.theme.dark);
      } catch {}
    }

    function saveTheme() {
      try {
        localStorage.setItem("mazeRunnerBoardLight", ui.theme.light);
        localStorage.setItem("mazeRunnerBoardDark", ui.theme.dark);
      } catch {}
    }

    function resetTheme() {
      ui.theme.light = "#ffffff";
      ui.theme.dark = "#f3f4f6";
      try {
        localStorage.removeItem("mazeRunnerBoardLight");
        localStorage.removeItem("mazeRunnerBoardDark");
      } catch {}
      applyTheme();
    }

    loadTheme();
    applyTheme();

    let mainRenderToken = 0;
    const setMain = (html) => {
      const el = document.getElementById("mrMain");
      if (!el) return Promise.resolve();
      const token = ++mainRenderToken;
      el.classList.add("mr-fade", "is-out");
      return new Promise((resolve) => {
        // Fade out -> replace -> fade in
        setTimeout(() => {
          if (token !== mainRenderToken) return resolve();
          try { el.innerHTML = html; } catch {}
          requestAnimationFrame(() => {
            if (token !== mainRenderToken) return resolve();
            try { el.classList.remove("is-out"); } catch {}
            // allow CSS transition to complete
            setTimeout(resolve, 260);
          });
        }, 140);
      });
    };

    const rerenderShell = () => {
      root.innerHTML = renderShell({ role, mode: ui.mode });
      bindNav();
    };

    async function loadStageList() {
      await setMain(`<div class="mr-muted">Loading...</div>`);
      try {
        const data = await fetchStages({ isTeacher, difficulty: ui.stage.difficulty });
        ui.stage.stages = Array.isArray(data?.stages) ? data.stages : [];
        ui.stage.stages.forEach((s) => {
          try { s.__isComplete = isStageComplete(s?.id); } catch {}
        });
        ui.stage.view = "list";
        ui.stage.stageId = "";
        ui.stage.stageDetail = null;
        setUrlParam("difficulty", ui.stage.difficulty);
        setUrlParam("stageId", "");
        // internal flag to control difficulty picker visibility
        const list = ui.stage.stages.slice();
        list.__hideDiffPicker = !!ui.stage.diffPickedOnce;
        await setMain(renderStageList({ difficulty: ui.stage.difficulty, stages: list }));
        bindStageHandlers();
      } catch (e) {
        await setMain(`<div class="mr-section-title">Stage</div><div class="mr-muted" style="margin-top:8px;">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function openStage(stageId) {
      ui.stage.stageId = String(stageId || "").trim();
      setUrlParam("stageId", ui.stage.stageId);
      await setMain(`<div class="mr-muted">Loading stage...</div>`);
      try {
        const data = await fetchStageDetail({ isTeacher, stageId: ui.stage.stageId });
        ui.stage.stageDetail = data?.stage || null;
        ui.stage.view = "play";
        await setMain(renderStagePlayShell({ stage: ui.stage.stageDetail }));
        bindStageHandlers();

        const cfg = normalizeStageConfig(ui.stage.stageDetail?.config || {});
        const initial = {
          pos: { r: cfg.piece.start.r, c: cfg.piece.start.c },
          stepsUsed: 0,
          selected: null,
          rocks: cfg.rocks.slice(),
          blacks: cfg.blacks.slice(),
          won: false
        };
        ui.stage.playState = initial;
        const host = document.getElementById("mrStagePlayHost");
        if (host) host.innerHTML = renderPlayView({ stage: ui.stage.stageDetail, state: ui.stage.playState });
        bindPlayHandlers();
      } catch (e) {
        await setMain(`<div class="mr-section-title">Stage</div><div class="mr-muted" style="margin-top:8px;">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function rerenderMain() {
      if (ui.mode === "home") {
        await setMain(renderHome({ storyIndex: ui.home.storyIndex }));
        bindHomeHandlers();
        return;
      }
      if (ui.mode === "challenge") return await setMain(renderChallenge());
      if (ui.mode === "settings") {
        await setMain(renderSettings());
        bindSettingsHandlers();
        return;
      }
      if (ui.mode === "stage") {
        const deepStageId = String(getUrlParam("stageId") || "").trim();
        if (deepStageId) return await openStage(deepStageId);
        return await loadStageList();
      }
      // Builder (teacher only)
      if (!isTeacher) return await setMain(`<div class="mr-muted">Builder is for teachers only.</div>`);
      await setMain(`<div class="mr-muted">Loading...</div>`);
      try {
        const data = await fetchStages({ isTeacher: true, difficulty: ui.stage.difficulty });
        ui.stage.stages = Array.isArray(data?.stages) ? data.stages : [];
        await setMain(renderBuilder({ difficulty: ui.stage.difficulty, stages: ui.stage.stages }));
        bindBuilderHandlers();
        return;
      } catch (e) {
        await setMain(`<div class="mr-section-title">Builder</div><div class="mr-muted" style="margin-top:8px;">${escapeHtml(e?.message || String(e))}</div>`);
        return;
      }
    }

    function bindHomeHandlers() {
      const nextBtn = root.querySelector("[data-mr-story-next]");
      if (nextBtn && nextBtn.dataset.bound !== "1") {
        nextBtn.dataset.bound = "1";
        nextBtn.addEventListener("click", async () => {
          ui.home.storyIndex = Math.min(4, Number(ui.home.storyIndex || 0) + 1);
          await setMain(renderHome({ storyIndex: ui.home.storyIndex }));
          bindHomeHandlers();
        });
      }

      const homeRulesBtn = root.querySelector("[data-mr-home-rules]");
      if (homeRulesBtn && homeRulesBtn.dataset.bound !== "1") {
        homeRulesBtn.dataset.bound = "1";
        homeRulesBtn.addEventListener("click", () => openRulesModal(root));
      }

      const btn = root.querySelector("[data-mr-start-game]");
      if (btn && btn.dataset.bound !== "1") {
        btn.dataset.bound = "1";
        btn.addEventListener("click", async () => {
          ui.mode = "stage";
          ui.stage.difficulty = "easy";
          ui.stage.diffPickedOnce = true;
          ui.home.storyIndex = 0;
          setUrlMode(ui.mode);
          setUrlParam("difficulty", ui.stage.difficulty);
          setUrlParam("stageId", "");
          rerenderShell();
          // go to Stage page only (do not auto-enter a stage)
          void rerenderMain();
        });
      }
    }

    const bindNav = () => {
      root.querySelectorAll(".mr-nav-btn[data-mr-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = String(btn.getAttribute("data-mr-mode") || "").trim().toLowerCase();
          const normalized = normalizeMode(next, isTeacher);
          if (normalized === ui.mode) return;
          ui.mode = normalized;
          setUrlMode(ui.mode);
          rerenderShell();
          void rerenderMain();
        });
      });

      const rulesBtn = root.querySelector("[data-mr-open-rules]");
      if (rulesBtn && rulesBtn.dataset.bound !== "1") {
        rulesBtn.dataset.bound = "1";
        rulesBtn.addEventListener("click", () => openRulesModal(root));
      }
    };

    function bindSettingsHandlers() {
      const light = root.querySelector("#mrSettingLight");
      const dark = root.querySelector("#mrSettingDark");
      const saveBtn = root.querySelector("#mrSettingSave");
      const resetBtn = root.querySelector("#mrSettingReset");
      const hint = root.querySelector("#mrSettingHint");

      if (light) light.value = ui.theme.light;
      if (dark) dark.value = ui.theme.dark;

      const setHint = (txt) => { if (hint) hint.textContent = String(txt || ""); };

      light?.addEventListener("input", () => {
        const v = String(light.value || "").trim();
        if (isHexColor(v)) ui.theme.light = v;
        applyTheme();
        setHint("Preview updated.");
      });
      dark?.addEventListener("input", () => {
        const v = String(dark.value || "").trim();
        if (isHexColor(v)) ui.theme.dark = v;
        applyTheme();
        setHint("Preview updated.");
      });
      saveBtn?.addEventListener("click", () => {
        saveTheme();
        setHint("Saved.");
      });
      resetBtn?.addEventListener("click", () => {
        resetTheme();
        if (light) light.value = ui.theme.light;
        if (dark) dark.value = ui.theme.dark;
        setHint("Reset to defaults.");
      });
    }

    function bindStageHandlers() {
      root.querySelectorAll("[data-mr-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = normalizeDiff(btn.getAttribute("data-mr-diff"));
          if (next === ui.stage.difficulty) return;
          ui.stage.difficulty = next;
          ui.stage.diffPickedOnce = true;
          loadStageList();
        });
      });
      root.querySelectorAll("[data-mr-change-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          ui.stage.diffPickedOnce = false;
          loadStageList();
        });
      });
      root.querySelectorAll("[data-mr-stage]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = String(btn.getAttribute("data-mr-stage") || "").trim();
          if (!id) return;
          openStage(id);
        });
      });
      root.querySelectorAll("[data-mr-back-stage]").forEach((btn) => {
        btn.addEventListener("click", () => loadStageList());
      });
    }

    function bindPlayHandlers() {
      const host = document.getElementById("mrStagePlayHost");
      if (!host) return;
      const stage = ui.stage.stageDetail;
      const cfg = normalizeStageConfig(stage?.config || {});

      const rerenderPlay = () => {
        host.innerHTML = renderPlayView({ stage, state: ui.stage.playState });
        bindPlayHandlers();
      };

      const reset = () => {
        ui.stage.playState = {
          pos: { r: cfg.piece.start.r, c: cfg.piece.start.c },
          stepsUsed: 0,
          selected: null,
          rocks: cfg.rocks.slice(),
          blacks: cfg.blacks.slice(),
          won: false
        };
        rerenderPlay();
      };

      host.querySelectorAll("[data-mr-reset]").forEach((btn) => btn.addEventListener("click", () => reset()));

      host.querySelectorAll("[data-mr-cell]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (ui.stage.playState.won) return;
          const rc = String(btn.getAttribute("data-mr-cell") || "");
          const m = rc.match(/^(\d+):(\d+)$/);
          if (!m) return;
          const r = Number(m[1]), c = Number(m[2]);
          const state = ui.stage.playState;
          const rows = cfg.board.rows, cols = cfg.board.cols;
          const rocksSet = buildRocksSet(state.rocks);
          const blacksMap = buildBlacksMap(state.blacks);

          // First click: select piece if clicking its cell
          if (!state.selected) {
            if (state.pos.r === r && state.pos.c === c) {
              state.selected = { r, c };
              rerenderPlay();
            }
            return;
          }

          // Second click: attempt move
          const from = { ...state.pos };
          const to = { r, c };
          state.selected = null;

          const moves = legalMovesForWhite({ type: cfg.piece.type, from, rocksSet, blacksMap, rows, cols });
          const isLegal = moves.some((x) => x.r === to.r && x.c === to.c);
          if (!isLegal) {
            // Illegal move: flash whole screen 3 times
            flashIllegalMove(root);
            return rerenderPlay();
          }

          const targetBlack = blackAt(blacksMap, to.r, to.c);
          // Safety rule: cannot move onto attacked square unless capturing a black piece on that square
          const attacked = squaresAttackedByBlack({ blacks: state.blacks, rocksSet, rows, cols });
          if (attacked.has(`${to.r}:${to.c}`) && !targetBlack) {
            // Attacked square: modal warning, continue game after close
            openAttackModal(root);
            return rerenderPlay();
          }

          // Apply capture (if any)
          if (targetBlack) {
            state.blacks = state.blacks.filter((b) => !(Number(b.r) === to.r && Number(b.c) === to.c));
          }

          state.pos = to;
          state.stepsUsed += 1;

          // Win?
          if (posEq(state.pos, cfg.goal)) {
            state.won = true;
            markStageComplete(String(stage?.id || ui.stage.stageId || ""));
            // Success: modal with Next button
            openSuccessModal(root, {
              onNext: async () => {
                const curNo = Number(stage?.stageNo || 0) || 0;
                const list = Array.isArray(ui.stage.stages) ? ui.stage.stages : [];
                const next = list.find((s) => Number(s.stageNo) === curNo + 1);
                if (next && next.id) {
                  await openStage(next.id);
                }
              }
            });
            return rerenderPlay();
          }

          // Step limit fail?
          if (cfg.maxSteps != null && state.stepsUsed >= cfg.maxSteps) {
            return reset();
          }

          return rerenderPlay();
        });
      });
    }

    function bindBuilderHandlers() {
      root.querySelectorAll("[data-mr-builder-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = normalizeDiff(btn.getAttribute("data-mr-builder-diff"));
          if (next === ui.stage.difficulty) return;
          ui.stage.difficulty = next;
          rerenderMain();
        });
      });
      root.querySelectorAll("[data-mr-builder-create]").forEach((btn) => {
        btn.addEventListener("click", () => {
          openCreateStageModal({
            root,
            difficulty: ui.stage.difficulty,
            onCreated: () => rerenderMain()
          });
        });
      });

      root.querySelectorAll("[data-mr-builder-edit]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            const stageId = String(btn.getAttribute("data-mr-builder-edit") || "").trim();
            if (!stageId) return;
            const data = await fetchStageDetail({ isTeacher: true, stageId });
            const st = data?.stage || null;
            if (!st) return;
            openCreateStageModal({
              root,
              difficulty: String(st.difficulty || ui.stage.difficulty),
              stage: st,
              onCreated: () => rerenderMain()
            });
          } catch (e) {
            alert(e?.message || String(e));
          }
        });
      });
    }

    bindNav();
    await rerenderMain();
  };
})();

