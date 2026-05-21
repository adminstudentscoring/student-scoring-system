                <div class="hm-board-shell" style="--hm-board-size:${BOARD_SIZE}">
                  <div class="hm-board-col-labels" aria-hidden="true">
                    ${FILES.map(f => `<div class="hm-col-label">${f.toUpperCase()}</div>`).join('')}
                  </div>
                  <div class="hm-board-row-labels" aria-hidden="true">
                    ${[...RANKS].reverse().map(r => `<div class="hm-row-label">${r}</div>`).join('')}
                  </div>
                  <div id="hopeMateBoard" class="hm-board" role="grid" aria-label="Hope Mate board">
                    ${renderBoard(state.board || buildEmptyBoard())}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        ${state.ui.leaderboardOpen ? `
          <div class="hm-modal-backdrop" id="hmLeaderboardBackdrop" role="presentation">
            <div class="hm-modal" role="dialog" aria-modal="true" aria-label="Hope Mate Leaderboard">
              <div class="hm-modal-header">
                <div class="hm-modal-title">Leaderboard (your teacher)</div>
                <button id="hmLeaderboardClose" class="hm-modal-close" type="button" aria-label="Close">&times;</button>
              </div>
              <div class="hm-modal-body">
                ${state.leaderboard.loading ? `<div class="hm-muted">Loading...</div>` : ''}
                ${state.leaderboard.error ? `<div class="hm-muted">${escapeHtml(state.leaderboard.error)}</div>` : ''}
                <div class="hm-leaderboard-list">
                  ${(() => {
                    const meId = String(player?.id || '');
                    const entries = Array.isArray(state.leaderboard.entries) ? state.leaderboard.entries : [];
                    const top = entries.slice(0, 20);
                    if (!state.leaderboard.loading && top.length === 0) {
                      return `<div class="hm-muted">No records yet.</div>`;
                    }
                    return top.map((e, idx) => {
                      const sid = String(e?.student?.id || e?.studentId || e?.id || '');
                      const name = String(e?.student?.name || e?.name || 'Unknown');
                      const score = Number(e?.totalScore ?? e?.score ?? 0) || 0;
                      const isMe = meId && sid === meId;
                      return `
                        <div class="hm-leaderboard-row ${isMe ? 'is-me' : ''}">
                          <div class="hm-leaderboard-rank">${idx + 1}</div>
                          <div class="hm-leaderboard-name">${escapeHtml(name)}</div>
                          <div class="hm-leaderboard-score">${score}</div>
                        </div>
                      `;
                    }).join('');
                  })()}
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        ${state.ui.resultOpen ? `
          <div class="hm-modal-backdrop" id="hmResultBackdrop" role="presentation">
            <div class="hm-modal hm-result-modal" role="dialog" aria-modal="true" aria-label="Hope Mate Result">
              <div class="hm-modal-header">
                <div class="hm-modal-title">${state.ui.resultKind === 'correct' ? 'Correct' : 'Incorrect'}</div>
                <button id="hmResultClose" class="hm-modal-close" type="button" aria-label="Close">&times;</button>
              </div>
              <div class="hm-modal-body">
                <div class="hm-result-message">${escapeHtml(state.ui.resultMessage || '')}</div>
                <div class="hm-result-actions">
                  ${state.ui.resultKind === 'correct'
                    ? `<button id="hmResultNext" class="btn btn-primary" type="button">Next</button>`
                    : `<button id="hmResultRedo" class="btn btn-primary" type="button">Redo</button>`
                  }
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        ${challengeLeaderboardHtml()}
      `;

      document.getElementById('hmChallengeQuitBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.screen = 'home';
        render();
      });
      document.getElementById('hmChallengeRestartBtn')?.addEventListener('click', () => {
        const sec = Number(state.challenge.durationSec || 60) || 60;
        resetChallengeState(sec);
        newChallengePuzzle();
        setStatus('Challenge restarted. Place both pieces, then Confirm.', 'info');
        render();
        startChallengeTimer();
      });
      document.getElementById('hmChallengeNextBtn')?.addEventListener('click', nextChallengePuzzle);
      document.getElementById('hopeMateLeaderboardBtn')?.addEventListener('click', () => {
        const sec = Number(state.challenge.durationSec || 60) || 60;
        openChallengeLeaderboard(sec);
        refreshChallengeLeaderboard(sec);
      });
      document.getElementById('hopeMateResetBtn')?.addEventListener('click', resetPlacements);
      document.getElementById('hopeMateConfirmBtn')?.addEventListener('click', confirm);
      document.getElementById('hopeMateCancelBtn')?.addEventListener('click', () => {
        stopChallengeTimer();
        state.challenge.active = false;
        state.screen = 'challengeSelect';
        render();
      });

      document.getElementById('hmLeaderboardClose')?.addEventListener('click', closeLeaderboard);
      document.getElementById('hmLeaderboardBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'hmLeaderboardBackdrop') closeLeaderboard();
      });

      document.getElementById('hmResultClose')?.addEventListener('click', closeResult);
      document.getElementById('hmResultBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'hmResultBackdrop') closeResult();
      });
      document.getElementById('hmResultNext')?.addEventListener('click', () => {
        closeResult();
        // In Challenge, Next advances difficulty progression handled in confirm()
        nextChallengePuzzle();
      });
      document.getElementById('hmResultRedo')?.addEventListener('click', () => {
        closeResult();
        resetPlacements();
        setStatus('Redo: place both pieces again, then Confirm.', 'info');
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

      // Bind board interactions + drag
      document.querySelectorAll('.hm-square').forEach((el) => {
        el.addEventListener('click', () => {
          const idx = Number(el.getAttribute('data-idx'));
          if (Number.isFinite(idx)) onSquareClick(idx);
        });
      });
      // Ensure CSS grid uses current board size (important when switching 5x5 <-> 8x8)
      document.querySelector('.hm-board-shell')?.style.setProperty('--hm-board-size', String(BOARD_SIZE));
      enableDragAndDrop();
      return;
    }

    // practiceGame (current implementation)
    const cfg = getPracticeConfig(state.practiceLevel);
    const levelLabel = `Level ${cfg.level} (${cfg.boardSize}×${cfg.boardSize}, black pieces: ${cfg.blackExtraCount})`;

    root.innerHTML = `
      <div class="hope-mate-shell">
        <div class="hope-mate-topbar">
          <div class="hope-mate-title-wrap">
            <div class="hope-mate-title">✨ Hope Mate</div>
            <div class="hope-mate-subtitle">Practice Mode — ${escapeHtml(levelLabel)} — Place 2 pieces to checkmate the black king (black to move).</div>
          </div>
          <div class="hope-mate-meta">
            <div><strong>Student:</strong> ${escapeHtml(playerName)}</div>
            <div><strong>Session:</strong> ${state.sessionScore}</div>
            <div><strong>Total:</strong> ${state.totalScore}</div>
            <div><strong>Best session:</strong> ${state.bestScore}</div>
          </div>
        </div>

        <div class="hope-mate-controls">
          <div class="hm-actions">
            <button id="hmPracticeLevelsBtn" class="btn btn-secondary" type="button">Levels</button>
            <button id="hopeMateLeaderboardBtn" class="btn btn-secondary" type="button">Practice Leaderboard</button>
            <button id="hopeMateResetBtn" class="btn btn-secondary" type="button">Reset placement</button>
            <button id="hopeMateNextBtn" class="btn btn-secondary" type="button">Next</button>
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

              <div class="hm-piece-tray-footer" aria-label="Practice actions">
                <button id="hopeMateConfirmBtn" class="btn btn-primary" type="button">Confirm</button>
                <button id="hopeMateCancelBtn" class="btn btn-secondary" type="button">Cancel</button>
              </div>
            </div>
          </div>

          <div class="hope-mate-board-wrap">
            <div class="hm-board-container">
              <div class="hm-board-shell">
                <div class="hm-board-col-labels" aria-hidden="true">
                  ${FILES.map(f => `<div class="hm-col-label">${f.toUpperCase()}</div>`).join('')}
                </div>
                <div class="hm-board-row-labels" aria-hidden="true">
                  ${[...RANKS].reverse().map(r => `<div class="hm-row-label">${r}</div>`).join('')}
                </div>
                <div id="hopeMateBoard" class="hm-board" role="grid" aria-label="Hope Mate 5x5 board">
                  ${renderBoard(state.board || buildEmptyBoard())}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${state.ui.leaderboardOpen ? `
        <div class="hm-modal-backdrop" id="hmLeaderboardBackdrop" role="presentation">
          <div class="hm-modal" role="dialog" aria-modal="true" aria-label="Hope Mate Leaderboard">
            <div class="hm-modal-header">
              <div class="hm-modal-title">Leaderboard (your teacher)</div>
              <button id="hmLeaderboardClose" class="hm-modal-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="hm-modal-body">
              ${state.leaderboard.loading ? `<div class="hm-muted">Loading...</div>` : ''}
              ${state.leaderboard.error ? `<div class="hm-muted">${escapeHtml(state.leaderboard.error)}</div>` : ''}
              <div class="hm-leaderboard-list">
                ${(() => {
                  const meId = String(player?.id || '');
                  const entries = Array.isArray(state.leaderboard.entries) ? state.leaderboard.entries : [];
                  const top = entries.slice(0, 20);
                  if (!state.leaderboard.loading && top.length === 0) {
                    return `<div class="hm-muted">No records yet.</div>`;
                  }
                  return top.map((e, idx) => {
                    const sid = String(e?.student?.id || e?.studentId || e?.id || '');
                    const name = String(e?.student?.name || e?.name || 'Unknown');
                    const score = Number(e?.totalScore ?? e?.score ?? 0) || 0;
                    const isMe = meId && sid === meId;
                    return `
                      <div class="hm-leaderboard-row ${isMe ? 'is-me' : ''}">
                        <div class="hm-leaderboard-rank">${idx + 1}</div>
                        <div class="hm-leaderboard-name">${escapeHtml(name)}</div>
                        <div class="hm-leaderboard-score">${score}</div>
                      </div>
                    `;
                  }).join('');
                })()}
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      ${state.ui.resultOpen ? `
        <div class="hm-modal-backdrop" id="hmResultBackdrop" role="presentation">
          <div class="hm-modal hm-result-modal" role="dialog" aria-modal="true" aria-label="Hope Mate Result">
            <div class="hm-modal-header">
              <div class="hm-modal-title">${state.ui.resultKind === 'correct' ? 'Correct' : 'Incorrect'}</div>
              <button id="hmResultClose" class="hm-modal-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="hm-modal-body">
              <div class="hm-result-message">${escapeHtml(state.ui.resultMessage || '')}</div>
              <div class="hm-result-actions">
                ${state.ui.resultKind === 'correct'
                  ? `<button id="hmResultNext" class="btn btn-primary" type="button">Next</button>`
                  : `<button id="hmResultRedo" class="btn btn-primary" type="button">Redo</button>`
                }
              </div>
            </div>
          </div>
        </div>
      ` : ''}
    `;

    // Wire events
    document.querySelectorAll('.hm-square').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-idx'));
        if (Number.isFinite(idx)) onSquareClick(idx);
      });
    });
    document.querySelectorAll('.hm-slot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = Number(btn.getAttribute('data-slot'));
        if (slot === 0 || slot === 1) onSelectSlot(slot);
      });
    });
    document.getElementById('hopeMateResetBtn')?.addEventListener('click', resetPlacements);
    document.getElementById('hopeMateConfirmBtn')?.addEventListener('click', confirm);
    document.getElementById('hopeMateNextBtn')?.addEventListener('click', nextPuzzle);
    document.getElementById('hopeMateCancelBtn')?.addEventListener('click', () => {
      // Cancel current practice puzzle and return to level select.
      state.screen = 'practiceSelect';
      render();
    });
    document.getElementById('hmPracticeLevelsBtn')?.addEventListener('click', () => {
      state.screen = 'practiceSelect';
      render();
    });
    document.getElementById('hopeMateLeaderboardBtn')?.addEventListener('click', () => {
      // Open and refresh (if needed)
      openLeaderboard();
      if (!state.leaderboard.loading && (!state.leaderboard.entries || state.leaderboard.entries.length === 0)) {
        refreshLeaderboard();
      }
    });
    // Update CSS variable for board size
    document.querySelector('.hm-board-shell')?.style.setProperty('--hm-board-size', String(BOARD_SIZE));

    document.getElementById('hmLeaderboardClose')?.addEventListener('click', closeLeaderboard);
    document.getElementById('hmLeaderboardBackdrop')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'hmLeaderboardBackdrop') closeLeaderboard();
    });

    document.getElementById('hmResultClose')?.addEventListener('click', closeResult);
    document.getElementById('hmResultBackdrop')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'hmResultBackdrop') closeResult();
    });
    document.getElementById('hmResultNext')?.addEventListener('click', () => {
      closeResult();
      nextPuzzle();
    });
    document.getElementById('hmResultRedo')?.addEventListener('click', () => {
      closeResult();
      resetPlacements();
      setStatus('Redo: place both pieces again, then Confirm.', 'info');
    });

    // Drag-and-drop is optional; click-to-place still works.
    enableDragAndDrop();
  }

  function init() {
    // Enforce exactly one student in this MVP (teacher side already blocks, but keep safe here)
    const player = getSinglePlayer();
    if (!player) {
      const root = getRoot();
      if (root) {
        root.innerHTML = `
          <div class="hope-mate-card">
            <h2 class="hope-mate-title">✨ Hope Mate</h2>
            <p class="hope-mate-subtitle">This game currently supports exactly 1 student.</p>
          </div>
        `;
      }
      return;
    }

    state.practiceLevel = readStoredPracticeLevel();
    const cfg = getPracticeConfig(state.practiceLevel);
    setBoardSize(cfg.boardSize);
    loadScores();
    lastStatus = { text: 'Welcome to Hope Mate. Choose Practice Mode to begin.', kind: 'info' };
    state.screen = 'home';
    state.puzzle = null;
    state.board = buildEmptyBoard();
    state.placed = [];
    render();
  }

  window.initHopeMate = function initHopeMate() {
    init();
  };
})();



