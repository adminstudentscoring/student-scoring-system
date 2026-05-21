(function () {
  const BOARD_SIZE = 8;
  const API_BASE = window.API_BASE || '/api';
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

  const TARGET_LETTERS = {
    rook: 'R',
    knight: 'N',
    bishop: 'B',
    queen: 'Q'
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
    activeLeaderboardTab: 'normal',
    defeatOverlayEl: null,
    defeatReasonEl: null,
    suppressNextClick: false
  };

  function apiRequest(path, options = {}) {
    if (window.authUtils?.authenticatedFetch) {
      return window.authUtils.authenticatedFetch(path, options);
    }
    const token = localStorage.getItem('authToken');
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${API_BASE}${path}`, { ...options, headers });
  }

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
      <div id="reDefeatOverlay" class="re-modal-overlay hidden" aria-hidden="true">
        <div class="re-modal" role="dialog" aria-modal="true" aria-labelledby="reDefeatTitle">
          <div class="re-modal-header">
            <div>
              <h2 id="reDefeatTitle" class="re-modal-title">Defeat</h2>
              <p class="re-modal-subtitle">Puzzle failed</p>
            </div>
            <button type="button" class="re-modal-close" data-modal-close="defeat" aria-label="Close defeat dialog">✕</button>
          </div>
          <div class="re-modal-body">
            <section class="re-rules-section">
              <h3>Reason</h3>
              <p id="reDefeatReason" class="re-defeat-reason">Unknown reason.</p>
            </section>
          </div>
          <div class="re-modal-footer re-defeat-footer">
            <button type="button" id="reDefeatCancel" class="re-secondary">Cancel</button>
            <button type="button" id="reDefeatRestart" class="re-primary">Restart</button>
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
    state.defeatOverlayEl = container.querySelector('#reDefeatOverlay');
    state.defeatReasonEl = container.querySelector('#reDefeatReason');
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
        } else if (key === 'defeat') {
          closeDefeatModal();
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

    const defeatCancel = container.querySelector('#reDefeatCancel');
    if (defeatCancel) {
      defeatCancel.addEventListener('click', closeDefeatModal);
    }
    const defeatRestart = container.querySelector('#reDefeatRestart');
    if (defeatRestart) {
      defeatRestart.addEventListener('click', () => {
        resetGame();
        renderBoard();
        updateStatus();
        appendLog('Game reset.', 'info');
        closeDefeatModal();
      });
    }
    if (state.defeatOverlayEl) {
      state.defeatOverlayEl.addEventListener('click', event => {
        if (event.target === state.defeatOverlayEl) {
          closeDefeatModal();
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
