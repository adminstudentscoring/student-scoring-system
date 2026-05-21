/** Generated from normal-chess-legacy-parts/ — run pnpm refactor:concat or build:* */
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

  function copyTextToClipboard(text) {
    const t = String(text ?? '');
    if (!t) return Promise.resolve(false);
    try {
      if (navigator?.clipboard?.writeText) {
        return navigator.clipboard.writeText(t).then(() => true).catch(() => false);
      }
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return Promise.resolve(!!ok);
    } catch {}
    return Promise.resolve(false);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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
    return `/application/vchess-platform/pieces/${color}_${name}.png`;
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

  function boardToFenPlacement(board) {
    const b = Array.isArray(board) ? board : [];
    const ranks = [];
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      let out = '';
      for (let c = 0; c < 8; c++) {
        const p = (b[r] && b[r][c]) ? String(b[r][c]) : '';
        if (!p) {
          empty++;
        } else {
          if (empty) {
            out += String(empty);
            empty = 0;
          }
          out += p;
        }
      }
      if (empty) out += String(empty);
      ranks.push(out || '8');
    }
    return ranks.join('/');
  }

  function buildFenFromBoard(board, ply) {
    const placement = boardToFenPlacement(board);
    const side = (Number(ply || 0) % 2 === 0) ? 'w' : 'b';
    const castling = '-';
    const ep = '-';
    const halfmove = 0;
    const fullmove = Math.floor(Number(ply || 0) / 2) + 1;
    return `${placement} ${side} ${castling} ${ep} ${halfmove} ${fullmove}`;
  }

  function buildPgnFallbackFromSan(sanMoves) {
    const moves = Array.isArray(sanMoves) ? sanMoves.map(String) : [];
    if (!moves.length) return '';
    const out = [];
    for (let i = 0; i < moves.length; i += 2) {
      const num = Math.floor(i / 2) + 1;
      const w = moves[i] || '';
      const b = moves[i + 1] || '';
      if (b) out.push(`${num}. ${w} ${b}`);
      else out.push(`${num}. ${w}`);
    }
    return out.join(' ');
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

  function canCaptureEnPassant(board, epCoord, sideToMove) {
    if (!epCoord) return false;
    const z = coordToRc(epCoord);
    if (!z) return false;
    const epR = z.r;
    const epC = z.c;
    if (!inBounds(epR, epC)) return false;
    // Only show en-passant marker if the side to move has a pawn that can capture onto ep square.
    if (sideToMove === 'w') {
      const pawnR = epR + 1; // white pawn must be one rank below ep square
      if (!inBounds(pawnR, epC)) return false;
      if (inBounds(pawnR, epC - 1) && board[pawnR][epC - 1] === 'P') return true;
      if (inBounds(pawnR, epC + 1) && board[pawnR][epC + 1] === 'P') return true;
      return false;
    }
    if (sideToMove === 'b') {
      const pawnR = epR - 1; // black pawn must be one rank above ep square
      if (!inBounds(pawnR, epC)) return false;
      if (inBounds(pawnR, epC - 1) && board[pawnR][epC - 1] === 'p') return true;
      if (inBounds(pawnR, epC + 1) && board[pawnR][epC + 1] === 'p') return true;
      return false;
    }
    return false;
  }

  function isInCheck(board, color) {
    const k = findKing(board, color);
    if (!k) return false;
    return isSquareAttacked(board, k.r, k.c, opposite(color));
  }

  function hasCastleRight(castling, right) {
    return String(castling || '').includes(right);
  }

  function isCastleMove(piece, from, to) {
    if (!piece || piece.toUpperCase() !== 'K') return false;
    return (
      (from === 'e1' && (to === 'g1' || to === 'c1')) ||
      (from === 'e8' && (to === 'g8' || to === 'c8'))
    );
  }

  function updateCastlingRights(castling, from, to, movedPiece, capturedPiece) {
    let s = String(castling || '');
    const remove = (ch) => { s = s.replace(ch, ''); };
    if (movedPiece === 'K') { remove('K'); remove('Q'); }
    if (movedPiece === 'k') { remove('k'); remove('q'); }
    if (movedPiece === 'R') {
      if (from === 'h1') remove('K');
      if (from === 'a1') remove('Q');
    }
    if (movedPiece === 'r') {
      if (from === 'h8') remove('k');
      if (from === 'a8') remove('q');
    }
    if (capturedPiece === 'R') {
      if (to === 'h1') remove('K');
      if (to === 'a1') remove('Q');
    }
    if (capturedPiece === 'r') {
      if (to === 'h8') remove('k');
      if (to === 'a8') remove('q');
    }
    return s;
  }

  function applyMoveToState(state, from, to, promo) {
    const board = state.board;
    const a = coordToRc(from);
    const z = coordToRc(to);
    if (!a || !z) return null;
    const piece = board[a.r][a.c];
    const captured = board[z.r][z.c] || '';

    const next = {
      ...state,
      board: cloneBoard(board),
      ep: null,
      castling: String(state.castling || '')
    };

    // castling
    if (isCastleMove(piece, from, to)) {
      next.board[a.r][a.c] = '';
      next.board[z.r][z.c] = piece;
      if (to === 'g1') { next.board[7][7] = ''; next.board[7][5] = 'R'; }
      if (to === 'c1') { next.board[7][0] = ''; next.board[7][3] = 'R'; }
      if (to === 'g8') { next.board[0][7] = ''; next.board[0][5] = 'r'; }
      if (to === 'c8') { next.board[0][0] = ''; next.board[0][3] = 'r'; }
      next.castling = updateCastlingRights(next.castling, from, to, piece, captured);
      return next;
    }

    // en passant capture
    if (piece && piece.toUpperCase() === 'P' && String(state.ep || '') === to && !captured) {
      if (piece === 'P') {
        const capR = z.r + 1;
        if (inBounds(capR, z.c)) next.board[capR][z.c] = '';
      } else {
        const capR = z.r - 1;
        if (inBounds(capR, z.c)) next.board[capR][z.c] = '';
      }
    }

    // normal move + promotion
    next.board[a.r][a.c] = '';
    let placed = piece;
    if ((piece === 'P' && z.r === 0) || (piece === 'p' && z.r === 7)) {
      let up = String(promo || 'q').toLowerCase();
      if (!['q', 'r', 'b', 'n'].includes(up)) up = 'q';
      placed = (pieceColor(piece) === 'w') ? up.toUpperCase() : up;
    }
    next.board[z.r][z.c] = placed;

    next.castling = updateCastlingRights(next.castling, from, to, piece, captured);

    // en passant target on double push
    if (piece && piece.toUpperCase() === 'P') {
      const color = pieceColor(piece);
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      if (a.r === startRow && z.r === a.r + dir * 2) {
        const epR = a.r + dir;
        next.ep = rcToCoord(epR, a.c);
      }
    }
    return next;
  }

  function isCastlePathSafe(state, color, to) {
    const board = state.board;
    if (isInCheck(board, color)) return false;
    const castling = state.castling;
    if (color === 'w') {
      if (to === 'g1') {
        if (!hasCastleRight(castling, 'K')) return false;
        const f1 = coordToRc('f1'), g1 = coordToRc('g1'), h1 = coordToRc('h1');
        if (!f1 || !g1 || !h1) return false;
        if (board[f1.r][f1.c] || board[g1.r][g1.c]) return false;
        if (board[h1.r][h1.c] !== 'R') return false;
        if (isSquareAttacked(board, f1.r, f1.c, 'b')) return false;
        if (isSquareAttacked(board, g1.r, g1.c, 'b')) return false;
        return true;
      }
      if (to === 'c1') {
        if (!hasCastleRight(castling, 'Q')) return false;
        const d1 = coordToRc('d1'), c1 = coordToRc('c1'), b1 = coordToRc('b1'), a1 = coordToRc('a1');
        if (!d1 || !c1 || !b1 || !a1) return false;
        if (board[d1.r][d1.c] || board[c1.r][c1.c] || board[b1.r][b1.c]) return false;
        if (board[a1.r][a1.c] !== 'R') return false;
        if (isSquareAttacked(board, d1.r, d1.c, 'b')) return false;
        if (isSquareAttacked(board, c1.r, c1.c, 'b')) return false;
        return true;
      }
    } else {
      if (to === 'g8') {
        if (!hasCastleRight(castling, 'k')) return false;
        const f8 = coordToRc('f8'), g8 = coordToRc('g8'), h8 = coordToRc('h8');
        if (!f8 || !g8 || !h8) return false;
        if (board[f8.r][f8.c] || board[g8.r][g8.c]) return false;
        if (board[h8.r][h8.c] !== 'r') return false;
        if (isSquareAttacked(board, f8.r, f8.c, 'w')) return false;
        if (isSquareAttacked(board, g8.r, g8.c, 'w')) return false;
        return true;
      }
      if (to === 'c8') {
        if (!hasCastleRight(castling, 'q')) return false;
        const d8 = coordToRc('d8'), c8 = coordToRc('c8'), b8 = coordToRc('b8'), a8 = coordToRc('a8');
        if (!d8 || !c8 || !b8 || !a8) return false;
        if (board[d8.r][d8.c] || board[c8.r][c8.c] || board[b8.r][b8.c]) return false;
        if (board[a8.r][a8.c] !== 'r') return false;
        if (isSquareAttacked(board, d8.r, d8.c, 'w')) return false;
        if (isSquareAttacked(board, c8.r, c8.c, 'w')) return false;
        return true;
      }
    }
    return false;
  }

  function genPseudoMoves(state, from, turnColor) {
    const board = state.board;
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
      // en passant capture (target square is empty but capturable)
      const ep = String(state.ep || '');
      if (ep) {
        const epRc = coordToRc(ep);
        if (epRc && epRc.r === a.r + dir && Math.abs(epRc.c - a.c) === 1 && !board[epRc.r][epRc.c]) {
          moves.push({ to: ep, capture: true, enPassant: true });
        }
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



