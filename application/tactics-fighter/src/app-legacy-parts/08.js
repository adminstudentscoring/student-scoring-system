            const sid = String(openPuzzleBtn.getAttribute('data-tf-subtopic') || '');
            const pid = String(openPuzzleBtn.getAttribute('data-tf-open-puzzle') || '');
            const puzzles = ui.puzzlesBySubtopic.get(sid) || [];
            const p = puzzles.find((x) => String(x?.id || '') === pid);
            if (!p) return;
            openPuzzleDetailModal({ subtopicId: sid, puzzle: p }).catch((e) => showBuilderMsg('err', e?.message || String(e)));
            return;
          }

          const addPuzzleBtn = t?.closest?.('[data-tf-add-puzzle]');
          if (addPuzzleBtn) {
            const sid = String(addPuzzleBtn.getAttribute('data-tf-add-puzzle') || '');
            if (!sid) return;
            openAddPuzzleModal(sid).catch((e) => showBuilderMsg('err', e?.message || String(e)));
            return;
          }
        });

        if (!ui.builderLoadedOnce) {
          builderRefresh();
        }
      }

      // Settings wire-up
      if (nm === 'settings') {
        (async () => {
          const input = document.getElementById('tfSettingDepthCap');
          const saveBtn = document.getElementById('tfSettingSaveBtn');
          const hint = document.getElementById('tfSettingHint');

          // Load latest settings from server (org-level)
          toastShow('loading', 'Loading...');
          await loadTfSettings();
          toastHide();

          if (input) input.value = String(getDepthCap());

          if (!isTeacher) {
            if (saveBtn) saveBtn.style.display = 'none';
            if (hint) hint.textContent = `Depth cap is managed by teachers. Current cap: ${getDepthCap()}.`;
            return;
          }

          if (hint) hint.textContent = `Current cap: ${getDepthCap()} (applies to Practice + Builder).`;
          saveBtn?.addEventListener('click', async () => {
            try {
              const next = Number(input?.value || getDepthCap()) || getDepthCap();
              toastShow('loading', 'Saving...');
              await saveTfSettings(next);
              toastHide();
              if (input) input.value = String(getDepthCap());
              if (hint) hint.textContent = `Saved. Current cap: ${getDepthCap()} (applies to Practice + Builder).`;
              toastShow('ok', 'Saved.', { autoHideMs: 1600 });
            } catch (e) {
              toastShow('err', e?.message || String(e));
              if (hint) hint.textContent = e?.message || String(e);
            }
          });
        })();
      }
      if (nm === 'practice' && isTeacher && ui.teacher.tree && ui.teacher.view !== 'bucket') {
        if (ui.teacher.view === 'categories') {
          setOut(renderTeacherCategories(ui.teacher.tree.categories || []));
        } else if (ui.teacher.view === 'topics') {
          const cat = teacherFindCategoryById(ui.teacher.categoryId);
          setOut(cat ? renderTeacherTopics(cat) : renderTeacherCategories(ui.teacher.tree.categories || []));
        } else if (ui.teacher.view === 'subtopics') {
          const cat = teacherFindCategoryById(ui.teacher.categoryId);
          const topic = teacherFindTopicById(cat, ui.teacher.topicId);
          setOut((cat && topic) ? renderTeacherSubtopics(cat, topic) : renderTeacherCategories(ui.teacher.tree.categories || []));
        } else if (ui.teacher.view === 'puzzles') {
          const cat = teacherFindCategoryById(ui.teacher.categoryId);
          const topic = teacherFindTopicById(cat, ui.teacher.topicId);
          const sub = teacherFindSubtopicById(topic, ui.teacher.subtopicId);
          setOut(renderTeacherPuzzles(sub?.name || 'Subtopic', ui.teacher.puzzlesAll, ui.teacher.page, ui.teacher.pageSize));
        }
      }
    };

    async function openPuzzleDetailModal({ subtopicId, puzzle }) {
      const fen = String(puzzle?.fen || '').trim();
      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfPuzzleDetailBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Puzzle detail" style="width: calc(100vw - 40px); max-width: 1400px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Puzzle #${escapeHtml(String(puzzle?.id || ''))}</div>
              <button id="tfPuzzleDetailClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-modal-grid">
                <div>
                  <div class="tf-board" id="tfPuzzleDetailBoard" aria-label="Puzzle board"></div>
                  <div class="tf-field">
                    <label>FEN</label>
                    <textarea class="tf-textarea" rows="3" readonly>${escapeHtml(fen)}</textarea>
                  </div>
                </div>
                <div>
                  <div class="tf-section-title">Answers</div>
                  <div id="tfPuzzleDetailAnswers" class="tf-lines"></div>
                  <div id="tfPuzzleEditPanel" style="display:none; margin-top:12px; border:1px solid #e5e7eb; border-radius:14px; padding:12px; background:#f8fafc;">
                    <div style="font-weight:950; color:#111827; margin-bottom:8px;">Edit puzzle</div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                      <label class="tf-muted" style="font-weight:900;">PV plies</label>
                      <input id="tfPuzzleEditPvPlies" class="tf-select" type="number" min="1" max="32" step="1" value="8" style="width:120px;">
                      <button id="tfPuzzleEditRun" class="btn btn-primary" type="button">Run Engine</button>
                      <button id="tfPuzzleEditSave" class="btn btn-success" type="button" disabled>Save</button>
                      <button id="tfPuzzleEditCancel" class="btn btn-secondary" type="button">Cancel</button>
                    </div>
                    <div class="tf-field" style="margin-top:10px;">
                      <label for="tfPuzzleEditMessage">Puzzle message</label>
                      <textarea id="tfPuzzleEditMessage" class="tf-textarea" rows="3" placeholder="Tell students what to do for this puzzle..."></textarea>
                    </div>
                    <div id="tfPuzzleEditMsg" class="tf-muted" style="margin-top:10px;"></div>
                  </div>
                  <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px; flex-wrap:wrap;">
                    <button id="tfPuzzleEditBtn" class="btn btn-secondary" type="button">Edit</button>
                    <button id="tfPuzzleDeleteBtn" class="btn btn-danger" type="button">Delete</button>
                    <button id="tfPuzzleCloseBtn" class="btn btn-secondary" type="button">Close</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };
      host.querySelector('#tfPuzzleDetailClose')?.addEventListener('click', close);
      host.querySelector('#tfPuzzleCloseBtn')?.addEventListener('click', close);
      host.querySelector('#tfPuzzleDetailBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfPuzzleDetailBackdrop') close();
      });

      // Render board
      try {
        const b = parseFenToBoard(fen);
        const boardEl = host.querySelector('#tfPuzzleDetailBoard');
        if (boardEl) {
          const sqs = [];
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const isDark = (r + c) % 2 === 1;
              const p = b && b[r] ? (b[r][c] || '') : '';
              const src = p ? pieceImageSrc(p) : '';
              const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
              sqs.push(`<div class="tf-sq ${isDark ? 'dark' : 'light'}">${img}</div>`);
            }
          }
          boardEl.innerHTML = sqs.join('');
        }
      } catch {}

      function renderAnswers() {
        const answersEl = host.querySelector('#tfPuzzleDetailAnswers');
        const sol = puzzle?.solutions && typeof puzzle.solutions === 'object' ? puzzle.solutions : null;
        const accepted = Array.isArray(sol?.acceptedLines) ? sol.acceptedLines : null;
        const lines = accepted && accepted.length ? accepted : (Array.isArray(sol?.lines) ? sol.lines : []);
        const html = lines.length ? lines.map((ln) => {
          const mp = String(ln?.multiPv || 1);
          const scoreObj = ln?.score || {};
          const score = (scoreObj && Object.prototype.hasOwnProperty.call(scoreObj, 'mate'))
            ? `mate ${Number(scoreObj.mate) || 0}`
            : `cp ${Number(scoreObj.cp) || 0}`;
          const pv = formatPvWithMoveNumbersHtml(fen, ln?.pvSan);
          const fallback = Array.isArray(ln?.pvUci) ? escapeHtml(ln.pvUci.join(' ')) : '';
          return `<div class="tf-line"><div class="tf-line-title">#${escapeHtml(mp)} · ${escapeHtml(score)}</div><div class="tf-line-meta">${pv || fallback}</div></div>`;
        }).join('') : `<div class="tf-muted">No answers saved.</div>`;
        if (answersEl) answersEl.innerHTML = html;
      }
      renderAnswers();

      // Edit puzzle: re-run engine to change PV plies and save solutions.
      const editPanel = host.querySelector('#tfPuzzleEditPanel');
      const editBtn = host.querySelector('#tfPuzzleEditBtn');
      const pvPliesInput = host.querySelector('#tfPuzzleEditPvPlies');
      const editRunBtn = host.querySelector('#tfPuzzleEditRun');
      const editSaveBtn = host.querySelector('#tfPuzzleEditSave');
      const editCancelBtn = host.querySelector('#tfPuzzleEditCancel');
      const editMsg = host.querySelector('#tfPuzzleEditMsg');
      const editMessageInput = host.querySelector('#tfPuzzleEditMessage');
      let lastEditEngine = null;
      const originalMessage = String(puzzle?.message || '').trim();

      const setEditMsg = (s) => { if (editMsg) editMsg.textContent = String(s || ''); };
      const openEdit = () => {
        if (editPanel) editPanel.style.display = 'block';
        if (pvPliesInput) pvPliesInput.value = String(Number(puzzle?.pvPlies || puzzle?.pv_plies || 8) || 8);
        if (editMessageInput) editMessageInput.value = String(puzzle?.message || '');
        if (editSaveBtn) editSaveBtn.disabled = true;
        lastEditEngine = null;
        setEditMsg('');
      };
      const closeEdit = () => {
        if (editPanel) editPanel.style.display = 'none';
        if (editSaveBtn) editSaveBtn.disabled = true;
        lastEditEngine = null;
        setEditMsg('');
      };

      editBtn?.addEventListener('click', openEdit);
      editCancelBtn?.addEventListener('click', closeEdit);

      editRunBtn?.addEventListener('click', async () => {
        try {
          const pvPlies = Math.max(1, Math.min(32, Number(pvPliesInput?.value || 8) || 8));
          setEditMsg('Running engine…');
          toastShow('loading', 'Running engine…');
          const r = await engineAnalyze({ fen, depth: getBuilderDepthDefault(), multipv: 1, pvPlies });
          const line0 = Array.isArray(r?.lines) ? r.lines[0] : null;
          if (!line0) throw new Error('Engine returned empty line');
          const solutions = {
            bestMove: r?.bestMove || line0?.bestMove || null,
            lines: [line0],
            acceptedMultiPv: ['1'],
            acceptedLines: [line0]
          };
          lastEditEngine = { pvPlies, solutions };
          if (editSaveBtn) editSaveBtn.disabled = false;
          toastHide();
          setEditMsg('Ready to save.');
        } catch (e) {
          toastShow('err', e?.message || String(e));
          setEditMsg(e?.message || String(e));
        } finally {
          // toastHide handled on success; keep error visible
        }
      });

      // Manual Input in Edit puzzle: same manual move-by-move interface as Add puzzles.
      const editManualBtn = (() => {
        try {
          const row = editPanel?.querySelector?.('div[style*="display:flex"]');
          if (!row) return null;
          const btn = document.createElement('button');
          btn.id = 'tfPuzzleEditManual';
          btn.className = 'btn btn-secondary';
          btn.type = 'button';
          btn.textContent = 'Manual Input';
          // Insert next to Run Engine (after PV plies input)
          row.insertBefore(btn, editRunBtn || null);
          return btn;
        } catch {
          return null;
        }
      })();

      editManualBtn?.addEventListener('click', async () => {
        try {
          const out = await openManualAnswerModal(fen);
          const pvUci = Array.isArray(out?.pvUci) ? out.pvUci : [];
          const pvSan = Array.isArray(out?.pvSan) ? out.pvSan : [];
          if (!pvUci.length) throw new Error('No moves');
          const line0 = {
            multiPv: 1,
            score: { cp: 0 },
            bestMove: pvUci[0],
            pvUci,
            pvSan
          };
          const solutions = {
            bestMove: pvUci[0],
            lines: [line0],
            acceptedMultiPv: ['manual'],
            acceptedLines: [line0]
          };
          lastEditEngine = { pvPlies: pvUci.length, solutions };
          updateEditSaveEnabled();
          setEditMsg('Manual answer is ready to save.');
        } catch (e) {
          toastShow('err', e?.message || String(e));
          setEditMsg(e?.message || String(e));
        }
      });

      const updateEditSaveEnabled = () => {
        const msgNow = String(editMessageInput?.value || '').trim();
        const msgChanged = msgNow !== originalMessage;
        const canSave = msgChanged || !!lastEditEngine?.solutions;
        if (editSaveBtn) editSaveBtn.disabled = !canSave;
      };
      editMessageInput?.addEventListener('input', updateEditSaveEnabled);

      editSaveBtn?.addEventListener('click', async () => {
        try {
          toastShow('loading', 'Saving…');
          const msgNow = String(editMessageInput?.value || '').trim();
          const payload = {};
          if (msgNow !== originalMessage) payload.message = msgNow;
          if (lastEditEngine?.solutions) {
            const pvPlies = Number(lastEditEngine.pvPlies || 8) || 8;
            payload.engineDepth = getBuilderDepthDefault();
            payload.multipv = 1;
            payload.pvPlies = pvPlies;
            payload.solutions = lastEditEngine.solutions;
          }
          const out = await builderUpdatePuzzle(puzzle?.id, payload);
          // update local puzzle object + rerender answers
          if (out?.puzzle?.message != null) puzzle.message = String(out.puzzle.message || '');
          if (out?.puzzle?.solutions) {
            puzzle.solutions = out?.puzzle?.solutions || (lastEditEngine?.solutions || puzzle.solutions);
            puzzle.pvPlies = Number(out?.puzzle?.pvPlies || puzzle.pvPlies || 8) || 8;
          }
          renderAnswers();
          // refresh puzzles list cache
          const data = await builderFetchPuzzles(subtopicId);
          ui.puzzlesBySubtopic.set(subtopicId, Array.isArray(data.puzzles) ? data.puzzles : []);
          ui.expanded.puzzlesLoaded.add(subtopicId);
          ui.expanded.subtopic.add(subtopicId);
          await builderRefresh();
          toastHide();
          closeEdit();
        } catch (e) {
          toastShow('err', e?.message || String(e));
          setEditMsg(e?.message || String(e));
        }
      });

      host.querySelector('#tfPuzzleDeleteBtn')?.addEventListener('click', async () => {
        const ok = confirm('Delete this puzzle?');
        if (!ok) return;
        await builderDeletePuzzle(puzzle?.id);
        // refresh puzzles in this subtopic
        const data = await builderFetchPuzzles(subtopicId);
        ui.puzzlesBySubtopic.set(subtopicId, Array.isArray(data.puzzles) ? data.puzzles : []);
        ui.expanded.puzzlesLoaded.add(subtopicId);
        ui.expanded.subtopic.add(subtopicId);
        // clamp page
        const per = 10;
        const total = ui.puzzlesBySubtopic.get(subtopicId).length;
        const maxPage = Math.max(0, Math.ceil(total / per) - 1);
        const cur = Number(ui.puzzlePageBySubtopic.get(subtopicId) || 0) || 0;
        ui.puzzlePageBySubtopic.set(subtopicId, Math.min(cur, maxPage));
        await builderRefresh();
        close();
      });
    }

    async function openAddPuzzleModal(subtopicId) {
      const roleNow = String(new URLSearchParams(window.location.search).get('role') || '');
      if (String(roleNow).toLowerCase() !== 'teacher') {
        alert('Add puzzles is available for teacher only.');
        return;
      }

      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfAddPuzzleBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Add puzzles" style="width: calc(100vw - 40px); max-width: 1600px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Add puzzles</div>
              <button id="tfAddPuzzleClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-modal-grid">
                <div>
                  <div id="tfEditorBoard" class="tf-board" aria-label="Board editor"></div>
                  <div class="tf-field">
                    <label for="tfFenInput">FEN</label>
                    <textarea id="tfFenInput" class="tf-textarea" rows="3" placeholder="Paste FEN here..."></textarea>
                  </div>
                </div>

                <div>
                  <div class="tf-field">
                    <label>Pieces</label>
                    <div id="tfPalette" class="tf-piece-palette"></div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                      <button id="tfClearSelection" class="btn btn-secondary" type="button">Clear selection</button>
                      <button id="tfClearBoard" class="btn btn-secondary" type="button">Clear board</button>
                      <button id="tfStartPos" class="btn btn-secondary" type="button">Start position</button>
                    </div>
                  </div>

                  <div class="tf-field">
                    <label>Side to move</label>
                    <select id="tfSideSelect" class="tf-select">
                      <option value="w">White to move</option>
                      <option value="b">Black to move</option>
                    </select>
                  </div>

                  <div class="tf-field">
                    <label for="tfPuzzleMessageInput">Puzzle message</label>
                    <textarea id="tfPuzzleMessageInput" class="tf-textarea" rows="3" placeholder="Tell students what to do for this puzzle..."></textarea>
                  </div>

                  <div class="tf-field">
                    <label>Engine Load</label>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px;">
                      <div>
                        <div class="tf-muted" style="font-weight:900;">MultiPV (N-best)</div>
                        <div class="tf-stepper">
                          <input id="tfMultiPv" type="number" min="1" max="10" value="1">
                          <div class="tf-stepper-arrows">
                            <button id="tfMultiPvUp" class="tf-arrow-btn" type="button" aria-label="Increase MultiPV">▲</button>
                            <button id="tfMultiPvDown" class="tf-arrow-btn" type="button" aria-label="Decrease MultiPV">▼</button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div class="tf-muted" style="font-weight:900;">PV plies</div>
                        <div class="tf-stepper">
                          <input id="tfPvPlies" type="number" min="1" max="32" value="8">
                          <div class="tf-stepper-arrows">
                            <button id="tfPvPliesUp" class="tf-arrow-btn" type="button" aria-label="Increase PV plies">▲</button>
                            <button id="tfPvPliesDown" class="tf-arrow-btn" type="button" aria-label="Decrease PV plies">▼</button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
                      <button id="tfEngineLoadBtn" class="btn btn-primary" type="button">Engine Load</button>
                      <button id="tfManualInputBtn" class="btn btn-secondary" type="button">Manual Input</button>
                      <button id="tfEngineClearBtn" class="btn btn-secondary" type="button">Clear Engine Load</button>
                      <button id="tfSavePuzzleBtn" class="btn btn-success" type="button" disabled>Confirm & Save</button>
                    </div>
                  </div>

                  <div id="tfEngineOut" class="tf-lines"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };
      host.querySelector('#tfAddPuzzleClose')?.addEventListener('click', close);
      host.querySelector('#tfAddPuzzleBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfAddPuzzleBackdrop') close();
      });

      let board = parseFenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1') || Array.from({ length: 8 }, () => Array(8).fill(''));
      let side = 'w';
      let selectedPiece = '';
      let lastEngine = null;
      let manualLine = null; // { pvUci:[], pvSan:[], bestMove }

      const fenInput = host.querySelector('#tfFenInput');
      const sideSel = host.querySelector('#tfSideSelect');
      const boardEl = host.querySelector('#tfEditorBoard');
      const paletteEl = host.querySelector('#tfPalette');
      const engineOutEl = host.querySelector('#tfEngineOut');
      const saveBtn = host.querySelector('#tfSavePuzzleBtn');
      const puzzleMsgInput = host.querySelector('#tfPuzzleMessageInput');
      const selectedAnswerMultiPv = new Set();
