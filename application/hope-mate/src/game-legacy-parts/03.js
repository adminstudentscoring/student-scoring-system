    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Failed to load leaderboard (${resp.status}): ${txt}`);
    }
    const data = await resp.json().catch(() => ({}));
    return Array.isArray(data.entries) ? data.entries : [];
  }

  async function submitHopeMateChallengeEntry(studentId, durationSec, totalSolved, bestLevel, bestTimeLeftSec) {
    const apiBase = window.API_BASE || '/api';
    const resp = await fetch(`${apiBase}/hope-mate/challenge-leaderboard`, {
      method: 'POST',
      credentials: 'include',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ studentId, durationSec, totalSolved, bestLevel, bestTimeLeftSec })
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Failed to submit leaderboard (${resp.status}): ${txt}`);
    }
    const data = await resp.json().catch(() => ({}));
    return Array.isArray(data.entries) ? data.entries : [];
  }

  async function refreshChallengeLeaderboard(durationSec = null) {
    if (durationSec != null) state.challengeLeaderboard.durationSec = Number(durationSec) || 60;
    state.challengeLeaderboard.loading = true;
    state.challengeLeaderboard.error = null;
    try {
      const entries = await fetchHopeMateChallengeLeaderboard(state.challengeLeaderboard.durationSec);
      state.challengeLeaderboard.entries = entries;
    } catch (e) {
      state.challengeLeaderboard.error = e?.message || 'Failed to load leaderboard';
      state.challengeLeaderboard.entries = [];
    } finally {
      state.challengeLeaderboard.loading = false;
      render();
    }
  }

  function openLeaderboard() {
    state.ui.leaderboardOpen = true;
    render();
  }

  function closeLeaderboard() {
    state.ui.leaderboardOpen = false;
    render();
  }

  function openChallengeLeaderboard(durationSec = null) {
    state.ui.challengeLeaderboardOpen = true;
    if (durationSec != null) state.challengeLeaderboard.durationSec = Number(durationSec) || 60;
    render();
  }

  function closeChallengeLeaderboard() {
    state.ui.challengeLeaderboardOpen = false;
    render();
  }

  function openResult(kind, message) {
    // Avoid stacking overlays
    state.ui.leaderboardOpen = false;
    state.ui.challengeLeaderboardOpen = false;
    state.ui.resultOpen = true;
    state.ui.resultKind = kind;
    state.ui.resultMessage = String(message || '');
    render();
  }

  function closeResult() {
    state.ui.resultOpen = false;
    state.ui.resultKind = null;
    state.ui.resultMessage = '';
    render();
  }

  function newPuzzle() {
    state.attemptsFailed = false;
    state.placed = [];
    state.selectedPieceSlot = 0;
    state.puzzleSolved = false;
    const cfg = getPracticeConfig(state.practiceLevel);
    setBoardSize(cfg.boardSize);
    state.puzzle = randomPuzzle(cfg);
    state.board = state.puzzle.black.slice();
    state.placed = new Array((state.puzzle.whitePieces || []).length).fill(null);
  }

  function resetPlacements() {
    if (!state.puzzle) return;
    state.placed = new Array((state.puzzle.whitePieces || []).length).fill(null);
    state.selectedPieceSlot = 0;
    state.board = state.puzzle.black.slice();
    render();
  }

  function placePiece(slot, idx) {
    if (!state.puzzle) return;
    const pieces = Array.isArray(state.puzzle.whitePieces) ? state.puzzle.whitePieces : [];
    if (!(slot >= 0 && slot < pieces.length)) return;
    const piece = pieces[slot];
    if (!piece) return;
    if (state.puzzle.black[idx]) return; // occupied by black
    // If dropping onto another placed piece, swap.
    const otherSlot = state.placed.findIndex(v => v === idx);
    if (otherSlot !== -1 && otherSlot !== slot) {
      const curIdx = state.placed[slot];
      state.placed[slot] = idx;
      state.placed[otherSlot] = curIdx;
      rebuildBoardFromPlacements();
      setStatus('Swapped pieces. You can adjust before Confirm.', 'info');
      render();
      return;
    }
    // prevent placing on square used by any other slot
    if (state.placed.some((v, i) => i !== slot && v === idx)) return;

    // Apply placement constraints early for feedback
    const placements = [];
    placements.push({ piece, idx });
    state.placed.forEach((placedIdx, i) => {
      if (i === slot) return;
      if (placedIdx == null) return;
      placements.push({ piece: pieces[i], idx: placedIdx });
    });
    const c = validateWhitePlacementConstraints(state.puzzle.black, state.puzzle.blackKingIdx, placements);
    if (!c.ok) {
      setStatus(c.reason, 'error');
      return;
    }

    state.placed[slot] = idx;
    rebuildBoardFromPlacements();
    setStatus('Placed. You can adjust before Confirm.', 'info');
    render();
  }

  function rebuildBoardFromPlacements() {
    if (!state.puzzle) return;
    const b = state.puzzle.black.slice();
    const pieces = Array.isArray(state.puzzle.whitePieces) ? state.puzzle.whitePieces : [];
    for (let s = 0; s < pieces.length; s++) {
      const idx = state.placed[s];
      if (idx == null) continue;
      b[idx] = pieces[s];
    }
    state.board = b;
  }

  // status bar (simple)
  let lastStatus = { text: '', kind: 'info' };
  function setStatus(text, kind = 'info') {
    lastStatus = { text, kind };
    const el = document.getElementById('hopeMateStatus');
    if (el) {
      el.textContent = text;
      el.classList.remove('is-error', 'is-success', 'is-info');
      el.classList.add(kind === 'error' ? 'is-error' : kind === 'success' ? 'is-success' : 'is-info');
    }
  }

  function confirm() {
    if (!state.puzzle || !state.board) return;
    if (state.puzzleSolved) {
      openResult('correct', 'Already confirmed. Use Next to continue.');
      return;
    }
    if (!Array.isArray(state.placed) || state.placed.some(v => v == null)) {
      setStatus('Place both pieces before confirming.', 'error');
      openResult('incorrect', 'Please place both pieces before confirming.');
      return;
    }

    const mate = isCheckmate(state.board);
    if (mate) {
      const gained = state.attemptsFailed ? 0 : 1;
      state.sessionScore += gained;
      state.totalScore += gained;
      state.bestScore = Math.max(state.bestScore, state.sessionScore);
      saveScores();
      state.puzzleSolved = true;
      const msg = gained ? 'Correct! Checkmate. +1 point.' : 'Correct! Checkmate. (No points because you already failed this puzzle.)';
      setStatus(msg, 'success');
      openResult('correct', msg);

      // Challenge Mode: auto-advance puzzle & difficulty, same scoring rule (+1 only if first attempt)
      if (state.screen === 'challengeGame') {
        state.challenge.totalSolved += 1;
        state.challenge.solvedInLevel += 1;
        if (state.challenge.solvedInLevel >= 2) {
          state.challenge.solvedInLevel = 0;
          state.challenge.level = Math.min(10, Number(state.challenge.level || 1) + 1);
        }

        // Submit Challenge leaderboard entry (best-per-student, per duration)
        const player = getSinglePlayer();
        if (player?.id) {
          submitHopeMateChallengeEntry(
            String(player.id),
            Number(state.challenge.durationSec || 60) || 60,
            Number(state.challenge.totalSolved || 0) || 0,
            Number(state.challenge.level || 1) || 1,
            Number(state.challenge.timeLeftSec || 0) || 0
          ).then((entries) => {
            // If user is viewing this duration, refresh list immediately
            if (state.ui.challengeLeaderboardOpen && Number(state.challengeLeaderboard.durationSec) === Number(state.challenge.durationSec)) {
              state.challengeLeaderboard.entries = entries;
              state.challengeLeaderboard.loading = false;
              state.challengeLeaderboard.error = null;
              render();
            }
          }).catch(() => {
            // ignore (do not interrupt gameplay)
          });
        }
      }

      if (gained === 1) {
        const player = getSinglePlayer();
        if (player?.id) {
          // Fire-and-forget: submit total score, then refresh leaderboard.
          submitHopeMateTotalScore(String(player.id), state.totalScore)
            .then((entries) => {
              state.leaderboard.entries = entries;
              state.leaderboard.loading = false;
              state.leaderboard.error = null;
              render();
            })
            .catch((e) => {
              state.leaderboard.error = e?.message || 'Failed to submit score';
              state.leaderboard.loading = false;
              render();
            });
        }
      }
      render();
      return;
    }

    // Stalemate should be treated as failure
    if (isStalemate(state.board)) {
      state.attemptsFailed = true;
      const msg = 'Incorrect. Stalemate is a failure. Redo (no points for this puzzle).';
      setStatus(msg, 'error');
      openResult('incorrect', msg);
      render();
      return;
    }

    state.attemptsFailed = true;
    const msg = 'Incorrect. Not checkmate. Redo (no points for this puzzle).';
    setStatus(msg, 'error');
    openResult('incorrect', msg);
    render();
  }

  function nextPuzzle() {
    newPuzzle();
    setStatus('New puzzle generated. Place both pieces, then Confirm.', 'info');
    render();
  }

  function nextChallengePuzzle() {
    // Generate next puzzle using current challenge.level
    newChallengePuzzle();
    setStatus('New puzzle generated. Place both pieces, then Confirm.', 'info');
    render();
  }

  function onSquareClick(idx) {
    // If clicking a placed white piece, select it (so user can quickly adjust without changing slots)
    const slot = state.placed.findIndex(v => v === idx);
    if (slot !== -1) {
      state.selectedPieceSlot = slot;
      render();
      return;
    }
    placePiece(state.selectedPieceSlot, idx);
  }

  function onSelectSlot(slot) {
    state.selectedPieceSlot = slot;
    render();
  }

  function enableDragAndDrop() {
    // Custom pointer-based dragging (mouse/touch) to avoid browser drag cursor/icons.
    // This emulates chess.com style: the piece follows the cursor, with no "not allowed" cursor changes.

    let dragging = null; // { slot, ghostEl, lastOverSquareEl, originEl }

    const clearOver = () => {
      if (dragging?.lastOverSquareEl) {
        dragging.lastOverSquareEl.classList.remove('is-drop-target');
        dragging.lastOverSquareEl = null;
      }
    };

    const cleanup = () => {
      clearOver();
      if (dragging?.originEl) {
        dragging.originEl.classList.remove('hm-drag-origin');
        dragging.originEl = null;
      }
      if (dragging?.ghostEl) dragging.ghostEl.remove();
      dragging = null;
      document.body.classList.remove('hm-dragging');
    };

    // Move ghost using transform (avoids layout/reflow flicker on iOS Safari)
    let ghostRaf = 0;
    let ghostX = 0;
    let ghostY = 0;
    const moveGhost = (x, y) => {
      if (!dragging?.ghostEl) return;
      ghostX = x;
      ghostY = y;
      if (ghostRaf) return;
      ghostRaf = requestAnimationFrame(() => {
        ghostRaf = 0;
        if (!dragging?.ghostEl) return;
        dragging.ghostEl.style.transform = `translate3d(${ghostX}px, ${ghostY}px, 0) translate(-50%, -50%)`;
      });
    };

    const getSquareUnderPoint = (x, y) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      return el.closest?.('.hm-square') || null;
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const x = e.clientX;
      const y = e.clientY;
      moveGhost(x, y);

      const sq = getSquareUnderPoint(x, y);
      if (sq !== dragging.lastOverSquareEl) {
        clearOver();
        if (sq) {
          sq.classList.add('is-drop-target');
          dragging.lastOverSquareEl = sq;
        }
      }
      e.preventDefault?.();
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      const x = e.clientX;
      const y = e.clientY;
      const sq = getSquareUnderPoint(x, y);
      if (sq) {
        const idx = Number(sq.getAttribute('data-idx'));
        if (Number.isFinite(idx)) {
          state.selectedPieceSlot = dragging.slot;
          placePiece(dragging.slot, idx);
        }
      }
      cleanup();
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      e.preventDefault?.();
    };

    const startDragFromSlotEl = (slotEl, slot, e) => {
      if (!(slot === 0 || slot === 1)) return;
      const img = slotEl.querySelector('.hm-piece-img');
      const glyph = slotEl.querySelector('.hm-piece-glyph');

      const ghost = document.createElement('div');
      ghost.className = 'hm-drag-ghost';
      if (img && img.getAttribute('src')) {
        const gi = document.createElement('img');
        gi.src = img.getAttribute('src');
        gi.alt = '';
        ghost.appendChild(gi);
      } else if (glyph) {
        const span = document.createElement('span');
        span.textContent = glyph.textContent || '';
        ghost.appendChild(span);
      }
      document.body.appendChild(ghost);

      dragging = { slot, ghostEl: ghost, lastOverSquareEl: null, originEl: slotEl };
      // Hide the origin piece while dragging (iPad flicker + avoids double-vision).
      slotEl.classList.add('hm-drag-origin');
      document.body.classList.add('hm-dragging');
      state.selectedPieceSlot = slot;

      moveGhost(e.clientX, e.clientY);

      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', onPointerUp, true);
      window.addEventListener('pointercancel', onPointerUp, true);
      e.preventDefault?.();
    };

    document.querySelectorAll('.hm-slot').forEach((el) => {
      // Prevent native HTML5 drag behavior entirely.
      el.removeAttribute('draggable');
      el.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
      });

      el.addEventListener('pointerdown', (e) => {
        // Only left mouse / primary touch
        if (e.button !== undefined && e.button !== 0) return;
        const slot = Number(el.getAttribute('data-slot'));
        const slotMax = Array.isArray(state.puzzle?.whitePieces) ? state.puzzle.whitePieces.length : 0;
        if (!(slot >= 0 && slot < slotMax)) return;
        startDragFromSlotEl(el, slot, e);
      });
    });

    // Allow dragging already-placed pieces from the board (so user doesn't need to re-select slots).
    document.querySelectorAll('.hm-square').forEach((sq) => {
      sq.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        const idx = Number(sq.getAttribute('data-idx'));
        if (!Number.isFinite(idx)) return;
        const slot = state.placed.findIndex(v => v === idx);
        if (slot === -1) return; // only allow dragging placed white pieces

        // Use the piece visual in this square as ghost.
        const img = sq.querySelector('.hm-piece-img');
        const glyph = sq.querySelector('.hm-piece-glyph');

        const ghost = document.createElement('div');
        ghost.className = 'hm-drag-ghost';
        if (img && img.getAttribute('src')) {
          const gi = document.createElement('img');
          gi.src = img.getAttribute('src');
          gi.alt = '';
          ghost.appendChild(gi);
        } else if (glyph) {
          const span = document.createElement('span');
          span.textContent = glyph.textContent || '';
          ghost.appendChild(span);
        }
        document.body.appendChild(ghost);

        dragging = { slot, ghostEl: ghost, lastOverSquareEl: null, originEl: sq };
        sq.classList.add('hm-drag-origin');
        document.body.classList.add('hm-dragging');
