
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
    const removeGoalAt = (r, c) => {
      cfg.goals = (Array.isArray(cfg.goals) ? cfg.goals : []).filter((g) => !(Number(g.r) === r && Number(g.c) === c));
      if (!cfg.goals.length) cfg.goals = [{ r: 0, c: (Number(cfg?.board?.cols || 6) || 6) - 1 }];
    };
    const removePortalAt = (r, c) => {
      cfg.portals = (Array.isArray(cfg.portals) ? cfg.portals : []).filter((p) => {
        const a = p?.a, b = p?.b;
        if (!a || !b) return false;
        const hitA = Number(a.r) === r && Number(a.c) === c;
        const hitB = Number(b.r) === r && Number(b.c) === c;
        return !(hitA || hitB);
      });
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
            // cannot place goal on rock / portal (we'll remove those)
            removeRockAt(r, c);
            removePortalAt(r, c);
            // toggle: if already a goal, remove; else append as next goal
            cfg.goals = Array.isArray(cfg.goals) ? cfg.goals : [];
            const existsIdx = cfg.goals.findIndex((g) => Number(g.r) === r && Number(g.c) === c);
            if (existsIdx >= 0) cfg.goals.splice(existsIdx, 1);
            else cfg.goals.push({ r, c });
            renderToDom();
            return;
          }
          if (tool === "portal") {
            // cannot place portal on rock/start/goal/black
            const onStart = cfg.piece.start.r === r && cfg.piece.start.c === c;
            const onGoal = (Array.isArray(cfg.goals) ? cfg.goals : []).some((g) => Number(g.r) === r && Number(g.c) === c);
            const onRock = (Array.isArray(cfg.rocks) ? cfg.rocks : []).some((x) => Number(x.r) === r && Number(x.c) === c);
            const onBlack = (Array.isArray(cfg.blacks) ? cfg.blacks : []).some((b) => Number(b.r) === r && Number(b.c) === c);
            if (onStart || onGoal || onRock || onBlack) return;

            // If click a cell that is already a portal endpoint, remove that pair
            const pm = buildPortalsMap(cfg.portals);
            if (portalExit(pm, r, c)) {
              removePortalAt(r, c);
              portalPending = null;
              renderToDom();
              return;
            }

            // Place in pairs
            if (!portalPending) {
              portalPending = { r, c };
              renderToDom();
              return;
            }
            // cancel if clicking same
            if (portalPending.r === r && portalPending.c === c) {
              portalPending = null;
              renderToDom();
              return;
            }
            cfg.portals = Array.isArray(cfg.portals) ? cfg.portals : [];
            cfg.portals.push({ a: { r: portalPending.r, c: portalPending.c }, b: { r, c } });
            portalPending = null;
            renderToDom();
            return;
          }
          if (tool === "rock") {
            // cannot place rock on start/goal
            if (cfg.piece.start.r === r && cfg.piece.start.c === c) return;
            if ((Array.isArray(cfg.goals) ? cfg.goals : []).some((g) => Number(g.r) === r && Number(g.c) === c)) return;
            const exists = (Array.isArray(cfg.rocks) ? cfg.rocks : []).some((x) => Number(x.r) === r && Number(x.c) === c);
            if (exists) removeRockAt(r, c);
            else cfg.rocks = [...(Array.isArray(cfg.rocks) ? cfg.rocks : []), { r, c }];
            // remove any black on rock
            removeBlackAt(r, c);
            // remove any portal on rock
            removePortalAt(r, c);
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
            removePortalAt(r, c);
            // allow erasing goals (but keep at least one)
            removeGoalAt(r, c);
            // do not erase start with eraser (keep stable)
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
    return `/application/maze-runner/images/pieces/${c}_${nm}.png`;
  }

  function mrRockImgSrc() {
    return "/application/maze-runner/images/pieces/rock_1.png";
  }

  function buildPortalsMap(portals) {
    const m = new Map();
    for (const p of (Array.isArray(portals) ? portals : [])) {
      const a = p?.a, b = p?.b;
      if (!a || !b) continue;
      const ak = `${Number(a.r)}:${Number(a.c)}`;
      const bk = `${Number(b.r)}:${Number(b.c)}`;
      m.set(ak, { r: Number(b.r), c: Number(b.c) });
      m.set(bk, { r: Number(a.r), c: Number(a.c) });
    }
    return m;
  }

  function portalExit(portalsMap, r, c) {
    return portalsMap.get(`${Number(r)}:${Number(c)}`) || null;
  }

  function isSquareAttackedByOtherBlacks({ blacks, rocksSet, rows, cols, square, exclude }) {
    const ex = exclude && typeof exclude === "object" ? exclude : null;
    const filtered = (Array.isArray(blacks) ? blacks : []).filter((b) => {
      if (!ex) return true;
      return !(Number(b.r) === Number(ex.r) && Number(b.c) === Number(ex.c));
    });
    const attacked = squaresAttackedByBlack({ blacks: filtered, rocksSet, rows, cols });
    return attacked.has(`${Number(square.r)}:${Number(square.c)}`);
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
    const clampRc = (rc, def) => ({
      r: Math.max(0, Math.min(rows - 1, Number(rc?.r ?? def?.r ?? 0) || 0)),
      c: Math.max(0, Math.min(cols - 1, Number(rc?.c ?? def?.c ?? (cols - 1)) || 0))
    });
    const legacyGoal = cfg?.goal ? clampRc(cfg.goal, { r: 0, c: cols - 1 }) : null;
    let goals = Array.isArray(cfg?.goals) ? cfg.goals
      .map((x) => ({ r: Number(x?.r), c: Number(x?.c) }))
      .filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c) && inBounds(x.r, x.c, rows, cols))
      : [];
    if (!goals.length && legacyGoal) goals = [legacyGoal];
    if (!goals.length) goals = [clampRc(null, { r: 0, c: cols - 1 })];

    const rocks = Array.isArray(cfg?.rocks) ? cfg.rocks
      .map((x) => ({ r: Number(x?.r), c: Number(x?.c) }))
      .filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c) && inBounds(x.r, x.c, rows, cols))
      : [];
    const blacks = Array.isArray(cfg?.blacks) ? cfg.blacks
      .map((x) => ({ type: String(x?.type || "P").trim().toUpperCase(), r: Number(x?.r), c: Number(x?.c) }))
      .filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c) && inBounds(x.r, x.c, rows, cols))
      : [];
    const portals = Array.isArray(cfg?.portals) ? cfg.portals
      .map((p) => ({
        a: p?.a ? { r: Number(p.a.r), c: Number(p.a.c) } : null,
        b: p?.b ? { r: Number(p.b.r), c: Number(p.b.c) } : null
      }))
      .filter((p) => p.a && p.b
        && Number.isFinite(p.a.r) && Number.isFinite(p.a.c) && inBounds(p.a.r, p.a.c, rows, cols)
        && Number.isFinite(p.b.r) && Number.isFinite(p.b.c) && inBounds(p.b.r, p.b.c, rows, cols)
        && !(p.a.r === p.b.r && p.a.c === p.b.c)
      )
      : [];
    const maxStepsRaw = cfg?.maxSteps;
    const maxSteps = (maxStepsRaw == null || String(maxStepsRaw).trim() === "") ? null : Math.max(1, Number(maxStepsRaw) || 1);
    return { board: { rows, cols }, piece: { type: pieceType, start }, goals, rocks, blacks, portals, maxSteps };
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

