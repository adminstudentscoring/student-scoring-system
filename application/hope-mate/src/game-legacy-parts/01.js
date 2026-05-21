(function () {
  let BOARD_SIZE = 5;
  let FILES = ['a', 'b', 'c', 'd', 'e'];
  let RANKS = [1, 2, 3, 4, 5];

  function setBoardSize(size) {
    const n = Number(size);
    const next = Number.isFinite(n) && n >= 4 && n <= 12 ? Math.floor(n) : 5;
    BOARD_SIZE = next;
    FILES = Array.from({ length: BOARD_SIZE }, (_, i) => String.fromCharCode('a'.charCodeAt(0) + i));
    RANKS = Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
    // Board geometry changed; reset patch cache
    hmPatchPrevBoard = null;
  }

  const PIECE_POOL_WHITE = ['Q', 'R', 'B', 'N', 'K', 'P']; // includes pawn & king
  const PIECE_POOL_BLACK = ['q', 'r', 'b', 'n', 'p']; // no king duplicates allowed

  const MODES = [
    { key: 'challenge', name: 'Challenge Mode' },
    { key: 'practice', name: 'Practice Mode' },
    { key: 'rules', name: 'Rules' }
  ];

  const PRACTICE_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

  function getPracticeConfig(levelNumber) {
    const lvl = Math.max(1, Math.min(10, Number(levelNumber) || 1));
    const boardSize = lvl <= 3 ? 5 : 8;
    const blackExtraCount = Math.max(0, lvl - 1); // Level 1:0, Level 2:1, ..., Level 10:9
    return { level: lvl, boardSize, blackExtraCount };
  }

  const STORAGE = {
    players: 'hopeMatePlayers',
    level: 'hopeMateLevel',
    best: (studentId) => `hopeMateBestScore_${String(studentId || 'unknown')}`,
    total: (studentId) => `hopeMateTotalScore_${String(studentId || 'unknown')}`
  };

  // Patch-mode cache (reduces iOS Safari flicker by avoiding full DOM rebuilds)
  let hmPatchPrevBoard = null;

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getPlayers() {
    const players = Array.isArray(window.hopeMatePlayers)
      ? window.hopeMatePlayers
      : safeJsonParse(localStorage.getItem(STORAGE.players)) || [];
    return players;
  }

  function getSinglePlayer() {
    const players = getPlayers();
    return players.length === 1 ? players[0] : null;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function randInt(n) {
    return Math.floor(Math.random() * n);
  }

  function sample(arr) {
    return arr[randInt(arr.length)];
  }

  function toIdx(file, rank) {
    const x = FILES.indexOf(file);
    const y = RANKS.indexOf(rank);
    return y * BOARD_SIZE + x;
  }

  function idxToCoord(idx) {
    const x = idx % BOARD_SIZE;
    const y = Math.floor(idx / BOARD_SIZE);
    return `${FILES[x]}${RANKS[y]}`;
  }

  function coordToIdx(coord) {
    const m = String(coord || '').match(/^([a-e])([1-5])$/);
    if (!m) return null;
    return toIdx(m[1], Number(m[2]));
  }

  function inBounds(x, y) {
    return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
  }

  function idxToXY(idx) {
    return { x: idx % BOARD_SIZE, y: Math.floor(idx / BOARD_SIZE) };
  }

  function xyToIdx(x, y) {
    return y * BOARD_SIZE + x;
  }

  // Board model: array length 25, each cell = null or piece code (single char)
  // White pieces: 'Q','R','B','N','K','P'
  // Black pieces: 'k','q','r','b','n','p'

  function isWhite(piece) {
    return piece && piece === piece.toUpperCase();
  }

  function isBlack(piece) {
    return piece && piece === piece.toLowerCase();
  }

  function pieceName(piece) {
    const p = String(piece || '');
    const up = p.toUpperCase();
    switch (up) {
      case 'K': return 'King';
      case 'Q': return 'Queen';
      case 'R': return 'Rook';
      case 'B': return 'Bishop';
      case 'N': return 'Knight';
      case 'P': return 'Pawn';
      default: return 'Piece';
    }
  }

  function pieceGlyph(piece) {
    switch (piece) {
      case 'K': return '♔';
      case 'Q': return '♕';
      case 'R': return '♖';
      case 'B': return '♗';
      case 'N': return '♘';
      case 'P': return '♙';
      case 'k': return '♚';
      case 'q': return '♛';
      case 'r': return '♜';
      case 'b': return '♝';
      case 'n': return '♞';
      case 'p': return '♟';
      default: return '';
    }
  }

  function pieceImagePath(piece) {
    const up = String(piece || '').toUpperCase();
    const isW = isWhite(piece);
    const colorPrefix = isW ? 'white_' : 'black_';
    switch (up) {
      case 'K': return `/application/pieces/${colorPrefix}King.png`;
      case 'Q': return `/application/pieces/${colorPrefix}Queen.png`;
      case 'R': return `/application/pieces/${colorPrefix}Rook.png`;
      case 'B': return `/application/pieces/${colorPrefix}Bishop.png`;
      case 'N': return `/application/pieces/${colorPrefix}Knight.png`;
      case 'P': return `/application/pieces/${colorPrefix}Pawn.png`;
      default: return null;
    }
  }

  function renderPieceVisual(piece, altText) {
    if (!piece) return '';
    const src = pieceImagePath(piece);
    const glyph = pieceGlyph(piece);
    const alt = escapeHtml(String(altText || pieceName(piece)));
    if (!src) return `<span class="hm-piece-glyph" aria-label="${alt}">${glyph}</span>`;
    // Use image but keep glyph fallback for safety (e.g., if image fails to load)
    return `
      <img class="hm-piece-img" src="${src}" alt="${alt}" loading="lazy" decoding="async"
        onerror="this.style.display='none'; this.parentElement?.querySelector('.hm-piece-glyph')?.classList.remove('hm-hidden');" />
      <span class="hm-piece-glyph hm-hidden" aria-label="${alt}">${glyph}</span>
    `;
  }

  function getAttacksForPiece(board, fromIdx, piece) {
    // Returns set of attacked squares (indices). For pawns: attacks only diagonals.
    const attacks = new Set();
    const { x, y } = idxToXY(fromIdx);
    const up = piece.toUpperCase();

    const addRay = (dx, dy) => {
      let cx = x + dx;
      let cy = y + dy;
      while (inBounds(cx, cy)) {
        const idx = xyToIdx(cx, cy);
        attacks.add(idx);
        if (board[idx]) break; // blocked by any piece
        cx += dx;
        cy += dy;
      }
    };

    if (up === 'Q' || up === 'R') {
      addRay(1, 0); addRay(-1, 0); addRay(0, 1); addRay(0, -1);
    }
    if (up === 'Q' || up === 'B') {
      addRay(1, 1); addRay(1, -1); addRay(-1, 1); addRay(-1, -1);
    }
    if (up === 'N') {
      const deltas = [
        [1, 2], [2, 1], [2, -1], [1, -2],
        [-1, -2], [-2, -1], [-2, 1], [-1, 2]
      ];
      for (const [dx, dy] of deltas) {
        const cx = x + dx, cy = y + dy;
        if (!inBounds(cx, cy)) continue;
        attacks.add(xyToIdx(cx, cy));
      }
    }
    if (up === 'K') {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const cx = x + dx, cy = y + dy;
          if (!inBounds(cx, cy)) continue;
          attacks.add(xyToIdx(cx, cy));
        }
      }
    }
    if (up === 'P') {
      // White pawns attack up (+y). Black pawns attack down (-y).
      const dir = isWhite(piece) ? 1 : -1;
      const targets = [
        [x - 1, y + dir],
        [x + 1, y + dir]
      ];
      for (const [cx, cy] of targets) {
        if (!inBounds(cx, cy)) continue;
        attacks.add(xyToIdx(cx, cy));
      }
    }

    return attacks;
  }

  function buildAttackMap(board, side /* 'white'|'black' */) {
    const attacks = new Set();
    for (let i = 0; i < board.length; i++) {
      const p = board[i];
      if (!p) continue;
      if (side === 'white' && !isWhite(p)) continue;
      if (side === 'black' && !isBlack(p)) continue;
      const a = getAttacksForPiece(board, i, p);
      for (const idx of a) attacks.add(idx);
    }
    return attacks;
  }

  function findPiece(board, pieceChar) {
    for (let i = 0; i < board.length; i++) {
      if (board[i] === pieceChar) return i;
    }
    return null;
  }

  function cloneBoard(board) {
    return board.slice();
  }

  function isSquareAttacked(board, idx, bySide) {
    const attacks = buildAttackMap(board, bySide);
    return attacks.has(idx);
  }

  function generateMovesForPiece(board, fromIdx, piece) {
    // Pseudo-legal moves for black side (used for king & extra black piece).
    // Returned as array of { from, to }.
    const moves = [];
    const { x, y } = idxToXY(fromIdx);
    const up = piece.toUpperCase();

    const addStep = (cx, cy) => {
      if (!inBounds(cx, cy)) return;
      const to = xyToIdx(cx, cy);
      const target = board[to];
      if (target && ((isWhite(piece) && isWhite(target)) || (isBlack(piece) && isBlack(target)))) return;
      moves.push({ from: fromIdx, to });
    };

    const addRayMoves = (dx, dy) => {
      let cx = x + dx;
      let cy = y + dy;
      while (inBounds(cx, cy)) {
        const to = xyToIdx(cx, cy);
        const target = board[to];
        if (!target) {
          moves.push({ from: fromIdx, to });
        } else {
          if ((isBlack(piece) && isWhite(target)) || (isWhite(piece) && isBlack(target))) {
            moves.push({ from: fromIdx, to });
          }
          break;
        }
        cx += dx;
        cy += dy;
      }
    };

    if (up === 'Q' || up === 'R') {
      addRayMoves(1, 0); addRayMoves(-1, 0); addRayMoves(0, 1); addRayMoves(0, -1);
    }
    if (up === 'Q' || up === 'B') {
      addRayMoves(1, 1); addRayMoves(1, -1); addRayMoves(-1, 1); addRayMoves(-1, -1);
    }
    if (up === 'N') {
      const deltas = [
        [1, 2], [2, 1], [2, -1], [1, -2],
        [-1, -2], [-2, -1], [-2, 1], [-1, 2]
      ];
      for (const [dx, dy] of deltas) addStep(x + dx, y + dy);
    }
    if (up === 'K') {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          addStep(x + dx, y + dy);
        }
      }
    }
    if (up === 'P') {
      const dir = isWhite(piece) ? 1 : -1;
      // Forward move (one step) if empty
      const fwdY = y + dir;
      if (inBounds(x, fwdY)) {
        const to = xyToIdx(x, fwdY);
        if (!board[to]) moves.push({ from: fromIdx, to });
      }
      // Captures
      for (const dx of [-1, 1]) {
        const cx = x + dx;
        const cy = y + dir;
        if (!inBounds(cx, cy)) continue;
        const to = xyToIdx(cx, cy);
        const target = board[to];
        if (target && ((isBlack(piece) && isWhite(target)) || (isWhite(piece) && isBlack(target)))) {
          moves.push({ from: fromIdx, to });
        }
      }
    }

    return moves;
  }

  function applyMove(board, move) {
    const next = cloneBoard(board);
    next[move.to] = next[move.from];
    next[move.from] = null;
    return next;
  }

  function isCheckmate(board) {
    // Checkmate for black: black king in check and no legal black move resolves it.
    // Stalemate should be treated as NOT checkmate (fail).
    const kIdx = findPiece(board, 'k');
    if (kIdx == null) return false;

    const inCheck = isSquareAttacked(board, kIdx, 'white');
    if (!inCheck) return false;

    // Generate all black moves (king + extra piece if exists)
    const blackMoves = [];
    for (let i = 0; i < board.length; i++) {
      const p = board[i];
      if (!p || !isBlack(p)) continue;
      blackMoves.push(...generateMovesForPiece(board, i, p));
    }

    // Legal if after move, king not in check
    for (const mv of blackMoves) {
      const next = applyMove(board, mv);
      const nk = findPiece(next, 'k');
      if (nk == null) continue;
      if (!isSquareAttacked(next, nk, 'white')) {
        return false; // has an escape
      }
    }

    return true;
  }

  function isStalemate(board) {
    const kIdx = findPiece(board, 'k');
    if (kIdx == null) return false;
    const inCheck = isSquareAttacked(board, kIdx, 'white');
    if (inCheck) return false;

    const blackMoves = [];
    for (let i = 0; i < board.length; i++) {
      const p = board[i];
      if (!p || !isBlack(p)) continue;
      blackMoves.push(...generateMovesForPiece(board, i, p));
    }

    for (const mv of blackMoves) {
      const next = applyMove(board, mv);
      const nk = findPiece(next, 'k');
      if (nk == null) continue;
      if (!isSquareAttacked(next, nk, 'white')) {
        return false; // has a legal move
      }
    }
    return true;
  }

  function isAdjacent(idxA, idxB) {
    const a = idxToXY(idxA);
    const b = idxToXY(idxB);
    return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && !(a.x === b.x && a.y === b.y);
  }

  function validateWhitePlacementConstraints(baseBoard, blackKingIdx, placements /* array of {piece, idx} */) {
    // baseBoard should include black pieces already.
    const working = Array.isArray(baseBoard) ? cloneBoard(baseBoard) : buildEmptyBoard();

    for (const pl of placements) {
      if (!pl || pl.idx == null || !pl.piece) continue;

      if (pl.piece === 'K') {
        // White king cannot be adjacent to black king.
        if (isAdjacent(pl.idx, blackKingIdx)) {
          return { ok: false, reason: 'White king cannot be adjacent to the black king.' };
        }
      }

      if (pl.piece === 'P') {
        // Pawn cannot be placed on bottom rank (rank 1)
        const { y } = idxToXY(pl.idx);
        if (y === 0) return { ok: false, reason: 'White pawn cannot be placed on rank 1.' };
      }

      // Place piece for line-of-sight attack validation (pieces can block attacks).
      if (working[pl.idx]) {
        return { ok: false, reason: 'Cannot place a piece on an occupied square.' };
      }
      working[pl.idx] = pl.piece;
    }

    // If white king exists in placements, it cannot be placed on a square attacked by black.
    const wk = placements.find(p => p && p.piece === 'K');
    if (wk && wk.idx != null) {
      if (isSquareAttacked(working, wk.idx, 'black')) {
