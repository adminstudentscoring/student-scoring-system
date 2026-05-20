(() => {
  // application/chess-solitaire/src/game-legacy.js
  (function() {
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
        displayColor: "white"
        // b. Builder default = white pieces; user can switch in Settings
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
        if (!raw) return /* @__PURE__ */ new Set();
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return /* @__PURE__ */ new Set();
        return new Set(arr.map((x) => String(x || "").trim()).filter(Boolean));
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    function saveCompletedSet(set) {
      try {
        localStorage.setItem(COMPLETED_KEY, JSON.stringify(Array.from(set)));
      } catch {
      }
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
      `In a quiet academy where chess pieces learned to dream, the board was never just a board\u2014it was a maze of choices. Tonight, the squares are awake, and every piece can feel the tension of the next move.`,
      `A strange rule echoes through the hall: no wandering, no hesitation. Each step must be a capture\u2014one piece falls, one piece advances. The board keeps the score with silence.`,
      `You are not a single hero piece. You are the whole army\u2019s mind. You may change leaders at any time\u2014Knight, Bishop, Queen\u2014whoever can strike next will carry your will.`,
      `Some squares are missing, as if the board has forgotten parts of itself. Those empty gaps don\u2019t block attacks, but they can break plans. Learn to read the shape of the battlefield, not just the pieces.`,
      `At the end, only one piece must remain\u2014standing alone under a pale spotlight. Clear the board with perfect captures, and the academy will open its final door.`
    ];
    function loadSettings() {
      try {
        const raw = localStorage.getItem("chessSolitaireSettings");
        if (!raw) return;
        const data = JSON.parse(raw);
        const c = String(data?.displayColor || "").toLowerCase();
        if (c === "white" || c === "black") ui.settings.displayColor = c;
      } catch {
      }
    }
    function saveSettings() {
      try {
        localStorage.setItem("chessSolitaireSettings", JSON.stringify(ui.settings));
      } catch {
      }
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
      } catch {
      }
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
      const availW = targetPx - padPx * 2 - gapPx * Math.max(0, c - 1);
      const availH = targetPx - padPx * 2 - gapPx * Math.max(0, r - 1);
      const cellW = Math.floor(availW / c);
      const cellH = Math.floor(availH / r);
      return Math.max(12, Math.min(cellW, cellH));
    }
    function normalizeStageConfig(raw) {
      const cfg = raw && typeof raw === "object" ? raw : {};
      const rows = Math.max(1, Number(cfg?.board?.rows || 4) || 4);
      const cols = Math.max(1, Number(cfg?.board?.cols || 4) || 4);
      const removed = Array.isArray(cfg?.removed) ? cfg.removed.map((x) => ({ r: Number(x?.r), c: Number(x?.c) })).filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c) && inBounds(x.r, x.c, rows, cols)) : [];
      const removedSet = new Set(removed.map(keyOf));
      const pieces = Array.isArray(cfg?.pieces) ? cfg.pieces.map((p) => ({ type: String(p?.type || "").trim().toUpperCase(), r: Number(p?.r), c: Number(p?.c) })).filter((p) => isPieceType(p.type) && Number.isFinite(p.r) && Number.isFinite(p.c) && inBounds(p.r, p.c, rows, cols)).filter((p) => !removedSet.has(`${p.r}:${p.c}`)) : [];
      return { board: { rows, cols }, removed, pieces };
    }
    function buildRemovedSet(removed) {
      const s = /* @__PURE__ */ new Set();
      for (const rc of Array.isArray(removed) ? removed : []) s.add(keyOf(rc));
      return s;
    }
    function buildPiecesByCell(pieces) {
      const m = /* @__PURE__ */ new Map();
      (Array.isArray(pieces) ? pieces : []).forEach((p, idx) => {
        m.set(`${Number(p.r)}:${Number(p.c)}`, { idx, type: String(p.type || "").toUpperCase(), r: Number(p.r), c: Number(p.c) });
      });
      return m;
    }
    function occupiedSetFromPieces(pieces) {
      const s = /* @__PURE__ */ new Set();
      for (const p of Array.isArray(pieces) ? pieces : []) s.add(`${Number(p.r)}:${Number(p.c)}`);
      return s;
    }
    function attacksForPiece({ type, from, rows, cols, occupiedSet }) {
      const t = String(type || "N").toUpperCase();
      const fr = Number(from?.r), fc = Number(from?.c);
      const occ = occupiedSet instanceof Set ? occupiedSet : /* @__PURE__ */ new Set();
      const attacked = /* @__PURE__ */ new Set();
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
        add(fr - 1, fc - 1);
        add(fr - 1, fc + 1);
        return attacked;
      }
      if (t === "R" || t === "Q") {
        ray(-1, 0);
        ray(1, 0);
        ray(0, -1);
        ray(0, 1);
      }
      if (t === "B" || t === "Q") {
        ray(-1, -1);
        ray(-1, 1);
        ray(1, -1);
        ray(1, 1);
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
            !isRemoved && isCap ? "is-capture" : ""
          ].filter(Boolean).join(" ");
          let inner = "";
          if (info) {
            const src = pieceImgSrc(ui.settings.displayColor, info.type);
            inner = src ? `<img src="${Core.escapeHtml(src)}" alt="${Core.escapeHtml(info.type)}" style="width: calc(var(--cs-cell, ${cellPx}px) - 10px); height: calc(var(--cs-cell, ${cellPx}px) - 10px); object-fit:contain;">` : `<span style="font-weight:950;">${Core.escapeHtml(info.type)}</span>`;
          }
          const disabled = disableRemoved && isRemoved ? "disabled" : "";
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
            <button id="csSuccessClose" class="vcp-modal-close" type="button" aria-label="Close">\xD7</button>
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
        try {
          backdrop?.remove?.();
        } catch {
        }
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
          void r;
        } catch {
        }
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
      const lines = String(raw).split("\n").map((s) => s.trim()).filter(Boolean);
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
      host.innerHTML = `
      <div class="vcp-modal-backdrop" id="csRulesBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Rules" style="width: calc(100vw - 40px); max-width: 980px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Rules</div>
            <button id="csRulesClose" class="vcp-modal-close" type="button" aria-label="Close">\xD7</button>
          </div>
          <div class="vcp-modal-body">
            <div style="font-weight:950; color:var(--cs-ink);">Chess Solitaire</div>
            <div style="margin-top:8px; line-height:1.55; color:var(--cs-muted); font-weight:900;">
              - Every move must capture <strong>exactly one</strong> piece.<br>
              - You may choose a <strong>different</strong> piece each move.<br>
              - You win when there is <strong>only one</strong> piece left on the board.<br>
              - Removed cells cannot be used, but they do <strong>not</strong> block attack lines.
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
              <button id="csRulesOk" type="button" class="cs-btn primary">OK</button>
            </div>
          </div>
        </div>
      </div>
    `;
      root.appendChild(host);
      const close = () => {
        try {
          host.remove();
        } catch {
        }
      };
      host.querySelector("#csRulesClose")?.addEventListener("click", close);
      host.querySelector("#csRulesOk")?.addEventListener("click", close);
      host.querySelector("#csRulesBackdrop")?.addEventListener("click", (e) => {
        if (e.target && e.target.id === "csRulesBackdrop") close();
      });
    }
    function renderPlaceholder(title, hint) {
      return `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-weight:950; font-size:16px;">${Core.escapeHtml(title)}</div>
        <div style="color:var(--cs-muted); line-height:1.5;">${Core.escapeHtml(hint)}</div>
      </div>
    `;
    }
    async function rerenderMain() {
      if (ui.mode === "home") {
        await setMain(renderHome({ storyIndex: ui.home.storyIndex }));
        bindHomeHandlers();
        return;
      }
      if (ui.mode === "stage") {
        await renderStage();
        return;
      }
      if (ui.mode === "challenge") {
        await setMain(renderPlaceholder("Challenge", "Challenge mode will be implemented next."));
        return;
      }
      if (ui.mode === "builder") {
        if (ui.role !== "teacher") {
          await setMain(renderPlaceholder("Builder", "Builder is teacher-only."));
          return;
        }
        await renderBuilder();
        return;
      }
      await renderSettings();
    }
    function renderDiffPills(active) {
      const a = normalizeDiff(active);
      return `
      <div class="cs-pill-row" role="tablist" aria-label="Difficulty">
        ${DIFFICULTIES.map((d) => {
        const on = d.key === a;
        return `<button type="button" class="cs-pill ${on ? "is-active" : ""}" data-cs-diff="${Core.escapeHtml(d.key)}">${Core.escapeHtml(d.label)}</button>`;
      }).join("")}
      </div>
    `;
    }
    function renderStageListView({ difficulty, stages }) {
      const diff = normalizeDiff(difficulty);
      return `
      ${renderDiffPills(diff)}
      <div class="cs-stage-grid" aria-label="Stages">
        ${(Array.isArray(stages) ? stages : []).map((s) => {
        const no = Number(s.stageNo);
        const done = !!s.__isComplete;
        return `<button type="button" class="cs-stage-card ${done ? "is-complete" : ""}" data-cs-stage-id="${Core.escapeHtml(String(s.id || ""))}">${Number.isFinite(no) ? no : "?"}</button>`;
      }).join("")}
      </div>
    `;
    }
    function renderStagePlayShell({ stage }) {
      const diff = normalizeDiff(stage?.difficulty || ui.stage.difficulty);
      const no = Number(stage?.stageNo);
      return `
      <div class="cs-toolbar">
        <button type="button" class="cs-btn" data-cs-action="backToStages">Back</button>
        <div class="cs-badge">${Core.escapeHtml(diffLabel(diff))} \xB7 Stage ${Number.isFinite(no) ? no : ""}</div>
        <button type="button" class="cs-btn" data-cs-action="reset">Reset</button>
      </div>
      <div id="csPlayArea"></div>
      <div id="csMsg" style="margin-top:12px; color:var(--cs-muted); font-weight:900;"></div>
    `;
    }
    async function renderStage() {
      const root = document.getElementById("chessSolitaireRoot");
      const isTeacher = ui.role === "teacher";
      if (ui.stage.stageId && ui.stage.stage) {
        await setMain(renderStagePlayShell({ stage: ui.stage.stage }));
        rerenderPlay();
        bindPlayHandlers(root);
        return;
      }
      await setMain(renderStageListView({ difficulty: ui.stage.difficulty, stages: ui.stage.stages }));
      bindStageHandlers(root, { isTeacher });
    }
    async function loadStageListFor(modeKey) {
      const isTeacher = ui.role === "teacher";
      const diff = modeKey === "builder" ? ui.builder.difficulty : ui.stage.difficulty;
      const resp = await fetchStages({ isTeacher, difficulty: diff });
      const stages = Array.isArray(resp?.stages) ? resp.stages : [];
      for (const s of stages) {
        const id = String(s?.id || "").trim();
        s.__isComplete = id ? isStageComplete(id) : false;
      }
      if (modeKey === "builder") ui.builder.stages = stages;
      else ui.stage.stages = stages;
    }
    async function openStage(stageId) {
      const isTeacher = ui.role === "teacher";
      const resp = await fetchStageDetail({ isTeacher, stageId });
      const stage = resp?.stage || null;
      ui.stage.stageId = String(stage?.id || "");
      ui.stage.stage = stage;
      const cfg = normalizeStageConfig(stage?.config || {});
      ui.stage.play = {
        cfg,
        pieces: cfg.pieces.map((p) => ({ type: p.type, r: p.r, c: p.c })),
        selectedIdx: -1
      };
      await renderStage();
    }
    function rerenderPlay() {
      const root = document.getElementById("chessSolitaireRoot");
      const playArea = root?.querySelector?.("#csPlayArea");
      if (!playArea) return;
      const play = ui.stage.play;
      const cfg = play?.cfg;
      if (!cfg) return;
      const rows = Number(cfg.board.rows);
      const cols = Number(cfg.board.cols);
      const removedSet = buildRemovedSet(cfg.removed);
      const pieces = Array.isArray(play.pieces) ? play.pieces : [];
      const selectedIdx = Number(play.selectedIdx);
      const occ = occupiedSetFromPieces(pieces);
      let captureSet = /* @__PURE__ */ new Set();
      if (selectedIdx >= 0 && selectedIdx < pieces.length) {
        const p = pieces[selectedIdx];
        const att = attacksForPiece({ type: p.type, from: p, rows, cols, occupiedSet: occ });
        const piecesByCell = buildPiecesByCell(pieces);
        for (const k of att) {
          if (removedSet.has(k)) continue;
          if (piecesByCell.has(k)) captureSet.add(k);
        }
        captureSet.delete(`${Number(p.r)}:${Number(p.c)}`);
      }
      playArea.innerHTML = renderBoardHtml({ rows, cols, removedSet, pieces, selectedIdx, captureSet });
      const msg = root.querySelector("#csMsg");
      if (msg) {
        msg.textContent = pieces.length <= 1 ? "Done." : "Every move must capture exactly one piece.";
      }
    }
    function setMsg(root, text) {
      const el = root?.querySelector?.("#csMsg");
      if (el) el.textContent = String(text || "");
    }
    function bindPlayHandlers(root) {
      const main = root?.querySelector?.("#csMain");
      if (!main) return;
      main.onclick = async (e) => {
        const t = e.target;
        const cellBtn = t && t.closest ? t.closest("[data-cs-cell]") : null;
        const actionBtn = t && t.closest ? t.closest("[data-cs-action]") : null;
        if (actionBtn) {
          const act = String(actionBtn.getAttribute("data-cs-action") || "");
          if (act === "backToStages") {
            ui.stage.stageId = "";
            ui.stage.stage = null;
            ui.stage.play = null;
            await renderStage();
            return;
          }
          if (act === "reset") {
            const stage = ui.stage.stage;
            const cfg2 = normalizeStageConfig(stage?.config || {});
            ui.stage.play = {
              cfg: cfg2,
              pieces: cfg2.pieces.map((p) => ({ type: p.type, r: p.r, c: p.c })),
              selectedIdx: -1
            };
            rerenderPlay();
            setMsg(root, "Reset.");
            return;
          }
        }
        if (!cellBtn) return;
        const play = ui.stage.play;
        const cfg = play?.cfg;
        if (!cfg) return;
        const cell = String(cellBtn.getAttribute("data-cs-cell") || "");
        const [rs, cs] = cell.split(":");
        const r = Number(rs), c = Number(cs);
        const rows = Number(cfg.board.rows), cols = Number(cfg.board.cols);
        if (!inBounds(r, c, rows, cols)) return;
        const removedSet = buildRemovedSet(cfg.removed);
        if (removedSet.has(`${r}:${c}`)) return;
        const pieces = Array.isArray(play.pieces) ? play.pieces : [];
        const piecesByCell = buildPiecesByCell(pieces);
        const clicked = piecesByCell.get(`${r}:${c}`) || null;
        const selectedIdx = Number(play.selectedIdx);
        const hasSelection = selectedIdx >= 0 && selectedIdx < pieces.length;
        if (clicked) {
          const clickedIdx = Number(clicked.idx);
          if (hasSelection && clickedIdx === selectedIdx) {
            play.selectedIdx = -1;
            rerenderPlay();
            setMsg(root, "Deselected.");
            return;
          }
          if (hasSelection && clickedIdx !== selectedIdx) {
            const mover = pieces[selectedIdx];
            const occ = occupiedSetFromPieces(pieces);
            const att = attacksForPiece({ type: mover.type, from: mover, rows, cols, occupiedSet: occ });
            const canCapture = att.has(`${r}:${c}`);
            if (!canCapture) {
              play.selectedIdx = clickedIdx;
              rerenderPlay();
              setMsg(root, "Selected. (No capture from previous piece)");
              return;
            }
            const newPieces = [];
            for (let i = 0; i < pieces.length; i++) {
              if (i === clickedIdx) continue;
              if (i === selectedIdx) continue;
              newPieces.push(pieces[i]);
            }
            newPieces.push({ type: mover.type, r, c });
            play.pieces = newPieces;
            play.selectedIdx = newPieces.length - 1;
            rerenderPlay();
            if (newPieces.length <= 1) {
              markStageComplete(ui.stage.stageId || ui.stage.stage?.id || "");
              try {
                const id = String(ui.stage.stageId || ui.stage.stage?.id || "").trim();
                for (const s of Array.isArray(ui.stage.stages) ? ui.stage.stages : []) {
                  if (String(s?.id || "").trim() === id) s.__isComplete = true;
                }
              } catch {
              }
              const nextId = getNextStageId();
              openSuccessModal(root, {
                title: "Congrarts!",
                body: "You have done this",
                okLabel: "Close",
                nextLabel: "Next",
                onOk: async () => {
                  setMsg(root, "Completed.");
                },
                onNext: nextId ? async () => {
                  try {
                    await openStage(nextId);
                  } catch (e2) {
                    setMsg(root, String(e2?.message || e2));
                  }
                } : async () => {
                  ui.stage.stageId = "";
                  ui.stage.stage = null;
                  ui.stage.play = null;
                  await loadStageListFor("stage").catch(() => {
                  });
                  await renderStage();
                }
              });
            } else {
              setMsg(root, `Captured! Pieces left: ${newPieces.length}`);
            }
            return;
          }
          play.selectedIdx = clickedIdx;
          rerenderPlay();
          setMsg(root, "Select a target piece to capture.");
          return;
        }
        if (hasSelection) {
          play.selectedIdx = -1;
          rerenderPlay();
          setMsg(root, "Deselected.");
          return;
        }
        setMsg(root, "Select a piece, then capture a piece.");
      };
    }
    function bindStageHandlers(root, { isTeacher }) {
      const main = root?.querySelector?.("#csMain");
      if (!main) return;
      main.onclick = async (e) => {
        const t = e.target;
        const pill = t && t.closest ? t.closest("[data-cs-diff]") : null;
        if (pill) {
          ui.stage.difficulty = normalizeDiff(pill.getAttribute("data-cs-diff"));
          await loadStageListFor("stage");
          await renderStage();
          return;
        }
        const card = t && t.closest ? t.closest("[data-cs-stage-id]") : null;
        if (card) {
          const id = String(card.getAttribute("data-cs-stage-id") || "");
          if (!id) return;
          try {
            await openStage(id);
          } catch (err) {
            await setMain(renderPlaceholder("Stage", `Failed to open stage: ${String(err?.message || err)}`));
          }
        }
      };
    }
    function renderBuilderView({ difficulty, stages }) {
      const diff = normalizeDiff(difficulty);
      return `
      <div class="cs-toolbar">
        <div class="cs-badge">${Core.escapeHtml(diffLabel(diff))}</div>
        <button type="button" class="cs-btn primary" data-cs-action="create">Create</button>
      </div>
      ${renderDiffPills(diff)}
      <div class="cs-stage-grid" aria-label="Stages">
        ${(Array.isArray(stages) ? stages : []).map((s) => {
        const no = Number(s.stageNo);
        return `<button type="button" class="cs-stage-card" data-cs-edit-stage-id="${Core.escapeHtml(String(s.id || ""))}">${Number.isFinite(no) ? no : "?"}</button>`;
      }).join("")}
      </div>
    `;
    }
    function openStageEditorModal({ root, difficulty, stage, onSaved }) {
      const isEdit = !!stage?.id;
      const diff = normalizeDiff(difficulty);
      const stageNo = Number(stage?.stageNo);
      const cfg0 = normalizeStageConfig(stage?.config || { board: { rows: 4, cols: 4 }, pieces: [], removed: [] });
      let rows = Number(cfg0.board.rows) || 4;
      let cols = Number(cfg0.board.cols) || 4;
      let removed = Array.isArray(cfg0.removed) ? cfg0.removed.map((x) => ({ r: x.r, c: x.c })) : [];
      let pieces = Array.isArray(cfg0.pieces) ? cfg0.pieces.map((p) => ({ type: p.type, r: p.r, c: p.c })) : [];
      let tool = "piece";
      let pieceType = "Q";
      function removedSet() {
        return buildRemovedSet(removed);
      }
      function clampAll() {
        rows = Math.max(1, Math.trunc(rows || 4));
        cols = Math.max(1, Math.trunc(cols || 4));
        removed = removed.filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c)).map((x) => ({ r: Math.max(0, Math.min(rows - 1, Math.trunc(x.r))), c: Math.max(0, Math.min(cols - 1, Math.trunc(x.c))) }));
        const rset = removedSet();
        pieces = pieces.filter((p) => isPieceType(p.type)).map((p) => ({ type: p.type, r: Math.max(0, Math.min(rows - 1, Math.trunc(p.r))), c: Math.max(0, Math.min(cols - 1, Math.trunc(p.c))) })).filter((p) => !rset.has(`${p.r}:${p.c}`));
        const m = /* @__PURE__ */ new Map();
        for (const p of pieces) m.set(`${p.r}:${p.c}`, p);
        pieces = Array.from(m.values());
      }
      const piecePickerHtml = PIECE_TYPES.map((t) => {
        const src = pieceImgSrc("white", t);
        return `
        <button type="button" class="cs-piece-btn" data-cs-piece="${Core.escapeHtml(t)}" aria-label="Piece ${Core.escapeHtml(t)}">
          ${src ? `<img src="${Core.escapeHtml(src)}" alt="${Core.escapeHtml(t)}">` : Core.escapeHtml(t)}
        </button>
      `;
      }).join("");
      const host = document.createElement("div");
      host.innerHTML = `
      <div class="vcp-modal-backdrop" id="csEditBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Stage editor" style="width: calc(100vw - 40px); max-width: 1300px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">${Core.escapeHtml(isEdit ? `Edit Stage ${Number.isFinite(stageNo) ? stageNo : ""}` : "Create Stage")} (${Core.escapeHtml(diffLabel(diff))})</div>
            <button id="csEditClose" class="vcp-modal-close" type="button" aria-label="Close">\xD7</button>
          </div>
          <div class="vcp-modal-body">
            <div style="color:var(--cs-muted); font-weight:900; margin-top:-4px;">Click tools below, then click the board to place.</div>
            <div style="display:grid; grid-template-columns: 420px 1fr; gap:14px; margin-top:12px; align-items:start;">
              <div>
                <div style="font-weight:950; color:var(--cs-ink);">Settings</div>
                <div class="cs-card" style="margin-top:10px; background:#ffffff;">
                  <div style="font-weight:950; color:var(--cs-ink);">Board size</div>
                  <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap; align-items:center;">
                    <label style="font-weight:900; color:var(--cs-muted);">Rows</label>
                    <input id="csRows" class="cs-input" type="number" min="1" step="1" value="${rows}" style="width:120px;">
                    <label style="font-weight:900; color:var(--cs-muted);">Cols</label>
                    <input id="csCols" class="cs-input" type="number" min="1" step="1" value="${cols}" style="width:120px;">
                  </div>
                </div>

                <div class="cs-card" style="margin-top:12px; background:#ffffff;">
                  <div style="font-weight:950; color:var(--cs-ink);">Tools</div>
                  <div style="margin-top:10px; font-weight:900; color:var(--cs-muted);">Pieces</div>
                  <div class="cs-piece-row" id="csPieceRow">
                    ${piecePickerHtml}
                  </div>
                  <div style="margin-top:12px;">
                    <button type="button" class="cs-tool" data-cs-tool="remove">Remove the cell</button>
                  </div>
                  <div style="margin-top:10px; color:var(--cs-muted); font-weight:900;">
                    Tips: Click a piece icon, then click the board to place/remove it. Remove the cell = toggle cell removed/restored.
                  </div>
                </div>
              </div>

              <div>
                <div style="font-weight:950; color:var(--cs-ink);">Board</div>
                <div class="cs-card" style="margin-top:10px; background:#ffffff;">
                  <div id="csBoardHolder"></div>
                  <div id="csPieceCount" style="margin-top:12px; color:var(--cs-muted); font-weight:900;"></div>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; margin-top:16px;">
              <button id="csEditCancel" class="cs-btn" type="button">Cancel</button>
              <button id="csSaveStage" class="cs-btn primary" type="button">${isEdit ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      </div>
    `;
      root.appendChild(host);
      const getBackdrop = () => host.querySelector("#csEditBackdrop");
      const getModal = () => host.querySelector(".vcp-modal");
      const close = () => {
        try {
          host.remove();
        } catch {
        }
      };
      function rerenderBoard() {
        clampAll();
        const rset = removedSet();
        const holder = host.querySelector("#csBoardHolder");
        if (!holder) return;
        holder.innerHTML = renderBoardHtml({
          rows,
          cols,
          removedSet: rset,
          pieces,
          selectedIdx: -1,
          captureSet: /* @__PURE__ */ new Set(),
          disableRemoved: false
          // IMPORTANT: builder must allow clicking removed cells to restore
        });
        const pc = host.querySelector("#csPieceCount");
        if (pc) pc.textContent = `Piece count: ${pieces.length}. Every move in Stage must capture.`;
        host.querySelectorAll("[data-cs-piece]")?.forEach((b) => {
          const t = String(b.getAttribute("data-cs-piece") || "").toUpperCase();
          b.classList.toggle("is-active", tool === "piece" && t === String(pieceType || "").toUpperCase());
        });
        host.querySelectorAll("[data-cs-tool]")?.forEach((b) => {
          const k = String(b.getAttribute("data-cs-tool") || "");
          b.classList.toggle("is-active", k === tool);
        });
      }
      async function onSave() {
        clampAll();
        const config = {
          board: { rows, cols },
          pieces: pieces.map((p) => ({ type: p.type, r: p.r, c: p.c })),
          removed: removed.map((x) => ({ r: x.r, c: x.c }))
        };
        if (isEdit) await updateStage(stage.id, config);
        else await createStage({ difficulty: diff, config });
        close();
        onSaved && onSaved();
      }
      function bind() {
        const bd = getBackdrop();
        const m = getModal();
        bd?.addEventListener("click", (e) => {
          if (e.target === bd) close();
        });
        host.querySelector("#csEditClose")?.addEventListener("click", close);
        host.querySelector("#csEditCancel")?.addEventListener("click", close);
        host.querySelector("#csSaveStage")?.addEventListener("click", async () => {
          try {
            await onSave();
          } catch (err) {
            alert(String(err?.message || err));
          }
        });
        host.querySelector("#csRows")?.addEventListener("input", (e) => {
          rows = Number(e.target.value || 0) || 4;
          rerenderBoard();
        });
        host.querySelector("#csCols")?.addEventListener("input", (e) => {
          cols = Number(e.target.value || 0) || 4;
          rerenderBoard();
        });
        host.querySelectorAll?.("[data-cs-tool]")?.forEach((btn) => {
          btn.addEventListener("click", () => {
            tool = String(btn.getAttribute("data-cs-tool") || "piece");
            rerenderBoard();
          });
        });
        host.querySelectorAll?.("[data-cs-piece]")?.forEach((btn) => {
          btn.addEventListener("click", () => {
            const t = String(btn.getAttribute("data-cs-piece") || "").toUpperCase();
            if (!isPieceType(t)) return;
            pieceType = t;
            tool = "piece";
            rerenderBoard();
          });
        });
        host.querySelector("#csBoardHolder")?.addEventListener("click", (e) => {
          const cellBtn = e.target && e.target.closest ? e.target.closest("[data-cs-cell]") : null;
          if (!cellBtn) return;
          const cell = String(cellBtn.getAttribute("data-cs-cell") || "");
          const [rs, cs] = cell.split(":");
          const r = Number(rs), c = Number(cs);
          if (!inBounds(r, c, rows, cols)) return;
          if (tool === "remove") {
            const idx2 = removed.findIndex((x) => x.r === r && x.c === c);
            if (idx2 >= 0) removed.splice(idx2, 1);
            else removed.push({ r, c });
            pieces = pieces.filter((p) => !(p.r === r && p.c === c));
            rerenderBoard();
            return;
          }
          const rset = removedSet();
          if (rset.has(`${r}:${c}`)) return;
          const idx = pieces.findIndex((p) => p.r === r && p.c === c);
          if (idx >= 0) {
            pieces.splice(idx, 1);
            rerenderBoard();
            return;
          }
          if (!isPieceType(pieceType)) pieceType = "Q";
          pieces.push({ type: pieceType, r, c });
          rerenderBoard();
        });
      }
      rerenderBoard();
      bind();
    }
    async function renderBuilder() {
      await setMain(renderBuilderView({ difficulty: ui.builder.difficulty, stages: ui.builder.stages }));
      const root = document.getElementById("chessSolitaireRoot");
      const main = root?.querySelector?.("#csMain");
      if (!main) return;
      main.onclick = async (e) => {
        const t = e.target;
        const pill = t && t.closest ? t.closest("[data-cs-diff]") : null;
        if (pill) {
          ui.builder.difficulty = normalizeDiff(pill.getAttribute("data-cs-diff"));
          await loadStageListFor("builder");
          await renderBuilder();
          return;
        }
        const createBtn = t && t.closest ? t.closest('[data-cs-action="create"]') : null;
        if (createBtn) {
          openStageEditorModal({
            root,
            difficulty: ui.builder.difficulty,
            stage: null,
            onSaved: async () => {
              await loadStageListFor("builder");
              await renderBuilder();
            }
          });
          return;
        }
        const editCard = t && t.closest ? t.closest("[data-cs-edit-stage-id]") : null;
        if (editCard) {
          const id = String(editCard.getAttribute("data-cs-edit-stage-id") || "");
          if (!id) return;
          try {
            const resp = await fetchStageDetail({ isTeacher: true, stageId: id });
            openStageEditorModal({
              root,
              difficulty: ui.builder.difficulty,
              stage: resp?.stage || null,
              onSaved: async () => {
                await loadStageListFor("builder");
                await renderBuilder();
              }
            });
          } catch (err) {
            alert(String(err?.message || err));
          }
        }
      };
    }
    async function renderSettings() {
      const c = ui.settings.displayColor;
      await setMain(`
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="font-weight:950; font-size:16px;">Piece color</div>
        <div style="color:var(--cs-muted); font-weight:900;">Default in Builder is white. You can switch display color here.</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <button type="button" class="cs-btn ${c === "white" ? "primary" : ""}" data-cs-set-color="white">White</button>
          <button type="button" class="cs-btn ${c === "black" ? "primary" : ""}" data-cs-set-color="black">Black</button>
        </div>
      </div>
    `);
      const root = document.getElementById("chessSolitaireRoot");
      const main = root?.querySelector?.("#csMain");
      main?.querySelectorAll?.("[data-cs-set-color]")?.forEach((btn) => {
        btn.addEventListener("click", async () => {
          const v = String(btn.getAttribute("data-cs-set-color") || "").toLowerCase();
          if (v !== "white" && v !== "black") return;
          ui.settings.displayColor = v;
          saveSettings();
          await renderSettings();
        });
      });
    }
    function bindNav() {
      const root = document.getElementById("chessSolitaireRoot");
      if (!root) return;
      root.addEventListener("click", async (e) => {
        const btn = e.target && e.target.closest ? e.target.closest(".cs-nav-btn[data-cs-mode]") : null;
        if (!btn) return;
        const mode = Core.normalizeMode(btn.getAttribute("data-cs-mode"));
        if (mode === ui.mode) return;
        if (mode === "builder" && ui.role !== "teacher") return;
        ui.mode = mode;
        Core.setUrlMode(ui.mode);
        rerenderShell();
        if (ui.mode === "stage") {
          await loadStageListFor("stage").catch(() => {
          });
        }
        if (ui.mode === "builder") {
          await loadStageListFor("builder").catch(() => {
          });
        }
        await rerenderMain();
      });
    }
    function bindHomeHandlers() {
      const root = document.getElementById("chessSolitaireRoot");
      if (!root) return;
      const main = root.querySelector("#csMain");
      if (!main) return;
      const nextBtn = main.querySelector('[data-cs-story-next="1"]');
      if (nextBtn) {
        nextBtn.addEventListener("click", async () => {
          ui.home.storyIndex = Math.min(4, Number(ui.home.storyIndex || 0) + 1);
          await setMain(renderHome({ storyIndex: ui.home.storyIndex }));
          bindHomeHandlers();
        });
      }
      const rulesBtn = main.querySelector('[data-cs-home-rules="1"]');
      if (rulesBtn) {
        rulesBtn.addEventListener("click", () => openRulesModal(root));
      }
      const startBtn = main.querySelector('[data-cs-start-game="1"]');
      if (startBtn) {
        startBtn.addEventListener("click", async () => {
          ui.mode = "stage";
          ui.stage.difficulty = "easy";
          ui.home.storyIndex = 0;
          Core.setUrlMode(ui.mode);
          await loadStageListFor("stage").catch(() => {
          });
          rerenderShell();
          await rerenderMain();
        });
      }
    }
    async function initChessSolitaire() {
      const root = document.getElementById("chessSolitaireRoot");
      if (!root) {
        console.error("#chessSolitaireRoot not found");
        return;
      }
      loadSettings();
      if (!ui.settings.displayColor) ui.settings.displayColor = "white";
      if (ui.mode === "stage") await loadStageListFor("stage").catch(() => {
      });
      if (ui.mode === "builder" && ui.role === "teacher") await loadStageListFor("builder").catch(() => {
      });
      rerenderShell();
      bindNav();
      await rerenderMain();
    }
    window.initChessSolitaire = initChessSolitaire;
  })();
})();
