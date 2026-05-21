      return 0;
    }

    async function findNextTargetAbsIndex(fromAbsIndex) {
      const total = Math.max(0, Number(ui.student.total || 0));
      const ps = Math.max(1, Number(ui.student.pageSize || 10));
      const start = Math.max(0, Number(fromAbsIndex || 0) + 1);
      if (start >= total) return null;
      const { page: startPage, idx: startIdx } = absIndexToPage(start);
      const totalPages = Math.max(1, Math.ceil(total / ps));
      for (let p = startPage; p <= totalPages; p++) {
        const pageData = await studentEnsurePuzzlePage(p);
        const list = Array.isArray(pageData?.puzzles) ? pageData.puzzles : [];
        const i0 = (p === startPage) ? startIdx : 0;
        for (let i = i0; i < list.length; i++) {
          if (puzzleIsTarget(list[i])) return (p - 1) * ps + i;
        }
      }
      return null;
    }

    async function openStudentRunnerModal() {
      const ps = Math.max(1, Number(ui.student.pageSize || 10));
      // Ensure we know the total (load page 1 if needed).
      if (!ui.student.total) {
        await studentEnsurePuzzlePage(ui.student.page || 1);
      }
      const total = Math.max(0, Number(ui.student.total || 0));
      if (!total) return;

      let startAbs = Number(ui.student.runner?.absIndex);
      if (!Number.isFinite(startAbs)) startAbs = 0;
      startAbs = Math.max(0, Math.min(total - 1, Math.trunc(startAbs)));

      const { page: startPage, idx: startIdx } = absIndexToPage(startAbs);
      // Keep list page in sync with what the runner is showing.
      ui.student.page = startPage;
      const pageData = await studentEnsurePuzzlePage(startPage);
      ui.student.puzzles = Array.isArray(pageData?.puzzles) ? pageData.puzzles : [];

      const p0 = ui.student.puzzles[startIdx];
      if (!p0) return;
      const startFen = String(p0?.fen || '').trim();
      const startBoard = parseFenToBoard(startFen);
      const startSide = fenSideToMove(startFen);
      ui.student.runner = {
        absIndex: startAbs,
        movesUci: [],
        movesSan: [],
        selectedFrom: null,
        lastVerdict: null, // 'correct' | 'incorrect' | null (persistent until next submit)
        // board state (client-side, no legality validation)
        startFen,
        fen: startFen,
        board: startBoard || Array.from({ length: 8 }, () => Array(8).fill('')),
        side: startSide,
        history: [], // entries: { fen, board, side, movesUciLen, movesSanLen }
        // PV selection (chosen accepted line)
        lineIdx: null,
        lineUci: null,
        lineSan: null,
        busy: false
      };
      ui.student.runner.playerSide = startSide; // 'w' | 'b'
      ui.student.runner.orientation = (startSide === 'b') ? 'black' : 'white';

      const modal = document.createElement('div');
      modal.className = 'vcp-modal-backdrop';
      modal.innerHTML = `
        <div class="vcp-modal tf-practice-modal" role="dialog" aria-modal="true" aria-label="Practice" style="width: calc(100vw - 40px); max-width: 1100px; height: calc(100vh - 24px); max-height: 96vh;">
          <div class="vcp-modal-header">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;">
              <div>
                <div style="font-weight:900;">Practice</div>
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                  <div class="tf-muted" id="tfStuRunnerMeta"></div>
                  <div id="tfStuRunnerMetaBadge" class="tf-stu-meta-badge" style="display:none;">Completed</div>
                </div>
              </div>
              <button type="button" class="btn btn-secondary" data-stu-runner-close="1">Close</button>
            </div>
          </div>
          <div class="vcp-modal-body">
            <div class="tf-practice-runner-grid">
              <div class="tf-practice-spacer">
                <div id="tfStuSpacerMsg" class="tf-practice-spacer-msg"></div>
              </div>
              <div class="tf-practice-board-wrap">
                <div id="tfStuRunnerFeedback" class="tf-stu-feedback" style="display:none;"></div>
                <div id="tfStuRunnerBoard" class="tf-board" style="width:100%; aspect-ratio:1/1;"></div>
              </div>
              <div class="tf-stu-right">
                <div class="tf-stu-toprow">
                  <div class="tf-section-title" id="tfStuRunnerTurnLabel" style="margin:0;"></div>
                </div>
                <div id="tfStuRunnerMoves" class="tf-stu-moves"></div>
                <div id="tfStuRunnerMsg" class="tf-builder-msg tf-stu-msg" style="display:none;"></div>
                <div class="tf-stu-actions">
                  <div class="tf-stu-actions-left">
                    <button type="button" class="btn btn-secondary" data-stu-undo="1" aria-label="Redo">↺</button>
                    <button type="button" class="btn btn-secondary" data-stu-prev="1" title="Previous puzzle">←</button>
                    <button type="button" class="btn btn-secondary" data-stu-next="1" title="Next puzzle">→</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const close = () => { try { document.body.removeChild(modal); } catch {} };
      const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
      const fadeHost = modal.querySelector('.tf-practice-runner-grid');
      if (fadeHost) fadeHost.classList.add('tf-fade');
      let fadeToken = 0;
      const fadeDuring = async (fn) => {
        const token = ++fadeToken;
        if (fadeHost) fadeHost.classList.add('is-out');
        await wait(120);
        if (token !== fadeToken) return null;
        const out = await fn();
        if (token !== fadeToken) return out;
        if (fadeHost) {
          requestAnimationFrame(() => {
            try { fadeHost.classList.remove('is-out'); } catch {}
          });
          await wait(220);
        }
        return out;
      };
      const setMsg = (type, text) => {
        const el = modal.querySelector('#tfStuRunnerMsg');
        if (!el) return;
        el.style.display = 'block';
        el.classList.remove('ok', 'err');
        if (type === 'ok') el.classList.add('ok');
        if (type === 'err') el.classList.add('err');
        el.textContent = String(text || '');
      };
      const clearMsg = () => {
        const el = modal.querySelector('#tfStuRunnerMsg');
        if (!el) return;
        el.style.display = 'none';
        el.textContent = '';
        el.classList.remove('ok', 'err');
      };

      function renderBoardInteractive() {
        const host = modal.querySelector('#tfStuRunnerBoard');
        if (!host) return;
        const b = ui.student.runner.board;
        if (!b) { host.innerHTML = ''; return; }
        const sqs = [];
        for (let dr = 0; dr < 8; dr++) {
          for (let dc = 0; dc < 8; dc++) {
            const { r, c } = displayToBoardRc(dr, dc, ui.student.runner.orientation);
            const isDark = (dr + dc) % 2 === 1;
            const coord = rcToCoord(r, c);
            // During drag, hide the original piece on the source square (it is represented by the ghost).
            const piece = (drag?.active && drag?.from === coord) ? '' : (b[r][c] || '');
            const src = piece ? pieceImageSrc(piece) : '';
            const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
            const sel = ui.student.runner.selectedFrom === coord ? ' is-selected' : '';
            sqs.push(
              `<button type="button" class="tf-sq tf-sq-btn ${isDark ? 'dark' : 'light'}${sel}" data-stu-sq="${escapeHtml(coord)}">${img}</button>`
            );
          }
        }
        // Host is already a square 8x8 grid via .tf-board; render squares directly.
        host.innerHTML = sqs.join('');
      }

      function currentPuzzle() {
        const total = Math.max(0, Number(ui.student.total || 0));
        if (!total) return null;
        const abs = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
        const { page, idx } = absIndexToPage(abs);
        const pageData = ui.student.puzzlePages?.[String(page)];
        const list = Array.isArray(pageData?.puzzles) ? pageData.puzzles : Array.isArray(ui.student.puzzles) ? ui.student.puzzles : [];
        return list[idx] || null;
      }

      function resetRunnerToPuzzleIndex(nextIdx) {
        // Back-compat shim (should not be used anymore)
        ui.student.runner.absIndex = Math.max(0, Math.trunc(Number(nextIdx || 0)));
        return true;
      }

      async function resetRunnerToAbsIndex(nextAbs) {
        const total = Math.max(0, Number(ui.student.total || 0));
        if (!total) return false;
        const abs = Math.max(0, Math.min(total - 1, Math.trunc(Number(nextAbs || 0))));
        const { page, idx } = absIndexToPage(abs);
        ui.student.page = page;
        const pageData = await studentEnsurePuzzlePage(page);
        ui.student.puzzles = Array.isArray(pageData?.puzzles) ? pageData.puzzles : [];
        const pz = ui.student.puzzles[idx];
        if (!pz) return false;

        const startFen = String(pz?.fen || '').trim();
        const startBoard = parseFenToBoard(startFen);
        const startSide = fenSideToMove(startFen);
        ui.student.runner.absIndex = abs;
        ui.student.runner.movesUci = [];
        ui.student.runner.movesSan = [];
        ui.student.runner.selectedFrom = null;
        ui.student.runner.startFen = startFen;
        ui.student.runner.fen = startFen;
        ui.student.runner.board = startBoard || Array.from({ length: 8 }, () => Array(8).fill(''));
        ui.student.runner.side = startSide;
        ui.student.runner.history = [];
        ui.student.runner.lineIdx = null;
        ui.student.runner.lineUci = null;
        ui.student.runner.lineSan = null;
        ui.student.runner.lastVerdict = null;
        ui.student.runner.busy = false;
        ui.student.runner.playerSide = startSide;
        ui.student.runner.orientation = (startSide === 'b') ? 'black' : 'white';
        return true;
      }

      async function transitionToAbsIndex(nextAbs) {
        if (ui.student.runner.busy) return false;
        ui.student.runner.busy = true;
        try {
          const ok = await fadeDuring(() => resetRunnerToAbsIndex(nextAbs));
          if (!ok) return false;
          renderRunner();
          return true;
        } finally {
          ui.student.runner.busy = false;
        }
      }

      function renderRunner() {
        clearMsg();
        const pz = currentPuzzle();
        if (!pz) return close();
        const meta = modal.querySelector('#tfStuRunnerMeta');
        const total = Math.max(0, Number(ui.student.total || 0));
        const abs = Math.max(0, Math.min(Math.max(0, total - 1), Math.trunc(Number(ui.student.runner?.absIndex || 0))));
        if (meta) meta.textContent = `Puzzle ${abs + 1} / ${total || 0}`;
        const isTryAgain = !!ui.student.tryAgainByPuzzleId?.[String(pz.id)];
        const metaBadge = modal.querySelector('#tfStuRunnerMetaBadge');
        if (metaBadge) {
          metaBadge.classList.remove('is-ok', 'is-err');
          if (pz.completed && !isTryAgain) {
            metaBadge.textContent = 'Completed';
            metaBadge.style.display = 'inline-flex';
            // keep default green styling
          } else if (ui.student.runner.lastVerdict === 'incorrect') {
            metaBadge.textContent = 'Incorrect';
            metaBadge.style.display = 'inline-flex';
            metaBadge.classList.add('is-err');
          } else if (ui.student.runner.lastVerdict === 'correct') {
            metaBadge.textContent = 'Correct';
            metaBadge.style.display = 'inline-flex';
            metaBadge.classList.add('is-ok');
          } else {
            metaBadge.style.display = 'none';
          }
        }
        const turnEl = modal.querySelector('#tfStuRunnerTurnLabel');
        if (turnEl) {
          const side = ui.student.runner?.side;
          turnEl.textContent = (side === 'b') ? 'Black to move' : 'White to move';
        }

        // Spacer messages (top stack): subtopic message first, then puzzle message.
        const spacerMsgEl = modal.querySelector('#tfStuSpacerMsg');
        if (spacerMsgEl) {
          const subMsg = String(ui.student.subtopicMessage || '').trim();
          const pzMsg = String(pz?.message || '').trim();
          const html = [
            subMsg ? `<div class="tf-practice-spacer-msg-top">${escapeHtml(subMsg).replace(/\n/g, '<br>')}</div>` : '',
            pzMsg ? `<div class="tf-practice-spacer-msg-bottom">${escapeHtml(pzMsg).replace(/\n/g, '<br>')}</div>` : ''
          ].filter(Boolean).join('');
          spacerMsgEl.innerHTML = html;
          spacerMsgEl.style.display = html ? 'block' : 'none';
        }

        // Feedback overlay (on-board): show only when puzzle completed OR when the last verdict is incorrect.
        const fb = modal.querySelector('#tfStuRunnerFeedback');
        if (fb) {
          const verdict = ui.student.runner.lastVerdict;
          const showCompleted = !!pz.completed && !isTryAgain;
          const showIncorrect = verdict === 'incorrect';
          if (showCompleted || showIncorrect) {
            const isOk = showCompleted;
            const title = showCompleted ? 'Completed' : 'Incorrect';
            const hint = showCompleted ? 'Great job.' : 'Try again.';
            const btnHtml = showCompleted
              ? `<button type="button" class="btn btn-primary" data-stu-feedback-next="1">Next</button>
                 <button type="button" class="btn btn-secondary" data-stu-feedback-tryagain="1">Try again</button>`
              : `<button type="button" class="btn btn-secondary" data-stu-feedback-redo="1">Redo</button>`;
            fb.classList.toggle('is-ok', isOk);
            fb.classList.toggle('is-err', !isOk);
            fb.innerHTML = `
              <div class="tf-stu-feedback-box">
                <div class="tf-stu-feedback-title">${escapeHtml(title)}</div>
                <div class="tf-stu-feedback-sub">${escapeHtml(hint)}</div>
                <div class="tf-stu-feedback-actions">${btnHtml}</div>
              </div>
            `;
            fb.style.display = 'flex';
          } else {
            fb.style.display = 'none';
            fb.innerHTML = '';
            fb.classList.remove('is-ok', 'is-err');
          }
        }

        const movesEl = modal.querySelector('#tfStuRunnerMoves');
        if (movesEl) {
          const html = formatMovesWithMoveNumbersHighlightedHtml(
            ui.student.runner.startFen || pz.fen,
            ui.student.runner.movesSan,
            ui.student.runner.movesSan.length ? (ui.student.runner.movesSan.length - 1) : -1
          );
          movesEl.innerHTML = html || escapeHtml(ui.student.runner.movesUci.join(' '));
        }
        renderBoardInteractive();
      }

      function chooseAcceptedLineForFirstMove(pz, firstUci) {
        const sol = pz?.solutions && typeof pz.solutions === 'object' ? pz.solutions : {};
        const lines = Array.isArray(sol.acceptedLines) ? sol.acceptedLines : (Array.isArray(sol.lines) ? sol.lines : []);
        const uci = String(firstUci || '').trim().toLowerCase();
        for (let i = 0; i < lines.length; i++) {
          const pvUci = Array.isArray(lines[i]?.pvUci) ? lines[i].pvUci : null;
          if (!pvUci || !pvUci.length) continue;
          if (String(pvUci[0] || '').trim().toLowerCase() === uci) return { idx: i, line: lines[i] };
        }
        return null;
      }

      function uciAtPlyMatches(uciList, plyIndex, uci) {
        if (!Array.isArray(uciList)) return false;
        const want = String(uciList[plyIndex] || '').trim().toLowerCase();
        return want && want === String(uci || '').trim().toLowerCase();
      }

      async function submitMoveAndReply() {
        const pz = currentPuzzle();
        if (!pz) return;
        const isTryAgain = !!ui.student.tryAgainByPuzzleId?.[String(pz.id)];
        if (pz.completed && !isTryAgain) return;
        if (ui.student.runner.busy) return;
        const moves = ui.student.runner.movesUci.slice();
        if (!moves.length) return;

        const plyIndex = moves.length - 1;
        const studentUci = moves[plyIndex];
        const beforeBoard = ui.student.runner.history.length ? ui.student.runner.history[ui.student.runner.history.length - 1].board : null;

        // Determine correctness vs PV accepted line (choose on first move).
        if (ui.student.runner.lineIdx == null) {
          const chosen = chooseAcceptedLineForFirstMove(pz, studentUci);
          if (chosen) {
            ui.student.runner.lineIdx = chosen.idx;
            ui.student.runner.lineUci = Array.isArray(chosen.line?.pvUci) ? chosen.line.pvUci.map((x) => String(x || '').trim().toLowerCase()) : null;
            ui.student.runner.lineSan = Array.isArray(chosen.line?.pvSan) ? chosen.line.pvSan.map((x) => String(x || '').trim()) : null;
          }
        }

        const lineUci = ui.student.runner.lineUci;
        const lineSan = ui.student.runner.lineSan;
        const isCorrect = uciAtPlyMatches(lineUci, plyIndex, studentUci);

        // SAN is already appended during click-to-move via /apply-move.
        // Keep it aligned with accepted PV SAN if needed.
        if (Array.isArray(lineSan) && isCorrect) {
          ui.student.runner.movesSan = lineSan.slice(0, moves.length);
        }

        ui.student.runner.busy = true;
        try {
          clearMsg();

          if (isCorrect && Array.isArray(lineUci) && plyIndex + 1 < lineUci.length) {
            // PV reply move (computer)
            const replyUci = lineUci[plyIndex + 1];
            const r0 = await studentApplyMove(publicStudentId, ui.student.runner.fen, replyUci, publicStudentPassword);
            if (r0 && r0.ok && r0.fenAfter) {
              ui.student.runner.history.push({
                fen: ui.student.runner.fen,
                board: cloneBoard(ui.student.runner.board),
                side: ui.student.runner.side,
                movesUciLen: ui.student.runner.movesUci.length,
                movesSanLen: ui.student.runner.movesSan.length
              });
              ui.student.runner.fen = String(r0.fenAfter);
              ui.student.runner.board = parseFenToBoard(ui.student.runner.fen) || ui.student.runner.board;
              ui.student.runner.side = fenSideToMove(ui.student.runner.fen);
              ui.student.runner.movesUci.push(replyUci);
              if (Array.isArray(lineSan)) ui.student.runner.movesSan = lineSan.slice(0, ui.student.runner.movesUci.length);
              else ui.student.runner.movesSan.push(String(r0.san || replyUci));
            }
          } else if (!isCorrect) {
            // Engine reply on wrong move
            const fenNow = ui.student.runner.fen;
            toastShow('loading', 'Engine thinking...');
            const eng = await studentEngineAnalyze(publicStudentId, fenNow, { depth: getPracticeDepth(), pvPlies: 6 }, publicStudentPassword);
            const bestUci = String(eng?.bestMove || eng?.lines?.[0]?.bestMove || eng?.lines?.[0]?.pvUci?.[0] || '').trim().toLowerCase();
            if (bestUci) {
              const r1 = await studentApplyMove(publicStudentId, ui.student.runner.fen, bestUci, publicStudentPassword);
              if (r1 && r1.ok && r1.fenAfter) {
                ui.student.runner.history.push({
                  fen: ui.student.runner.fen,
                  board: cloneBoard(ui.student.runner.board),
                  side: ui.student.runner.side,
                  movesUciLen: ui.student.runner.movesUci.length,
                  movesSanLen: ui.student.runner.movesSan.length
                });
                ui.student.runner.fen = String(r1.fenAfter);
                ui.student.runner.board = parseFenToBoard(ui.student.runner.fen) || ui.student.runner.board;
                ui.student.runner.side = fenSideToMove(ui.student.runner.fen);
                ui.student.runner.movesUci.push(bestUci);
                const engSan0 = String(r1.san || (Array.isArray(eng?.lines?.[0]?.pvSan) ? (eng.lines[0].pvSan[0] || '') : '') || bestUci);
                ui.student.runner.movesSan = ui.student.runner.movesSan.concat([engSan0]);
              }
            }
            toastHide();
          }

          // Log attempt once per student submission (send the full sequence including reply move, if any)
          const last = ui.student.runner.movesUci[ui.student.runner.movesUci.length - 1];
          const out = await studentPostAttempt(publicStudentId, pz.id, {
            bucket: ui.student.bucket,
            subtopicId: ui.student.subtopicId,
            mode: (String(ui.student.puzzleSource || '') === 'ghost') ? 'ghost' : 'practice',
            movesUci: ui.student.runner.movesUci.slice(),
            plyIndex: ui.student.runner.movesUci.length - 1,
            moveUci: last
          }, publicStudentPassword);

          if (out.completed) {
            pz.completed = true;
            ui.student.runner.lastVerdict = 'correct';
            try { ui.student.verdictByPuzzleId[String(pz.id)] = 'correct'; } catch {}
            try { delete ui.student.tryAgainByPuzzleId[String(pz.id)]; } catch {}
            setMsg('ok', 'Correct. Puzzle completed.');
          } else if (out.correctPrefix) {
            ui.student.runner.lastVerdict = 'correct';
            try { ui.student.verdictByPuzzleId[String(pz.id)] = 'correct'; } catch {}
            setMsg('ok', 'Correct. Computer replied.');
          } else {
            ui.student.runner.lastVerdict = 'incorrect';
            try { ui.student.verdictByPuzzleId[String(pz.id)] = 'incorrect'; } catch {}
