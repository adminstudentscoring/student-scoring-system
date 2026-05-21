      }
    }
  }

  function legalSquaresForSelection() {
    if (!state.selectedType || state.selectedType.color !== state.toMove) return new Set();
    const t = state.selectedType.type;
    const c = state.selectedType.color;
    const set = new Set();
    for (const key of allSquareKeys()) {
      if (isLegalPlacement(state.board, c, t, key)) set.add(key);
    }
    return set;
  }

  function highlightLegal() {
    const legal = legalSquaresForSelection();
    boardEl.querySelectorAll('.tb-square').forEach((sq) => {
      const k = sq.dataset.sq;
      sq.classList.toggle('legal', legal.has(k));
    });
  }

  function onPieceClick(ev) {
    const btn = ev.currentTarget;
    const color = btn.dataset.color;
    const type = btn.dataset.type;
    if (state.phase !== 'playing' || color !== state.toMove) return;
    if (state.selectedType && state.selectedType.color === color && state.selectedType.type === type) {
      state.selectedType = null;
    } else {
      state.selectedType = { color, type };
    }
    renderHands();
    highlightLegal();
  }

  function onSquareClick(ev) {
    const sq = ev.currentTarget;
    const key = sq.dataset.sq;
    if (state.phase !== 'playing' || !state.selectedType) return;
    if (state.selectedType.color !== state.toMove) return;
    const c = state.selectedType.color;
    const t = state.selectedType.type;
    if (!isLegalPlacement(state.board, c, t, key)) return;

    state.board[key] = { c, t };
    const idx = state.hands[c].indexOf(t);
    if (idx >= 0) state.hands[c].splice(idx, 1);
    state.selectedType = null;
    state.consecutivePasses = 0;
    applyFischerIncrement(c);
    resetByomiPeriodAfterMove(c);
    state.toMove = c === 'w' ? 'b' : 'w';
    afterMove();
  }

  function afterMove() {
    updateTurnLabel();
    renderHands();
    renderBoard();
    resolveAutoPasses();
  }

  function resolveAutoPasses() {
    if (state.phase !== 'playing') return;
    let guard = 0;
    while (state.phase === 'playing' && guard < 64) {
      guard++;
      const c = state.toMove;
      if (hasAnyLegalPlacement(state.board, state.hands[c], c)) {
        updateClockDisplay();
        return;
      }
      state.consecutivePasses++;
      state.toMove = c === 'w' ? 'b' : 'w';
      state.selectedType = null;
      if (state.consecutivePasses >= 2) {
        endByMaterial();
        return;
      }
    }
    updateTurnLabel();
    renderHands();
    renderBoard();
    updateClockDisplay();
  }

  function endByMaterial() {
    state.phase = 'over';
    stopClockLoop();
    const r = settle(state.board, state.hands);
    let msg;
    if (r.winner === 'draw') msg = 'Draw. ' + r.vw + ' — ' + r.vb;
    else msg = (r.winner === 'w' ? 'White' : 'Black') + ' wins. ' + r.vw + ' — ' + r.vb;
    showResult(msg);
  }

  function showResult(msg) {
    document.getElementById('resultText').textContent = msg;
    document.getElementById('overlay').hidden = false;
  }

  function updateTurnLabel() {
    if (state.phase !== 'playing') return;
    document.getElementById('turnLabel').textContent = state.toMove === 'w' ? "White to place" : "Black to place";
  }

  function startGame() {
    state.board = {};
    state.hands.w = initialHand();
    state.hands.b = initialHand();
    state.toMove = 'w';
    state.selectedType = null;
    state.consecutivePasses = 0;
    state.phase = 'playing';

    const cfg = buildClockConfig();
    state.clockMode = cfg.mode;
    initClockFromConfig(cfg);

    document.getElementById('setup').hidden = true;
    document.getElementById('play').hidden = false;
    document.getElementById('overlay').hidden = true;

    renderCoords();
    renderBoard();
    renderHands();
    updateTurnLabel();
    updateClockDisplay();
    startClockLoop();
    resolveAutoPasses();
  }

  function newGame() {
    stopClockLoop();
    state.phase = 'setup';
    document.getElementById('setup').hidden = false;
    document.getElementById('play').hidden = true;
    document.getElementById('overlay').hidden = true;
  }

  document.getElementById('clockMode').addEventListener('change', () => {
    const m = document.getElementById('clockMode').value;
    document.getElementById('clockOptsFischer').hidden = m !== 'fischer';
    document.getElementById('clockOptsByomi').hidden = m !== 'byomi';
    document.getElementById('clockOptsAbsolute').hidden = m !== 'absolute';
  });
  document.getElementById('clockMode').dispatchEvent(new Event('change'));

  document.getElementById('btnStart').addEventListener('click', startGame);
  document.getElementById('btnNew').addEventListener('click', newGame);
  document.getElementById('btnDismiss').addEventListener('click', () => {
    document.getElementById('overlay').hidden = true;
  });

  renderCoords();
})();

