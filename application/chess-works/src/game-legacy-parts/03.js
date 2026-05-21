        if (e.target && e.target.id === "cwMoveWorkBackdrop") close();
      });
      host.querySelector("#cwMoveWorkOk")?.addEventListener("click", async () => {
        const folderId = String(host.querySelector("#cwMoveWorkSelect")?.value || "");
        const hint = host.querySelector("#cwMoveWorkHint");
        try {
          await tPatch(`/api/teachers/chess-works/works/${encodeURIComponent(wid)}`, { folderId });
          close();
          await loadBuilder();
        } catch (e) {
          if (hint) hint.textContent = String(e?.message || e);
        }
      });
    }

    // ===== Modals =====
    function openCreatePickerModal() {
      const host = document.createElement("div");
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="cwCreatePickBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Create" style="width: calc(100vw - 40px); max-width: 720px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Create</div>
              <button id="cwCreatePickClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="cw-grid" style="grid-template-columns: 1fr 1fr;">
                <div class="cw-work-card" data-cw-create-folder="1">
                  <div class="cw-work-title">Create Folder</div>
                  <div class="cw-work-sub">Organize works</div>
                </div>
                <div class="cw-work-card" data-cw-create-work="1">
                  <div class="cw-work-title">Create Works</div>
                  <div class="cw-work-sub">Create questions</div>
                </div>
                <div class="cw-work-card" data-cw-create-file="1">
                  <div class="cw-work-title">Create File</div>
                  <div class="cw-work-sub">Text document in folder</div>
                </div>
              </div>
              <div style="display:flex; justify-content:flex-end; margin-top:14px;">
                <button id="cwCreatePickCancel" type="button" class="cw-btn">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);
      const close = () => { try { host.remove(); } catch {} };
      host.querySelector("#cwCreatePickClose")?.addEventListener("click", close);
      host.querySelector("#cwCreatePickCancel")?.addEventListener("click", close);
      host.querySelector("#cwCreatePickBackdrop")?.addEventListener("click", (e) => {
        if (e.target && e.target.id === "cwCreatePickBackdrop") close();
      });
      host.querySelector("[data-cw-create-folder]")?.addEventListener("click", () => {
        close();
        openCreateFolderModal();
      });
      host.querySelector("[data-cw-create-work]")?.addEventListener("click", () => {
        close();
        openCreateWorkModal();
      });
      host.querySelector("[data-cw-create-file]")?.addEventListener("click", () => {
        close();
        openCreateFileModal();
      });
    }

    function openCreateFolderModal() {
      const host = document.createElement("div");
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="cwCreateFolderBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Create folder" style="width: calc(100vw - 40px); max-width: 720px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Create Folder</div>
              <button id="cwCreateFolderClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div style="font-weight:1000; color:var(--cw-ink);">Folder name</div>
              <input id="cwFolderName" type="text" placeholder="e.g. Week 1" style="width:100%; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
              <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
                <button id="cwCreateFolderCancel" type="button" class="cw-btn">Cancel</button>
                <button id="cwCreateFolderOk" type="button" class="cw-btn primary">Create</button>
              </div>
              <div id="cwCreateFolderHint" class="cw-muted" style="margin-top:10px;"></div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);
      const close = () => { try { host.remove(); } catch {} };
      host.querySelector("#cwCreateFolderClose")?.addEventListener("click", close);
      host.querySelector("#cwCreateFolderCancel")?.addEventListener("click", close);
      host.querySelector("#cwCreateFolderBackdrop")?.addEventListener("click", (e) => {
        if (e.target && e.target.id === "cwCreateFolderBackdrop") close();
      });
      host.querySelector("#cwCreateFolderOk")?.addEventListener("click", async () => {
        const name = String(host.querySelector("#cwFolderName")?.value || "").trim();
        const hint = host.querySelector("#cwCreateFolderHint");
        if (!name) { if (hint) hint.textContent = "Please enter a name."; return; }
        try {
          await tPost("/api/teachers/chess-works/folders", { name });
          close();
          await loadBuilder();
        } catch (e) {
          if (hint) hint.textContent = String(e?.message || e);
        }
      });
    }

    async function openCreateWorkModal() {
      try {
        const created = await tPost("/api/teachers/chess-works/works", { title: "New Works", items: [defaultItem()] });
        const work = normalizeWork(created?.work || {});
        await loadBuilder();
        openWorkEditorModal(work.id);
      } catch (e) {
        alert(String(e?.message || e));
      }
    }

    async function openCreateFileModal() {
      // A "file" is stored as a work with 1 text-only item (board disabled).
      const fileItem = normalizeItem({ prompt: "", boardEnabled: false, pvEnabled: false, textEnabled: false });
      try {
        const created = await tPost("/api/teachers/chess-works/works", { title: "New File", items: [fileItem] });
        const work = normalizeWork(created?.work || {});
        await loadBuilder();
        openWorkEditorModal(work.id);
      } catch (e) {
        alert(String(e?.message || e));
      }
    }

    async function openAssignModal(workId) {
      const wid = String(workId || "").trim();
      if (!wid) return;
      let students = [];
      let groups = [];
      try {
        const s = await tGet("/api/teachers/chess-works/students");
        students = Array.isArray(s?.students) ? s.students : [];
      } catch {}
      try {
        const g = await tGet("/api/teachers/chess-works/groups");
        groups = Array.isArray(g?.groups) ? g.groups : [];
      } catch {}

      const host = document.createElement("div");
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="cwAssignBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Assign" style="width: calc(100vw - 40px); max-width: 980px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Assign</div>
              <button id="cwAssignClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; align-items:start;">
                <div class="cw-card" style="margin-top:0;">
                  <div style="font-weight:1000; color:var(--cw-ink);">Students</div>
                  <input id="cwAssignSearch" type="text" placeholder="Search..." style="width:100%; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                  <div id="cwAssignStudents" style="display:grid; gap:8px; margin-top:10px; max-height:360px; overflow:auto;"></div>
                </div>
                <div class="cw-card" style="margin-top:0;">
                  <div style="font-weight:1000; color:var(--cw-ink);">Groups</div>
                  <div id="cwAssignGroups" style="display:grid; gap:8px; margin-top:10px; max-height:360px; overflow:auto;"></div>
                </div>
              </div>
              <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
                <button id="cwAssignCancel" type="button" class="cw-btn">Cancel</button>
                <button id="cwAssignOk" type="button" class="cw-btn primary">Assign</button>
              </div>
              <div id="cwAssignHint" class="cw-muted" style="margin-top:10px;"></div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);
      const close = () => { try { host.remove(); } catch {} };
      host.querySelector("#cwAssignClose")?.addEventListener("click", close);
      host.querySelector("#cwAssignCancel")?.addEventListener("click", close);
      host.querySelector("#cwAssignBackdrop")?.addEventListener("click", (e) => {
        if (e.target && e.target.id === "cwAssignBackdrop") close();
      });

      const selStudents = new Set();
      const selGroups = new Set();
      const studentsEl = host.querySelector("#cwAssignStudents");
      const groupsEl = host.querySelector("#cwAssignGroups");
      const renderLists = (q) => {
        const query = String(q || "").trim().toLowerCase();
        const shown = students.filter((s) => {
          if (!query) return true;
          return String(s.name || "").toLowerCase().includes(query) || String(s.id || "").toLowerCase().includes(query);
        });
        if (studentsEl) {
          studentsEl.innerHTML = shown.map((s) => `
            <label style="display:flex; gap:10px; align-items:center; padding:8px 10px; border:1px solid var(--cw-border); border-radius:12px; background:#fff; cursor:pointer;">
              <input type="checkbox" data-cw-student="${escapeHtml(String(s.id))}">
              <span style="font-weight:900; color:var(--cw-ink);">${escapeHtml(s.name || s.id)}</span>
            </label>
          `).join("");
          studentsEl.querySelectorAll("input[data-cw-student]").forEach((cb) => {
            const id = String(cb.getAttribute("data-cw-student") || "");
            cb.checked = selStudents.has(id);
            cb.addEventListener("change", () => {
              if (cb.checked) selStudents.add(id); else selStudents.delete(id);
            });
          });
        }
        if (groupsEl) {
          groupsEl.innerHTML = (groups || []).map((g) => `
            <label style="display:flex; gap:10px; align-items:center; padding:8px 10px; border:1px solid var(--cw-border); border-radius:12px; background:#fff; cursor:pointer;">
              <input type="checkbox" data-cw-group="${escapeHtml(String(g.id))}">
              <span style="font-weight:900; color:var(--cw-ink);">${escapeHtml(g.name || g.id)}</span>
            </label>
          `).join("");
          groupsEl.querySelectorAll("input[data-cw-group]").forEach((cb) => {
            const id = String(cb.getAttribute("data-cw-group") || "");
            cb.checked = selGroups.has(id);
            cb.addEventListener("change", () => {
              if (cb.checked) selGroups.add(id); else selGroups.delete(id);
            });
          });
        }
      };
      renderLists("");
      host.querySelector("#cwAssignSearch")?.addEventListener("input", (e) => renderLists(e.target.value));

      host.querySelector("#cwAssignOk")?.addEventListener("click", async () => {
        const hint = host.querySelector("#cwAssignHint");
        try {
          await tPost(`/api/teachers/chess-works/works/${encodeURIComponent(wid)}/assign`, {
            studentIds: Array.from(selStudents),
            groupIds: Array.from(selGroups)
          });
          if (hint) hint.textContent = "Assigned.";
          setTimeout(close, 300);
        } catch (e) {
          if (hint) hint.textContent = String(e?.message || e);
        }
      });
    }

    async function openWorkEditorModal(workId) {
      const wid = String(workId || "").trim();
      if (!wid) return;
      let data = null;
      try {
        data = await tGet(`/api/teachers/chess-works/works/${encodeURIComponent(wid)}`);
      } catch (e) {
        alert(String(e?.message || e));
        return;
      }
      let work = normalizeWork(data?.work || {});
      let idx = 0;
      let tool = { kind: "piece", color: "w", type: "Q" }; // or {kind:'erase'}

      const host = document.createElement("div");
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };

      const clamp = () => {
        work = normalizeWork(work);
        idx = Math.max(0, Math.min(work.items.length - 1, idx));
      };

      const render = () => {
        clamp();
        const it = work.items[idx];
        const fen = fenForItem(it);
        const pieceBtn = (color, t) => {
          const active = tool.kind === "piece" && tool.color === color && tool.type === t;
          return `<button type="button" class="cw-piece-btn ${active ? "is-active" : ""}" data-cw-pick="${escapeHtml(color)}:${escapeHtml(t)}" aria-label="${escapeHtml(color)} ${escapeHtml(t)}">
            <img src="${escapeHtml(pieceImgSrc(color, t))}" alt="${escapeHtml(color)} ${escapeHtml(t)}">
            <span style="display:none; font-weight:1000; color:var(--cw-ink);">${escapeHtml(color)} ${escapeHtml(t)}</span>
          </button>`;
        };
        return `
          <div class="vcp-modal-backdrop" id="cwEditBackdrop" role="presentation">
            <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Edit works" style="width: calc(100vw - 40px); max-width: 1300px;">
              <div class="vcp-modal-header">
                <div class="vcp-modal-title">Edit Works</div>
                <button id="cwEditClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
              </div>
              <div class="vcp-modal-body">
                <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap;">
                  <div style="flex:1 1 360px;">
                    <div style="font-weight:1000; color:var(--cw-ink);">Title</div>
                    <input id="cwWorkTitle" type="text" value="${escapeHtml(work.title)}" style="width:100%; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                  </div>
                  <div style="display:flex; gap:10px; align-items:center;">
                    <button type="button" class="cw-btn" data-cw-item-prev="1">←</button>
                    <div class="cw-badge">Item ${escapeHtml(String(idx + 1))} / ${escapeHtml(String(work.items.length))}</div>
                    <button type="button" class="cw-btn" data-cw-item-next="1">→</button>
                  </div>
                </div>

                <div style="display:grid; grid-template-columns: 420px 1fr; gap:14px; margin-top:14px; align-items:start;">
                  <div>
                    <div class="cw-card" style="margin-top:0;">
                      <div style="font-weight:1000; color:var(--cw-ink);">Question</div>
                      <textarea id="cwPrompt" placeholder="Type the question..." style="width:100%; min-height:110px; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900; color:var(--cw-ink);">${escapeHtml(it.prompt || "")}</textarea>
                    </div>

                    <div class="cw-card">
                      <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
                        <div style="font-weight:1000; color:var(--cw-ink);">Board</div>
                        <label style="display:flex; gap:8px; align-items:center; font-weight:900; color:var(--cw-muted); cursor:pointer;">
                          <input id="cwBoardEnabled" type="checkbox" ${it.boardEnabled ? "checked" : ""}>
                          Enabled
                        </label>
                      </div>

                      ${it.boardEnabled ? `
                        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px;">
                          <label class="cw-muted" style="font-weight:900;">Rows</label>
                          <input id="cwRows" type="number" min="1" value="${escapeHtml(String(it.board.rows))}" style="width:120px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                          <label class="cw-muted" style="font-weight:900;">Cols</label>
                          <input id="cwCols" type="number" min="1" value="${escapeHtml(String(it.board.cols))}" style="width:120px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                        </div>

                        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px;">
                          <div class="cw-muted" style="font-weight:900;">Turn</div>
                          <select id="cwTurn" style="padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                            <option value="" ${it.turn ? "" : "selected"}>N/A</option>
                            <option value="w" ${it.turn === "w" ? "selected" : ""}>White to move</option>
                            <option value="b" ${it.turn === "b" ? "selected" : ""}>Black to move</option>
                          </select>
                        </div>

                        <div class="cw-muted" style="margin-top:12px; font-weight:900;">Pieces</div>
                        <div class="cw-piece-row" style="margin-top:10px;">
                          ${PIECE_TYPES.map((t) => pieceBtn("w", t)).join("")}
                        </div>
                        <div class="cw-piece-row" style="margin-top:10px;">
                          ${PIECE_TYPES.map((t) => pieceBtn("b", t)).join("")}
                        </div>
                        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px;">
                          <button type="button" class="cw-btn ${tool.kind === "erase" ? "primary" : ""}" data-cw-erase="1">Eraser</button>
                        </div>

                        <div class="cw-muted" style="margin-top:12px; font-weight:900;">FEN (paste to load)</div>
                        <input id="cwFen" type="text" value="${escapeHtml(fen)}" style="width:100%; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                      ` : `
                        <div class="cw-muted" style="margin-top:10px;">Board disabled for this item.</div>
                      `}
                    </div>

                    <div class="cw-card">
                      <div style="font-weight:1000; color:var(--cw-ink);">Answer settings</div>
                      <label style="display:flex; gap:8px; align-items:center; margin-top:10px; font-weight:900; color:var(--cw-muted); cursor:pointer;">
                        <input id="cwPvEnabled" type="checkbox" ${it.pvEnabled ? "checked" : ""}>
                        PV enabled
                      </label>
                      ${it.pvEnabled ? `
                        <div class="cw-muted" style="margin-top:10px;">PV ply count</div>
                        <input id="cwPvPlies" type="number" min="1" value="${escapeHtml(String(it.pvPlies || 1))}" style="width:180px; margin-top:8px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                      ` : ``}

                      <label style="display:flex; gap:8px; align-items:center; margin-top:10px; font-weight:900; color:var(--cw-muted); cursor:pointer;">
                        <input id="cwTextEnabled" type="checkbox" ${it.textEnabled ? "checked" : ""}>
                        Text answer enabled
                      </label>
                      <div class="cw-muted" style="margin-top:10px;">(Students will type the text answer during works.)</div>
                    </div>
                  </div>

                  <div>
                    <div style="font-weight:1000; color:var(--cw-ink);">Preview</div>
                    <div class="cw-card" style="margin-top:10px;">
                      ${it.boardEnabled ? renderBoardHtml({ rows: it.board.rows, cols: it.board.cols, pieces: it.pieces, interactive: true }) : `<div class="cw-muted">No board for this item.</div>`}
                    </div>
                  </div>
                </div>

                <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:14px;">
                  <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button type="button" class="cw-btn" data-cw-add-item="1">Next item</button>
                    <button type="button" class="cw-btn" data-cw-del-item="1">Delete item</button>
                  </div>
                  <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button type="button" class="cw-btn" data-cw-cancel="1">Cancel</button>
                    <button type="button" class="cw-btn primary" data-cw-save="1">Save</button>
                  </div>
                </div>
                <div id="cwEditHint" class="cw-muted" style="margin-top:10px;"></div>
              </div>
            </div>
          </div>
        `;
      };

      const rerender = () => { host.innerHTML = render(); bind(); };

      const readFromDom = () => {
        const titleEl = host.querySelector("#cwWorkTitle");
        if (titleEl) work.title = String(titleEl.value || "");
        const it = work.items[idx];
        const promptEl = host.querySelector("#cwPrompt");
        if (promptEl) it.prompt = String(promptEl.value || "");
        const be = host.querySelector("#cwBoardEnabled");
        if (be) it.boardEnabled = !!be.checked;
        if (it.boardEnabled) {
          const rEl = host.querySelector("#cwRows");
          const cEl = host.querySelector("#cwCols");
          it.board.rows = Math.max(1, Number(rEl?.value || it.board.rows) || it.board.rows);
          it.board.cols = Math.max(1, Number(cEl?.value || it.board.cols) || it.board.cols);
          // clamp pieces
          it.pieces = (it.pieces || []).filter((p) => inBounds(p.r, p.c, it.board.rows, it.board.cols));
          const turnEl = host.querySelector("#cwTurn");
          const tv = String(turnEl?.value || "");
          it.turn = (tv === "w" || tv === "b") ? tv : "";
        } else {
          it.turn = "";
        }
        const pvEn = host.querySelector("#cwPvEnabled");
        it.pvEnabled = !!pvEn?.checked;
        const pvPliesEl = host.querySelector("#cwPvPlies");
        it.pvPlies = it.pvEnabled ? Math.max(1, Number(pvPliesEl?.value || 1) || 1) : 1;
        const txEn = host.querySelector("#cwTextEnabled");
        it.textEnabled = !!txEn?.checked;
        it.text = "";
      };

      const bind = () => {
        host.querySelector("#cwEditClose")?.addEventListener("click", close);
        host.querySelector("#cwEditBackdrop")?.addEventListener("click", (e) => {
          if (e.target && e.target.id === "cwEditBackdrop") close();
        });
        host.querySelector("[data-cw-cancel]")?.addEventListener("click", close);

        host.querySelector("[data-cw-item-prev]")?.addEventListener("click", () => { readFromDom(); idx = Math.max(0, idx - 1); rerender(); });
        host.querySelector("[data-cw-item-next]")?.addEventListener("click", () => { readFromDom(); idx = Math.min(work.items.length - 1, idx + 1); rerender(); });
        host.querySelector("[data-cw-add-item]")?.addEventListener("click", () => { readFromDom(); work.items.push(defaultItem()); idx = work.items.length - 1; rerender(); });
        host.querySelector("[data-cw-del-item]")?.addEventListener("click", () => {
          readFromDom();
          const ok = confirm("Delete this item?");
          if (!ok) return;
          work = normalizeWork(work);
          if (!Array.isArray(work.items)) work.items = [defaultItem()];
          if (work.items.length <= 1) {
            // keep at least 1 item
            work.items = [defaultItem()];
            idx = 0;
            rerender();
            return;
          }
          work.items.splice(idx, 1);
