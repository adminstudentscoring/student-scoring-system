          try { e.preventDefault(); } catch {}
          try { e.stopPropagation(); } catch {}
          const fid = String(x.getAttribute("data-cw-folder-del") || "").trim();
          if (!fid || fid === "all" || fid === "unfiled") return;
          const ok = confirm("Delete this folder and all works inside?");
          if (!ok) return;
          try {
            await tDelete(`/api/teachers/chess-works/folders/${encodeURIComponent(fid)}`);
            if (String(ui.builder.folderId || "all") === fid) {
              ui.builder.folderId = "all";
              setUrlParam("folderId", ui.builder.folderId);
            }
            await loadBuilder();
          } catch (err) {
            alert(String(err?.message || err));
          }
        });
      });
      main.querySelectorAll("[data-cw-work-card]")?.forEach((card) => {
        card.addEventListener("dragstart", (e) => {
          const id = String(card.getAttribute("data-cw-work-card") || "");
          try {
            e.dataTransfer.setData("text/cw-work-id", id);
          } catch {}
        });
      });
      main.querySelectorAll("[data-cw-edit]")?.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openWorkEditorModal(String(btn.getAttribute("data-cw-edit") || ""));
        });
      });
      main.querySelectorAll("[data-cw-assign]")?.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openAssignModal(String(btn.getAttribute("data-cw-assign") || ""));
        });
      });
      main.querySelectorAll("[data-cw-work-move]")?.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openMoveWorkModal(String(btn.getAttribute("data-cw-work-move") || ""));
        });
      });
      main.querySelectorAll("[data-cw-work-del]")?.forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const wid = String(btn.getAttribute("data-cw-work-del") || "").trim();
          if (!wid) return;
          const ok = confirm("Delete this work?");
          if (!ok) return;
          try {
            await tDelete(`/api/teachers/chess-works/works/${encodeURIComponent(wid)}`);
            await loadBuilder();
          } catch (err) {
            alert(String(err?.message || err));
          }
        });
      });
    }

    function bindStudentWorksHandlers() {
      const main = root.querySelector("#cwMain");
      if (!main) return;
      // Ensure state objects always exist (teacher "View Works" uses same renderer)
      if (!ui.studentWorks || typeof ui.studentWorks !== "object") ui.studentWorks = {};
      if (!ui.studentWorks.answers || typeof ui.studentWorks.answers !== "object") ui.studentWorks.answers = { items: [] };
      if (!Array.isArray(ui.studentWorks.answers.items)) ui.studentWorks.answers.items = [];
      if (!ui.studentWorks.pvState || typeof ui.studentWorks.pvState !== "object") ui.studentWorks.pvState = {};

      main.querySelector("[data-cw-refresh]")?.addEventListener("click", () => loadStudentWorksList());
      main.querySelectorAll("[data-cw-open-work]")?.forEach((card) => {
        card.addEventListener("click", () => openStudentWork(String(card.getAttribute("data-cw-open-work") || "")));
      });
      main.querySelector("[data-cw-refresh-history]")?.addEventListener("click", () => loadStudentHistory());
      main.querySelectorAll("[data-cw-history-detail]")?.forEach((card) => {
        card.addEventListener("click", () => {
          const workId = String(card.getAttribute("data-cw-history-detail") || "");
          const item = (ui.history.items || []).find((x) => String(x.workId) === workId);
          if (!item) return;
          alert(`Marks:\n${JSON.stringify(item.marks || [], null, 2)}`);
        });
      });

      // do-work handlers
      main.querySelector("[data-cw-back]")?.addEventListener("click", () => loadStudentWorksList());
      main.querySelector("[data-cw-cancel]")?.addEventListener("click", () => loadStudentWorksList());
      main.querySelector("[data-cw-prev]")?.addEventListener("click", () => {
        ui.studentWorks.idx = Math.max(0, Number(ui.studentWorks.idx || 0) - 1);
        setMain(renderStudentDoWork()).then(bindStudentWorksHandlers);
      });
      main.querySelector("[data-cw-next]")?.addEventListener("click", () => {
        const work = normalizeWork(ui.studentWorks.work || {});
        ui.studentWorks.idx = Math.min(work.items.length - 1, Number(ui.studentWorks.idx || 0) + 1);
        setMain(renderStudentDoWork()).then(bindStudentWorksHandlers);
      });
      main.querySelector("[data-cw-save]")?.addEventListener("click", async () => {
        const work = normalizeWork(ui.studentWorks.work || {});
        const wid = String(work.id || "");
        const sid = getPublicStudentIdFromPlayers();
        if (!wid || !sid) return;
        const idx = Math.max(0, Math.min(work.items.length - 1, Number(ui.studentWorks.idx) || 0));
        const it = work.items[idx];
        const txEl = main.querySelector("#cwAnsText");
        const a = (ui.studentWorks.answers.items[idx] && typeof ui.studentWorks.answers.items[idx] === "object") ? ui.studentWorks.answers.items[idx] : {};
        if (it.pvEnabled) {
          const st = ui.studentWorks.pvState?.[idx] || null;
          a.pvMoves = Array.isArray(st?.moves) ? st.moves.slice(0, it.pvPlies || 1) : [];
        }
        if (it.textEnabled) a.text = String(txEl?.value || "");
        ui.studentWorks.answers.items[idx] = a;
        try {
          await sPatch(`/api/public/students/${encodeURIComponent(sid)}/chess-works/works/${encodeURIComponent(wid)}/submission`, {
            answers: ui.studentWorks.answers
          });
          const hint = main.querySelector("#cwSaveHint");
          if (hint) hint.textContent = "Saved.";
        } catch (e) {
          const hint = main.querySelector("#cwSaveHint");
          if (hint) hint.textContent = String(e?.message || e);
        }
      });

      // Right-click board to copy FEN
      // (delegated below)

      // PV interaction (student move recorder)
      // PV + contextmenu handlers (delegated, bind once)
      if (!main.__cwDelegatedBound) {
        main.__cwDelegatedBound = true;

        main.addEventListener("contextmenu", (e) => {
          const board = e.target?.closest?.(".cw-board");
          if (!board) return;
          try { e.preventDefault(); } catch {}
          const fen = String(main.querySelector("#cwFenHidden")?.value || "").trim();
          if (!fen) return;
          openContextMenu({
            root,
            x: e.clientX,
            y: e.clientY,
            items: [{ label: "Copy FEN", onClick: async () => { await copyToClipboard(fen); } }]
          });
        });

        main.addEventListener("click", (e) => {
          const t = e.target;
          const undoBtn = t?.closest?.("[data-cw-pv-undo]");
          const resetBtn = t?.closest?.("[data-cw-pv-reset]");
          const cellBtn = t?.closest?.("[data-cw-cell]");

          const work = normalizeWork(ui.studentWorks.work || {});
          const idx = Math.max(0, Math.min(work.items.length - 1, Number(ui.studentWorks.idx) || 0));
          const it = work.items[idx];
          if (!it?.boardEnabled) return;

          if (undoBtn) {
            if (!it.pvEnabled) return;
            const st = ui.studentWorks.pvState?.[idx];
            if (!st || !Array.isArray(st.moves) || !st.moves.length) return;
            st.moves.pop();
            st.lastMove = st.moves.length ? { from: String(st.moves[st.moves.length - 1]?.from || ""), to: String(st.moves[st.moves.length - 1]?.to || "") } : null;
            // rebuild pieces from initial
            const base = JSON.parse(JSON.stringify(it.pieces || []));
            for (const mv of st.moves) {
              const [frs, fcs] = String(mv.from || "").split(":");
              const [trs, tcs] = String(mv.to || "").split(":");
              const fr = Number(frs), fc = Number(fcs), tr = Number(trs), tc = Number(tcs);
              const pi = base.findIndex((p) => p.r === fr && p.c === fc);
              if (pi < 0) continue;
              const cap = base.findIndex((p) => p.r === tr && p.c === tc);
              if (cap >= 0) base.splice(cap, 1);
              base[pi].r = tr;
              base[pi].c = tc;
            }
            st.pieces = base;
            st.selected = "";
            rerenderStudentPvOnly();
            return;
          }

          if (resetBtn) {
            if (!it.pvEnabled) return;
            ui.studentWorks.pvState[idx] = { selected: "", moves: [], pieces: JSON.parse(JSON.stringify(it.pieces || [])), lastMove: null };
            rerenderStudentPvOnly();
            return;
          }

          if (cellBtn) {
            // Only handle PV board cells
            if (!cellBtn.closest("#cwPvBoardHost")) return;
            if (!it.pvEnabled) return;

            const plyLimit = Number(it.pvPlies || 1);
            const st = ui.studentWorks.pvState?.[idx] || { selected: "", moves: [], pieces: JSON.parse(JSON.stringify(it.pieces || [])), lastMove: null };
            ui.studentWorks.pvState[idx] = st;
            st.moves = Array.isArray(st.moves) ? st.moves : [];
            st.pieces = Array.isArray(st.pieces) ? st.pieces : [];
            st.lastMove = st.lastMove || null;

            const cell = String(cellBtn.getAttribute("data-cw-cell") || "");
            const [rs, cs] = cell.split(":");
            const r = Number(rs), c = Number(cs);
            if (!inBounds(r, c, it.board.rows, it.board.cols)) return;
            if (st.moves.length >= plyLimit) return;

            const pieces = st.pieces;
            const occ = new Map(pieces.map((p) => [`${p.r}:${p.c}`, p]));
            const at = occ.get(`${r}:${c}`) || null;

            const currentTurn = (() => {
              if (it.turn !== "w" && it.turn !== "b") return "";
              return (st.moves.length % 2 === 0) ? it.turn : (it.turn === "w" ? "b" : "w");
            })();

            if (!st.selected) {
              if (!at) return;
              if (currentTurn && at.color !== currentTurn) return;
              st.selected = `${r}:${c}`;
              rerenderStudentPvOnly();
              return;
            }

            const [frs, fcs] = String(st.selected).split(":");
            const fr = Number(frs), fc = Number(fcs);
            const mover = occ.get(`${fr}:${fc}`) || null;
            if (!mover) { st.selected = ""; rerenderStudentPvOnly(); return; }
            if (currentTurn && mover.color !== currentTurn) { st.selected = ""; rerenderStudentPvOnly(); return; }
            if (fr === r && fc === c) { st.selected = ""; rerenderStudentPvOnly(); return; }

            const dest = at;
            if (dest && dest.color === mover.color) {
              st.selected = `${r}:${c}`;
              rerenderStudentPvOnly();
              return;
            }

            const dr = r - fr;
            const dc = c - fc;
            const abs = (x) => Math.abs(x);
            const sign = (x) => (x === 0 ? 0 : x > 0 ? 1 : -1);
            const clearRay = (sdr, sdc) => {
              let rr = fr + sdr, cc = fc + sdc;
              while (rr !== r || cc !== c) {
                if (occ.get(`${rr}:${cc}`)) return false;
                rr += sdr;
                cc += sdc;
              }
              return true;
            };
            let ok = false;
            const pt = String(mover.type || "").toUpperCase();
            if (pt === "N") ok = (abs(dr) === 2 && abs(dc) === 1) || (abs(dr) === 1 && abs(dc) === 2);
            else if (pt === "K") ok = abs(dr) <= 1 && abs(dc) <= 1;
            else if (pt === "B") ok = abs(dr) === abs(dc) && clearRay(sign(dr), sign(dc));
            else if (pt === "R") ok = (dr === 0 || dc === 0) && clearRay(sign(dr), sign(dc));
            else if (pt === "Q") ok = ((dr === 0 || dc === 0) || (abs(dr) === abs(dc))) && clearRay(sign(dr), sign(dc));
            else if (pt === "P") {
              if (mover.color === "w") {
                if (dest) ok = (dr === -1 && abs(dc) === 1);
                else ok = (dc === 0 && dr === -1);
              } else {
                if (dest) ok = (dr === 1 && abs(dc) === 1);
                else ok = (dc === 0 && dr === 1);
              }
            }
            if (!ok) return;

            // apply
            if (dest) {
              const capI = pieces.findIndex((p) => p.r === r && p.c === c);
              if (capI >= 0) pieces.splice(capI, 1);
            }
            const mi = pieces.findIndex((p) => p.r === fr && p.c === fc);
            if (mi >= 0) { pieces[mi].r = r; pieces[mi].c = c; }
            st.moves.push({ color: mover.color, type: mover.type, from: `${fr}:${fc}`, to: `${r}:${c}` });
            st.selected = "";
            st.lastMove = { from: `${fr}:${fc}`, to: `${r}:${c}` };

            // persist into answers state
            const a = (ui.studentWorks.answers.items[idx] && typeof ui.studentWorks.answers.items[idx] === "object") ? ui.studentWorks.answers.items[idx] : {};
            a.pvMoves = st.moves.slice(0, plyLimit);
            ui.studentWorks.answers.items[idx] = a;

            // rerender only PV board to show the move instantly (no full-screen fade)
            rerenderStudentPvOnly();
          }
        });
      }
    }

    function bindTeacherWorksHandlers() {
      const main = root.querySelector("#cwMain");
      if (!main) return;
      if (!ui.teacherWorks || typeof ui.teacherWorks !== "object") ui.teacherWorks = {};
      if (!ui.teacherWorks.reviewPvStep || typeof ui.teacherWorks.reviewPvStep !== "object") ui.teacherWorks.reviewPvStep = {};
      main.querySelector("[data-cw-refresh-teacher-works]")?.addEventListener("click", () => loadTeacherWorksList());
      main.querySelectorAll("[data-cw-teacher-open]")?.forEach((card) => {
        card.addEventListener("click", () => openTeacherWork(String(card.getAttribute("data-cw-teacher-open") || "")));
      });
      main.querySelector("[data-cw-teacher-back]")?.addEventListener("click", () => loadTeacherWorksList());
      main.querySelector("[data-cw-teacher-view-students]")?.addEventListener("click", () => loadTeacherStudentsForWork());
      main.querySelector("[data-cw-teacher-view-works]")?.addEventListener("click", async () => {
        // teacher "try works" uses student renderer locally (no saving)
        ui.studentWorks.work = ui.teacherWorks.work;
        ui.studentWorks.answers = { items: [] };
        ui.studentWorks.pvState = {};
        ui.studentWorks.idx = 0;
        ui.studentWorks.view = "do";
        await setMain(renderStudentDoWork());
        bindStudentWorksHandlers();
      });
      main.querySelector("[data-cw-teacher-back-detail]")?.addEventListener("click", () => {
        ui.teacherWorks.view = "detail";
        setMain(renderTeacherWorkDetail()).then(bindTeacherWorksHandlers);
      });
      main.querySelector("[data-cw-teacher-refresh-students]")?.addEventListener("click", () => loadTeacherStudentsForWork());
      main.querySelectorAll("[data-cw-review-student]")?.forEach((row) => {
        row.addEventListener("click", () => openTeacherReviewStudent(String(row.getAttribute("data-cw-review-student") || "")));
      });
      main.querySelector("[data-cw-review-back]")?.addEventListener("click", () => loadTeacherStudentsForWork());

      // marks click
      main.querySelectorAll("[data-cw-mark]")?.forEach((btn) => {
        btn.addEventListener("click", () => {
          const v = String(btn.getAttribute("data-cw-mark") || "");
          const [is, mk] = v.split(":");
          const i = Number(is);
          if (!Number.isFinite(i)) return;
          const marks = Array.isArray(ui.teacherWorks.review?.marks) ? ui.teacherWorks.review.marks : [];
          marks[i] = mk;
          ui.teacherWorks.review = Object.assign({}, ui.teacherWorks.review || {}, { marks, finished: false });
          setMain(renderTeacherReviewStudent()).then(bindTeacherWorksHandlers);
        });
      });

      const rerenderTeacherPvMini = (qIdx) => {
        const w = ui.teacherWorks.work;
        if (!w) return;
        const work = normalizeWork(w);
        const it = work.items?.[qIdx];
        if (!it?.pvEnabled || !it?.boardEnabled) return;
        const submission = ui.teacherWorks.submission?.answers || {};
        const answers = Array.isArray(submission?.items) ? submission.items : [];
        const a = answers[qIdx] || {};
        const pvMoves = Array.isArray(a.pvMoves) ? a.pvMoves : [];
        const stepRaw = ui.teacherWorks.reviewPvStep && Object.prototype.hasOwnProperty.call(ui.teacherWorks.reviewPvStep, qIdx) ? ui.teacherWorks.reviewPvStep[qIdx] : 0;
        const step = Math.max(0, Math.min(pvMoves.length, Number(stepRaw) || 0));
        ui.teacherWorks.reviewPvStep[qIdx] = step;
        const pieces = applyPvMovesToPieces({ basePieces: it.pieces, moves: pvMoves, step });
        const last = step > 0 ? pvMoves[step - 1] : null;
        const host = main.querySelector(`[data-cw-pv-mini-board="${String(qIdx)}"]`);
        if (host) {
          host.innerHTML = renderBoardHtml({
            rows: it.board.rows,
            cols: it.board.cols,
            pieces,
            interactive: false,
            flip: (it.turn === "b"),
            lastMove: last,
            targetPx: 240
          });
        }
        const lab = main.querySelector(`[data-cw-pv-mini-label="${String(qIdx)}"]`);
        if (lab) lab.textContent = `${step}/${pvMoves.length}`;
      };

      main.querySelectorAll("[data-cw-pv-prev]")?.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const qIdx = Number(btn.getAttribute("data-cw-pv-prev"));
          if (!Number.isFinite(qIdx)) return;
          const cur = Number(ui.teacherWorks.reviewPvStep?.[qIdx] || 0);
          ui.teacherWorks.reviewPvStep[qIdx] = Math.max(0, cur - 1);
          rerenderTeacherPvMini(qIdx);
        });
      });
      main.querySelectorAll("[data-cw-pv-next]")?.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const qIdx = Number(btn.getAttribute("data-cw-pv-next"));
          if (!Number.isFinite(qIdx)) return;
          const submission = ui.teacherWorks.submission?.answers || {};
          const answers = Array.isArray(submission?.items) ? submission.items : [];
          const pvMoves = Array.isArray(answers[qIdx]?.pvMoves) ? answers[qIdx].pvMoves : [];
          const cur = Number(ui.teacherWorks.reviewPvStep?.[qIdx] || 0);
          ui.teacherWorks.reviewPvStep[qIdx] = Math.min(pvMoves.length, cur + 1);
          rerenderTeacherPvMini(qIdx);
        });
      });

      async function saveReview(finished) {
        const w = ui.teacherWorks.work;
        const sid = String(ui.teacherWorks.studentId || "");
        if (!w?.id || !sid) return;
        const marks = Array.isArray(ui.teacherWorks.review?.marks) ? ui.teacherWorks.review.marks : [];
        try {
          await tPatch(`/api/teachers/chess-works/works/${encodeURIComponent(w.id)}/reviews/${encodeURIComponent(sid)}`, {
            marks,
            finished: !!finished
          });
          await loadTeacherStudentsForWork();
        } catch (e) {
          alert(String(e?.message || e));
        }
      }
      main.querySelector("[data-cw-review-save]")?.addEventListener("click", () => saveReview(false));
      main.querySelector("[data-cw-review-finish]")?.addEventListener("click", () => saveReview(true));
    }

    function bindSettingsHandlers() {
      const main = root.querySelector("#cwMain");
      if (!main) return;
      main.querySelector("[data-cw-create-group]")?.addEventListener("click", async () => {
        const name = prompt("Group name?");
        if (!name) return;
        try {
          await tPost("/api/teachers/chess-works/groups", { name: String(name).trim() });
          await loadSettings();
        } catch (e) {
          alert(String(e?.message || e));
        }
      });
      main.querySelectorAll("[data-cw-manage-group]")?.forEach((btn) => {
        btn.addEventListener("click", () => openGroupManageModal(String(btn.getAttribute("data-cw-manage-group") || "")));
      });

      // toggle show member names when clicking the group row (but not the Manage button)
      main.querySelectorAll("[data-cw-group-row]")?.forEach((row) => {
        row.addEventListener("click", (e) => {
          const tgt = e.target;
          const manageBtn = tgt && tgt.closest ? tgt.closest("[data-cw-manage-group]") : null;
          if (manageBtn) return;
          const gid = String(row.getAttribute("data-cw-group-row") || "");
          const membersEl = main.querySelector(`[data-cw-group-members="${CSS.escape(gid)}"]`);
          if (!membersEl) return;
          const show = membersEl.style.display !== "block";
          membersEl.style.display = show ? "block" : "none";
        });
      });
    }

    // ===== Main router =====
    async function rerenderMain() {
      if (ui.mode === "home") {
        await setMain(renderHome());
        bindHomeHandlers();
        return;
      }
      if (ui.mode === "builder") {
