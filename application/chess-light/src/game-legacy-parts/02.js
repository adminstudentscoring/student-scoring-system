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
