    host.innerHTML = `
      <div class="vcp-modal-backdrop" id="csRulesBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Rules" style="width: calc(100vw - 40px); max-width: 980px;">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Rules</div>
            <button id="csRulesClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
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
    const close = () => { try { host.remove(); } catch {} };
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
        <div class="cs-badge">${Core.escapeHtml(diffLabel(diff))} · Stage ${Number.isFinite(no) ? no : ""}</div>
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

    // show capture targets for selected piece
    const occ = occupiedSetFromPieces(pieces);
    let captureSet = new Set();
    if (selectedIdx >= 0 && selectedIdx < pieces.length) {
      const p = pieces[selectedIdx];
      const att = attacksForPiece({ type: p.type, from: p, rows, cols, occupiedSet: occ });
      const piecesByCell = buildPiecesByCell(pieces);
      for (const k of att) {
        if (removedSet.has(k)) continue;
        if (piecesByCell.has(k)) captureSet.add(k); // only captures allowed
      }
      // cannot capture itself
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
          const cfg = normalizeStageConfig(stage?.config || {});
          ui.stage.play = {
            cfg,
            pieces: cfg.pieces.map((p) => ({ type: p.type, r: p.r, c: p.c })),
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

      // Clicking on a piece
      if (clicked) {
        const clickedIdx = Number(clicked.idx);

        // Re-click selected piece => deselect (not a move)
        if (hasSelection && clickedIdx === selectedIdx) {
          play.selectedIdx = -1;
          rerenderPlay();
          setMsg(root, "Deselected.");
          return;
        }

        // If we have a selection and clicked another piece:
        // - if capturable => capture
        // - else => switch selection to the clicked piece (NOT an illegal action)
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

          // Do capture: remove target, move mover to target square
          const newPieces = [];
          for (let i = 0; i < pieces.length; i++) {
            if (i === clickedIdx) continue; // captured
            if (i === selectedIdx) continue; // mover replaced
            newPieces.push(pieces[i]);
          }
          newPieces.push({ type: mover.type, r, c });
          play.pieces = newPieces;
          play.selectedIdx = newPieces.length - 1;
          rerenderPlay();

          if (newPieces.length <= 1) {
            markStageComplete(ui.stage.stageId || ui.stage.stage?.id || "");
          // Update in-memory stage list so UI can reflect completion immediately
          try {
            const id = String(ui.stage.stageId || ui.stage.stage?.id || "").trim();
            for (const s of (Array.isArray(ui.stage.stages) ? ui.stage.stages : [])) {
              if (String(s?.id || "").trim() === id) s.__isComplete = true;
            }
          } catch {}
          const nextId = getNextStageId();
            openSuccessModal(root, {
              title: "Congrarts!",
              body: "You have done this",
              okLabel: "Close",
            nextLabel: "Next",
            onOk: async () => {
              setMsg(root, "Completed.");
              // if user closes, keep them on current board
            },
            onNext: nextId
              ? async () => {
                  try {
                    await openStage(nextId);
                  } catch (e) {
                    setMsg(root, String(e?.message || e));
                  }
                }
              : async () => {
                  // no next stage: go back to stage list
                  ui.stage.stageId = "";
                  ui.stage.stage = null;
                  ui.stage.play = null;
                  await loadStageListFor("stage").catch(() => {});
                  await renderStage();
                }
            });
          } else {
            setMsg(root, `Captured! Pieces left: ${newPieces.length}`);
          }
          return;
        }

        // No selection => select clicked
        play.selectedIdx = clickedIdx;
        rerenderPlay();
        setMsg(root, "Select a target piece to capture.");
        return;
      }

      // Clicking empty: allow deselect (not a move). If nothing selected, just hint.
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
    let pieceType = "Q"; // default white piece in builder

    function removedSet() {
      return buildRemovedSet(removed);
    }
    function clampAll() {
      rows = Math.max(1, Math.trunc(rows || 4));
      cols = Math.max(1, Math.trunc(cols || 4));
      removed = removed
        .filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c))
        .map((x) => ({ r: Math.max(0, Math.min(rows - 1, Math.trunc(x.r))), c: Math.max(0, Math.min(cols - 1, Math.trunc(x.c))) }));
      const rset = removedSet();
      pieces = pieces
        .filter((p) => isPieceType(p.type))
        .map((p) => ({ type: p.type, r: Math.max(0, Math.min(rows - 1, Math.trunc(p.r))), c: Math.max(0, Math.min(cols - 1, Math.trunc(p.c))) }))
        .filter((p) => !rset.has(`${p.r}:${p.c}`));
      // de-dupe pieces by cell (keep last)
      const m = new Map();
      for (const p of pieces) m.set(`${p.r}:${p.c}`, p);
      pieces = Array.from(m.values());
    }

    const piecePickerHtml = PIECE_TYPES.map((t) => {
      const src = pieceImgSrc("white", t); // Builder default: white pieces
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
            <button id="csEditClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
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
