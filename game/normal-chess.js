(function () {
  // Normal Chess module (MVP)
  // - 8x8 standard chess
  // - Click-to-move, highlights legal moves
  // - No castling, no en-passant; auto-promotion to Queen
  // - King safety enforced (cannot move into/leave check)
  // - State is server-authoritative; this module renders and sends moves

  const PIECE_UNICODE = {
    P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
    p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚'
  };

  const FILES = 'abcdefgh';

  function pieceImagePath(p) {
    if (!p) return '';
    const color = p === p.toUpperCase() ? 'white' : 'black';
    const t = p.toLowerCase();
    const name =
      t === 'p' ? 'Pawn' :
      t === 'n' ? 'Knight' :
      t === 'b' ? 'Bishop' :
      t === 'r' ? 'Rook' :
      t === 'q' ? 'Queen' :
      t === 'k' ? 'King' : '';
    if (!name) return '';
    return `/game/pieces/${color}_${name}.png`;
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function coordToRc(coord) {
    const f = FILES.indexOf(String(coord || '')[0]);
    const rank = Number(String(coord || '')[1] || 0);
    if (f < 0 || rank < 1 || rank > 8) return null;
    // r=0 is rank 8 (top), r=7 is rank 1 (bottom)
    return { r: 8 - rank, c: f };
  }

  function rcToCoord(r, c) {
    return `${FILES[c]}${8 - r}`;
  }

  function pieceColor(p) {
    if (!p) return null;
    return p === p.toUpperCase() ? 'w' : 'b';
  }

  function opposite(color) {
    return color === 'w' ? 'b' : 'w';
  }

  function initialBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(''));
    const backW = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    const backB = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    b[7] = backW.slice();
    b[6] = Array(8).fill('P');
    b[0] = backB.slice();
    b[1] = Array(8).fill('p');
    return b;
  }

  function findKing(board, color) {
    const target = color === 'w' ? 'K' : 'k';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c] === target) return { r, c };
      }
    }
    return null;
  }

  function isSquareAttacked(board, r, c, byColor) {
    // Pawns
    const pawnDir = byColor === 'w' ? -1 : 1;
    const pawn = byColor === 'w' ? 'P' : 'p';
    for (const dc of [-1, 1]) {
      const rr = r + pawnDir;
      const cc = c + dc;
      if (inBounds(rr, cc) && board[rr][cc] === pawn) return true;
    }

    // Knights
    const knight = byColor === 'w' ? 'N' : 'n';
    const kD = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of kD) {
      const rr = r + dr, cc = c + dc;
      if (inBounds(rr, cc) && board[rr][cc] === knight) return true;
    }

    // King
    const king = byColor === 'w' ? 'K' : 'k';
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (inBounds(rr, cc) && board[rr][cc] === king) return true;
      }
    }

    // Sliding pieces (rook/queen)
    const rook = byColor === 'w' ? 'R' : 'r';
    const queen = byColor === 'w' ? 'Q' : 'q';
    const bishop = byColor === 'w' ? 'B' : 'b';

    const lines = [
      [-1, 0], [1, 0], [0, -1], [0, 1], // rook lines
      [-1, -1], [-1, 1], [1, -1], [1, 1] // bishop lines
    ];

    for (const [dr, dc] of lines) {
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc)) {
        const p = board[rr][cc];
        if (p) {
          const col = pieceColor(p);
          if (col === byColor) {
            const up = p.toUpperCase();
            if ((dr === 0 || dc === 0) && (up === 'R' || up === 'Q')) return true;
            if ((dr !== 0 && dc !== 0) && (up === 'B' || up === 'Q')) return true;
          }
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  }

  function isInCheck(board, color) {
    const k = findKing(board, color);
    if (!k) return false;
    return isSquareAttacked(board, k.r, k.c, opposite(color));
  }

  function applyMove(board, from, to, promo) {
    const b = cloneBoard(board);
    const a = coordToRc(from);
    const z = coordToRc(to);
    if (!a || !z) return null;
    const p = b[a.r][a.c];
    b[a.r][a.c] = '';
    let placed = p;
    // promotion (only pawn reaching last rank)
    if ((p === 'P' && z.r === 0) || (p === 'p' && z.r === 7)) {
      placed = (pieceColor(p) === 'w') ? 'Q' : 'q';
      if (promo && typeof promo === 'string') {
        const up = promo.toLowerCase();
        const allow = ['q', 'r', 'b', 'n'];
        if (allow.includes(up)) placed = pieceColor(p) === 'w' ? up.toUpperCase() : up;
      }
    }
    b[z.r][z.c] = placed;
    return b;
  }

  function genPseudoMoves(board, from, turnColor) {
    const a = coordToRc(from);
    if (!a) return [];
    const p = board[a.r][a.c];
    if (!p || pieceColor(p) !== turnColor) return [];
    const moves = [];
    const up = p.toUpperCase();

    const add = (rr, cc) => {
      if (!inBounds(rr, cc)) return;
      const t = board[rr][cc];
      if (!t) moves.push({ to: rcToCoord(rr, cc), capture: false });
      else if (pieceColor(t) !== turnColor) moves.push({ to: rcToCoord(rr, cc), capture: true });
    };

    if (up === 'P') {
      const dir = turnColor === 'w' ? -1 : 1;
      const startRow = turnColor === 'w' ? 6 : 1;
      const oneR = a.r + dir;
      if (inBounds(oneR, a.c) && !board[oneR][a.c]) {
        moves.push({ to: rcToCoord(oneR, a.c), capture: false });
        const twoR = a.r + dir * 2;
        if (a.r === startRow && inBounds(twoR, a.c) && !board[twoR][a.c]) {
          moves.push({ to: rcToCoord(twoR, a.c), capture: false });
        }
      }
      // captures
      for (const dc of [-1, 1]) {
        const rr = a.r + dir;
        const cc = a.c + dc;
        if (!inBounds(rr, cc)) continue;
        const t = board[rr][cc];
        if (t && pieceColor(t) !== turnColor) moves.push({ to: rcToCoord(rr, cc), capture: true });
      }
      return moves;
    }

    if (up === 'N') {
      const d = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of d) add(a.r + dr, a.c + dc);
      return moves;
    }

    if (up === 'K') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          add(a.r + dr, a.c + dc);
        }
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

  function legalMoves(board, from, turnColor) {
    const pseudo = genPseudoMoves(board, from, turnColor);
    const out = [];
    for (const m of pseudo) {
      const next = applyMove(board, from, m.to);
      if (!next) continue;
      // king safety
      if (!isInCheck(next, turnColor)) out.push(m);
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

    const UI = {
      selected: null,
      moves: [],
      lastState: null,
      localClockBase: null // { wMs, bMs, turn, atTs }
    };

    function myColorFromSession(session) {
      const id = String(getIdentity()?.id || '');
      const cfg = session?.config || {};
      if (String(cfg.whiteStudentId) === id) return 'w';
      if (String(cfg.blackStudentId) === id) return 'b';
      return null;
    }

    function render(state) {
      UI.lastState = state;
      const session = getSession();
      if (!session) return;

      const board = state?.board || initialBoard();
      const turn = String(state?.turn || 'w');
      const myColor = myColorFromSession(session);
      const role = String(getIdentity()?.role || '');
      const canMove = role === 'student' && myColor && myColor === turn && !state?.gameOver;

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

      const squaresHtml = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const coord = rcToCoord(r, c);
          const light = (r + c) % 2 === 0;
          const p = board[r][c];
          const isSel = UI.selected === coord;
          const mv = UI.moves.find(x => x.to === coord);
          const cls = [
            'nc-square',
            light ? 'light' : 'dark',
            isSel ? 'nc-selected' : '',
            mv ? (mv.capture ? 'nc-move nc-capture' : 'nc-move') : ''
          ].filter(Boolean).join(' ');
          squaresHtml.push(`
            <div class="${cls}" data-coord="${coord}">
              ${p ? `<img class="nc-piece-img" draggable="false" alt="${PIECE_UNICODE[p] || p}" src="${pieceImagePath(p)}">` : ''}
            </div>
          `);
        }
      }

      rootEl.innerHTML = `
        <div class="nc-root">
          <div class="nc-top">
            <div class="nc-pill"><span style="opacity:.7;">Turn</span> <strong>${turn === 'w' ? 'White' : 'Black'}</strong></div>
            <div class="nc-pill nc-clock">
              <span style="opacity:.7;">White</span> <strong>${formatMs(wMs)}</strong>
              <span style="opacity:.7;">| Black</span> <strong>${formatMs(bMs)}</strong>
            </div>
            <div class="nc-pill"><span style="opacity:.7;">You</span> <strong>${role === 'teacher' ? 'Teacher (spectator)' : (myColor ? (myColor === 'w' ? 'White' : 'Black') : 'Spectator')}</strong></div>
          </div>

          <div class="nc-board" id="ncBoard">
            ${squaresHtml.join('')}
          </div>

          <div class="nc-status">
            ${state?.gameOver ? `<strong>Game over:</strong> ${String(state.gameOverReason || 'ended')}` : (canMove ? 'Your move.' : 'Waiting…')}
          </div>

          <div class="nc-actions">
            <button class="btn btn-secondary" type="button" id="ncClearSel">Clear selection</button>
          </div>
        </div>
      `;

      rootEl.querySelector('#ncClearSel')?.addEventListener('click', () => {
        UI.selected = null;
        UI.moves = [];
        render(UI.lastState);
      });

      rootEl.querySelectorAll('.nc-square[data-coord]').forEach((el) => {
        el.addEventListener('click', () => {
          const coord = el.getAttribute('data-coord');
          if (!coord) return;
          if (!UI.lastState) return;
          const sessionId = String(session?.id || '');
          const boardNow = UI.lastState.board || initialBoard();
          const turnNow = String(UI.lastState.turn || 'w');

          const rc = coordToRc(coord);
          const piece = rc ? boardNow[rc.r][rc.c] : '';
          const pc = pieceColor(piece);

          // if selecting own piece
          if (canMove && piece && pc === myColor) {
            UI.selected = coord;
            UI.moves = legalMoves(boardNow, coord, myColor);
            render(UI.lastState);
            return;
          }

          // if moving to a highlighted square
          if (canMove && UI.selected && UI.moves.some(m => m.to === coord)) {
            const from = UI.selected;
            UI.selected = null;
            UI.moves = [];
            // send to server (server validates)
            send({ type: 'vcp_chess_move', sessionId, from, to: coord, promo: 'q' });
            render(UI.lastState);
            return;
          }

          // default clear
          UI.selected = null;
          UI.moves = [];
          render(UI.lastState);
        });
      });
    }

    function applyState(state) {
      render(state);
    }

    // public API
    return { applyState };
  }

  window.NormalChess = { mountNormalChess };
})();


