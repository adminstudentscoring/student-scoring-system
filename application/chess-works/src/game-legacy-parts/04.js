          idx = Math.max(0, Math.min(work.items.length - 1, idx));
          rerender();
        });

        host.querySelector("#cwWorkTitle")?.addEventListener("input", () => readFromDom());
        host.querySelector("#cwPrompt")?.addEventListener("input", () => readFromDom());
        host.querySelector("#cwBoardEnabled")?.addEventListener("change", () => { readFromDom(); rerender(); });
        host.querySelector("#cwRows")?.addEventListener("input", () => { readFromDom(); rerender(); });
        host.querySelector("#cwCols")?.addEventListener("input", () => { readFromDom(); rerender(); });
        host.querySelector("#cwTurn")?.addEventListener("change", () => { readFromDom(); rerender(); });
        host.querySelector("#cwPvEnabled")?.addEventListener("change", () => { readFromDom(); rerender(); });
        host.querySelector("#cwTextEnabled")?.addEventListener("change", () => { readFromDom(); rerender(); });
        host.querySelector("#cwPvPlies")?.addEventListener("input", () => { readFromDom(); });

        host.querySelectorAll("[data-cw-pick]")?.forEach((btn) => {
          btn.addEventListener("click", () => {
            const [c, t] = String(btn.getAttribute("data-cw-pick") || "").split(":");
            if (!c || !t) return;
            tool = { kind: "piece", color: c === "b" ? "b" : "w", type: String(t).toUpperCase() };
            rerender();
          });
        });
        host.querySelector("[data-cw-erase]")?.addEventListener("click", () => {
          tool = { kind: "erase" };
          rerender();
        });

        // interactive board placement
        host.querySelectorAll("[data-cw-cell]")?.forEach((cell) => {
          cell.addEventListener("click", () => {
            readFromDom();
            const it = work.items[idx];
            if (!it.boardEnabled) return;
            const v = String(cell.getAttribute("data-cw-cell") || "");
            const [rs, cs] = v.split(":");
            const r = Number(rs), c = Number(cs);
            if (!inBounds(r, c, it.board.rows, it.board.cols)) return;
            const existingIdx = (it.pieces || []).findIndex((p) => p.r === r && p.c === c);
            if (tool.kind === "erase") {
              if (existingIdx >= 0) it.pieces.splice(existingIdx, 1);
              rerender();
              return;
            }
            if (tool.kind === "piece") {
              const np = { color: tool.color, type: tool.type, r, c };
              if (existingIdx >= 0) {
                const ex = it.pieces[existingIdx];
                const same = ex && ex.color === np.color && ex.type === np.type;
                if (same) it.pieces.splice(existingIdx, 1);
                else it.pieces[existingIdx] = np;
              } else {
                it.pieces.push(np);
              }
              rerender();
            }
          });
        });

        host.querySelector("#cwFen")?.addEventListener("change", () => {
          readFromDom();
          const it = work.items[idx];
          if (!it.boardEnabled) return;
          const txt = String(host.querySelector("#cwFen")?.value || "").trim();
          const parsed = parseCwFen(txt) || parseFen8(txt);
          if (!parsed) return;
          it.board.rows = parsed.rows;
          it.board.cols = parsed.cols;
          it.turn = parsed.turn || "";
          it.pieces = parsed.pieces || [];
          rerender();
        });

        host.querySelector("[data-cw-save]")?.addEventListener("click", async () => {
          readFromDom();
          const hint = host.querySelector("#cwEditHint");
          try {
            await tPatch(`/api/teachers/chess-works/works/${encodeURIComponent(wid)}`, {
              title: work.title,
              items: work.items
            });
            if (hint) hint.textContent = "Saved.";
            await loadBuilder();
            setTimeout(close, 250);
          } catch (e) {
            if (hint) hint.textContent = String(e?.message || e);
          }
        });
      };

      rerender();
    }

    // ===== Loaders =====
    async function loadBuilder() {
      ui.builder.folders = [];
      ui.builder.works = [];
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const f = await tGet("/api/teachers/chess-works/folders");
        ui.builder.folders = Array.isArray(f?.folders) ? f.folders : [];
      } catch {}
      try {
        const folderId = String(ui.builder.folderId || "all");
        let q = "";
        if (folderId !== "all") {
          if (folderId === "unfiled") q = "?folderId=";
          else q = `?folderId=${encodeURIComponent(folderId)}`;
        }
        const w = await tGet(`/api/teachers/chess-works/works${q}`);
        ui.builder.works = Array.isArray(w?.works) ? w.works : [];
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
        return;
      }
      await setMain(renderBuilder());
      bindBuilderHandlers();
    }

    async function loadTeacherWorksList() {
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const w = await tGet("/api/teachers/chess-works/works");
        ui.teacherWorks.works = Array.isArray(w?.works) ? w.works : [];
        ui.teacherWorks.view = "list";
        ui.teacherWorks.work = null;
        await setMain(renderTeacherWorksList());
        bindTeacherWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function openTeacherWork(workId) {
      const id = String(workId || "").trim();
      if (!id) return;
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const w = await tGet(`/api/teachers/chess-works/works/${encodeURIComponent(id)}`);
        ui.teacherWorks.work = normalizeWork(w?.work || {});
        ui.teacherWorks.view = "detail";
        await setMain(renderTeacherWorkDetail());
        bindTeacherWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function loadTeacherStudentsForWork() {
      const w = ui.teacherWorks.work;
      if (!w?.id) return;
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const data = await tGet(`/api/teachers/chess-works/works/${encodeURIComponent(w.id)}/students`);
        ui.teacherWorks.studentStatus = Array.isArray(data?.students) ? data.students : [];
        ui.teacherWorks.view = "students";
        await setMain(renderTeacherStudentsForWork());
        bindTeacherWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function openTeacherReviewStudent(studentId) {
      const w = ui.teacherWorks.work;
      const sid = String(studentId || "").trim();
      if (!w?.id || !sid) return;
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const data = await tGet(`/api/teachers/chess-works/works/${encodeURIComponent(w.id)}/submissions/${encodeURIComponent(sid)}`);
        ui.teacherWorks.studentId = sid;
        ui.teacherWorks.submission = data?.submission || null;
        ui.teacherWorks.review = data?.review || null;
      ui.teacherWorks.reviewPvStep = {};
      try {
        const work = normalizeWork(ui.teacherWorks.work || {});
        for (let i = 0; i < (work.items || []).length; i++) ui.teacherWorks.reviewPvStep[i] = 0;
      } catch {}
        ui.teacherWorks.view = "review";
        await setMain(renderTeacherReviewStudent());
        bindTeacherWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function loadStudentWorksList() {
      await setMain(`<div class="cw-muted">Loading...</div>`);
      const sid = getPublicStudentIdFromPlayers();
      if (!sid) {
        await setMain(`<div class="cw-muted">Missing student identity.</div>`);
        return;
      }
      try {
        const data = await sGet(`/api/public/students/${encodeURIComponent(sid)}/chess-works/works`);
        ui.studentWorks.works = Array.isArray(data?.works) ? data.works : [];
        ui.studentWorks.view = "list";
        await setMain(renderStudentWorksList());
        bindStudentWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function openStudentWork(workId) {
      const sid = getPublicStudentIdFromPlayers();
      const wid = String(workId || "").trim();
      if (!sid || !wid) return;
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const data = await sGet(`/api/public/students/${encodeURIComponent(sid)}/chess-works/works/${encodeURIComponent(wid)}`);
        ui.studentWorks.work = normalizeWork(data?.work || {});
        ui.studentWorks.idx = 0;
        const sub = await sGet(`/api/public/students/${encodeURIComponent(sid)}/chess-works/works/${encodeURIComponent(wid)}/submission`);
        ui.studentWorks.submission = sub?.submission || null;
        ui.studentWorks.answers = (sub?.submission?.answers && typeof sub.submission.answers === "object") ? sub.submission.answers : { items: [] };
        if (!Array.isArray(ui.studentWorks.answers.items)) ui.studentWorks.answers.items = [];
        // PV state per item (replay pvMoves onto initial pieces)
        ui.studentWorks.pvState = {};
        try {
          const work = normalizeWork(ui.studentWorks.work || {});
          for (let i = 0; i < work.items.length; i++) {
            const it = work.items[i];
            if (!it.boardEnabled || !it.pvEnabled) continue;
            const a = ui.studentWorks.answers.items[i] || {};
            const moves = Array.isArray(a.pvMoves) ? a.pvMoves : [];
            const base = JSON.parse(JSON.stringify(it.pieces || []));
            const apply = (mv) => {
              const [frs, fcs] = String(mv.from || "").split(":");
              const [trs, tcs] = String(mv.to || "").split(":");
              const fr = Number(frs), fc = Number(fcs), tr = Number(trs), tc = Number(tcs);
              if (![fr, fc, tr, tc].every(Number.isFinite)) return;
              const pi = base.findIndex((p) => p.r === fr && p.c === fc);
              if (pi < 0) return;
              const cap = base.findIndex((p) => p.r === tr && p.c === tc);
              if (cap >= 0) base.splice(cap, 1);
              base[pi].r = tr;
              base[pi].c = tc;
            };
            moves.slice(0, it.pvPlies || 1).forEach(apply);
            ui.studentWorks.pvState[i] = { selected: "", moves: moves.slice(0, it.pvPlies || 1), pieces: base };
          }
        } catch {}
        ui.studentWorks.view = "do";
        await setMain(renderStudentDoWork());
        bindStudentWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function loadStudentHistory() {
      await setMain(`<div class="cw-muted">Loading...</div>`);
      const sid = getPublicStudentIdFromPlayers();
      if (!sid) { await setMain(`<div class="cw-muted">Missing student identity.</div>`); return; }
      try {
        const data = await sGet(`/api/public/students/${encodeURIComponent(sid)}/chess-works/history`);
        ui.history.items = Array.isArray(data?.items) ? data.items : [];
        await setMain(renderStudentHistory());
        bindStudentWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function loadSettings() {
      if (!isTeacher) {
        await setMain(`<div class="cw-muted">No settings available.</div>`);
        return;
      }
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const s = await tGet("/api/teachers/chess-works/students");
        ui.settings.students = Array.isArray(s?.students) ? s.students : [];
      } catch {}
      try {
        const g = await tGet("/api/teachers/chess-works/groups");
        ui.settings.groups = Array.isArray(g?.groups) ? g.groups : [];
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
        return;
      }
      await setMain(renderSettings());
      bindSettingsHandlers();
    }

    function renderSettings() {
      const groups = ui.settings.groups || [];
      const students = ui.settings.students || [];
      const nameOf = (id) => {
        const s = students.find((x) => String(x.id) === String(id));
        return s ? String(s.name || s.id) : String(id);
      };
      return `
        <div class="cw-toolbar">
          <div class="cw-badge">Setting · Groups</div>
          <button type="button" class="cw-btn primary" data-cw-create-group="1">Create Group</button>
        </div>
        <div style="display:grid; gap:10px;">
          ${groups.map((g) => `
            <div class="cw-review-row" data-cw-group-row="${escapeHtml(String(g.id))}" style="cursor:pointer;">
              <div>
                <div style="font-weight:1000; color:var(--cw-ink);">${escapeHtml(g.name || "")}</div>
                <div class="cw-muted" style="margin-top:2px;">Members: ${(Array.isArray(g.members) ? g.members.length : 0)}</div>
                <div class="cw-muted" data-cw-group-members="${escapeHtml(String(g.id))}" style="margin-top:6px; display:none;">
                  ${escapeHtml((Array.isArray(g.members) ? g.members : []).map(nameOf).join(", "))}
                </div>
              </div>
              <button type="button" class="cw-btn" data-cw-manage-group="${escapeHtml(String(g.id))}">Manage</button>
            </div>
          `).join("")}
          ${(!groups.length) ? `<div class="cw-muted">No groups yet.</div>` : ``}
        </div>
      `;
    }

    function openGroupManageModal(groupId) {
      const gid = String(groupId || "").trim();
      const g = (ui.settings.groups || []).find((x) => String(x.id) === gid) || null;
      if (!g) return;
      const host = document.createElement("div");
      root.appendChild(host);
      const close = () => { try { host.remove(); } catch {} };
      const hostHtml = `
          <div class="vcp-modal-backdrop" id="cwGroupBackdrop" role="presentation">
            <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Group" style="width: calc(100vw - 40px); max-width: 980px;">
              <div class="vcp-modal-header">
                <div class="vcp-modal-title">Group: ${escapeHtml(g.name || "")}</div>
                <button id="cwGroupClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
              </div>
              <div class="vcp-modal-body">
                <input id="cwGroupSearch" type="text" placeholder="Search students..." style="width:100%; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                <div id="cwGroupStudents" style="display:grid; gap:8px; margin-top:10px; max-height:420px; overflow:auto;"></div>
                <div id="cwGroupHint" class="cw-muted" style="margin-top:10px;"></div>
              </div>
            </div>
          </div>
      `;
      host.innerHTML = hostHtml;

      const renderStudents = (q) => {
        const query = String(q || "").trim().toLowerCase();
        const members = new Set(Array.isArray(g.members) ? g.members.map(String) : []);
        const list = host.querySelector("#cwGroupStudents");
        if (!list) return;
        const shown = (ui.settings.students || []).filter((s) => {
          if (!query) return true;
          return String(s.name || "").toLowerCase().includes(query) || String(s.id || "").toLowerCase().includes(query);
        });
        list.innerHTML = shown.map((s) => {
          const inG = members.has(String(s.id));
          return `
            <div class="cw-review-row">
              <div style="font-weight:900; color:var(--cw-ink);">${escapeHtml(s.name || s.id)}</div>
              <button type="button" class="cw-btn ${inG ? "" : "primary"}" data-cw-toggle-member="${escapeHtml(String(s.id))}">
                ${inG ? "Remove" : "Add"}
              </button>
            </div>
          `;
        }).join("");
        list.querySelectorAll("[data-cw-toggle-member]")?.forEach((btn) => {
          btn.addEventListener("click", async () => {
            const sid = String(btn.getAttribute("data-cw-toggle-member") || "");
            const hint = host.querySelector("#cwGroupHint");
            try {
              if ((g.members || []).map(String).includes(String(sid))) {
                await tDelete(`/api/teachers/chess-works/groups/${encodeURIComponent(gid)}/members/${encodeURIComponent(sid)}`);
              } else {
                await tPost(`/api/teachers/chess-works/groups/${encodeURIComponent(gid)}/members`, { studentIds: [sid] });
              }
              const data = await tGet("/api/teachers/chess-works/groups");
              ui.settings.groups = Array.isArray(data?.groups) ? data.groups : [];
              const fresh = ui.settings.groups.find((x) => String(x.id) === gid);
              if (fresh) Object.assign(g, fresh);
              if (hint) hint.textContent = "Updated.";
              renderStudents(host.querySelector("#cwGroupSearch")?.value || "");
            } catch (e) {
              if (hint) hint.textContent = String(e?.message || e);
            }
          });
        });
      };

      const bind = () => {
        host.querySelector("#cwGroupClose")?.addEventListener("click", close);
        host.querySelector("#cwGroupBackdrop")?.addEventListener("click", (e) => {
          if (e.target && e.target.id === "cwGroupBackdrop") close();
        });
        host.querySelector("#cwGroupSearch")?.addEventListener("input", (e) => renderStudents(e.target.value));
      };
      bind();
      renderStudents("");
    }

    // ===== Handlers =====
    function bindNav() {
      root.querySelectorAll(".cw-nav-btn[data-cw-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = String(btn.getAttribute("data-cw-mode") || "").trim().toLowerCase();
          const normalized = normalizeMode(next, isTeacher);
          if (normalized === ui.mode) return;
          ui.mode = normalized;
          setUrlMode(ui.mode);
          rerenderShell();
          void rerenderMain();
        });
      });
    }

    function bindHomeHandlers() {
      root.querySelector("[data-cw-go-works]")?.addEventListener("click", () => {
        ui.mode = "works";
        setUrlMode(ui.mode);
        rerenderShell();
        void rerenderMain();
      }, { once: true });
    }

    function bindBuilderHandlers() {
      const main = root.querySelector("#cwMain");
      if (!main) return;
      main.querySelector("[data-cw-create]")?.addEventListener("click", openCreatePickerModal);
      main.querySelector("[data-cw-refresh-builder]")?.addEventListener("click", () => loadBuilder());
      main.querySelectorAll("[data-cw-folder]")?.forEach((btn) => {
        btn.addEventListener("click", () => {
          ui.builder.folderId = String(btn.getAttribute("data-cw-folder") || "all");
          setUrlParam("folderId", ui.builder.folderId);
          loadBuilder();
        });

        // drag-drop target for work cards
        btn.addEventListener("dragover", (e) => { e.preventDefault(); btn.classList.add("is-drop"); });
        btn.addEventListener("dragleave", () => btn.classList.remove("is-drop"));
        btn.addEventListener("drop", async (e) => {
          e.preventDefault();
          btn.classList.remove("is-drop");
          const workId = String(e.dataTransfer?.getData("text/cw-work-id") || "").trim();
          if (!workId) return;
          const fid = String(btn.getAttribute("data-cw-folder") || "all");
          if (fid === "all") return;
          const folderId = fid === "unfiled" ? "" : fid;
          try {
            await tPatch(`/api/teachers/chess-works/works/${encodeURIComponent(workId)}`, { folderId });
            await loadBuilder();
          } catch (err) {
            alert(String(err?.message || err));
          }
        });
      });
      main.querySelectorAll("[data-cw-folder-del]")?.forEach((x) => {
        x.addEventListener("click", async (e) => {
