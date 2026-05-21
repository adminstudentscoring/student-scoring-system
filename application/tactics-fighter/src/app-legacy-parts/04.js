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
        const el = modal.querySelector('#tfTeaRunnerMsg');
        if (!el) return;
        el.style.display = 'block';
        el.classList.remove('ok', 'err');
        if (type === 'ok') el.classList.add('ok');
        if (type === 'err') el.classList.add('err');
        el.textContent = String(text || '');
      };
      const clearMsg = () => {
        const el = modal.querySelector('#tfTeaRunnerMsg');
        if (!el) return;
        el.style.display = 'none';
        el.textContent = '';
        el.classList.remove('ok', 'err');
      };

      function currentPuzzle() {
        const abs = clampAbs(ui.teacher.runner?.absIndex);
        return all[abs] || null;
      }

      function renderBoardInteractive() {
        const host = modal.querySelector('#tfTeaRunnerBoard');
        if (!host) return;
        const b = ui.teacher.runner.board;
        if (!b) { host.innerHTML = ''; return; }
        const sqs = [];
        for (let dr = 0; dr < 8; dr++) {
          for (let dc = 0; dc < 8; dc++) {
            const { r, c } = displayToBoardRc(dr, dc, ui.teacher.runner.orientation);
            const isDark = (dr + dc) % 2 === 1;
            const coord = rcToCoord(r, c);
            const piece = (drag?.active && drag?.from === coord) ? '' : (b[r][c] || '');
            const src = piece ? pieceImageSrc(piece) : '';
            const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
            const sel = ui.teacher.runner.selectedFrom === coord ? ' is-selected' : '';
            sqs.push(
              `<button type="button" class="tf-sq tf-sq-btn ${isDark ? 'dark' : 'light'}${sel}" data-tea-sq="${escapeHtml(coord)}">${img}</button>`
            );
          }
        }
        host.innerHTML = sqs.join('');
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

      function isSolvedNow() {
        const pz = currentPuzzle();
        if (!pz) return false;
        const lineUci = ui.teacher.runner.lineUci;
        if (!Array.isArray(lineUci) || !lineUci.length) return false;
        return ui.teacher.runner.movesUci.length >= lineUci.length;
      }

      function renderRunner() {
        clearMsg();
        const pz = currentPuzzle();
        if (!pz) return close();

        const abs = clampAbs(ui.teacher.runner?.absIndex);
        const meta = modal.querySelector('#tfTeaRunnerMeta');
        if (meta) meta.textContent = `Puzzle ${abs + 1} / ${total}`;

        const metaBadge = modal.querySelector('#tfTeaRunnerMetaBadge');
        if (metaBadge) {
          metaBadge.classList.remove('is-ok', 'is-err');
          if (ui.teacher.runner.lastVerdict === 'incorrect') {
            metaBadge.textContent = 'Incorrect';
            metaBadge.style.display = 'inline-flex';
            metaBadge.classList.add('is-err');
          } else if (ui.teacher.runner.lastVerdict === 'correct') {
            metaBadge.textContent = 'Correct';
            metaBadge.style.display = 'inline-flex';
            metaBadge.classList.add('is-ok');
          } else {
            metaBadge.style.display = 'none';
          }
        }

        const turnEl = modal.querySelector('#tfTeaRunnerTurnLabel');
        if (turnEl) {
          const side = ui.teacher.runner?.side;
          turnEl.textContent = (side === 'b') ? 'Black to move' : 'White to move';
        }

        const fb = modal.querySelector('#tfTeaRunnerFeedback');
        if (fb) {
          const verdict = ui.teacher.runner.lastVerdict;
          const solved = !!ui.teacher.runner.solved;
          const showCorrectDone = solved;
          const showIncorrect = verdict === 'incorrect';
          if (showCorrectDone || showIncorrect) {
            const isOk = showCorrectDone;
            const title = showCorrectDone ? 'Correct' : 'Incorrect';
            const hint = showCorrectDone ? 'Great job.' : 'Try again.';
            const btnHtml = showCorrectDone
              ? `<button type="button" class="btn btn-primary" data-tea-feedback-next="1">Next</button>`
              : `<button type="button" class="btn btn-secondary" data-tea-feedback-redo="1">Redo</button>`;
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

        const movesEl = modal.querySelector('#tfTeaRunnerMoves');
        if (movesEl) {
          const html = formatMovesWithMoveNumbersHighlightedHtml(
            ui.teacher.runner.startFen || pz.fen,
            ui.teacher.runner.movesSan,
            ui.teacher.runner.movesSan.length ? (ui.teacher.runner.movesSan.length - 1) : -1
          );
          movesEl.innerHTML = html || escapeHtml(ui.teacher.runner.movesUci.join(' '));
        }

        renderBoardInteractive();
      }

      async function resetRunnerToAbsIndex(nextAbs) {
        const abs = clampAbs(nextAbs);
        return loadAbs(abs);
      }

      async function transitionToAbsIndex(nextAbs) {
        if (ui.teacher.runner.busy) return false;
        ui.teacher.runner.busy = true;
        try {
          const ok = await fadeDuring(() => resetRunnerToAbsIndex(nextAbs));
          if (!ok) return false;
          renderRunner();
          return true;
        } finally {
          ui.teacher.runner.busy = false;
        }
      }

      async function applyTeacherMove(from, to) {
        if (ui.teacher.runner.busy) return;
        const f = String(from || '').trim();
        const t = String(to || '').trim();
        if (!f || !t) return;
        if (f === t) return renderRunner();

        if (!isPseudoLegalMove(ui.teacher.runner.board, ui.teacher.runner.side, f, t)) {
          setMsg('err', 'Illegal move');
          return renderRunner();
        }

        ui.teacher.runner.busy = true;
        try {
          clearMsg();

          const fr0 = coordToRc(f);
          const tr0 = coordToRc(t);
          const beforePiece = (fr0 && ui.teacher.runner.board?.[fr0.r]?.[fr0.c]) ? ui.teacher.runner.board[fr0.r][fr0.c] : '';
          let promo = '';
          if (needsPawnPromotion(ui.teacher.runner.board, f, t)) {
            const picked = await openPromotionPicker(beforePiece || 'P');
            if (!picked) return; // cancelled
            promo = picked;
          }
          const uci = `${f}${t}${promo}`;

          ui.teacher.runner.history.push({
            fen: ui.teacher.runner.fen,
            board: cloneBoard(ui.teacher.runner.board),
            side: ui.teacher.runner.side,
            movesUciLen: ui.teacher.runner.movesUci.length,
            movesSanLen: ui.teacher.runner.movesSan.length
          });

          // Optimistic UI: immediately show the piece moved while backend validates.
          try {
            const fr = fr0 || coordToRc(f);
            const tr = tr0 || coordToRc(t);
            const b = ui.teacher.runner.board;
            if (fr && tr && b?.[fr.r]?.[fr.c]) {
              const piece = b[fr.r][fr.c];
              b[fr.r][fr.c] = '';
              b[tr.r][tr.c] = promo ? promotedPieceChar(piece, promo) : piece;
              renderRunner();
            }
          } catch {}

          const r = await teacherApplyMove(ui.teacher.runner.fen, uci);
          if (!r || !r.ok || !r.fenAfter) throw new Error('Illegal move');

          ui.teacher.runner.fen = String(r.fenAfter);
          ui.teacher.runner.board = parseFenToBoard(ui.teacher.runner.fen) || ui.teacher.runner.board;
          ui.teacher.runner.side = fenSideToMove(ui.teacher.runner.fen);
          ui.teacher.runner.movesUci.push(String(r.uci || uci));
          ui.teacher.runner.movesSan.push(String(r.san || uci));
          renderRunner();
        } catch (err) {
          const last = ui.teacher.runner.history.pop();
          if (last) {
            ui.teacher.runner.fen = String(last.fen || ui.teacher.runner.fen);
            ui.teacher.runner.board = cloneBoard(last.board) || ui.teacher.runner.board;
            ui.teacher.runner.side = last.side || ui.teacher.runner.side;
          }
          setMsg('err', err?.message || String(err));
          renderRunner();
        } finally {
          ui.teacher.runner.busy = false;
        }
      }

      async function submitMoveAndReply() {
        const pz = currentPuzzle();
        if (!pz) return;
        if (ui.teacher.runner.busy) return;
        const moves = ui.teacher.runner.movesUci.slice();
        if (!moves.length) return;

        const plyIndex = moves.length - 1;
        const teacherUci = moves[plyIndex];

        // Determine correctness vs PV accepted line (choose on first move).
        if (ui.teacher.runner.lineIdx == null) {
          const chosen = chooseAcceptedLineForFirstMove(pz, teacherUci);
          if (chosen) {
            ui.teacher.runner.lineIdx = chosen.idx;
            ui.teacher.runner.lineUci = Array.isArray(chosen.line?.pvUci) ? chosen.line.pvUci.map((x) => String(x || '').trim().toLowerCase()) : null;
            ui.teacher.runner.lineSan = Array.isArray(chosen.line?.pvSan) ? chosen.line.pvSan.map((x) => String(x || '').trim()) : null;
          }
        }

        const lineUci = ui.teacher.runner.lineUci;
        const lineSan = ui.teacher.runner.lineSan;
        const isCorrect = uciAtPlyMatches(lineUci, plyIndex, teacherUci);

        if (Array.isArray(lineSan) && isCorrect) {
          ui.teacher.runner.movesSan = lineSan.slice(0, moves.length);
        }

        ui.teacher.runner.busy = true;
        try {
          clearMsg();

          if (isCorrect && Array.isArray(lineUci) && plyIndex + 1 < lineUci.length) {
            // PV reply move (computer)
            const replyUci = lineUci[plyIndex + 1];
            const r0 = await teacherApplyMove(ui.teacher.runner.fen, replyUci);
            if (r0 && r0.ok && r0.fenAfter) {
              ui.teacher.runner.history.push({
                fen: ui.teacher.runner.fen,
                board: cloneBoard(ui.teacher.runner.board),
                side: ui.teacher.runner.side,
                movesUciLen: ui.teacher.runner.movesUci.length,
                movesSanLen: ui.teacher.runner.movesSan.length
              });
              ui.teacher.runner.fen = String(r0.fenAfter);
              ui.teacher.runner.board = parseFenToBoard(ui.teacher.runner.fen) || ui.teacher.runner.board;
              ui.teacher.runner.side = fenSideToMove(ui.teacher.runner.fen);
              ui.teacher.runner.movesUci.push(replyUci);
              if (Array.isArray(lineSan)) ui.teacher.runner.movesSan = lineSan.slice(0, ui.teacher.runner.movesUci.length);
              else ui.teacher.runner.movesSan.push(String(r0.san || replyUci));
            }
          } else if (!isCorrect) {
            // Engine reply on wrong move
            const fenNow = ui.teacher.runner.fen;
            const eng = await engineAnalyze(fenNow, { depth: getPracticeDepth(), pvPlies: 6, multipv: 1 });
            const bestUci = String(eng?.bestMove || eng?.lines?.[0]?.bestMove || eng?.lines?.[0]?.pvUci?.[0] || '').trim().toLowerCase();
            if (bestUci) {
              const r1 = await teacherApplyMove(ui.teacher.runner.fen, bestUci);
              if (r1 && r1.ok && r1.fenAfter) {
                ui.teacher.runner.history.push({
                  fen: ui.teacher.runner.fen,
                  board: cloneBoard(ui.teacher.runner.board),
                  side: ui.teacher.runner.side,
                  movesUciLen: ui.teacher.runner.movesUci.length,
                  movesSanLen: ui.teacher.runner.movesSan.length
                });
                ui.teacher.runner.fen = String(r1.fenAfter);
                ui.teacher.runner.board = parseFenToBoard(ui.teacher.runner.fen) || ui.teacher.runner.board;
                ui.teacher.runner.side = fenSideToMove(ui.teacher.runner.fen);
                ui.teacher.runner.movesUci.push(bestUci);
                const engSan0 = String(r1.san || (Array.isArray(eng?.lines?.[0]?.pvSan) ? (eng.lines[0].pvSan[0] || '') : '') || bestUci);
                ui.teacher.runner.movesSan = ui.teacher.runner.movesSan.concat([engSan0]);
              }
            }
          }

          if (isCorrect) {
            ui.teacher.runner.lastVerdict = 'correct';
            ui.teacher.runner.solved = isSolvedNow();
            setMsg('ok', ui.teacher.runner.solved ? 'Correct.' : 'Correct. Computer replied.');
          } else {
            ui.teacher.runner.lastVerdict = 'incorrect';
            ui.teacher.runner.solved = false;
            setMsg('err', 'Wrong. Engine replied.');
          }

          renderRunner();
        } catch (e) {
          setMsg('err', e?.message || String(e));
        } finally {
          ui.teacher.runner.busy = false;
        }
      }

      // Drag & drop support (pointer events)
      let ignoreClickUntil = 0;
      const drag = { active: false, pointerId: null, from: null, piece: '', startX: 0, startY: 0, hoverEl: null, ghostEl: null };
      const clearDragHover = () => { try { drag.hoverEl?.classList?.remove('is-drop-target'); } catch {} drag.hoverEl = null; };
      const removeGhost = () => { try { drag.ghostEl?.remove(); } catch {} drag.ghostEl = null; };
      const setGhostPos = (x, y) => {
        if (!drag.ghostEl) return;
        const size = 56;
        drag.ghostEl.style.transform = `translate(${Math.round(x - size / 2)}px, ${Math.round(y - size / 2)}px)`;
      };
      const coordFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        const sq = el && el.closest ? el.closest('[data-tea-sq]') : null;
        const coord = sq ? String(sq.getAttribute('data-tea-sq') || '').trim() : '';
        return coord || null;
      };
      const squareElFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el && el.closest ? el.closest('[data-tea-sq]') : null;
      };
      const startDrag = (from, piece, x, y, pointerId) => {
        drag.active = true;
        drag.pointerId = pointerId;
        drag.from = from;
        clearDragHover();
        removeGhost();
        const ghost = document.createElement('div');
        ghost.className = 'tf-drag-ghost';
        const src = piece ? pieceImageSrc(piece) : '';
        ghost.innerHTML = src ? `<img alt="" src="${escapeHtml(src)}">` : '';
        document.body.appendChild(ghost);
        drag.ghostEl = ghost;
        setGhostPos(x, y);
        const boardHost = modal.querySelector('#tfTeaRunnerBoard');
        boardHost?.classList?.add('is-dragging');
      };
      const endDrag = () => {
        drag.active = false;
        drag.pointerId = null;
        drag.from = null;
        drag.piece = '';
        drag.startX = 0;
        drag.startY = 0;
        clearDragHover();
        removeGhost();
        const boardHost = modal.querySelector('#tfTeaRunnerBoard');
        boardHost?.classList?.remove('is-dragging');
      };

      modal.addEventListener('pointerdown', (ev) => {
        if (!(ev.target instanceof Element)) return;
        const sq = ev.target.closest('[data-tea-sq]');
        if (!sq) return;
        if (ui.teacher.runner.busy) return;
        const from = String(sq.getAttribute('data-tea-sq') || '').trim();
        if (!from) return;
        const rc = coordToRc(from);
        const piece = rc ? (ui.teacher.runner.board?.[rc.r]?.[rc.c] || '') : '';
        if (!piece) return;

        // Start dragging only after a small movement threshold (better on iPad; keeps tap-to-move working).
        drag.active = false;
        drag.pointerId = ev.pointerId;
        drag.from = from;
        drag.piece = piece;
        drag.startX = ev.clientX;
        drag.startY = ev.clientY;
        clearDragHover();
        removeGhost();
        try { sq.setPointerCapture?.(ev.pointerId); } catch {}
      });

      modal.addEventListener('pointermove', (ev) => {
        if (drag.pointerId !== ev.pointerId) return;
        if (!drag.from) return;

        if (!drag.active) {
          const dx = ev.clientX - drag.startX;
          const dy = ev.clientY - drag.startY;
          if ((dx * dx + dy * dy) < (9 * 9)) return;
          ignoreClickUntil = Date.now() + 400;
          startDrag(drag.from, drag.piece, ev.clientX, ev.clientY, ev.pointerId);
          ui.teacher.runner.selectedFrom = drag.from;
          renderRunner();
        }

        setGhostPos(ev.clientX, ev.clientY);
        const el = squareElFromPoint(ev.clientX, ev.clientY);
        if (el !== drag.hoverEl) {
          clearDragHover();
          if (el) {
            el.classList.add('is-drop-target');
            drag.hoverEl = el;
          }
        }
      });

      modal.addEventListener('pointerup', (ev) => {
        if (drag.pointerId !== ev.pointerId) return;
