(function () {
  const BOARD_SIZE = 8;
  const WHITE_START = {
    rook: { row: 7, col: 7 }, // h1
    knight: { row: 7, col: 6 }, // g1
    bishop: { row: 7, col: 5 } // f1
  };
  const BLACK_START = {
    rook: { row: 0, col: 0 }, // a8
    knight: { row: 0, col: 1 }, // b8
    bishop: { row: 0, col: 2 } // c8
  };
  const TARGETS = {
    white: { rook: BLACK_START.rook, knight: BLACK_START.knight, bishop: BLACK_START.bishop },
    black: { rook: WHITE_START.rook, knight: WHITE_START.knight, bishop: WHITE_START.bishop }
  };

  const PIECE_INFO = {
    white_rook: { color: 'white', type: 'rook', label: '♖', image: '/assets/pieces/white_Rook.png' },
    white_knight: { color: 'white', type: 'knight', label: '♘', image: '/assets/pieces/white_Knight.png' },
    white_bishop: { color: 'white', type: 'bishop', label: '♗', image: '/assets/pieces/white_Bishop.png' },
    white_queen: { color: 'white', type: 'queen', label: '♕', image: '/assets/pieces/white_Queen.png' },
    black_rook: { color: 'black', type: 'rook', label: '♜', image: '/assets/pieces/black_Rook.png' },
    black_knight: { color: 'black', type: 'knight', label: '♞', image: '/assets/pieces/black_Knight.png' },
    black_bishop: { color: 'black', type: 'bishop', label: '♝', image: '/assets/pieces/black_Bishop.png' },
    black_queen: { color: 'black', type: 'queen', label: '♛', image: '/assets/pieces/black_Queen.png' }
  };

  const DIFFICULTY_PRESETS = {
    starter: {
      label: 'Starter',
      pieces: ['white_rook', 'black_rook']
    },
    easy: {
      label: 'Easy',
      pieces: ['white_rook', 'white_bishop', 'black_rook', 'black_bishop']
    },
    normal: {
      label: 'Normal',
      pieces: ['white_rook', 'white_knight', 'white_bishop', 'black_rook', 'black_knight', 'black_bishop']
    },
    hard: {
      label: 'Hard',
      pieces: ['white_rook', 'white_knight', 'white_bishop', 'white_queen', 'black_rook', 'black_knight', 'black_bishop', 'black_queen']
    }
  };

  const state = {
    players: [],
    boardEl: null,
    logEl: null,
    statusEl: null,
    moveCountEl: null,
    currentSideEl: null,
    leaderboardEl: null,
    startButton: null,
    restartButton: null,
    leaderboardOverlayEl: null,
    leaderboardBodyEl: null,
    keydownListenerAttached: false,
    pieces: [],
    currentTurn: 'white',
    selectedPieceIndex: null,
    moveCount: 0,
    startTimestamp: null,
    gameActive: false,
    logEntries: [],
    currentDifficulty: 'normal',
    leaderboardLists: null,
    leaderboardTabs: null,
    activeLeaderboardTab: 'normal'
  };

  function initRoyalExchange() {
    const container = document.getElementById('royalExchangeGame');
    if (!container) {
      console.error('Royal Exchange container not found');
      return;
    }

    let playersSource = [];
    if (Array.isArray(window.royalExchangePlayers)) {
      playersSource = window.royalExchangePlayers;
    } else {
      try {
        const stored = localStorage.getItem('royalExchangePlayers');
        if (stored) {
          playersSource = JSON.parse(stored);
        }
      } catch (error) {
        console.warn('Unable to read royal exchange players from storage:', error);
      }
    }

    state.players = Array.isArray(playersSource)
      ? playersSource.map(player => ({
          id: player.id,
          name: player.name || 'Unknown',
          studentId: player.studentId || ''
        }))
      : [];

    container.innerHTML = buildLayout();
    cacheDomReferences(container);
    attachListeners(container);
    resetGame();
    renderBoard();
    updateStatus();
    renderLog();
    populatePlayersList();
  }

  function buildLayout() {
    return `
      <div class="re-wrapper">
        <div class="re-board-panel">
          <div class="re-status-bar">
            <div class="re-status-item">
              <span class="re-status-label">Moves</span>
              <span class="re-status-value" id="reMoveCount">0</span>
            </div>
            <div class="re-status-item">
              <span class="re-status-label">Current Side</span>
              <span class="re-status-value" id="reCurrentSide">White</span>
            </div>
            <div class="re-status-item">
              <span class="re-status-label">Status</span>
              <span class="re-status-value" id="reStatus">Awaiting start</span>
            </div>
            <div class="re-status-actions">
              <button type="button" id="reRulesButton" class="re-status-button">Rules</button>
              <button type="button" id="reLeaderboardButton" class="re-status-button">Leaderboards</button>
            </div>
          </div>
          <div class="re-difficulty-bar" id="reDifficultyBar">
            <span class="re-difficulty-label">Difficulty</span>
            <button type="button" class="re-difficulty-button" data-difficulty="starter">Starter</button>
            <button type="button" class="re-difficulty-button" data-difficulty="easy">Easy</button>
            <button type="button" class="re-difficulty-button active" data-difficulty="normal">Normal</button>
            <button type="button" class="re-difficulty-button" data-difficulty="hard">Hard</button>
          </div>
          <div class="re-board-shell">
            <div class="re-board-col-labels">${generateColumnLabels()}</div>
            <div class="re-board-row-labels">${generateRowLabels()}</div>
            <div id="reBoard" class="re-board" role="grid" aria-label="Royal Exchange board"></div>
          </div>
        </div>
        <div class="re-side-panel">
          <section class="re-section">
            <h3>Players</h3>
            <ul id="rePlayersList" class="re-player-list"></ul>
          </section>
          <section class="re-section">
            <h3>Action Log</h3>
            <div id="reLogList" class="re-log-list" aria-live="polite"></div>
            <button type="button" id="reClearLogButton" class="re-secondary re-small">Clear Log</button>
          </section>
          <div class="re-actions re-actions-side">
            <button type="button" id="reStartButton" class="re-primary">Start</button>
            <button type="button" id="reRestartButton" class="re-secondary" disabled>Restart</button>
          </div>
        </div>
      </div>
      <div id="reLeaderboardOverlay" class="re-modal-overlay hidden" aria-hidden="true">
        <div class="re-modal" role="dialog" aria-modal="true" aria-labelledby="reLeaderboardTitle">
          <div class="re-modal-header">
            <div>
              <h2 id="reLeaderboardTitle" class="re-modal-title">Royal Exchange Leaderboard</h2>
              <p class="re-modal-subtitle">Fastest safe swaps</p>
            </div>
            <button type="button" class="re-modal-close" data-modal-close="leaderboard" aria-label="Close leaderboard">✕</button>
          </div>
          <div class="re-modal-tabs" role="tablist">
            <div class="re-modal-tab-group">
              <button type="button" class="re-modal-tab" data-leaderboard-tab="starter">Starter</button>
              <button type="button" class="re-modal-tab" data-leaderboard-tab="easy">Easy</button>
              <button type="button" class="re-modal-tab active" data-leaderboard-tab="normal">Normal</button>
              <button type="button" class="re-modal-tab" data-leaderboard-tab="hard">Hard</button>
            </div>
            <button type="button" id="reRefreshLeaderboard" class="re-secondary re-small">Refresh</button>
          </div>
          <div class="re-modal-body" id="reLeaderboardBody">
            <div id="reLeaderboardListStarter" class="re-leaderboard-list hidden"></div>
            <div id="reLeaderboardListEasy" class="re-leaderboard-list hidden"></div>
            <div id="reLeaderboardListNormal" class="re-leaderboard-list"></div>
            <div id="reLeaderboardListHard" class="re-leaderboard-list hidden"></div>
          </div>
          <div class="re-modal-footer">
            <button type="button" id="reLeaderboardClose" class="re-secondary re-small" data-modal-close="leaderboard">Close</button>
          </div>
        </div>
      </div>
      <div id="reRulesOverlay" class="re-modal-overlay hidden" aria-hidden="true">
        <div class="re-modal" role="dialog" aria-modal="true" aria-labelledby="reRulesTitle">
          <div class="re-modal-header">
            <div>
              <h2 id="reRulesTitle" class="re-modal-title">Royal Exchange Rules</h2>
              <p class="re-modal-subtitle">Stay safe while swapping sides</p>
            </div>
            <button type="button" class="re-modal-close" data-modal-close="rules" aria-label="Close rules">✕</button>
          </div>
          <div class="re-modal-body re-rules-body">
            ${getRulesHtml()}
          </div>
        </div>
      </div>
    `;
  }

  function cacheDomReferences(container) {
    state.boardEl = container.querySelector('#reBoard');
    state.logEl = container.querySelector('#reLogList');
    state.statusEl = container.querySelector('#reStatus');
    state.moveCountEl = container.querySelector('#reMoveCount');
    state.currentSideEl = container.querySelector('#reCurrentSide');
    state.startButton = container.querySelector('#reStartButton');
    state.restartButton = container.querySelector('#reRestartButton');
    state.leaderboardOverlayEl = container.querySelector('#reLeaderboardOverlay');
    state.leaderboardBodyEl = container.querySelector('#reLeaderboardBody');
    state.leaderboardLists = {
      starter: container.querySelector('#reLeaderboardListStarter'),
      easy: container.querySelector('#reLeaderboardListEasy'),
      normal: container.querySelector('#reLeaderboardListNormal'),
      hard: container.querySelector('#reLeaderboardListHard')
    };
    state.leaderboardTabs = container.querySelectorAll('.re-modal-tab');
    state.rulesOverlayEl = container.querySelector('#reRulesOverlay');
  }

  function attachListeners(container) {
    if (state.startButton) {
      state.startButton.addEventListener('click', () => startGame());
    }
    if (state.restartButton) {
      state.restartButton.addEventListener('click', () => {
        resetGame();
        renderBoard();
        updateStatus();
        appendLog('Game reset.', 'info');
      });
    }
    const clearLogButton = container.querySelector('#reClearLogButton');
    if (clearLogButton) {
      clearLogButton.addEventListener('click', () => {
        state.logEntries = [];
        renderLog();
      });
    }
    const leaderboardButton = container.querySelector('#reLeaderboardButton');
    if (leaderboardButton) {
      leaderboardButton.addEventListener('click', openLeaderboardModal);
    }
    const rulesButton = container.querySelector('#reRulesButton');
    if (rulesButton) {
      rulesButton.addEventListener('click', openRulesModal);
    }
    container.querySelectorAll('.re-modal-close').forEach(button => {
      button.addEventListener('click', event => {
        const key = button.getAttribute('data-modal-close');
        if (key === 'leaderboard') {
          closeLeaderboardModal();
        } else if (key === 'rules') {
          closeRulesModal();
        }
      });
    });
    const refreshButton = container.querySelector('#reRefreshLeaderboard');
    if (refreshButton) {
      refreshButton.addEventListener('click', loadLeaderboard);
    }
    if (state.leaderboardTabs) {
      state.leaderboardTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const key = tab.getAttribute('data-leaderboard-tab');
          if (!key) return;
          state.activeLeaderboardTab = key;
          updateLeaderboardTabs();
        });
      });
    }
    if (state.leaderboardOverlayEl) {
      state.leaderboardOverlayEl.addEventListener('click', event => {
        if (event.target === state.leaderboardOverlayEl) {
          closeLeaderboardModal();
        }
      });
    }
    if (state.rulesOverlayEl) {
      state.rulesOverlayEl.addEventListener('click', event => {
        if (event.target === state.rulesOverlayEl) {
          closeRulesModal();
        }
      });
    }
    container.querySelectorAll('.re-difficulty-button').forEach(button => {
      button.addEventListener('click', () => {
        if (state.gameActive) return;
        const difficulty = button.getAttribute('data-difficulty');
        if (!difficulty || difficulty === state.currentDifficulty) return;
        state.currentDifficulty = difficulty;
        updateDifficultyButtons();
        resetGame();
        renderBoard();
        updateStatus();
        appendLog(`Difficulty set to ${DIFFICULTY_PRESETS[difficulty].label}.`, 'info');
      });
    });
    if (!state.keydownListenerAttached) {
      document.addEventListener('keydown', onGlobalKeydown);
      state.keydownListenerAttached = true;
    }
  }

  function resetGame() {
    state.pieces = buildPiecesForDifficulty(state.currentDifficulty);
    state.currentTurn = 'white';
    state.selectedPieceIndex = null;
    state.moveCount = 0;
    state.startTimestamp = null;
    state.gameActive = false;
    state.logEntries = ['Game ready. Press Start to begin.'];
    if (state.startButton) state.startButton.disabled = false;
    if (state.restartButton) state.restartButton.disabled = true;
  }

  function startGame() {
    if (state.gameActive) return;
    state.gameActive = true;
    state.currentTurn = 'white';
    state.moveCount = 0;
    state.startTimestamp = Date.now();
    state.logEntries = [];
    if (state.startButton) state.startButton.disabled = true;
    if (state.restartButton) state.restartButton.disabled = false;
    appendLog('Game started. White moves first.', 'info');
    updateStatus();
    renderLog();
    renderBoard();
  }

  function createPiece(kind, position) {
    return {
      id: kind,
      ...PIECE_INFO[kind],
      row: position.row,
      col: position.col
    };
  }

  function buildPiecesForDifficulty(difficulty) {
    const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.normal;
    return preset.pieces.map(kind => {
      const startPosition = getStartPosition(kind);
      return createPiece(kind, startPosition);
    });
  }

  function getStartPosition(kind) {
    switch (kind) {
      case 'white_rook':
        return WHITE_START.rook;
      case 'white_knight':
        return WHITE_START.knight;
      case 'white_bishop':
        return WHITE_START.bishop;
      case 'white_queen':
        return { row: 7, col: 4 }; // e1
      case 'black_rook':
        return BLACK_START.rook;
      case 'black_knight':
        return BLACK_START.knight;
      case 'black_bishop':
        return BLACK_START.bishop;
      case 'black_queen':
        return { row: 0, col: 3 }; // d8
      default:
        return { row: 0, col: 0 };
    }
  }

  function renderBoard() {
    if (!state.boardEl) return;
    state.boardEl.innerHTML = '';
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `re-cell ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        const pieceIndex = state.pieces.findIndex(p => p.row === row && p.col === col);
        if (pieceIndex !== -1) {
          const piece = state.pieces[pieceIndex];
          const pieceSpan = document.createElement('span');
          pieceSpan.className = `re-piece ${piece.color}`;
          const image = document.createElement('img');
          image.className = 're-piece-image';
          image.alt = `${capitalize(piece.color)} ${piece.type}`;
          image.src = piece.image;
          pieceSpan.appendChild(image);
          cell.appendChild(pieceSpan);
          if (state.selectedPieceIndex === pieceIndex) {
            cell.classList.add('selected');
          }
        }
        cell.addEventListener('click', () => onCellClick(row, col));
        state.boardEl.appendChild(cell);
      }
    }
  }

  function onCellClick(row, col) {
    if (!state.gameActive) return;
    const pieceIndex = state.pieces.findIndex(p => p.row === row && p.col === col);
    if (state.selectedPieceIndex === null) {
      if (pieceIndex === -1) return;
      const piece = state.pieces[pieceIndex];
      if (piece.color !== state.currentTurn) {
        showToast('Please move the current side.', 'warning');
        return;
      }
      state.selectedPieceIndex = pieceIndex;
      renderBoard();
      return;
    }

    const selectedPiece = state.pieces[state.selectedPieceIndex];
    if (pieceIndex !== -1) {
      const targetPiece = state.pieces[pieceIndex];
      if (targetPiece.color === selectedPiece.color) {
        state.selectedPieceIndex = pieceIndex;
        renderBoard();
      } else {
        showToast('Capturing is not allowed in this puzzle.', 'warning');
      }
      return;
    }

    attemptMove(state.selectedPieceIndex, row, col);
  }

  function attemptMove(pieceIndex, targetRow, targetCol) {
    const piece = state.pieces[pieceIndex];
    if (!piece) return;
    const targetSquareOccupied = state.pieces.some(p => p.row === targetRow && p.col === targetCol);
    if (targetSquareOccupied) {
      showToast('Destination must be empty.', 'error');
      return;
    }
    if (!isLegalMove(piece, targetRow, targetCol)) {
      showToast('Illegal move for this piece.', 'error');
      return;
    }
    const original = { row: piece.row, col: piece.col };
    piece.row = targetRow;
    piece.col = targetCol;
    state.selectedPieceIndex = null;
    renderBoard();

    if (causesConflict()) {
      appendLog(`${capitalize(piece.color)} ${piece.type} moved to ${formatCoordinate(piece)} causing an attack. Puzzle failed.`, 'error');
      showToast('Conflict detected! Puzzle failed.', 'error');
      failGame();
      return;
    }

    state.moveCount += 1;
    appendLog(`${capitalize(piece.color)} ${piece.type} moved to ${formatCoordinate(piece)} safely.`, 'success');
    toggleTurn();
    updateStatus();
    renderLog();

    if (checkVictory()) {
      handleVictory();
    }
  }

  function failGame() {
    state.gameActive = false;
    if (state.startButton) state.startButton.disabled = false;
    if (state.restartButton) state.restartButton.disabled = true;
    updateStatus('Failure');
  }

  function toggleTurn() {
    state.currentTurn = state.currentTurn === 'white' ? 'black' : 'white';
  }

  function isLegalMove(piece, targetRow, targetCol) {
    if (piece.row === targetRow && piece.col === targetCol) return false;
    switch (piece.type) {
      case 'rook':
        if (piece.row !== targetRow && piece.col !== targetCol) return false;
        return isPathClear(piece.row, piece.col, targetRow, targetCol);
      case 'bishop':
        if (Math.abs(piece.row - targetRow) !== Math.abs(piece.col - targetCol)) return false;
        return isPathClear(piece.row, piece.col, targetRow, targetCol);
      case 'queen':
        if (piece.row === targetRow || piece.col === targetCol) {
          return isPathClear(piece.row, piece.col, targetRow, targetCol);
        }
        if (Math.abs(piece.row - targetRow) === Math.abs(piece.col - targetCol)) {
          return isPathClear(piece.row, piece.col, targetRow, targetCol);
        }
        return false;
      case 'knight':
        return (Math.abs(piece.row - targetRow) === 2 && Math.abs(piece.col - targetCol) === 1)
          || (Math.abs(piece.row - targetRow) === 1 && Math.abs(piece.col - targetCol) === 2);
      default:
        return false;
    }
  }

  function isPathClear(fromRow, fromCol, toRow, toCol) {
    const rowStep = Math.sign(toRow - fromRow);
    const colStep = Math.sign(toCol - fromCol);
    let row = fromRow + rowStep;
    let col = fromCol + colStep;
    while (row !== toRow || col !== toCol) {
      if (state.pieces.some(p => p.row === row && p.col === col)) {
        return false;
      }
      row += rowStep;
      col += colStep;
    }
    return true;
  }

  function causesConflict() {
    const whitePieces = state.pieces.filter(p => p.color === 'white');
    const blackPieces = state.pieces.filter(p => p.color === 'black');
    return whitePieces.some(w => attacksAny(w, blackPieces)) || blackPieces.some(b => attacksAny(b, whitePieces));
  }

  function attacksAny(attacker, targets) {
    return targets.some(target => canAttack(attacker, target));
  }

  function canAttack(attacker, target) {
    switch (attacker.type) {
      case 'rook':
        if (attacker.row !== target.row && attacker.col !== target.col) return false;
        return isCapturePathClear(attacker.row, attacker.col, target.row, target.col, target);
      case 'bishop':
        if (Math.abs(attacker.row - target.row) !== Math.abs(attacker.col - target.col)) return false;
        return isCapturePathClear(attacker.row, attacker.col, target.row, target.col, target);
      case 'queen':
        if (attacker.row === target.row || attacker.col === target.col) {
          return isCapturePathClear(attacker.row, attacker.col, target.row, target.col, target);
        }
        if (Math.abs(attacker.row - target.row) === Math.abs(attacker.col - target.col)) {
          return isCapturePathClear(attacker.row, attacker.col, target.row, target.col, target);
        }
        return false;
      case 'knight':
        return (Math.abs(attacker.row - target.row) === 2 && Math.abs(attacker.col - target.col) === 1)
          || (Math.abs(attacker.row - target.row) === 1 && Math.abs(attacker.col - target.col) === 2);
      default:
        return false;
    }
  }

  function isCapturePathClear(fromRow, fromCol, toRow, toCol, target) {
    const rowStep = Math.sign(toRow - fromRow);
    const colStep = Math.sign(toCol - fromCol);
    let row = fromRow + rowStep;
    let col = fromCol + colStep;
    while (row !== toRow || col !== toCol) {
      if (state.pieces.some(p => p.row === row && p.col === col)) {
        return false;
      }
      row += rowStep;
      col += colStep;
    }
    return true;
  }

  function checkVictory() {
    const preset = DIFFICULTY_PRESETS[state.currentDifficulty] || DIFFICULTY_PRESETS.normal;
    return preset.pieces.every(kind => {
      const piece = state.pieces.find(p => p.id === kind);
      if (!piece) return false;
      if (piece.type === 'queen') {
        const queenTarget = piece.color === 'white' ? { row: 7, col: 4 } : { row: 0, col: 3 };
        return positionsEqual(piece, queenTarget);
      }
      const target = TARGETS[piece.color]?.[piece.type];
      return target ? positionsEqual(piece, target) : false;
    });
  }

  function positionsEqual(piece, position) {
    return piece.row === position.row && piece.col === position.col;
  }

  async function handleVictory() {
    state.gameActive = false;
    const duration = state.startTimestamp ? Date.now() - state.startTimestamp : 0;
    const message = `Success! All pieces swapped in ${state.moveCount} moves.`;
    appendLog(message, 'success');
    showToast(message, 'success');
    updateStatus('Success');
    if (state.startButton) state.startButton.disabled = false;
    if (state.restartButton) state.restartButton.disabled = true;
    await submitLeaderboardEntry(state.moveCount, duration);
    loadLeaderboard();
  }

  function updateStatus(forced) {
    if (state.moveCountEl) state.moveCountEl.textContent = String(state.moveCount);
    if (state.currentSideEl) state.currentSideEl.textContent = capitalize(state.currentTurn);
    if (state.statusEl) {
      if (forced) {
        state.statusEl.textContent = forced;
      } else if (!state.gameActive) {
        state.statusEl.textContent = 'Awaiting start';
      } else {
        state.statusEl.textContent = 'In progress';
      }
    }
  }

  function renderLog() {
    if (!state.logEl) return;
    state.logEl.innerHTML = state.logEntries.map(entry => `<div class="re-log-entry ${entry.type || 'info'}">${entry.message || entry}</div>`).join('');
    state.logEl.scrollTop = state.logEl.scrollHeight;
  }

  function appendLog(message, type = 'info') {
    state.logEntries.push({ message, type });
    renderLog();
  }

  function showToast(message, type) {
    appendLog(message, type);
  }

  function openLeaderboardModal() {
    state.activeLeaderboardTab = state.currentDifficulty;
    updateLeaderboardTabs();
    loadLeaderboard();
    if (state.leaderboardOverlayEl) {
      state.leaderboardOverlayEl.classList.remove('hidden');
      state.leaderboardOverlayEl.setAttribute('aria-hidden', 'false');
    }
  }

  function closeLeaderboardModal() {
    if (state.leaderboardOverlayEl) {
      state.leaderboardOverlayEl.classList.add('hidden');
      state.leaderboardOverlayEl.setAttribute('aria-hidden', 'true');
    }
  }

  function openRulesModal() {
    if (state.rulesOverlayEl) {
      state.rulesOverlayEl.classList.remove('hidden');
      state.rulesOverlayEl.setAttribute('aria-hidden', 'false');
    }
  }

  function closeRulesModal() {
    if (state.rulesOverlayEl) {
      state.rulesOverlayEl.classList.add('hidden');
      state.rulesOverlayEl.setAttribute('aria-hidden', 'true');
    }
  }

  function onGlobalKeydown(event) {
    if (event.key !== 'Escape') return;
    let handled = false;
    if (state.leaderboardOverlayEl && !state.leaderboardOverlayEl.classList.contains('hidden')) {
      closeLeaderboardModal();
      handled = true;
    }
    if (state.rulesOverlayEl && !state.rulesOverlayEl.classList.contains('hidden')) {
      closeRulesModal();
      handled = true;
    }
    if (handled) {
      event.preventDefault();
    }
  }

  function loadLeaderboard() {
    fetch('/api/royal-exchange/leaderboard')
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        const entries = Array.isArray(data.entries) ? data.entries : [];
        renderLeaderboardLists(entries);
      })
      .catch(error => {
        console.error('Failed to load leaderboard:', error);
        renderLeaderboardLists([], true);
      });
  }

  function renderLeaderboardLists(entries, loadError = false) {
    if (!state.leaderboardLists) return;
    const grouped = entries.reduce((acc, entry) => {
      const key = entry.difficulty || 'normal';
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    }, {});
    Object.entries(state.leaderboardLists).forEach(([difficulty, container]) => {
      if (!container) return;
      const list = grouped[difficulty] || [];
      if (loadError) {
        container.innerHTML = '<div class="re-leaderboard-empty">Unable to load leaderboard.</div>';
        return;
      }
      if (list.length === 0) {
        container.innerHTML = '<div class="re-leaderboard-empty">No records yet.</div>';
        return;
      }
      container.innerHTML = list.map((entry, index) => `
        <div class="re-leaderboard-item">
          <div class="re-leaderboard-rank">#${index + 1}</div>
          <div class="re-leaderboard-info">
            <div class="re-leaderboard-names">${(entry.players || []).map(p => p.name).join(', ')}</div>
            <div class="re-leaderboard-meta">
              <span>${entry.steps} moves</span>
              <span>${formatDuration(entry.duration || 0)}</span>
              <span>${entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</span>
            </div>
          </div>
        </div>
      `).join('');
    });
    updateLeaderboardTabs();
  }

  function updateLeaderboardTabs() {
    if (state.leaderboardTabs) {
      state.leaderboardTabs.forEach(tab => {
        const key = tab.getAttribute('data-leaderboard-tab');
        tab.classList.toggle('active', key === state.activeLeaderboardTab);
      });
    }
    if (state.leaderboardLists) {
      Object.entries(state.leaderboardLists).forEach(([key, container]) => {
        if (container) {
          container.classList.toggle('hidden', key !== state.activeLeaderboardTab);
        }
      });
    }
  }

  function submitLeaderboardEntry(steps, duration) {
    return fetch('/api/royal-exchange/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        players: state.players,
        steps,
        duration,
        difficulty: state.currentDifficulty,
        createdAt: new Date().toISOString()
      })
    }).catch(error => {
      console.error('Unable to record leaderboard entry:', error);
    });
  }

  function updateDifficultyButtons() {
    document.querySelectorAll('.re-difficulty-button').forEach(button => {
      const key = button.getAttribute('data-difficulty');
      button.classList.toggle('active', key === state.currentDifficulty);
    });
  }

  function populatePlayersList() {
    const listEl = document.getElementById('rePlayersList');
    if (!listEl) return;
    if (!Array.isArray(state.players) || state.players.length === 0) {
      listEl.innerHTML = '<li class="re-player-item empty">No players selected.</li>';
      return;
    }
    listEl.innerHTML = state.players.map(player => `<li class="re-player-item">${player.name}</li>`).join('');
  }

  function generateColumnLabels() {
    return Array.from({ length: BOARD_SIZE }, (_, index) => {
      const letter = String.fromCharCode('A'.charCodeAt(0) + index);
      return `<span class="re-col-label">${letter}</span>`;
    }).join('');
  }

  function generateRowLabels() {
    return Array.from({ length: BOARD_SIZE }, (_, index) => {
      const number = BOARD_SIZE - index;
      return `<span class="re-row-label">${number}</span>`;
    }).join('');
  }

  function formatCoordinate(piece) {
    const columnLetter = String.fromCharCode('a'.charCodeAt(0) + piece.col);
    const rowNumber = BOARD_SIZE - piece.row;
    return `${columnLetter}${rowNumber}`;
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function getRulesHtml() {
    return `
      <section class="re-rules-section">
        <h3>Goal</h3>
        <ul>
          <li>Swap the white rook/knight/bishop with the black rook/knight/bishop so that each occupies the other side’s original square.</li>
        </ul>
      </section>
      <section class="re-rules-section">
        <h3>Turn Flow</h3>
        <ul>
          <li>Players alternate control of white and black each turn.</li>
          <li>Select a piece from the current side, then click a destination to move.</li>
          <li>Intermediate safe squares are permitted; no need to move directly to targets.</li>
        </ul>
      </section>
      <section class="re-rules-section">
        <h3>Safety</h3>
        <ul>
          <li>Moves must follow standard chess rules for the piece.</li>
          <li>Move paths may pass controlled squares, but the landing square must be empty.</li>
          <li>After each move no piece may attack, or be attackable by, an opposing piece. If this happens the puzzle fails.</li>
        </ul>
      </section>
      <section class="re-rules-section">
        <h3>Scoring</h3>
        <ul>
          <li>The total number of moves is recorded along with the clear time.</li>
          <li>Only successful swaps appear on the leaderboard.</li>
        </ul>
      </section>
    `;
  }

  window.initRoyalExchange = initRoyalExchange;
})();


