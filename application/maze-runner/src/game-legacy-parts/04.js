      const btn = root.querySelector("[data-mr-start-game]");
      if (btn && btn.dataset.bound !== "1") {
        btn.dataset.bound = "1";
        btn.addEventListener("click", async () => {
          ui.mode = "stage";
          ui.stage.difficulty = "easy";
          ui.stage.diffPickedOnce = true;
          ui.home.storyIndex = 0;
          setUrlMode(ui.mode);
          setUrlParam("difficulty", ui.stage.difficulty);
          setUrlParam("stageId", "");
          rerenderShell();
          // go to Stage page only (do not auto-enter a stage)
          void rerenderMain();
        });
      }
    }

    const bindNav = () => {
      root.querySelectorAll(".mr-nav-btn[data-mr-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = String(btn.getAttribute("data-mr-mode") || "").trim().toLowerCase();
          const normalized = normalizeMode(next, isTeacher);
          if (normalized === ui.mode) return;
          ui.mode = normalized;
          setUrlMode(ui.mode);
          rerenderShell();
          void rerenderMain();
        });
      });

      const rulesBtn = root.querySelector("[data-mr-open-rules]");
      if (rulesBtn && rulesBtn.dataset.bound !== "1") {
        rulesBtn.dataset.bound = "1";
        rulesBtn.addEventListener("click", () => openRulesModal(root));
      }
    };

    function bindSettingsHandlers() {
      const light = root.querySelector("#mrSettingLight");
      const dark = root.querySelector("#mrSettingDark");
      const saveBtn = root.querySelector("#mrSettingSave");
      const resetBtn = root.querySelector("#mrSettingReset");
      const hint = root.querySelector("#mrSettingHint");

      if (light) light.value = ui.theme.light;
      if (dark) dark.value = ui.theme.dark;

      const setHint = (txt) => { if (hint) hint.textContent = String(txt || ""); };

      light?.addEventListener("input", () => {
        const v = String(light.value || "").trim();
        if (isHexColor(v)) ui.theme.light = v;
        applyTheme();
        setHint("Preview updated.");
      });
      dark?.addEventListener("input", () => {
        const v = String(dark.value || "").trim();
        if (isHexColor(v)) ui.theme.dark = v;
        applyTheme();
        setHint("Preview updated.");
      });
      saveBtn?.addEventListener("click", () => {
        saveTheme();
        setHint("Saved.");
      });
      resetBtn?.addEventListener("click", () => {
        resetTheme();
        if (light) light.value = ui.theme.light;
        if (dark) dark.value = ui.theme.dark;
        setHint("Reset to defaults.");
      });
    }

    function bindStageHandlers() {
      root.querySelectorAll("[data-mr-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = normalizeDiff(btn.getAttribute("data-mr-diff"));
          if (next === ui.stage.difficulty) return;
          ui.stage.difficulty = next;
          ui.stage.diffPickedOnce = true;
          loadStageList();
        });
      });
      root.querySelectorAll("[data-mr-change-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          ui.stage.diffPickedOnce = false;
          loadStageList();
        });
      });
      root.querySelectorAll("[data-mr-stage]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = String(btn.getAttribute("data-mr-stage") || "").trim();
          if (!id) return;
          openStage(id);
        });
      });
      root.querySelectorAll("[data-mr-back-stage]").forEach((btn) => {
        btn.addEventListener("click", () => loadStageList());
      });
    }

    function bindPlayHandlers() {
      const host = document.getElementById("mrStagePlayHost");
      if (!host) return;
      const stage = ui.stage.stageDetail;
      const cfg = normalizeStageConfig(stage?.config || {});

      const rerenderPlay = () => {
        host.innerHTML = renderPlayView({ stage, state: ui.stage.playState });
        bindPlayHandlers();
      };

      const reset = () => {
        ui.stage.playState = {
          pos: { r: cfg.piece.start.r, c: cfg.piece.start.c },
          stepsUsed: 0,
          selected: null,
          goalIndex: 0,
          rocks: cfg.rocks.slice(),
          blacks: cfg.blacks.slice(),
          won: false
        };
        rerenderPlay();
      };

      host.querySelectorAll("[data-mr-reset]").forEach((btn) => btn.addEventListener("click", () => reset()));

      host.querySelectorAll("[data-mr-cell]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (ui.stage.playState.won) return;
          const rc = String(btn.getAttribute("data-mr-cell") || "");
          const m = rc.match(/^(\d+):(\d+)$/);
          if (!m) return;
          const r = Number(m[1]), c = Number(m[2]);
          const state = ui.stage.playState;
          const rows = cfg.board.rows, cols = cfg.board.cols;
          const rocksSet = buildRocksSet(state.rocks);
          const blacksMap = buildBlacksMap(state.blacks);

          // First click: select piece if clicking its cell
          if (!state.selected) {
            if (state.pos.r === r && state.pos.c === c) {
              state.selected = { r, c };
              rerenderPlay();
            }
            return;
          }

          // Second click: attempt move
          const from = { ...state.pos };
          const to = { r, c };
          state.selected = null;

          const moves = legalMovesForWhite({ type: cfg.piece.type, from, rocksSet, blacksMap, rows, cols });
          const isLegal = moves.some((x) => x.r === to.r && x.c === to.c);
          if (!isLegal) {
            // Illegal move: flash whole screen 3 times
            flashIllegalMove(root);
            return rerenderPlay();
          }

          const targetBlack = blackAt(blacksMap, to.r, to.c);
          // Safety rule: cannot move onto attacked square unless capturing a black piece on that square
          const attacked = squaresAttackedByBlack({ blacks: state.blacks, rocksSet, rows, cols });
          const toKey = `${to.r}:${to.c}`;
          if (attacked.has(toKey)) {
            if (!targetBlack) {
              // Attacked square: modal warning, continue game after close
              openAttackModal(root);
              return rerenderPlay();
            }
            // Capture is only allowed if the destination is NOT attacked by other black pieces
            const defended = isSquareAttackedByOtherBlacks({
              blacks: state.blacks,
              rocksSet,
              rows,
              cols,
              square: to,
              exclude: { r: to.r, c: to.c }
            });
            if (defended) {
              openAttackModal(root);
              return rerenderPlay();
            }
          }

          // Apply capture (if any)
          if (targetBlack) {
            state.blacks = state.blacks.filter((b) => !(Number(b.r) === to.r && Number(b.c) === to.c));
          }

          state.pos = to;
          state.stepsUsed += 1;

          // Portal teleport (does not cost extra step)
          const portalsMap = buildPortalsMap(cfg.portals);
          const exit = portalExit(portalsMap, state.pos.r, state.pos.c);
          if (exit) {
            const er = Number(exit.r), ec = Number(exit.c);
          const rocksSet2 = buildRocksSet(state.rocks);
          const attacked2 = squaresAttackedByBlack({ blacks: state.blacks, rocksSet: rocksSet2, rows, cols });
            const blacksMap2 = buildBlacksMap(state.blacks);
            const destBlack = blackAt(blacksMap2, er, ec);
            const destIsRock = isRockAt(rocksSet2, er, ec);
            // Rules:
            // - moving onto portal counts as the step (already counted)
            // - teleport itself doesn't cost a step
            // - if landing square is Rock, cannot teleport
            // - if landing square is attacked, you can only land there by capturing AND that captured piece is not defended
            const destKey = `${er}:${ec}`;
            if (!destIsRock) {
              if (!attacked2.has(destKey)) {
                state.pos = { r: er, c: ec };
              } else if (destBlack) {
                const defended = isSquareAttackedByOtherBlacks({
                  blacks: state.blacks,
                  rocksSet: rocksSet2,
                  rows,
                  cols,
                  square: { r: er, c: ec },
                  exclude: { r: er, c: ec }
                });
                if (!defended) {
                  // capture on landing, if any
                  state.blacks = state.blacks.filter((b) => !(Number(b.r) === er && Number(b.c) === ec));
                  state.pos = { r: er, c: ec };
                }
              }
            }
          }

          // Sequential goals
          const goals = Array.isArray(cfg.goals) ? cfg.goals : [];
          const gi = Math.max(0, Math.min(goals.length - 1, Number(state.goalIndex) || 0));
          const activeGoal = goals[gi] || null;
          const isAtActiveGoal = !!activeGoal && posEq(state.pos, activeGoal);
          if (isAtActiveGoal) {
            // If not the last goal, advance to the next goal and continue
            if (gi < goals.length - 1) {
              state.goalIndex = gi + 1;
              return rerenderPlay();
            }
            // Last goal reached => win
            state.won = true;
            markStageComplete(String(stage?.id || ui.stage.stageId || ""));
            openSuccessModal(root, {
              onNext: async () => {
                const curNo = Number(stage?.stageNo || 0) || 0;
                const list = Array.isArray(ui.stage.stages) ? ui.stage.stages : [];
                const next = list.find((s) => Number(s.stageNo) === curNo + 1);
                if (next && next.id) await openStage(next.id);
              }
            });
            return rerenderPlay();
          }

          // Step limit fail?
          if (cfg.maxSteps != null && state.stepsUsed >= cfg.maxSteps) {
            return reset();
          }

          return rerenderPlay();
        });
      });
    }

    function bindBuilderHandlers() {
      root.querySelectorAll("[data-mr-builder-diff]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = normalizeDiff(btn.getAttribute("data-mr-builder-diff"));
          if (next === ui.stage.difficulty) return;
          ui.stage.difficulty = next;
          rerenderMain();
        });
      });
      root.querySelectorAll("[data-mr-builder-create]").forEach((btn) => {
        btn.addEventListener("click", () => {
          openCreateStageModal({
            root,
            difficulty: ui.stage.difficulty,
            onCreated: () => rerenderMain()
          });
        });
      });

      root.querySelectorAll("[data-mr-builder-edit]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            const stageId = String(btn.getAttribute("data-mr-builder-edit") || "").trim();
            if (!stageId) return;
            const data = await fetchStageDetail({ isTeacher: true, stageId });
            const st = data?.stage || null;
            if (!st) return;
            openCreateStageModal({
              root,
              difficulty: String(st.difficulty || ui.stage.difficulty),
              stage: st,
              onCreated: () => rerenderMain()
            });
          } catch (e) {
            alert(e?.message || String(e));
          }
        });
      });
    }

    bindNav();
    await rerenderMain();
  };
})();


