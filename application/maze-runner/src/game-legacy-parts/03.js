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

  function renderBoardHtml({ rows, cols, rocksSet, blacksMap, goals, goalIndex, portalsMap, pos, selected, pieceType }) {
    const colsCss = `repeat(${cols}, var(--mr-cell, 36px))`;
    const goalArr = Array.isArray(goals) ? goals : [];
    const activeGoal = goalArr[Math.max(0, Math.min(goalArr.length - 1, Number(goalIndex) || 0))] || null;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dark = (r + c) % 2 === 1;
        const isRock = isRockAt(rocksSet, r, c);
        const blk = blackAt(blacksMap, r, c);
        const isGoal = activeGoal ? posEq(activeGoal, { r, c }) : false;
        const isPortal = !!portalExit(portalsMap, r, c);
        const isSel = selected && Number(selected.r) === r && Number(selected.c) === c;
        const isPos = posEq(pos, { r, c });
        const classes = [
          "mr-cell",
          dark ? "is-dark" : "",
          isRock ? "is-rock" : "",
          blk ? "is-black" : "",
          isGoal ? "is-goal" : "",
          isPortal ? "is-portal" : "",
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
        } else if (isPortal) {
          inner = `<span aria-hidden="true" style="font-size:18px;">🌀</span>`;
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
    const portalsMap = buildPortalsMap(cfg.portals);
    const maxStepsLabel = cfg.maxSteps == null ? "∞" : String(cfg.maxSteps);
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
        ${renderBoardHtml({
          rows,
          cols,
          rocksSet,
          blacksMap,
          goals: cfg.goals,
          goalIndex: state.goalIndex || 0,
          portalsMap,
          pos: state.pos,
          selected: state.selected,
          pieceType: cfg.piece.type
        })}
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
              - You cannot move onto squares attacked by black pieces.<br>
              - You may capture a black piece on an attacked square <strong>only if</strong> that black piece is <strong>not protected</strong> by any other black piece.<br>
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
          goalIndex: 0,
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

