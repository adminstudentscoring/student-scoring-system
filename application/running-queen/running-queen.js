(() => {
  // application/running-queen/src/game-legacy.js
  (() => {
    const API_BASE = window.API_BASE || "/api";
    function escapeHtml(v) {
      return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    const DEFAULT_CONFIG = {
      boardSize: 8,
      queenCount: 4,
      timerDuration: 12e4
    };
    const BOARD_PRESETS = [5, 8, 10];
    const QUEEN_PRESETS = [2, 3, 4, 5, 6, 7, 8];
    const SOUND_ENGINE = /* @__PURE__ */ (() => {
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
        gain.gain.setValueAtTime(1e-4, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(1e-4, now + duration);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.05);
      }
      return {
        playSuccess() {
          playTone({ frequency: 880, duration: 0.35, type: "triangle" });
        },
        playFail() {
          playTone({ frequency: 220, duration: 0.45, type: "sawtooth" });
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
      mode: "infinite",
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
      activeLeaderboardTab: "infinite",
      rulesOverlayEl: null,
      rulesModalBodyEl: null,
      keydownListenerAttached: false,
      positionCounts: /* @__PURE__ */ new Map()
    };
    function getPositionKey() {
      const positions = (state.queens || []).map((q) => [q.row, q.col]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((pair) => `${pair[0]},${pair[1]}`).join(";");
      return `${state.boardSize}|${positions}`;
    }
    function resetPositionTracking() {
      state.positionCounts = /* @__PURE__ */ new Map();
    }
    function recordPositionAndCheckRepetition() {
      const key = getPositionKey();
      const nextCount = (state.positionCounts.get(key) || 0) + 1;
      state.positionCounts.set(key, nextCount);
      return nextCount >= 3 ? { key, count: nextCount } : null;
    }
    function initRunningQueen() {
      const container = document.getElementById("runningQueenGame");
      if (!container) {
        console.error("Running Queen container not found");
        return;
      }
      let playersSource = [];
      if (Array.isArray(window.runningQueenPlayers)) {
        playersSource = window.runningQueenPlayers;
      } else {
        try {
          const stored = localStorage.getItem("runningQueenPlayers");
          if (stored) {
            playersSource = JSON.parse(stored);
          }
        } catch (error) {
          console.warn("Unable to read running queen players from storage:", error);
        }
      }
      state.players = Array.isArray(playersSource) ? playersSource.map((player) => ({
        id: player.id,
        name: player.name || "Unknown",
        studentId: player.studentId || "",
        success: 0
      })) : [];
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
          <div class="rq-side-title">\u2655 Running Queen</div>
          <div class="rq-side-sub">${escapeHtml(state.players[0]?.name || "\u2014")}${state.players[0]?.studentId ? ` (${escapeHtml(state.players[0].studentId)})` : ""}</div>
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
                <button type="button" class="rq-mode-button ${state.mode === "timed" ? "active" : ""}" data-mode="timed">Timed</button>
                <button type="button" class="rq-mode-button ${state.mode === "infinite" ? "active" : ""}" data-mode="infinite">Infinite</button>
              </div>
              <div class="rq-config-grid">
                <div class="rq-mode-timed ${state.mode === "timed" ? "visible" : ""}">
                  <div class="rq-config-field">
                    <label>Queen Count</label>
                    <div class="rq-toggle-group rq-toggle-group--two-col" role="group">
                      <button type="button" class="rq-toggle-button ${state.timedQueenCount === 4 ? "active" : ""}" data-timed-queens="4">
                        <span class="rq-toggle-top">4</span><span class="rq-toggle-bottom">Queens</span>
                      </button>
                      <button type="button" class="rq-toggle-button ${state.timedQueenCount === 5 ? "active" : ""}" data-timed-queens="5">
                        <span class="rq-toggle-top">5</span><span class="rq-toggle-bottom">Queens</span>
                      </button>
                    </div>
                  </div>
                  <div class="rq-config-field">
                    <label>Timer Duration</label>
                    <div class="rq-toggle-group rq-toggle-group--vertical" role="group">
                      <button type="button" class="rq-toggle-button ${state.timerDuration === 6e4 ? "active" : ""}" data-timer-duration="60000">
                        <span class="rq-toggle-top">1</span><span class="rq-toggle-bottom">Minute</span>
                      </button>
                      <button type="button" class="rq-toggle-button ${state.timerDuration === 12e4 ? "active" : ""}" data-timer-duration="120000">
                        <span class="rq-toggle-top">2</span><span class="rq-toggle-bottom">Minutes</span>
                      </button>
                      <button type="button" class="rq-toggle-button ${state.timerDuration === 18e4 ? "active" : ""}" data-timer-duration="180000">
                        <span class="rq-toggle-top">3</span><span class="rq-toggle-bottom">Minutes</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="rq-mode-infinite ${state.mode === "infinite" ? "visible" : ""}">
                  <div class="rq-config-field">
                    <label>Queen Count</label>
                    <div class="rq-toggle-group rq-toggle-group--two-col" role="group">
                      <button type="button" class="rq-toggle-button ${state.infiniteQueenCount === 4 ? "active" : ""}" data-infinite-queens="4">
                        <span class="rq-toggle-top">4</span><span class="rq-toggle-bottom">Queens</span>
                      </button>
                      <button type="button" class="rq-toggle-button ${state.infiniteQueenCount === 5 ? "active" : ""}" data-infinite-queens="5">
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
                      <span class="rq-status-value" id="rqPlayerDisplay">${escapeHtml(state.players[0]?.name || "\u2014")}</span>
                    </div>
                    <div class="rq-status-item rq-timer-block ${state.mode === "timed" ? "visible" : ""}">
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
            <button type="button" class="rq-modal-close" data-modal-close="leaderboard" aria-label="Close leaderboards">\u2715</button>
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
            <button type="button" class="rq-modal-close" data-modal-close="rules" aria-label="Close rules">\u2715</button>
          </div>
          <div class="rq-modal-body rq-rules-body"></div>
        </div>
      </div>
      </div>
    `;
    }
    function cacheDomReferences(container) {
      state.boardEl = container.querySelector("#rqBoard");
      state.logEl = container.querySelector("#rqLogList");
      state.playerDisplayEl = container.querySelector("#rqPlayerDisplay");
      state.startButton = container.querySelector("#rqStartButton");
      state.restartButton = container.querySelector("#rqRestartButton");
      state.scoreboardEl = container.querySelector("#rqScoreboard");
      state.leaderboardOverlayEl = container.querySelector("#rqLeaderboardOverlay");
      state.leaderboardTabs = container.querySelectorAll("#rqLeaderboardModal .rq-modal-tab");
      state.leaderboardLists = {
        timed: container.querySelector("#rqLeaderboardListTimed"),
        infinite: container.querySelector("#rqLeaderboardListInfinite")
      };
      state.rulesOverlayEl = container.querySelector("#rqRulesOverlay");
      state.rulesModalBodyEl = container.querySelector("#rqRulesModal .rq-modal-body");
      state.failOverlayEl = container.querySelector("#rqInfiniteFailOverlay");
      state.failMessageEl = container.querySelector("#rqInfiniteFailOverlay .rq-fail-message");
      state.failRetryButton = container.querySelector("#rqFailRetryButton");
      state.failCancelButton = container.querySelector("#rqFailCancelButton");
    }
    function attachListeners(container) {
      container.querySelectorAll('[data-rq-scroll="top"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          try {
            window.scrollTo({ top: 0, behavior: "smooth" });
          } catch {
            window.scrollTo(0, 0);
          }
        });
      });
      container.querySelectorAll("[data-modal-open]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = String(btn.getAttribute("data-modal-open") || "");
          if (key === "leaderboard") {
            openLeaderboardModal(state.mode === "infinite" ? "infinite" : "timed");
          } else if (key === "rules") {
            openRulesModal();
          }
        });
      });
      container.querySelectorAll(".rq-mode-button").forEach((button) => {
        button.addEventListener("click", () => {
          const mode = button.getAttribute("data-mode");
          if (mode && mode !== state.mode) {
            switchMode(mode);
          }
        });
      });
      container.querySelectorAll("[data-timed-queens]").forEach((button) => {
        button.addEventListener("click", () => {
          const value = parseInt(button.getAttribute("data-timed-queens"), 10);
          if (!Number.isNaN(value)) {
            state.timedQueenCount = value;
            updateModeVisibility();
          }
        });
      });
      container.querySelectorAll("[data-timer-duration]").forEach((button) => {
        button.addEventListener("click", () => {
          const value = parseInt(button.getAttribute("data-timer-duration"), 10);
          if (!Number.isNaN(value)) {
            state.timerDuration = value;
            updateModeVisibility();
          }
        });
      });
      container.querySelectorAll("[data-infinite-queens]").forEach((button) => {
        button.addEventListener("click", () => {
          const value = parseInt(button.getAttribute("data-infinite-queens"), 10);
          if (!Number.isNaN(value)) {
            state.infiniteQueenCount = value;
            updateModeVisibility();
          }
        });
      });
      const startButton = container.querySelector("#rqStartButton");
      if (startButton) {
        startButton.addEventListener("click", () => {
          startGame(container);
        });
      }
      const restartButton = container.querySelector("#rqRestartButton");
      if (restartButton) {
        restartButton.addEventListener("click", () => {
          restartGame(container);
        });
      }
      const clearLogButton = container.querySelector("#rqClearLogButton");
      if (clearLogButton) {
        clearLogButton.addEventListener("click", () => {
          clearLog();
          renderLog();
        });
      }
      const refreshLeaderboardButton = container.querySelector("#rqRefreshLeaderboard");
      if (refreshLeaderboardButton) {
        refreshLeaderboardButton.addEventListener("click", () => {
          loadLeaderboard();
        });
      }
      if (state.leaderboardTabs) {
        state.leaderboardTabs.forEach((tab) => {
          tab.addEventListener("click", () => {
            const tabKey = tab.getAttribute("data-leaderboard-tab");
            if (!tabKey) return;
            state.activeLeaderboardTab = tabKey;
            updateLeaderboardTabs();
          });
        });
      }
      const leaderboardButton = container.querySelector("#rqLeaderboardButton");
      if (leaderboardButton) {
        leaderboardButton.addEventListener("click", () => {
          openLeaderboardModal(state.mode === "infinite" ? "infinite" : "timed");
        });
      }
      const rulesButton = container.querySelector("#rqRulesButton");
      if (rulesButton) {
        rulesButton.addEventListener("click", () => {
          openRulesModal();
        });
      }
      container.querySelectorAll(".rq-modal-close").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.getAttribute("data-modal-close");
          if (key === "leaderboard") {
            closeLeaderboardModal();
          } else if (key === "rules") {
            closeRulesModal();
          }
        });
      });
      if (state.leaderboardOverlayEl) {
        state.leaderboardOverlayEl.addEventListener("click", (event) => {
          if (event.target === state.leaderboardOverlayEl) {
            closeLeaderboardModal();
          }
        });
      }
      if (state.rulesOverlayEl) {
        state.rulesOverlayEl.addEventListener("click", (event) => {
          if (event.target === state.rulesOverlayEl) {
            closeRulesModal();
          }
        });
      }
      if (state.failRetryButton) {
        state.failRetryButton.addEventListener("click", () => {
          hideInfiniteFailOverlay();
          if (state.mode !== "infinite") {
            switchMode("infinite");
            return;
          }
          startGame(container);
        });
      }
      if (state.failCancelButton) {
        state.failCancelButton.addEventListener("click", () => {
          hideInfiniteFailOverlay();
        });
      }
      if (!state.keydownListenerAttached) {
        document.addEventListener("keydown", onGlobalKeydown);
        state.keydownListenerAttached = true;
      }
      updateModeVisibility();
    }
    function switchMode(mode) {
      if (!["timed", "infinite"].includes(mode)) {
        return;
      }
      stopTimer();
      state.mode = mode;
      state.boardSize = 8;
      state.queenCount = mode === "timed" ? state.timedQueenCount : state.infiniteQueenCount;
      state.remainingTime = mode === "timed" ? state.timerDuration : 0;
      updateModeVisibility();
      resetGameState(true);
      renderBoard();
      renderLog();
      updateScoreboard();
      loadLeaderboard();
    }
    function updateModeVisibility() {
      const container = document.getElementById("runningQueenGame");
      if (!container) return;
      container.querySelectorAll(".rq-mode-button").forEach((button) => {
        const mode = button.getAttribute("data-mode");
        button.classList.toggle("active", mode === state.mode);
      });
      const timedSection = container.querySelector(".rq-mode-timed");
      const infiniteSection = container.querySelector(".rq-mode-infinite");
      const timerBlock = container.querySelector(".rq-timer-block");
      if (timedSection) {
        timedSection.classList.toggle("visible", state.mode === "timed");
        timedSection.querySelectorAll("[data-timed-queens]").forEach((button) => {
          const value = parseInt(button.getAttribute("data-timed-queens"), 10);
          button.classList.toggle("active", value === state.timedQueenCount);
        });
        timedSection.querySelectorAll("[data-timer-duration]").forEach((button) => {
          const value = parseInt(button.getAttribute("data-timer-duration"), 10);
          button.classList.toggle("active", value === state.timerDuration);
        });
      }
      if (timerBlock) {
        timerBlock.classList.toggle("visible", state.mode === "timed");
      }
      if (infiniteSection) {
        infiniteSection.classList.toggle("visible", state.mode === "infinite");
        infiniteSection.querySelectorAll("[data-infinite-queens]").forEach((button) => {
          const value = parseInt(button.getAttribute("data-infinite-queens"), 10);
          button.classList.toggle("active", value === state.infiniteQueenCount);
        });
      }
      if (state.mode === "timed") {
        state.remainingTime = state.timerDuration;
        state.queenCount = state.timedQueenCount;
        state.activeLeaderboardTab = "timed";
      } else if (state.mode === "infinite") {
        state.remainingTime = 0;
        state.queenCount = state.infiniteQueenCount;
        state.activeLeaderboardTab = "infinite";
      } else {
        state.remainingTime = 0;
        if (state.activeLeaderboardTab !== "timed") {
          state.activeLeaderboardTab = "timed";
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
        state.timedQueenCount = 4;
        state.infiniteQueenCount = 4;
        state.timerDuration = DEFAULT_CONFIG.timerDuration;
      }
      state.currentPlayerIndex = 0;
      state.selectedQueenIndex = null;
      state.violationOccurred = false;
      state.gameActive = false;
      state.highlight = null;
      state.queens = [];
      state.logEntries = [];
      state.totalSuccessCount = 0;
      state.lastMovedQueenIndex = null;
      state.players = state.players.map((player) => ({ ...player, success: 0 }));
      state.boardSize = 8;
      state.queenCount = state.mode === "timed" ? state.timedQueenCount : state.infiniteQueenCount;
      state.remainingTime = state.mode === "timed" ? state.timerDuration : 0;
      updateStatusDisplay();
      if (state.startButton) state.startButton.disabled = false;
      if (state.restartButton) state.restartButton.disabled = true;
      updateScoreboard();
    }
    function startGame(container) {
      hideInfiniteFailOverlay();
      stopTimer();
      resetPositionTracking();
      state.boardSize = 8;
      const queenCount = state.mode === "timed" ? state.timedQueenCount : state.infiniteQueenCount;
      state.queenCount = queenCount;
      state.currentPlayerIndex = 0;
      state.violationOccurred = false;
      state.gameActive = true;
      state.highlight = null;
      state.totalSuccessCount = 0;
      state.lastMovedQueenIndex = null;
      state.players = state.players.map((player) => ({ ...player, success: 0 }));
      if (state.startButton) state.startButton.disabled = true;
      if (state.restartButton) state.restartButton.disabled = false;
      state.remainingTime = state.mode === "timed" ? state.timerDuration : 0;
      clearLog();
      if (state.mode === "timed") {
        appendLog(`Timed mode started with ${queenCount} queens. Duration: ${formatDuration(state.timerDuration)}.`, "info");
      } else if (state.mode === "infinite") {
        appendLog(`Infinite mode started with ${queenCount} queens. Play until a mistake occurs.`, "info");
      }
      state.queens = generateSafeQueenPositions(state.boardSize, queenCount);
      if (state.queens.length !== queenCount) {
        appendLog("Unable to generate a valid starting layout. Please adjust settings.", "error");
        showPopup("Unable to create starting positions. Try different settings.", "error");
        state.gameActive = false;
        if (state.startButton) state.startButton.disabled = false;
        if (state.restartButton) state.restartButton.disabled = true;
        return;
      }
      recordPositionAndCheckRepetition();
      updateStatusDisplay();
      if (state.mode === "timed") {
        startTimer();
      }
      renderBoard();
      renderLog();
      updateScoreboard();
    }
    function generateSafeQueenPositions(boardSize, queenCount) {
      const positions = [];
      const occupiedColumns = /* @__PURE__ */ new Set();
      const occupiedDiag1 = /* @__PURE__ */ new Set();
      const occupiedDiag2 = /* @__PURE__ */ new Set();
      const availableRows = Array.from({ length: boardSize }, (_, index) => index);
      function isSafe(row, col) {
        return !occupiedColumns.has(col) && !occupiedDiag1.has(row - col) && !occupiedDiag2.has(row + col) && !positions.some((pos) => pos.row === row && pos.col === col);
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
      state.boardSize = 8;
      state.queenCount = state.mode === "timed" ? state.timedQueenCount : state.infiniteQueenCount;
      state.currentPlayerIndex = 0;
      state.violationOccurred = false;
      state.gameActive = true;
      state.highlight = null;
      state.totalSuccessCount = 0;
      state.lastMovedQueenIndex = null;
      state.players = state.players.map((player) => ({ ...player, success: 0 }));
      state.remainingTime = state.mode === "timed" ? state.timerDuration : 0;
      state.queens = generateSafeQueenPositions(state.boardSize, state.queenCount);
      if (state.queens.length !== state.queenCount) {
        appendLog("Unable to generate a valid starting layout on restart. Please adjust settings.", "error");
        showPopup("Unable to create starting positions. Try different settings.", "error");
        state.gameActive = false;
        if (state.startButton) state.startButton.disabled = false;
        if (state.restartButton) state.restartButton.disabled = true;
        return;
      }
      recordPositionAndCheckRepetition();
      if (state.startButton) state.startButton.disabled = true;
      if (state.restartButton) state.restartButton.disabled = false;
      appendLog(
        state.mode === "timed" ? `Timed mode restarted with ${state.queenCount} queens, duration ${formatDuration(state.timerDuration)}.` : state.mode === "infinite" ? `Infinite mode restarted with ${state.queenCount} queens.` : `Infinite mode restarted with ${state.queenCount} queens.`,
        "info"
      );
      if (state.mode === "timed") {
        startTimer();
      }
      renderBoard();
      updateScoreboard();
    }
    function renderBoard() {
      if (!state.boardEl) return;
      const colLabelContainer = state.boardEl.parentElement?.querySelector(".rq-board-col-labels");
      const rowLabelContainer = state.boardEl.parentElement?.querySelector(".rq-board-row-labels");
      if (state.boardEl.parentElement) {
        state.boardEl.parentElement.style.setProperty("--rq-board-size", state.boardSize);
      }
      if (colLabelContainer) {
        colLabelContainer.innerHTML = generateColumnLabels(state.boardSize);
      }
      if (rowLabelContainer) {
        rowLabelContainer.innerHTML = generateRowLabels(state.boardSize);
      }
      state.boardEl.style.gridTemplateColumns = `repeat(${state.boardSize}, 1fr)`;
      state.boardEl.style.gridTemplateRows = `repeat(${state.boardSize}, 1fr)`;
      const highlightCells = state.highlight?.cells || [];
      const highlightType = state.highlight?.type || null;
      const frag = document.createDocumentFragment();
      for (let row = 0; row < state.boardSize; row += 1) {
        for (let col = 0; col < state.boardSize; col += 1) {
          const cell = document.createElement("button");
          cell.type = "button";
          cell.className = `rq-cell ${(row + col) % 2 === 0 ? "light" : "dark"}`;
          cell.dataset.row = String(row);
          cell.dataset.col = String(col);
          cell.setAttribute("aria-label", `Row ${row + 1}, Column ${col + 1}`);
          const queenIndex = state.queens.findIndex((q) => q.row === row && q.col === col);
          if (queenIndex !== -1) {
            const queenSpan = document.createElement("span");
            queenSpan.className = "rq-queen";
            const image = document.createElement("img");
            image.className = "rq-queen-image";
            image.alt = "Queen piece";
            image.src = "/assets/pieces/white_Queen.png";
            queenSpan.appendChild(image);
            cell.appendChild(queenSpan);
            cell.classList.add("has-queen");
            if (state.selectedQueenIndex === queenIndex) {
              cell.classList.add("selected");
            }
          }
          if (highlightCells.some((position) => position.row === row && position.col === col)) {
            cell.classList.add(highlightType === "success" ? "highlight-success" : "highlight-fail");
          }
          cell.addEventListener("click", () => onCellClick(row, col));
          frag.appendChild(cell);
        }
      }
      state.boardEl.replaceChildren(frag);
      enablePointerDrag();
    }
    function onCellClick(row, col) {
      if (state.suppressNextClick) {
        state.suppressNextClick = false;
        return;
      }
      if (!state.gameActive) return;
      const queenIndex = state.queens.findIndex((q) => q.row === row && q.col === col);
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
    function enablePointerDrag() {
      if (!state.boardEl) return;
      const DRAG_THRESHOLD_PX = 4;
      let drag = null;
      const clearOver = () => {
        if (drag?.overCellEl) {
          drag.overCellEl.classList.remove("rq-drop-target");
          drag.overCellEl = null;
        }
      };
      const cleanup = () => {
        clearOver();
        if (drag?.originCellEl) {
          drag.originCellEl.classList.remove("rq-drag-origin");
          drag.originCellEl = null;
        }
        if (drag?.ghostEl) drag.ghostEl.remove();
        drag = null;
        document.body.classList.remove("rq-dragging");
      };
      const getCellUnderPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest?.(".rq-cell") || null;
      };
      const moveGhost = (x, y) => {
        if (!drag?.ghostEl) return;
        drag.ghostEl.style.left = `${x}px`;
        drag.ghostEl.style.top = `${y}px`;
      };
      const startGhostFromCell = (cellEl) => {
        const img = cellEl.querySelector(".rq-queen-image");
        const src = img?.getAttribute("src") || "/assets/pieces/white_Queen.png";
        const ghost = document.createElement("div");
        ghost.className = "rq-drag-ghost";
        const gi = document.createElement("img");
        gi.src = src;
        gi.alt = "";
        ghost.appendChild(gi);
        document.body.appendChild(ghost);
        drag.ghostEl = ghost;
        drag.originCellEl = cellEl;
        cellEl.classList.add("rq-drag-origin");
        document.body.classList.add("rq-dragging");
      };
      const onPointerMove = (e) => {
        if (!drag) return;
        const x = e.clientX;
        const y = e.clientY;
        const dx = x - drag.startX;
        const dy = y - drag.startY;
        if (!drag.started && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
          drag.started = true;
          const originCell = state.boardEl.querySelector(`.rq-cell[data-row="${drag.originRow}"][data-col="${drag.originCol}"]`);
          if (originCell) startGhostFromCell(originCell);
        }
        if (!drag.started) return;
        moveGhost(x, y);
        const cell = getCellUnderPoint(x, y);
        if (cell !== drag.overCellEl) {
          clearOver();
          if (cell) {
            cell.classList.add("rq-drop-target");
            drag.overCellEl = cell;
          }
        }
        e.preventDefault?.();
      };
      const onPointerUp = (e) => {
        if (!drag) return;
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("pointercancel", onPointerUp, true);
        state.suppressNextClick = true;
        setTimeout(() => {
          state.suppressNextClick = false;
        }, 0);
        if (!drag.started) {
          const { originRow, originCol } = drag;
          cleanup();
          onCellClick(originRow, originCol);
          return;
        }
        const cell = getCellUnderPoint(e.clientX, e.clientY);
        if (cell) {
          const targetRow = Number(cell.getAttribute("data-row"));
          const targetCol = Number(cell.getAttribute("data-col"));
          if (Number.isFinite(targetRow) && Number.isFinite(targetCol)) {
            if (!(targetRow === drag.originRow && targetCol === drag.originCol)) {
              attemptMove(drag.queenIndex, targetRow, targetCol);
            }
          }
        }
        cleanup();
        e.preventDefault?.();
      };
      state.boardEl.querySelectorAll(".rq-cell").forEach((cell) => {
        cell.addEventListener("pointerdown", (e) => {
          if (!state.gameActive) return;
          if (e.button !== void 0 && e.button !== 0) return;
          const row = Number(cell.getAttribute("data-row"));
          const col = Number(cell.getAttribute("data-col"));
          if (!Number.isFinite(row) || !Number.isFinite(col)) return;
          const queenIndex = state.queens.findIndex((q) => q.row === row && q.col === col);
          if (queenIndex === -1) return;
          drag = {
            queenIndex,
            originRow: row,
            originCol: col,
            startX: e.clientX,
            startY: e.clientY,
            started: false,
            ghostEl: null,
            overCellEl: null,
            originCellEl: null
          };
          window.addEventListener("pointermove", onPointerMove, true);
          window.addEventListener("pointerup", onPointerUp, true);
          window.addEventListener("pointercancel", onPointerUp, true);
          e.preventDefault?.();
        });
      });
    }
    function attemptMove(queenIndex, targetRow, targetCol) {
      const queen = state.queens[queenIndex];
      const currentPlayer = state.players[state.currentPlayerIndex];
      if (!queen || !currentPlayer) {
        return;
      }
      if (state.lastMovedQueenIndex !== null && state.lastMovedQueenIndex === queenIndex) {
        if (state.mode === "timed") handleTimedFailure("Timed challenge failed: same queen moved consecutively.");
        else handleInfiniteFailure("Infinite run ended: same queen moved consecutively.");
        return;
      }
      if (!isValidQueenMove(queen.row, queen.col, targetRow, targetCol)) {
        if (state.mode === "timed") handleTimedFailure("Timed challenge failed: invalid queen move.");
        else handleInfiniteFailure("Infinite run ended: invalid queen move.");
        return;
      }
      const rowDelta = Math.abs(targetRow - queen.row);
      const colDelta = Math.abs(targetCol - queen.col);
      const moveDistance = Math.max(rowDelta, colDelta);
      if (moveDistance < 2) {
        if (state.mode === "timed") handleTimedFailure("Timed challenge failed: move was less than two squares.");
        else handleInfiniteFailure("Infinite run ended: move was less than two squares.");
        return;
      }
      if (!isPathClear(queen.row, queen.col, targetRow, targetCol)) {
        if (state.mode === "timed") handleTimedFailure("Timed challenge failed: path blocked by another queen.");
        else handleInfiniteFailure("Infinite run ended: path blocked by another queen.");
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
        type: boardSafe ? "success" : "fail",
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
        appendLog(`${currentPlayer.name} moved safely to ${formatCoordinate(endCell)}.`, "success");
        SOUND_ENGINE.playSuccess();
        updateScoreboard();
        state.lastMovedQueenIndex = queenIndex;
        const repetition = recordPositionAndCheckRepetition();
        if (repetition) {
          const repetitionMessage = `Threefold repetition detected. Position repeated ${repetition.count} times.`;
          if (state.mode === "timed") {
            handleTimedFailure(`Timed challenge failed: ${repetitionMessage}`);
          } else if (state.mode === "infinite") {
            handleInfiniteFailure(`Infinite run ended: ${repetitionMessage}`);
          }
          return;
        }
      } else {
        const failureMessage = `${currentPlayer.name} attempted ${formatCoordinate(endCell)} and triggered a conflict. Queen returns to ${formatCoordinate(startCell)}.`;
        if (state.mode === "timed") {
          showPopup(`${currentPlayer.name}'s move is under attack!`, "error");
          queen.row = originalPosition.row;
          queen.col = originalPosition.col;
          renderBoard();
          updateScoreboard();
          handleTimedFailure(failureMessage);
          return;
        }
        if (state.mode === "infinite") {
          queen.row = originalPosition.row;
          queen.col = originalPosition.col;
          renderBoard();
          updateScoreboard();
          SOUND_ENGINE.playFail();
          handleInfiniteFailure(failureMessage);
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
        if (state.queens.some((queen) => queen.row === currentRow && queen.col === currentCol)) {
          return false;
        }
        currentRow += rowStep;
        currentCol += colStep;
      }
      return !state.queens.some((queen) => queen.row === toRow && queen.col === toCol);
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
      state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
      updateStatusDisplay();
    }
    function finalizeGame(goalAchievedEarly, options = {}) {
      stopTimer();
      state.gameActive = false;
      state.selectedQueenIndex = null;
      state.lastMovedQueenIndex = null;
      renderBoard();
      if (state.mode === "timed") {
        const status = goalAchievedEarly ? "success" : "fail";
        const duration = state.timerDuration - state.remainingTime;
        const message = options.message || (status === "success" ? `Time's up! Final score: ${state.totalSuccessCount} steps.` : `Timed run ended. Final score: ${state.totalSuccessCount} steps.`);
        appendLog(message, status === "success" ? "success" : "error");
        recordLeaderboardEntry({
          mode: "timed",
          score: state.totalSuccessCount,
          duration,
          status
        });
        if (status === "success") {
          SOUND_ENGINE.playSuccess();
        } else {
          SOUND_ENGINE.playFail();
        }
        if (state.startButton) state.startButton.disabled = false;
        updateScoreboard();
        return;
      }
      if (state.mode === "infinite") {
        const status = goalAchievedEarly ? "success" : "fail";
        const message = options.message || `Infinite run ended. Final score: ${state.totalSuccessCount} steps.`;
        appendLog(message, status === "success" ? "success" : "error");
        recordLeaderboardEntry({
          mode: "infinite",
          score: state.totalSuccessCount,
          duration: 0,
          status
        });
        if (status === "success") {
          SOUND_ENGINE.playSuccess();
        } else {
          SOUND_ENGINE.playFail();
        }
        if (state.startButton) state.startButton.disabled = false;
        updateScoreboard();
        return;
      }
    }
    function updateStatusDisplay() {
      if (state.playerDisplayEl) {
        const player = state.players[state.currentPlayerIndex];
        state.playerDisplayEl.textContent = player ? player.name : "\u2014";
      }
    }
    function appendLog(text, type = "info") {
      state.logEntries.push({ text, type, time: /* @__PURE__ */ new Date() });
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
      state.logEl.innerHTML = state.logEntries.map((entry) => `
      <div class="rq-log-entry rq-log-${entry.type}">
        <span class="rq-log-time">${formatTime(entry.time)}</span>
        <span class="rq-log-text">${entry.text}</span>
      </div>
    `).join("");
      state.logEl.scrollTop = state.logEl.scrollHeight;
    }
    function formatTime(date) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    function formatCoordinate(position) {
      const columnLetter = String.fromCharCode("a".charCodeAt(0) + position.col);
      const rowNumber = state.boardSize - position.row;
      return `(${columnLetter}, ${rowNumber})`;
    }
    function generateColumnLabels(size) {
      return Array.from({ length: size }).map((_, index) => {
        const letter = String.fromCharCode("A".charCodeAt(0) + index);
        return `<span class="rq-col-label">${letter}</span>`;
      }).join("");
    }
    function generateRowLabels(size) {
      return Array.from({ length: size }).map((_, index) => {
        const number = index + 1;
        return `<span class="rq-row-label">${number}</span>`;
      }).reverse().join("");
    }
    function updateScoreboard() {
      if (!state.scoreboardEl) return;
      if (!Array.isArray(state.players) || state.players.length === 0) {
        state.scoreboardEl.innerHTML = '<div class="rq-scoreboard-empty">No players selected.</div>';
        return;
      }
      if (state.mode === "timed") {
        state.scoreboardEl.innerHTML = `
        <div class="rq-score-summary">
          <span class="rq-score-total-label">Timed Score</span>
          <span class="rq-score-total-value">${state.totalSuccessCount} steps</span>
        </div>
        <div class="rq-score-list">
          ${state.players.map((player) => `
            <div class="rq-score-item">
              <span class="rq-score-name">${player.name}</span>
              <span class="rq-score-value">${player.success || 0}</span>
            </div>
          `).join("")}
        </div>
      `;
        updateTimerDisplay();
        return;
      }
      if (state.mode === "infinite") {
        state.scoreboardEl.innerHTML = `
        <div class="rq-score-summary">
          <span class="rq-score-total-label">Infinite Score</span>
          <span class="rq-score-total-value">${state.totalSuccessCount} steps</span>
        </div>
        <div class="rq-score-list">
          ${state.players.map((player) => `
            <div class="rq-score-item">
              <span class="rq-score-name">${player.name}</span>
              <span class="rq-score-value">${player.success || 0}</span>
            </div>
          `).join("")}
        </div>
      `;
        return;
      }
    }
    function showPopup(message, type) {
      const container = document.getElementById("rqPopupContainer");
      if (!container) {
        alert(message);
        return;
      }
      const popup = document.createElement("div");
      popup.className = `rq-popup rq-popup-${type}`;
      popup.innerHTML = `
      <div class="rq-popup-message">${message}</div>
      <button type="button" class="rq-popup-button">OK</button>
    `;
      container.appendChild(popup);
      container.classList.add("visible");
      const removePopup = () => {
        container.classList.remove("visible");
        popup.remove();
      };
      popup.querySelector(".rq-popup-button").addEventListener("click", removePopup);
      setTimeout(removePopup, 2500);
    }
    function showInfiniteFailOverlay(message) {
      const overlay = state.failOverlayEl || document.getElementById("rqInfiniteFailOverlay");
      if (!overlay) {
        return;
      }
      const msgEl = state.failMessageEl || overlay.querySelector(".rq-fail-message");
      if (msgEl) {
        msgEl.textContent = message || "Infinite run ended. Try again?";
      }
      overlay.classList.remove("hidden");
    }
    function hideInfiniteFailOverlay() {
      const overlay = state.failOverlayEl || document.getElementById("rqInfiniteFailOverlay");
      if (!overlay) {
        return;
      }
      overlay.classList.add("hidden");
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
        state.remainingTime = Math.max(0, state.remainingTime - 1e3);
        updateTimerDisplay();
        if (state.remainingTime <= 0) {
          stopTimer();
          finalizeGame(true);
        }
      }, 1e3);
    }
    function stopTimer() {
      if (state.timerIntervalId) {
        window.clearInterval(state.timerIntervalId);
        state.timerIntervalId = null;
      }
      if (state.mode === "timed" && state.remainingTime <= 0) {
        state.remainingTime = 0;
        updateTimerDisplay();
      }
    }
    function updateTimerDisplay() {
      const timerEl = document.getElementById("rqTimerDisplay");
      if (timerEl) {
        timerEl.textContent = state.mode === "timed" ? formatTimer(state.remainingTime) : "--:--";
      }
    }
    function handleTimedFailure(message) {
      if (state.mode !== "timed" || !state.gameActive) {
        return;
      }
      finalizeGame(false, { message });
    }
    function handleInfiniteFailure(message) {
      if (state.mode !== "infinite" || !state.gameActive) {
        return;
      }
      finalizeGame(false, { message });
      showInfiniteFailOverlay(message);
    }
    function formatTimer(ms) {
      const totalSeconds = Math.max(0, Math.floor(ms / 1e3));
      const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
      const seconds = (totalSeconds % 60).toString().padStart(2, "0");
      return `${minutes}:${seconds}`;
    }
    function formatDuration(ms) {
      const totalSeconds = Math.max(0, Math.round(ms / 1e3));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}m ${seconds}s`;
    }
    async function loadLeaderboard() {
      try {
        const response = await fetch("/api/running-queen/leaderboard");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        state.leaderboard = Array.isArray(data.entries) ? data.entries : [];
        renderLeaderboard();
      } catch (error) {
        console.error("Failed to load leaderboard:", error);
        renderLeaderboard(true);
      }
    }
    function renderLeaderboard(loadError = false) {
      const entries = Array.isArray(state.leaderboard) ? state.leaderboard.map((entry) => ({
        ...entry,
        mode: entry.mode || "timed",
        queenCount: Number(entry.queenCount) || null,
        timerDurationMs: Number(entry.timerDurationMs || entry.timerDuration) || 0
      })) : [];
      const timedEntries = entries.filter((entry) => entry.mode === "timed");
      const infiniteEntries = entries.filter((entry) => entry.mode === "infinite");
      renderTimedLeaderboard(state.leaderboardLists.timed, timedEntries, loadError);
      renderInfiniteLeaderboard(state.leaderboardLists.infinite, infiniteEntries, loadError);
      updateLeaderboardTabs();
    }
    const LEADERBOARD_QUEEN_GROUPS = [4, 5];
    const TIMED_DURATION_BUCKETS = [
      { value: 6e4, label: "1 minute" },
      { value: 12e4, label: "2 minute" },
      { value: 18e4, label: "3 minute" }
    ];
    function sortLeaderboardEntries(list) {
      return [...list].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.mode === "timed" && b.mode === "timed") {
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
          <div class="rq-leaderboard-names">${entry.players?.map((p) => p.name).join(", ") || "Unknown Team"}</div>
          <div class="rq-leaderboard-meta">
            <span>${entry.score} steps</span>
            <span>${metaFormatter(entry)}</span>
            <span>${entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ""}</span>
          </div>
        </div>
      </div>
    `).join("");
    }
    function renderTimedLeaderboard(container, entries, loadError) {
      if (!container) return;
      if (loadError) {
        container.innerHTML = '<div class="rq-leaderboard-empty">Unable to load leaderboard.</div>';
        return;
      }
      const normalized = Array.isArray(entries) ? entries : [];
      let hasAny = false;
      const groupsHtml = LEADERBOARD_QUEEN_GROUPS.map((qc) => {
        const bucketHtml = TIMED_DURATION_BUCKETS.map((bucket) => {
          const bucketEntries = sortLeaderboardEntries(
            normalized.filter((entry) => entry.queenCount === qc && entry.timerDurationMs === bucket.value)
          );
          if (bucketEntries.length > 0) hasAny = true;
          return `
          <div class="rq-leaderboard-subgroup">
            <div class="rq-leaderboard-subtitle">Timed \u2022 ${bucket.label}</div>
            ${bucketEntries.length ? renderLeaderboardItems(bucketEntries, (entry) => formatDuration(entry.duration || 0)) : '<div class="rq-leaderboard-empty">No entries yet.</div>'}
          </div>
        `;
        }).join("");
        const otherEntries = sortLeaderboardEntries(
          normalized.filter(
            (entry) => entry.queenCount === qc && !TIMED_DURATION_BUCKETS.some((bucket) => entry.timerDurationMs === bucket.value)
          )
        );
        const otherHtml = otherEntries.length ? `
        <div class="rq-leaderboard-subgroup">
          <div class="rq-leaderboard-subtitle">Timed \u2022 Other</div>
          ${renderLeaderboardItems(otherEntries, (entry) => formatDuration(entry.duration || 0))}
        </div>
      ` : "";
        if (otherEntries.length > 0) hasAny = true;
        const hasGroupEntries = bucketHtml || otherHtml;
        return `
        <div class="rq-leaderboard-group">
          <div class="rq-leaderboard-group-title">${qc} Queens</div>
          ${bucketHtml}${otherHtml}
        </div>
      `;
      }).join("");
      const unspecified = sortLeaderboardEntries(
        normalized.filter((entry) => !LEADERBOARD_QUEEN_GROUPS.includes(entry.queenCount))
      );
      const unspecifiedHtml = unspecified.length ? `
      <div class="rq-leaderboard-group">
        <div class="rq-leaderboard-group-title">Other / Unspecified</div>
        ${renderLeaderboardItems(unspecified, (entry) => formatDuration(entry.duration || 0))}
      </div>
    ` : "";
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
      const groupsHtml = LEADERBOARD_QUEEN_GROUPS.map((qc) => {
        const list = sortLeaderboardEntries(normalized.filter((entry) => entry.queenCount === qc));
        if (list.length > 0) hasAny = true;
        return `
        <div class="rq-leaderboard-group">
          <div class="rq-leaderboard-group-title">${qc} Queens \u2022 Infinite</div>
          ${list.length ? renderLeaderboardItems(list, () => "\u2014") : '<div class="rq-leaderboard-empty">No entries yet.</div>'}
        </div>
      `;
      }).join("");
      const unspecified = sortLeaderboardEntries(
        normalized.filter((entry) => !LEADERBOARD_QUEEN_GROUPS.includes(entry.queenCount))
      );
      const unspecifiedHtml = unspecified.length ? `
      <div class="rq-leaderboard-group">
        <div class="rq-leaderboard-group-title">Other / Unspecified</div>
        ${renderLeaderboardItems(unspecified, () => "\u2014")}
      </div>
    ` : "";
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
        state.leaderboardTabs.forEach((tab) => {
          const key = tab.getAttribute("data-leaderboard-tab");
          tab.classList.toggle("active", key === active);
        });
      }
      if (state.leaderboardLists.timed) {
        state.leaderboardLists.timed.classList.toggle("hidden", active !== "timed");
      }
      if (state.leaderboardLists.infinite) {
        state.leaderboardLists.infinite.classList.toggle("hidden", active !== "infinite");
      }
    }
    function openLeaderboardModal(defaultTab = "timed") {
      state.activeLeaderboardTab = defaultTab;
      updateLeaderboardTabs();
      renderLeaderboard();
      loadLeaderboard();
      if (state.leaderboardOverlayEl) {
        state.leaderboardOverlayEl.classList.remove("hidden");
        state.leaderboardOverlayEl.setAttribute("aria-hidden", "false");
      }
    }
    function closeLeaderboardModal() {
      if (state.leaderboardOverlayEl) {
        state.leaderboardOverlayEl.classList.add("hidden");
        state.leaderboardOverlayEl.setAttribute("aria-hidden", "true");
      }
    }
    function openRulesModal() {
      if (state.rulesModalBodyEl) {
        state.rulesModalBodyEl.innerHTML = getRulesHtml();
        state.rulesModalBodyEl.scrollTop = 0;
      }
      if (state.rulesOverlayEl) {
        state.rulesOverlayEl.classList.remove("hidden");
        state.rulesOverlayEl.setAttribute("aria-hidden", "false");
      }
    }
    function closeRulesModal() {
      if (state.rulesOverlayEl) {
        state.rulesOverlayEl.classList.add("hidden");
        state.rulesOverlayEl.setAttribute("aria-hidden", "true");
      }
    }
    function onGlobalKeydown(event) {
      if (event.key !== "Escape") return;
      let handled = false;
      if (state.leaderboardOverlayEl && !state.leaderboardOverlayEl.classList.contains("hidden")) {
        closeLeaderboardModal();
        handled = true;
      }
      if (state.rulesOverlayEl && !state.rulesOverlayEl.classList.contains("hidden")) {
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
          <li>If the board becomes unsafe, the queen snaps back and the current mode\u2019s failure flow is triggered.</li>
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
          queenCount: mode === "timed" ? state.timedQueenCount : state.infiniteQueenCount,
          timerDurationMs: mode === "timed" ? state.timerDuration : 0,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await fetch("/api/running-queen/leaderboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        loadLeaderboard();
      } catch (error) {
        console.error("Unable to record leaderboard entry:", error);
      }
    }
    window.initRunningQueen = initRunningQueen;
  })();
})();
