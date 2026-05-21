            setMsg('err', 'Wrong. Engine replied.');
          }
          renderRunner();
        } catch (e) {
          setMsg('err', e?.message || String(e));
        } finally {
          try { toastHide(); } catch {}
          ui.student.runner.busy = false;
        }
      }

      async function applyStudentMove(from, to) {
        const pz0 = currentPuzzle();
        const isTryAgain0 = pz0 ? !!ui.student.tryAgainByPuzzleId?.[String(pz0.id)] : false;
        if (pz0?.completed && !isTryAgain0) return;
        if (ui.student.runner.busy) return;
        const f = String(from || '').trim();
        const t = String(to || '').trim();
        if (!f || !t) return;
        if (f === t) return renderRunner();

        // Prevent "drop anywhere then rollback": do a pseudo-legal validation before optimistic placement.
        if (!isPseudoLegalMove(ui.student.runner.board, ui.student.runner.side, f, t)) {
          setMsg('err', 'Illegal move');
          return renderRunner();
        }

        let didApply = false;
        ui.student.runner.busy = true;
        try {
          clearMsg();

          const fr0 = coordToRc(f);
          const tr0 = coordToRc(t);
          const beforePiece = (fr0 && ui.student.runner.board?.[fr0.r]?.[fr0.c]) ? ui.student.runner.board[fr0.r][fr0.c] : '';
          let promo = '';
          if (needsPawnPromotion(ui.student.runner.board, f, t)) {
            const picked = await openPromotionPicker(beforePiece || 'P');
            if (!picked) return; // cancelled
            promo = picked;
          }
          const uci = `${f}${t}${promo}`;

          // Save state for redo/rollback BEFORE applying.
          ui.student.runner.history.push({
            fen: ui.student.runner.fen,
            board: cloneBoard(ui.student.runner.board),
            side: ui.student.runner.side,
            movesUciLen: ui.student.runner.movesUci.length,
            movesSanLen: ui.student.runner.movesSan.length
          });

          // Optimistic UI: immediately show the piece moved on the board to avoid a blank gap while waiting for backend validation.
          // We do NOT change fen/side here; backend response remains the source of truth.
          try {
            const fr = fr0 || coordToRc(f);
            const tr = tr0 || coordToRc(t);
            const b = ui.student.runner.board;
            if (fr && tr && b?.[fr.r]?.[fr.c]) {
              const piece = b[fr.r][fr.c];
              b[fr.r][fr.c] = '';
              b[tr.r][tr.c] = promo ? promotedPieceChar(piece, promo) : piece;
              renderRunner();
            }
          } catch {}

          const r = await studentApplyMove(publicStudentId, ui.student.runner.fen, uci, publicStudentPassword);
          if (!r || !r.ok || !r.fenAfter) throw new Error('Illegal move');

          ui.student.runner.fen = String(r.fenAfter);
          ui.student.runner.board = parseFenToBoard(ui.student.runner.fen) || ui.student.runner.board;
          ui.student.runner.side = fenSideToMove(ui.student.runner.fen);
          ui.student.runner.movesUci.push(String(r.uci || uci));
          ui.student.runner.movesSan.push(String(r.san || uci));
          didApply = true;
          renderRunner();
        } catch (err) {
          // rollback history entry
          const last = ui.student.runner.history.pop();
          if (last) {
            ui.student.runner.fen = String(last.fen || ui.student.runner.fen);
            ui.student.runner.board = cloneBoard(last.board) || ui.student.runner.board;
            ui.student.runner.side = last.side || ui.student.runner.side;
          }
          setMsg('err', err?.message || String(err));
          renderRunner();
        } finally {
          ui.student.runner.busy = false;
          // Auto-submit: once the user successfully makes a move, immediately treat it as "Submit".
          if (didApply) {
            try { await submitMoveAndReply(); } catch {}
          }
        }
      }

      // Drag & drop support (pointer events; iPad/iOS friendly)
      let ignoreClickUntil = 0;
      const drag = {
        active: false,
        pointerId: null,
        from: null,
        piece: '',
        startX: 0,
        startY: 0,
        hoverEl: null,
        ghostEl: null
      };

      const clearDragHover = () => {
        try { drag.hoverEl?.classList?.remove('is-drop-target'); } catch {}
        drag.hoverEl = null;
      };

      const removeGhost = () => {
        try { drag.ghostEl?.remove(); } catch {}
        drag.ghostEl = null;
      };

      const setGhostPos = (x, y) => {
        if (!drag.ghostEl) return;
        const size = 56;
        drag.ghostEl.style.transform = `translate(${Math.round(x - size / 2)}px, ${Math.round(y - size / 2)}px)`;
      };

      const coordFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        const sq = el && el.closest ? el.closest('[data-stu-sq]') : null;
        const coord = sq ? String(sq.getAttribute('data-stu-sq') || '').trim() : '';
        return coord || null;
      };

      const squareElFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el && el.closest ? el.closest('[data-stu-sq]') : null;
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

        const boardHost = modal.querySelector('#tfStuRunnerBoard');
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
        const boardHost = modal.querySelector('#tfStuRunnerBoard');
        boardHost?.classList?.remove('is-dragging');
      };

      modal.addEventListener('pointerdown', (ev) => {
        if (!(ev.target instanceof Element)) return;
        const sq = ev.target.closest('[data-stu-sq]');
        if (!sq) return;
        if (ui.student.runner.busy) return;
        const from = String(sq.getAttribute('data-stu-sq') || '').trim();
        if (!from) return;
        const rc = coordToRc(from);
        const piece = rc ? (ui.student.runner.board?.[rc.r]?.[rc.c] || '') : '';
        if (!piece) return; // only drag if there's a piece

        // Don't immediately start drag. On iPad, immediate preventDefault/startDrag often breaks,
        // and it also blocks tap-to-move. Instead, start dragging only after a small movement threshold.
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

        // If not dragging yet, check threshold and start drag.
        if (!drag.active) {
          const dx = ev.clientX - drag.startX;
          const dy = ev.clientY - drag.startY;
          if ((dx * dx + dy * dy) < (9 * 9)) return; // ~9px threshold
          ignoreClickUntil = Date.now() + 400;
          startDrag(drag.from, drag.piece, ev.clientX, ev.clientY, ev.pointerId);
          ui.student.runner.selectedFrom = drag.from;
          renderRunner(); // hide source piece immediately
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
        // If we never crossed the threshold, this was a tap; let the normal click handler handle tap-to-move.
        if (!drag.active) {
          drag.pointerId = null;
          drag.from = null;
          drag.piece = '';
          drag.startX = 0;
          drag.startY = 0;
          return;
        }
        const from = drag.from;
        const to = coordFromPoint(ev.clientX, ev.clientY);
        endDrag();
        ui.student.runner.selectedFrom = null;
        if (!from || !to || from === to) return renderRunner();
        applyStudentMove(from, to);
      });

      modal.addEventListener('pointercancel', (ev) => {
        if (drag.pointerId !== ev.pointerId) return;
        if (drag.active) {
          endDrag();
          ui.student.runner.selectedFrom = null;
          renderRunner();
          return;
        }
        // pending tap - just clear pending state
        drag.pointerId = null;
        drag.from = null;
        drag.piece = '';
        drag.startX = 0;
        drag.startY = 0;
      });

      modal.addEventListener('click', (ev) => {
        if (Date.now() < ignoreClickUntil) return;
        const t = ev.target;
        if (!(t instanceof Element)) return;
        if (t.closest('[data-stu-runner-close]')) return close();
        if (t.closest('[data-stu-feedback-next]')) {
          // same as right arrow (next puzzle)
          (async () => {
            const total = Math.max(0, Number(ui.student.total || 0));
            if (!total) return;
            const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
            const nextAbs = await findNextTargetAbsIndex(cur);
            if (nextAbs == null) {
              setMsg('ok', 'No more incomplete puzzles.');
              return renderRunner();
            }
            await transitionToAbsIndex(nextAbs);
          })();
          return;
        }
        if (t.closest('[data-stu-feedback-tryagain]')) {
          // Allow practicing again on a completed puzzle: hide completed overlay/badge and restart attempt.
          (async () => {
            try {
              if (ui.student.runner.busy) return;
              const pz = currentPuzzle();
              if (!pz) return;
              ui.student.tryAgainByPuzzleId[String(pz.id)] = true;
              const total = Math.max(0, Number(ui.student.total || 0));
              if (!total) return;
              const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
              await transitionToAbsIndex(cur);
            } catch (e) {
              setMsg('err', e?.message || String(e));
              renderRunner();
            }
          })();
          return;
        }
        if (t.closest('[data-stu-feedback-redo]')) {
          // same as Redo button (restart current puzzle)
          (async () => {
            try {
              if (ui.student.runner.busy) return;
              const total = Math.max(0, Number(ui.student.total || 0));
              if (!total) return;
              const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
              await transitionToAbsIndex(cur);
            } catch (e) {
              setMsg('err', e?.message || String(e));
              renderRunner();
            }
          })();
          return;
        }
        if (t.closest('[data-stu-prev]')) {
          (async () => {
            const total = Math.max(0, Number(ui.student.total || 0));
            if (!total) return;
            const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
            await transitionToAbsIndex(cur - 1);
          })();
          return;
        }
        if (t.closest('[data-stu-next]')) {
          // Next: jump to the next not-completed / incorrect puzzle (auto-loads next pages).
          (async () => {
            const total = Math.max(0, Number(ui.student.total || 0));
            if (!total) return;
            const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
            const nextAbs = await findNextTargetAbsIndex(cur);
            if (nextAbs == null) {
              setMsg('ok', 'No more incomplete puzzles.');
              return renderRunner();
            }
            await transitionToAbsIndex(nextAbs);
          })();
          return;
        }
        if (t.closest('[data-stu-undo]')) {
          // Redo: restart this puzzle attempt (reset to start FEN, clear moves/history/verdict)
          (async () => {
            try {
              if (ui.student.runner.busy) return;
              const total = Math.max(0, Number(ui.student.total || 0));
              if (!total) return;
              const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
              await transitionToAbsIndex(cur);
            } catch (e) {
              setMsg('err', e?.message || String(e));
              renderRunner();
            }
          })();
          return;
        }
        const sq = t.closest('[data-stu-sq]');
        if (sq) {
          const coord = String(sq.getAttribute('data-stu-sq') || '').trim();
          if (!coord) return;
          if (!ui.student.runner.selectedFrom) {
            ui.student.runner.selectedFrom = coord;
            return renderRunner();
          }
          const from = ui.student.runner.selectedFrom;
          const to = coord;
          ui.student.runner.selectedFrom = null;
          return applyStudentMove(from, to);
        }
      });

      renderRunner();
    }

    // Teacher Practice runner: solve puzzles locally (no completion tracking), powered by teacherApplyMove.
    async function openTeacherRunnerModal(startAbsIndex = 0) {
      const all = Array.isArray(ui.teacher.puzzlesAll) ? ui.teacher.puzzlesAll : [];
      const total = all.length;
      if (!total) return;

      const clampAbs = (n) => Math.max(0, Math.min(total - 1, Math.trunc(Number(n || 0))));
      const loadAbs = (abs) => {
        const pz = all[abs];
        if (!pz) return false;
        const startFen = String(pz?.fen || '').trim();
        const startBoard = parseFenToBoard(startFen);
        const startSide = fenSideToMove(startFen);
        ui.teacher.runner = {
          absIndex: abs,
          movesUci: [],
          movesSan: [],
          selectedFrom: null,
          lastVerdict: null, // 'correct' | 'incorrect' | null
          solved: false, // teacher-only (UI)
          startFen,
          fen: startFen,
          board: startBoard || Array.from({ length: 8 }, () => Array(8).fill('')),
          side: startSide,
          history: [],
          lineIdx: null,
          lineUci: null,
          lineSan: null,
          busy: false
        };
        ui.teacher.runner.playerSide = startSide;
        ui.teacher.runner.orientation = (startSide === 'b') ? 'black' : 'white';
        return true;
      };

      const abs0 = clampAbs(startAbsIndex);
      if (!loadAbs(abs0)) return;

      const modal = document.createElement('div');
      modal.className = 'vcp-modal-backdrop';
      modal.innerHTML = `
        <div class="vcp-modal tf-practice-modal" role="dialog" aria-modal="true" aria-label="Practice" style="width: calc(100vw - 40px); max-width: 1100px; height: calc(100vh - 24px); max-height: 96vh;">
          <div class="vcp-modal-header">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;">
              <div>
                <div style="font-weight:900;">Practice</div>
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                  <div class="tf-muted" id="tfTeaRunnerMeta"></div>
                  <div id="tfTeaRunnerMetaBadge" class="tf-stu-meta-badge" style="display:none;"></div>
                </div>
              </div>
              <button type="button" class="btn btn-secondary" data-tea-runner-close="1">Close</button>
            </div>
          </div>
          <div class="vcp-modal-body">
            <div class="tf-practice-runner-grid">
              <div class="tf-practice-spacer">
                <div class="tf-practice-spacer-msg" style="display:none;"></div>
              </div>
              <div class="tf-practice-board-wrap">
                <div id="tfTeaRunnerFeedback" class="tf-stu-feedback" style="display:none;"></div>
                <div id="tfTeaRunnerBoard" class="tf-board" style="width:100%; aspect-ratio:1/1;"></div>
              </div>
              <div class="tf-stu-right">
                <div class="tf-stu-toprow">
                  <div class="tf-section-title" id="tfTeaRunnerTurnLabel" style="margin:0;"></div>
                </div>
                <div id="tfTeaRunnerMoves" class="tf-stu-moves"></div>
                <div id="tfTeaRunnerMsg" class="tf-builder-msg tf-stu-msg" style="display:none;"></div>
                <div class="tf-stu-actions">
                  <div class="tf-stu-actions-left">
                    <button type="button" class="btn btn-secondary" data-tea-undo="1" aria-label="Redo">↺</button>
                    <div class="tf-stu-nav" aria-label="Puzzle navigation">
                      <button type="button" class="btn btn-secondary" data-tea-prev="1" title="Previous puzzle">←</button>
                      <button type="button" class="btn btn-secondary" data-tea-next="1" title="Next puzzle">→</button>
                    </div>
                    <button type="button" class="btn btn-primary" data-tea-submit="1">Submit</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
