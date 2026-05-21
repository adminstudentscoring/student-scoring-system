        state.selectedPieceSlot = slot;

        moveGhost(e.clientX, e.clientY);
        window.addEventListener('pointermove', onPointerMove, true);
        window.addEventListener('pointerup', onPointerUp, true);
        window.addEventListener('pointercancel', onPointerUp, true);
        e.preventDefault?.();
      });
    });
  }

  function renderBoard(board) {
    const squaresHtml = [];
    for (let y = BOARD_SIZE - 1; y >= 0; y--) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const idx = xyToIdx(x, y);
        const coord = `${FILES[x]}${RANKS[y]}`;
        const isDark = (x + y) % 2 === 1;
        const piece = board[idx];
        const visual = piece ? renderPieceVisual(piece, pieceName(piece)) : '';
        squaresHtml.push(`
          <div class="hm-square ${isDark ? 'dark' : 'light'}" data-idx="${idx}" aria-label="${coord}">
            <div class="hm-piece">${visual}</div>
          </div>
        `);
      }
    }
    return squaresHtml.join('');
  }

  function canPatchInGameUi() {
    // Only patch during in-game screens to avoid full DOM rebuild flicker on iOS Safari.
    if (!(state.screen === 'practiceGame' || state.screen === 'challengeGame')) return false;
    // If any overlay/modal is open, keep using full render (simpler + consistent).
    if (state.ui?.leaderboardOpen || state.ui?.challengeLeaderboardOpen || state.ui?.resultOpen) return false;
    // While dragging, avoid patching (iOS Safari tends to repaint aggressively during pointer move).
    if (document.body.classList.contains('hm-dragging')) return false;
    const root = getRoot();
    if (!root) return false;
    const boardEl = document.getElementById('hopeMateBoard');
    if (!boardEl) return false;
    // Ensure board size hasn't changed (otherwise labels/grid need full rebuild).
    const expected = BOARD_SIZE * BOARD_SIZE;
    const squares = boardEl.querySelectorAll('.hm-square[data-idx]');
    if (squares.length !== expected) return false;
    return true;
  }

  function patchInGameUi() {
    const boardEl = document.getElementById('hopeMateBoard');
    if (!boardEl) return false;
    const b = Array.isArray(state.board) ? state.board : buildEmptyBoard();

    // Ensure any closed overlays are removed (fixes: Result modal stuck after Next when patch-mode runs).
    if (!state.ui?.resultOpen) document.getElementById('hmResultBackdrop')?.remove?.();
    if (!state.ui?.leaderboardOpen) document.getElementById('hmLeaderboardBackdrop')?.remove?.();
    if (!state.ui?.challengeLeaderboardOpen) document.getElementById('hmChallengeLeaderboardBackdrop')?.remove?.();

    // Update board pieces without rebuilding squares (prevents iPad flicker).
    // Diff against previous board to avoid touching every square.
    const prev = Array.isArray(hmPatchPrevBoard) && hmPatchPrevBoard.length === b.length ? hmPatchPrevBoard : null;
    boardEl.querySelectorAll('.hm-square[data-idx]').forEach((sq) => {
      const idx = Number(sq.getAttribute('data-idx'));
      if (!Number.isFinite(idx)) return;
      const piece = b[idx] || null;
      if (prev && prev[idx] === piece) return;
      const pieceEl = sq.querySelector('.hm-piece');
      if (!pieceEl) return;
      pieceEl.innerHTML = piece ? renderPieceVisual(piece, pieceName(piece)) : '';
    });
    hmPatchPrevBoard = b.slice();

    // Update slot UI (active + piece visuals) without recreating buttons.
    const pieces = state.puzzle ? state.puzzle.whitePieces : ['?', '?'];
    const slot0Active = state.selectedPieceSlot === 0 ? 'active' : '';
    const slot1Active = state.selectedPieceSlot === 1 ? 'active' : '';
    document.querySelectorAll('.hm-slot[data-slot]').forEach((btn) => {
      const slot = Number(btn.getAttribute('data-slot'));
      if (slot !== 0 && slot !== 1) return;
      const wantActive = slot === 0 ? slot0Active : slot1Active;
      btn.classList.toggle('active', !!wantActive);
      const p = pieces[slot];
      const pieceWrap = btn.querySelector('.hm-slot-piece');
      if (pieceWrap) {
        const next = renderPieceVisual(p, pieceName(p));
        if (pieceWrap.innerHTML !== next) pieceWrap.innerHTML = next;
      }
    });

    // Ensure CSS variable uses current board size (important when switching 5x5 <-> 8x8).
    document.querySelector('.hm-board-shell')?.style.setProperty('--hm-board-size', String(BOARD_SIZE));
    return true;
  }

  function render() {
    const root = getRoot();
    if (!root) return;

    const player = getSinglePlayer();
    const playerName = player ? player.name : 'Unknown';

    const challengeLeaderboardHtml = () => {
      if (!state.ui.challengeLeaderboardOpen) return '';
      const sec = Number(state.challengeLeaderboard.durationSec || 60) || 60;
      const tabs = [
        { sec: 60, label: '1 min' },
        { sec: 120, label: '2 min' },
        { sec: 180, label: '3 min' }
      ];
      return `
        <div class="hm-modal-backdrop" id="hmChallengeLeaderboardBackdrop" role="presentation">
          <div class="hm-modal" role="dialog" aria-modal="true" aria-label="Hope Mate Challenge Leaderboard">
            <div class="hm-modal-header">
              <div class="hm-modal-title">Challenge Leaderboard</div>
              <button id="hmChallengeLeaderboardClose" class="hm-modal-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="hm-modal-body">
              <div class="hm-actions" style="justify-content:flex-start; gap:8px; margin-bottom:10px;">
                ${tabs.map(t => `
                  <button class="btn btn-secondary" type="button" data-hm-clb-sec="${t.sec}" ${t.sec === sec ? 'style="border-color: rgba(102,126,234,0.65); background: rgba(102,126,234,0.10);"' : ''}>
                    ${t.label}
                  </button>
                `).join('')}
              </div>
              ${state.challengeLeaderboard.loading ? `<div class="hm-muted">Loading...</div>` : ''}
              ${state.challengeLeaderboard.error ? `<div class="hm-muted">${escapeHtml(state.challengeLeaderboard.error)}</div>` : ''}
              <div class="hm-leaderboard-list">
                ${(() => {
                  const meId = String(player?.id || '');
                  const entries = Array.isArray(state.challengeLeaderboard.entries) ? state.challengeLeaderboard.entries : [];
                  const top = entries.slice(0, 20);
                  if (!state.challengeLeaderboard.loading && top.length === 0) {
                    return `<div class="hm-muted">No records yet.</div>`;
                  }
                  return top.map((e, idx) => {
                    const sid = String(e?.student?.id || e?.studentId || e?.id || '');
                    const name = String(e?.student?.name || e?.name || 'Unknown');
                    const solved = Number(e?.totalSolved ?? 0) || 0;
                    const lvl = Number(e?.bestLevel ?? 1) || 1;
                    const tleft = Number(e?.bestTimeLeftSec ?? 0) || 0;
                    const isMe = meId && sid === meId;
                    return `
                      <div class="hm-leaderboard-row ${isMe ? 'is-me' : ''}">
                        <div class="hm-leaderboard-rank">${idx + 1}</div>
                        <div class="hm-leaderboard-name">${escapeHtml(name)}</div>
                        <div class="hm-leaderboard-score">${solved} <span class="hm-muted" style="font-weight:600;">(Lv ${lvl}, ${formatMmSs(tleft)} left)</span></div>
                      </div>
                    `;
                  }).join('');
                })()}
              </div>
            </div>
          </div>
        </div>
      `;
    };

    const pieces = state.puzzle ? state.puzzle.whitePieces : ['?', '?'];
    const slot0Active = state.selectedPieceSlot === 0 ? 'active' : '';
    const slot1Active = state.selectedPieceSlot === 1 ? 'active' : '';

    const slotLabel = (slot) => {
      const p = pieces[slot];
      return `
        <button class="hm-slot ${slot === 0 ? slot0Active : slot1Active}" type="button" data-slot="${slot}" aria-label="Piece slot ${slot + 1}">
          <span class="hm-slot-badge">${slot + 1}</span>
          <span class="hm-slot-piece">${renderPieceVisual(p, pieceName(p))}</span>
        </button>
      `;
    };

    // Patch mode for in-game screens (iPad flicker fix): update only pieces/slots, avoid root.innerHTML rebuild.
    if (canPatchInGameUi()) {
      if (patchInGameUi()) return;
    }

    if (state.screen === 'home') {
      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Choose a mode to begin.</div>
            </div>
            <div class="hope-mate-meta">
              <div><strong>Student:</strong> ${escapeHtml(playerName)}</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-mode-menu" role="navigation" aria-label="Hope Mate mode menu">
              <button id="hmChallengeBtn" class="btn btn-secondary hm-mode-btn" type="button">Challenge Mode</button>
              <button id="hmPracticeBtn" class="btn btn-primary hm-mode-btn" type="button">Practice Mode</button>
              <button id="hmRulesBtn" class="btn btn-secondary hm-mode-btn" type="button">Rules</button>
              <button id="hmHomeLeaderboardBtn" class="btn btn-secondary hm-mode-btn" type="button">Leaderboard</button>
            </div>
          </div>
        </div>

        ${challengeLeaderboardHtml()}
      `;
      document.getElementById('hmPracticeBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.ui.challengeLeaderboardOpen = false;
        state.screen = 'practiceSelect';
        render();
      });
      document.getElementById('hmChallengeBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.ui.challengeLeaderboardOpen = false;
        state.screen = 'challengeSelect';
        render();
      });
      document.getElementById('hmRulesBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.ui.challengeLeaderboardOpen = false;
        state.screen = 'rules';
        render();
      });
      document.getElementById('hmHomeLeaderboardBtn')?.addEventListener('click', () => {
        openChallengeLeaderboard(60);
        refreshChallengeLeaderboard(60);
      });
      document.getElementById('hmChallengeLeaderboardClose')?.addEventListener('click', closeChallengeLeaderboard);
      document.getElementById('hmChallengeLeaderboardBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'hmChallengeLeaderboardBackdrop') closeChallengeLeaderboard();
      });
      root.querySelectorAll('[data-hm-clb-sec]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sec = Number(btn.getAttribute('data-hm-clb-sec'));
          if (![60, 120, 180].includes(sec)) return;
          openChallengeLeaderboard(sec);
          refreshChallengeLeaderboard(sec);
        });
      });
      return;
    }

    if (state.screen === 'challengeSelect') {
      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Challenge Mode — Select a time limit</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-actions">
              <button id="hmChallengeBackBtn" class="btn btn-secondary" type="button">Back</button>
            </div>
          </div>

          <div class="hm-piece-tray" style="max-width:520px; margin: 0 auto;">
            <div class="hm-piece-tray-title">Time</div>
            <div class="hm-mode-menu" style="margin-top:8px;">
              <button class="btn btn-primary hm-mode-btn" type="button" data-sec="60">1 min</button>
              <button class="btn btn-primary hm-mode-btn" type="button" data-sec="120">2 min</button>
              <button class="btn btn-primary hm-mode-btn" type="button" data-sec="180">3 min</button>
            </div>
            <div class="hm-muted" style="margin-top:10px;">
              Start at Level 1. Every 2 correct puzzles increases the level (max Level 10).
            </div>
          </div>
        </div>

        ${challengeLeaderboardHtml()}
      `;

      document.getElementById('hmChallengeBackBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.ui.challengeLeaderboardOpen = false;
        state.screen = 'home';
        render();
      });
      root.querySelectorAll('[data-sec]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sec = Number(btn.getAttribute('data-sec'));
          if (![60, 120, 180].includes(sec)) return;
          resetChallengeState(sec);
          state.screen = 'challengeGame';
          newChallengePuzzle();
          setStatus('Challenge started. Place both pieces, then Confirm.', 'info');
          render();
          startChallengeTimer();
          // Preload leaderboard for the selected duration (optional)
          refreshChallengeLeaderboard(sec);
        });
      });
      document.getElementById('hmChallengeLeaderboardClose')?.addEventListener('click', closeChallengeLeaderboard);
      document.getElementById('hmChallengeLeaderboardBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'hmChallengeLeaderboardBackdrop') closeChallengeLeaderboard();
      });
      root.querySelectorAll('[data-hm-clb-sec]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sec = Number(btn.getAttribute('data-hm-clb-sec'));
          if (![60, 120, 180].includes(sec)) return;
          openChallengeLeaderboard(sec);
          refreshChallengeLeaderboard(sec);
        });
      });
      return;
    }

    if (state.screen === 'rules') {
      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Rules</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-actions">
              <button id="hmRulesBackBtn" class="btn btn-secondary" type="button">Back</button>
            </div>
          </div>

          <div class="hm-piece-tray" style="max-width:820px; margin: 0 auto;">
            <div class="hm-piece-tray-title">How to play</div>
            <div class="hm-muted" style="line-height:1.6;">
              <div style="margin-bottom:10px;"><strong>Goal:</strong> Place all given white pieces so that it is <strong>Black to move</strong>, and the position is <strong>checkmate</strong>.</div>
              <div style="margin-bottom:10px;"><strong>Confirm:</strong> You can re-place pieces freely before confirming. No “temporary check” hints are shown.</div>
              <div style="margin-bottom:10px;"><strong>Success / Failure:</strong> Checkmate = success. <strong>Stalemate = failure</strong>.</div>
              <div style="margin-bottom:10px;"><strong>Piece rules:</strong> Standard chess rules apply. White pawns cannot be placed on rank 1. White king (if present) cannot be placed adjacent to the black king, and cannot be placed on a square attacked by black.</div>
              <div style="margin-bottom:10px;"><strong>Scoring:</strong> +1 only if you solve the puzzle on the first correct attempt. If you failed once on the same puzzle, solving it later gives 0 points.</div>
              <div style="margin-bottom:10px;"><strong>Modes:</strong>
                <div>- <strong>Practice</strong>: Pick a level and solve puzzles with no time limit.</div>
                <div>- <strong>Challenge</strong>: Choose 1/2/3 minutes. Start at Level 1. Every 2 solved puzzles increases the level (max Level 10).</div>
              </div>
              <div><strong>Controls:</strong> Click-to-place or drag-and-drop pieces. You can also drag already-placed pieces.</div>
            </div>
          </div>
        </div>
      `;
      document.getElementById('hmRulesBackBtn')?.addEventListener('click', () => {
        state.screen = 'home';
        render();
      });
      return;
    }

    if (state.screen === 'practiceSelect') {
      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Practice Mode — Select a level</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-actions">
              <button id="hmBackHomeBtn" class="btn btn-secondary" type="button">Back</button>
            </div>
          </div>

          <div class="hm-piece-tray" style="max-width:720px; margin: 0 auto;">
            <div class="hm-piece-tray-title">Levels</div>
            <div class="hm-level-grid">
              ${PRACTICE_LEVELS.map(l => `
                <button class="hm-level-btn ${l === state.practiceLevel ? 'active' : ''}" type="button" data-level="${l}" aria-label="Level ${l}">
                  <span class="hm-level-number">${l}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      document.getElementById('hmBackHomeBtn')?.addEventListener('click', () => {
        state.screen = 'home';
        render();
      });
      document.querySelectorAll('.hm-level-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const lvl = Number(btn.getAttribute('data-level'));
          if (!Number.isFinite(lvl) || lvl < 1 || lvl > 10) return;
          state.practiceLevel = Math.floor(lvl);
          writeStoredPracticeLevel(state.practiceLevel);
          state.screen = 'practiceGame';
          newPuzzle();
          setStatus('New puzzle generated. Place both pieces, then Confirm.', 'info');
          render();
          refreshLeaderboard();
        });
      });
      return;
    }

    if (state.screen === 'challengeGame') {
      const cfg = challengeConfigForLevel(state.challenge.level);
      const levelLabel = `Level ${cfg.level} (${cfg.boardSize}×${cfg.boardSize}, black pieces: ${cfg.blackExtraCount})`;
      const timerLabel = formatMmSs(state.challenge.timeLeftSec);

      root.innerHTML = `
        <div class="hope-mate-shell">
          <div class="hope-mate-topbar">
            <div class="hope-mate-title-wrap">
              <div class="hope-mate-title">✨ Hope Mate</div>
              <div class="hope-mate-subtitle">Challenge Mode — ${escapeHtml(levelLabel)} — Place 2 pieces to checkmate the black king (black to move).</div>
            </div>
            <div class="hope-mate-meta">
              <div><strong>Student:</strong> ${escapeHtml(playerName)}</div>
              <div><strong>Timer:</strong> <span id="hmChallengeTimer">${escapeHtml(timerLabel)}</span></div>
              <div><strong>Level:</strong> ${state.challenge.level}</div>
              <div><strong>Progress:</strong> ${state.challenge.solvedInLevel}/2</div>
              <div><strong>Solved:</strong> ${state.challenge.totalSolved}</div>
              <div><strong>Session:</strong> ${state.sessionScore}</div>
            </div>
          </div>

          <div class="hope-mate-controls">
            <div class="hm-actions">
              <button id="hmChallengeQuitBtn" class="btn btn-secondary" type="button">Quit</button>
              <button id="hmChallengeRestartBtn" class="btn btn-secondary" type="button">Restart</button>
              <button id="hopeMateLeaderboardBtn" class="btn btn-secondary" type="button">Leaderboard</button>
              <button id="hopeMateResetBtn" class="btn btn-secondary" type="button">Reset placement</button>
              <button id="hmChallengeNextBtn" class="btn btn-secondary" type="button">Next</button>
            </div>
          </div>

          <div id="hopeMateStatus" class="hope-mate-status is-info">${escapeHtml(lastStatus.text || 'Generating puzzle...')}</div>

          <div class="hope-mate-main">
            <div class="hope-mate-left">
              <div class="hm-piece-tray">
                <div class="hm-piece-tray-title">Your pieces (click or drag to a square)</div>
                <div class="hm-slots">
                  ${slotLabel(0)}
                  ${slotLabel(1)}
                </div>
                <div class="hm-piece-tray-hint">You can change placement before Confirm. No partial feedback is shown.</div>

                <div class="hm-piece-tray-footer" aria-label="Challenge actions">
                  <button id="hopeMateConfirmBtn" class="btn btn-primary" type="button">Confirm</button>
                  <button id="hopeMateCancelBtn" class="btn btn-secondary" type="button">Cancel</button>
                </div>
              </div>
            </div>

            <div class="hope-mate-board-wrap">
              <div class="hm-board-container">
