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
