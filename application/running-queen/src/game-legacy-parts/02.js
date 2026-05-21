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
    if (!['timed', 'infinite'].includes(mode)) {
      return;
    }
    stopTimer();
    state.mode = mode;
    state.boardSize = 8;
    state.queenCount = mode === 'timed' ? state.timedQueenCount : state.infiniteQueenCount;
    state.remainingTime = mode === 'timed' ? state.timerDuration : 0;
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
    const timedSection = container.querySelector('.rq-mode-timed');
    const infiniteSection = container.querySelector('.rq-mode-infinite');
    const timerBlock = container.querySelector('.rq-timer-block');
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
    state.players = state.players.map(player => ({ ...player, success: 0 }));
    state.boardSize = 8;
    state.queenCount = state.mode === 'timed' ? state.timedQueenCount : state.infiniteQueenCount;
    state.remainingTime = state.mode === 'timed' ? state.timerDuration : 0;
    updateStatusDisplay();
    if (state.startButton) state.startButton.disabled = false;
    if (state.restartButton) state.restartButton.disabled = true;
    updateScoreboard();
  }

  function startGame(container) {
    hideInfiniteFailOverlay();
    stopTimer();
    resetPositionTracking();
    // Timed / Infinite only (Classic removed)
    state.boardSize = 8;
    const queenCount = state.mode === 'timed' ? state.timedQueenCount : state.infiniteQueenCount;
    state.queenCount = queenCount;
    state.currentPlayerIndex = 0;
    state.violationOccurred = false;
    state.gameActive = true;
    state.highlight = null;
    state.totalSuccessCount = 0;
    state.lastMovedQueenIndex = null;
    state.players = state.players.map(player => ({ ...player, success: 0 }));
    if (state.startButton) state.startButton.disabled = true;
    if (state.restartButton) state.restartButton.disabled = false;
    state.remainingTime = state.mode === 'timed' ? state.timerDuration : 0;

    clearLog();
    if (state.mode === 'timed') {
      appendLog(`Timed mode started with ${queenCount} queens. Duration: ${formatDuration(state.timerDuration)}.`, 'info');
    } else if (state.mode === 'infinite') {
      appendLog(`Infinite mode started with ${queenCount} queens. Play until a mistake occurs.`, 'info');
    }

    state.queens = generateSafeQueenPositions(state.boardSize, queenCount);
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
    if (state.mode === 'timed') {
      startTimer();
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

    // Timed / Infinite only (Classic removed)
    state.boardSize = 8;
    state.queenCount = state.mode === 'timed' ? state.timedQueenCount : state.infiniteQueenCount;
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

    if (state.startButton) state.startButton.disabled = true;
    if (state.restartButton) state.restartButton.disabled = false;
    appendLog(
      state.mode === 'timed'
        ? `Timed mode restarted with ${state.queenCount} queens, duration ${formatDuration(state.timerDuration)}.`
        : state.mode === 'infinite'
          ? `Infinite mode restarted with ${state.queenCount} queens.`
          : `Infinite mode restarted with ${state.queenCount} queens.`,
      'info'
    );
    if (state.mode === 'timed') {
      startTimer();
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
    state.boardEl.style.gridTemplateColumns = `repeat(${state.boardSize}, 1fr)`;
    state.boardEl.style.gridTemplateRows = `repeat(${state.boardSize}, 1fr)`;

    const highlightCells = state.highlight?.cells || [];
    const highlightType = state.highlight?.type || null;
    const frag = document.createDocumentFragment();

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
          cell.classList.add('has-queen');
          if (state.selectedQueenIndex === queenIndex) {
            cell.classList.add('selected');
          }
        }

        if (highlightCells.some(position => position.row === row && position.col === col)) {
          cell.classList.add(highlightType === 'success' ? 'highlight-success' : 'highlight-fail');
        }

        cell.addEventListener('click', () => onCellClick(row, col));
        frag.appendChild(cell);
      }
    }

    // Replace in one shot to avoid "empty board" paint flashes on iOS Safari.
    state.boardEl.replaceChildren(frag);
    enablePointerDrag();
  }

  function onCellClick(row, col) {
    if (state.suppressNextClick) {
      state.suppressNextClick = false;
      return;
    }
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

  function enablePointerDrag() {
    if (!state.boardEl) return;

    const DRAG_THRESHOLD_PX = 4;
    let drag = null; // { queenIndex, originRow, originCol, startX, startY, started, ghostEl, overCellEl, originCellEl }

    const clearOver = () => {
      if (drag?.overCellEl) {
        drag.overCellEl.classList.remove('rq-drop-target');
        drag.overCellEl = null;
      }
    };

    const cleanup = () => {
      clearOver();
      if (drag?.originCellEl) {
        drag.originCellEl.classList.remove('rq-drag-origin');
        drag.originCellEl = null;
      }
      if (drag?.ghostEl) drag.ghostEl.remove();
      drag = null;
      document.body.classList.remove('rq-dragging');
    };

    const getCellUnderPoint = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest?.('.rq-cell') || null;
    };

    const moveGhost = (x, y) => {
      if (!drag?.ghostEl) return;
      drag.ghostEl.style.left = `${x}px`;
      drag.ghostEl.style.top = `${y}px`;
    };

    const startGhostFromCell = (cellEl) => {
      const img = cellEl.querySelector('.rq-queen-image');
      const src = img?.getAttribute('src') || '/assets/pieces/white_Queen.png';
      const ghost = document.createElement('div');
      ghost.className = 'rq-drag-ghost';
      const gi = document.createElement('img');
      gi.src = src;
      gi.alt = '';
      ghost.appendChild(gi);
      document.body.appendChild(ghost);
      drag.ghostEl = ghost;
      drag.originCellEl = cellEl;
      cellEl.classList.add('rq-drag-origin');
      document.body.classList.add('rq-dragging');
    };

    const onPointerMove = (e) => {
      if (!drag) return;
      const x = e.clientX;
      const y = e.clientY;
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      if (!drag.started && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        drag.started = true;
        // Start visual drag
        const originCell = state.boardEl.querySelector(`.rq-cell[data-row="${drag.originRow}"][data-col="${drag.originCol}"]`);
        if (originCell) startGhostFromCell(originCell);
      }
      if (!drag.started) return;
