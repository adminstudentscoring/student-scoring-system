/* Chess Solitaire app scaffold (UI + layout only for now) */
(function () {
  const Core = window.ChessSolitaireCore;
  if (!Core) {
    console.error("ChessSolitaireCore missing. Did core.js load?");
    return;
  }

  const DIFFICULTIES = [
    { key: "easy", label: "Easy" },
    { key: "medium", label: "Medium" },
    { key: "hard", label: "Hard" },
    { key: "extremelyhard", label: "Extremely Hard" },
    { key: "master", label: "Master" }
  ];

  const PIECE_TYPES = ["K", "Q", "R", "B", "N", "P"];
  const PIECE_NAME = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" };

  function normalizeDiff(key) {
    const k = String(key || "").trim().toLowerCase();
    if (!k) return "easy";
    if (k === "extremely hard" || k === "extremely_hard" || k === "extremely-hard") return "extremelyhard";
    return DIFFICULTIES.some((d) => d.key === k) ? k : "easy";
  }

  function diffLabel(key) {
    const k = normalizeDiff(key);
    return DIFFICULTIES.find((d) => d.key === k)?.label || "Easy";
  }

  function getRole() {
    const v = Core.getUrlParam("role");
    const role = String(v || "").toLowerCase() === "teacher" ? "teacher" : "student";
    return role;
  }

  const ui = {
    role: getRole(),
    mode: Core.getUrlMode(),
    home: {
      storyIndex: 0
    },
    settings: {
      displayColor: "white" // b. Builder default = white pieces; user can switch in Settings
    },
    stage: {
      difficulty: "easy",
      stages: [],
      stageId: "",
      stage: null,
      play: null
    },
    builder: {
      difficulty: "easy",
      stages: []
    }
  };

  const COMPLETED_KEY = "chessSolitaireCompletedStageIds";

  function loadCompletedSet() {
    try {
      const raw = localStorage.getItem(COMPLETED_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.map((x) => String(x || "").trim()).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function saveCompletedSet(set) {
    try {
      localStorage.setItem(COMPLETED_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }

  function isStageComplete(stageId) {
    const id = String(stageId || "").trim();
    if (!id) return false;
    return loadCompletedSet().has(id);
  }

  function markStageComplete(stageId) {
    const id = String(stageId || "").trim();
    if (!id) return;
    const s = loadCompletedSet();
    if (s.has(id)) return;
    s.add(id);
    saveCompletedSet(s);
  }

  function getNextStageId() {
    const curId = String(ui.stage.stageId || ui.stage.stage?.id || "").trim();
    const curNo = Number(ui.stage.stage?.stageNo);
    if (!curId || !Number.isFinite(curNo)) return "";
    const list = Array.isArray(ui.stage.stages) ? ui.stage.stages : [];
    let best = null;
    for (const s of list) {
      const no = Number(s?.stageNo);
      if (!Number.isFinite(no)) continue;
      if (no <= curNo) continue;
      if (!best || no < Number(best.stageNo)) best = s;
    }
    return best?.id ? String(best.id) : "";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  const HOME_STORY = [
    `In a quiet academy where chess pieces learned to dream, the board was never just a board—it was a maze of choices. Tonight, the squares are awake, and every piece can feel the tension of the next move.`,
    `A strange rule echoes through the hall: no wandering, no hesitation. Each step must be a capture—one piece falls, one piece advances. The board keeps the score with silence.`,
    `You are not a single hero piece. You are the whole army’s mind. You may change leaders at any time—Knight, Bishop, Queen—whoever can strike next will carry your will.`,
    `Some squares are missing, as if the board has forgotten parts of itself. Those empty gaps don’t block attacks, but they can break plans. Learn to read the shape of the battlefield, not just the pieces.`,
    `At the end, only one piece must remain—standing alone under a pale spotlight. Clear the board with perfect captures, and the academy will open its final door.`
  ];

  function loadSettings() {
    try {
      const raw = localStorage.getItem("chessSolitaireSettings");
      if (!raw) return;
      const data = JSON.parse(raw);
      const c = String(data?.displayColor || "").toLowerCase();
      if (c === "white" || c === "black") ui.settings.displayColor = c;
    } catch {}
  }

  function saveSettings() {
    try {
      localStorage.setItem("chessSolitaireSettings", JSON.stringify(ui.settings));
    } catch {}
  }

  async function setMain(html) {
    const el = document.getElementById("csMain");
    if (!el) return;
    el.classList.add("cs-fade", "is-out");
    await sleep(120);
    el.innerHTML = html;
    await sleep(0);
    el.classList.remove("is-out");
  }

  function rerenderShell() {
    const root = document.getElementById("chessSolitaireRoot");
    if (!root) return;
    root.innerHTML = Core.renderShell({ role: ui.role, mode: ui.mode });
  }

  function getPublicStudentIdFromPlayers() {
    try {
      const players = Array.isArray(window.chessSolitairePlayers) ? window.chessSolitairePlayers : [];
      return String(players?.[0]?.id || "").trim();
    } catch {}
    return "";
  }

  async function fetchStages({ isTeacher, difficulty }) {
    const diff = normalizeDiff(difficulty);
    if (isTeacher) {
      return await Core.apiRequest(`/api/teachers/chess-solitaire/stages?difficulty=${encodeURIComponent(diff)}`, { method: "GET" });
    }
    const sid = getPublicStudentIdFromPlayers();
    const pwd = Core.getPublicStudentPassword();
    const qp = new URLSearchParams();
    qp.set("difficulty", diff);
    if (pwd) qp.set("password", pwd);
    return await Core.apiRequest(`/api/public/students/${encodeURIComponent(sid)}/chess-solitaire/stages?${qp.toString()}`, { method: "GET" });
  }

  async function fetchStageDetail({ isTeacher, stageId }) {
    const id = String(stageId || "").trim();
    if (!id) throw new Error("Missing stageId");
    if (isTeacher) {
      return await Core.apiRequest(`/api/teachers/chess-solitaire/stages/${encodeURIComponent(id)}`, { method: "GET" });
    }
    const sid = getPublicStudentIdFromPlayers();
    const pwd = Core.getPublicStudentPassword();
    const qp = new URLSearchParams();
    if (pwd) qp.set("password", pwd);
    return await Core.apiRequest(`/api/public/students/${encodeURIComponent(sid)}/chess-solitaire/stages/${encodeURIComponent(id)}?${qp.toString()}`, { method: "GET" });
  }

  async function createStage({ difficulty, config }) {
    const diff = normalizeDiff(difficulty);
    return await Core.apiRequest(`/api/teachers/chess-solitaire/stages`, {
      method: "POST",
      body: JSON.stringify({ difficulty: diff, config: config && typeof config === "object" ? config : {} })
    });
  }

  async function updateStage(stageId, config) {
    const id = String(stageId || "").trim();
    if (!id) throw new Error("Missing stageId");
    return await Core.apiRequest(`/api/teachers/chess-solitaire/stages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ config: config && typeof config === "object" ? config : {} })
    });
  }

  function inBounds(r, c, rows, cols) {
    return r >= 0 && c >= 0 && r < rows && c < cols;
  }

  function keyOf(rc) {
    return `${Number(rc.r)}:${Number(rc.c)}`;
  }

  function isPieceType(t) {
    return PIECE_TYPES.includes(String(t || "").toUpperCase());
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
    const rows = Math.max(1, Number(cfg?.board?.rows || 4) || 4);
    const cols = Math.max(1, Number(cfg?.board?.cols || 4) || 4);
    const removed = Array.isArray(cfg?.removed)
      ? cfg.removed
          .map((x) => ({ r: Number(x?.r), c: Number(x?.c) }))
          .filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c) && inBounds(x.r, x.c, rows, cols))
      : [];
    const removedSet = new Set(removed.map(keyOf));
    const pieces = Array.isArray(cfg?.pieces)
      ? cfg.pieces
          .map((p) => ({ type: String(p?.type || "").trim().toUpperCase(), r: Number(p?.r), c: Number(p?.c) }))
          .filter((p) => isPieceType(p.type) && Number.isFinite(p.r) && Number.isFinite(p.c) && inBounds(p.r, p.c, rows, cols))
          .filter((p) => !removedSet.has(`${p.r}:${p.c}`))
      : [];
    return { board: { rows, cols }, removed, pieces };
  }

  function buildRemovedSet(removed) {
    const s = new Set();
    for (const rc of (Array.isArray(removed) ? removed : [])) s.add(keyOf(rc));
    return s;
  }

  function buildPiecesByCell(pieces) {
    const m = new Map();
    (Array.isArray(pieces) ? pieces : []).forEach((p, idx) => {
      m.set(`${Number(p.r)}:${Number(p.c)}`, { idx, type: String(p.type || "").toUpperCase(), r: Number(p.r), c: Number(p.c) });
    });
    return m;
  }

  function occupiedSetFromPieces(pieces) {
    const s = new Set();
    for (const p of (Array.isArray(pieces) ? pieces : [])) s.add(`${Number(p.r)}:${Number(p.c)}`);
    return s;
  }

  // "Legal capture squares" are essentially attack squares, with current occupancy blocking rays.
  function attacksForPiece({ type, from, rows, cols, occupiedSet }) {
    const t = String(type || "N").toUpperCase();
    const fr = Number(from?.r), fc = Number(from?.c);
    const occ = occupiedSet instanceof Set ? occupiedSet : new Set();
    const attacked = new Set();
    const add = (r, c) => {
      if (inBounds(r, c, rows, cols)) attacked.add(`${r}:${c}`);
    };
    const ray = (dr, dc) => {
      let r = fr + dr;
      let c = fc + dc;
      while (inBounds(r, c, rows, cols)) {
        add(r, c);
        if (occ.has(`${r}:${c}`)) break;
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
      // White pawn capture only (solitaire: every move must capture anyway)
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

  function pieceImgSrc(color, type) {
    const c = String(color || "white").toLowerCase() === "black" ? "black" : "white";
    const t = String(type || "").toUpperCase();
    const nm = PIECE_NAME[t] || "";
    if (!nm) return "";
    return `/application/pieces/${c}_${nm}.png`;
  }

  function renderBoardHtml({ rows, cols, removedSet, pieces, selectedIdx, captureSet, disableRemoved = true }) {
    const cellPx = computeCellPx({ rows, cols, targetPx: 520, gapPx: 2, padPx: 2 });
    const colsCss = `repeat(${cols}, var(--cs-cell, ${cellPx}px))`;
    const piecesByCell = buildPiecesByCell(pieces);
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dark = (r + c) % 2 === 1;
        const key = `${r}:${c}`;
        const isRemoved = removedSet.has(key);
        const info = piecesByCell.get(key) || null;
        const isSelected = info && Number(info.idx) === Number(selectedIdx);
        const isCap = captureSet && captureSet.has(key);
        const classes = [
          "cs-cell",
          dark ? "is-dark" : "",
          isRemoved ? "is-removed" : "",
          isSelected ? "is-selected" : "",
          (!isRemoved && isCap) ? "is-capture" : ""
        ].filter(Boolean).join(" ");
        let inner = "";
        if (info) {
          const src = pieceImgSrc(ui.settings.displayColor, info.type);
          inner = src
            ? `<img src="${Core.escapeHtml(src)}" alt="${Core.escapeHtml(info.type)}" style="width: calc(var(--cs-cell, ${cellPx}px) - 10px); height: calc(var(--cs-cell, ${cellPx}px) - 10px); object-fit:contain;">`
            : `<span style="font-weight:950;">${Core.escapeHtml(info.type)}</span>`;
        }
        const disabled = (disableRemoved && isRemoved) ? "disabled" : "";
        cells.push(`<button type="button" class="${classes}" data-cs-cell="${r}:${c}" ${disabled} aria-label="Cell ${r + 1},${c + 1}">${inner}</button>`);
      }
    }
    return `
      <div class="cs-board-wrap-520">
        <div class="cs-board" style="--cs-cell:${cellPx}px; grid-template-columns:${colsCss};">
          ${cells.join("")}
        </div>
      </div>
    `;
  }

  function openSuccessModal(root, opts = {}) {
    const title = String(opts.title || "Congrarts!");
    const body = String(opts.body || "You have done this");
    const okLabel = String(opts.okLabel || "Close");
    const nextLabel = String(opts.nextLabel || "Next");
    const onOk = typeof opts.onOk === "function" ? opts.onOk : null;
    const onNext = typeof opts.onNext === "function" ? opts.onNext : null;

    const html = `
      <div class="vcp-modal-backdrop" id="csSuccessBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Success" style="width: calc(100vw - 40px); max-width: 720px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">${Core.escapeHtml(title)}</div>
            <button id="csSuccessClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div style="font-size:18px; font-weight:950; margin-bottom:10px;">${Core.escapeHtml(body)}</div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
              <button id="csSuccessOk" class="cs-btn" type="button">${Core.escapeHtml(okLabel)}</button>
              ${onNext ? `<button id="csSuccessNext" class="cs-btn primary" type="button">${Core.escapeHtml(nextLabel)}</button>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
    root.insertAdjacentHTML("beforeend", html);
    const backdrop = root.querySelector("#csSuccessBackdrop");
    const close = root.querySelector("#csSuccessClose");
    const ok = root.querySelector("#csSuccessOk");
    const next = root.querySelector("#csSuccessNext");
    function cleanup() {
      try { backdrop?.remove?.(); } catch {}
    }
    close?.addEventListener("click", () => {
      cleanup();
      onOk && onOk();
    });
    ok?.addEventListener("click", () => {
      cleanup();
      onOk && onOk();
    });
    next?.addEventListener("click", () => {
      cleanup();
      try {
        const r = onNext && onNext();
        // ignore promise completion (UI handles it)
        void r;
      } catch {}
    });
    backdrop?.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        cleanup();
        onOk && onOk();
      }
    });
  }

  function renderHome({ storyIndex = 0 } = {}) {
    const idx = Math.max(0, Math.min(4, Number(storyIndex) || 0));
    const total = HOME_STORY.length;
    const raw = HOME_STORY[idx] || "";
    const lines = String(raw)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const storyHtml = lines.map((ln) => `<div style="margin-top:10px;">${Core.escapeHtml(ln)}</div>`).join("");
    const isLast = idx >= total - 1;
    return `
      <div class="cs-section-title" style="font-weight:1000; color:var(--cs-ink);">Chess Solitaire</div>
      <div class="cs-card" style="margin-top:12px;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
          <div style="font-weight:1000; color:var(--cs-ink);">Story</div>
          <div style="color:var(--cs-muted); font-weight:900;">${Core.escapeHtml(String(idx + 1))} / ${Core.escapeHtml(String(total))}</div>
        </div>
        <div style="margin-top:14px; line-height:1.75; text-align:center; font-size:200%; max-width:920px; margin-left:auto; margin-right:auto; color:var(--cs-muted); font-weight:900;">
          ${storyHtml}
        </div>

        <div style="display:flex; align-items:center; justify-content:center; min-height:150px; margin-top:12px;">
          ${isLast ? `
            <div style="display:flex; flex-direction:column; gap:12px; align-items:center; justify-content:center; width:100%;">
              <button type="button" class="cs-btn" data-cs-home-rules="1" style="width:280px; max-width:80vw;">Rules</button>
              <button type="button" class="cs-btn primary" data-cs-start-game="1" style="width:280px; max-width:80vw;">Start the Game</button>
            </div>
          ` : `
            <button type="button" class="cs-btn primary" data-cs-story-next="1" style="width:280px; max-width:80vw;">Next</button>
          `}
        </div>
      </div>
    `;
  }

  function openRulesModal(root) {
    const host = document.createElement("div");
