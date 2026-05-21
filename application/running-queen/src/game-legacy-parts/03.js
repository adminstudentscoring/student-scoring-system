
      moveGhost(x, y);
      const cell = getCellUnderPoint(x, y);
      if (cell !== drag.overCellEl) {
        clearOver();
        if (cell) {
          cell.classList.add('rq-drop-target');
          drag.overCellEl = cell;
        }
      }
      e.preventDefault?.();
    };

    const onPointerUp = (e) => {
      if (!drag) return;
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);

      // Suppress the subsequent click event triggered by pointerup
      state.suppressNextClick = true;
      setTimeout(() => { state.suppressNextClick = false; }, 0);

      if (!drag.started) {
        // Treat as normal click selection
        const { originRow, originCol } = drag;
        cleanup();
        onCellClick(originRow, originCol);
        return;
      }

      const cell = getCellUnderPoint(e.clientX, e.clientY);
      if (cell) {
        const targetRow = Number(cell.getAttribute('data-row'));
        const targetCol = Number(cell.getAttribute('data-col'));
        if (Number.isFinite(targetRow) && Number.isFinite(targetCol)) {
          if (!(targetRow === drag.originRow && targetCol === drag.originCol)) {
            attemptMove(drag.queenIndex, targetRow, targetCol);
          }
        }
      }

      cleanup();
      e.preventDefault?.();
    };

    // Attach per-cell pointerdown (cells are rebuilt on each render)
    state.boardEl.querySelectorAll('.rq-cell').forEach((cell) => {
      cell.addEventListener('pointerdown', (e) => {
        if (!state.gameActive) return;
        if (e.button !== undefined && e.button !== 0) return;
        const row = Number(cell.getAttribute('data-row'));
        const col = Number(cell.getAttribute('data-col'));
        if (!Number.isFinite(row) || !Number.isFinite(col)) return;
        const queenIndex = state.queens.findIndex(q => q.row === row && q.col === col);
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

        window.addEventListener('pointermove', onPointerMove, true);
        window.addEventListener('pointerup', onPointerUp, true);
        window.addEventListener('pointercancel', onPointerUp, true);
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
      if (state.mode === 'timed') handleTimedFailure('Timed challenge failed: same queen moved consecutively.');
      else handleInfiniteFailure('Infinite run ended: same queen moved consecutively.');
      return;
    }

    if (!isValidQueenMove(queen.row, queen.col, targetRow, targetCol)) {
      if (state.mode === 'timed') handleTimedFailure('Timed challenge failed: invalid queen move.');
      else handleInfiniteFailure('Infinite run ended: invalid queen move.');
      return;
    }

    const rowDelta = Math.abs(targetRow - queen.row);
    const colDelta = Math.abs(targetCol - queen.col);
    const moveDistance = Math.max(rowDelta, colDelta);
    if (moveDistance < 2) {
      if (state.mode === 'timed') handleTimedFailure('Timed challenge failed: move was less than two squares.');
      else handleInfiniteFailure('Infinite run ended: move was less than two squares.');
      return;
    }

    if (!isPathClear(queen.row, queen.col, targetRow, targetCol)) {
      if (state.mode === 'timed') handleTimedFailure('Timed challenge failed: path blocked by another queen.');
      else handleInfiniteFailure('Infinite run ended: path blocked by another queen.');
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
      SOUND_ENGINE.playSuccess();
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
        }
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
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    updateStatusDisplay();
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
  }

  function updateStatusDisplay() {
    if (state.playerDisplayEl) {
      const player = state.players[state.currentPlayerIndex];
      state.playerDisplayEl.textContent = player ? player.name : '—';
    }
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
