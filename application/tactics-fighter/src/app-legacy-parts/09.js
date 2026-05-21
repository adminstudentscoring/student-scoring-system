
      function formatPvWithMoveNumbers(fen, pvSan) {
        const parts = String(fen || '').trim().split(/\s+/);
        const side = (parts[1] === 'b') ? 'b' : 'w';
        const fullmove = Math.max(1, Number(parts[5] || 1) || 1);
        const moves = Array.isArray(pvSan) ? pvSan.map(String).filter(Boolean) : [];
        if (!moves.length) return '';

        const lines = [];
        let idx = 0;
        let m = fullmove;

        if (side === 'b') {
          const b = moves[idx++];
          if (b) lines.push(`${m}. ... ${b}`);
          m += 1;
        }

        while (idx < moves.length) {
          const w = moves[idx++] || '';
          const b = moves[idx++] || '';
          if (w && b) lines.push(`${m}. ${w} ${b}`);
          else if (w) lines.push(`${m}. ${w}`);
          m += 1;
        }

        return lines.map(escapeHtml).join('<br>');
      }

      function renderBoard() {
        if (!boardEl) return;
        const sqs = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const isDark = (r + c) % 2 === 1;
            const p = board[r][c] || '';
            const src = p ? pieceImageSrc(p) : '';
            const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
            sqs.push(`<div class="tf-sq ${isDark ? 'dark' : 'light'}" data-r="${r}" data-c="${c}" title="${escapeHtml(rcToCoord(r, c))}">${img}</div>`);
          }
        }
        boardEl.innerHTML = sqs.join('');
      }

      function syncFenText() {
        const fen = buildFenFromBoard(board, side);
        if (fenInput) fenInput.value = fen;
      }

      function applyFenText() {
        const fen = String(fenInput?.value || '').trim();
        const b = parseFenToBoard(fen);
        const parts = fen.split(/\s+/);
        const stm = parts[1] === 'b' ? 'b' : 'w';
        if (b) {
          board = b;
          side = stm;
          if (sideSel) sideSel.value = side;
          renderBoard();
        }
      }

      function renderPalette() {
        if (!paletteEl) return;
        const pieces = ['K','Q','R','B','N','P','k','q','r','b','n','p'];
        paletteEl.innerHTML = pieces.map((p) => {
          const src = pieceImageSrc(p);
          const inner = src
            ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">`
            : escapeHtml(PIECE_UNICODE[p] || p);
          return `<button type="button" class="tf-piece-btn ${selectedPiece === p ? 'is-active' : ''}" data-piece="${escapeHtml(p)}" aria-label="Piece ${escapeHtml(p)}">${inner}</button>`;
        }).join('');
      }

      function setEngineOut(html) { if (engineOutEl) engineOutEl.innerHTML = html; }

      function updateSaveEnabled() {
        if (!saveBtn) return;
        const hasEngine = !!(lastEngine && Array.isArray(lastEngine.lines) && lastEngine.lines.length);
        const hasPick = selectedAnswerMultiPv.size > 0;
        const hasManual = !!(manualLine && Array.isArray(manualLine.pvUci) && manualLine.pvUci.length);
        saveBtn.disabled = !((hasEngine && hasPick) || hasManual);
      }

      function renderEngineOutCombined(fen) {
        const blocks = [];
        if (manualLine && Array.isArray(manualLine.pvUci) && manualLine.pvUci.length) {
          const pv = formatPvWithMoveNumbers(fen, manualLine.pvSan);
          const fallback = Array.isArray(manualLine.pvUci) ? escapeHtml(manualLine.pvUci.join(' ')) : '';
          blocks.push(`
            <div class="tf-line" style="border-color: rgba(20,184,166,0.35);">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                <div class="tf-line-title">Manual answer</div>
                <button id="tfManualClearBtn" class="btn btn-secondary btn-small" type="button">Clear</button>
              </div>
              <div class="tf-line-meta">${pv || fallback}</div>
            </div>
          `);
        }
        if (lastEngine && Array.isArray(lastEngine.lines) && lastEngine.lines.length) {
          const lines = lastEngine.lines;
          blocks.push(lines.map((ln) => {
            const score = ln?.score?.mate != null ? `mate ${ln.score.mate}` : `cp ${ln?.score?.cp ?? 0}`;
            const pv = formatPvWithMoveNumbers(fen, ln.pvSan);
            const fallback = Array.isArray(ln.pvUci) ? escapeHtml(ln.pvUci.join(' ')) : '';
            const mp = String(ln.multiPv || 1);
            return `
              <div class="tf-line">
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                  <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
                    <input type="checkbox" data-tf-answer="${escapeHtml(mp)}" style="width:18px; height:18px;">
                    <div class="tf-line-title">#${escapeHtml(mp)} · ${escapeHtml(score)}</div>
                  </label>
                </div>
                <div class="tf-line-meta">${pv || fallback}</div>
              </div>
            `;
          }).join(''));
        }
        setEngineOut(blocks.length ? blocks.join('') : '');

        // Bind manual clear if present
        host.querySelector('#tfManualClearBtn')?.addEventListener('click', () => {
          manualLine = null;
          renderEngineOutCombined(String(fenInput?.value || '').trim());
          updateSaveEnabled();
        });
      }

      async function openManualAnswerModal(startFen) {
        const fen0 = String(startFen || '').trim();
        if (!fen0) throw new Error('Missing FEN');
        // Validate fen first (basic)
        const b0 = parseFenToBoard(fen0);
        if (!b0) throw new Error('Invalid FEN');

        const host2 = document.createElement('div');
        host2.innerHTML = `
          <div class="vcp-modal-backdrop" id="tfManualBackdrop" role="presentation">
            <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Manual Input" style="width: calc(100vw - 40px); max-width: 1200px;">
              <div class="vcp-modal-header">
                <div class="vcp-modal-title">Manual Input</div>
                <button id="tfManualClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
              </div>
              <div class="vcp-modal-body">
                <div style="display:grid; grid-template-columns: 520px 1fr; gap:14px; align-items:start;">
                  <div>
                    <div id="tfManualBoard" class="tf-board" aria-label="Manual board"></div>
                    <div class="tf-muted" style="margin-top:10px;">Click a piece, then click the destination square.</div>
                  </div>
                  <div>
                    <div class="tf-section-title">Moves</div>
                    <div id="tfManualMoves" class="tf-lines" style="margin-top:8px;"></div>
                    <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
                      <button id="tfManualUndo" class="btn btn-secondary" type="button">Undo</button>
                      <button id="tfManualConfirm" class="btn btn-primary" type="button" disabled>Confirm</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        root.appendChild(host2);

        const close2 = () => { try { host2.remove(); } catch {} };
        host2.querySelector('#tfManualClose')?.addEventListener('click', close2);
        host2.querySelector('#tfManualBackdrop')?.addEventListener('click', (e) => {
          if (e.target && e.target.id === 'tfManualBackdrop') close2();
        });

        let curFen = fen0;
        let curBoard = parseFenToBoard(curFen);
        let selected = '';
        const hist = []; // { fenBefore, uci, san }

        const boardEl2 = host2.querySelector('#tfManualBoard');
        const movesEl2 = host2.querySelector('#tfManualMoves');
        const confirmBtn2 = host2.querySelector('#tfManualConfirm');

        const renderBoard2 = () => {
          if (!boardEl2) return;
          const b = curBoard || parseFenToBoard(curFen);
          if (!b) return;
          const sqs = [];
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const isDark = (r + c) % 2 === 1;
              const coord = rcToCoord(r, c);
              const p = b[r][c] || '';
              const src = p ? pieceImageSrc(p) : '';
              const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
              const sel = (selected === coord) ? ' is-selected' : '';
              sqs.push(`<button type="button" class="tf-sq tf-sq-btn ${isDark ? 'dark' : 'light'}${sel}" data-man-sq="${escapeHtml(coord)}">${img}</button>`);
            }
          }
          boardEl2.innerHTML = sqs.join('');
        };

        const renderMoves2 = () => {
          const pvSan = hist.map((h) => String(h.san || '')).filter(Boolean);
          const pv = formatPvWithMoveNumbers(fen0, pvSan);
          if (movesEl2) movesEl2.innerHTML = pv ? `<div class="tf-line-meta">${pv}</div>` : `<div class="tf-muted">No moves yet.</div>`;
          if (confirmBtn2) confirmBtn2.disabled = hist.length === 0;
        };

        const tryPromotion = async (board, from, to) => {
          if (!needsPawnPromotion(board, from, to)) return '';
          const fr = coordToRc(from);
          const pawn = fr ? (board?.[fr.r]?.[fr.c] || '') : '';
          const picked = await openPromotionPicker(pawn || 'P');
          return picked || '';
        };

        renderBoard2();
        renderMoves2();

        boardEl2?.addEventListener('click', async (ev) => {
          const btn = ev.target && ev.target.closest ? ev.target.closest('[data-man-sq]') : null;
          if (!btn) return;
          const sq = String(btn.getAttribute('data-man-sq') || '').trim();
          if (!sq) return;
          if (!selected) {
            selected = sq;
            renderBoard2();
            return;
          }
          const from = selected;
          const to = sq;
          selected = '';
          renderBoard2();

          const promo = await tryPromotion(curBoard, from, to);
          const uci = `${from.toLowerCase()}${to.toLowerCase()}${promo}`;
          try {
            const out = await teacherApplyMove(curFen, uci);
            hist.push({ fenBefore: curFen, uci, san: out?.san || '' });
            curFen = String(out?.fenAfter || out?.fen || curFen);
            curBoard = parseFenToBoard(curFen);
            renderBoard2();
            renderMoves2();
          } catch (e) {
            toastShow('err', e?.message || String(e));
          }
        });

        host2.querySelector('#tfManualUndo')?.addEventListener('click', () => {
          const last = hist.pop();
          if (!last) return;
          curFen = String(last.fenBefore || fen0);
          curBoard = parseFenToBoard(curFen);
          selected = '';
          renderBoard2();
          renderMoves2();
        });

        return await new Promise((resolve, reject) => {
          host2.querySelector('#tfManualConfirm')?.addEventListener('click', () => {
            try {
              const pvUci = hist.map((h) => String(h.uci || '').trim().toLowerCase()).filter(Boolean);
              const pvSan = hist.map((h) => String(h.san || '')).filter(Boolean);
              if (!pvUci.length) throw new Error('No moves');
              close2();
              resolve({ pvUci, pvSan });
            } catch (e) {
              reject(e);
            }
          });
        });
      }

      // init editor
      syncFenText();
      renderBoard();
      renderPalette();
      updateSaveEnabled();

      boardEl?.addEventListener('click', (e) => {
        const sq = e.target && e.target.closest ? e.target.closest('.tf-sq') : null;
        if (!sq) return;
        const r = Number(sq.getAttribute('data-r'));
        const c = Number(sq.getAttribute('data-c'));
        if (!Number.isFinite(r) || !Number.isFinite(c)) return;
        board[r][c] = selectedPiece ? selectedPiece : '';
        renderBoard();
        syncFenText();
      });

      paletteEl?.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.tf-piece-btn') : null;
        if (!btn) return;
        selectedPiece = String(btn.getAttribute('data-piece') || '');
        renderPalette();
      });

      host.querySelector('#tfClearSelection')?.addEventListener('click', () => {
        selectedPiece = '';
        renderPalette();
      });
      host.querySelector('#tfClearBoard')?.addEventListener('click', () => {
        board = Array.from({ length: 8 }, () => Array(8).fill(''));
        renderBoard();
        syncFenText();
      });
      host.querySelector('#tfStartPos')?.addEventListener('click', () => {
        const b = parseFenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
        if (b) board = b;
        side = 'w';
        if (sideSel) sideSel.value = 'w';
        renderBoard();
        syncFenText();
      });

      sideSel?.addEventListener('change', () => {
        side = String(sideSel.value || 'w') === 'b' ? 'b' : 'w';
        syncFenText();
      });

      fenInput?.addEventListener('blur', applyFenText);

      const multiPvEl = host.querySelector('#tfMultiPv');
      const pvPliesEl = host.querySelector('#tfPvPlies');
      host.querySelector('#tfMultiPvUp')?.addEventListener('click', () => {
        if (!multiPvEl) return;
        const v = Number(multiPvEl.value || 1) || 1;
        multiPvEl.value = String(Math.max(1, Math.min(10, v + 1)));
      });
      host.querySelector('#tfMultiPvDown')?.addEventListener('click', () => {
        if (!multiPvEl) return;
        const v = Number(multiPvEl.value || 1) || 1;
        multiPvEl.value = String(Math.max(1, Math.min(10, v - 1)));
      });
      host.querySelector('#tfPvPliesUp')?.addEventListener('click', () => {
        if (!pvPliesEl) return;
        const v = Number(pvPliesEl.value || 8) || 8;
        pvPliesEl.value = String(Math.max(1, Math.min(32, v + 1)));
      });
      host.querySelector('#tfPvPliesDown')?.addEventListener('click', () => {
        if (!pvPliesEl) return;
        const v = Number(pvPliesEl.value || 8) || 8;
        pvPliesEl.value = String(Math.max(1, Math.min(32, v - 1)));
      });

      host.querySelector('#tfEngineLoadBtn')?.addEventListener('click', async () => {
        try {
          applyFenText();
          const fen = String(fenInput?.value || '').trim();
          const multipv = Math.max(1, Math.min(10, Number(multiPvEl?.value || 1) || 1));
          const pvPlies = Math.max(1, Math.min(32, Number(pvPliesEl?.value || 8) || 8));
          selectedAnswerMultiPv.clear();
          updateSaveEnabled();
          setEngineOut(`<div class="tf-muted">Loading engine...</div>`);
          const data = await engineAnalyze({ fen, multipv, pvPlies });
          lastEngine = data;
          renderEngineOutCombined(fen);
          updateSaveEnabled();
        } catch (e) {
          setEngineOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
          selectedAnswerMultiPv.clear();
          updateSaveEnabled();
        }
      });

      host.querySelector('#tfManualInputBtn')?.addEventListener('click', async () => {
        try {
          applyFenText();
          const fen = String(fenInput?.value || '').trim();
          const out = await openManualAnswerModal(fen);
          const pvUci = Array.isArray(out?.pvUci) ? out.pvUci : [];
          const pvSan = Array.isArray(out?.pvSan) ? out.pvSan : [];
          if (!pvUci.length) throw new Error('No moves');
          manualLine = {
            multiPv: 1,
            score: { cp: 0 },
            bestMove: pvUci[0],
            pvUci,
            pvSan
          };
          renderEngineOutCombined(fen);
          updateSaveEnabled();
        } catch (e) {
          toastShow('err', e?.message || String(e));
        }
      });

      host.querySelector('#tfEngineClearBtn')?.addEventListener('click', () => {
        lastEngine = null;
        selectedAnswerMultiPv.clear();
        renderEngineOutCombined(String(fenInput?.value || '').trim());
        updateSaveEnabled();
      });

      engineOutEl?.addEventListener('change', (e) => {
        const cb = e.target && e.target.closest ? e.target.closest('input[type="checkbox"][data-tf-answer]') : null;
        if (!cb) return;
        const mp = String(cb.getAttribute('data-tf-answer') || '').trim();
        if (!mp) return;
        if (cb.checked) selectedAnswerMultiPv.add(mp);
        else selectedAnswerMultiPv.delete(mp);
        updateSaveEnabled();
      });

      host.querySelector('#tfSavePuzzleBtn')?.addEventListener('click', async () => {
        try {
          applyFenText();
          const fen = String(fenInput?.value || '').trim();
          if (!fen) throw new Error('Missing FEN');
          const bucket = getBuilderBucket();
          const message = String(puzzleMsgInput?.value || '').trim();

          const acceptedLines = [];
          const acceptedMultiPv = [];
          if (manualLine && Array.isArray(manualLine.pvUci) && manualLine.pvUci.length) {
            acceptedLines.push(manualLine);
            acceptedMultiPv.push('manual');
          }

          if (lastEngine && Array.isArray(lastEngine.lines) && lastEngine.lines.length && selectedAnswerMultiPv.size) {
            const keep = new Set(Array.from(selectedAnswerMultiPv));
            const allLines = Array.isArray(lastEngine?.lines) ? lastEngine.lines : [];
            const selectedLines = allLines.filter((ln) => keep.has(String(ln?.multiPv || '1')));
            for (const ln of selectedLines) acceptedLines.push(ln);
            for (const k of keep) acceptedMultiPv.push(String(k));
          }

          if (!acceptedLines.length) throw new Error('Please add at least 1 manual answer or select at least 1 engine line');

          const solutions = {
            ...(lastEngine && typeof lastEngine === 'object' ? lastEngine : {}),
            acceptedMultiPv,
            acceptedLines,
            // Best move for quick display
            bestMove: (acceptedLines[0] && acceptedLines[0].bestMove) ? acceptedLines[0].bestMove : (lastEngine?.bestMove || null)
          };

          const payload = {
            fen,
            engineDepth: getBuilderDepthDefault(),
            multipv: Number(multiPvEl?.value || 1) || 1,
            pvPlies: Number(pvPliesEl?.value || 8) || 8,
            message,
            solutions,
            meta: { bucket }
          };
          await builderCreatePuzzle(subtopicId, payload);
          const data = await builderFetchPuzzles(subtopicId);
          ui.puzzlesBySubtopic.set(subtopicId, Array.isArray(data.puzzles) ? data.puzzles : []);
          ui.expanded.puzzlesLoaded.add(subtopicId);
          ui.expanded.subtopic.add(subtopicId);
          await builderRefresh();
