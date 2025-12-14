(() => {
  const API_BASE = window.API_BASE || '/api';

  const DEFAULT_CONFIG = {
    boardSize: 8,
    queenCount: 4,
    totalRounds: 3,
    goalSteps: 6
  };

  const BOARD_PRESETS = [5, 8, 10];
  const QUEEN_PRESETS = [2, 3, 4, 5, 6, 7, 8];

  const SOUND_ENGINE = (() => {
    let audioCtx = null;
    function ensureContext() {
      if (!audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          audioCtx = new AudioCtx();
        }
      }
      return audioCtx;
    }
    function playTone({ frequency, duration, type }) {
      const ctx = ensureContext();
      if (!ctx) {
        return;
      }
      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.05);
    }
    return {
      playSuccess() {
        playTone({ frequency: 880, duration: 0.35, type: 'triangle' });
      },
      playFail() {
        playTone({ frequency: 220, duration: 0.45, type: 'sawtooth' });
      }
    };
  })();

  const state = {
    players: [],
    boardSize: DEFAULT_CONFIG.boardSize,
    queenCount: DEFAULT_CONFIG.queenCount,
    totalRounds: DEFAULT_CONFIG.totalRounds,
    goalSteps: DEFAULT_CONFIG.goalSteps,
    currentRound: 1,
    currentPlayerIndex: 0,
    queens: [],
    selectedQueenIndex: null,
    violationOccurred: false,
    gameActive: false,
    highlight: null,
    logEntries: [],
    totalSuccessCount: 0,
    lastMovedQueenIndex: null,
    boardEl: null,
    logEl: null,
    roundDisplayEl: null,
    totalRoundsEl: null,
    playerDisplayEl: null,
    missionStatusEl: null,
    startButton: null,
    resetButton: null,
    restartButton: null,
    scoreboardEl: null,
    highlightTimeout: null,
    mode: 'infinite',
    timedQueenCount: 4,
    infiniteQueenCount: 4,
    timerDuration: 120000,
    remainingTime: 0,
    timerIntervalId: null,
    leaderboard: [],
    leaderboardLists: {
      timed: null,
      infinite: null
    },
    leaderboardTabs: null,
    leaderboardOverlayEl: null,
    activeLeaderboardTab: 'infinite',
    rulesOverlayEl: null,
    rulesModalBodyEl: null,
    keydownListenerAttached: false,
    positionCounts: new Map()
  };

  function getPositionKey() {
    const positions = (state.queens || [])
      .map(q => [q.row, q.col])
      .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]))
      .map(pair => `${pair[0]},${pair[1]}`)
      .join(';');
    return `${state.boardSize}|${positions}`;
  }

  function resetPositionTracking() {
    state.positionCounts = new Map();
  }

  function recordPositionAndCheckRepetition() {
    const key = getPositionKey();
    const nextCount = (state.positionCounts.get(key) || 0) + 1;
    state.positionCounts.set(key, nextCount);
    return nextCount >= 3 ? { key, count: nextCount } : null;
  }

  function initRunningQueen() {
    const container = document.getElementById('runningQueenGame');
    if (!container) {
      console.error('Running Queen container not found');
      return;
    }

    let playersSource = [];
    if (Array.isArray(window.runningQueenPlayers)) {
      playersSource = window.runningQueenPlayers;
    } else {
      try {
        const stored = localStorage.getItem('runningQueenPlayers');
        if (stored) {
          playersSource = JSON.parse(stored);
        }
      } catch (error) {
        console.warn('Unable to read running queen players from storage:', error);
      }
    }

    state.players = Array.isArray(playersSource)
      ? playersSource.map(player => ({
          id: player.id,
          name: player.name || 'Unknown',
          studentId: player.studentId || '',
          success: 0
        }))
      : [];

    container.innerHTML = buildLayout();
    cacheDomReferences(container);
    attachListeners(container);
    resetGameState(true);
    announceRoundStart();
    renderBoard();
    renderLog();
    updateScoreboard();
    loadLeaderboard();
  }

  function buildLayout() {
    return `
      <div class="rq-wrapper">
        <div class="rq-config-panel">
          <h3>Configuration</h3>
          <div class="rq-mode-toggle" role="group" aria-label="Mode selection">
            <button type="button" class="rq-mode-button ${state.mode === 'classic' ? 'active' : ''}" data-mode="classic">Classic</button>
            <button type="button" class="rq-mode-button ${state.mode === 'timed' ? 'active' : ''}" data-mode="timed">Timed</button>
            <button type="button" class="rq-mode-button ${state.mode === 'infinite' ? 'active' : ''}" data-mode="infinite">Infinite</button>
          </div>
          <div class="rq-config-grid">
            <div class="rq-mode-classic ${state.mode === 'classic' ? 'visible' : ''}">
              <label for="rqBoardSizeInput">Board Size</label>
              <div class="rq-config-field">
                <input type="number" id="rqBoardSizeInput" min="4" max="12" value="${state.boardSize}">
                <div class="rq-preset-row">
                  ${BOARD_PRESETS.map(size => `<button type="button" class="rq-preset-button" data-board-size="${size}">${size}×${size}</button>`).join('')}
                </div>
              </div>
              <label for="rqQueenCountInput">Queens</label>
              <div class="rq-config-field">
                <input type="number" id="rqQueenCountInput" min="2" max="10" value="${state.queenCount}">
                <div class="rq-preset-row">
                  ${QUEEN_PRESETS.map(count => `<button type="button" class="rq-preset-button" data-queen-count="${count}">${count}</button>`).join('')}
                </div>
              </div>
              <label for="rqRoundCountInput">Total Rounds</label>
              <div class="rq-config-field">
                <input type="number" id="rqRoundCountInput" min="1" max="20" value="${state.totalRounds}">
              </div>
              <label for="rqGoalStepsInput">Goal Steps</label>
              <div class="rq-config-field">
                <input type="number" id="rqGoalStepsInput" min="1" max="1000" value="${state.goalSteps}">
              </div>
            </div>
            <div class="rq-mode-timed ${state.mode === 'timed' ? 'visible' : ''}">
              <div class="rq-config-field">
                <label>Queen Count</label>
                <div class="rq-toggle-group" role="group">
                  <button type="button" class="rq-toggle-button ${state.timedQueenCount === 4 ? 'active' : ''}" data-timed-queens="4">4 Queens</button>
                  <button type="button" class="rq-toggle-button ${state.timedQueenCount === 5 ? 'active' : ''}" data-timed-queens="5">5 Queens</button>
                </div>
              </div>
              <div class="rq-config-field">
                <label>Timer Duration</label>
                <div class="rq-toggle-group" role="group">
                  <button type="button" class="rq-toggle-button ${state.timerDuration === 60000 ? 'active' : ''}" data-timer-duration="60000">1 Minute</button>
                  <button type="button" class="rq-toggle-button ${state.timerDuration === 120000 ? 'active' : ''}" data-timer-duration="120000">2 Minutes</button>
                  <button type="button" class="rq-toggle-button ${state.timerDuration === 180000 ? 'active' : ''}" data-timer-duration="180000">3 Minutes</button>
                </div>
              </div>
              <p class="rq-mode-description">Accumulate as many safe moves as possible before the timer expires. Any illegal move ends the run.</p>
            </div>
            <div class="rq-mode-infinite ${state.mode === 'infinite' ? 'visible' : ''}">
              <div class="rq-config-field">
                <label>Queen Count</label>
                <div class="rq-toggle-group" role="group">
                  <button type="button" class="rq-toggle-button ${state.infiniteQueenCount === 4 ? 'active' : ''}" data-infinite-queens="4">4 Queens</button>
                  <button type="button" class="rq-toggle-button ${state.infiniteQueenCount === 5 ? 'active' : ''}" data-infinite-queens="5">5 Queens</button>
                </div>
              </div>
              <p class="rq-mode-description">Play indefinitely until an illegal or unsafe move occurs. Every successful move adds to your score.</p>
            </div>
          </div>
          <div class="rq-config-actions">
            <button type="button" id="rqStartButton" class="rq-primary">Start Game</button>
            <button type="button" id="rqRestartButton" class="rq-secondary rq-green" disabled>Restart</button>
            <button type="button" id="rqResetButton" class="rq-secondary rq-green" disabled>Reset</button>
          </div>
        </div>
        <div class="rq-board-panel">
        <div class="rq-status-bar">
          <div class="rq-status-item">
            <span class="rq-status-label">Round</span>
            <span class="rq-status-value"><span id="rqRoundDisplay">${state.currentRound}</span> / <span id="rqTotalRounds">${state.totalRounds}</span></span>
          </div>
          <div class="rq-status-item">
            <span class="rq-status-label">Current Player</span>
            <span class="rq-status-value" id="rqPlayerDisplay">${state.players[0]?.name || '—'}</span>
          </div>
          <div class="rq-status-item">
            <span class="rq-status-label">Mission</span>
            <span class="rq-status-value" id="rqMissionStatus">Awaiting start</span>
          </div>
          <div class="rq-status-item rq-timer-block ${state.mode === 'timed' ? 'visible' : ''}">
            <span class="rq-status-label">Timer</span>
            <span class="rq-status-value" id="rqTimerDisplay">00:00</span>
          </div>
          <div class="rq-status-actions">
            <button type="button" id="rqRulesButton" class="rq-status-button">Rules</button>
            <button type="button" id="rqLeaderboardButton" class="rq-status-button">Leaderboards</button>
          </div>
        </div>
          <div class="rq-scoreboard" id="rqScoreboard"></div>
          <div class="rq-board-container">
            <div class="rq-board-shell">
              <div class="rq-board-col-labels">
                ${generateColumnLabels(state.boardSize)}
              </div>
              <div class="rq-board-row-labels">
                ${generateRowLabels(state.boardSize)}
              </div>
              <div id="rqBoard" class="rq-board"></div>
            </div>
          </div>
          <div id="rqInfiniteFailOverlay" class="rq-fail-overlay hidden" role="dialog" aria-live="assertive">
            <div class="rq-fail-card">
              <h3 class="rq-fail-title">Defeat</h3>
              <p class="rq-fail-message">Infinite run ended. Try again?</p>
              <div class="rq-fail-actions">
                <button type="button" id="rqFailRetryButton" class="rq-primary">Retry</button>
                <button type="button" id="rqFailCancelButton" class="rq-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
        <div class="rq-log-panel">
          <div class="rq-log-header">
            <h3>Action Log</h3>
            <div class="rq-log-actions">
              <button type="button" id="rqClearLogButton" class="rq-secondary">Clear Log</button>
            </div>
          </div>
          <div id="rqLogList" class="rq-log-list" aria-live="polite"></div>
        </div>
      </div>
      <div id="rqPopupContainer" class="rq-popup-container" aria-live="assertive"></div>
      <div id="rqLeaderboardOverlay" class="rq-modal-overlay hidden" aria-hidden="true">
        <div id="rqLeaderboardModal" class="rq-modal" role="dialog" aria-modal="true" aria-labelledby="rqLeaderboardTitle">
          <div class="rq-modal-header">
            <div>
              <h2 id="rqLeaderboardTitle" class="rq-modal-title">Leaderboards</h2>
              <p class="rq-modal-subtitle">Timed &amp; Infinite</p>
            </div>
            <button type="button" class="rq-modal-close" data-modal-close="leaderboard" aria-label="Close leaderboards">✕</button>
          </div>
          <div class="rq-modal-tabs" role="tablist">
            <div class="rq-modal-tab-group">
              <button type="button" class="rq-modal-tab active" data-leaderboard-tab="timed">Timed</button>
              <button type="button" class="rq-modal-tab" data-leaderboard-tab="infinite">Infinite</button>
            </div>
            <button type="button" id="rqRefreshLeaderboard" class="rq-modal-refresh">Refresh</button>
          </div>
          <div class="rq-modal-body">
            <div id="rqLeaderboardListTimed" class="rq-leaderboard-list" aria-live="polite"></div>
            <div id="rqLeaderboardListInfinite" class="rq-leaderboard-list hidden" aria-live="polite"></div>
          </div>
        </div>
      </div>
      <div id="rqRulesOverlay" class="rq-modal-overlay hidden" aria-hidden="true">
        <div id="rqRulesModal" class="rq-modal" role="dialog" aria-modal="true" aria-labelledby="rqRulesTitle">
          <div class="rq-modal-header">
            <div>
              <h2 id="rqRulesTitle" class="rq-modal-title">Running Queen Rules</h2>
              <p class="rq-modal-subtitle">Gameplay Overview</p>
            </div>
            <button type="button" class="rq-modal-close" data-modal-close="rules" aria-label="Close rules">✕</button>
          </div>
          <div class="rq-modal-body rq-rules-body"></div>
        </div>
      </div>
    `;
  }

  function cacheDomReferences(container) {
    state.boardEl = container.querySelector('#rqBoard');
    state.logEl = container.querySelector('#rqLogList');
    state.roundDisplayEl = container.querySelector('#rqRoundDisplay');
    state.totalRoundsEl = container.querySelector('#rqTotalRounds');
    state.playerDisplayEl = container.querySelector('#rqPlayerDisplay');
    state.missionStatusEl = container.querySelector('#rqMissionStatus');
    state.startButton = container.querySelector('#rqStartButton');
    state.resetButton = container.querySelector('#rqResetButton');
    state.restartButton = container.querySelector('#rqRestartButton');
    state.scoreboardEl = container.querySelector('#rqScoreboard');
    state.leaderboardOverlayEl = container.querySelector('#rqLeaderboardOverlay');
    state.leaderboardTabs = container.querySelectorAll('#rqLeaderboardModal .rq-modal-tab');
    state.leaderboardLists = {
      timed: container.querySelector('#rqLeaderboardListTimed'),
      infinite: container.querySelector('#rqLeaderboardListInfinite')
    };
    state.rulesOverlayEl = container.querySelector('#rqRulesOverlay');
    state.rulesModalBodyEl = container.querySelector('#rqRulesModal .rq-modal-body');
    state.failOverlayEl = container.querySelector('#rqInfiniteFailOverlay');
    state.failMessageEl = container.querySelector('#rqInfiniteFailOverlay .rq-fail-message');
    state.failRetryButton = container.querySelector('#rqFailRetryButton');
    state.failCancelButton = container.querySelector('#rqFailCancelButton');
  }

  function attachListeners(container) {
    container.querySelectorAll('.rq-mode-button').forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-mode');
        if (mode && mode !== state.mode) {
          switchMode(mode);
        }
      });
    });

    container.querySelectorAll('[data-timed-queens]').forEach(button => {
      button.addEventListener('click', () => {
        const value = parseInt(button.getAttribute('data-timed-queens'), 10);
        if (!Number.isNaN(value)) {
          state.timedQueenCount = value;
          updateModeVisibility();
        }
      });
    });

    container.querySelectorAll('[data-timer-duration]').forEach(button => {
      button.addEventListener('click', () => {
        const value = parseInt(button.getAttribute('data-timer-duration'), 10);
        if (!Number.isNaN(value)) {
          state.timerDuration = value;
          updateModeVisibility();
        }
      });
    });

    container.querySelectorAll('[data-infinite-queens]').forEach(button => {
      button.addEventListener('click', () => {
        const value = parseInt(button.getAttribute('data-infinite-queens'), 10);
        if (!Number.isNaN(value)) {
          state.infiniteQueenCount = value;
          updateModeVisibility();
        }
      });
    });

    container.querySelectorAll('[data-board-size]').forEach(button => {
      button.addEventListener('click', () => {
        const size = parseInt(button.getAttribute('data-board-size'), 10);
        const input = container.querySelector('#rqBoardSizeInput');
        if (input) {
          input.value = size;
        }
      });
    });

    container.querySelectorAll('[data-queen-count]').forEach(button => {
      button.addEventListener('click', () => {
        const count = parseInt(button.getAttribute('data-queen-count'), 10);
        const input = container.querySelector('#rqQueenCountInput');
        if (input) {
          input.value = count;
        }
      });
    });

    const startButton = container.querySelector('#rqStartButton');
    if (startButton) {
      startButton.addEventListener('click', () => {
        startGame(container);
      });
    }

    const resetButton = container.querySelector('#rqResetButton');
    if (resetButton) {
      resetButton.addEventListener('click', () => {
        resetGameState(true);
        renderBoard();
        renderLog();
        announceRoundStart();
        updateScoreboard();
      });
    }

    const restartButton = container.querySelector('#rqRestartButton');
    if (restartButton) {
      restartButton.addEventListener('click', () => {
        restartGame(container);
      });
    }

    const clearLogButton = container.querySelector('#rqClearLogButton');
    if (clearLogButton) {
      clearLogButton.addEventListener('click', () => {
        clearLog();
        renderLog();
      });
    }

    const refreshLeaderboardButton = container.querySelector('#rqRefreshLeaderboard');
    if (refreshLeaderboardButton) {
      refreshLeaderboardButton.addEventListener('click', () => {
        loadLeaderboard();
      });
    }

    if (state.leaderboardTabs) {
      state.leaderboardTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const tabKey = tab.getAttribute('data-leaderboard-tab');
          if (!tabKey) return;
          state.activeLeaderboardTab = tabKey;
          updateLeaderboardTabs();
        });
      });
    }

    const leaderboardButton = container.querySelector('#rqLeaderboardButton');
    if (leaderboardButton) {
      leaderboardButton.addEventListener('click', () => {
        openLeaderboardModal(state.mode === 'infinite' ? 'infinite' : 'timed');
      });
    }

    const rulesButton = container.querySelector('#rqRulesButton');
    if (rulesButton) {
      rulesButton.addEventListener('click', () => {
        openRulesModal();
      });
    }

    container.querySelectorAll('.rq-modal-close').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-modal-close');
        if (key === 'leaderboard') {
          closeLeaderboardModal();
        } else if (key === 'rules') {
          closeRulesModal();
        }
      });
    });

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

    if (state.failRetryButton) {
      state.failRetryButton.addEventListener('click', () => {
        hideInfiniteFailOverlay();
        if (state.mode !== 'infinite') {
          switchMode('infinite');
          return;
        }
        startGame(container);
      });
    }

    if (state.failCancelButton) {
      state.failCancelButton.addEventListener('click', () => {
        hideInfiniteFailOverlay();
      });
    }

    if (!state.keydownListenerAttached) {
      document.addEventListener('keydown', onGlobalKeydown);
      state.keydownListenerAttached = true;
    }

    updateModeVisibility();
  }

  function switchMode(mode) {
    if (!['classic', 'timed', 'infinite'].includes(mode)) {
      return;
    }
    stopTimer();
    state.mode = mode;
    if (mode === 'timed') {
      state.boardSize = 8;
      state.queenCount = state.timedQueenCount;
      state.totalRounds = Number.MAX_SAFE_INTEGER;
      state.goalSteps = DEFAULT_CONFIG.goalSteps;
      state.remainingTime = state.timerDuration;
    } else if (mode === 'infinite') {
      state.boardSize = 8;
      state.queenCount = state.infiniteQueenCount;
      state.totalRounds = Number.MAX_SAFE_INTEGER;
      state.goalSteps = DEFAULT_CONFIG.goalSteps;
      state.remainingTime = 0;
    } else {
      state.remainingTime = 0;
    }
    updateModeVisibility();
    resetGameState(true);
    renderBoard();
    renderLog();
    updateScoreboard();
    loadLeaderboard();
  }

  function updateModeVisibility() {
    const container = document.getElementById('runningQueenGame');
    if (!container) return;
    container.querySelectorAll('.rq-mode-button').forEach(button => {
      const mode = button.getAttribute('data-mode');
      button.classList.toggle('active', mode === state.mode);
    });
    const classicSection = container.querySelector('.rq-mode-classic');
    const timedSection = container.querySelector('.rq-mode-timed');
    const infiniteSection = container.querySelector('.rq-mode-infinite');
    const timerBlock = container.querySelector('.rq-timer-block');
    const boardInput = container.querySelector('#rqBoardSizeInput');
    const queenInput = container.querySelector('#rqQueenCountInput');
    const roundInput = container.querySelector('#rqRoundCountInput');
    const goalInput = container.querySelector('#rqGoalStepsInput');
    if (classicSection) {
      classicSection.classList.toggle('visible', state.mode === 'classic');
    }
    if (timedSection) {
      timedSection.classList.toggle('visible', state.mode === 'timed');
      timedSection.querySelectorAll('[data-timed-queens]').forEach(button => {
        const value = parseInt(button.getAttribute('data-timed-queens'), 10);
        button.classList.toggle('active', value === state.timedQueenCount);
      });
      timedSection.querySelectorAll('[data-timer-duration]').forEach(button => {
        const value = parseInt(button.getAttribute('data-timer-duration'), 10);
        button.classList.toggle('active', value === state.timerDuration);
      });
    }
    if (timerBlock) {
      timerBlock.classList.toggle('visible', state.mode === 'timed');
    }
    if (infiniteSection) {
      infiniteSection.classList.toggle('visible', state.mode === 'infinite');
      infiniteSection.querySelectorAll('[data-infinite-queens]').forEach(button => {
        const value = parseInt(button.getAttribute('data-infinite-queens'), 10);
        button.classList.toggle('active', value === state.infiniteQueenCount);
      });
    }
    if (boardInput) {
      boardInput.disabled = state.mode !== 'classic';
    }
    if (queenInput) {
      queenInput.disabled = state.mode !== 'classic';
    }
    if (roundInput) {
      roundInput.disabled = state.mode !== 'classic';
    }
    if (goalInput) {
      goalInput.disabled = state.mode !== 'classic';
    }
    if (state.mode === 'timed') {
      state.remainingTime = state.timerDuration;
      state.queenCount = state.timedQueenCount;
      state.activeLeaderboardTab = 'timed';
    } else if (state.mode === 'infinite') {
      state.remainingTime = 0;
      state.queenCount = state.infiniteQueenCount;
      state.activeLeaderboardTab = 'infinite';
    } else {
      state.remainingTime = 0;
      if (state.activeLeaderboardTab !== 'timed') {
        state.activeLeaderboardTab = 'timed';
      }
    }
    updateLeaderboardTabs();
    updateTimerDisplay();
    renderLeaderboard();
  }

  function resetGameState(resetConfig = false) {
    stopTimer();
    hideInfiniteFailOverlay();
    resetPositionTracking();
    if (resetConfig) {
      state.boardSize = DEFAULT_CONFIG.boardSize;
      state.queenCount = DEFAULT_CONFIG.queenCount;
      state.totalRounds = DEFAULT_CONFIG.totalRounds;
      state.goalSteps = DEFAULT_CONFIG.goalSteps;
      const boardInput = document.getElementById('rqBoardSizeInput');
      const queenInput = document.getElementById('rqQueenCountInput');
      const roundInput = document.getElementById('rqRoundCountInput');
      const goalInput = document.getElementById('rqGoalStepsInput');
      if (boardInput) boardInput.value = state.boardSize;
      if (queenInput) queenInput.value = state.queenCount;
      if (roundInput) roundInput.value = state.totalRounds;
      if (goalInput) goalInput.value = state.goalSteps;
    }

    state.currentRound = 1;
    state.currentPlayerIndex = 0;
    state.selectedQueenIndex = null;
    state.violationOccurred = false;
    state.gameActive = false;
    state.highlight = null;
    state.queens = [];
    state.logEntries = [];
    state.totalSuccessCount = 0;
    state.lastMovedQueenIndex = null;
    state.players = state.players.map(player => ({ ...player, success: 0 }));
    updateStatusDisplay();
    updateMissionStatus('Awaiting start');
    if (state.startButton) state.startButton.disabled = false;
    if (state.resetButton) state.resetButton.disabled = true;
    if (state.restartButton) state.restartButton.disabled = true;
    updateScoreboard();
  }

  function handleClassicFailure(message) {
    if (state.mode !== 'classic' || !state.gameActive) {
      return;
    }
    stopTimer();
    state.gameActive = false;
    state.selectedQueenIndex = null;
    state.lastMovedQueenIndex = null;
    renderBoard();
    appendLog(message, 'error');
    updateMissionStatus('Failed');
    showPopup(message, 'error');
    SOUND_ENGINE.playFail();
    if (state.startButton) state.startButton.disabled = false;
    updateScoreboard();
  }

  function startGame(container) {
    hideInfiniteFailOverlay();
    stopTimer();
    resetPositionTracking();
    let boardSize = state.boardSize;
    let queenCount = state.queenCount;
    let totalRounds = state.totalRounds;
    let goalSteps = state.goalSteps;

    if (state.mode === 'timed') {
      boardSize = 8;
      queenCount = state.timedQueenCount;
      totalRounds = Number.MAX_SAFE_INTEGER;
      goalSteps = DEFAULT_CONFIG.goalSteps;
    } else if (state.mode === 'infinite') {
      boardSize = 8;
      queenCount = state.infiniteQueenCount;
      totalRounds = Number.MAX_SAFE_INTEGER;
      goalSteps = DEFAULT_CONFIG.goalSteps;
    } else {
      const boardInput = container.querySelector('#rqBoardSizeInput');
      const queenInput = container.querySelector('#rqQueenCountInput');
      const roundInput = container.querySelector('#rqRoundCountInput');
      const goalInput = container.querySelector('#rqGoalStepsInput');
      boardSize = clamp(parseInt(boardInput?.value, 10) || DEFAULT_CONFIG.boardSize, 4, 12);
      queenCount = clamp(parseInt(queenInput?.value, 10) || DEFAULT_CONFIG.queenCount, 2, boardSize);
      totalRounds = clamp(parseInt(roundInput?.value, 10) || DEFAULT_CONFIG.totalRounds, 1, 20);
      goalSteps = clamp(parseInt(goalInput?.value, 10) || DEFAULT_CONFIG.goalSteps, 1, 1000);
    }

    state.boardSize = boardSize;
    state.queenCount = queenCount;
    state.totalRounds = totalRounds;
    state.goalSteps = goalSteps;

    state.currentRound = 1;
    state.currentPlayerIndex = 0;
    state.violationOccurred = false;
    state.gameActive = true;
    state.highlight = null;
    state.totalSuccessCount = 0;
    state.lastMovedQueenIndex = null;
    state.players = state.players.map(player => ({ ...player, success: 0 }));
    if (state.startButton) state.startButton.disabled = true;
    if (state.resetButton) state.resetButton.disabled = false;
    if (state.restartButton) state.restartButton.disabled = false;
    state.remainingTime = state.mode === 'timed' ? state.timerDuration : 0;

    state.totalRoundsEl.textContent = state.mode === 'classic'
      ? String(totalRounds)
      : '∞';
    clearLog();
    if (state.mode === 'timed') {
      appendLog(`Timed mode started with ${queenCount} queens. Duration: ${formatDuration(state.timerDuration)}.`, 'info');
    } else if (state.mode === 'infinite') {
      appendLog(`Infinite mode started with ${queenCount} queens. Play until a mistake occurs.`, 'info');
    } else {
      appendLog(`Game started with a ${boardSize}×${boardSize} board, ${queenCount} queens, goal ${goalSteps} steps.`, 'info');
    }

    state.queens = generateSafeQueenPositions(boardSize, queenCount);
    if (state.queens.length !== queenCount) {
      appendLog('Unable to generate a valid starting layout. Please adjust settings.', 'error');
      showPopup('Unable to create starting positions. Try different settings.', 'error');
      state.gameActive = false;
      if (state.startButton) state.startButton.disabled = false;
      if (state.restartButton) state.restartButton.disabled = true;
      return;
    }
    // Track starting position (counts toward repetition rule)
    recordPositionAndCheckRepetition();

    updateStatusDisplay();
    updateMissionStatus(state.mode === 'timed' ? 'Timed run ready' : 'Running');
    announceRoundStart();
    if (state.mode === 'timed') {
      startTimer();
      updateMissionStatus('Timed run active');
    } else if (state.mode === 'infinite') {
      updateMissionStatus('Infinite run');
    }
    renderBoard();
    renderLog();
    updateScoreboard();
  }

  function generateSafeQueenPositions(boardSize, queenCount) {
    const positions = [];
    const occupiedColumns = new Set();
    const occupiedDiag1 = new Set();
    const occupiedDiag2 = new Set();

    const availableRows = Array.from({ length: boardSize }, (_, index) => index);

    function isSafe(row, col) {
      return !occupiedColumns.has(col)
        && !occupiedDiag1.has(row - col)
        && !occupiedDiag2.has(row + col)
        && !positions.some(pos => pos.row === row && pos.col === col);
    }

    function placeQueen(rowIndex, queensPlaced) {
      if (queensPlaced === queenCount) {
        return true;
      }
      if (rowIndex >= availableRows.length) {
        return false;
      }

      const row = availableRows[rowIndex];
      for (let col = 0; col < boardSize; col += 1) {
        if (isSafe(row, col)) {
          positions.push({ row, col });
          occupiedColumns.add(col);
          occupiedDiag1.add(row - col);
          occupiedDiag2.add(row + col);

          if (placeQueen(rowIndex + 1, queensPlaced + 1)) {
            return true;
          }

          positions.pop();
          occupiedColumns.delete(col);
          occupiedDiag1.delete(row - col);
          occupiedDiag2.delete(row + col);
        }
      }

      // Option to skip this row if enough rows remain
      if (availableRows.length - (rowIndex + 1) >= queenCount - queensPlaced) {
        if (placeQueen(rowIndex + 1, queensPlaced)) {
          return true;
        }
      }

      return false;
    }

    const success = placeQueen(0, 0);
    return success ? positions : [];
  }

  function restartGame(container) {
    stopTimer();
    resetPositionTracking();

    if (state.mode === 'timed') {
      state.boardSize = 8;
      state.queenCount = state.timedQueenCount;
      state.totalRounds = Number.MAX_SAFE_INTEGER;
      state.goalSteps = DEFAULT_CONFIG.goalSteps;
    } else if (state.mode === 'infinite') {
      state.boardSize = 8;
      state.queenCount = state.infiniteQueenCount;
      state.totalRounds = Number.MAX_SAFE_INTEGER;
      state.goalSteps = DEFAULT_CONFIG.goalSteps;
    } else {
      const boardInput = container.querySelector('#rqBoardSizeInput');
      const queenInput = container.querySelector('#rqQueenCountInput');
      const roundInput = container.querySelector('#rqRoundCountInput');
      const goalInput = container.querySelector('#rqGoalStepsInput');

      state.boardSize = clamp(parseInt(boardInput?.value, 10) || state.boardSize, 4, 12);
      state.queenCount = clamp(parseInt(queenInput?.value, 10) || state.queenCount, 2, state.boardSize);
      state.totalRounds = clamp(parseInt(roundInput?.value, 10) || state.totalRounds, 1, 20);
      state.goalSteps = clamp(parseInt(goalInput?.value, 10) || state.goalSteps, 1, 1000);
    }

    state.currentRound = 1;
    state.currentPlayerIndex = 0;
    state.violationOccurred = false;
    state.gameActive = true;
    state.highlight = null;
    state.totalSuccessCount = 0;
    state.lastMovedQueenIndex = null;
    state.players = state.players.map(player => ({ ...player, success: 0 }));
    state.remainingTime = state.mode === 'timed' ? state.timerDuration : 0;

    state.queens = generateSafeQueenPositions(state.boardSize, state.queenCount);
    if (state.queens.length !== state.queenCount) {
      appendLog('Unable to generate a valid starting layout on restart. Please adjust settings.', 'error');
      showPopup('Unable to create starting positions. Try different settings.', 'error');
      state.gameActive = false;
      if (state.startButton) state.startButton.disabled = false;
      if (state.restartButton) state.restartButton.disabled = true;
      return;
    }
    // Track starting position (counts toward repetition rule)
    recordPositionAndCheckRepetition();

    state.totalRoundsEl.textContent = state.mode === 'classic'
      ? String(state.totalRounds)
      : '∞';
    if (state.startButton) state.startButton.disabled = true;
    if (state.resetButton) state.resetButton.disabled = false;
    if (state.restartButton) state.restartButton.disabled = false;
    updateMissionStatus('Running');
    announceRoundStart();
    appendLog(
      state.mode === 'timed'
        ? `Timed mode restarted with ${state.queenCount} queens, duration ${formatDuration(state.timerDuration)}.`
        : state.mode === 'infinite'
          ? `Infinite mode restarted with ${state.queenCount} queens.`
          : `Game restarted with a ${state.boardSize}×${state.boardSize} board, goal ${state.goalSteps} steps.`,
      'info'
    );
    if (state.mode === 'timed') {
      startTimer();
      updateMissionStatus('Timed run active');
    } else if (state.mode === 'infinite') {
      updateMissionStatus('Infinite run');
    } else {
      updateMissionStatus('Running');
    }
    renderBoard();
    updateScoreboard();
  }

  function renderBoard() {
    if (!state.boardEl) return;
    const colLabelContainer = state.boardEl.parentElement?.querySelector('.rq-board-col-labels');
    const rowLabelContainer = state.boardEl.parentElement?.querySelector('.rq-board-row-labels');
    if (state.boardEl.parentElement) {
      state.boardEl.parentElement.style.setProperty('--rq-board-size', state.boardSize);
    }
    if (colLabelContainer) {
      colLabelContainer.innerHTML = generateColumnLabels(state.boardSize);
    }
    if (rowLabelContainer) {
      rowLabelContainer.innerHTML = generateRowLabels(state.boardSize);
    }
    state.boardEl.innerHTML = '';
    state.boardEl.style.gridTemplateColumns = `repeat(${state.boardSize}, 1fr)`;
    state.boardEl.style.gridTemplateRows = `repeat(${state.boardSize}, 1fr)`;

    const highlightCells = state.highlight?.cells || [];
    const highlightType = state.highlight?.type || null;

    for (let row = 0; row < state.boardSize; row += 1) {
      for (let col = 0; col < state.boardSize; col += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `rq-cell ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.setAttribute('aria-label', `Row ${row + 1}, Column ${col + 1}`);

        const queenIndex = state.queens.findIndex(q => q.row === row && q.col === col);
        if (queenIndex !== -1) {
          const queenSpan = document.createElement('span');
          queenSpan.className = 'rq-queen';
          const image = document.createElement('img');
          image.className = 'rq-queen-image';
          image.alt = 'Queen piece';
          image.src = '/assets/pieces/white_Queen.png';
          queenSpan.appendChild(image);
          cell.appendChild(queenSpan);
          if (state.selectedQueenIndex === queenIndex) {
            cell.classList.add('selected');
          }
        }

        if (highlightCells.some(position => position.row === row && position.col === col)) {
          cell.classList.add(highlightType === 'success' ? 'highlight-success' : 'highlight-fail');
        }

        cell.addEventListener('click', () => onCellClick(row, col));
        state.boardEl.appendChild(cell);
      }
    }
  }

  function onCellClick(row, col) {
    if (!state.gameActive) return;
    const queenIndex = state.queens.findIndex(q => q.row === row && q.col === col);
    if (queenIndex !== -1) {
      if (state.selectedQueenIndex === queenIndex) {
        state.selectedQueenIndex = null;
      } else {
        state.selectedQueenIndex = queenIndex;
      }
      renderBoard();
      return;
    }

    if (state.selectedQueenIndex === null) {
      return;
    }

    attemptMove(state.selectedQueenIndex, row, col);
  }

  function attemptMove(queenIndex, targetRow, targetCol) {
    const queen = state.queens[queenIndex];
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!queen || !currentPlayer) {
      return;
    }

    if (state.lastMovedQueenIndex !== null && state.lastMovedQueenIndex === queenIndex) {
      showPopup('Cannot move the same queen twice in a row.', 'error');
      if (state.mode === 'timed') {
        handleTimedFailure('Timed challenge failed: same queen moved consecutively.');
      } else if (state.mode === 'infinite') {
        handleInfiniteFailure('Infinite run ended: same queen moved consecutively.');
      }
      return;
    }

    if (!isValidQueenMove(queen.row, queen.col, targetRow, targetCol)) {
      showPopup('Invalid queen move. Please use a straight or diagonal path.', 'error');
      if (state.mode === 'timed') {
        handleTimedFailure('Timed challenge failed: invalid queen move.');
      } else if (state.mode === 'infinite') {
        handleInfiniteFailure('Infinite run ended: invalid queen move.');
      }
      return;
    }

    const rowDelta = Math.abs(targetRow - queen.row);
    const colDelta = Math.abs(targetCol - queen.col);
    const moveDistance = Math.max(rowDelta, colDelta);
    if (moveDistance < 2) {
      showPopup('Queens must move at least two squares.', 'error');
      if (state.mode === 'timed') {
        handleTimedFailure('Timed challenge failed: move was less than two squares.');
      } else if (state.mode === 'infinite') {
        handleInfiniteFailure('Infinite run ended: move was less than two squares.');
      }
      return;
    }

    if (!isPathClear(queen.row, queen.col, targetRow, targetCol)) {
      showPopup('Path is blocked by another queen.', 'error');
      if (state.mode === 'timed') {
        handleTimedFailure('Timed challenge failed: path blocked by another queen.');
      } else if (state.mode === 'infinite') {
        handleInfiniteFailure('Infinite run ended: path blocked by another queen.');
      }
      return;
    }

    const originalPosition = { row: queen.row, col: queen.col };
    queen.row = targetRow;
    queen.col = targetCol;

    const boardSafe = isBoardSafe(state.queens);
    state.selectedQueenIndex = null;

    const startCell = { row: originalPosition.row, col: originalPosition.col };
    const endCell = { row: targetRow, col: targetCol };
    state.highlight = {
      type: boardSafe ? 'success' : 'fail',
      cells: [startCell, endCell]
    };
    renderBoard();
    window.clearTimeout(state.highlightTimeout);
    state.highlightTimeout = window.setTimeout(() => {
      state.highlight = null;
      renderBoard();
    }, 900);

    if (boardSafe) {
      state.players[state.currentPlayerIndex].success += 1;
      state.totalSuccessCount += 1;
      appendLog(`${currentPlayer.name} moved safely to ${formatCoordinate(endCell)}.`, 'success');
      if (state.mode === 'classic') {
        showPopup(`${currentPlayer.name} moved safely!`, 'success');
        SOUND_ENGINE.playSuccess();
      } else {
        SOUND_ENGINE.playSuccess();
      }
      updateScoreboard();
      state.lastMovedQueenIndex = queenIndex;
      // Repetition rule: third time the same position appears -> immediate loss (includes starting position).
      const repetition = recordPositionAndCheckRepetition();
      if (repetition) {
        const repetitionMessage = `Threefold repetition detected. Position repeated ${repetition.count} times.`;
        if (state.mode === 'timed') {
          handleTimedFailure(`Timed challenge failed: ${repetitionMessage}`);
        } else if (state.mode === 'infinite') {
          handleInfiniteFailure(`Infinite run ended: ${repetitionMessage}`);
        } else {
          handleClassicFailure(`Mission failed: ${repetitionMessage}`);
        }
        return;
      }
      if (state.mode === 'classic' && state.totalSuccessCount >= state.goalSteps) {
        finalizeGame(true);
        return;
      }
    } else {
      const failureMessage = `${currentPlayer.name} attempted ${formatCoordinate(endCell)} and triggered a conflict. Queen returns to ${formatCoordinate(startCell)}.`;
      if (state.mode === 'timed') {
        showPopup(`${currentPlayer.name}'s move is under attack!`, 'error');
        queen.row = originalPosition.row;
        queen.col = originalPosition.col;
        renderBoard();
        updateScoreboard();
        handleTimedFailure(failureMessage);
        return;
      }
      if (state.mode === 'infinite') {
        queen.row = originalPosition.row;
        queen.col = originalPosition.col;
        renderBoard();
        updateScoreboard();
        SOUND_ENGINE.playFail();
        handleInfiniteFailure(failureMessage);
        return;
      }
      appendLog(failureMessage, 'error');
      showPopup(`${currentPlayer.name}'s move is under attack!`, 'error');
      SOUND_ENGINE.playFail();
      state.violationOccurred = true;
      queen.row = originalPosition.row;
      queen.col = originalPosition.col;
      renderBoard();
      updateScoreboard();
      state.lastMovedQueenIndex = queenIndex;
      // In classic mode, unsafe moves snap back but still advance the turn;
      // this can create repeated positions, so enforce threefold repetition here too.
      const repetition = recordPositionAndCheckRepetition();
      if (repetition) {
        handleClassicFailure(`Mission failed: Threefold repetition detected. Position repeated ${repetition.count} times.`);
        return;
      }
    }

    advanceTurn();
  }

  function isValidQueenMove(fromRow, fromCol, toRow, toCol) {
    if (fromRow === toRow && fromCol === toCol) return false;
    const rowDiff = Math.abs(fromRow - toRow);
    const colDiff = Math.abs(fromCol - toCol);
    return fromRow === toRow || fromCol === toCol || rowDiff === colDiff;
  }

  function isPathClear(fromRow, fromCol, toRow, toCol) {
    const rowStep = Math.sign(toRow - fromRow);
    const colStep = Math.sign(toCol - fromCol);
    let currentRow = fromRow + rowStep;
    let currentCol = fromCol + colStep;
    while (currentRow !== toRow || currentCol !== toCol) {
      if (state.queens.some(queen => queen.row === currentRow && queen.col === currentCol)) {
        return false;
      }
      currentRow += rowStep;
      currentCol += colStep;
    }
    return !state.queens.some(queen => queen.row === toRow && queen.col === toCol);
  }

  function isBoardSafe(queens) {
    for (let i = 0; i < queens.length; i += 1) {
      for (let j = i + 1; j < queens.length; j += 1) {
        const a = queens[i];
        const b = queens[j];
        if (a.row === b.row) return false;
        if (a.col === b.col) return false;
        if (Math.abs(a.row - b.row) === Math.abs(a.col - b.col)) return false;
      }
    }
    return true;
  }

  function advanceTurn() {
    if (state.mode === 'timed') {
      state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
      updateStatusDisplay();
      return;
    }

    state.currentPlayerIndex += 1;
    if (state.currentPlayerIndex >= state.players.length) {
      state.currentPlayerIndex = 0;
      state.currentRound += 1;
      if (state.currentRound <= state.totalRounds) {
        announceRoundStart();
      }
    }

    if (state.currentRound > state.totalRounds) {
      finalizeGame(false);
    } else {
      updateStatusDisplay();
    }
  }

  function finalizeGame(goalAchievedEarly, options = {}) {
    stopTimer();
    state.gameActive = false;
    state.selectedQueenIndex = null;
    state.lastMovedQueenIndex = null;
    renderBoard();

    if (state.mode === 'timed') {
      const status = goalAchievedEarly ? 'success' : 'fail';
      const duration = state.timerDuration - state.remainingTime;
      const message = options.message || (status === 'success'
        ? `Time's up! Final score: ${state.totalSuccessCount} steps.`
        : `Timed run ended. Final score: ${state.totalSuccessCount} steps.`);
      appendLog(message, status === 'success' ? 'success' : 'error');
      updateMissionStatus(status === 'success' ? 'Completed' : 'Failed');
      recordLeaderboardEntry({
        mode: 'timed',
        score: state.totalSuccessCount,
        duration,
        status
      });
      if (status === 'success') {
        SOUND_ENGINE.playSuccess();
      } else {
        SOUND_ENGINE.playFail();
      }
      if (state.startButton) state.startButton.disabled = false;
      updateScoreboard();
      return;
    }

    if (state.mode === 'infinite') {
      const status = goalAchievedEarly ? 'success' : 'fail';
      const message = options.message || `Infinite run ended. Final score: ${state.totalSuccessCount} steps.`;
      appendLog(message, status === 'success' ? 'success' : 'error');
      updateMissionStatus(status === 'success' ? 'Completed' : 'Failed');
      recordLeaderboardEntry({
        mode: 'infinite',
        score: state.totalSuccessCount,
        duration: 0,
        status
      });
      if (status === 'success') {
        SOUND_ENGINE.playSuccess();
      } else {
        SOUND_ENGINE.playFail();
      }
      if (state.startButton) state.startButton.disabled = false;
      updateScoreboard();
      return;
    }

    if (state.totalSuccessCount >= state.goalSteps) {
      appendLog('Mission success! Goal steps achieved.', 'success');
      updateMissionStatus('Success');
      showPopup('Mission success! All players earn +10 points!', 'success');
      SOUND_ENGINE.playSuccess();
      awardSuccessPoints();
    } else {
      appendLog('Mission failed. Goal steps not reached within the limit.', 'error');
      updateMissionStatus('Failed');
      showPopup('Mission failed. Goal not reached.', 'error');
      SOUND_ENGINE.playFail();
    }
    if (state.startButton) state.startButton.disabled = false;
    updateScoreboard();
  }

  async function awardSuccessPoints() {
    const payload = { points: 10 };
    for (const player of state.players) {
      try {
        await fetch(`${API_BASE}/students/${player.id}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (error) {
        console.error('Failed to award points to', player.name, error);
      }
    }
  }

  function updateStatusDisplay() {
    if (state.roundDisplayEl) {
      state.roundDisplayEl.textContent = state.mode === 'classic'
        ? String(clamp(state.currentRound, 1, state.totalRounds))
        : '—';
    }
    if (state.totalRoundsEl) {
      state.totalRoundsEl.textContent = state.mode === 'classic' ? String(state.totalRounds) : '∞';
    }
    if (state.playerDisplayEl) {
      const player = state.players[state.currentPlayerIndex];
      state.playerDisplayEl.textContent = player ? player.name : '—';
    }
  }

  function updateMissionStatus(text) {
    if (state.missionStatusEl) {
      state.missionStatusEl.textContent = text;
    }
  }

  function announceRoundStart() {
    if (state.mode === 'classic') {
      clearLog();
      appendLog(`Round ${state.currentRound} begins. Keep the queens safe!`, 'info');
    }
    updateStatusDisplay();
    updateScoreboard();
  }

  function appendLog(text, type = 'info') {
    state.logEntries.push({ text, type, time: new Date() });
    renderLog();
  }

  function clearLog() {
    state.logEntries = [];
  }

  function renderLog() {
    if (!state.logEl) return;
    if (state.logEntries.length === 0) {
      state.logEl.innerHTML = `<div class="rq-log-empty">Log is empty.</div>`;
      return;
    }
    state.logEl.innerHTML = state.logEntries.map(entry => `
      <div class="rq-log-entry rq-log-${entry.type}">
        <span class="rq-log-time">${formatTime(entry.time)}</span>
        <span class="rq-log-text">${entry.text}</span>
      </div>
    `).join('');
    state.logEl.scrollTop = state.logEl.scrollHeight;
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatCoordinate(position) {
    const columnLetter = String.fromCharCode('a'.charCodeAt(0) + position.col);
    const rowNumber = state.boardSize - position.row;
    return `(${columnLetter}, ${rowNumber})`;
  }

  function generateColumnLabels(size) {
    return Array.from({ length: size }).map((_, index) => {
      const letter = String.fromCharCode('A'.charCodeAt(0) + index);
      return `<span class="rq-col-label">${letter}</span>`;
    }).join('');
  }

  function generateRowLabels(size) {
    return Array.from({ length: size }).map((_, index) => {
      const number = index + 1;
      return `<span class="rq-row-label">${number}</span>`;
    }).reverse().join('');
  }

  function updateScoreboard() {
    if (!state.scoreboardEl) return;
    if (!Array.isArray(state.players) || state.players.length === 0) {
      state.scoreboardEl.innerHTML = '<div class="rq-scoreboard-empty">No players selected.</div>';
      return;
    }

    if (state.mode === 'timed') {
      state.scoreboardEl.innerHTML = `
        <div class="rq-score-summary">
          <span class="rq-score-total-label">Timed Score</span>
          <span class="rq-score-total-value">${state.totalSuccessCount} steps</span>
        </div>
        <div class="rq-score-list">
          ${state.players.map(player => `
            <div class="rq-score-item">
              <span class="rq-score-name">${player.name}</span>
              <span class="rq-score-value">${player.success || 0}</span>
            </div>
          `).join('')}
        </div>
      `;
      updateTimerDisplay();
      return;
    }

    if (state.mode === 'infinite') {
      state.scoreboardEl.innerHTML = `
        <div class="rq-score-summary">
          <span class="rq-score-total-label">Infinite Score</span>
          <span class="rq-score-total-value">${state.totalSuccessCount} steps</span>
        </div>
        <div class="rq-score-list">
          ${state.players.map(player => `
            <div class="rq-score-item">
              <span class="rq-score-name">${player.name}</span>
              <span class="rq-score-value">${player.success || 0}</span>
            </div>
          `).join('')}
        </div>
      `;
      return;
    }

    state.scoreboardEl.innerHTML = `
      <div class="rq-score-summary">
        <span class="rq-score-total-label">Total Success</span>
        <span class="rq-score-total-value">${state.totalSuccessCount} / ${state.goalSteps}</span>
      </div>
      <div class="rq-score-list">
        ${state.players.map(player => `
          <div class="rq-score-item">
            <span class="rq-score-name">${player.name}</span>
            <span class="rq-score-value">${player.success || 0}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function showPopup(message, type) {
    const container = document.getElementById('rqPopupContainer');
    if (!container) {
      alert(message);
      return;
    }
    const popup = document.createElement('div');
    popup.className = `rq-popup rq-popup-${type}`;
    popup.innerHTML = `
      <div class="rq-popup-message">${message}</div>
      <button type="button" class="rq-popup-button">OK</button>
    `;
    container.appendChild(popup);
    container.classList.add('visible');
    const removePopup = () => {
      container.classList.remove('visible');
      popup.remove();
    };
    popup.querySelector('.rq-popup-button').addEventListener('click', removePopup);
    setTimeout(removePopup, 2500);
  }

  function showInfiniteFailOverlay(message) {
    const overlay = state.failOverlayEl || document.getElementById('rqInfiniteFailOverlay');
    if (!overlay) {
      return;
    }
    const msgEl = state.failMessageEl || overlay.querySelector('.rq-fail-message');
    if (msgEl) {
      msgEl.textContent = message || 'Infinite run ended. Try again?';
    }
    overlay.classList.remove('hidden');
  }

  function hideInfiniteFailOverlay() {
    const overlay = state.failOverlayEl || document.getElementById('rqInfiniteFailOverlay');
    if (!overlay) {
      return;
    }
    overlay.classList.add('hidden');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function startTimer() {
    stopTimer();
    state.remainingTime = state.timerDuration;
    updateTimerDisplay();
    state.timerIntervalId = window.setInterval(() => {
      if (!state.gameActive) {
        stopTimer();
        return;
      }
      state.remainingTime = Math.max(0, state.remainingTime - 1000);
      updateTimerDisplay();
      if (state.remainingTime <= 0) {
        stopTimer();
        finalizeGame(true);
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerIntervalId) {
      window.clearInterval(state.timerIntervalId);
      state.timerIntervalId = null;
    }
    if (state.mode === 'timed' && state.remainingTime <= 0) {
      state.remainingTime = 0;
      updateTimerDisplay();
    }
  }

  function updateTimerDisplay() {
    const timerEl = document.getElementById('rqTimerDisplay');
    if (timerEl) {
      timerEl.textContent = state.mode === 'timed'
        ? formatTimer(state.remainingTime)
        : '--:--';
    }
  }

  function handleTimedFailure(message) {
    if (state.mode !== 'timed' || !state.gameActive) {
      return;
    }
    finalizeGame(false, { message });
  }

  function handleInfiniteFailure(message) {
    if (state.mode !== 'infinite' || !state.gameActive) {
      return;
    }
    finalizeGame(false, { message });
    showInfiniteFailOverlay(message);
  }

  function formatTimer(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  async function loadLeaderboard() {
    try {
      const response = await fetch('/api/running-queen/leaderboard');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      state.leaderboard = Array.isArray(data.entries) ? data.entries : [];
      renderLeaderboard();
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      renderLeaderboard(true);
    }
  }

  function renderLeaderboard(loadError = false) {
    const entries = Array.isArray(state.leaderboard)
      ? state.leaderboard.map(entry => ({
          ...entry,
          mode: entry.mode || 'timed',
          queenCount: Number(entry.queenCount) || null,
          timerDurationMs: Number(entry.timerDurationMs || entry.timerDuration) || 0
        }))
      : [];
    const timedEntries = entries.filter(entry => entry.mode === 'timed');
    const infiniteEntries = entries.filter(entry => entry.mode === 'infinite');
    renderTimedLeaderboard(state.leaderboardLists.timed, timedEntries, loadError);
    renderInfiniteLeaderboard(state.leaderboardLists.infinite, infiniteEntries, loadError);
    updateLeaderboardTabs();
  }

  const LEADERBOARD_QUEEN_GROUPS = [4, 5];
  const TIMED_DURATION_BUCKETS = [
    { value: 60000, label: '1 minute' },
    { value: 120000, label: '2 minute' },
    { value: 180000, label: '3 minute' }
  ];

  function sortLeaderboardEntries(list) {
    return [...list].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.mode === 'timed' && b.mode === 'timed') {
        return (a.duration || 0) - (b.duration || 0);
      }
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  }

  function renderLeaderboardItems(entries, metaFormatter) {
    return entries.map((entry, index) => `
      <div class="rq-leaderboard-item">
        <div class="rq-leaderboard-rank">#${index + 1}</div>
        <div class="rq-leaderboard-info">
          <div class="rq-leaderboard-names">${entry.players?.map(p => p.name).join(', ') || 'Unknown Team'}</div>
          <div class="rq-leaderboard-meta">
            <span>${entry.score} steps</span>
            <span>${metaFormatter(entry)}</span>
            <span>${entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderTimedLeaderboard(container, entries, loadError) {
    if (!container) return;
    if (loadError) {
      container.innerHTML = '<div class="rq-leaderboard-empty">Unable to load leaderboard.</div>';
      return;
    }
    const normalized = Array.isArray(entries) ? entries : [];
    let hasAny = false;

    const groupsHtml = LEADERBOARD_QUEEN_GROUPS.map(qc => {
      const bucketHtml = TIMED_DURATION_BUCKETS.map(bucket => {
        const bucketEntries = sortLeaderboardEntries(
          normalized.filter(entry =>
            (entry.queenCount === qc) &&
            (entry.timerDurationMs === bucket.value))
        );
        if (bucketEntries.length > 0) hasAny = true;
        return `
          <div class="rq-leaderboard-subgroup">
            <div class="rq-leaderboard-subtitle">Timed • ${bucket.label}</div>
            ${bucketEntries.length
              ? renderLeaderboardItems(bucketEntries, entry => formatDuration(entry.duration || 0))
              : '<div class="rq-leaderboard-empty">No entries yet.</div>'}
          </div>
        `;
      }).join('');

      // Handle entries without matching duration buckets
      const otherEntries = sortLeaderboardEntries(
        normalized.filter(entry =>
          entry.queenCount === qc &&
          !TIMED_DURATION_BUCKETS.some(bucket => entry.timerDurationMs === bucket.value)
        )
      );
      const otherHtml = otherEntries.length ? `
        <div class="rq-leaderboard-subgroup">
          <div class="rq-leaderboard-subtitle">Timed • Other</div>
          ${renderLeaderboardItems(otherEntries, entry => formatDuration(entry.duration || 0))}
        </div>
      ` : '';
      if (otherEntries.length > 0) hasAny = true;

      const hasGroupEntries = bucketHtml || otherHtml;
      return `
        <div class="rq-leaderboard-group">
          <div class="rq-leaderboard-group-title">${qc} Queens</div>
          ${bucketHtml}${otherHtml}
        </div>
      `;
    }).join('');

    // Group for unspecified queen count
    const unspecified = sortLeaderboardEntries(
      normalized.filter(entry => !LEADERBOARD_QUEEN_GROUPS.includes(entry.queenCount))
    );
    const unspecifiedHtml = unspecified.length ? `
      <div class="rq-leaderboard-group">
        <div class="rq-leaderboard-group-title">Other / Unspecified</div>
        ${renderLeaderboardItems(unspecified, entry => formatDuration(entry.duration || 0))}
      </div>
    ` : '';
    if (unspecified.length) hasAny = true;

    if (!hasAny) {
      container.innerHTML = '<div class="rq-leaderboard-empty">No entries yet.</div>';
      return;
    }

    container.innerHTML = `${groupsHtml}${unspecifiedHtml}`;
  }

  function renderInfiniteLeaderboard(container, entries, loadError) {
    if (!container) return;
    if (loadError) {
      container.innerHTML = '<div class="rq-leaderboard-empty">Unable to load leaderboard.</div>';
      return;
    }
    const normalized = Array.isArray(entries) ? entries : [];
    let hasAny = false;

    const groupsHtml = LEADERBOARD_QUEEN_GROUPS.map(qc => {
      const list = sortLeaderboardEntries(normalized.filter(entry => entry.queenCount === qc));
      if (list.length > 0) hasAny = true;
      return `
        <div class="rq-leaderboard-group">
          <div class="rq-leaderboard-group-title">${qc} Queens • Infinite</div>
          ${list.length
            ? renderLeaderboardItems(list, () => '—')
            : '<div class="rq-leaderboard-empty">No entries yet.</div>'}
        </div>
      `;
    }).join('');

    const unspecified = sortLeaderboardEntries(
      normalized.filter(entry => !LEADERBOARD_QUEEN_GROUPS.includes(entry.queenCount))
    );
    const unspecifiedHtml = unspecified.length ? `
      <div class="rq-leaderboard-group">
        <div class="rq-leaderboard-group-title">Other / Unspecified</div>
        ${renderLeaderboardItems(unspecified, () => '—')}
      </div>
    ` : '';
    if (unspecified.length) hasAny = true;

    if (!hasAny) {
      container.innerHTML = '<div class="rq-leaderboard-empty">No entries yet.</div>';
      return;
    }

    container.innerHTML = `${groupsHtml}${unspecifiedHtml}`;
  }

  function updateLeaderboardTabs() {
    const active = state.activeLeaderboardTab;
    if (state.leaderboardTabs) {
      state.leaderboardTabs.forEach(tab => {
        const key = tab.getAttribute('data-leaderboard-tab');
        tab.classList.toggle('active', key === active);
      });
    }
    if (state.leaderboardLists.timed) {
      state.leaderboardLists.timed.classList.toggle('hidden', active !== 'timed');
    }
    if (state.leaderboardLists.infinite) {
      state.leaderboardLists.infinite.classList.toggle('hidden', active !== 'infinite');
    }
  }

  function openLeaderboardModal(defaultTab = 'timed') {
    state.activeLeaderboardTab = defaultTab;
    updateLeaderboardTabs();
    renderLeaderboard();
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
    if (state.rulesModalBodyEl) {
      state.rulesModalBodyEl.innerHTML = getRulesHtml();
      state.rulesModalBodyEl.scrollTop = 0;
    }
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

  function getRulesHtml() {
    return `
      <section class="rq-rules-section">
        <h3>Turn Flow</h3>
        <ul>
          <li>Each turn, a player may move exactly one queen.</li>
          <li>The same queen cannot be moved by consecutive players.</li>
          <li>Queens must move in a straight or diagonal line for at least two squares with an unobstructed path.</li>
        </ul>
      </section>
      <section class="rq-rules-section">
        <h3>Safety Check</h3>
        <ul>
          <li>If, after the move, all queens remain non-attacking, the move counts as a successful step.</li>
          <li>If the board becomes unsafe, the queen snaps back and the current mode’s failure flow is triggered.</li>
        </ul>
      </section>
      <section class="rq-rules-section">
        <h3>Timed Mode</h3>
        <ul>
          <li>A countdown appears in the status bar. Reaching zero or making an illegal move ends the run immediately.</li>
          <li>Results are recorded in the Timed leaderboard.</li>
        </ul>
      </section>
      <section class="rq-rules-section">
        <h3>Infinite Mode</h3>
        <ul>
          <li>No timer is present. Any illegal or unsafe move ends the run instantly.</li>
          <li>Results are recorded in the Infinite leaderboard.</li>
        </ul>
      </section>
    `;
  }

  async function recordLeaderboardEntry({ mode, score, duration, status }) {
    try {
      const payload = {
        players: state.players,
        mode,
        score,
        duration,
        status,
        queenCount: mode === 'timed' ? state.timedQueenCount : state.infiniteQueenCount,
        timerDurationMs: mode === 'timed' ? state.timerDuration : 0,
        createdAt: new Date().toISOString()
      };
      await fetch('/api/running-queen/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      loadLeaderboard();
    } catch (error) {
      console.error('Unable to record leaderboard entry:', error);
    }
  }

  window.initRunningQueen = initRunningQueen;
})();

