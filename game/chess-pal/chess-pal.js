// Elements: Light/Dark/Fire/Water/Wood + Heart (healing)
const ELEMENTS = ['light', 'dark', 'fire', 'water', 'wood', 'heart'];
const BOARD_ROWS = 6;
const BOARD_COLS = 6;
const TURN_TIME_MS = 20000;
const CELL_PX = 66;
const GAP_PX = 8;

const ChessPal = (() => {
  const state = {
    board: [],
    boardEl: null,
    timerTextEl: null,
    timerFillEl: null,
    logEl: null,
    moveListEl: null,
    cascadeListEl: null,
    scoreListEl: null,
    scoreTotalEl: null,
    startButtonEl: null,
    selectedPosition: null,
    startingKnight: null,
    knightPosition: null,
    validMoves: [],
    actionTimerId: null,
    timeRemaining: TURN_TIME_MS,
    moveHistory: [],
    cascades: [],
    lastScore: null,
    isPlayerTurn: false,
    isAnimating: false
  };

  function getPieceStyle() {
    try {
      const v = document.documentElement?.getAttribute('data-cp-piece-style');
      const key = String(v || '').trim().toLowerCase();
      return (key === 'nyxblade') ? 'nyxblade' : 'none';
    } catch {
      return 'none';
    }
  }

  function getKnightImageSrc() {
    const style = getPieceStyle();
    if (style === 'nyxblade') return 'images/Piece/P001-nyxblade.png';
    return '/assets/pieces/white_Knight.png';
  }

  function init() {
    const container = document.getElementById('chessPalGame');
    if (!container) {
      console.error('Chess Pal container not found');
      return;
    }

    container.innerHTML = `
      <div class="pmf-wrapper">
        <div class="pmf-stage">
          <div class="pmf-timer-wrapper">
            <div class="pmf-timer-bar">
              <div class="pmf-timer-fill" id="pmfTimerFill"></div>
              <span class="pmf-timer-text" id="pmfTimerText">20.0s</span>
            </div>
          </div>
          <div class="pmf-board-shell">
            <div class="pmf-board" id="pmfBoard" role="grid" aria-label="Puzzle board"></div>
          </div>
          <div class="pmf-controls">
            <button id="pmfStartTurn" class="pmf-primary hidden" disabled>Start Turn</button>
          </div>
        </div>
      </div>
    `;

    state.boardEl = container.querySelector('#pmfBoard');
    state.timerTextEl = container.querySelector('#pmfTimerText');
    state.timerFillEl = container.querySelector('#pmfTimerFill');
    // These live in the top bar popovers (outside the board container)
    state.logEl = document.getElementById('pmfLog');
    state.moveListEl = document.getElementById('pmfMoveList');
    state.cascadeListEl = document.getElementById('pmfCascadeList');
    state.scoreListEl = document.getElementById('pmfScoreList');
    state.scoreTotalEl = document.getElementById('pmfScoreTotal');
    state.startButtonEl = container.querySelector('#pmfStartTurn');
    state.startButtonEl.addEventListener('click', startPlayerTurn);

    // Live update when user changes Piece setting
    try {
      window.__cpPieceListener = () => { try { renderBoard(); } catch {} };
      window.addEventListener('cpGeneralSettingsChanged', window.__cpPieceListener);
    } catch {}

    generateInitialBoard();
    renderBoard();
    renderMoveHistory();
    renderCascades([]);
    renderScoreBreakdown(null);
    updateTimerDisplay(1);
    updateStartButtonState();
    pushLog('Board initialized. Select a starting position for the knight.');
  }

  function destroy() {
    try { clearInterval(state.actionTimerId); } catch {}
    state.actionTimerId = null;
    state.boardEl = null;
    state.timerTextEl = null;
    state.timerFillEl = null;
    state.logEl = null;
    state.moveListEl = null;
    state.cascadeListEl = null;
    state.scoreListEl = null;
    state.scoreTotalEl = null;
    state.startButtonEl = null;
    state.isPlayerTurn = false;
    state.isAnimating = false;
    state.selectedPosition = null;
    state.startingKnight = null;
    state.knightPosition = null;
    state.validMoves = [];
    state.lastScore = null;
    try {
      if (window.__cpPieceListener) window.removeEventListener('cpGeneralSettingsChanged', window.__cpPieceListener);
    } catch {}
  }

  function computeScoreBreakdown(moveHistory, cascades, timeLeftMs) {
    const moves = Array.isArray(moveHistory) ? moveHistory : [];
    const cas = Array.isArray(cascades) ? cascades : [];
    const timeMs = Math.max(0, Math.floor(Number(timeLeftMs) || 0));

    const pathJewels = moves.length;
    const base = pathJewels * 10;

    let matchedJewels = 0;
    let combos = 0;
    for (const c of cas) {
      const matches = Array.isArray(c?.matches) ? c.matches : [];
      combos += matches.length;
      for (const m of matches) {
        matchedJewels += Math.max(0, Math.floor(Number(m?.count) || 0));
      }
    }
    const matchPoints = matchedJewels * 6;

    const subtotal = base + matchPoints;
    const comboBonus = Math.floor(subtotal * 0.10 * Math.max(0, combos - 1));
    const chainBonus = Math.floor(subtotal * 0.05 * Math.max(0, cas.length));
    const timeBonus = Math.floor((timeMs / 1000) * 2);
    const total = Math.max(0, base + matchPoints + comboBonus + chainBonus + timeBonus);

    return {
      total,
      lines: [
        { label: `Base`, detail: `${pathJewels} × 10`, value: base },
        { label: `Matches`, detail: `${matchedJewels} × 6`, value: matchPoints },
        { label: `Combo Bonus`, detail: `combos ${combos}`, value: comboBonus },
        { label: `Cascade Bonus`, detail: `chains ${cas.length}`, value: chainBonus },
        { label: `Time Bonus`, detail: `${(timeMs / 1000).toFixed(1)}s × 2`, value: timeBonus },
      ]
    };
  }

  function renderScoreBreakdown(breakdown) {
    if (state.scoreTotalEl) {
      if (!breakdown) state.scoreTotalEl.textContent = 'No score yet.';
      else state.scoreTotalEl.textContent = `Total: ${breakdown.total}`;
    }
    if (!state.scoreListEl) return;
    if (!breakdown) {
      state.scoreListEl.innerHTML = '<li class="pmf-empty">No breakdown available.</li>';
      return;
    }
    state.scoreListEl.innerHTML = breakdown.lines.map((l) => `
      <li class="pmf-cascade-item">
        <b>${escapeHtml(l.label)}</b>
        <span style="opacity:0.72;">· ${escapeHtml(l.detail)}</span>
        <span style="float:right; font-weight:1000;">+${escapeHtml(l.value)}</span>
      </li>
    `).join('');
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function generateInitialBoard() {
    state.board = []; // Reset
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      const currentRow = [];
      for (let col = 0; col < BOARD_COLS; col += 1) {
        let element;
        do {
          element = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
        } while (createsStartingMatch(currentRow, row, col, element));
        currentRow.push(createJewel(element));
      }
      state.board.push(currentRow);
    }
  }

  function createJewel(element) {
    return {
      element,
      id: `jewel-${Math.random().toString(36).slice(2)}`
    };
  }

  function createsStartingMatch(currentRow, row, col, element) {
    // Prevent horizontals of 3+ at initialization
    if (col >= 2) {
      const prev1 = currentRow[col - 1];
      const prev2 = currentRow[col - 2];
      if (prev1 && prev2 && prev1.element === element && prev2.element === element) {
        return true;
      }
    }
    // Prevent verticals of 3+ at initialization
    if (row >= 2) {
      const prev1 = state.board[row - 1][col];
      const prev2 = state.board[row - 2][col];
      if (prev1 && prev2 && prev1.element === element && prev2.element === element) {
        return true;
      }
    }
    return false;
  }

  function renderBoard() {
    if (!state.boardEl) return;
    state.boardEl.innerHTML = '';

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const jewel = state.board[row][col];
        const cell = document.createElement('button');
        cell.type = 'button';
        let cellClass = 'pmf-cell';
        if (jewel && jewel.element) {
          cellClass += ` pmf-${jewel.element}`;
        } else {
          cellClass += ' pmf-empty-cell';
        }
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);

        const isKnight = state.knightPosition && state.knightPosition.row === row && state.knightPosition.col === col;
        if (isKnight) {
          cellClass += ' pmf-knight-cell';
        }

        cell.className = cellClass;
        cell.setAttribute('aria-label', jewel ? `${jewel.element} jewel at ${row},${col}` : `empty cell at ${row},${col}`);
        if (jewel) {
          cell.dataset.id = jewel.id;
        }

        cell.innerHTML = '';
        if (isKnight) {
          const img = document.createElement('img');
          img.src = getKnightImageSrc();
          img.alt = 'Knight';
          img.className = 'pmf-knight-image';
          img.onerror = function() {
            this.style.display = 'none';
            const text = document.createTextNode('♘');
            this.parentElement.appendChild(text);
          };
          cell.appendChild(img);
        }

        if (state.selectedPosition && state.selectedPosition.row === row && state.selectedPosition.col === col) {
          cell.classList.add('selected');
        }
        if (state.validMoves.some(pos => pos.row === row && pos.col === col)) {
          cell.classList.add('valid-move');
        }

        cell.addEventListener('click', () => onCellClick(row, col));
        state.boardEl.appendChild(cell);
      }
    }
  }

  function onCellClick(row, col) {
    if (state.isAnimating) {
      pushLog('Wait for animations to finish.');
      return;
    }
    if (!state.isPlayerTurn) {
      if (!state.board[row][col]) {
        pushLog('Select a position with a jewel.');
        return;
      }
      state.startingKnight = { row, col };
      state.knightPosition = { row, col };
      state.selectedPosition = null;
      state.validMoves = [];
      pushLog(`Knight starting position set to (${row}, ${col}).`);
      updateStartButtonState();
      renderBoard();
      renderMoveHistory();
      return;
    }

    const isValidDestination = state.validMoves.some(pos => pos.row === row && pos.col === col);
    if (!isValidDestination) {
      pushLog('Illegal knight move. Choose one of the highlighted tiles.');
      return;
    }

    consumeJewelPath(state.selectedPosition, { row, col });
  }

  function getKnightMoves(row, col) {
    return [
      { row: row + 2, col: col + 1 },
      { row: row + 2, col: col - 1 },
      { row: row - 2, col: col + 1 },
      { row: row - 2, col: col - 1 },
      { row: row + 1, col: col + 2 },
      { row: row + 1, col: col - 2 },
      { row: row - 1, col: col + 2 },
      { row: row - 1, col: col - 2 }
    ];
  }

  function isInsideBoard(row, col) {
    return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
  }

  function consumeJewelPath(from, to) {
    if (!state.isPlayerTurn) return;

    const jewel = state.board[to.row][to.col];
    state.moveHistory.push({
      from,
      to,
      element: jewel.element
    });

    state.board[to.row][to.col] = null; // Mark as consumed
    state.knightPosition = { row: to.row, col: to.col };
    state.selectedPosition = { row: to.row, col: to.col };
    state.validMoves = getKnightMoves(to.row, to.col).filter(pos => isInsideBoard(pos.row, pos.col) && state.board[pos.row][pos.col]);

    renderBoard();
    renderMoveHistory();
  }

  function startPlayerTurn() {
    if (state.isPlayerTurn) {
      pushLog('Turn already in progress.');
      return;
    }
    if (state.isAnimating) {
      pushLog('Wait for animations to finish.');
      return;
    }
    if (!state.startingKnight) {
      pushLog('Select a starting position for the knight before starting the turn.');
      return;
    }

    state.isPlayerTurn = true;
    state.timeRemaining = TURN_TIME_MS;
    state.selectedPosition = { ...state.knightPosition };
    state.validMoves = getKnightMoves(state.knightPosition.row, state.knightPosition.col)
      .filter(pos => isInsideBoard(pos.row, pos.col) && state.board[pos.row][pos.col]);
    state.moveHistory = [];
    state.cascades = [];
    state.lastScore = null;
    renderScoreBreakdown(null);
    clearInterval(state.actionTimerId);
    state.actionTimerId = setInterval(handleTimerTick, 100);
    pushLog('Turn started. Use knight moves to consume jewels.');
    renderMoveHistory();
    renderCascades([]);
    updateStartButtonState();
  }

  function handleTimerTick() {
    state.timeRemaining -= 100;
    if (state.timeRemaining <= 0) {
      state.timeRemaining = 0;
      endPlayerTurn();
    }
    updateTimerDisplay(Math.max(0, state.timeRemaining / TURN_TIME_MS));
  }

  function endPlayerTurn() {
    if (!state.isPlayerTurn) return;

    const timeLeftMs = state.timeRemaining;
    clearInterval(state.actionTimerId);
    state.actionTimerId = null;
    state.isPlayerTurn = false;
    state.selectedPosition = null;
    state.validMoves = [];
    state.timeRemaining = 0;
    updateTimerDisplay(0);

    if (state.moveHistory.length === 0) {
      pushLog('No jewels consumed this turn.');
      renderBoard();
      state.startingKnight = null;
      state.knightPosition = null;
      updateStartButtonState();
      return;
    }

    pushLog(`Consumed ${state.moveHistory.length} jewels: ${state.moveHistory.map(move => move.element).join(', ')}`);
    state.isAnimating = true;
    collapseBoardAnimated().then(() => {
      resolveCascades().then(cascades => {
        state.cascades = cascades || [];
        if (cascades.length > 0) {
          pushLog(`Cascades triggered: ${cascades.map(cascade => cascade.matches.map(match => `${match.element.toUpperCase()}×${match.count}`).join(', ')).join(' | ')}`);
          renderCascades(cascades);
        } else {
          renderCascades([]);
        }

        const breakdown = computeScoreBreakdown(state.moveHistory, cascades, timeLeftMs);
        state.lastScore = breakdown;
        renderScoreBreakdown(breakdown);

        renderBoard();
        state.startingKnight = null;
        state.knightPosition = null;
        state.moveHistory = [];
        updateStartButtonState();
        state.isAnimating = false;
      });
    });
  }

  async function collapseBoardAnimated() {
    let falls;
    do {
      falls = computeFalls();
      if (falls.length > 0) {
        applyFalls(falls);
        renderBoard();
        await animateFalls(falls);
      }
    } while (falls.length > 0);

    const spawns = fillNewJewels();
    if (spawns.length > 0) {
      renderBoard();
      await animateSpawns(spawns);
    }
  }

  function randomElement() {
    return ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
  }

  async function resolveCascades() {
    const cascades = [];
    let matches;
    do {
      matches = findMatches();
      if (matches.length > 0) {
        const cascade = matches.map(match => ({ element: match.element, count: match.positions.length }));
        cascades.push({ matches: cascade });
        await animateMatches(matches);
        removeMatches(matches);
        renderBoard();
        await delay(60);
        await collapseBoardAnimated();
      }
    } while (matches.length > 0);
    return cascades;
  }

  function findMatches() {
    const matches = [];
    const visited = Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(false));

    // Horizontal
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      let count = 1;
      for (let col = 1; col < BOARD_COLS; col += 1) {
        const current = state.board[row][col];
        const previous = state.board[row][col - 1];
        if (current && previous && current.element === previous.element) {
          count += 1;
        } else {
          if (count >= 3) {
            matches.push({ element: state.board[row][col - 1].element, positions: collectHorizontal(row, col - count, count, visited) });
          }
          count = 1;
        }
      }
      if (count >= 3) {
        matches.push({ element: state.board[row][BOARD_COLS - 1].element, positions: collectHorizontal(row, BOARD_COLS - count, count, visited) });
      }
    }

    // Vertical
    for (let col = 0; col < BOARD_COLS; col += 1) {
      let count = 1;
      for (let row = 1; row < BOARD_ROWS; row += 1) {
        const current = state.board[row][col];
        const previous = state.board[row - 1][col];
        if (current && previous && current.element === previous.element) {
          count += 1;
        } else {
          if (count >= 3) {
            matches.push({ element: state.board[row - 1][col].element, positions: collectVertical(col, row - count, count, visited) });
          }
          count = 1;
        }
      }
      if (count >= 3) {
        matches.push({ element: state.board[BOARD_ROWS - 1][col].element, positions: collectVertical(col, BOARD_ROWS - count, count, visited) });
      }
    }

    return matches;
  }

  function collectHorizontal(row, startCol, count, visited) {
    const positions = [];
    for (let offset = 0; offset < count; offset += 1) {
      const col = startCol + offset;
      if (!visited[row][col]) {
        visited[row][col] = true;
        positions.push({ row, col });
      }
    }
    return positions;
  }

  function collectVertical(col, startRow, count, visited) {
    const positions = [];
    for (let offset = 0; offset < count; offset += 1) {
      const row = startRow + offset;
      if (!visited[row][col]) {
        visited[row][col] = true;
        positions.push({ row, col });
      }
    }
    return positions;
  }

  function removeMatches(matches) {
    matches.forEach(match => {
      match.positions.forEach(pos => {
        state.board[pos.row][pos.col] = null;
      });
    });
  }

  function pushLog(message) {
    if (!state.logEl) return;
    const entry = document.createElement('div');
    entry.className = 'pmf-log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    state.logEl.prepend(entry);
  }

  function renderMoveHistory() {
    if (!state.moveListEl) return;
    state.moveListEl.innerHTML = state.moveHistory.map((move, index) => `
      <li class="pmf-move-item">
        <span class="color ${move.element}"></span>
        Step ${index + 1}: ${move.element.toUpperCase()} (${move.to.row},${move.to.col})
      </li>
    `).join('') || '<li class="pmf-empty">No jewels consumed.</li>';
  }

  function renderCascades(cascades) {
    if (!state.cascadeListEl) return;
    if (!cascades || cascades.length === 0) {
      state.cascadeListEl.innerHTML = '<li class="pmf-empty">No cascades triggered.</li>';
      return;
    }
    state.cascadeListEl.innerHTML = cascades.map((cascade, index) => `
      <li class="pmf-cascade-item">
        Chain ${index + 1}: ${cascade.matches.map(match => `${match.element.toUpperCase()}×${match.count}`).join(', ')}
      </li>
    `).join('');
  }

  function updateStartButtonState() {
    if (!state.startButtonEl) return;
    if (!state.isPlayerTurn && state.startingKnight) {
      state.startButtonEl.classList.remove('hidden');
      state.startButtonEl.disabled = false;
    } else {
      state.startButtonEl.classList.add('hidden');
      state.startButtonEl.disabled = true;
    }
  }

  function updateTimerDisplay(ratio) {
    if (state.timerFillEl) {
      state.timerFillEl.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    }
    if (state.timerTextEl) {
      const seconds = (state.timeRemaining / 1000).toFixed(1);
      state.timerTextEl.textContent = `${seconds}s`;
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  function computeFalls() {
    const falls = [];
    for (let col = 0; col < BOARD_COLS; col += 1) {
      let targetRow = BOARD_ROWS - 1;
      for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
        const jewel = state.board[row][col];
        if (jewel) {
          if (row !== targetRow) {
            falls.push({ jewel, fromRow: row, toRow: targetRow, col, distance: targetRow - row });
          }
          targetRow -= 1;
        }
      }
    }
    return falls;
  }

  function applyFalls(falls) {
    falls.forEach(fall => {
      state.board[fall.toRow][fall.col] = fall.jewel;
      state.board[fall.fromRow][fall.col] = null;
    });
  }

  function fillNewJewels() {
    const spawns = [];
    for (let col = 0; col < BOARD_COLS; col += 1) {
      for (let row = 0; row < BOARD_ROWS; row += 1) {
        if (!state.board[row][col]) {
          const jewel = createJewel(randomElement());
          state.board[row][col] = jewel;
          spawns.push({ jewel, row, col });
        }
      }
    }
    return spawns;
  }

  async function animateMatches(matches) {
    await nextFrame();
    matches.forEach(match => {
      match.positions.forEach(pos => {
        const element = getCellElement(pos.row, pos.col);
        if (element) {
          element.animate([
            { transform: 'scale(1)', opacity: 1 },
            { transform: 'scale(1.4)', opacity: 0 }
          ], { duration: 220, easing: 'ease-out' });
        }
      });
    });
    await delay(220);
  }

  async function animateFalls(falls) {
    await nextFrame();
    falls.forEach(fall => {
      const element = state.boardEl?.querySelector(`[data-id="${fall.jewel.id}"]`);
      if (element) {
        element.animate([
          { transform: `translateY(${-(fall.distance * (CELL_PX + GAP_PX))}px)` },
          { transform: 'translateY(0px)' }
        ], { duration: 180, easing: 'ease-in' });
      }
    });
    await delay(180);
  }

  async function animateSpawns(spawns) {
    await nextFrame();
    spawns.forEach(spawn => {
      const element = state.boardEl?.querySelector(`[data-id="${spawn.jewel.id}"]`);
      if (element) {
        element.animate([
          { transform: 'scale(0.3)', opacity: 0 },
          { transform: 'scale(1)', opacity: 1 }
        ], { duration: 180, easing: 'ease-out' });
      }
    });
    await delay(180);
  }

  function getCellElement(row, col) {
    return state.boardEl?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  }

  return {
    init,
    destroy,
    BOARD_ROWS,
    BOARD_COLS
  };
})();

function initChessPal() {
  ChessPal.init();
}

try { window.ChessPal = ChessPal; } catch {}

