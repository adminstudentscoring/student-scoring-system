                  </div>
                  <div style="margin-top:10px; color:var(--cs-muted); font-weight:900;">
                    Tips: Click a piece icon, then click the board to place/remove it. Remove the cell = toggle cell removed/restored.
                  </div>
                </div>
              </div>

              <div>
                <div style="font-weight:950; color:var(--cs-ink);">Board</div>
                <div class="cs-card" style="margin-top:10px; background:#ffffff;">
                  <div id="csBoardHolder"></div>
                  <div id="csPieceCount" style="margin-top:12px; color:var(--cs-muted); font-weight:900;"></div>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; margin-top:16px;">
              <button id="csEditCancel" class="cs-btn" type="button">Cancel</button>
              <button id="csSaveStage" class="cs-btn primary" type="button">${isEdit ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    root.appendChild(host);

    const getBackdrop = () => host.querySelector("#csEditBackdrop");
    const getModal = () => host.querySelector(".vcp-modal");
    const close = () => { try { host.remove(); } catch {} };

    function rerenderBoard() {
      clampAll();
      const rset = removedSet();
      const holder = host.querySelector("#csBoardHolder");
      if (!holder) return;
      holder.innerHTML = renderBoardHtml({
        rows,
        cols,
        removedSet: rset,
        pieces,
        selectedIdx: -1,
        captureSet: new Set(),
        disableRemoved: false // IMPORTANT: builder must allow clicking removed cells to restore
      });
      const pc = host.querySelector("#csPieceCount");
      if (pc) pc.textContent = `Piece count: ${pieces.length}. Every move in Stage must capture.`;
      // Active states:
      // - piece buttons active when tool=piece and type matches
      host.querySelectorAll("[data-cs-piece]")?.forEach((b) => {
        const t = String(b.getAttribute("data-cs-piece") || "").toUpperCase();
        b.classList.toggle("is-active", tool === "piece" && t === String(pieceType || "").toUpperCase());
      });
      // - remove button active when tool=remove
      host.querySelectorAll("[data-cs-tool]")?.forEach((b) => {
        const k = String(b.getAttribute("data-cs-tool") || "");
        b.classList.toggle("is-active", k === tool);
      });
    }

    async function onSave() {
      clampAll();
      const config = {
        board: { rows, cols },
        pieces: pieces.map((p) => ({ type: p.type, r: p.r, c: p.c })),
        removed: removed.map((x) => ({ r: x.r, c: x.c }))
      };
      if (isEdit) await updateStage(stage.id, config);
      else await createStage({ difficulty: diff, config });
      close();
      onSaved && onSaved();
    }

    function bind() {
      const bd = getBackdrop();
      const m = getModal();
      bd?.addEventListener("click", (e) => {
        if (e.target === bd) close();
      });
      host.querySelector("#csEditClose")?.addEventListener("click", close);
      host.querySelector("#csEditCancel")?.addEventListener("click", close);
      host.querySelector("#csSaveStage")?.addEventListener("click", async () => {
        try {
          await onSave();
        } catch (err) {
          alert(String(err?.message || err));
        }
      });
      host.querySelector("#csRows")?.addEventListener("input", (e) => {
        rows = Number(e.target.value || 0) || 4;
        rerenderBoard();
      });
      host.querySelector("#csCols")?.addEventListener("input", (e) => {
        cols = Number(e.target.value || 0) || 4;
        rerenderBoard();
      });
      host.querySelectorAll?.("[data-cs-tool]")?.forEach((btn) => {
        btn.addEventListener("click", () => {
          tool = String(btn.getAttribute("data-cs-tool") || "piece");
          rerenderBoard();
        });
      });
      host.querySelectorAll?.("[data-cs-piece]")?.forEach((btn) => {
        btn.addEventListener("click", () => {
          const t = String(btn.getAttribute("data-cs-piece") || "").toUpperCase();
          if (!isPieceType(t)) return;
          pieceType = t;
          tool = "piece";
          rerenderBoard();
        });
      });

      // Board clicks
      host.querySelector("#csBoardHolder")?.addEventListener("click", (e) => {
        const cellBtn = e.target && e.target.closest ? e.target.closest("[data-cs-cell]") : null;
        if (!cellBtn) return;
        const cell = String(cellBtn.getAttribute("data-cs-cell") || "");
        const [rs, cs] = cell.split(":");
        const r = Number(rs), c = Number(cs);
        if (!inBounds(r, c, rows, cols)) return;

        if (tool === "remove") {
          const idx = removed.findIndex((x) => x.r === r && x.c === c);
          if (idx >= 0) removed.splice(idx, 1);
          else removed.push({ r, c });
          // removing cell also removes any piece there
          pieces = pieces.filter((p) => !(p.r === r && p.c === c));
          rerenderBoard();
          return;
        }

        // tool === piece
        const rset = removedSet();
        if (rset.has(`${r}:${c}`)) return;
        const idx = pieces.findIndex((p) => p.r === r && p.c === c);
        if (idx >= 0) {
          pieces.splice(idx, 1);
          rerenderBoard();
          return;
        }
        if (!isPieceType(pieceType)) pieceType = "Q";
        pieces.push({ type: pieceType, r, c });
        rerenderBoard();
      });
    }

    // Initial paint + bind
    rerenderBoard();
    bind();
  }

  async function renderBuilder() {
    await setMain(renderBuilderView({ difficulty: ui.builder.difficulty, stages: ui.builder.stages }));
    const root = document.getElementById("chessSolitaireRoot");
    const main = root?.querySelector?.("#csMain");
    if (!main) return;
    main.onclick = async (e) => {
      const t = e.target;
      const pill = t && t.closest ? t.closest("[data-cs-diff]") : null;
      if (pill) {
        ui.builder.difficulty = normalizeDiff(pill.getAttribute("data-cs-diff"));
        await loadStageListFor("builder");
        await renderBuilder();
        return;
      }
      const createBtn = t && t.closest ? t.closest('[data-cs-action="create"]') : null;
      if (createBtn) {
        openStageEditorModal({
          root,
          difficulty: ui.builder.difficulty,
          stage: null,
          onSaved: async () => {
            await loadStageListFor("builder");
            await renderBuilder();
          }
        });
        return;
      }
      const editCard = t && t.closest ? t.closest("[data-cs-edit-stage-id]") : null;
      if (editCard) {
        const id = String(editCard.getAttribute("data-cs-edit-stage-id") || "");
        if (!id) return;
        try {
          const resp = await fetchStageDetail({ isTeacher: true, stageId: id });
          openStageEditorModal({
            root,
            difficulty: ui.builder.difficulty,
            stage: resp?.stage || null,
            onSaved: async () => {
              await loadStageListFor("builder");
              await renderBuilder();
            }
          });
        } catch (err) {
          alert(String(err?.message || err));
        }
      }
    };
  }

  async function renderSettings() {
    const c = ui.settings.displayColor;
    await setMain(`
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="font-weight:950; font-size:16px;">Piece color</div>
        <div style="color:var(--cs-muted); font-weight:900;">Default in Builder is white. You can switch display color here.</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <button type="button" class="cs-btn ${c === "white" ? "primary" : ""}" data-cs-set-color="white">White</button>
          <button type="button" class="cs-btn ${c === "black" ? "primary" : ""}" data-cs-set-color="black">Black</button>
        </div>
      </div>
    `);
    const root = document.getElementById("chessSolitaireRoot");
    const main = root?.querySelector?.("#csMain");
    main?.querySelectorAll?.("[data-cs-set-color]")?.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const v = String(btn.getAttribute("data-cs-set-color") || "").toLowerCase();
        if (v !== "white" && v !== "black") return;
        ui.settings.displayColor = v;
        saveSettings();
        await renderSettings();
      });
    });
  }

  function bindNav() {
    const root = document.getElementById("chessSolitaireRoot");
    if (!root) return;
    root.addEventListener("click", async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".cs-nav-btn[data-cs-mode]") : null;
      if (!btn) return;
      const mode = Core.normalizeMode(btn.getAttribute("data-cs-mode"));
      if (mode === ui.mode) return;
      if (mode === "builder" && ui.role !== "teacher") return;
      ui.mode = mode;
      Core.setUrlMode(ui.mode);
      rerenderShell();
      if (ui.mode === "stage") {
        await loadStageListFor("stage").catch(() => {});
      }
      if (ui.mode === "builder") {
        await loadStageListFor("builder").catch(() => {});
      }
      await rerenderMain();
    });
  }

  function bindHomeHandlers() {
    const root = document.getElementById("chessSolitaireRoot");
    if (!root) return;
    const main = root.querySelector("#csMain");
    if (!main) return;
    const nextBtn = main.querySelector('[data-cs-story-next="1"]');
    if (nextBtn) {
      nextBtn.addEventListener("click", async () => {
        ui.home.storyIndex = Math.min(4, Number(ui.home.storyIndex || 0) + 1);
        await setMain(renderHome({ storyIndex: ui.home.storyIndex }));
        bindHomeHandlers();
      });
    }

    const rulesBtn = main.querySelector('[data-cs-home-rules="1"]');
    if (rulesBtn) {
      rulesBtn.addEventListener("click", () => openRulesModal(root));
    }

    const startBtn = main.querySelector('[data-cs-start-game="1"]');
    if (startBtn) {
      startBtn.addEventListener("click", async () => {
        ui.mode = "stage";
        ui.stage.difficulty = "easy";
        ui.home.storyIndex = 0;
        Core.setUrlMode(ui.mode);
        await loadStageListFor("stage").catch(() => {});
        rerenderShell();
        await rerenderMain();
      });
    }
  }

  async function initChessSolitaire() {
    const root = document.getElementById("chessSolitaireRoot");
    if (!root) {
      console.error("#chessSolitaireRoot not found");
      return;
    }
    loadSettings();
    // ensure builder default is white
    if (!ui.settings.displayColor) ui.settings.displayColor = "white";

    // Preload lists
    if (ui.mode === "stage") await loadStageListFor("stage").catch(() => {});
    if (ui.mode === "builder" && ui.role === "teacher") await loadStageListFor("builder").catch(() => {});
    rerenderShell();
    bindNav();
    await rerenderMain();
  }

  window.initChessSolitaire = initChessSolitaire;
})();


