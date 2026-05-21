    if (up === 'K') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          add(a.r + dr, a.c + dc);
        }
      }
      // castling
      if (turnColor === 'w' && from === 'e1') {
        if (isCastlePathSafe(state, 'w', 'g1')) moves.push({ to: 'g1', capture: false, castle: 'K' });
        if (isCastlePathSafe(state, 'w', 'c1')) moves.push({ to: 'c1', capture: false, castle: 'Q' });
      }
      if (turnColor === 'b' && from === 'e8') {
        if (isCastlePathSafe(state, 'b', 'g8')) moves.push({ to: 'g8', capture: false, castle: 'k' });
        if (isCastlePathSafe(state, 'b', 'c8')) moves.push({ to: 'c8', capture: false, castle: 'q' });
      }
      return moves;
    }

    const dirs = [];
    if (up === 'B' || up === 'Q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
    if (up === 'R' || up === 'Q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
    for (const [dr, dc] of dirs) {
      let rr = a.r + dr, cc = a.c + dc;
      while (inBounds(rr, cc)) {
        const t = board[rr][cc];
        if (!t) {
          moves.push({ to: rcToCoord(rr, cc), capture: false });
        } else {
          if (pieceColor(t) !== turnColor) moves.push({ to: rcToCoord(rr, cc), capture: true });
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return moves;
  }

  function legalMoves(state, from, turnColor) {
    const pseudo = genPseudoMoves(state, from, turnColor);
    const out = [];
    for (const m of pseudo) {
      const next = applyMoveToState(state, from, m.to, 'q');
      if (!next) continue;
      // king safety
      if (!isInCheck(next.board, turnColor)) out.push(m);
    }
    return out;
  }

  function formatMs(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function mountNormalChess(opts) {
    const rootEl = opts?.rootEl;
    if (!rootEl) return;

    const send = opts?.send || (() => {});
    const getSession = opts?.getSession || (() => null);
    const getIdentity = opts?.getIdentity || (() => ({ role: 'student', id: '' }));
    const getPlayerLabelById = opts?.getPlayerLabelById || ((id) => String(id || ''));
    const isViewer = !!opts?.viewer;
    const getViewerData = opts?.getViewerData || (() => null);
    const sessionMoveList = !!opts?.sessionMoveList;
    const getShell = typeof opts?.getShell === 'function' ? opts.getShell : null;
    const isSpectator = !!opts?.spectator;

    const UI = {
      selected: null,
      moves: [],
      lastState: null,
      localClockBase: null, // (reserved)
      viewerPly: null,
      viewerShareOpen: false,
      sessionPly: null,
      moveListScrollTop: 0,
      moveListScrollLeft: 0,
      isUserScrollingMoveList: false,
      moveListScrollEndTimer: null
      ,
      lastGameOverKey: null,
      gameOverDismissedKey: null
    };

    function bindTap(el, fn) {
      if (!el || typeof fn !== 'function') return;
      let lastTs = 0;
      const wrapped = (e) => {
        const now = Date.now();
        // Prevent double-fire (pointerup + click) and reduce iOS "needs 2 taps" issues
        if (now - lastTs < 350) return;
        lastTs = now;
        try { e.preventDefault?.(); } catch {}
        fn(e);
      };
      try { el.addEventListener('pointerup', wrapped, { passive: false }); } catch {}
      try { el.addEventListener('click', wrapped, { passive: false }); } catch {}
    }
    let pendingPromotion = null; // { from, to, isDrag }

    let tickTimer = null;
    let drag = null; // { from, ghostEl, originEl }

    function stopTick() {
      if (tickTimer) clearInterval(tickTimer);
      tickTimer = null;
    }

    function updateClockOnly() {
      const state = UI.lastState;
      const session = getSession();
      if (!state || !session) return;
      // Viewer uses fixed timeline clocks; no need to tick.
      if (isViewer) return;
      if (state?.gameOver) return;

      const role = String(getIdentity()?.role || '');
      const boardNow = state?.board || initialBoard();
      const turn = String(state?.turn || 'w');
      const myColor = myColorFromSession(session);

      // derive clocks locally between syncs
      const now = Date.now();
      let wMs = Number(state?.clocks?.wMs ?? 0);
      let bMs = Number(state?.clocks?.bMs ?? 0);
      const turnStartTs = Number(state?.turnStartTs ?? now);
      const elapsed = Math.max(0, now - turnStartTs);
      if (turn === 'w') wMs = Math.max(0, wMs - elapsed);
      else bMs = Math.max(0, bMs - elapsed);

      const cfg = session?.config || {};
      const whiteId = String(cfg.whiteStudentId || '');
      const blackId = String(cfg.blackStudentId || '');
      const whiteName = getPlayerLabelById(whiteId) || 'White';
      const blackName = getPlayerLabelById(blackId) || 'Black';

      const topColor = myColor === 'b' ? 'w' : 'b';
      const bottomColor = myColor === 'b' ? 'b' : 'w';
      const topName = topColor === 'w' ? whiteName : blackName;
      const bottomName = bottomColor === 'w' ? whiteName : blackName;
      const topMs = topColor === 'w' ? wMs : bMs;
      const bottomMs = bottomColor === 'w' ? wMs : bMs;

      const activeTop = turn === topColor;
      const activeBottom = turn === bottomColor;

      const topTimerEl = rootEl.querySelector('#ncTimerTop');
      const bottomTimerEl = rootEl.querySelector('#ncTimerBottom');
      const topTimeEl = rootEl.querySelector('#ncTimerTopTime');
      const bottomTimeEl = rootEl.querySelector('#ncTimerBottomTime');
      const topNameEl = rootEl.querySelector('#ncTimerTopName');
      const bottomNameEl = rootEl.querySelector('#ncTimerBottomName');

      if (topNameEl) topNameEl.textContent = String(topName || '');
      if (bottomNameEl) bottomNameEl.textContent = String(bottomName || '');
      if (topTimeEl) topTimeEl.textContent = String(formatMs(topMs));
      if (bottomTimeEl) bottomTimeEl.textContent = String(formatMs(bottomMs));

      if (topTimerEl) topTimerEl.classList.toggle('active', !!activeTop);
      if (bottomTimerEl) bottomTimerEl.classList.toggle('active', !!activeBottom);

      // Avoid unused var lint in some environments (boardNow used for potential future patches)
      void boardNow;
      void role;
    }

    function startTick() {
      stopTick();
      tickTimer = setInterval(() => {
        updateClockOnly();
      }, 250);
    }

    function optimisticUpdateClocks(state, incrementSec) {
      const now = Date.now();
      const turn = String(state.turn || 'w');
      const elapsed = Math.max(0, now - Number(state.turnStartTs || now));
      const wMs0 = Number(state.clocks?.wMs ?? 0);
      const bMs0 = Number(state.clocks?.bMs ?? 0);
      const wMs = turn === 'w' ? Math.max(0, wMs0 - elapsed) : wMs0;
      const bMs = turn === 'b' ? Math.max(0, bMs0 - elapsed) : bMs0;
      state.clocks = { wMs, bMs };
      // add increment to mover
      if (turn === 'w') state.clocks.wMs += incrementSec * 1000;
      else state.clocks.bMs += incrementSec * 1000;
      state.turnStartTs = now;
    }

    function sendMoveOptimistic(from, to, promo) {
      const session = getSession();
      if (!session || !UI.lastState) return;
      const sessionId = String(session.id || '');
      const inc = Math.max(0, Math.min(60, Number(session?.config?.incrementSec) || 0));

      // Build an optimistic next state so the piece doesn't "snap back" before server sync arrives.
      const base = UI.lastState;
      const baseState = {
        ...base,
        board: base.board || initialBoard(),
        castling: base.castling || 'KQkq',
        ep: base.ep || null,
        clocks: base.clocks || { wMs: 0, bMs: 0 },
        turnStartTs: base.turnStartTs || Date.now()
      };
      const applied = applyMoveToState(baseState, from, to, promo);
      if (applied) {
        optimisticUpdateClocks(baseState, inc);
        baseState.board = applied.board;
        baseState.castling = applied.castling;
        baseState.ep = applied.ep;
        baseState.turn = opposite(String(base.turn || 'w'));
        baseState.moveNumber = Number(base.moveNumber || 1) + 1;
        UI.lastState = baseState;
      }

      send({ type: 'vcp_chess_move', sessionId, from, to, promo: promo || 'q' });
      render(UI.lastState);
    }

    function clearDrag() {
      if (!drag) return;
      try { drag.originEl?.classList?.remove('nc-drag-origin'); } catch {}
      try { document.getElementById('ncBoard')?.classList?.remove('nc-dragging'); } catch {}
      try { drag.ghostEl?.remove?.(); } catch {}
      drag = null;
    }

    function findSquareElAtClientPoint(x, y) {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const sq = el.closest?.('.nc-square[data-coord]');
      return sq || null;
    }

    function beginDrag(fromCoord, pieceChar, originEl) {
      clearDrag();
      const ghost = document.createElement('img');
      ghost.className = 'nc-drag-ghost';
      ghost.alt = PIECE_UNICODE[pieceChar] || pieceChar;
      ghost.src = pieceImagePath(pieceChar);
      ghost.draggable = false;
      document.body.appendChild(ghost);

      originEl.classList.add('nc-drag-origin');
      document.getElementById('ncBoard')?.classList?.add('nc-dragging');
      drag = { from: fromCoord, ghostEl: ghost, originEl };
    }

    function moveGhost(x, y) {
      if (!drag?.ghostEl) return;
      drag.ghostEl.style.left = `${x}px`;
      drag.ghostEl.style.top = `${y}px`;
    }

    function myColorFromSession(session) {
      const id = String(getIdentity()?.id || '');
      const cfg = session?.config || {};
      if (String(cfg.whiteStudentId) === id) return 'w';
      if (String(cfg.blackStudentId) === id) return 'b';
      return null;
    }

    function clampInt(n, lo, hi) {
      const x = Number.isFinite(Number(n)) ? Math.floor(Number(n)) : lo;
      return Math.max(lo, Math.min(hi, x));
    }

    function buildMovesTableHtml(sanMoves, activePly, lastPly) {
      const moves = Array.isArray(sanMoves) ? sanMoves.map(String) : [];
      const totalPlies = moves.length;
      const lastMovePly = clampInt(activePly, 0, Math.max(0, lastPly)) - 1; // -1 means start position
      const activeIndex = lastMovePly; // 0-based move index in sanMoves
      const rows = [];
      const totalMoves = Math.ceil(totalPlies / 2);
      for (let m = 1; m <= totalMoves; m++) {
        const wi = (m - 1) * 2;
        const bi = wi + 1;
        const w = moves[wi] || '';
        const b = moves[bi] || '';
        const wActive = activeIndex === wi;
        const bActive = activeIndex === bi;
        // Clicking a cell jumps to the ply AFTER that move is applied (ply = index+1)
        rows.push(`
          <div class="nc-move-row" role="row">
            <div class="nc-move-no" role="cell">${m}.</div>
            <button class="nc-move-cell ${wActive ? 'active' : ''}" type="button" data-ply="${wi + 1}" ${w ? '' : 'disabled'}>${escapeHtml(w || '')}</button>
            <button class="nc-move-cell ${bActive ? 'active' : ''}" type="button" data-ply="${bi + 1}" ${b ? '' : 'disabled'}>${escapeHtml(b || '')}</button>
          </div>
        `);
      }
      if (!rows.length) {
        return `<div class="nc-move-empty">No moves.</div>`;
      }
      return `
        <div class="nc-move-table" role="table" aria-label="Move list">
          <div class="nc-move-head" role="rowgroup">
            <div class="nc-move-row head" role="row">
              <div class="nc-move-no" role="columnheader">Move</div>
              <div class="nc-move-col" role="columnheader">White</div>
              <div class="nc-move-col" role="columnheader">Black</div>
            </div>
          </div>
          <div class="nc-move-body" role="rowgroup">
            ${rows.join('')}
          </div>
        </div>
      `;
    }

    function render(state) {
      // Preserve move list scroll position across full re-renders (the UI rebuilds frequently for clocks).
      try {
        const prevList = rootEl.querySelector('#ncMoveList');
        if (prevList) {
          UI.moveListScrollTop = prevList.scrollTop || 0;
          UI.moveListScrollLeft = prevList.scrollLeft || 0;
        }
      } catch {}

      UI.lastState = state;
      const session = getSession();
      if (!session) return;

      const role = String(getIdentity()?.role || '');
      const viewerData = isViewer ? (getViewerData?.() || null) : null;
      const timelineBoards = Array.isArray(viewerData?.timelineBoards) ? viewerData.timelineBoards : null;
      const timelineClocks = Array.isArray(viewerData?.timelineClocks) ? viewerData.timelineClocks : null;
      const sanMoves = Array.isArray(viewerData?.sanMoves) ? viewerData.sanMoves : [];
      const pgn = String(viewerData?.pgn || '') || buildPgnFallbackFromSan(sanMoves);

      const sessionHist = Array.isArray(state?.history) ? state.history : [];
      const sessionSanMoves = sessionMoveList
        ? sessionHist.map((m) => String(m?.san || '')).filter(Boolean)
        : [];
      const sessionLastPly = sessionMoveList ? sessionSanMoves.length : 0;
      if (sessionMoveList && (UI.sessionPly === null || UI.sessionPly === undefined)) {
        UI.sessionPly = sessionLastPly;
      }
      // If user stays at latest, keep following new moves
      if (sessionMoveList && Number(UI.sessionPly) === (sessionLastPly - 1)) {
        // (handled below by clamp)
      }
      const sessionPly = sessionMoveList ? clampInt(UI.sessionPly, 0, sessionLastPly) : 0;

      const lastMove = Array.isArray(state?.history) && state.history.length ? state.history[state.history.length - 1] : null;
      const lastFrom = lastMove && typeof lastMove === 'object' ? String(lastMove.from || '') : '';
      const lastTo = lastMove && typeof lastMove === 'object' ? String(lastMove.to || '') : '';

      const viewerLastPly = timelineBoards && timelineBoards.length ? Math.max(0, timelineBoards.length - 1) : 0;
      if (isViewer && timelineBoards && timelineBoards.length && (UI.viewerPly === null || UI.viewerPly === undefined)) {
        UI.viewerPly = viewerLastPly; // default: last position
      }
      const viewerPly = isViewer && timelineBoards && timelineBoards.length ? clampInt(UI.viewerPly, 0, viewerLastPly) : 0;

      // For viewer: override board & clocks by selected ply; freeze game state.
      const board = (isViewer && timelineBoards && timelineBoards.length)
        ? (timelineBoards[viewerPly] || initialBoard())
        : (state?.board || initialBoard());
      const turn = String(state?.turn || 'w');
      const myColor = myColorFromSession(session);
      const isPlayerRole = (role === 'student' || role === 'teacher');
      const canMove = isPlayerRole && !isViewer && !isSpectator && myColor && myColor === turn && !state?.gameOver;
      const flip = !isViewer && !isSpectator && isPlayerRole && myColor === 'b';
      const castling = String(state?.castling || 'KQkq');
      const ep = state?.ep ? String(state.ep) : '';
      const drawOffer = state?.drawOffer && typeof state.drawOffer === 'object' ? state.drawOffer : null;
      const cfg = session?.config || {};
      const whiteId = String(cfg.whiteStudentId || '');
      const blackId = String(cfg.blackStudentId || '');
      const whiteName = getPlayerLabelById(whiteId) || 'White';
      const blackName = getPlayerLabelById(blackId) || 'Black';

      // derive clocks locally between syncs
      const now = Date.now();
      let wMs = Number(state?.clocks?.wMs ?? 0);
      let bMs = Number(state?.clocks?.bMs ?? 0);
      const turnStartTs = Number(state?.turnStartTs ?? now);
      const elapsed = Math.max(0, now - turnStartTs);
      if (!state?.gameOver) {
        if (turn === 'w') wMs = Math.max(0, wMs - elapsed);
        else bMs = Math.max(0, bMs - elapsed);
      }
      if (isViewer && timelineBoards && timelineBoards.length) {
        const c = timelineClocks && timelineClocks[viewerPly] ? timelineClocks[viewerPly] : null;
        if (c) {
          wMs = Number(c.wMs || 0);
          bMs = Number(c.bMs || 0);
        }
      }

      const topColor = myColor === 'b' ? 'w' : 'b';
      const bottomColor = myColor === 'b' ? 'b' : 'w';
      const topName = topColor === 'w' ? whiteName : blackName;
      const bottomName = bottomColor === 'w' ? whiteName : blackName;
      const topMs = topColor === 'w' ? wMs : bMs;
      const bottomMs = bottomColor === 'w' ? wMs : bMs;
      const activeTop = !state?.gameOver && turn === topColor;
      const activeBottom = !state?.gameOver && turn === bottomColor;

      const myDrawOffer = isPlayerRole && myColor && drawOffer && String(drawOffer.from) === String(myColor);
      const opponentDrawOffer = isPlayerRole && myColor && drawOffer && String(drawOffer.from) && String(drawOffer.from) !== String(myColor);

      const squaresHtml = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const srcR = flip ? (7 - r) : r;
          const srcC = flip ? (7 - c) : c;
          const coord = rcToCoord(srcR, srcC);
          const light = (r + c) % 2 === 0;
          const p = board[srcR][srcC];
          const isSel = UI.selected === coord;
          const mv = UI.moves.find(x => x.to === coord);
          const isDragOrigin = !!(drag && drag.from && String(drag.from) === String(coord));
          const isLastFrom = !!(lastFrom && coord === lastFrom);
          const isLastTo = !!(lastTo && coord === lastTo);
          const cls = [
            'nc-square',
            light ? 'light' : 'dark',
            isSel ? 'nc-selected' : '',
            isDragOrigin ? 'nc-drag-origin' : '',
            isLastFrom ? 'nc-last-from' : '',
            isLastTo ? 'nc-last-to' : '',
            mv ? (mv.capture ? 'nc-move nc-capture' : 'nc-move') : ''
          ].filter(Boolean).join(' ');
          const epTarget = ep && coord === ep && p === '' && canCaptureEnPassant(board, ep, turn);
          const fileLabel = (r === 7) ? String(coord[0] || '') : '';
          const rankLabel = (c === 0) ? String(coord[1] || '') : '';
          squaresHtml.push(`
            <div class="${cls}" data-coord="${coord}">
              ${p ? `<img class="nc-piece-img" draggable="false" alt="${PIECE_UNICODE[p] || p}" src="${pieceImagePath(p)}">` : ''}
              ${rankLabel ? `<div class="nc-coord nc-coord-rank">${escapeHtml(rankLabel)}</div>` : ''}
              ${fileLabel ? `<div class="nc-coord nc-coord-file">${escapeHtml(fileLabel)}</div>` : ''}
              ${epTarget ? `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none;"><div style="width:14%; height:14%; border-radius:999px; background: rgba(239,68,68,0.9);"></div></div>` : ''}
            </div>
          `);
        }
      }

      const modeCls = isViewer ? 'nc-mode-viewer' : (sessionMoveList ? 'nc-mode-session' : '');
      let sidebarCollapsed = true; // default to showing move list if shell state isn't provided
      try {
        const shell = getShell ? getShell() : null;
        if (shell && typeof shell === 'object' && 'sidebarCollapsed' in shell) {
          sidebarCollapsed = !!shell.sidebarCollapsed;
        }
      } catch {}
