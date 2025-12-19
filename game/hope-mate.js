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
  const FILES = ['a', 'b', 'c', 'd', 'e'];
  const RANKS = [1, 2, 3, 4, 5];
  const SIZE = 5;

  const PIECE_POOL_WHITE = ['Q', 'R', 'B', 'N', 'K', 'P']; // includes pawn & king
  const PIECE_POOL_BLACK = ['q', 'r', 'b', 'n', 'p']; // no king duplicates allowed

  const LEVELS = [
    { key: 'level1', name: 'Level 1 (K)', blackExtraPiece: false },
    { key: 'level2', name: 'Level 2 (K + 1)', blackExtraPiece: true }
  ];

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
    return y * SIZE + x;
  }

  function idxToCoord(idx) {
    const x = idx % SIZE;
    const y = Math.floor(idx / SIZE);
    return `${FILES[x]}${RANKS[y]}`;
  }

  function coordToIdx(coord) {
    const m = String(coord || '').match(/^([a-e])([1-5])$/);
    if (!m) return null;
    return toIdx(m[1], Number(m[2]));
  }

  function inBounds(x, y) {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
  }

  function idxToXY(idx) {
    return { x: idx % SIZE, y: Math.floor(idx / SIZE) };
  }

  function xyToIdx(x, y) {
    return y * SIZE + x;
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
    return Array(SIZE * SIZE).fill(null);
  }

  function randomPuzzle(levelKey) {
    const level = LEVELS.find((l) => l.key === levelKey) || LEVELS[0];
    const maxTries = 4000;

    for (let attempt = 0; attempt < maxTries; attempt++) {
      const boardBase = buildEmptyBoard();

      // Place black king
      const blackKingIdx = randInt(SIZE * SIZE);
      boardBase[blackKingIdx] = 'k';

      // Optional extra black piece
      if (level.blackExtraPiece) {
        let bp = sample(PIECE_POOL_BLACK);
        // no king duplicates: already enforced by pool
        let bIdx = randInt(SIZE * SIZE);
        if (bIdx === blackKingIdx) continue;
        boardBase[bIdx] = bp;
      }

      // Pick two random white pieces (duplicates allowed)
      const w1 = sample(PIECE_POOL_WHITE);
      const w2 = sample(PIECE_POOL_WHITE);

      // Verify solvable by brute force placements (must exist at least one checkmate)
      const squares = [];
      for (let i = 0; i < SIZE * SIZE; i++) {
        if (boardBase[i]) continue;
        squares.push(i);
      }

      let hasMate = false;
      let sampleSolution = null;

      for (let i = 0; i < squares.length; i++) {
        for (let j = i + 1; j < squares.length; j++) {
          const idx1 = squares[i];
          const idx2 = squares[j];

          // Try both assignments if pieces differ
          const assignmentOptions = (w1 === w2)
            ? [[{ piece: w1, idx: idx1 }, { piece: w2, idx: idx2 }]]
            : [
                [{ piece: w1, idx: idx1 }, { piece: w2, idx: idx2 }],
                [{ piece: w1, idx: idx2 }, { piece: w2, idx: idx1 }]
              ];

          for (const placements of assignmentOptions) {
      const c = validateWhitePlacementConstraints(boardBase, blackKingIdx, placements);
            if (!c.ok) continue;

            const b = cloneBoard(boardBase);
            b[placements[0].idx] = placements[0].piece;
            b[placements[1].idx] = placements[1].piece;

            if (isCheckmate(b)) {
              hasMate = true;
              sampleSolution = placements;
              break;
            }
          }
          if (hasMate) break;
        }
        if (hasMate) break;
      }

      if (!hasMate) continue;

      return {
        levelKey: level.key,
        black: boardBase.slice(),
        blackKingIdx,
        whitePieces: [w1, w2],
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
    levelKey: null,
    puzzle: null,
    board: null,
    placed: [null, null], // indices for the 2 white pieces
    selectedPieceSlot: 0,
    attemptsFailed: false,
    sessionScore: 0,
    totalScore: 0,
    bestScore: 0,
    leaderboard: {
      loading: true,
      error: null,
      entries: []
    },
    ui: {
      leaderboardOpen: false
    }
  };

  function getRoot() {
    return document.getElementById('hopeMateRoot');
  }

  function readStoredLevel() {
    const raw = localStorage.getItem(STORAGE.level);
    if (raw && LEVELS.some((l) => l.key === raw)) return raw;
    return LEVELS[0].key;
  }

  function writeStoredLevel(levelKey) {
    localStorage.setItem(STORAGE.level, levelKey);
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

  function openLeaderboard() {
    state.ui.leaderboardOpen = true;
    render();
  }

  function closeLeaderboard() {
    state.ui.leaderboardOpen = false;
    render();
  }

  function newPuzzle() {
    state.attemptsFailed = false;
    state.placed = [null, null];
    state.selectedPieceSlot = 0;
    state.puzzle = randomPuzzle(state.levelKey);
    state.board = state.puzzle.black.slice();
  }

  function resetPlacements() {
    if (!state.puzzle) return;
    state.placed = [null, null];
    state.selectedPieceSlot = 0;
    state.board = state.puzzle.black.slice();
    render();
  }

  function placePiece(slot, idx) {
    if (!state.puzzle) return;
    const piece = state.puzzle.whitePieces[slot];
    if (!piece) return;
    if (state.puzzle.black[idx]) return; // occupied by black
    // prevent placing on square used by other slot
    const otherSlot = slot === 0 ? 1 : 0;
    if (state.placed[otherSlot] === idx) return;

    // Apply placement constraints early for feedback
    const placements = [];
    placements.push({ piece, idx });
    if (state.placed[otherSlot] != null) {
      placements.push({ piece: state.puzzle.whitePieces[otherSlot], idx: state.placed[otherSlot] });
    }
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
    for (let s = 0; s < 2; s++) {
      const idx = state.placed[s];
      if (idx == null) continue;
      b[idx] = state.puzzle.whitePieces[s];
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
    if (state.placed[0] == null || state.placed[1] == null) {
      setStatus('Place both pieces before confirming.', 'error');
      return;
    }

    const mate = isCheckmate(state.board);
    if (mate) {
      const gained = state.attemptsFailed ? 0 : 1;
      state.sessionScore += gained;
      state.totalScore += gained;
      state.bestScore = Math.max(state.bestScore, state.sessionScore);
      saveScores();
      setStatus(gained ? 'Checkmate! +1 point.' : 'Checkmate! (No points because you already failed this puzzle.)', 'success');
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
      setStatus('Stalemate is a failure. Try again (no points for this puzzle).', 'error');
      render();
      return;
    }

    state.attemptsFailed = true;
    setStatus('Not checkmate. Try again (no points for this puzzle).', 'error');
    render();
  }

  function nextPuzzle() {
    newPuzzle();
    setStatus('New puzzle generated. Place both pieces, then Confirm.', 'info');
    render();
  }

  function onSquareClick(idx) {
    placePiece(state.selectedPieceSlot, idx);
  }

  function onSelectSlot(slot) {
    state.selectedPieceSlot = slot;
    render();
  }

  function enableDragAndDrop() {
    // Slots are draggable; squares accept drops.
    document.querySelectorAll('.hm-slot').forEach((el) => {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (e) => {
        const slot = el.getAttribute('data-slot');
        try {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('text/hopeMateSlot', String(slot));
        } catch {
          // ignore
        }

        // Chess.com-like drag preview: use the piece image as drag ghost.
        try {
          const img = el.querySelector('.hm-piece-img');
          if (img && img.getAttribute('src')) {
            const ghost = document.createElement('img');
            ghost.src = img.getAttribute('src');
            ghost.style.width = '64px';
            ghost.style.height = '64px';
            ghost.style.position = 'fixed';
            ghost.style.left = '-9999px';
            ghost.style.top = '-9999px';
            ghost.style.pointerEvents = 'none';
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 32, 32);
            setTimeout(() => ghost.remove(), 0);
          }
        } catch {
          // ignore
        }
      });
    });

    document.querySelectorAll('.hm-square').forEach((sq) => {
      sq.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      sq.addEventListener('dragenter', () => {
        sq.classList.add('is-drop-target');
      });
      sq.addEventListener('dragleave', () => {
        sq.classList.remove('is-drop-target');
      });
      sq.addEventListener('drop', (e) => {
        e.preventDefault();
        sq.classList.remove('is-drop-target');
        const idx = Number(sq.getAttribute('data-idx'));
        if (!Number.isFinite(idx)) return;
        let slotRaw = null;
        try {
          slotRaw = e.dataTransfer.getData('text/hopeMateSlot');
        } catch {
          slotRaw = null;
        }
        const slot = Number(slotRaw);
        if (!(slot === 0 || slot === 1)) return;
        // Select the dragged slot and place it
        state.selectedPieceSlot = slot;
        placePiece(slot, idx);
      });
    });
  }

  function renderBoard(board) {
    const squaresHtml = [];
    for (let y = SIZE - 1; y >= 0; y--) {
      for (let x = 0; x < SIZE; x++) {
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

    const levelOptions = LEVELS.map((l) => {
      const selected = l.key === state.levelKey ? 'selected' : '';
      return `<option value="${l.key}" ${selected}>${escapeHtml(l.name)}</option>`;
    }).join('');

    const pieces = state.puzzle ? state.puzzle.whitePieces : ['?', '?'];
    const slot0Active = state.selectedPieceSlot === 0 ? 'active' : '';
    const slot1Active = state.selectedPieceSlot === 1 ? 'active' : '';

    const slotLabel = (slot) => {
      const p = pieces[slot];
      return `
        <button class="hm-slot ${slot === 0 ? slot0Active : slot1Active}" type="button" data-slot="${slot}" draggable="true" aria-label="Piece slot ${slot + 1}">
          <span class="hm-slot-badge">${slot + 1}</span>
          <span class="hm-slot-piece">${renderPieceVisual(p, pieceName(p))}</span>
        </button>
      `;
    };

    root.innerHTML = `
      <div class="hope-mate-shell">
        <div class="hope-mate-topbar">
          <div class="hope-mate-title-wrap">
            <div class="hope-mate-title">✨ Hope Mate</div>
            <div class="hope-mate-subtitle">Place 2 pieces to checkmate the black king (black to move).</div>
          </div>
          <div class="hope-mate-meta">
            <div><strong>Student:</strong> ${escapeHtml(playerName)}</div>
            <div><strong>Session:</strong> ${state.sessionScore}</div>
            <div><strong>Total:</strong> ${state.totalScore}</div>
            <div><strong>Best session:</strong> ${state.bestScore}</div>
          </div>
        </div>

        <div class="hope-mate-controls">
          <label class="hm-label">
            <span>Level</span>
            <select id="hopeMateLevelSelect" class="hm-select">${levelOptions}</select>
          </label>
          <div class="hm-actions">
            <button id="hopeMateLeaderboardBtn" class="btn btn-secondary" type="button">Leaderboard</button>
            <button id="hopeMateResetBtn" class="btn btn-secondary" type="button">Reset placement</button>
            <button id="hopeMateConfirmBtn" class="btn btn-primary" type="button">Confirm</button>
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
    document.getElementById('hopeMateLeaderboardBtn')?.addEventListener('click', () => {
      // Open and refresh (if needed)
      openLeaderboard();
      if (!state.leaderboard.loading && (!state.leaderboard.entries || state.leaderboard.entries.length === 0)) {
        refreshLeaderboard();
      }
    });
    document.getElementById('hopeMateLevelSelect')?.addEventListener('change', (e) => {
      const v = e.target?.value;
      if (!LEVELS.some((l) => l.key === v)) return;
      state.levelKey = v;
      writeStoredLevel(v);
      nextPuzzle();
    });

    document.getElementById('hmLeaderboardClose')?.addEventListener('click', closeLeaderboard);
    document.getElementById('hmLeaderboardBackdrop')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'hmLeaderboardBackdrop') closeLeaderboard();
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

    state.levelKey = readStoredLevel();
    loadScores();
    lastStatus = { text: 'New puzzle generated. Place both pieces, then Confirm.', kind: 'info' };
    newPuzzle();
    render();
    refreshLeaderboard();
  }

  window.initHopeMate = function initHopeMate() {
    init();
  };
})();


