        answers: { items: [] },
        idx: 0
      },
      history: {
        items: []
      },
      settings: {
        groups: [],
        students: []
      }
    };

    root.innerHTML = renderShell({ role, mode: ui.mode });

    let mainRenderToken = 0;
    const setMain = (html) => {
      const el = document.getElementById("cwMain");
      if (!el) return Promise.resolve();
      const token = ++mainRenderToken;
      el.classList.add("cw-fade", "is-out");
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

    const computeFenForStudentPv = ({ it, st }) => {
      try {
        if (!it?.boardEnabled) return "";
        const rows = Number(it.board?.rows), cols = Number(it.board?.cols);
        const pieces = (st && Array.isArray(st.pieces)) ? st.pieces : (it.pieces || []);
        const movesLen = (st && Array.isArray(st.moves)) ? st.moves.length : 0;
        const pvTurn = (() => {
          if (it.turn !== "w" && it.turn !== "b") return "";
          return (movesLen % 2 === 0) ? it.turn : (it.turn === "w" ? "b" : "w");
        })();
        const turn = it.pvEnabled ? pvTurn : it.turn;
        if (rows === 8 && cols === 8) return buildFen8({ pieces, turn });
        return buildCwFen({ rows, cols, pieces, turn });
      } catch {}
      return "";
    };

    const rerenderStudentPvOnly = () => {
      const main = root.querySelector("#cwMain");
      if (!main) return;
      const host = main.querySelector("#cwPvBoardHost");
      if (!host) return;
      const work = normalizeWork(ui.studentWorks.work || {});
      const idx = Math.max(0, Math.min(work.items.length - 1, Number(ui.studentWorks.idx) || 0));
      const it = work.items[idx];
      if (!it?.boardEnabled || !it?.pvEnabled) return;
      const flip = it.turn === "b";
      const st = ui.studentWorks.pvState?.[idx] || null;
      const pieces = (st && Array.isArray(st.pieces)) ? st.pieces : (it.pieces || []);
      host.innerHTML = renderBoardHtml({
        rows: it.board.rows,
        cols: it.board.cols,
        pieces,
        interactive: true,
        flip,
        selectedCell: String(st?.selected || ""),
        lastMove: st?.lastMove || null
      });
      const fen = computeFenForStudentPv({ it, st });
      const fenEl = main.querySelector("#cwFenHidden");
      if (fenEl) fenEl.value = String(fen || "");
    };

    const rerenderShell = () => {
      root.innerHTML = renderShell({ role, mode: ui.mode });
      bindNav();
    };

    // ===== Renderers =====
    function renderHome() {
      return `
        <div style="font-weight:1000; color:var(--cw-ink);">Chess Works</div>
        <div class="cw-muted" style="margin-top:8px; line-height:1.7;">
          Teacher creates works (board puzzles or text questions) and assigns them to specific students or groups.
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:14px;">
          <button type="button" class="cw-btn primary" data-cw-go-works="1">Start</button>
        </div>
      `;
    }

    function renderStudentWorksList() {
      return `
        <div class="cw-toolbar">
          <div class="cw-badge">Works</div>
          <button type="button" class="cw-btn" data-cw-refresh="1">Refresh</button>
        </div>
        <div class="cw-grid">
          ${(ui.studentWorks.works || []).map((w) => `
            <div class="cw-work-card" data-cw-open-work="${escapeHtml(String(w.id))}">
              <div class="cw-work-title">${escapeHtml(w.title || "(Untitled)")}</div>
              <div class="cw-work-sub">Click to start</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderStudentDoWork() {
      const w = ui.studentWorks.work;
      if (!w) return `<div class="cw-muted">Work not found.</div>`;
      const work = normalizeWork(w);
      const idx = Math.max(0, Math.min(work.items.length - 1, Number(ui.studentWorks.idx) || 0));
      const it = work.items[idx];
      const fenBase = fenForItem(it);
      const ans = (ui.studentWorks.answers?.items?.[idx]) || {};
      const pvMoves = Array.isArray(ans.pvMoves) ? ans.pvMoves : [];
      const text = String(ans.text || "");
      const pvState = ui.studentWorks.pvState?.[idx] || null;
      const flip = it.turn === "b";
      const pvTurn = (() => {
        if (it.turn !== "w" && it.turn !== "b") return "";
        const n = (pvState && Array.isArray(pvState.moves)) ? pvState.moves.length : pvMoves.length;
        return (n % 2 === 0) ? it.turn : (it.turn === "w" ? "b" : "w");
      })();
      const fenNow = (() => {
        if (!it.boardEnabled) return "";
        const pieces = (pvState && Array.isArray(pvState.pieces)) ? pvState.pieces : it.pieces;
        const rows = Number(it.board.rows), cols = Number(it.board.cols);
        const turn = it.pvEnabled ? pvTurn : it.turn;
        if (rows === 8 && cols === 8) return buildFen8({ pieces, turn });
        return buildCwFen({ rows, cols, pieces, turn });
      })();
      return `
        <div class="cw-toolbar">
          <button type="button" class="cw-btn" data-cw-back="1">Back</button>
          <div class="cw-badge">${escapeHtml(work.title || "(Untitled)")} · ${escapeHtml(String(idx + 1))}/${escapeHtml(String(work.items.length))}</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" class="cw-btn" data-cw-prev="1">←</button>
            <button type="button" class="cw-btn" data-cw-next="1">→</button>
            <button type="button" class="cw-btn" data-cw-cancel="1">Cancel</button>
            <button type="button" class="cw-btn primary" data-cw-save="1">Save</button>
          </div>
        </div>

        <div class="cw-card cw-student-q-card" style="margin-top:12px;">
          <div class="cw-student-q">
            ${escapeHtml(it.prompt || "")}
          </div>
        </div>

        ${it.boardEnabled ? `
          <div class="cw-card" style="margin-top:12px;">
            <div class="cw-board-3col">
              <div class="cw-board-side cw-board-side-left">
                <div class="cw-board-turn">${escapeHtml(turnLabel(it.turn))}</div>
                ${it.pvEnabled ? `<div class="cw-badge">${escapeHtml(moveLabel(it.pvPlies || 1))}</div>` : ``}
              </div>

              <div class="cw-board-center">
                  ${it.pvEnabled ? `
                    <div id="cwPvBoardHost">
                      ${renderBoardHtml({
                        rows: it.board.rows,
                        cols: it.board.cols,
                        pieces: (pvState?.pieces || it.pieces),
                        interactive: true,
                        flip,
                        selectedCell: String(pvState?.selected || ""),
                        lastMove: pvState?.lastMove || null
                      })}
                    </div>
                  ` : `
                  ${renderBoardHtml({ rows: it.board.rows, cols: it.board.cols, pieces: it.pieces, interactive: false, flip })}
                `}
              </div>

              <div class="cw-board-side cw-board-side-right">
                ${it.pvEnabled ? `
                  <button type="button" class="cw-btn" data-cw-pv-undo="1">Undo</button>
                  <button type="button" class="cw-btn" data-cw-pv-reset="1">Reset</button>
                ` : ``}
              </div>
            </div>
              <input type="hidden" id="cwFenHidden" value="${escapeHtml(it.pvEnabled ? fenNow : fenBase)}">
          </div>
        ` : ``}

        ${it.textEnabled ? `
          <div class="cw-card" style="margin-top:12px;">
            <div style="font-weight:1000; color:var(--cw-ink);">Answer</div>
            <div class="cw-muted" style="margin-top:10px;">Text</div>
            <textarea id="cwAnsText" style="width:100%; min-height:90px; margin-top:8px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900; color:var(--cw-ink);">${escapeHtml(text)}</textarea>
          </div>
        ` : ``}
        <div id="cwSaveHint" class="cw-muted" style="margin-top:10px;"></div>
      `;
    }

    function renderStudentHistory() {
      return `
        <div class="cw-toolbar">
          <div class="cw-badge">History</div>
          <button type="button" class="cw-btn" data-cw-refresh-history="1">Refresh</button>
        </div>
        <div class="cw-grid">
          ${(ui.history.items || []).map((x) => `
            <div class="cw-work-card" data-cw-history-detail="${escapeHtml(String(x.workId))}">
              <div class="cw-work-title">${escapeHtml(x.title || "(Untitled)")}</div>
              <div class="cw-work-sub">Reviewed</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderTeacherWorksList() {
      return `
        <div class="cw-toolbar">
          <div class="cw-badge">My Works</div>
          <button type="button" class="cw-btn" data-cw-refresh-teacher-works="1">Refresh</button>
        </div>
        <div class="cw-grid">
          ${(ui.teacherWorks.works || []).map((w) => `
            <div class="cw-work-card" data-cw-teacher-open="${escapeHtml(String(w.id))}">
              <div class="cw-work-title">${escapeHtml(w.title || "(Untitled)")}</div>
              <div class="cw-work-sub">Click to manage</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderTeacherWorkDetail() {
      const w = ui.teacherWorks.work;
      if (!w) return `<div class="cw-muted">Work not found.</div>`;
      return `
        <div class="cw-toolbar">
          <button type="button" class="cw-btn" data-cw-teacher-back="1">Back</button>
          <div class="cw-badge">${escapeHtml(w.title || "(Untitled)")}</div>
          <div></div>
        </div>
        <div class="cw-card" style="margin-top:12px;">
          <div class="cw-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
            <div class="cw-work-card" data-cw-teacher-view-works="1">
              <div class="cw-work-title">View Works</div>
              <div class="cw-work-sub">Try the works as a student</div>
            </div>
            <div class="cw-work-card" data-cw-teacher-view-students="1">
              <div class="cw-work-title">View Students</div>
              <div class="cw-work-sub">Review student submissions</div>
            </div>
          </div>
        </div>
      `;
    }

    function renderTeacherStudentsForWork() {
      const w = ui.teacherWorks.work;
      if (!w) return `<div class="cw-muted">Work not found.</div>`;
      return `
        <div class="cw-toolbar">
          <button type="button" class="cw-btn" data-cw-teacher-back-detail="1">Back</button>
          <div class="cw-badge">Students · ${escapeHtml(w.title || "(Untitled)")}</div>
          <button type="button" class="cw-btn" data-cw-teacher-refresh-students="1">Refresh</button>
        </div>
        <div style="display:grid; gap:10px;">
          ${(ui.teacherWorks.studentStatus || []).map((s) => {
            const needs = !!s.hasSubmission && !s.review?.finished;
            return `
              <div class="cw-review-row ${needs ? "is-needs-review" : ""}" data-cw-review-student="${escapeHtml(String(s.id))}">
                <div>
                  <div style="font-weight:1000; color:var(--cw-ink);">${escapeHtml(s.name || s.id)}</div>
                  <div class="cw-muted" style="margin-top:2px;">
                    ${s.hasSubmission ? `Submitted (saved)` : `No submission yet`} · ${s.review?.finished ? "Reviewed" : "Not reviewed"}
                  </div>
                </div>
                <button type="button" class="cw-btn primary">Open</button>
              </div>
            `;
          }).join("")}
          ${(!ui.teacherWorks.studentStatus || !ui.teacherWorks.studentStatus.length) ? `<div class="cw-muted">No assigned students yet.</div>` : ``}
        </div>
      `;
    }

    function renderTeacherReviewStudent() {
      const w = ui.teacherWorks.work;
      const sid = String(ui.teacherWorks.studentId || "");
      if (!w || !sid) return `<div class="cw-muted">Missing context.</div>`;
      const work = normalizeWork(w);
      const submission = ui.teacherWorks.submission?.answers || {};
      const answers = Array.isArray(submission?.items) ? submission.items : [];
      const marks = Array.isArray(ui.teacherWorks.review?.marks) ? ui.teacherWorks.review.marks : [];
      const finished = !!ui.teacherWorks.review?.finished;
      return `
        <div class="cw-toolbar">
          <button type="button" class="cw-btn" data-cw-review-back="1">Back</button>
          <div class="cw-badge">Review · ${escapeHtml(String(sid))}</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" class="cw-btn" data-cw-review-save="1">Save</button>
            <button type="button" class="cw-btn primary" data-cw-review-finish="1">Finish review</button>
          </div>
        </div>

        ${(work.items || []).map((it, idx) => {
          const a = answers[idx] || {};
          const mk = String(marks[idx] || "");
          const pvMoves = Array.isArray(a.pvMoves) ? a.pvMoves : [];
          const pvStepRaw = ui.teacherWorks.reviewPvStep && Object.prototype.hasOwnProperty.call(ui.teacherWorks.reviewPvStep, idx) ? ui.teacherWorks.reviewPvStep[idx] : 0;
          const pvStep = Math.max(0, Math.min(pvMoves.length, Number(pvStepRaw) || 0));
          const pvPieces = it.pvEnabled ? applyPvMovesToPieces({ basePieces: it.pieces, moves: pvMoves, step: pvStep }) : [];
          const pvLast = (it.pvEnabled && pvStep > 0) ? pvMoves[pvStep - 1] : null;
          const pill = (k, label) => `<button type="button" class="cw-pill ${mk === k ? "is-active" : ""}" data-cw-mark="${escapeHtml(String(idx))}:${escapeHtml(k)}">${escapeHtml(label)}</button>`;
          return `
            <div class="cw-card" style="margin-top:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <div style="font-weight:1000; color:var(--cw-ink);">Q${idx + 1}</div>
                <div class="cw-pill-row" style="margin:0;">
                  ${pill("correct", "Correct")}
                  ${pill("half", "Half")}
                  ${pill("incorrect", "Incorrect")}
                </div>
              </div>
              <div class="cw-muted" style="margin-top:8px; white-space:pre-wrap;">${escapeHtml(it.prompt || "")}</div>
              ${it.pvEnabled ? `
                <div class="cw-muted" style="margin-top:10px;">PV moves (${escapeHtml(String(pvMoves.length))} / ${escapeHtml(String(it.pvPlies || 1))})</div>
                <div class="cw-card" style="margin-top:10px; padding:10px;">
                  <div style="display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap;">
                    <button type="button" class="cw-btn" style="padding:8px 10px;" data-cw-pv-prev="${escapeHtml(String(idx))}">←</button>
                    <div class="cw-muted" data-cw-pv-mini-label="${escapeHtml(String(idx))}">${escapeHtml(String(pvStep))}/${escapeHtml(String(pvMoves.length))}</div>
                    <button type="button" class="cw-btn" style="padding:8px 10px;" data-cw-pv-next="${escapeHtml(String(idx))}">→</button>
                  </div>
                  <div style="margin-top:10px;" data-cw-pv-mini-board="${escapeHtml(String(idx))}">
                    ${renderBoardHtml({
                      rows: it.board.rows,
                      cols: it.board.cols,
                      pieces: pvPieces,
                      interactive: false,
                      flip: (it.turn === "b"),
                      lastMove: pvLast,
                      targetPx: 240
                    })}
                  </div>
                </div>
                <div style="margin-top:6px; font-weight:900; white-space:pre-wrap;">${escapeHtml(
                  pvMoves.map((m, i) => `${i + 1}. ${String(m.color || "")}${String(m.type || "")} ${String(m.from || "")}→${String(m.to || "")}`).join("\n")
                )}</div>
              ` : ``}
              ${it.textEnabled ? `<div class="cw-muted" style="margin-top:10px;">Text</div><div style="margin-top:6px; font-weight:900; white-space:pre-wrap;">${escapeHtml(String(a.text || ""))}</div>` : ``}
              ${(!it.pvEnabled && !it.textEnabled) ? `<div class="cw-muted" style="margin-top:10px;">No answer fields enabled.</div>` : ``}
            </div>
          `;
        }).join("")}

        <div class="cw-muted" style="margin-top:10px;">Status: ${finished ? "Finished" : "Not finished"}</div>
      `;
    }

    function renderBuilder() {
      const folders = ui.builder.folders || [];
      const works = ui.builder.works || [];
      const active = String(ui.builder.folderId || "all");
      const folderBtn = (id, label) => {
        const canDel = id !== "all" && id !== "unfiled";
        return `
          <button type="button" class="cw-folder-btn ${active === id ? "is-active" : ""}" data-cw-folder="${escapeHtml(id)}">
            <span class="cw-folder-label">${escapeHtml(label)}</span>
            ${canDel ? `<span class="cw-folder-x" data-cw-folder-del="${escapeHtml(id)}" aria-label="Delete folder">×</span>` : ``}
          </button>
        `;
      };
      return `
        <div class="cw-toolbar">
          <div class="cw-badge">Builder</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" class="cw-btn" data-cw-refresh-builder="1">Refresh</button>
            <button type="button" class="cw-btn primary" data-cw-create="1">Create</button>
          </div>
        </div>

        <div class="cw-layout-2">
          <div class="cw-card" style="margin-top:0;">
            <div style="font-weight:1000; color:var(--cw-ink);">Folders</div>
            <div class="cw-folder-list" style="margin-top:10px;">
              ${folderBtn("all", "All")}
              ${folderBtn("unfiled", "Unfiled")}
              ${folders.map((f) => folderBtn(String(f.id), String(f.name || "(Folder)"))).join("")}
            </div>
          </div>

          <div>
            <div class="cw-grid">
              ${works.map((w) => `
                <div class="cw-work-card" draggable="true" data-cw-work-card="${escapeHtml(String(w.id))}">
                  <button type="button" class="cw-work-x" data-cw-work-del="${escapeHtml(String(w.id))}" aria-label="Delete work">×</button>
                  <div class="cw-work-title">${escapeHtml(w.title || "(Untitled)")}</div>
                  <div class="cw-work-actions">
                    <button type="button" class="cw-btn" data-cw-edit="${escapeHtml(String(w.id))}">Edit</button>
                    <button type="button" class="cw-btn" data-cw-assign="${escapeHtml(String(w.id))}">Assign</button>
                    <button type="button" class="cw-btn" data-cw-work-move="${escapeHtml(String(w.id))}">Move</button>
                  </div>
                </div>
              `).join("")}
              ${(!works.length) ? `<div class="cw-muted">No works yet. Click Create → Create Works.</div>` : ``}
            </div>
          </div>
        </div>
      `;
    }

    function openMoveWorkModal(workId) {
      const wid = String(workId || "").trim();
      if (!wid) return;
      const folders = ui.builder.folders || [];
      const works = ui.builder.works || [];
      const w = (works || []).find((x) => String(x.id) === wid) || null;
      const current = w ? String(w.folderId || "") : "";

      const host = document.createElement("div");
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="cwMoveWorkBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Move work" style="width: calc(100vw - 40px); max-width: 720px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Move</div>
              <button id="cwMoveWorkClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div style="font-weight:1000; color:var(--cw-ink);">Destination folder</div>
              <select id="cwMoveWorkSelect" style="width:100%; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                <option value="" ${current ? "" : "selected"}>Unfiled</option>
                ${(folders || []).map((f) => `<option value="${escapeHtml(String(f.id))}" ${String(f.id) === current ? "selected" : ""}>${escapeHtml(String(f.name || f.id))}</option>`).join("")}
              </select>
              <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
                <button id="cwMoveWorkCancel" type="button" class="cw-btn">Cancel</button>
                <button id="cwMoveWorkOk" type="button" class="cw-btn primary">Move</button>
              </div>
              <div id="cwMoveWorkHint" class="cw-muted" style="margin-top:10px;"></div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);
      const close = () => { try { host.remove(); } catch {} };
      host.querySelector("#cwMoveWorkClose")?.addEventListener("click", close);
      host.querySelector("#cwMoveWorkCancel")?.addEventListener("click", close);
      host.querySelector("#cwMoveWorkBackdrop")?.addEventListener("click", (e) => {
