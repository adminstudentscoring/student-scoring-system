      }
      // Builder
      if (!isTeacher) {
        await setMain(`<div class="cl-muted">Builder is for teachers only.</div>`);
        return;
      }
      await setMain(`<div class="cl-muted">Loading...</div>`);
      try {
        const data = await fetchStages({ isTeacher: true, difficulty: ui.stage.difficulty });
        ui.stage.stages = Array.isArray(data?.stages) ? data.stages : [];
        await setMain(renderBuilder({ difficulty: ui.stage.difficulty, stages: ui.stage.stages }));
        bindBuilderHandlers();
      } catch (e) {
        await setMain(`<div class="cl-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    function bindNav() {
      root.querySelectorAll(".cl-nav-btn[data-cl-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = String(btn.getAttribute("data-cl-mode") || "").trim().toLowerCase();
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
      const main = root.querySelector("#clMain");
      if (!main) return;

      const nextBtn = main.querySelector('[data-cl-story-next="1"]');
      if (nextBtn) {
        nextBtn.addEventListener("click", async () => {
          ui.home.storyIndex = Math.min(4, Number(ui.home.storyIndex || 0) + 1);
          await setMain(renderHome({ storyIndex: ui.home.storyIndex }));
          bindHomeHandlers();
        });
      }

      const rulesBtn = main.querySelector('[data-cl-home-rules="1"]');
      if (rulesBtn) {
        rulesBtn.addEventListener("click", () => openRulesModal(root));
      }

      const startBtn = main.querySelector('[data-cl-start-game="1"]');
      if (startBtn) {
        startBtn.addEventListener("click", () => {
          ui.mode = "stage";
          ui.stage.difficulty = "easy";
          ui.home.storyIndex = 0;
          setUrlMode(ui.mode);
          setUrlParam("difficulty", ui.stage.difficulty);
          rerenderShell();
          void rerenderMain();
        });
      }
    }

    function bindStageHandlers() {
      root.querySelectorAll("[data-cl-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = normalizeDiff(btn.getAttribute("data-cl-diff"));
          if (next === ui.stage.difficulty) return;
          ui.stage.difficulty = next;
          loadStageList();
        });
      });
      root.querySelectorAll("[data-cl-stage]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = String(btn.getAttribute("data-cl-stage") || "").trim();
          if (!id) return;
          openStage(id);
        });
      });
      root.querySelectorAll("[data-cl-back-stage]").forEach((btn) => {
        btn.addEventListener("click", () => loadStageList());
      });
    }

    function bindBuilderHandlers() {
      root.querySelectorAll("[data-cl-builder-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = normalizeDiff(btn.getAttribute("data-cl-builder-diff"));
          if (next === ui.stage.difficulty) return;
          ui.stage.difficulty = next;
          rerenderMain();
        });
      });
      root.querySelectorAll("[data-cl-builder-create]").forEach((btn) => {
        btn.addEventListener("click", () => {
          openStageEditorModal({
            root,
            difficulty: ui.stage.difficulty,
            onSaved: () => rerenderMain()
          });
        });
      });
      root.querySelectorAll("[data-cl-builder-edit]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            const stageId = String(btn.getAttribute("data-cl-builder-edit") || "").trim();
            if (!stageId) return;
            const data = await fetchStageDetail({ isTeacher: true, stageId });
            const st = data?.stage || null;
            if (!st) return;
            openStageEditorModal({
              root,
              difficulty: String(st.difficulty || ui.stage.difficulty),
              stage: st,
              onSaved: () => rerenderMain()
            });
          } catch (e) {
            alert(e?.message || String(e));
          }
        });
      });
    }

    function bindPlayHandlers(cfg) {
      const host = document.getElementById("clStagePlayHost");
      if (!host) return;

      const rerenderPlay = () => {
        host.innerHTML = renderPlayView({ stage: ui.stage.stageDetail, state: ui.stage.playState });
        bindPlayHandlers(cfg);
      };

      const reset = () => {
        ui.stage.playState = { placed: [], activeI: 0 };
        rerenderPlay();
      };

      host.querySelectorAll("[data-cl-reset]").forEach((btn) => btn.addEventListener("click", () => reset()));

      host.querySelectorAll("[data-cl-piece-slot]").forEach((btn) => {
        btn.addEventListener("click", () => {
          ui.stage.playState.activeI = Number(btn.getAttribute("data-cl-piece-slot"));
          rerenderPlay();
        });
      });

      host.querySelectorAll("[data-cl-cell]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const rc = String(btn.getAttribute("data-cl-cell") || "");
          const m = rc.match(/^(\d+):(\d+)$/);
          if (!m) return;
          const r = Number(m[1]), c = Number(m[2]);

          const rows = cfg.board.rows, cols = cfg.board.cols;
          const removedSet = buildRemovedSet(cfg.removed);
          const forbidden = squaresAttackedByBlack({ blacks: cfg.blacks, rows, cols });
          const key = `${r}:${c}`;
          if (removedSet.has(key)) return;
          if (forbidden.has(key)) return; // cannot place on black-attacked squares

          const pieces = Array.isArray(ui.stage.playState.placed) ? ui.stage.playState.placed : [];
          // if clicking a square with an existing piece: select it
          const hit = pieces.find((p) => Number(p.r) === r && Number(p.c) === c);
          if (hit) {
            ui.stage.playState.activeI = Number(hit.i);
            rerenderPlay();
            return;
          }
          // cannot stack
          if (pieces.some((p) => Number(p.r) === r && Number(p.c) === c)) return;

          const i = Number(ui.stage.playState.activeI) || 0;
          const type = String(cfg.pieces[i]?.type || "N").toUpperCase();
          const existing = pieces.find((p) => Number(p.i) === i);
          if (existing) {
            existing.r = r;
            existing.c = c;
          } else {
            pieces.push({ i, type, r, c });
          }
          ui.stage.playState.placed = pieces;

          // win check:
          // - all required pieces are placed
          // - every non-removed square is lit by at least one white piece attack
          //   (a piece's own square is NOT lit unless attacked by other piece(s))
          const occ = new Set(pieces.map((p) => `${p.r}:${p.c}`));
          const occAll = new Set(Array.from(occ));
          // include black pieces as blockers (even on removed cells)
          for (const b of (Array.isArray(cfg.blacks) ? cfg.blacks : [])) {
            occAll.add(`${Number(b.r)}:${Number(b.c)}`);
          }
          const lit = new Set();
          for (const p of pieces) {
            const att = attacksForPiece({ type: p.type, from: p, rows, cols, occupiedSet: occAll });
            for (const k2 of att) if (!removedSet.has(k2)) lit.add(k2);
          }
          const targetCount = (rows * cols) - removedSet.size;
          const allPiecesPlaced = pieces.length >= cfg.pieces.length;
          if (allPiecesPlaced && lit.size >= targetCount) {
            openSuccessModal(root, {
              onNext: async () => {
                const curNo = Number(ui.stage.stageDetail?.stageNo || 0) || 0;
                const list = Array.isArray(ui.stage.stages) ? ui.stage.stages : [];
                const next = list.find((s) => Number(s.stageNo) === curNo + 1);
                if (next && next.id) await openStage(next.id);
              }
            });
          }

          rerenderPlay();
        });
      });
    }

    bindNav();
    await rerenderMain();
  };
})();


