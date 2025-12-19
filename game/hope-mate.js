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
    { key: 'stage', name: 'Stage Mode' },
    { key: 'challenge', name: 'Challenge Mode' },
    { key: 'practice', name: 'Practice Mode' },
    { key: 'rules', name: 'Rules' }
  ];

  const PRACTICE_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

  const STAGES = [
    { key: 'rook', label: 'Rook' },
    { key: 'queen', label: 'Queen' },
    { key: 'minor', label: 'Minor pieces' },
    { key: 'pawns', label: 'Pawns' },
    { key: 'twoRooks', label: 'Two Rooks' },
    { key: 'rookKnight', label: 'Rook + Knight' },
    { key: 'queenBishop', label: 'Queen + Bishop' },
    { key: 'queenKnight', label: 'Queen + Knight' },
    { key: 'queenRook', label: 'Queen + Rook' },
    { key: 'threePieces', label: 'Three pieces' }
  ];

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
    total: (studentId) => `hopeMateTotalScore_${String(studentId || 'unknown')}`,
    stage: (studentId, stageKey) => `hopeMateStage_${String(stageKey || 'unknown')}_${String(studentId || 'unknown')}`
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
    const maxTries = BOARD_SIZE === 8 ? 2000 : 4000;

    for (let attempt = 0; attempt < maxTries; attempt++) {
      const boardBase = buildEmptyBoard();

      // Place black king
      const blackKingIdx = randInt(BOARD_SIZE * BOARD_SIZE);
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
        if (BOARD_SIZE <= 5 && blackExtraCount <= 2) {
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
    screen: 'home', // 'home' | 'stageSelect' | 'stageGame' | 'practiceSelect' | 'practiceGame'
    practiceLevel: 1,
    stageKey: null,
    stageProgress: {
      solved: 0,
      target: 10,
      puzzleSolved: false
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
    ui: {
      leaderboardOpen: false,
      resultOpen: false,
      resultKind: null, // 'correct' | 'incorrect'
      resultMessage: ''
    }
  };

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

  function loadStageProgress(stageKey) {
    const player = getSinglePlayer();
    const sid = player?.id || 'unknown';
    const raw = localStorage.getItem(STORAGE.stage(sid, stageKey));
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveStageProgress(stageKey, data) {
    const player = getSinglePlayer();
    const sid = player?.id || 'unknown';
    try {
      localStorage.setItem(STORAGE.stage(sid, stageKey), JSON.stringify(data));
    } catch {
      // ignore
    }
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

  function openLeaderboard() {
    state.ui.leaderboardOpen = true;
    render();
  }

  function closeLeaderboard() {
    state.ui.leaderboardOpen = false;
    render();
  }

  function openResult(kind, message) {
    // Avoid stacking overlays
    state.ui.leaderboardOpen = false;
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
    state.stageProgress.puzzleSolved = false;
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
    if (state.puzzleSolved || state.stageProgress.puzzleSolved) {
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
      if (state.screen === 'stageGame') {
        // Stage: progress only, no score.
        state.stageProgress.puzzleSolved = true;
        const nextSolved = Math.min(state.stageProgress.target, (Number(state.stageProgress.solved) || 0) + 1);
        state.stageProgress.solved = nextSolved;
        const msg = nextSolved >= state.stageProgress.target
          ? `Correct! Stage complete (${nextSolved}/${state.stageProgress.target}).`
          : `Correct! Progress: ${nextSolved}/${state.stageProgress.target}.`;
        setStatus(msg, 'success');
        openResult('correct', msg);
        // Auto-save stage progress (including completion)
        saveStageProgress(state.stageKey, {
          solved: state.stageProgress.solved,
          target: state.stageProgress.target,
          updatedAt: new Date().toISOString()
        });
      } else {
        const gained = state.attemptsFailed ? 0 : 1;
        state.sessionScore += gained;
        state.totalScore += gained;
        state.bestScore = Math.max(state.bestScore, state.sessionScore);
        saveScores();
        state.puzzleSolved = true;
        const msg = gained ? 'Correct! Checkmate. +1 point.' : 'Correct! Checkmate. (No points because you already failed this puzzle.)';
        setStatus(msg, 'success');
        openResult('correct', msg);
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

  function startStageRookPuzzle() {
    // Stage 1: fixed single rook, 8x8 board, random black king + 2 or 3 black pieces.
    setBoardSize(8);
    const blackExtraCount = Math.random() < 0.5 ? 2 : 3;
    const cfg = { level: 1, boardSize: 8, blackExtraCount, whitePieces: ['R'] };
    state.attemptsFailed = false;
    state.puzzleSolved = false;
    state.stageProgress.puzzleSolved = false;
    state.selectedPieceSlot = 0;
    state.puzzle = randomPuzzle(cfg);
    state.board = state.puzzle.black.slice();
    state.placed = new Array((state.puzzle.whitePieces || []).length).fill(null);
    setStatus('New puzzle generated. Place the rook, then Confirm.', 'info');
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
              <button id="hmStageBtn" class="btn btn-secondary hm-mode-btn" type="button">Stage Mode</button>
              <button id="hmChallengeBtn" class="btn btn-secondary hm-mode-btn" type="button">Challenge Mode</button>
              <button id="hmPracticeBtn" class="btn btn-primary hm-mode-btn" type="button">Practice Mode</button>
              <button id="hmRulesBtn" class="btn btn-secondary hm-mode-btn" type="button">Rules</button>
            </div>
          </div>

          <div class="hm-piece-tray" style="max-width:720px; margin: 0 auto;">
            <div class="hm-piece-tray-title">Status</div>
            <div class="hm-muted"><strong>Student:</strong> ${escapeHtml(playerName)}</div>
            <div class="hm-muted" style="margin-top:6px;">Stage/Challenge/Rules UI will be implemented next. Practice is available now.</div>
          </div>
        </div>
      `;
      document.getElementById('hmPracticeBtn')?.addEventListener('click', () => {
        state.screen = 'practiceSelect';
        render();
      });
      document.getElementById('hmStageBtn')?.addEventListener('click', () => {
        state.screen = 'stageSelect';
        render();
      });
      document.getElementById('hmChallengeBtn')?.addEventListener('click', () => {
        alert('Challenge Mode is not implemented yet.');
      });
      document.getElementById('hmRulesBtn')?.addEventListener('click', () => {
        alert('Rules are not implemented yet.');
      });
      return;
    }

    if (state.screen === 'stageSelect') {
      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Stage Mode — Select a stage</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-actions">
              <button id="hmStageBackBtn" class="btn btn-secondary" type="button">Back</button>
            </div>
          </div>

          <div class="hm-piece-tray" style="max-width:720px; margin: 0 auto;">
            <div class="hm-piece-tray-title">Stages</div>
            <div class="hm-stage-grid">
              ${STAGES.map((s, idx) => `
                <button class="hm-stage-btn" type="button" data-stage="${escapeHtml(s.key)}">
                  <span class="hm-stage-number">${idx + 1}</span>
                  <span class="hm-stage-label">${escapeHtml(s.label)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      document.getElementById('hmStageBackBtn')?.addEventListener('click', () => {
        state.screen = 'home';
        render();
      });
      document.querySelectorAll('.hm-stage-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.getAttribute('data-stage') || '';
          const stage = STAGES.find(s => s.key === key);
          if (key === 'rook') {
            state.stageKey = 'rook';
            // Load progress
            const saved = loadStageProgress('rook');
            const solved = Number(saved?.solved) || 0;
            state.stageProgress.solved = Math.max(0, Math.min(state.stageProgress.target, solved));
            state.stageProgress.puzzleSolved = false;
            state.screen = 'stageGame';
            startStageRookPuzzle();
            return;
          }
          alert(`${stage?.label || 'Stage'} is not implemented yet.`);
        });
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

    // stageGame (Stage 1 implemented: rook)
    if (state.screen === 'stageGame') {
      const stageTitle = state.stageKey === 'rook' ? 'Stage 1 — Rook' : 'Stage';
      const progressPct = Math.round((state.stageProgress.solved / state.stageProgress.target) * 100);
      const pieces = state.puzzle ? state.puzzle.whitePieces : [];

      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">${escapeHtml(stageTitle)} — Solve ${state.stageProgress.target} puzzles to complete the stage.</div>
            </div>
            <div class="hope-mate-meta">
              <div><strong>Student:</strong> ${escapeHtml(playerName)}</div>
              <div><strong>Progress:</strong> ${state.stageProgress.solved}/${state.stageProgress.target}</div>
            </div>
          </div>

          <div class="hm-stage-progress">
            <div class="hm-stage-progress-bar">
              <div class="hm-stage-progress-fill" style="width:${progressPct}%;"></div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-actions">
              <button id="hmStageBackBtn2" class="btn btn-secondary" type="button">Stages</button>
              <button id="hopeMateResetBtn" class="btn btn-secondary" type="button">Reset placement</button>
            </div>
          </div>

          <div id="hopeMateStatus" class="hope-mate-status is-info">${escapeHtml(lastStatus.text || 'Generating puzzle...')}</div>

          <div class="hope-mate-main">
            <div class="hope-mate-left">
              <div class="hm-piece-tray">
                <div class="hm-piece-tray-title">Your piece</div>
                <div class="hm-slots">
                  ${pieces.map((p, idx) => `
                    <button class="hm-slot ${state.selectedPieceSlot === idx ? 'active' : ''}" type="button" data-slot="${idx}" aria-label="Piece slot ${idx + 1}">
                      <span class="hm-slot-badge">${idx + 1}</span>
                      <span class="hm-slot-piece">${renderPieceVisual(p, pieceName(p))}</span>
                    </button>
                  `).join('')}
                </div>
                <div class="hm-piece-tray-hint">Place the rook to create checkmate. No partial feedback is shown.</div>

                <div class="hm-piece-tray-footer" aria-label="Stage actions">
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
                    ? `<button id="hmResultNext" class="btn btn-primary" type="button">${state.stageProgress.solved >= state.stageProgress.target ? 'Finish' : 'Next'}</button>`
                    : `<button id="hmResultRedo" class="btn btn-primary" type="button">Redo</button>`
                  }
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      `;

      document.querySelectorAll('.hm-slot').forEach((btn) => {
        btn.addEventListener('click', () => {
          const slot = Number(btn.getAttribute('data-slot'));
          if (Number.isFinite(slot)) {
            state.selectedPieceSlot = slot;
            render();
          }
        });
      });
      document.getElementById('hmStageBackBtn2')?.addEventListener('click', () => {
        state.screen = 'stageSelect';
        render();
      });
      document.getElementById('hopeMateResetBtn')?.addEventListener('click', resetPlacements);
      document.getElementById('hopeMateConfirmBtn')?.addEventListener('click', confirm);
      document.getElementById('hopeMateCancelBtn')?.addEventListener('click', () => {
        state.screen = 'stageSelect';
        render();
      });

      document.getElementById('hmResultClose')?.addEventListener('click', closeResult);
      document.getElementById('hmResultBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'hmResultBackdrop') closeResult();
      });
      document.getElementById('hmResultRedo')?.addEventListener('click', () => {
        closeResult();
        resetPlacements();
        setStatus('Redo: place the rook again, then Confirm.', 'info');
      });
      document.getElementById('hmResultNext')?.addEventListener('click', () => {
        closeResult();
        if (state.stageProgress.solved >= state.stageProgress.target) {
          setStatus('Stage completed! Returning to stage list.', 'success');
          state.screen = 'stageSelect';
          render();
          return;
        }
        // Next stage puzzle
        state.stageProgress.puzzleSolved = false;
        startStageRookPuzzle();
      });

      // Bind board interactions + drag
      document.querySelectorAll('.hm-square').forEach((el) => {
        el.addEventListener('click', () => {
          const idx = Number(el.getAttribute('data-idx'));
          if (Number.isFinite(idx)) onSquareClick(idx);
        });
      });
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
            <button id="hopeMateLeaderboardBtn" class="btn btn-secondary" type="button">Leaderboard</button>
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


