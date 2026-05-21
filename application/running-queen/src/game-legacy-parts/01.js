(() => {
  const API_BASE = window.API_BASE || '/api';

  function escapeHtml(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const DEFAULT_CONFIG = {
    boardSize: 8,
    queenCount: 4,
    timerDuration: 120000
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
    currentPlayerIndex: 0,
    queens: [],
    selectedQueenIndex: null,
    suppressNextClick: false,
    violationOccurred: false,
    gameActive: false,
    highlight: null,
    logEntries: [],
    totalSuccessCount: 0,
    lastMovedQueenIndex: null,
    boardEl: null,
    logEl: null,
    playerDisplayEl: null,
    startButton: null,
    restartButton: null,
    scoreboardEl: null,
    highlightTimeout: null,
    mode: 'infinite',
    timedQueenCount: 4,
    infiniteQueenCount: 4,
    timerDuration: DEFAULT_CONFIG.timerDuration,
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
    renderBoard();
    renderLog();
    updateScoreboard();
    loadLeaderboard();
  }

  function buildLayout() {
    return `
      <div class="rq-app">
        <aside class="rq-sidebar" aria-label="Running Queen sidebar">
          <div class="rq-side-title">♕ Running Queen</div>
          <div class="rq-side-sub">${escapeHtml(state.players[0]?.name || '—')}${state.players[0]?.studentId ? ` (${escapeHtml(state.players[0].studentId)})` : ''}</div>
          <div class="rq-nav">
            <button type="button" class="rq-nav-btn" data-rq-scroll="top">Home</button>
            <button type="button" class="rq-nav-btn" data-modal-open="rules">Rules</button>
            <button type="button" class="rq-nav-btn" data-modal-open="leaderboard">Leaderboards</button>
          </div>

          <!-- Configuration (moved into sidebar under Home) -->
          <div class="rq-side-section">
            <div class="rq-side-section-title">Configuration</div>
            <div class="rq-config-panel rq-config-panel--sidebar">
              <div class="rq-mode-toggle" role="group" aria-label="Mode selection">
                <button type="button" class="rq-mode-button ${state.mode === 'timed' ? 'active' : ''}" data-mode="timed">Timed</button>
                <button type="button" class="rq-mode-button ${state.mode === 'infinite' ? 'active' : ''}" data-mode="infinite">Infinite</button>
              </div>
              <div class="rq-config-grid">
                <div class="rq-mode-timed ${state.mode === 'timed' ? 'visible' : ''}">
                  <div class="rq-config-field">
                    <label>Queen Count</label>
                    <div class="rq-toggle-group rq-toggle-group--two-col" role="group">
                      <button type="button" class="rq-toggle-button ${state.timedQueenCount === 4 ? 'active' : ''}" data-timed-queens="4">
                        <span class="rq-toggle-top">4</span><span class="rq-toggle-bottom">Queens</span>
                      </button>
                      <button type="button" class="rq-toggle-button ${state.timedQueenCount === 5 ? 'active' : ''}" data-timed-queens="5">
                        <span class="rq-toggle-top">5</span><span class="rq-toggle-bottom">Queens</span>
                      </button>
                    </div>
                  </div>
                  <div class="rq-config-field">
                    <label>Timer Duration</label>
                    <div class="rq-toggle-group rq-toggle-group--vertical" role="group">
                      <button type="button" class="rq-toggle-button ${state.timerDuration === 60000 ? 'active' : ''}" data-timer-duration="60000">
                        <span class="rq-toggle-top">1</span><span class="rq-toggle-bottom">Minute</span>
                      </button>
                      <button type="button" class="rq-toggle-button ${state.timerDuration === 120000 ? 'active' : ''}" data-timer-duration="120000">
                        <span class="rq-toggle-top">2</span><span class="rq-toggle-bottom">Minutes</span>
                      </button>
                      <button type="button" class="rq-toggle-button ${state.timerDuration === 180000 ? 'active' : ''}" data-timer-duration="180000">
                        <span class="rq-toggle-top">3</span><span class="rq-toggle-bottom">Minutes</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="rq-mode-infinite ${state.mode === 'infinite' ? 'visible' : ''}">
                  <div class="rq-config-field">
                    <label>Queen Count</label>
                    <div class="rq-toggle-group rq-toggle-group--two-col" role="group">
                      <button type="button" class="rq-toggle-button ${state.infiniteQueenCount === 4 ? 'active' : ''}" data-infinite-queens="4">
                        <span class="rq-toggle-top">4</span><span class="rq-toggle-bottom">Queens</span>
                      </button>
                      <button type="button" class="rq-toggle-button ${state.infiniteQueenCount === 5 ? 'active' : ''}" data-infinite-queens="5">
                        <span class="rq-toggle-top">5</span><span class="rq-toggle-bottom">Queens</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main class="rq-main">
          <div class="rq-container">
            <div class="rq-card rq-root-card">
              <div class="rq-title">Running Queen</div>
              <div class="rq-muted">Drag queens or click squares to move. Avoid illegal/unsafe moves.</div>

              <div class="rq-board-wrap">
                <div class="rq-board-col">
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

                <div class="rq-side-panel">
                  <div class="rq-status-bar rq-status-bar--right">
                    <div class="rq-status-item">
                      <span class="rq-status-label">Current Player</span>
                      <span class="rq-status-value" id="rqPlayerDisplay">${escapeHtml(state.players[0]?.name || '—')}</span>
                    </div>
                    <div class="rq-status-item rq-timer-block ${state.mode === 'timed' ? 'visible' : ''}">
                      <span class="rq-status-label">Timer</span>
                      <span class="rq-status-value" id="rqTimerDisplay">00:00</span>
                    </div>
                  </div>

                  <div class="rq-scoreboard" id="rqScoreboard"></div>

                  <div class="rq-config-actions rq-config-actions--right">
                    <button type="button" id="rqStartButton" class="rq-primary">Start Game</button>
                    <button type="button" id="rqRestartButton" class="rq-secondary rq-green" disabled>Restart</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

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
      </div>
    `;
  }

  function cacheDomReferences(container) {
    state.boardEl = container.querySelector('#rqBoard');
    state.logEl = container.querySelector('#rqLogList');
    state.playerDisplayEl = container.querySelector('#rqPlayerDisplay');
    state.startButton = container.querySelector('#rqStartButton');
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
    container.querySelectorAll('[data-rq-scroll="top"]').forEach(btn => {
      btn.addEventListener('click', () => {
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { window.scrollTo(0, 0); }
      });
    });

    // Sidebar shortcuts
    container.querySelectorAll('[data-modal-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-modal-open') || '');
        if (key === 'leaderboard') {
          openLeaderboardModal(state.mode === 'infinite' ? 'infinite' : 'timed');
        } else if (key === 'rules') {
          openRulesModal();
        }
      });
    });

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

    // Classic mode removed (no board-size / queen-count inputs)

    const startButton = container.querySelector('#rqStartButton');
    if (startButton) {
      startButton.addEventListener('click', () => {
        startGame(container);
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

