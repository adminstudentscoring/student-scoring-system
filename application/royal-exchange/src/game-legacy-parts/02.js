    }
  }

  function renderBoard() {
    if (!state.boardEl) return;
    state.boardEl.innerHTML = '';
    const targetMarkers = getTargetMarkers();
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `re-cell ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);

        const marker = targetMarkers.get(`${row}-${col}`);
        if (marker) {
          const markerSpan = document.createElement('span');
          markerSpan.className = `re-target-label ${marker.color === 'white' ? 're-target-white' : 're-target-black'}`;
          markerSpan.textContent = marker.letter;
          markerSpan.setAttribute('aria-hidden', 'true');
          cell.appendChild(markerSpan);
        }

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

    enablePointerDrag();
  }

  function getTargetMarkers() {
    const markers = new Map();
    state.pieces.forEach(piece => {
      const target = getTargetForPiece(piece);
      if (!target) return;
      const letter = TARGET_LETTERS[piece.type];
      if (!letter) return;
      markers.set(`${target.row}-${target.col}`, { letter, color: piece.color, type: piece.type });
    });
    return markers;
  }

  function getTargetForPiece(piece) {
    if (!piece) return null;
    if (piece.type === 'queen') {
      return piece.color === 'white' ? { row: 7, col: 4 } : { row: 0, col: 3 };
    }
    return TARGETS[piece.color]?.[piece.type] || null;
  }

  function onCellClick(row, col) {
    if (state.suppressNextClick) {
      state.suppressNextClick = false;
      return;
    }
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

  function enablePointerDrag() {
    if (!state.boardEl) return;
    const DRAG_THRESHOLD_PX = 4;

    let drag = null; // { pieceIndex, originRow, originCol, startX, startY, started, ghostEl, overCellEl, originCellEl }

    const clearOver = () => {
      if (drag?.overCellEl) {
        drag.overCellEl.classList.remove('re-drop-target');
        drag.overCellEl = null;
      }
    };

    const cleanup = () => {
      clearOver();
      if (drag?.originCellEl) {
        drag.originCellEl.classList.remove('re-drag-origin');
        drag.originCellEl = null;
      }
      if (drag?.ghostEl) drag.ghostEl.remove();
      drag = null;
      document.body.classList.remove('re-dragging');
    };

    const getCellUnderPoint = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest?.('.re-cell') || null;
    };

    const moveGhost = (x, y) => {
      if (!drag?.ghostEl) return;
      drag.ghostEl.style.left = `${x}px`;
      drag.ghostEl.style.top = `${y}px`;
    };

    const startGhostFromCell = (cellEl) => {
      const img = cellEl.querySelector('.re-piece-image');
      const src = img?.getAttribute('src');
      const ghost = document.createElement('div');
      ghost.className = 're-drag-ghost';
      if (src) {
        const gi = document.createElement('img');
        gi.src = src;
        gi.alt = '';
        ghost.appendChild(gi);
      }
      document.body.appendChild(ghost);
      drag.ghostEl = ghost;
      drag.originCellEl = cellEl;
      cellEl.classList.add('re-drag-origin');
      document.body.classList.add('re-dragging');
    };

    const onPointerMove = (e) => {
      if (!drag) return;
      const x = e.clientX;
      const y = e.clientY;
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      if (!drag.started && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        drag.started = true;
        const originCell = state.boardEl.querySelector(`.re-cell[data-row="${drag.originRow}"][data-col="${drag.originCol}"]`);
        if (originCell) startGhostFromCell(originCell);
      }
      if (!drag.started) return;

      moveGhost(x, y);
      const cell = getCellUnderPoint(x, y);
      if (cell !== drag.overCellEl) {
        clearOver();
        if (cell) {
          cell.classList.add('re-drop-target');
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

      state.suppressNextClick = true;
      setTimeout(() => { state.suppressNextClick = false; }, 0);

      if (!drag.started) {
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
          // If dropping onto occupied square:
          const targetPieceIndex = state.pieces.findIndex(p => p.row === targetRow && p.col === targetCol);
          const movingPiece = state.pieces[drag.pieceIndex];
          if (movingPiece) {
            if (targetPieceIndex !== -1) {
              const targetPiece = state.pieces[targetPieceIndex];
              if (targetPiece && targetPiece.color === movingPiece.color) {
                state.selectedPieceIndex = targetPieceIndex;
                renderBoard();
              } else {
                showToast('Capturing is not allowed in this puzzle.', 'warning');
              }
            } else {
              attemptMove(drag.pieceIndex, targetRow, targetCol);
            }
          }
        }
      }

      cleanup();
      e.preventDefault?.();
    };

    state.boardEl.querySelectorAll('.re-cell').forEach((cell) => {
      cell.addEventListener('pointerdown', (e) => {
        if (!state.gameActive) return;
        if (e.button !== undefined && e.button !== 0) return;
        const row = Number(cell.getAttribute('data-row'));
        const col = Number(cell.getAttribute('data-col'));
        if (!Number.isFinite(row) || !Number.isFinite(col)) return;
        const pieceIndex = state.pieces.findIndex(p => p.row === row && p.col === col);
        if (pieceIndex === -1) return;
        const piece = state.pieces[pieceIndex];
        if (!piece || piece.color !== state.currentTurn) {
          // Don't start drag on the wrong side; let click show warning as usual.
          return;
        }

        drag = {
          pieceIndex,
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
      const reason = `${capitalize(piece.color)} ${piece.type} moved to ${formatCoordinate(piece)} causing an attack. Puzzle failed.`;
      appendLog(reason, 'error');
      showToast('Conflict detected! Puzzle failed.', 'error');
      failGame(reason);
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

  function failGame(reason) {
    state.gameActive = false;
    if (state.startButton) state.startButton.disabled = false;
    if (state.restartButton) state.restartButton.disabled = true;
    updateStatus('Failure');
    openDefeatModal(reason);
  }

  function openDefeatModal(reason) {
    if (!state.defeatOverlayEl) return;
    if (state.defeatReasonEl) {
      state.defeatReasonEl.textContent = reason || 'Unknown reason.';
    }
    state.defeatOverlayEl.classList.remove('hidden');
    state.defeatOverlayEl.setAttribute('aria-hidden', 'false');
  }

  function closeDefeatModal() {
    if (!state.defeatOverlayEl) return;
    state.defeatOverlayEl.classList.add('hidden');
    state.defeatOverlayEl.setAttribute('aria-hidden', 'true');
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
