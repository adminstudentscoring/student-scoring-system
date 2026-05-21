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

