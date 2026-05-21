      const showPanel = isViewer || (sessionMoveList && sidebarCollapsed);
      rootEl.innerHTML = `
        <div class="nc-root">
          <div class="nc-layout ${showPanel ? 'nc-viewer' : ''} ${escapeHtml(modeCls)}">
            <div class="nc-timers">
              <div class="nc-timer ${activeTop ? 'active' : ''}" id="ncTimerTop">
                <div class="nc-timer-label"><span id="ncTimerTopName">${escapeHtml(String(topName || ''))}</span><span class="nc-dot" aria-hidden="true"></span></div>
                <div class="nc-timer-time" id="ncTimerTopTime">${escapeHtml(formatMs(topMs))}</div>
              </div>

              ${(isViewer || isSpectator) ? '' : `
                <div class="nc-actions" style="flex-direction:column;">
                  <button class="btn btn-secondary" type="button" id="ncDrawBtn" ${(!isPlayerRole || !myColor || state?.gameOver || myDrawOffer) ? 'disabled' : ''}>${myDrawOffer ? 'Draw offered' : (opponentDrawOffer ? 'Respond to draw' : 'Draw')}</button>
                  <button class="btn btn-secondary" type="button" id="ncResignBtn" ${(!isPlayerRole || !myColor || state?.gameOver) ? 'disabled' : ''}>Resign</button>
                </div>
              `}

              <div class="nc-timer ${activeBottom ? 'active' : ''}" id="ncTimerBottom">
                <div class="nc-timer-label"><span id="ncTimerBottomName">${escapeHtml(String(bottomName || ''))}</span><span class="nc-dot" aria-hidden="true"></span></div>
                <div class="nc-timer-time" id="ncTimerBottomTime">${escapeHtml(formatMs(bottomMs))}</div>
              </div>
            </div>

            <div>
              <div class="nc-board" id="ncBoard">
                ${squaresHtml.join('')}
              </div>
            </div>

            ${showPanel ? `
              <div class="nc-viewer-panel" aria-label="Game viewer panel">
                ${isViewer ? `
                  <div class="nc-viewer-toolbar" aria-label="Tools">
                    <button class="nc-icon-btn" type="button" id="ncShareBtn" aria-label="Share" title="Share">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M18 16a3 3 0 0 0-2.4 1.2l-6.3-3.3a3.4 3.4 0 0 0 0-3.8l6.3-3.3A3 3 0 1 0 15 5a3 3 0 0 0 .1.7L8.8 9A3 3 0 1 0 9 15l6.1 3.3A3 3 0 1 0 18 16Z" fill="currentColor"/>
                      </svg>
                    </button>
                    <button class="nc-icon-btn" type="button" id="ncAnalysisBtn" aria-label="Analysis" title="Analysis" disabled>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 19h16v2H4v-2Zm2-2V3h2v14H6Zm5 0V7h2v10h-2Zm5 0V11h2v6h-2Z" fill="currentColor"/>
                      </svg>
                    </button>
                  </div>
                ` : ''}
                <div class="nc-viewer-moves" id="ncMoveList">
                  ${isViewer
                    ? buildMovesTableHtml(sanMoves, viewerPly, viewerLastPly)
                    : buildMovesTableHtml(sessionSanMoves, sessionPly, sessionLastPly)
                  }
                </div>
                <div class="nc-viewer-nav" aria-label="Navigation">
                  <button class="btn btn-secondary nc-nav-btn" type="button" id="ncPrevBtn" ${(isViewer ? viewerPly : sessionPly) <= 0 ? 'disabled' : ''}>←</button>
                  <div class="nc-nav-label">${escapeHtml(String(isViewer ? viewerPly : sessionPly))} / ${escapeHtml(String(isViewer ? viewerLastPly : sessionLastPly))}</div>
                  <button class="btn btn-secondary nc-nav-btn" type="button" id="ncNextBtn" ${(isViewer ? viewerPly : sessionPly) >= (isViewer ? viewerLastPly : sessionLastPly) ? 'disabled' : ''}>→</button>
                </div>
              </div>
            ` : ''}
          </div>

          ${state?.gameOver ? `
            <div class="nc-status">
              <strong>Game over:</strong> ${escapeHtml(String(state.gameOverReason || 'ended'))}
            </div>
          ` : ''}

        </div>
      `;

      // Game over modal (Session only; viewer would be annoying since games are usually already ended)
      try {
        const key = state?.gameOver ? `${String(state.gameOverReason || 'ended')}|${String((Array.isArray(state.history) ? state.history.length : 0))}` : null;
        if (!isViewer && !isSpectator && state?.gameOver && key && UI.gameOverDismissedKey !== key) {
          UI.lastGameOverKey = key;
          const host = document.createElement('div');
          host.innerHTML = `
            <div class="vcp-modal-backdrop" id="ncGameOverBackdrop" role="presentation">
              <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Game over">
                <div class="vcp-modal-header">
                  <div class="vcp-modal-title">Game over</div>
                  <button id="ncGameOverClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
                </div>
                <div class="vcp-modal-body">
                  <div class="vcp-muted" style="margin-bottom:10px;">${escapeHtml(String(state.gameOverReason || 'ended'))}</div>
                  <div class="vcp-btn-row" style="justify-content:flex-end;">
                    <button id="ncGameOverOk" class="btn btn-primary" type="button">OK</button>
                  </div>
                </div>
              </div>
            </div>
          `;
          rootEl.appendChild(host);
          const close = () => {
            UI.gameOverDismissedKey = key;
            // remove modal nodes
            try { rootEl.querySelector('#ncGameOverBackdrop')?.remove?.(); } catch {}
          };
          bindTap(rootEl.querySelector('#ncGameOverClose'), close);
          bindTap(rootEl.querySelector('#ncGameOverOk'), close);
          rootEl.querySelector('#ncGameOverBackdrop')?.addEventListener('click', (e) => {
            if (e.target && e.target.id === 'ncGameOverBackdrop') close();
          });
        }
      } catch {}

      // Re-bind move list scroll tracking & restore scroll position
      try {
        const list = rootEl.querySelector('#ncMoveList');
        if (list) {
          list.scrollTop = Number(UI.moveListScrollTop || 0);
          list.scrollLeft = Number(UI.moveListScrollLeft || 0);
          list.addEventListener('scroll', () => {
            UI.isUserScrollingMoveList = true;
            UI.moveListScrollTop = list.scrollTop || 0;
            UI.moveListScrollLeft = list.scrollLeft || 0;
            if (UI.moveListScrollEndTimer) clearTimeout(UI.moveListScrollEndTimer);
            UI.moveListScrollEndTimer = setTimeout(() => {
              UI.isUserScrollingMoveList = false;
            }, 220);
          }, { passive: true });
        }
      } catch {}

      // After a full render, update clocks once (so the UI is correct without waiting for the next tick)
      updateClockOnly();

      if (isViewer && UI.viewerShareOpen) {
        const fenNow = buildFenFromBoard(board, viewerPly);
        const host = document.createElement('div');
        host.innerHTML = `
          <div class="vcp-modal-backdrop" id="ncShareBackdrop" role="presentation">
            <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Share">
              <div class="vcp-modal-header">
                <div class="vcp-modal-title">Share</div>
                <button id="ncShareClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
              </div>
              <div class="vcp-modal-body">
                <div class="nc-share-row">
                  <div class="nc-share-label">FEN (current position)</div>
                  <div class="nc-share-actions">
                    <button class="btn btn-secondary nc-share-copy" type="button" data-copy="fen">Copy</button>
                  </div>
                </div>
                <textarea class="nc-share-box" readonly rows="3">${escapeHtml(fenNow)}</textarea>

                <div class="nc-share-row" style="margin-top:12px;">
                  <div class="nc-share-label">PGN</div>
                  <div class="nc-share-actions">
                    <button class="btn btn-secondary nc-share-copy" type="button" data-copy="pgn">Copy</button>
                  </div>
                </div>
                <textarea class="nc-share-box" readonly rows="7">${escapeHtml(String(pgn || ''))}</textarea>
              </div>
            </div>
          </div>
        `;
        rootEl.appendChild(host);
      }

      // Promotion modal (simple)
      if (pendingPromotion && canMove) {
        const promoHost = document.createElement('div');
        promoHost.innerHTML = `
          <div class="vcp-modal-backdrop" id="ncPromoBackdrop" role="presentation">
            <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Promotion">
              <div class="vcp-modal-header">
                <div class="vcp-modal-title">Promote pawn</div>
                <button id="ncPromoClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
              </div>
              <div class="vcp-modal-body">
                <div class="vcp-muted" style="margin-bottom:10px;">Choose a piece for promotion.</div>
                <div class="vcp-btn-row" style="justify-content:flex-end;">
                  <button class="btn btn-primary" type="button" data-promo="q">Queen</button>
                  <button class="btn btn-secondary" type="button" data-promo="r">Rook</button>
                  <button class="btn btn-secondary" type="button" data-promo="b">Bishop</button>
                  <button class="btn btn-secondary" type="button" data-promo="n">Knight</button>
                </div>
              </div>
            </div>
          </div>
        `;
        rootEl.appendChild(promoHost);

        const closePromo = () => { pendingPromotion = null; render(UI.lastState); };
        rootEl.querySelector('#ncPromoClose')?.addEventListener('click', closePromo);
        rootEl.querySelector('#ncPromoBackdrop')?.addEventListener('click', (e) => {
          if (e.target && e.target.id === 'ncPromoBackdrop') closePromo();
        });
        rootEl.querySelectorAll('button[data-promo]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const promo = String(btn.getAttribute('data-promo') || 'q');
            const from = pendingPromotion.from;
            const to = pendingPromotion.to;
            pendingPromotion = null;
            sendMoveOptimistic(from, to, promo);
            render(UI.lastState);
          });
        });
      }

      // Draw offer modal (when opponent offers)
      if (opponentDrawOffer && !state?.gameOver) {
        const host = document.createElement('div');
        host.innerHTML = `
          <div class="vcp-modal-backdrop" id="ncDrawBackdrop" role="presentation">
            <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Draw offer">
              <div class="vcp-modal-header">
                <div class="vcp-modal-title">Draw offer</div>
                <button id="ncDrawClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
              </div>
              <div class="vcp-modal-body">
                <div class="vcp-muted" style="margin-bottom:10px;">Your opponent offered a draw.</div>
                <div class="vcp-btn-row" style="justify-content:flex-end;">
                  <button id="ncDrawDecline" class="btn btn-secondary" type="button">Decline</button>
                  <button id="ncDrawAccept" class="btn btn-primary" type="button">Accept</button>
                </div>
              </div>
            </div>
          </div>
        `;
        rootEl.appendChild(host);
        const sessionId = String(session?.id || '');
        const close = () => { send({ type: 'vcp_chess_draw_response', sessionId, accept: 'false' }); };
        rootEl.querySelector('#ncDrawClose')?.addEventListener('click', close);
        rootEl.querySelector('#ncDrawBackdrop')?.addEventListener('click', (e) => {
          if (e.target && e.target.id === 'ncDrawBackdrop') close();
        });
        rootEl.querySelector('#ncDrawDecline')?.addEventListener('click', close);
        rootEl.querySelector('#ncDrawAccept')?.addEventListener('click', () => {
          send({ type: 'vcp_chess_draw_response', sessionId, accept: 'true' });
        });
      }

      rootEl.querySelector('#ncDrawBtn')?.addEventListener('click', () => {
        const sessionId = String(session?.id || '');
        if (opponentDrawOffer) {
          // Clicking Draw while an opponent offer is present will accept.
          send({ type: 'vcp_chess_draw_response', sessionId, accept: 'true' });
        } else {
          send({ type: 'vcp_chess_offer_draw', sessionId });
        }
      });

      rootEl.querySelector('#ncResignBtn')?.addEventListener('click', () => {
        const sessionId = String(session?.id || '');
        send({ type: 'vcp_chess_resign', sessionId });
      });

      if (isViewer && timelineBoards && timelineBoards.length) {
        bindTap(rootEl.querySelector('#ncShareBtn'), () => {
          UI.viewerShareOpen = true;
          render(UI.lastState);
        });
        const closeShare = () => { UI.viewerShareOpen = false; render(UI.lastState); };
        bindTap(rootEl.querySelector('#ncShareClose'), closeShare);
        rootEl.querySelector('#ncShareBackdrop')?.addEventListener('click', (e) => {
          if (e.target && e.target.id === 'ncShareBackdrop') closeShare();
        });
        rootEl.querySelectorAll('button.nc-share-copy[data-copy]').forEach((btn) => {
          bindTap(btn, async () => {
            const k = String(btn.getAttribute('data-copy') || '');
            if (k === 'fen') await copyTextToClipboard(buildFenFromBoard(board, viewerPly));
            if (k === 'pgn') await copyTextToClipboard(String(pgn || ''));
          });
        });

        bindTap(rootEl.querySelector('#ncPrevBtn'), () => {
          UI.viewerPly = clampInt(Number(UI.viewerPly || 0) - 1, 0, viewerLastPly);
          render(UI.lastState);
        });
        bindTap(rootEl.querySelector('#ncNextBtn'), () => {
          UI.viewerPly = clampInt(Number(UI.viewerPly || 0) + 1, 0, viewerLastPly);
          render(UI.lastState);
        });
        rootEl.querySelectorAll('.nc-move-cell[data-ply]').forEach((btn) => {
          bindTap(btn, () => {
            const ply = Number(btn.getAttribute('data-ply') || 0);
            UI.viewerPly = clampInt(ply, 0, viewerLastPly);
            render(UI.lastState);
          });
        });
      }

      if (sessionMoveList) {
        bindTap(rootEl.querySelector('#ncPrevBtn'), () => {
          UI.sessionPly = clampInt(Number(UI.sessionPly || 0) - 1, 0, sessionLastPly);
          render(UI.lastState);
        });
        bindTap(rootEl.querySelector('#ncNextBtn'), () => {
          UI.sessionPly = clampInt(Number(UI.sessionPly || 0) + 1, 0, sessionLastPly);
          render(UI.lastState);
        });
        rootEl.querySelectorAll('.nc-move-cell[data-ply]').forEach((btn) => {
          bindTap(btn, () => {
            const ply = Number(btn.getAttribute('data-ply') || 0);
            UI.sessionPly = clampInt(ply, 0, sessionLastPly);
            render(UI.lastState);
          });
        });
      }

      rootEl.querySelectorAll('.nc-square[data-coord]').forEach((el) => {
        el.addEventListener('click', () => {
          const coord = el.getAttribute('data-coord');
          if (!coord) return;
          if (!UI.lastState) return;
          const sessionId = String(session?.id || '');
          const boardNow = UI.lastState.board || initialBoard();
          const stateNow = {
            board: boardNow,
            castling: UI.lastState.castling || 'KQkq',
            ep: UI.lastState.ep || null
          };
          const turnNow = String(UI.lastState.turn || 'w');

          const rc = coordToRc(coord);
          const piece = rc ? boardNow[rc.r][rc.c] : '';
          const pc = pieceColor(piece);

          // if selecting own piece
          if (canMove && piece && pc === myColor) {
            UI.selected = coord;
            UI.moves = legalMoves(stateNow, coord, myColor);
            render(UI.lastState);
            return;
          }

          // if moving to a highlighted square
          if (canMove && UI.selected && UI.moves.some(m => m.to === coord)) {
            const from = UI.selected;
            UI.selected = null;
            UI.moves = [];
            // promotion selection if needed
            const a = coordToRc(from);
            const z = coordToRc(coord);
            const moving = (a && UI.lastState?.board) ? String(UI.lastState.board[a.r][a.c] || '') : '';
            const needPromo = (moving === 'P' && z && z.r === 0) || (moving === 'p' && z && z.r === 7);
            if (needPromo) {
              pendingPromotion = { from, to: coord, isDrag: false };
            } else {
              sendMoveOptimistic(from, coord, 'q');
            }
            render(UI.lastState);
            return;
          }

          // default clear
          UI.selected = null;
          UI.moves = [];
          render(UI.lastState);
        });

        el.addEventListener('pointerdown', (ev) => {
          if (!canMove) return;
          if (!UI.lastState) return;
          const coord = el.getAttribute('data-coord');
          if (!coord) return;
          const boardNow = UI.lastState.board || initialBoard();
          const rc = coordToRc(coord);
          const piece = rc ? boardNow[rc.r][rc.c] : '';
          const pc = pieceColor(piece);
          if (!piece || pc !== myColor) return;

          // Select the piece and compute legal moves (no click required).
          UI.selected = coord;
          const stateNow = { board: boardNow, castling: UI.lastState.castling || 'KQkq', ep: UI.lastState.ep || null };
          UI.moves = legalMoves(stateNow, coord, myColor);
          beginDrag(coord, piece, el);
          moveGhost(ev.clientX, ev.clientY);

          try { el.setPointerCapture(ev.pointerId); } catch {}
          ev.preventDefault();

          const onMove = (e) => {
            moveGhost(e.clientX, e.clientY);
          };

          const onUp = (e) => {
            try { el.releasePointerCapture(e.pointerId); } catch {}
            window.removeEventListener('pointermove', onMove, { capture: true });
            window.removeEventListener('pointerup', onUp, { capture: true });
            window.removeEventListener('pointercancel', onUp, { capture: true });

            const sessionId = String(session?.id || '');
            const dropSq = findSquareElAtClientPoint(e.clientX, e.clientY);
            const toCoord = dropSq?.getAttribute?.('data-coord') || '';
            const from = String(drag?.from || coord);
            const ok = !!toCoord && UI.moves.some(m => m.to === toCoord);
            clearDrag();
            if (ok) {
              UI.selected = null;
              UI.moves = [];
              const a = coordToRc(from);
              const z = coordToRc(toCoord);
              const moving = (a && UI.lastState?.board) ? String(UI.lastState.board[a.r][a.c] || '') : '';
              const needPromo = (moving === 'P' && z && z.r === 0) || (moving === 'p' && z && z.r === 7);
              if (needPromo) {
                pendingPromotion = { from, to: toCoord, isDrag: true };
              } else {
                sendMoveOptimistic(from, toCoord, 'q');
              }
            }
            render(UI.lastState);
          };

          window.addEventListener('pointermove', onMove, { capture: true });
          window.addEventListener('pointerup', onUp, { capture: true });
          window.addEventListener('pointercancel', onUp, { capture: true });
          render(UI.lastState);
        });
      });
    }

    function applyState(state) {
      render(state);
    }

    // public API
    startTick();
    return {
      applyState,
      destroy: () => {
        stopTick();
        clearDrag();
        if (UI.moveListScrollEndTimer) clearTimeout(UI.moveListScrollEndTimer);
      }
    };
  }

  window.NormalChess = { mountNormalChess };
})();



