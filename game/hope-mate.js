// Hope Mate
// - 5x5 board (a1-e5)
// - Level 1: black king only
// - Level 2: black king + 1 random black piece (no extra king)
// - Player (white) gets 2 random pieces and must place both, then Confirm.
// - After placement: black to move. Checkmate = success. Stalemate = fail.
// - Scoring: +1 if solved on first attempt. If any failed confirm happened, later solve gives 0.
// - No time limit. No helper overlays.
//
// Note: White king is NOT required to exist; it may appear as a random piece. Rule: white king cannot be placed adjacent to black king.

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
      case 'K': return `/game/pieces/${colorPrefix}King.png`;
      case 'Q': return `/game/pieces/${colorPrefix}Queen.png`;
      case 'R': return `/game/pieces/${colorPrefix}Rook.png`;
      case 'B': return `/game/pieces/${colorPrefix}Bishop.png`;
      case 'N': return `/game/pieces/${colorPrefix}Knight.png`;
      case 'P': return `/game/pieces/${colorPrefix}Pawn.png`;
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
        return { ok: false, reason: 'White king cannot be placed on a square attacked by black.' };
      }
    }

    return { ok: true };
  }

  function buildEmptyBoard() {
    return Array(BOARD_SIZE * BOARD_SIZE).fill(null);
  }

  function randomPuzzle(cfg) {
    const level = Number(cfg?.level) || 1;
    const blackExtraCount = Number(cfg?.blackExtraCount) || 0;
    const fixedWhitePieces = Array.isArray(cfg?.whitePieces) ? cfg.whitePieces.filter(Boolean) : null;
    const exhaustivePairs = !!cfg?.exhaustivePairs;
    const blackKingPlacement = String(cfg?.blackKingPlacement || '');
    const maxTries = BOARD_SIZE === 8
      ? ((fixedWhitePieces && fixedWhitePieces.length === 1) ? 20000 : 3000)
      : 4000;

    for (let attempt = 0; attempt < maxTries; attempt++) {
      const boardBase = buildEmptyBoard();

      const isStageRook = BOARD_SIZE === 8
        && fixedWhitePieces
        && fixedWhitePieces.length === 1
        && String(fixedWhitePieces[0]).toUpperCase() === 'R'
        && (blackExtraCount === 2 || blackExtraCount === 3);

      let blackKingIdx = null;

      if (isStageRook) {
        // Stage 1 generator: bias to corners with two black knights as blockers.
        // This dramatically increases solvable rate while still validating checkmate existence.
        const corners = [
          { x: 0, y: 0 },
          { x: 7, y: 0 },
          { x: 0, y: 7 },
          { x: 7, y: 7 }
        ];
        const corner = corners[randInt(corners.length)];
        blackKingIdx = xyToIdx(corner.x, corner.y);
        boardBase[blackKingIdx] = 'k';

        const sx = corner.x === 0 ? 1 : -1;
        const sy = corner.y === 0 ? 1 : -1;
        const trap1 = xyToIdx(corner.x + sx, corner.y);        // side square
        const trap2 = xyToIdx(corner.x + sx, corner.y + sy);   // diagonal inboard
        // Leave the file square (corner.x, corner.y + sy) empty so rook can give check.
        // Use knights so they cannot block/capture the rook check line.
        boardBase[trap1] = 'n';
        boardBase[trap2] = 'n';

        if (blackExtraCount === 3) {
          // Add a 3rd black piece in a "safe" spot to keep solvable rate high.
          // We still validate checkmate existence later, but this avoids most dead positions.
          const rookFileX = corner.x;
          const rookMateY = corner.y === 0 ? 7 : 0;
          const rookMateIdx = xyToIdx(rookFileX, rookMateY);

          // Prefer a pawn or knight (avoid rook/queen/bishop which may capture/block the checking rook too easily).
          const bp = Math.random() < 0.7 ? 'p' : 'n';

          const forbidden = new Set([blackKingIdx, trap1, trap2, rookMateIdx]);
          // Also avoid placing on rook file.
          for (let y = 0; y < 8; y++) forbidden.add(xyToIdx(rookFileX, y));
          // Avoid squares where a black pawn could capture the mating rook square.
          if (bp === 'p') {
            const px1 = rookFileX - 1;
            const px2 = rookFileX + 1;
            const py = rookMateY + 1; // black pawns capture down (-1), so from y+1 they capture y
            if (py >= 0 && py < 8) {
              if (px1 >= 0 && px1 < 8) forbidden.add(xyToIdx(px1, py));
              if (px2 >= 0 && px2 < 8) forbidden.add(xyToIdx(px2, py));
            }
          }
          // Avoid knight squares that can capture the mating rook square.
          if (bp === 'n') {
            const deltas = [
              [1, 2], [2, 1], [2, -1], [1, -2],
              [-1, -2], [-2, -1], [-2, 1], [-1, 2]
            ];
            const { x: rx, y: ry } = idxToXY(rookMateIdx);
            for (const [dx, dy] of deltas) {
              const cx = rx + dx, cy = ry + dy;
              if (cx >= 0 && cx < 8 && cy >= 0 && cy < 8) forbidden.add(xyToIdx(cx, cy));
            }
          }

          // Choose a placement from remaining squares.
          const candidates = [];
          for (let i = 0; i < 64; i++) {
            if (boardBase[i]) continue;
            if (forbidden.has(i)) continue;
            candidates.push(i);
          }
          if (candidates.length > 0) {
            const bIdx = candidates[randInt(candidates.length)];
            boardBase[bIdx] = bp;
          }
        }
      } else {
        // Generic random black setup
        if (blackKingPlacement === 'edge') {
          const edgeSquares = [];
          for (let x = 0; x < BOARD_SIZE; x++) {
            edgeSquares.push(xyToIdx(x, 0));
            edgeSquares.push(xyToIdx(x, BOARD_SIZE - 1));
          }
          for (let y = 1; y < BOARD_SIZE - 1; y++) {
            edgeSquares.push(xyToIdx(0, y));
            edgeSquares.push(xyToIdx(BOARD_SIZE - 1, y));
          }
          blackKingIdx = edgeSquares[randInt(edgeSquares.length)];
        } else {
          blackKingIdx = randInt(BOARD_SIZE * BOARD_SIZE);
        }
        boardBase[blackKingIdx] = 'k';

        // Extra black pieces (no extra king)
        for (let i = 0; i < blackExtraCount; i++) {
          const bp = sample(PIECE_POOL_BLACK);
          // Avoid placing black pawn on rank 1 (y=0), because it would have no forward move.
          let bIdx = randInt(BOARD_SIZE * BOARD_SIZE);
          let guard = 0;
          while (guard < 40 && (bIdx === blackKingIdx || boardBase[bIdx] || (bp === 'p' && idxToXY(bIdx).y === 0))) {
            bIdx = randInt(BOARD_SIZE * BOARD_SIZE);
            guard += 1;
          }
          if (bIdx === blackKingIdx || boardBase[bIdx]) {
            // Retry full attempt if we cannot place all black pieces cleanly
            boardBase[blackKingIdx] = null;
            break;
          }
          boardBase[bIdx] = bp;
        }
        if (boardBase[blackKingIdx] !== 'k') continue;
      }

      // Pick white pieces (fixed for Stage, random for Practice)
      const whitePieces = fixedWhitePieces && fixedWhitePieces.length > 0
        ? fixedWhitePieces.map(p => String(p).toUpperCase())
        : [sample(PIECE_POOL_WHITE), sample(PIECE_POOL_WHITE)];

      // Verify solvable (must exist at least one checkmate)
      const squares = [];
      for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
        if (boardBase[i]) continue;
        squares.push(i);
      }

      let hasMate = false;
      let sampleSolution = null;

      const tryPlacements = (placements) => {
        const c = validateWhitePlacementConstraints(boardBase, blackKingIdx, placements);
        if (!c.ok) return false;
        const b = cloneBoard(boardBase);
        for (const pl of placements) b[pl.idx] = pl.piece;
        if (isCheckmate(b)) {
          hasMate = true;
          sampleSolution = placements;
          return true;
        }
        return false;
      };

      const pieceCount = whitePieces.length;

      const trySingle = (idx1) => {
        return tryPlacements([{ piece: whitePieces[0], idx: idx1 }]);
      };

      const tryPair = (idx1, idx2) => {
        const p1 = whitePieces[0];
        const p2 = whitePieces[1];
        const assignmentOptions = (p1 === p2)
          ? [[{ piece: p1, idx: idx1 }, { piece: p2, idx: idx2 }]]
          : [
              [{ piece: p1, idx: idx1 }, { piece: p2, idx: idx2 }],
              [{ piece: p1, idx: idx2 }, { piece: p2, idx: idx1 }]
            ];
        for (const placements of assignmentOptions) {
          if (tryPlacements(placements)) return true;
        }
        return false;
      };

      if (pieceCount === 1) {
        // Exhaustive is cheap even on 8x8.
        for (let i = 0; i < squares.length; i++) {
          if (trySingle(squares[i])) break;
        }
      } else if (pieceCount === 2) {
        if (exhaustivePairs || (BOARD_SIZE <= 5 && blackExtraCount <= 2)) {
          for (let i = 0; i < squares.length; i++) {
            for (let j = i + 1; j < squares.length; j++) {
              if (tryPair(squares[i], squares[j])) break;
            }
            if (hasMate) break;
          }
        } else {
          const samples = Math.min(2400, squares.length * 5);
          for (let t = 0; t < samples; t++) {
            const idx1 = squares[randInt(squares.length)];
            let idx2 = squares[randInt(squares.length)];
            let guard = 0;
            while (idx2 === idx1 && guard < 20) {
              idx2 = squares[randInt(squares.length)];
              guard += 1;
            }
            if (idx2 === idx1) continue;
            if (tryPair(idx1, idx2)) break;
          }
        }
      } else {
        // Basic random sampling for >2 (future stages). Not exhaustive to keep generation bounded.
        const samples = Math.min(5000, squares.length * 10);
        for (let t = 0; t < samples; t++) {
          const picks = [];
          const used = new Set();
          while (picks.length < pieceCount) {
            const idx = squares[randInt(squares.length)];
            if (used.has(idx)) continue;
            used.add(idx);
            picks.push(idx);
          }
          const placements = picks.map((idx, i) => ({ piece: whitePieces[i], idx }));
          if (tryPlacements(placements)) break;
        }
      }

      if (!hasMate) continue;

      return {
        level,
        boardSize: BOARD_SIZE,
        blackExtraCount,
        black: boardBase.slice(),
        blackKingIdx,
        whitePieces,
        // store one known solution (optional, for debug later)
        sampleSolution
      };
    }

    throw new Error('Failed to generate a solvable puzzle. Please try again.');
  }

  // ---------------------------
  // UI / Game State
  // ---------------------------
  const state = {
    screen: 'home', // 'home' | 'practiceSelect' | 'practiceGame' | 'challengeSelect' | 'challengeGame'
    practiceLevel: 1,
    challenge: {
      active: false,
      durationSec: 60,
      timeLeftSec: 60,
      level: 1,
      solvedInLevel: 0, // 0..1 (level up every 2 solved)
      totalSolved: 0
    },
    puzzle: null,
    board: null,
    placed: [], // indices for each white piece slot
    selectedPieceSlot: 0,
    attemptsFailed: false,
    puzzleSolved: false,
    sessionScore: 0,
    totalScore: 0,
    bestScore: 0,
    leaderboard: {
      loading: true,
      error: null,
      entries: []
    },
    challengeLeaderboard: {
      durationSec: 60, // 60/120/180
      loading: false,
      error: null,
      entries: []
    },
    ui: {
      leaderboardOpen: false,
      challengeLeaderboardOpen: false,
      resultOpen: false,
      resultKind: null, // 'correct' | 'incorrect'
      resultMessage: ''
    }
  };

  // Timer for Challenge Mode (cleared on navigation/restart)
  let challengeTimerId = null;
  function stopChallengeTimer() {
    if (challengeTimerId) {
      clearInterval(challengeTimerId);
      challengeTimerId = null;
    }
  }

  function startChallengeTimer() {
    stopChallengeTimer();
    challengeTimerId = setInterval(() => {
      if (!state.challenge.active) return;
      if (state.screen !== 'challengeGame') return;
      const next = Math.max(0, Number(state.challenge.timeLeftSec || 0) - 1);
      state.challenge.timeLeftSec = next;
      if (next <= 0) {
        stopChallengeTimer();
        state.challenge.active = false;
        setStatus('Time is up.', 'error');
        openResult('incorrect', 'Time is up. Restart Challenge to try again.');
        return;
      }
      // Update UI without full re-render if possible
      const el = document.getElementById('hmChallengeTimer');
      if (el) el.textContent = formatMmSs(state.challenge.timeLeftSec);
    }, 1000);
  }

  function formatMmSs(totalSec) {
    const s = Math.max(0, Number(totalSec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function challengeConfigForLevel(levelNumber) {
    // Same difficulty curve as Practice Mode
    return getPracticeConfig(levelNumber);
  }

  function resetChallengeState(durationSec) {
    stopChallengeTimer();
    state.challenge.active = true;
    state.challenge.durationSec = durationSec;
    state.challenge.timeLeftSec = durationSec;
    state.challenge.level = 1;
    state.challenge.solvedInLevel = 0;
    state.challenge.totalSolved = 0;
  }

  function newChallengePuzzle() {
    state.attemptsFailed = false;
    state.selectedPieceSlot = 0;
    state.puzzleSolved = false;
    state.ui.resultOpen = false;
    const cfg = challengeConfigForLevel(state.challenge.level);
    setBoardSize(cfg.boardSize);
    state.puzzle = randomPuzzle(cfg);
    state.board = state.puzzle.black.slice();
    state.placed = new Array((state.puzzle.whitePieces || []).length).fill(null);
  }

  function getRoot() {
    return document.getElementById('hopeMateRoot');
  }

  function readStoredPracticeLevel() {
    const raw = Number(localStorage.getItem(STORAGE.level) || '1');
    if (Number.isFinite(raw) && raw >= 1 && raw <= 10) return Math.floor(raw);
    return 1;
  }

  function writeStoredPracticeLevel(levelNumber) {
    localStorage.setItem(STORAGE.level, String(levelNumber));
  }

  function loadScores() {
    const player = getSinglePlayer();
    const sid = player?.id || 'unknown';
    const t = Number(localStorage.getItem(STORAGE.total(sid)) || '0') || 0;
    const b = Number(localStorage.getItem(STORAGE.best(sid)) || '0') || 0;
    state.totalScore = t;
    state.bestScore = b;
  }

  function saveScores() {
    const player = getSinglePlayer();
    const sid = player?.id || 'unknown';
    localStorage.setItem(STORAGE.total(sid), String(state.totalScore));
    localStorage.setItem(STORAGE.best(sid), String(state.bestScore));
  }

  function getAuthToken() {
    // Same key as public/auth.js
    return localStorage.getItem('authToken');
  }

  function buildAuthHeaders(extra = {}) {
    const token = getAuthToken();
    const headers = { ...extra };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function fetchHopeMateLeaderboard() {
    const apiBase = window.API_BASE || '/api';
    const resp = await fetch(`${apiBase}/hope-mate/leaderboard`, {
      headers: buildAuthHeaders(),
      credentials: 'include'
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Failed to load leaderboard (${resp.status}): ${txt}`);
    }
    const data = await resp.json().catch(() => ({}));
    return Array.isArray(data.entries) ? data.entries : [];
  }

  async function submitHopeMateTotalScore(studentId, totalScore) {
    const apiBase = window.API_BASE || '/api';
    const resp = await fetch(`${apiBase}/hope-mate/leaderboard`, {
      method: 'POST',
      credentials: 'include',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ studentId, totalScore })
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Failed to submit score (${resp.status}): ${txt}`);
    }
    const data = await resp.json().catch(() => ({}));
    return Array.isArray(data.entries) ? data.entries : [];
  }

  async function refreshLeaderboard() {
    state.leaderboard.loading = true;
    state.leaderboard.error = null;
    try {
      const entries = await fetchHopeMateLeaderboard();
      state.leaderboard.entries = entries;
    } catch (e) {
      state.leaderboard.error = e?.message || 'Failed to load leaderboard';
      state.leaderboard.entries = [];
    } finally {
      state.leaderboard.loading = false;
      render();
    }
  }

  async function fetchHopeMateChallengeLeaderboard(durationSec) {
    const apiBase = window.API_BASE || '/api';
    const sec = Number(durationSec);
    const resp = await fetch(`${apiBase}/hope-mate/challenge-leaderboard?durationSec=${encodeURIComponent(String(sec))}`, {
      headers: buildAuthHeaders(),
      credentials: 'include'
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Failed to load leaderboard (${resp.status}): ${txt}`);
    }
    const data = await resp.json().catch(() => ({}));
    return Array.isArray(data.entries) ? data.entries : [];
  }

  async function submitHopeMateChallengeEntry(studentId, durationSec, totalSolved, bestLevel, bestTimeLeftSec) {
    const apiBase = window.API_BASE || '/api';
    const resp = await fetch(`${apiBase}/hope-mate/challenge-leaderboard`, {
      method: 'POST',
      credentials: 'include',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ studentId, durationSec, totalSolved, bestLevel, bestTimeLeftSec })
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Failed to submit leaderboard (${resp.status}): ${txt}`);
    }
    const data = await resp.json().catch(() => ({}));
    return Array.isArray(data.entries) ? data.entries : [];
  }

  async function refreshChallengeLeaderboard(durationSec = null) {
    if (durationSec != null) state.challengeLeaderboard.durationSec = Number(durationSec) || 60;
    state.challengeLeaderboard.loading = true;
    state.challengeLeaderboard.error = null;
    try {
      const entries = await fetchHopeMateChallengeLeaderboard(state.challengeLeaderboard.durationSec);
      state.challengeLeaderboard.entries = entries;
    } catch (e) {
      state.challengeLeaderboard.error = e?.message || 'Failed to load leaderboard';
      state.challengeLeaderboard.entries = [];
    } finally {
      state.challengeLeaderboard.loading = false;
      render();
    }
  }

  function openLeaderboard() {
    state.ui.leaderboardOpen = true;
    render();
  }

  function closeLeaderboard() {
    state.ui.leaderboardOpen = false;
    render();
  }

  function openChallengeLeaderboard(durationSec = null) {
    state.ui.challengeLeaderboardOpen = true;
    if (durationSec != null) state.challengeLeaderboard.durationSec = Number(durationSec) || 60;
    render();
  }

  function closeChallengeLeaderboard() {
    state.ui.challengeLeaderboardOpen = false;
    render();
  }

  function openResult(kind, message) {
    // Avoid stacking overlays
    state.ui.leaderboardOpen = false;
    state.ui.challengeLeaderboardOpen = false;
    state.ui.resultOpen = true;
    state.ui.resultKind = kind;
    state.ui.resultMessage = String(message || '');
    render();
  }

  function closeResult() {
    state.ui.resultOpen = false;
    state.ui.resultKind = null;
    state.ui.resultMessage = '';
    render();
  }

  function newPuzzle() {
    state.attemptsFailed = false;
    state.placed = [];
    state.selectedPieceSlot = 0;
    state.puzzleSolved = false;
    const cfg = getPracticeConfig(state.practiceLevel);
    setBoardSize(cfg.boardSize);
    state.puzzle = randomPuzzle(cfg);
    state.board = state.puzzle.black.slice();
    state.placed = new Array((state.puzzle.whitePieces || []).length).fill(null);
  }

  function resetPlacements() {
    if (!state.puzzle) return;
    state.placed = new Array((state.puzzle.whitePieces || []).length).fill(null);
    state.selectedPieceSlot = 0;
    state.board = state.puzzle.black.slice();
    render();
  }

  function placePiece(slot, idx) {
    if (!state.puzzle) return;
    const pieces = Array.isArray(state.puzzle.whitePieces) ? state.puzzle.whitePieces : [];
    if (!(slot >= 0 && slot < pieces.length)) return;
    const piece = pieces[slot];
    if (!piece) return;
    if (state.puzzle.black[idx]) return; // occupied by black
    // If dropping onto another placed piece, swap.
    const otherSlot = state.placed.findIndex(v => v === idx);
    if (otherSlot !== -1 && otherSlot !== slot) {
      const curIdx = state.placed[slot];
      state.placed[slot] = idx;
      state.placed[otherSlot] = curIdx;
      rebuildBoardFromPlacements();
      setStatus('Swapped pieces. You can adjust before Confirm.', 'info');
      render();
      return;
    }
    // prevent placing on square used by any other slot
    if (state.placed.some((v, i) => i !== slot && v === idx)) return;

    // Apply placement constraints early for feedback
    const placements = [];
    placements.push({ piece, idx });
    state.placed.forEach((placedIdx, i) => {
      if (i === slot) return;
      if (placedIdx == null) return;
      placements.push({ piece: pieces[i], idx: placedIdx });
    });
    const c = validateWhitePlacementConstraints(state.puzzle.black, state.puzzle.blackKingIdx, placements);
    if (!c.ok) {
      setStatus(c.reason, 'error');
      return;
    }

    state.placed[slot] = idx;
    rebuildBoardFromPlacements();
    setStatus('Placed. You can adjust before Confirm.', 'info');
    render();
  }

  function rebuildBoardFromPlacements() {
    if (!state.puzzle) return;
    const b = state.puzzle.black.slice();
    const pieces = Array.isArray(state.puzzle.whitePieces) ? state.puzzle.whitePieces : [];
    for (let s = 0; s < pieces.length; s++) {
      const idx = state.placed[s];
      if (idx == null) continue;
      b[idx] = pieces[s];
    }
    state.board = b;
  }

  // status bar (simple)
  let lastStatus = { text: '', kind: 'info' };
  function setStatus(text, kind = 'info') {
    lastStatus = { text, kind };
    const el = document.getElementById('hopeMateStatus');
    if (el) {
      el.textContent = text;
      el.classList.remove('is-error', 'is-success', 'is-info');
      el.classList.add(kind === 'error' ? 'is-error' : kind === 'success' ? 'is-success' : 'is-info');
    }
  }

  function confirm() {
    if (!state.puzzle || !state.board) return;
    if (state.puzzleSolved) {
      openResult('correct', 'Already confirmed. Use Next to continue.');
      return;
    }
    if (!Array.isArray(state.placed) || state.placed.some(v => v == null)) {
      setStatus('Place both pieces before confirming.', 'error');
      openResult('incorrect', 'Please place both pieces before confirming.');
      return;
    }

    const mate = isCheckmate(state.board);
    if (mate) {
      const gained = state.attemptsFailed ? 0 : 1;
      state.sessionScore += gained;
      state.totalScore += gained;
      state.bestScore = Math.max(state.bestScore, state.sessionScore);
      saveScores();
      state.puzzleSolved = true;
      const msg = gained ? 'Correct! Checkmate. +1 point.' : 'Correct! Checkmate. (No points because you already failed this puzzle.)';
      setStatus(msg, 'success');
      openResult('correct', msg);

      // Challenge Mode: auto-advance puzzle & difficulty, same scoring rule (+1 only if first attempt)
      if (state.screen === 'challengeGame') {
        state.challenge.totalSolved += 1;
        state.challenge.solvedInLevel += 1;
        if (state.challenge.solvedInLevel >= 2) {
          state.challenge.solvedInLevel = 0;
          state.challenge.level = Math.min(10, Number(state.challenge.level || 1) + 1);
        }

        // Submit Challenge leaderboard entry (best-per-student, per duration)
        const player = getSinglePlayer();
        if (player?.id) {
          submitHopeMateChallengeEntry(
            String(player.id),
            Number(state.challenge.durationSec || 60) || 60,
            Number(state.challenge.totalSolved || 0) || 0,
            Number(state.challenge.level || 1) || 1,
            Number(state.challenge.timeLeftSec || 0) || 0
          ).then((entries) => {
            // If user is viewing this duration, refresh list immediately
            if (state.ui.challengeLeaderboardOpen && Number(state.challengeLeaderboard.durationSec) === Number(state.challenge.durationSec)) {
              state.challengeLeaderboard.entries = entries;
              state.challengeLeaderboard.loading = false;
              state.challengeLeaderboard.error = null;
              render();
            }
          }).catch(() => {
            // ignore (do not interrupt gameplay)
          });
        }
      }

      if (gained === 1) {
        const player = getSinglePlayer();
        if (player?.id) {
          // Fire-and-forget: submit total score, then refresh leaderboard.
          submitHopeMateTotalScore(String(player.id), state.totalScore)
            .then((entries) => {
              state.leaderboard.entries = entries;
              state.leaderboard.loading = false;
              state.leaderboard.error = null;
              render();
            })
            .catch((e) => {
              state.leaderboard.error = e?.message || 'Failed to submit score';
              state.leaderboard.loading = false;
              render();
            });
        }
      }
      render();
      return;
    }

    // Stalemate should be treated as failure
    if (isStalemate(state.board)) {
      state.attemptsFailed = true;
      const msg = 'Incorrect. Stalemate is a failure. Redo (no points for this puzzle).';
      setStatus(msg, 'error');
      openResult('incorrect', msg);
      render();
      return;
    }

    state.attemptsFailed = true;
    const msg = 'Incorrect. Not checkmate. Redo (no points for this puzzle).';
    setStatus(msg, 'error');
    openResult('incorrect', msg);
    render();
  }

  function nextPuzzle() {
    newPuzzle();
    setStatus('New puzzle generated. Place both pieces, then Confirm.', 'info');
    render();
  }

  function nextChallengePuzzle() {
    // Generate next puzzle using current challenge.level
    newChallengePuzzle();
    setStatus('New puzzle generated. Place both pieces, then Confirm.', 'info');
    render();
  }

  function onSquareClick(idx) {
    // If clicking a placed white piece, select it (so user can quickly adjust without changing slots)
    const slot = state.placed.findIndex(v => v === idx);
    if (slot !== -1) {
      state.selectedPieceSlot = slot;
      render();
      return;
    }
    placePiece(state.selectedPieceSlot, idx);
  }

  function onSelectSlot(slot) {
    state.selectedPieceSlot = slot;
    render();
  }

  function enableDragAndDrop() {
    // Custom pointer-based dragging (mouse/touch) to avoid browser drag cursor/icons.
    // This emulates chess.com style: the piece follows the cursor, with no "not allowed" cursor changes.

    let dragging = null; // { slot, ghostEl, lastOverSquareEl, originSquareEl }

    const clearOver = () => {
      if (dragging?.lastOverSquareEl) {
        dragging.lastOverSquareEl.classList.remove('is-drop-target');
        dragging.lastOverSquareEl = null;
      }
    };

    const cleanup = () => {
      clearOver();
      if (dragging?.originSquareEl) {
        dragging.originSquareEl.classList.remove('hm-drag-origin');
        dragging.originSquareEl = null;
      }
      if (dragging?.ghostEl) dragging.ghostEl.remove();
      dragging = null;
      document.body.classList.remove('hm-dragging');
    };

    const moveGhost = (x, y) => {
      if (!dragging?.ghostEl) return;
      dragging.ghostEl.style.left = `${x}px`;
      dragging.ghostEl.style.top = `${y}px`;
    };

    const getSquareUnderPoint = (x, y) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      return el.closest?.('.hm-square') || null;
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const x = e.clientX;
      const y = e.clientY;
      moveGhost(x, y);

      const sq = getSquareUnderPoint(x, y);
      if (sq !== dragging.lastOverSquareEl) {
        clearOver();
        if (sq) {
          sq.classList.add('is-drop-target');
          dragging.lastOverSquareEl = sq;
        }
      }
      e.preventDefault?.();
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      const x = e.clientX;
      const y = e.clientY;
      const sq = getSquareUnderPoint(x, y);
      if (sq) {
        const idx = Number(sq.getAttribute('data-idx'));
        if (Number.isFinite(idx)) {
          state.selectedPieceSlot = dragging.slot;
          placePiece(dragging.slot, idx);
        }
      }
      cleanup();
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      e.preventDefault?.();
    };

    const startDragFromSlotEl = (slotEl, slot, e) => {
      if (!(slot === 0 || slot === 1)) return;
      const img = slotEl.querySelector('.hm-piece-img');
      const glyph = slotEl.querySelector('.hm-piece-glyph');

      const ghost = document.createElement('div');
      ghost.className = 'hm-drag-ghost';
      if (img && img.getAttribute('src')) {
        const gi = document.createElement('img');
        gi.src = img.getAttribute('src');
        gi.alt = '';
        ghost.appendChild(gi);
      } else if (glyph) {
        const span = document.createElement('span');
        span.textContent = glyph.textContent || '';
        ghost.appendChild(span);
      }
      document.body.appendChild(ghost);

      dragging = { slot, ghostEl: ghost, lastOverSquareEl: null, originSquareEl: null };
      document.body.classList.add('hm-dragging');
      state.selectedPieceSlot = slot;

      moveGhost(e.clientX, e.clientY);

      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', onPointerUp, true);
      window.addEventListener('pointercancel', onPointerUp, true);
      e.preventDefault?.();
    };

    document.querySelectorAll('.hm-slot').forEach((el) => {
      // Prevent native HTML5 drag behavior entirely.
      el.removeAttribute('draggable');
      el.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
      });

      el.addEventListener('pointerdown', (e) => {
        // Only left mouse / primary touch
        if (e.button !== undefined && e.button !== 0) return;
        const slot = Number(el.getAttribute('data-slot'));
        const slotMax = Array.isArray(state.puzzle?.whitePieces) ? state.puzzle.whitePieces.length : 0;
        if (!(slot >= 0 && slot < slotMax)) return;
        startDragFromSlotEl(el, slot, e);
      });
    });

    // Allow dragging already-placed pieces from the board (so user doesn't need to re-select slots).
    document.querySelectorAll('.hm-square').forEach((sq) => {
      sq.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        const idx = Number(sq.getAttribute('data-idx'));
        if (!Number.isFinite(idx)) return;
        const slot = state.placed.findIndex(v => v === idx);
        if (slot === -1) return; // only allow dragging placed white pieces

        // Use the piece visual in this square as ghost.
        const img = sq.querySelector('.hm-piece-img');
        const glyph = sq.querySelector('.hm-piece-glyph');

        const ghost = document.createElement('div');
        ghost.className = 'hm-drag-ghost';
        if (img && img.getAttribute('src')) {
          const gi = document.createElement('img');
          gi.src = img.getAttribute('src');
          gi.alt = '';
          ghost.appendChild(gi);
        } else if (glyph) {
          const span = document.createElement('span');
          span.textContent = glyph.textContent || '';
          ghost.appendChild(span);
        }
        document.body.appendChild(ghost);

        dragging = { slot, ghostEl: ghost, lastOverSquareEl: null, originSquareEl: sq };
        sq.classList.add('hm-drag-origin');
        document.body.classList.add('hm-dragging');
        state.selectedPieceSlot = slot;

        moveGhost(e.clientX, e.clientY);
        window.addEventListener('pointermove', onPointerMove, true);
        window.addEventListener('pointerup', onPointerUp, true);
        window.addEventListener('pointercancel', onPointerUp, true);
        e.preventDefault?.();
      });
    });
  }

  function renderBoard(board) {
    const squaresHtml = [];
    for (let y = BOARD_SIZE - 1; y >= 0; y--) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const idx = xyToIdx(x, y);
        const coord = `${FILES[x]}${RANKS[y]}`;
        const isDark = (x + y) % 2 === 1;
        const piece = board[idx];
        const visual = piece ? renderPieceVisual(piece, pieceName(piece)) : '';
        squaresHtml.push(`
          <div class="hm-square ${isDark ? 'dark' : 'light'}" data-idx="${idx}" aria-label="${coord}">
            <div class="hm-piece">${visual}</div>
          </div>
        `);
      }
    }
    return squaresHtml.join('');
  }

  function render() {
    const root = getRoot();
    if (!root) return;

    const player = getSinglePlayer();
    const playerName = player ? player.name : 'Unknown';

    const challengeLeaderboardHtml = () => {
      if (!state.ui.challengeLeaderboardOpen) return '';
      const sec = Number(state.challengeLeaderboard.durationSec || 60) || 60;
      const tabs = [
        { sec: 60, label: '1 min' },
        { sec: 120, label: '2 min' },
        { sec: 180, label: '3 min' }
      ];
      return `
        <div class="hm-modal-backdrop" id="hmChallengeLeaderboardBackdrop" role="presentation">
          <div class="hm-modal" role="dialog" aria-modal="true" aria-label="Hope Mate Challenge Leaderboard">
            <div class="hm-modal-header">
              <div class="hm-modal-title">Challenge Leaderboard</div>
              <button id="hmChallengeLeaderboardClose" class="hm-modal-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="hm-modal-body">
              <div class="hm-actions" style="justify-content:flex-start; gap:8px; margin-bottom:10px;">
                ${tabs.map(t => `
                  <button class="btn btn-secondary" type="button" data-hm-clb-sec="${t.sec}" ${t.sec === sec ? 'style="border-color: rgba(102,126,234,0.65); background: rgba(102,126,234,0.10);"' : ''}>
                    ${t.label}
                  </button>
                `).join('')}
              </div>
              ${state.challengeLeaderboard.loading ? `<div class="hm-muted">Loading...</div>` : ''}
              ${state.challengeLeaderboard.error ? `<div class="hm-muted">${escapeHtml(state.challengeLeaderboard.error)}</div>` : ''}
              <div class="hm-leaderboard-list">
                ${(() => {
                  const meId = String(player?.id || '');
                  const entries = Array.isArray(state.challengeLeaderboard.entries) ? state.challengeLeaderboard.entries : [];
                  const top = entries.slice(0, 20);
                  if (!state.challengeLeaderboard.loading && top.length === 0) {
                    return `<div class="hm-muted">No records yet.</div>`;
                  }
                  return top.map((e, idx) => {
                    const sid = String(e?.student?.id || e?.studentId || e?.id || '');
                    const name = String(e?.student?.name || e?.name || 'Unknown');
                    const solved = Number(e?.totalSolved ?? 0) || 0;
                    const lvl = Number(e?.bestLevel ?? 1) || 1;
                    const tleft = Number(e?.bestTimeLeftSec ?? 0) || 0;
                    const isMe = meId && sid === meId;
                    return `
                      <div class="hm-leaderboard-row ${isMe ? 'is-me' : ''}">
                        <div class="hm-leaderboard-rank">${idx + 1}</div>
                        <div class="hm-leaderboard-name">${escapeHtml(name)}</div>
                        <div class="hm-leaderboard-score">${solved} <span class="hm-muted" style="font-weight:600;">(Lv ${lvl}, ${formatMmSs(tleft)} left)</span></div>
                      </div>
                    `;
                  }).join('');
                })()}
              </div>
            </div>
          </div>
        </div>
      `;
    };

    const pieces = state.puzzle ? state.puzzle.whitePieces : ['?', '?'];
    const slot0Active = state.selectedPieceSlot === 0 ? 'active' : '';
    const slot1Active = state.selectedPieceSlot === 1 ? 'active' : '';

    const slotLabel = (slot) => {
      const p = pieces[slot];
      return `
        <button class="hm-slot ${slot === 0 ? slot0Active : slot1Active}" type="button" data-slot="${slot}" aria-label="Piece slot ${slot + 1}">
          <span class="hm-slot-badge">${slot + 1}</span>
          <span class="hm-slot-piece">${renderPieceVisual(p, pieceName(p))}</span>
        </button>
      `;
    };

    if (state.screen === 'home') {
      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Choose a mode to begin.</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-mode-menu" role="navigation" aria-label="Hope Mate mode menu">
              <button id="hmChallengeBtn" class="btn btn-secondary hm-mode-btn" type="button">Challenge Mode</button>
              <button id="hmPracticeBtn" class="btn btn-primary hm-mode-btn" type="button">Practice Mode</button>
              <button id="hmRulesBtn" class="btn btn-secondary hm-mode-btn" type="button">Rules</button>
              <button id="hmHomeLeaderboardBtn" class="btn btn-secondary hm-mode-btn" type="button">Leaderboard</button>
            </div>
          </div>

          <div class="hm-piece-tray" style="max-width:720px; margin: 0 auto;">
            <div class="hm-piece-tray-title">Status</div>
            <div class="hm-muted"><strong>Student:</strong> ${escapeHtml(playerName)}</div>
            <div class="hm-muted" style="margin-top:6px;">Practice Mode is available now.</div>
          </div>
        </div>

        ${challengeLeaderboardHtml()}
      `;
      document.getElementById('hmPracticeBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.ui.challengeLeaderboardOpen = false;
        state.screen = 'practiceSelect';
        render();
      });
      document.getElementById('hmChallengeBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.ui.challengeLeaderboardOpen = false;
        state.screen = 'challengeSelect';
        render();
      });
      document.getElementById('hmRulesBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.ui.challengeLeaderboardOpen = false;
        state.screen = 'rules';
        render();
      });
      document.getElementById('hmHomeLeaderboardBtn')?.addEventListener('click', () => {
        openChallengeLeaderboard(60);
        refreshChallengeLeaderboard(60);
      });
      document.getElementById('hmChallengeLeaderboardClose')?.addEventListener('click', closeChallengeLeaderboard);
      document.getElementById('hmChallengeLeaderboardBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'hmChallengeLeaderboardBackdrop') closeChallengeLeaderboard();
      });
      root.querySelectorAll('[data-hm-clb-sec]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sec = Number(btn.getAttribute('data-hm-clb-sec'));
          if (![60, 120, 180].includes(sec)) return;
          openChallengeLeaderboard(sec);
          refreshChallengeLeaderboard(sec);
        });
      });
      return;
    }

    if (state.screen === 'challengeSelect') {
      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Challenge Mode — Select a time limit</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-actions">
              <button id="hmChallengeBackBtn" class="btn btn-secondary" type="button">Back</button>
            </div>
          </div>

          <div class="hm-piece-tray" style="max-width:520px; margin: 0 auto;">
            <div class="hm-piece-tray-title">Time</div>
            <div class="hm-mode-menu" style="margin-top:8px;">
              <button class="btn btn-primary hm-mode-btn" type="button" data-sec="60">1 min</button>
              <button class="btn btn-primary hm-mode-btn" type="button" data-sec="120">2 min</button>
              <button class="btn btn-primary hm-mode-btn" type="button" data-sec="180">3 min</button>
            </div>
            <div class="hm-muted" style="margin-top:10px;">
              Start at Level 1. Every 2 correct puzzles increases the level (max Level 10).
            </div>
          </div>
        </div>

        ${challengeLeaderboardHtml()}
      `;

      document.getElementById('hmChallengeBackBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.ui.challengeLeaderboardOpen = false;
        state.screen = 'home';
        render();
      });
      root.querySelectorAll('[data-sec]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sec = Number(btn.getAttribute('data-sec'));
          if (![60, 120, 180].includes(sec)) return;
          resetChallengeState(sec);
          state.screen = 'challengeGame';
          newChallengePuzzle();
          setStatus('Challenge started. Place both pieces, then Confirm.', 'info');
          render();
          startChallengeTimer();
          // Preload leaderboard for the selected duration (optional)
          refreshChallengeLeaderboard(sec);
        });
      });
      document.getElementById('hmChallengeLeaderboardClose')?.addEventListener('click', closeChallengeLeaderboard);
      document.getElementById('hmChallengeLeaderboardBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'hmChallengeLeaderboardBackdrop') closeChallengeLeaderboard();
      });
      root.querySelectorAll('[data-hm-clb-sec]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sec = Number(btn.getAttribute('data-hm-clb-sec'));
          if (![60, 120, 180].includes(sec)) return;
          openChallengeLeaderboard(sec);
          refreshChallengeLeaderboard(sec);
        });
      });
      return;
    }

    if (state.screen === 'rules') {
      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Rules</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-actions">
              <button id="hmRulesBackBtn" class="btn btn-secondary" type="button">Back</button>
            </div>
          </div>

          <div class="hm-piece-tray" style="max-width:820px; margin: 0 auto;">
            <div class="hm-piece-tray-title">How to play</div>
            <div class="hm-muted" style="line-height:1.6;">
              <div style="margin-bottom:10px;"><strong>Goal:</strong> Place all given white pieces so that it is <strong>Black to move</strong>, and the position is <strong>checkmate</strong>.</div>
              <div style="margin-bottom:10px;"><strong>Confirm:</strong> You can re-place pieces freely before confirming. No “temporary check” hints are shown.</div>
              <div style="margin-bottom:10px;"><strong>Success / Failure:</strong> Checkmate = success. <strong>Stalemate = failure</strong>.</div>
              <div style="margin-bottom:10px;"><strong>Piece rules:</strong> Standard chess rules apply. White pawns cannot be placed on rank 1. White king (if present) cannot be placed adjacent to the black king, and cannot be placed on a square attacked by black.</div>
              <div style="margin-bottom:10px;"><strong>Scoring:</strong> +1 only if you solve the puzzle on the first correct attempt. If you failed once on the same puzzle, solving it later gives 0 points.</div>
              <div style="margin-bottom:10px;"><strong>Modes:</strong>
                <div>- <strong>Practice</strong>: Pick a level and solve puzzles with no time limit.</div>
                <div>- <strong>Challenge</strong>: Choose 1/2/3 minutes. Start at Level 1. Every 2 solved puzzles increases the level (max Level 10).</div>
              </div>
              <div><strong>Controls:</strong> Click-to-place or drag-and-drop pieces. You can also drag already-placed pieces.</div>
            </div>
          </div>
        </div>
      `;
      document.getElementById('hmRulesBackBtn')?.addEventListener('click', () => {
        state.screen = 'home';
        render();
      });
      return;
    }

    if (state.screen === 'practiceSelect') {
      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Practice Mode — Select a level</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-actions">
              <button id="hmBackHomeBtn" class="btn btn-secondary" type="button">Back</button>
            </div>
          </div>

          <div class="hm-piece-tray" style="max-width:720px; margin: 0 auto;">
            <div class="hm-piece-tray-title">Levels</div>
            <div class="hm-level-grid">
              ${PRACTICE_LEVELS.map(l => `
                <button class="hm-level-btn ${l === state.practiceLevel ? 'active' : ''}" type="button" data-level="${l}" aria-label="Level ${l}">
                  <span class="hm-level-number">${l}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      document.getElementById('hmBackHomeBtn')?.addEventListener('click', () => {
        state.screen = 'home';
        render();
      });
      document.querySelectorAll('.hm-level-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const lvl = Number(btn.getAttribute('data-level'));
          if (!Number.isFinite(lvl) || lvl < 1 || lvl > 10) return;
          state.practiceLevel = Math.floor(lvl);
          writeStoredPracticeLevel(state.practiceLevel);
          state.screen = 'practiceGame';
          newPuzzle();
          setStatus('New puzzle generated. Place both pieces, then Confirm.', 'info');
          render();
          refreshLeaderboard();
        });
      });
      return;
    }

    if (state.screen === 'challengeGame') {
      const cfg = challengeConfigForLevel(state.challenge.level);
      const levelLabel = `Level ${cfg.level} (${cfg.boardSize}×${cfg.boardSize}, black pieces: ${cfg.blackExtraCount})`;
      const timerLabel = formatMmSs(state.challenge.timeLeftSec);

      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Challenge Mode — ${escapeHtml(levelLabel)} — Place 2 pieces to checkmate the black king (black to move).</div>
            </div>
            <div class="hope-mate-meta">
              <div><strong>Student:</strong> ${escapeHtml(playerName)}</div>
              <div><strong>Timer:</strong> <span id="hmChallengeTimer">${escapeHtml(timerLabel)}</span></div>
              <div><strong>Level:</strong> ${state.challenge.level}</div>
              <div><strong>Progress:</strong> ${state.challenge.solvedInLevel}/2</div>
              <div><strong>Solved:</strong> ${state.challenge.totalSolved}</div>
              <div><strong>Session:</strong> ${state.sessionScore}</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-actions">
              <button id="hmChallengeQuitBtn" class="btn btn-secondary" type="button">Quit</button>
              <button id="hmChallengeRestartBtn" class="btn btn-secondary" type="button">Restart</button>
              <button id="hopeMateLeaderboardBtn" class="btn btn-secondary" type="button">Leaderboard</button>
              <button id="hopeMateResetBtn" class="btn btn-secondary" type="button">Reset placement</button>
              <button id="hmChallengeNextBtn" class="btn btn-secondary" type="button">Next</button>
            </div>
          </div>

          <div id="hopeMateStatus" class="hope-mate-status is-info">${escapeHtml(lastStatus.text || 'Generating puzzle...')}</div>

          <div class="hope-mate-main">
            <div class="hope-mate-left">
              <div class="hm-piece-tray">
                <div class="hm-piece-tray-title">Your pieces (click or drag to a square)</div>
                <div class="hm-slots">
                  ${slotLabel(0)}
                  ${slotLabel(1)}
                </div>
                <div class="hm-piece-tray-hint">You can change placement before Confirm. No partial feedback is shown.</div>

                <div class="hm-piece-tray-footer" aria-label="Challenge actions">
                  <button id="hopeMateConfirmBtn" class="btn btn-primary" type="button">Confirm</button>
                  <button id="hopeMateCancelBtn" class="btn btn-secondary" type="button">Cancel</button>
                </div>
              </div>
            </div>

            <div class="hope-mate-board-wrap">
              <div class="hm-board-container">
                <div class="hm-board-shell" style="--hm-board-size:${BOARD_SIZE}">
                  <div class="hm-board-col-labels" aria-hidden="true">
                    ${FILES.map(f => `<div class="hm-col-label">${f.toUpperCase()}</div>`).join('')}
                  </div>
                  <div class="hm-board-row-labels" aria-hidden="true">
                    ${[...RANKS].reverse().map(r => `<div class="hm-row-label">${r}</div>`).join('')}
                  </div>
                  <div id="hopeMateBoard" class="hm-board" role="grid" aria-label="Hope Mate board">
                    ${renderBoard(state.board || buildEmptyBoard())}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        ${state.ui.leaderboardOpen ? `
          <div class="hm-modal-backdrop" id="hmLeaderboardBackdrop" role="presentation">
            <div class="hm-modal" role="dialog" aria-modal="true" aria-label="Hope Mate Leaderboard">
              <div class="hm-modal-header">
                <div class="hm-modal-title">Leaderboard (your teacher)</div>
                <button id="hmLeaderboardClose" class="hm-modal-close" type="button" aria-label="Close">&times;</button>
              </div>
              <div class="hm-modal-body">
                ${state.leaderboard.loading ? `<div class="hm-muted">Loading...</div>` : ''}
                ${state.leaderboard.error ? `<div class="hm-muted">${escapeHtml(state.leaderboard.error)}</div>` : ''}
                <div class="hm-leaderboard-list">
                  ${(() => {
                    const meId = String(player?.id || '');
                    const entries = Array.isArray(state.leaderboard.entries) ? state.leaderboard.entries : [];
                    const top = entries.slice(0, 20);
                    if (!state.leaderboard.loading && top.length === 0) {
                      return `<div class="hm-muted">No records yet.</div>`;
                    }
                    return top.map((e, idx) => {
                      const sid = String(e?.student?.id || e?.studentId || e?.id || '');
                      const name = String(e?.student?.name || e?.name || 'Unknown');
                      const score = Number(e?.totalScore ?? e?.score ?? 0) || 0;
                      const isMe = meId && sid === meId;
                      return `
                        <div class="hm-leaderboard-row ${isMe ? 'is-me' : ''}">
                          <div class="hm-leaderboard-rank">${idx + 1}</div>
                          <div class="hm-leaderboard-name">${escapeHtml(name)}</div>
                          <div class="hm-leaderboard-score">${score}</div>
                        </div>
                      `;
                    }).join('');
                  })()}
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        ${state.ui.resultOpen ? `
          <div class="hm-modal-backdrop" id="hmResultBackdrop" role="presentation">
            <div class="hm-modal hm-result-modal" role="dialog" aria-modal="true" aria-label="Hope Mate Result">
              <div class="hm-modal-header">
                <div class="hm-modal-title">${state.ui.resultKind === 'correct' ? 'Correct' : 'Incorrect'}</div>
                <button id="hmResultClose" class="hm-modal-close" type="button" aria-label="Close">&times;</button>
              </div>
              <div class="hm-modal-body">
                <div class="hm-result-message">${escapeHtml(state.ui.resultMessage || '')}</div>
                <div class="hm-result-actions">
                  ${state.ui.resultKind === 'correct'
                    ? `<button id="hmResultNext" class="btn btn-primary" type="button">Next</button>`
                    : `<button id="hmResultRedo" class="btn btn-primary" type="button">Redo</button>`
                  }
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        ${challengeLeaderboardHtml()}
      `;

      document.getElementById('hmChallengeQuitBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.screen = 'home';
        render();
      });
      document.getElementById('hmChallengeRestartBtn')?.addEventListener('click', () => {
        const sec = Number(state.challenge.durationSec || 60) || 60;
        resetChallengeState(sec);
        newChallengePuzzle();
        setStatus('Challenge restarted. Place both pieces, then Confirm.', 'info');
        render();
        startChallengeTimer();
      });
      document.getElementById('hmChallengeNextBtn')?.addEventListener('click', nextChallengePuzzle);
      document.getElementById('hopeMateLeaderboardBtn')?.addEventListener('click', () => {
        const sec = Number(state.challenge.durationSec || 60) || 60;
        openChallengeLeaderboard(sec);
        refreshChallengeLeaderboard(sec);
      });
      document.getElementById('hopeMateResetBtn')?.addEventListener('click', resetPlacements);
      document.getElementById('hopeMateConfirmBtn')?.addEventListener('click', confirm);
      document.getElementById('hopeMateCancelBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.screen = 'challengeSelect';
        render();
      });

      document.getElementById('hmLeaderboardClose')?.addEventListener('click', closeLeaderboard);
      document.getElementById('hmLeaderboardBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'hmLeaderboardBackdrop') closeLeaderboard();
      });

      document.getElementById('hmResultClose')?.addEventListener('click', closeResult);
      document.getElementById('hmResultBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'hmResultBackdrop') closeResult();
      });
      document.getElementById('hmResultNext')?.addEventListener('click', () => {
        closeResult();
        // In Challenge, Next advances difficulty progression handled in confirm()
        nextChallengePuzzle();
      });
      document.getElementById('hmResultRedo')?.addEventListener('click', () => {
        closeResult();
        resetPlacements();
        setStatus('Redo: place both pieces again, then Confirm.', 'info');
      });

      document.getElementById('hmChallengeLeaderboardClose')?.addEventListener('click', closeChallengeLeaderboard);
      document.getElementById('hmChallengeLeaderboardBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'hmChallengeLeaderboardBackdrop') closeChallengeLeaderboard();
      });
      root.querySelectorAll('[data-hm-clb-sec]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sec = Number(btn.getAttribute('data-hm-clb-sec'));
          if (![60, 120, 180].includes(sec)) return;
          openChallengeLeaderboard(sec);
          refreshChallengeLeaderboard(sec);
        });
      });

      // Bind board interactions + drag
      document.querySelectorAll('.hm-square').forEach((el) => {
        el.addEventListener('click', () => {
          const idx = Number(el.getAttribute('data-idx'));
          if (Number.isFinite(idx)) onSquareClick(idx);
        });
      });
      // Ensure CSS grid uses current board size (important when switching 5x5 <-> 8x8)
      document.querySelector('.hm-board-shell')?.style.setProperty('--hm-board-size', String(BOARD_SIZE));
      enableDragAndDrop();
      return;
    }

    // practiceGame (current implementation)
    const cfg = getPracticeConfig(state.practiceLevel);
    const levelLabel = `Level ${cfg.level} (${cfg.boardSize}×${cfg.boardSize}, black pieces: ${cfg.blackExtraCount})`;

    root.innerHTML = `
      <div class="hope-mate-shell">
        <div class="hope-mate-topbar">
          <div class="hope-mate-title-wrap">
            <div class="hope-mate-title">✨ Hope Mate</div>
            <div class="hope-mate-subtitle">Practice Mode — ${escapeHtml(levelLabel)} — Place 2 pieces to checkmate the black king (black to move).</div>
          </div>
          <div class="hope-mate-meta">
            <div><strong>Student:</strong> ${escapeHtml(playerName)}</div>
            <div><strong>Session:</strong> ${state.sessionScore}</div>
            <div><strong>Total:</strong> ${state.totalScore}</div>
            <div><strong>Best session:</strong> ${state.bestScore}</div>
          </div>
        </div>

        <div class="hope-mate-controls">
          <div class="hm-actions">
            <button id="hmPracticeLevelsBtn" class="btn btn-secondary" type="button">Levels</button>
            <button id="hopeMateLeaderboardBtn" class="btn btn-secondary" type="button">Practice Leaderboard</button>
            <button id="hopeMateResetBtn" class="btn btn-secondary" type="button">Reset placement</button>
            <button id="hopeMateNextBtn" class="btn btn-secondary" type="button">Next</button>
          </div>
        </div>

        <div id="hopeMateStatus" class="hope-mate-status is-info">${escapeHtml(lastStatus.text || 'Generating puzzle...')}</div>

        <div class="hope-mate-main">
          <div class="hope-mate-left">
            <div class="hm-piece-tray">
              <div class="hm-piece-tray-title">Your pieces (click or drag to a square)</div>
              <div class="hm-slots">
                ${slotLabel(0)}
                ${slotLabel(1)}
              </div>
              <div class="hm-piece-tray-hint">You can change placement before Confirm. No partial feedback is shown.</div>

              <div class="hm-piece-tray-footer" aria-label="Practice actions">
                <button id="hopeMateConfirmBtn" class="btn btn-primary" type="button">Confirm</button>
                <button id="hopeMateCancelBtn" class="btn btn-secondary" type="button">Cancel</button>
              </div>
            </div>
          </div>

          <div class="hope-mate-board-wrap">
            <div class="hm-board-container">
              <div class="hm-board-shell">
                <div class="hm-board-col-labels" aria-hidden="true">
                  ${FILES.map(f => `<div class="hm-col-label">${f.toUpperCase()}</div>`).join('')}
                </div>
                <div class="hm-board-row-labels" aria-hidden="true">
                  ${[...RANKS].reverse().map(r => `<div class="hm-row-label">${r}</div>`).join('')}
                </div>
                <div id="hopeMateBoard" class="hm-board" role="grid" aria-label="Hope Mate 5x5 board">
                  ${renderBoard(state.board || buildEmptyBoard())}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${state.ui.leaderboardOpen ? `
        <div class="hm-modal-backdrop" id="hmLeaderboardBackdrop" role="presentation">
          <div class="hm-modal" role="dialog" aria-modal="true" aria-label="Hope Mate Leaderboard">
            <div class="hm-modal-header">
              <div class="hm-modal-title">Leaderboard (your teacher)</div>
              <button id="hmLeaderboardClose" class="hm-modal-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="hm-modal-body">
              ${state.leaderboard.loading ? `<div class="hm-muted">Loading...</div>` : ''}
              ${state.leaderboard.error ? `<div class="hm-muted">${escapeHtml(state.leaderboard.error)}</div>` : ''}
              <div class="hm-leaderboard-list">
                ${(() => {
                  const meId = String(player?.id || '');
                  const entries = Array.isArray(state.leaderboard.entries) ? state.leaderboard.entries : [];
                  const top = entries.slice(0, 20);
                  if (!state.leaderboard.loading && top.length === 0) {
                    return `<div class="hm-muted">No records yet.</div>`;
                  }
                  return top.map((e, idx) => {
                    const sid = String(e?.student?.id || e?.studentId || e?.id || '');
                    const name = String(e?.student?.name || e?.name || 'Unknown');
                    const score = Number(e?.totalScore ?? e?.score ?? 0) || 0;
                    const isMe = meId && sid === meId;
                    return `
                      <div class="hm-leaderboard-row ${isMe ? 'is-me' : ''}">
                        <div class="hm-leaderboard-rank">${idx + 1}</div>
                        <div class="hm-leaderboard-name">${escapeHtml(name)}</div>
                        <div class="hm-leaderboard-score">${score}</div>
                      </div>
                    `;
                  }).join('');
                })()}
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      ${state.ui.resultOpen ? `
        <div class="hm-modal-backdrop" id="hmResultBackdrop" role="presentation">
          <div class="hm-modal hm-result-modal" role="dialog" aria-modal="true" aria-label="Hope Mate Result">
            <div class="hm-modal-header">
              <div class="hm-modal-title">${state.ui.resultKind === 'correct' ? 'Correct' : 'Incorrect'}</div>
              <button id="hmResultClose" class="hm-modal-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="hm-modal-body">
              <div class="hm-result-message">${escapeHtml(state.ui.resultMessage || '')}</div>
              <div class="hm-result-actions">
                ${state.ui.resultKind === 'correct'
                  ? `<button id="hmResultNext" class="btn btn-primary" type="button">Next</button>`
                  : `<button id="hmResultRedo" class="btn btn-primary" type="button">Redo</button>`
                }
              </div>
            </div>
          </div>
        </div>
      ` : ''}
    `;

    // Wire events
    document.querySelectorAll('.hm-square').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-idx'));
        if (Number.isFinite(idx)) onSquareClick(idx);
      });
    });
    document.querySelectorAll('.hm-slot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = Number(btn.getAttribute('data-slot'));
        if (slot === 0 || slot === 1) onSelectSlot(slot);
      });
    });
    document.getElementById('hopeMateResetBtn')?.addEventListener('click', resetPlacements);
    document.getElementById('hopeMateConfirmBtn')?.addEventListener('click', confirm);
    document.getElementById('hopeMateNextBtn')?.addEventListener('click', nextPuzzle);
    document.getElementById('hopeMateCancelBtn')?.addEventListener('click', () => {
      // Cancel current practice puzzle and return to level select.
      state.screen = 'practiceSelect';
      render();
    });
    document.getElementById('hmPracticeLevelsBtn')?.addEventListener('click', () => {
      state.screen = 'practiceSelect';
      render();
    });
    document.getElementById('hopeMateLeaderboardBtn')?.addEventListener('click', () => {
      // Open and refresh (if needed)
      openLeaderboard();
      if (!state.leaderboard.loading && (!state.leaderboard.entries || state.leaderboard.entries.length === 0)) {
        refreshLeaderboard();
      }
    });
    // Update CSS variable for board size
    document.querySelector('.hm-board-shell')?.style.setProperty('--hm-board-size', String(BOARD_SIZE));

    document.getElementById('hmLeaderboardClose')?.addEventListener('click', closeLeaderboard);
    document.getElementById('hmLeaderboardBackdrop')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'hmLeaderboardBackdrop') closeLeaderboard();
    });

    document.getElementById('hmResultClose')?.addEventListener('click', closeResult);
    document.getElementById('hmResultBackdrop')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'hmResultBackdrop') closeResult();
    });
    document.getElementById('hmResultNext')?.addEventListener('click', () => {
      closeResult();
      nextPuzzle();
    });
    document.getElementById('hmResultRedo')?.addEventListener('click', () => {
      closeResult();
      resetPlacements();
      setStatus('Redo: place both pieces again, then Confirm.', 'info');
    });

    // Drag-and-drop is optional; click-to-place still works.
    enableDragAndDrop();
  }

  function init() {
    // Enforce exactly one student in this MVP (teacher side already blocks, but keep safe here)
    const player = getSinglePlayer();
    if (!player) {
      const root = getRoot();
      if (root) {
        root.innerHTML = `
          <div class="hope-mate-card">
            <h2 class="hope-mate-title">✨ Hope Mate</h2>
            <p class="hope-mate-subtitle">This game currently supports exactly 1 student.</p>
          </div>
        `;
      }
      return;
    }

    state.practiceLevel = readStoredPracticeLevel();
    const cfg = getPracticeConfig(state.practiceLevel);
    setBoardSize(cfg.boardSize);
    loadScores();
    lastStatus = { text: 'Welcome to Hope Mate. Choose Practice Mode to begin.', kind: 'info' };
    state.screen = 'home';
    state.puzzle = null;
    state.board = buildEmptyBoard();
    state.placed = [];
    render();
  }

  window.initHopeMate = function initHopeMate() {
    init();
  };
})();


