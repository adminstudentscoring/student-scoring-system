// Blunders UI (Home / Blunder / Review)
(function () {
  const C = window.BlundersCore;
  if (!C) {
    console.error('BlundersCore missing. Ensure /game/blunders/core.js is loaded before /game/blunders/blunders.js');
        return;
      }
  const {
    escapeHtml,
    STATE,
    todayYmdLocal,
    captureFocusInfo,
    restoreFocusInfo,
    getBlundersRole,
    applyBoardColors,
    setBoardColors,
    getPlayers,
    getStudentPasswordQuery,
    getStudentPasswordQueryWith,
    fetchMyBlunders,
    fetchMasterList,
    fetchMasterPuzzles,
    submitMasterAttempt,
    teacherApi,
    submitAttempt,
    challengeStart,
    challengeAttempt,
    fetchChallengeLeaderboard,
    fmtTs,
    fmtIsoUtc,
    parseIsoMs,
    puzzleTimeMs,
    dropOfPuzzle,
    isMissMatePuzzle,
    bucketKeyOfPuzzle,
    reviewDurationStartMs,
    getReviewPuzzlesFiltered,
    pieceImagePath,
    parseFenBoard,
    squareToRC,
    rcToSquare,
    isDarkSquare,
    displaySquares
  } = C;

  // Expose a tiny API so feature modules (teacher/challenge) can call back into entry (render + shared UI helpers).
  // These modules are loaded before this file, so they reference this via window.BlundersEntryApi at runtime.
  window.BlundersEntryApi = window.BlundersEntryApi || {};

  // Student module moved to game/blunders/student.js
  function renderSidebar() { return window.BlundersStudent?.renderSidebar?.() || `<aside class="bl-sidebar"><div class="bl-side-title">💥 Blunders</div></aside>`; }
  function renderDebugBlock() { return window.BlundersStudent?.renderDebugBlock?.() || ``; }
  function openHomePracticeModal() { return window.BlundersStudent?.openHomePracticeModal?.(); }
  function startPracticeFromHome(key) { return window.BlundersStudent?.startPracticeFromHome?.(key); }
  function renderHomePage() { return window.BlundersStudent?.renderHomePage?.() || `<div class="bl-card">Student module not loaded.</div>`; }
  function renderBlunderPage() { return window.BlundersStudent?.renderBlunderPage?.() || `<div class="bl-card">Student module not loaded.</div>`; }
  function renderReviewPage() { return window.BlundersStudent?.renderReviewPage?.() || `<div class="bl-card">Student module not loaded.</div>`; }
  function renderStudentMasterGamePage() { return window.BlundersStudent?.renderStudentMasterGamePage?.() || `<div class="bl-card">Student module not loaded.</div>`; }
  function renderSettingsPage() { return window.BlundersStudent?.renderSettingsPage?.() || `<div class="bl-card">Student module not loaded.</div>`; }
  function openModal(title, bodyHtml) {
    STATE.ui.modalOpen = true;
    STATE.ui.modalHtml = `
      <div class="bl-modal-backdrop" id="blModalBackdrop" role="presentation">
        <div class="bl-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <div class="bl-modal-header">
            <div class="bl-modal-title">${escapeHtml(title)}</div>
            <button class="bl-modal-close" type="button" id="blModalClose" aria-label="Close">×</button>
          </div>
          <div class="bl-modal-body">${bodyHtml}</div>
        </div>
      </div>
    `;
    render();
  }

  function closeModal() {
    // Stop teacher job polling if a job modal is open.
    try { window.BlundersTeacher?.stopTeacherJobPolling?.(); } catch {}
    STATE.ui.modalOpen = false;
    STATE.ui.modalHtml = '';
    const shouldRefresh = !!STATE.needsRefreshAfterModal;
    const shouldRefreshMaster = !!STATE.needsMasterRefreshAfterModal;
    STATE.needsRefreshAfterModal = false;
    STATE.needsMasterRefreshAfterModal = false;
    if (shouldRefresh) {
      // Fire-and-forget; render immediately and refresh in background.
      render();
      refreshData();
      return;
    }
    if (shouldRefreshMaster) {
      render();
      const mid = String(STATE.master.selectedMasterId || '');
      if (mid) ensureMasterPuzzlesLoaded(mid).catch(() => {});
      else ensureMasterGameLoaded().catch(() => {});
      return;
    }
    render();
  }

  // Populate entry API now that functions exist.
  window.BlundersEntryApi.render = render;
  window.BlundersEntryApi.openModal = openModal;
  window.BlundersEntryApi.closeModal = closeModal;

  function setPage(page) {
    STATE.page = page;
    render();
  }

  async function ensureMasterGameLoaded() {
    if (!STATE.me?.id) return;
    if (STATE.master.loading) return;
    STATE.master.loading = true;
    STATE.master.error = '';
    render();
    try {
      const data = await fetchMasterList(STATE.me.id);
      const masters = Array.isArray(data?.masters) ? data.masters : [];
      STATE.master.masters = masters;
      STATE.master.countsByMaster = Object.fromEntries(masters.map(m => [String(m.id || ''), m.counts || {}]));
      // Auto-select first master with pending puzzles (or first)
      const withPending = masters.find(m => Number(m?.counts?.pending || 0) > 0) || masters[0] || null;
      STATE.master.selectedMasterId = withPending ? String(withPending.id || '') : '';
      STATE.master.loading = false;
      render();
      if (STATE.master.selectedMasterId) {
        await ensureMasterPuzzlesLoaded(STATE.master.selectedMasterId);
      }
    } catch (e) {
      STATE.master.loading = false;
      STATE.master.error = String(e?.message || e);
      render();
    }
  }

  async function ensureMasterPuzzlesLoaded(masterId) {
    if (!STATE.me?.id) return;
    const mid = String(masterId || '').trim();
    if (!mid) return;
    STATE.master.loading = true;
    STATE.master.error = '';
    STATE.master.selectedMasterId = mid;
    render();
    try {
      const data = await fetchMasterPuzzles(STATE.me.id, mid);
      STATE.master.pending = Array.isArray(data?.pending) ? data.pending : [];
      STATE.master.completed = Array.isArray(data?.completed) ? data.completed : [];
      const max = Math.max(0, STATE.master.pending.length - 1);
      STATE.master.currentIndex = Math.max(0, Math.min(Number(STATE.master.currentIndex || 0), max));
      STATE.master.loading = false;
      render();
    } catch (e) {
      STATE.master.loading = false;
      STATE.master.error = String(e?.message || e);
      render();
    }
  }

  function setBlunderModePending() {
    STATE.mode = 'pending';
    STATE.practicePuzzle = null;
    STATE.currentIndex = 0;
    STATE.selectedFrom = null;
    STATE.lastAttemptWasPendingSolve = false;
    render();
  }

  function setBlunderModePractice(puzzle) {
    STATE.mode = 'practice';
    STATE.practicePuzzle = puzzle || null;
    STATE.selectedFrom = null;
    STATE.lastAttemptWasPendingSolve = false;
    render();
  }

  function currentPuzzle() {
    if (STATE.mode === 'practice') return STATE.practicePuzzle;
    const list = Array.isArray(STATE.pending) ? STATE.pending : [];
    if (!list.length) return null;
    const idx = Math.max(0, Math.min(list.length - 1, Number(STATE.currentIndex) || 0));
    return list[idx] || null;
  }

  // Student pages extracted to game/blunders/student.js
  // (thin wrappers defined near top)

  // (Student page implementations moved to game/blunders/student.js)

  function renderBoardForPuzzle(puzzle, flip, selectedFrom, opts = {}) {
    const fen = String(opts.fenOverride || puzzle?.startFEN || '');
    const parsed = parseFenBoard(fen);
    if (!parsed) return `<div class="blunders-muted">Invalid FEN.</div>`;
    const squares = displaySquares(!!flip);
    const oppUci = String(puzzle?.opponentMoveUci || '');
    const hlFrom = oppUci && oppUci.length >= 4 ? oppUci.slice(0, 2) : '';
    const hlTo = oppUci && oppUci.length >= 4 ? oppUci.slice(2, 4) : '';
    const myUci = String(opts.myMoveUci || '');
    const myFrom = myUci && myUci.length >= 4 ? myUci.slice(0, 2) : '';
    const myTo = myUci && myUci.length >= 4 ? myUci.slice(2, 4) : '';
    return `
      <div class="bl-board" id="blBoard" role="grid" aria-label="Chessboard">
        ${squares.map((sq) => {
          const rc = squareToRC(sq);
          const piece = rc ? parsed.board[rc.r][rc.c] : '';
          const light = !isDarkSquare(sq);
          const isSel = selectedFrom && selectedFrom === sq;
          const isLastFrom = hlFrom && sq === hlFrom;
          const isLastTo = hlTo && sq === hlTo;
          const isMyFrom = myFrom && sq === myFrom;
          const isMyTo = myTo && sq === myTo;
          const showRank = sq[0] === (flip ? 'h' : 'a');
          const showFile = sq[1] === (flip ? '8' : '1');
          return `
            <div class="bl-sq ${light ? 'light' : 'dark'} ${isSel ? 'selected' : ''} ${isLastFrom ? 'bl-last-from' : ''} ${isLastTo ? 'bl-last-to' : ''} ${isMyFrom ? 'bl-my-from' : ''} ${isMyTo ? 'bl-my-to' : ''}" data-bl-sq="${escapeHtml(sq)}" role="gridcell" aria-label="${escapeHtml(sq)}">
              ${piece ? `<img class="bl-piece" draggable="false" alt="${escapeHtml(piece)}" src="${pieceImagePath(piece)}">` : ''}
              ${showRank ? `<span class="bl-coord bl-coord-rank">${escapeHtml(sq[1])}</span>` : ''}
              ${showFile ? `<span class="bl-coord bl-coord-file">${escapeHtml(sq[0])}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // (Student page implementations moved to game/blunders/student.js)

  // Challenge / Leaderboard moved to game/blunders/challenge.js
  function challengeCurrentPuzzle() { return window.BlundersChallenge?.challengeCurrentPuzzle?.() || null; }
  function clearChallengeUi() { return window.BlundersChallenge?.clearChallengeUi?.(); }
  function renderChallengePage() { return window.BlundersChallenge?.renderChallengePage?.() || `<div class="bl-card">Challenge module not loaded.</div>`; }
  function renderLeaderboardPage() { return window.BlundersChallenge?.renderLeaderboardPage?.() || `<div class="bl-card">Leaderboard module not loaded.</div>`; }

  function renderMiniBoardFromFen(fen) {
    const parsed = parseFenBoard(fen);
    if (!parsed) return `<div class="bl-mini"></div>`;
    const squares = displaySquares(false);
    return `
      <div class="bl-mini" aria-hidden="true">
        ${squares.map((sq) => {
          const rc = squareToRC(sq);
          const piece = rc ? parsed.board[rc.r][rc.c] : '';
          const light = !isDarkSquare(sq);
          return `
            <div class="bl-mini-sq ${light ? 'light' : 'dark'}">
              ${piece ? `<img class="bl-mini-piece" draggable="false" alt="${escapeHtml(piece)}" src="${pieceImagePath(piece)}">` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // (Student page implementations moved to game/blunders/student.js)

  // (Student page implementations moved to game/blunders/student.js)

  // Teacher module moved to game/blunders/teacher.js
  function renderTeacherSidebar() { return window.BlundersTeacher?.renderTeacherSidebar?.() || `<aside class="bl-sidebar"><div class="bl-side-title">💥 Blunders</div><div class="bl-side-sub">Teacher mode</div></aside>`; }
  function renderTeacherStudentsPage() { return window.BlundersTeacher?.renderTeacherStudentsPage?.() || `<div class="bl-card">Teacher module not loaded.</div>`; }
  function renderTeacherAllBlundersPage() { return window.BlundersTeacher?.renderTeacherAllBlundersPage?.() || `<div class="bl-card">Teacher module not loaded.</div>`; }
  function renderTeacherMasterGamePage() { return window.BlundersTeacher?.renderTeacherMasterGamePage?.() || `<div class="bl-card">Teacher module not loaded.</div>`; }

  function renderTeacherModeMain() {
    const tab = String(STATE.teacherTab || 'students');
    if (tab === 'allBlunders') return renderTeacherAllBlundersPage();
    if (tab === 'masterGame') return renderTeacherMasterGamePage();
    if (tab === 'settings') return renderSettingsPage();
    return renderTeacherStudentsPage();
  }

  function renderTeacherModePage() {
    return renderTeacherModeMain();
  }

  async function refreshData(opts = {}) {
    if (!STATE.me?.id) return;
    const setStatus = (t) => {
      const statusEl = document.getElementById('blGlobalStatus');
      if (!statusEl) return;
      const txt = String(t || '');
      statusEl.textContent = txt;
      statusEl.style.display = txt ? 'block' : 'none';
    };
    try {
      setStatus('Loading...');
      const data = await fetchMyBlunders(STATE.me.id, opts);
      STATE.data = data;
      STATE.pending = Array.isArray(data?.pending) ? data.pending : [];
      STATE.completed = Array.isArray(data?.completed) ? data.completed : [];
      if (STATE.currentIndex >= STATE.pending.length) STATE.currentIndex = 0;
      setStatus('');
      render();
    } catch (e) {
      setStatus(`Failed: ${e?.message || e}`);
    }
  }

  // Teacher actions moved to game/blunders/teacher.js
  function requireTeacherModule() {
    const mod = window.BlundersTeacher;
    if (mod) return mod;
    try {
      STATE.teacher.error = 'Teacher module not loaded. Please hard refresh (Ctrl+F5) and check that /game/blunders/teacher.js returns 200 in the Network tab.';
      render();
    } catch {}
    console.error('BlundersTeacher missing: teacher actions are disabled. Check /game/blunders/teacher.js load.');
    return null;
  }
  async function teacherLoad(tab) { const m = requireTeacherModule(); return m ? m.teacherLoad?.(tab) : undefined; }
  async function teacherSaveStudentSettings() { const m = requireTeacherModule(); return m ? m.teacherSaveStudentSettings?.() : undefined; }
  async function teacherSaveMasters() { const m = requireTeacherModule(); return m ? m.teacherSaveMasters?.() : undefined; }
  async function teacherSaveMasterConfig() { const m = requireTeacherModule(); return m ? m.teacherSaveMasterConfig?.() : undefined; }
  async function teacherSyncStudent(studentId, hkDayKey, force) { const m = requireTeacherModule(); return m ? m.teacherSyncStudent?.(studentId, hkDayKey, force) : undefined; }
  async function teacherHistoryScanStudent(studentId, historyGames, force) { const m = requireTeacherModule(); return m ? m.teacherHistoryScanStudent?.(studentId, historyGames, force) : undefined; }
  async function teacherSyncMaster(masterId, hkDayKey, force) { const m = requireTeacherModule(); return m ? m.teacherSyncMaster?.(masterId, hkDayKey, force) : undefined; }
  async function teacherBulkSyncSelected(force) { const m = requireTeacherModule(); return m ? m.teacherBulkSyncSelected?.(force) : undefined; }
  async function teacherBulkCompleteSelected() { const m = requireTeacherModule(); return m ? m.teacherBulkCompleteSelected?.() : undefined; }
  async function teacherBulkHistoryScanSelected(force) { const m = requireTeacherModule(); return m ? m.teacherBulkHistoryScanSelected?.(force) : undefined; }

  function setMessage(txt) {
    const el = document.getElementById('blBlunderMsg');
    if (el) el.textContent = String(txt || '');
  }

  function setMasterMessage(txt) {
    const el = document.getElementById('blMasterMsg');
    if (el) el.textContent = String(txt || '');
  }

  async function copyToClipboard(text) {
    const t = String(text || '');
    if (!t) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      return false;
    }
  }

  function clearInlineResult(scope) {
    if (scope === 'master') {
      STATE.uiBoard.masterVerdict = '';
      STATE.uiBoard.masterMoveUci = '';
      STATE.uiBoard.masterMoveSan = '';
      STATE.uiBoard.masterBestMoveUci = '';
      STATE.uiBoard.masterBestMoveSan = '';
      STATE.uiBoard.masterBestOrigin = '';
      STATE.uiBoard.masterFen = '';
    } else if (scope === 'challenge') {
      STATE.uiBoard.challengeVerdict = '';
      STATE.uiBoard.challengeMoveUci = '';
      STATE.uiBoard.challengeMoveSan = '';
      STATE.uiBoard.challengeBestMoveUci = '';
      STATE.uiBoard.challengeBestMoveSan = '';
      STATE.uiBoard.challengeBestOrigin = '';
      STATE.uiBoard.challengeFen = '';
    } else {
      STATE.uiBoard.blunderVerdict = '';
      STATE.uiBoard.blunderMoveUci = '';
      STATE.uiBoard.blunderMoveSan = '';
      STATE.uiBoard.blunderBestMoveUci = '';
      STATE.uiBoard.blunderBestMoveSan = '';
      STATE.uiBoard.blunderBestOrigin = '';
      STATE.uiBoard.blunderFen = '';
    }
  }

  function renderInlineResultPanel(scope) {
    const isMaster = scope === 'master';
    const isChallenge = scope === 'challenge';
    const verdict = String(isMaster ? STATE.uiBoard.masterVerdict : (isChallenge ? STATE.uiBoard.challengeVerdict : STATE.uiBoard.blunderVerdict));
    const moveUci = String(isMaster ? STATE.uiBoard.masterMoveUci : (isChallenge ? STATE.uiBoard.challengeMoveUci : STATE.uiBoard.blunderMoveUci));
    const moveSan = String(isMaster ? STATE.uiBoard.masterMoveSan : (isChallenge ? STATE.uiBoard.challengeMoveSan : STATE.uiBoard.blunderMoveSan));
    const bestUci = String(isMaster ? STATE.uiBoard.masterBestMoveUci : (isChallenge ? STATE.uiBoard.challengeBestMoveUci : STATE.uiBoard.blunderBestMoveUci));
    const bestSan = String(isMaster ? STATE.uiBoard.masterBestMoveSan : (isChallenge ? STATE.uiBoard.challengeBestMoveSan : STATE.uiBoard.blunderBestMoveSan));
    const origin = String(isMaster ? STATE.uiBoard.masterBestOrigin : (isChallenge ? STATE.uiBoard.challengeBestOrigin : STATE.uiBoard.blunderBestOrigin));

    const title =
      verdict === 'best' ? 'Best Move' :
      verdict === 'good' ? 'Good move' :
      verdict === 'blunder' ? 'STILL BLUNDER!!' :
      'Result';

    const sub =
      verdict === 'best' ? 'Perfect. You found the best move.' :
      verdict === 'good' ? 'Correct, but not the best.' :
      verdict === 'blunder' ? 'Try again.' :
      'Your result will appear here.';

    const iconSrc =
      verdict === 'best' ? '/game/Sign/Best_move.jpeg' :
      verdict === 'good' ? '/game/Sign/Good_move.jpeg' :
      verdict === 'blunder' ? '/game/Sign/Blunder_move.jpeg' : '';

    const mvLine = (moveSan || moveUci) ? `Move: ${moveSan || moveUci}` : '';
    const bmLine = (bestSan || bestUci) ? `Best: ${bestSan || bestUci}` : '';

    const canShowBest = verdict === 'good' || verdict === 'blunder' || !verdict;
    const showBestBtn = canShowBest ? `<button class="btn btn-secondary" type="button" data-bl-inline-best="${isMaster ? 'master' : (isChallenge ? 'challenge' : 'blunder')}">Show best move</button>` : '';
    const retryBtn = `<button class="btn btn-primary" type="button" data-bl-inline-retry="${isMaster ? 'master' : 'blunder'}">Retry</button>`;
    const retryScope = isMaster ? 'master' : (isChallenge ? 'challenge' : 'blunder');
    const retryBtn2 = `<button class="btn btn-primary" type="button" data-bl-inline-retry="${retryScope}">Retry</button>`;
    // Next rules:
    // - Master: when best by attempt (same as before)
    // - Blunder: when best by attempt (same as before)
    // - Challenge: when correct (best/good) by attempt (server decides advance), show Next
    const canNext = (origin === 'attempt') && (isChallenge ? (verdict === 'best' || verdict === 'good') : (verdict === 'best'));
    const nextBtn = canNext
      ? `<button class="btn btn-secondary" type="button" data-bl-inline-next="${isMaster ? 'master' : (isChallenge ? 'challenge' : 'blunder')}">${isMaster ? 'Next' : (isChallenge ? 'Next' : (STATE.mode === 'practice' ? 'Next (Random)' : 'Next'))}</button>`
      : '';

    return `
      <div class="bl-card bl-inline-result" style="box-shadow:none; margin-top:12px;">
        <div class="bl-inline-head">
          <span class="bl-inline-ico">
            ${iconSrc ? `<img class="bl-inline-ico-img" src="${escapeHtml(iconSrc)}" alt="${escapeHtml(title)}" draggable="false">` : `<span class="bl-inline-ico-fallback">ℹ️</span>`}
          </span>
          <div>
            <div class="bl-inline-title">${escapeHtml(title)}</div>
            <div class="blunders-muted">${escapeHtml(sub)}</div>
          </div>
        </div>
        <div class="blunders-muted" style="margin-top:10px;">
          ${escapeHtml(mvLine)}${mvLine && bmLine ? '<br>' : ''}${escapeHtml(bmLine)}
        </div>
        <div class="bl-inline-actions">
          ${showBestBtn || nextBtn}
          ${retryBtn2}
        </div>
      </div>
    `;
  }

  function openPromotionPicker(baseUci) {
    STATE.promoPending = { baseUci };
    openModal('Promotion', `
      <div class="blunders-muted">Choose promotion piece:</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
        <button class="btn btn-primary" type="button" data-bl-promo="q">Queen</button>
        <button class="btn btn-secondary" type="button" data-bl-promo="r">Rook</button>
        <button class="btn btn-secondary" type="button" data-bl-promo="b">Bishop</button>
        <button class="btn btn-secondary" type="button" data-bl-promo="n">Knight</button>
      </div>
    `);
  }

  // Result modal removed: use inline result panel instead.

  async function submitMoveUci(uci) {
    const puzzle = currentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    const isPractice = STATE.mode === 'practice';
    try {
      setMessage('');
      const out = await submitAttempt(STATE.me.id, String(puzzle.id || ''), uci, false, isPractice);
      // Always apply the played move on board (even when verdict is blunder).
      STATE.uiBoard.blunderVerdict = String(out?.verdict || (out?.ok ? 'good' : 'blunder'));
      STATE.uiBoard.blunderMoveUci = String(out?.playedUci || uci || '');
      STATE.uiBoard.blunderMoveSan = String(out?.playedSan || '');
      STATE.uiBoard.blunderFen = String(out?.afterFEN || '') || String(puzzle.startFEN || '');
      STATE.uiBoard.blunderBestOrigin = 'attempt';
      // For GOOD/BEST on pending: allow retry (practice) or show best; do not auto-refresh.
      if (!isPractice && (STATE.uiBoard.blunderVerdict === 'good' || STATE.uiBoard.blunderVerdict === 'best')) {
        STATE.lastAttemptWasPendingSolve = true;
      } else {
        STATE.lastAttemptWasPendingSolve = false;
      }
    } catch (e) {
      setMessage(`Error: ${e?.message || e}`);
    } finally {
      STATE.selectedFrom = null;
      STATE.promoPending = null;
      render();
    }
  }

  function handleBoardClick(sq) {
    // After answering, board is frozen until Retry (per UX request)
    if (STATE.uiBoard.blunderVerdict) return;
    const puzzle = currentPuzzle();
    if (!puzzle) return;
    const parsed = parseFenBoard(String(puzzle.startFEN || ''));
    if (!parsed) return;
    const turn = String(parsed.turn || 'w');
    const rc = squareToRC(sq);
    if (!rc) return;
    const piece = parsed.board[rc.r][rc.c];

    if (!STATE.selectedFrom) {
      if (!piece) return;
      const isWhite = piece === piece.toUpperCase();
      if ((turn === 'w' && !isWhite) || (turn === 'b' && isWhite)) return;
      STATE.selectedFrom = sq;
      render();
      return;
    }

    const from = STATE.selectedFrom;
    if (from === sq) {
      STATE.selectedFrom = null;
      render();
      return;
    }

    const fromRc = squareToRC(from);
    const movingPiece = fromRc ? parsed.board[fromRc.r][fromRc.c] : '';
    const movingPawn = movingPiece && movingPiece.toLowerCase() === 'p';
    const toRank = Number(String(sq[1]));
    const promoRank = (turn === 'w') ? 8 : 1;
    const baseUci = `${from}${sq}`.toLowerCase();
    if (movingPawn && toRank === promoRank) {
      // No popups: default promotion to queen.
      submitMoveUci(`${baseUci}q`);
      return;
    }
    submitMoveUci(baseUci);
  }

  function handleMasterBoardClick(sq) {
    // After answering, board is frozen until Retry (per UX request)
    if (STATE.uiBoard.masterVerdict) return;
    const puzzle = masterCurrentPuzzle();
    if (!puzzle) return;
    const parsed = parseFenBoard(String(puzzle.startFEN || ''));
    if (!parsed) return;
    const turn = String(parsed.turn || 'w');
    const rc = squareToRC(sq);
    if (!rc) return;
    const piece = parsed.board[rc.r][rc.c];

    if (!STATE.selectedFrom) {
      if (!piece) return;
      const isWhite = piece === piece.toUpperCase();
      if ((turn === 'w' && !isWhite) || (turn === 'b' && isWhite)) return;
      STATE.selectedFrom = sq;
      render();
      return;
    }

    const from = STATE.selectedFrom;
    if (from === sq) {
      STATE.selectedFrom = null;
      render();
      return;
    }

    const fromRc = squareToRC(from);
    const movingPiece = fromRc ? parsed.board[fromRc.r][fromRc.c] : '';
    const movingPawn = movingPiece && movingPiece.toLowerCase() === 'p';
    const toRank = Number(String(sq[1]));
    const promoRank = (turn === 'w') ? 8 : 1;
    const baseUci = `${from}${sq}`.toLowerCase();
    if (movingPawn && toRank === promoRank) {
      // Promotion picker uses submitMoveUci; for Master Game we just default to queen for now.
      submitMasterMoveUci(`${baseUci}q`);
      return;
    }
    submitMasterMoveUci(baseUci);
  }

  function handleChallengeBoardClick(sq) {
    // After answering, board is frozen until Retry/Next (same UX)
    if (STATE.uiBoard.challengeVerdict) return;
    const puzzle = challengeCurrentPuzzle();
    if (!puzzle) return;
    const parsed = parseFenBoard(String(puzzle.startFEN || ''));
    if (!parsed) return;
    const turn = String(parsed.turn || 'w');
    const rc = squareToRC(sq);
    if (!rc) return;
    const piece = parsed.board[rc.r][rc.c];

    if (!STATE.selectedFrom) {
      if (!piece) return;
      const isWhite = piece === piece.toUpperCase();
      if ((turn === 'w' && !isWhite) || (turn === 'b' && isWhite)) return;
      STATE.selectedFrom = sq;
      render();
      return;
    }

    const from = STATE.selectedFrom;
    if (from === sq) {
      STATE.selectedFrom = null;
      render();
      return;
    }

    const fromRc = squareToRC(from);
    const movingPiece = fromRc ? parsed.board[fromRc.r][fromRc.c] : '';
    const movingPawn = movingPiece && movingPiece.toLowerCase() === 'p';
    const toRank = Number(String(sq[1]));
    const promoRank = (turn === 'w') ? 8 : 1;
    const baseUci = `${from}${sq}`.toLowerCase();
    if (movingPawn && toRank === promoRank) {
      submitChallengeMoveUci(`${baseUci}q`, false);
      return;
    }
    submitChallengeMoveUci(baseUci, false);
  }

  async function revealBestMove() {
    const puzzle = currentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    try {
      const out = await submitAttempt(STATE.me.id, String(puzzle.id || ''), '', true, false);
      const bm = out?.bestMove ? String(out.bestMove) : '';
      const engErr = out?.engineError ? String(out.engineError) : '';
      const af = out?.afterFEN ? String(out.afterFEN) : '';
      STATE.uiBoard.blunderBestMoveUci = bm;
      STATE.uiBoard.blunderBestMoveSan = out?.bestSan ? String(out.bestSan) : '';
      if (bm && af) {
        STATE.uiBoard.blunderFen = af;
        STATE.uiBoard.blunderMoveUci = bm;
        STATE.uiBoard.blunderMoveSan = STATE.uiBoard.blunderBestMoveSan;
      }
      STATE.uiBoard.blunderVerdict = bm ? 'best' : '';
      STATE.uiBoard.blunderBestOrigin = 'revealed';
      if (!bm) setMessage(engErr ? `Best move not available (${engErr})` : 'Best move not available yet.');
    } catch (e) {
      setMessage(`Error: ${e?.message || e}`);
    } finally {
      STATE.selectedFrom = null;
      render();
    }
  }

  function masterCurrentPuzzle() {
    const list = Array.isArray(STATE.master.pending) ? STATE.master.pending : [];
    if (!list.length) return null;
    const idx = Math.max(0, Math.min(list.length - 1, Number(STATE.master.currentIndex) || 0));
    return list[idx] || null;
  }

  async function submitMasterMoveUci(uci) {
    const puzzle = masterCurrentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    try {
      setMasterMessage('');
      const out = await submitMasterAttempt(STATE.me.id, String(puzzle.id || ''), uci, false, false);
      STATE.uiBoard.masterVerdict = String(out?.verdict || (out?.ok ? 'good' : 'blunder'));
      STATE.uiBoard.masterMoveUci = String(out?.playedUci || uci || '');
      STATE.uiBoard.masterMoveSan = String(out?.playedSan || '');
      STATE.uiBoard.masterFen = String(out?.afterFEN || '') || String(puzzle.startFEN || '');
      STATE.uiBoard.masterBestOrigin = 'attempt';
    } catch (e) {
      setMasterMessage(`Error: ${e?.message || e}`);
    } finally {
      STATE.selectedFrom = null;
      STATE.promoPending = null;
      render();
    }
  }

  async function revealMasterBestMove() {
    const puzzle = masterCurrentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    try {
      const out = await submitMasterAttempt(STATE.me.id, String(puzzle.id || ''), '', true, false);
      const bm = out?.bestMove ? String(out.bestMove) : '';
      const engErr = out?.engineError ? String(out.engineError) : '';
      const af = out?.afterFEN ? String(out.afterFEN) : '';
      STATE.uiBoard.masterBestMoveUci = bm;
      STATE.uiBoard.masterBestMoveSan = out?.bestSan ? String(out.bestSan) : '';
      if (bm && af) {
        STATE.uiBoard.masterFen = af;
        STATE.uiBoard.masterMoveUci = bm;
        STATE.uiBoard.masterMoveSan = STATE.uiBoard.masterBestMoveSan;
      }
      STATE.uiBoard.masterVerdict = bm ? 'best' : '';
      STATE.uiBoard.masterBestOrigin = 'revealed';
      if (!bm && engErr) setMasterMessage(`Best move not available (${engErr})`);
    } catch (e) {
      setMasterMessage(`Error: ${e?.message || e}`);
    } finally {
      STATE.selectedFrom = null;
      render();
    }
  }

  // Challenge actions moved to game/blunders/challenge.js
  async function challengeLoadLeaderboard() { return window.BlundersChallenge?.challengeLoadLeaderboard?.(); }
  async function challengeStartOrRestart() { return window.BlundersChallenge?.challengeStartOrRestart?.(); }
  async function submitChallengeMoveUci(uci, revealBest) { return window.BlundersChallenge?.submitChallengeMoveUci?.(uci, revealBest); }

  function render() {
    const root = document.getElementById('blundersRoot');
    if (!root) return;
    captureFocusInfo(root);
    const role = getBlundersRole();
    if (role === 'teacher') {
      root.innerHTML = `
        <div class="bl-app">
          ${renderTeacherSidebar()}
          <main class="bl-main">
            <div class="bl-container">
              <div id="blGlobalStatus" class="bl-global-status blunders-muted"></div>
              ${renderTeacherModePage()}
            </div>
          </main>
          ${STATE.ui.modalOpen ? STATE.ui.modalHtml : ''}
        </div>
      `;
      restoreFocusInfo(root);
      return;
    }
    const content =
      STATE.page === 'home' ? renderHomePage() :
      STATE.page === 'blunder' ? renderBlunderPage() :
      STATE.page === 'masterGame' ? renderStudentMasterGamePage() :
      STATE.page === 'review' ? renderReviewPage() :
      STATE.page === 'challenge' ? renderChallengePage() :
      STATE.page === 'leaderboard' ? renderLeaderboardPage() :
      renderSettingsPage();

    root.innerHTML = `
      <div class="bl-app">
        ${renderSidebar()}
        <main class="bl-main">
          <div class="bl-container">
            <div id="blGlobalStatus" class="bl-global-status blunders-muted"></div>
            ${content}
          </div>
        </main>
        ${STATE.ui.modalOpen ? STATE.ui.modalHtml : ''}
      </div>
    `;
    restoreFocusInfo(root);
  }

  // Entry API for external modules (teacher/challenge) to reuse shared UI + trigger renders.
  window.BlundersEntryApi.render = render;
  window.BlundersEntryApi.openModal = openModal;
  window.BlundersEntryApi.closeModal = closeModal;
  window.BlundersEntryApi.setPage = setPage;
  window.BlundersEntryApi.setBlunderModePending = setBlunderModePending;
  window.BlundersEntryApi.setBlunderModePractice = setBlunderModePractice;
  window.BlundersEntryApi.renderMiniBoardFromFen = renderMiniBoardFromFen;
  window.BlundersEntryApi.renderBoardForPuzzle = renderBoardForPuzzle;
  window.BlundersEntryApi.renderInlineResultPanel = renderInlineResultPanel;
  window.BlundersEntryApi.clearInlineResult = clearInlineResult;

  function initBlunders() {
    const root = document.getElementById('blundersRoot');
    if (!root) return;

    applyBoardColors();

    const role = getBlundersRole();
    if (role === 'teacher') {
      STATE.me = { id: 'teacher', name: 'Teacher', studentId: '' };
      render();
      if (!window.BlundersTeacher) {
        STATE.teacher.error = 'Teacher module not loaded. Please hard refresh (Ctrl+F5) and ensure /game/blunders/teacher.js loads successfully.';
        render();
        console.error('BlundersTeacher missing during initBlunders (teacher mode).');
        return;
      }
      teacherLoad(STATE.teacherTab || 'students').catch(() => {});
    } else {
      const players = getPlayers();
      STATE.me = players[0] || null;
      if (!STATE.me || !STATE.me.id) {
        root.innerHTML = `<div class="bl-card"><div class="bl-title">Blunders</div><div class="blunders-muted">Missing student identity.</div></div>`;
        return;
      }
      render();
      refreshData();
    }

    root.addEventListener('click', async (ev) => {
      const t = ev.target;

      // Copy FEN
      const cf = t?.closest?.('[data-bl-copy-fen]');
      if (cf) {
        const scope = String(cf.getAttribute('data-bl-copy-fen') || '');
        const pz = scope === 'master' ? masterCurrentPuzzle() : currentPuzzle();
        const fen = String(pz?.startFEN || '');
        const ok = await copyToClipboard(fen);
        if (scope === 'master') setMasterMessage(ok ? 'Copied.' : 'Copy failed.');
        else setMessage(ok ? 'Copied.' : 'Copy failed.');
        return;
      }

      // Teacher job modal actions
      if (t?.closest?.('[data-bl-teacher-job-close]')) {
        try { window.BlundersTeacher?.teacherJobClose?.(); } catch { closeModal(); }
        return;
      }
      if (t?.closest?.('[data-bl-teacher-job-refresh]')) {
        try { await window.BlundersTeacher?.teacherJobRefresh?.(); } catch (e) { console.error('Job refresh failed:', e); }
        return;
      }
      if (t?.closest?.('[data-bl-teacher-job-cancel]')) {
        try { await window.BlundersTeacher?.teacherJobCancel?.(); } catch (e) { console.error('Job cancel failed:', e); }
        return;
      }

      // Teacher sidebar tabs
      const tt = t?.closest?.('[data-bl-teacher-tab]');
      if (tt) {
        STATE.teacherTab = String(tt.getAttribute('data-bl-teacher-tab') || 'students');
        render();
        teacherLoad(STATE.teacherTab).catch(() => {});
        return;
      }

      // Teacher actions
      if (t?.closest?.('[data-bl-teacher-refresh-students]')) return teacherLoad('students');
      if (t?.closest?.('[data-bl-teacher-refresh-masters]')) return teacherLoad('masterGame');
      if (t?.closest?.('[data-bl-teacher-refresh-all]')) return teacherLoad('allBlunders');
      const durBtn = t?.closest?.('[data-bl-teacher-all-duration]');
      if (durBtn) {
        STATE.teacher.allDuration = String(durBtn.getAttribute('data-bl-teacher-all-duration') || 'all');
        render();
        return teacherLoad('allBlunders');
      }
      if (t?.closest?.('[data-bl-teacher-sync-selected]')) return teacherBulkSyncSelected(false);
      if (t?.closest?.('[data-bl-teacher-force-selected]')) return teacherBulkSyncSelected(true);
      if (t?.closest?.('[data-bl-teacher-complete-selected]')) return teacherBulkCompleteSelected();
      if (t?.closest?.('[data-bl-teacher-history-selected]')) return teacherBulkHistoryScanSelected(false);
      if (t?.closest?.('[data-bl-teacher-history-force-selected]')) return teacherBulkHistoryScanSelected(true);
      if (t?.closest?.('[data-bl-teacher-apply-max-selected]')) {
        const v = Number(STATE.teacher.bulkMaxGames || 10) || 10;
        const selected = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
        if (!selected.size) {
          STATE.teacher.error = 'Please select at least one student.';
          render();
          return;
        }
        for (const sid of Array.from(selected)) {
          if (!sid) continue;
          if (!STATE.teacher.edits.student[sid]) STATE.teacher.edits.student[sid] = {};
          STATE.teacher.edits.student[sid].maxGamesPerDay = v;
        }
        STATE.teacher.error = '';
        render();
        return;
      }
      if (t?.closest?.('[data-bl-teacher-apply-thr-selected]')) {
        const v = Number(STATE.teacher.bulkThreshold || 1.0) || 1.0;
        const selected = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
        if (!selected.size) {
          STATE.teacher.error = 'Please select at least one student.';
          render();
          return;
        }
        for (const sid of Array.from(selected)) {
          if (!sid) continue;
          if (!STATE.teacher.edits.student[sid]) STATE.teacher.edits.student[sid] = {};
          STATE.teacher.edits.student[sid].thresholdPoints = v;
        }
        STATE.teacher.error = '';
        render();
        return;
      }
      if (t?.closest?.('[data-bl-teacher-save-students]')) {
        try { await teacherSaveStudentSettings(); STATE.teacher.error = ''; } catch (e) { STATE.teacher.error = String(e?.message || e); }
        return teacherLoad('students');
      }
      if (t?.closest?.('[data-bl-teacher-save-masters]')) {
        try { await teacherSaveMasters(); STATE.teacher.error = ''; } catch (e) { STATE.teacher.error = String(e?.message || e); }
        return teacherLoad('masterGame');
      }
      if (t?.closest?.('[data-bl-teacher-save-mastercfg]')) {
        try { await teacherSaveMasterConfig(); STATE.teacher.error = ''; } catch (e) { STATE.teacher.error = String(e?.message || e); }
        return teacherLoad('masterGame');
      }
      if (t?.closest?.('[data-bl-teacher-masters-presets]')) {
        STATE.teacher.edits.masters = [
          { id: 'magnuscarlsen', name: 'MagnusCarlsen', username: 'MagnusCarlsen' },
          { id: 'hikaru', name: 'Hikaru', username: 'Hikaru' },
          { id: 'fabianocaruana', name: 'fabianocaruana', username: 'fabianocaruana' }
        ];
        render();
        return;
      }
      if (t?.closest?.('[data-bl-teacher-masters-add]')) {
        const cur = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters.slice() : [];
        cur.push({ id: '', name: '', username: '' });
        STATE.teacher.edits.masters = cur;
        render();
        return;
      }
      const delM = t?.closest?.('[data-bl-teacher-master-del]');
      if (delM) {
        const idx = Number(delM.getAttribute('data-bl-teacher-master-del'));
        const cur = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters.slice() : [];
        if (!Number.isNaN(idx) && idx >= 0 && idx < cur.length) cur.splice(idx, 1);
        STATE.teacher.edits.masters = cur;
        render();
        return;
      }
      const syncStu = t?.closest?.('[data-bl-teacher-sync-student]');
      if (syncStu) {
        const sid = String(syncStu.getAttribute('data-bl-teacher-sync-student') || '');
        const hkDayKey = String(STATE.teacher?.dateByStudent?.[sid] || '') || todayYmdLocal();
        try {
          await teacherSyncStudent(sid, hkDayKey, false);
        return teacherLoad('students');
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher sync failed:', e);
          render();
          return;
        }
      }
      const syncStuF = t?.closest?.('[data-bl-teacher-sync-student-force]');
      if (syncStuF) {
        const sid = String(syncStuF.getAttribute('data-bl-teacher-sync-student-force') || '');
        const hkDayKey = String(STATE.teacher?.dateByStudent?.[sid] || '') || todayYmdLocal();
        try {
          await teacherSyncStudent(sid, hkDayKey, true);
        return teacherLoad('students');
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher force sync failed:', e);
          render();
          return;
        }
      }
      const hs = t?.closest?.('[data-bl-teacher-history-scan]');
      if (hs) {
        const sid = String(hs.getAttribute('data-bl-teacher-history-scan') || '');
        const sel = root.querySelector(`[data-bl-teacher-history-n="${CSS.escape(sid)}"]`);
        const n = Number(sel?.value || 0) || Number(STATE.teacher?.historyScanN?.[sid] || 0) || 200;
        try {
          await teacherHistoryScanStudent(sid, n, false);
          // History is async job now; keep message and do NOT immediately reload counts.
          render();
          return;
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher history scan failed:', e);
          render();
          return;
        }
      }
      const hsF = t?.closest?.('[data-bl-teacher-history-scan-force]');
      if (hsF) {
        const sid = String(hsF.getAttribute('data-bl-teacher-history-scan-force') || '');
        const sel = root.querySelector(`[data-bl-teacher-history-n="${CSS.escape(sid)}"]`);
        const n = Number(sel?.value || 0) || Number(STATE.teacher?.historyScanN?.[sid] || 0) || 200;
        try {
          await teacherHistoryScanStudent(sid, n, true);
          render();
          return;
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher history force scan failed:', e);
          render();
          return;
        }
      }
      const syncM = t?.closest?.('[data-bl-teacher-sync-master]');
      if (syncM) {
        const mid = String(syncM.getAttribute('data-bl-teacher-sync-master') || '');
        const hkDayKey = String(STATE.teacher?.dateByMaster?.[mid] || '') || todayYmdLocal();
        try {
          await teacherSyncMaster(mid, hkDayKey, false);
        return teacherLoad('masterGame');
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher master sync failed:', e);
          render();
          return;
        }
      }
      const syncMF = t?.closest?.('[data-bl-teacher-sync-master-force]');
      if (syncMF) {
        const mid = String(syncMF.getAttribute('data-bl-teacher-sync-master-force') || '');
        const hkDayKey = String(STATE.teacher?.dateByMaster?.[mid] || '') || todayYmdLocal();
        try {
          await teacherSyncMaster(mid, hkDayKey, true);
        return teacherLoad('masterGame');
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher master force sync failed:', e);
          render();
          return;
        }
      }

      const nav = t?.closest?.('[data-bl-nav]');
      if (nav) {
        const key = String(nav.getAttribute('data-bl-nav') || '');
        if (key) {
          setPage(key);
          if (key === 'masterGame') {
            ensureMasterGameLoaded().catch(() => {});
          }
          if (key === 'leaderboard') {
            challengeLoadLeaderboard().catch(() => {});
          }
        }
        return;
      }

      const selAll = t?.closest?.('[data-bl-teacher-select-all]');
      if (selAll) {
        const checked = !!selAll.checked;
        const q = String(STATE.teacher.search || '').trim().toLowerCase();
        const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
        const rows = !q ? allRows : allRows.filter((s) => {
          const name = String(s?.name || '').toLowerCase();
          const sid2 = String(s?.studentId || '').toLowerCase();
          const chessId = String(s?.chessComUsername || '').toLowerCase();
          return name.includes(q) || sid2.includes(q) || chessId.includes(q);
        });
        const cur = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
        if (checked) {
          for (const s of rows) cur.add(String(s?.id || ''));
        } else {
          for (const s of rows) cur.delete(String(s?.id || ''));
        }
        STATE.teacher.selectedIds = Array.from(cur).filter(Boolean);
        render();
        return;
      }
      const selOne = t?.closest?.('[data-bl-teacher-select]');
      if (selOne) {
        const sid = String(selOne.getAttribute('data-bl-teacher-select') || '');
        const checked = !!selOne.checked;
        const cur = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
        if (checked) cur.add(sid);
        else cur.delete(sid);
        STATE.teacher.selectedIds = Array.from(cur).filter(Boolean);
        render();
        return;
      }

      const setTab = t?.closest?.('[data-bl-settings-tab]');
      if (setTab) {
        STATE.settingsTab = String(setTab.getAttribute('data-bl-settings-tab') || 'board');
        render();
        return;
      }

      if (t?.closest?.('#blBoardResetBtn')) {
        setBoardColors({ light: VCP_DEFAULTS.boardLight, dark: VCP_DEFAULTS.boardDark });
        render();
        return;
      }

      if (t?.closest?.('[data-bl-refresh]')) return refreshData();
      if (t?.closest?.('[data-bl-force]')) return refreshData({ force: true });
      if (t?.closest?.('[data-bl-page-reload]')) {
        try { window.location.reload(); } catch { window.location.href = window.location.href; }
        return;
      }
      if (t?.closest?.('[data-bl-go-blunder]')) { setBlunderModePending(); return setPage('blunder'); }
      if (t?.closest?.('[data-bl-go-review]')) {
        const ts = Number(STATE.ui?.lastBlunderUiActionTs || 0);
        if (STATE.page === 'blunder' && ts && (Date.now() - ts) < 900) return;
        return setPage('review');
      }
      if (t?.closest?.('[data-bl-home-practice-open]')) {
        openHomePracticeModal();
        return;
      }
      const hpd = t?.closest?.('[data-bl-home-practice-duration]');
      if (hpd) {
        STATE.ui.homePracticeDuration = String(hpd.getAttribute('data-bl-home-practice-duration') || 'all');
        openHomePracticeModal();
        return;
      }
      const hps = t?.closest?.('[data-bl-home-practice-start]');
      if (hps) {
        const key = String(hps.getAttribute('data-bl-home-practice-start') || 'random');
        startPracticeFromHome(key);
        return;
      }

      const cd = t?.closest?.('[data-bl-challenge-diff]');
      if (cd) {
        STATE.challenge.difficulty = String(cd.getAttribute('data-bl-challenge-diff') || 'easy');
        render();
        return;
      }
      if (t?.closest?.('[data-bl-challenge-start]')) {
        clearChallengeUi();
        challengeStartOrRestart().catch(() => {});
        return;
      }
      if (t?.closest?.('[data-bl-challenge-refresh]')) {
        render();
        return;
      }
      if (t?.closest?.('[data-bl-lb-refresh]')) {
        challengeLoadLeaderboard().catch(() => {});
        return;
      }

      const rp = t?.closest?.('[data-bl-review-practice]');
      if (rp) {
        const key = String(rp.getAttribute('data-bl-review-practice') || '');
        const all = getReviewPuzzlesFiltered();
        if (!all.length) return;

        let pool = [];
        if (key === 'random') {
          // Random = pick from the requested 4 drop buckets (exclude miss-mate, since it's its own category)
          pool = all.filter(p => bucketKeyOfPuzzle(p) !== 'missMate');
        } else {
          pool = all.filter(p => bucketKeyOfPuzzle(p) === key);
        }
        if (!pool.length) return;

        STATE.practiceKey = key || 'random';
        const pick = pool[Math.floor(Math.random() * pool.length)];
        setBlunderModePractice(pick);
        clearInlineResult('blunder');
        setPage('blunder');
        return;
      }

      const rd = t?.closest?.('[data-bl-review-duration]');
      if (rd) {
        STATE.reviewDuration = String(rd.getAttribute('data-bl-review-duration') || 'all');
        render();
        return;
      }

      if (t?.closest?.('[data-bl-prev]')) {
        STATE.currentIndex = Math.max(0, STATE.currentIndex - 1);
        STATE.selectedFrom = null;
        clearInlineResult('blunder');
        render();
        return;
      }
      if (t?.closest?.('[data-bl-next]')) {
        STATE.currentIndex = Math.min((STATE.pending.length - 1), STATE.currentIndex + 1);
        STATE.selectedFrom = null;
        clearInlineResult('blunder');
        render();
        return;
      }
      if (t?.closest?.('[data-bl-back-review]')) {
        // On some mobile browsers, DOM updates after "Show best move" can cause a ghost click to land here.
        // Guard against accidental navigation.
        const ts1 = Number(STATE.ui?.lastInlineBestClickTs || 0);
        const ts2 = Number(STATE.ui?.lastBlunderUiActionTs || 0);
        if ((ts1 && (Date.now() - ts1) < 900) || (ts2 && (Date.now() - ts2) < 900)) return;
        setPage('review');
        return;
      }

      // Reveal buttons removed (use "Show best move" in the Result panel instead).

      const inlineBest = t?.closest?.('[data-bl-inline-best]');
      if (inlineBest) {
        STATE.ui.lastInlineBestClickTs = Date.now();
        STATE.ui.lastBlunderUiActionTs = Date.now();
        ev.preventDefault?.();
        ev.stopPropagation?.();
        const scope = String(inlineBest.getAttribute('data-bl-inline-best') || '');
        if (scope === 'master') revealMasterBestMove();
        else if (scope === 'challenge') submitChallengeMoveUci('', true);
        else revealBestMove();
        return;
      }
      const inlineNext = t?.closest?.('[data-bl-inline-next]');
      if (inlineNext) {
        STATE.ui.lastBlunderUiActionTs = Date.now();
        const scope = String(inlineNext.getAttribute('data-bl-inline-next') || '');
        if (scope === 'master') {
          const mid = String(STATE.master.selectedMasterId || '');
          // after solving/revealing, refresh list so completed moves out, then keep current index to show next.
          clearInlineResult('master');
          STATE.selectedFrom = null;
          await ensureMasterPuzzlesLoaded(mid);
          return;
        }
        if (scope === 'challenge') {
          // Advance to next puzzle prepared by server after a correct answer.
          const np = STATE.challenge?.nextPuzzle || null;
          clearInlineResult('challenge');
          STATE.selectedFrom = null;
          STATE.challenge.nextPuzzle = null;
          if (np && !STATE.challenge?.done) {
            STATE.challenge.puzzle = np;
            STATE.uiBoard.challengeFen = String(np.startFEN || '');
            render();
            return;
          }
          // If done (or no next), just re-render.
          render();
          return;
        }
        // blunder
        clearInlineResult('blunder');
        STATE.selectedFrom = null;
        if (STATE.mode === 'practice') {
          const key = String(STATE.practiceKey || 'random');
          const all = getReviewPuzzlesFiltered();
          let pool = [];
          if (key === 'missMate') pool = all.filter(p => bucketKeyOfPuzzle(p) === 'missMate');
          else if (key === 'random') pool = all.filter(p => bucketKeyOfPuzzle(p) !== 'missMate');
          else pool = all.filter(p => bucketKeyOfPuzzle(p) === key);

          // Fallbacks
          if (!pool.length) pool = all.slice();
          if (!pool.length) { render(); return; }

          const curId = String(STATE.practicePuzzle?.id || '');
          if (curId && pool.length > 1) {
            const filtered = pool.filter(p => String(p?.id || '') !== curId);
            if (filtered.length) pool = filtered;
          }

          const pick = pool[Math.floor(Math.random() * pool.length)];
          setBlunderModePractice(pick);
          setPage('blunder');
          return;
        }
        // pending: refresh list so solved puzzle disappears, then stay at same index (now points to next)
        await refreshData();
        setBlunderModePending();
        setPage('blunder');
        return;
      }
      const inlineRetry = t?.closest?.('[data-bl-inline-retry]');
      if (inlineRetry) {
        STATE.ui.lastBlunderUiActionTs = Date.now();
        ev.preventDefault?.();
        ev.stopPropagation?.();
        const scope = String(inlineRetry.getAttribute('data-bl-inline-retry') || '');
        if (scope === 'master') {
          const pz = masterCurrentPuzzle();
          if (pz) {
            STATE.uiBoard.masterFen = String(pz.startFEN || '');
          }
          STATE.uiBoard.masterMoveUci = '';
          STATE.uiBoard.masterVerdict = '';
          STATE.uiBoard.masterBestMoveUci = '';
          STATE.selectedFrom = null;
          render();
          return;
        }
        if (scope === 'challenge') {
          const pz = challengeCurrentPuzzle();
          if (pz) STATE.uiBoard.challengeFen = String(pz.startFEN || '');
          STATE.uiBoard.challengeMoveUci = '';
          STATE.uiBoard.challengeVerdict = '';
          STATE.uiBoard.challengeBestMoveUci = '';
          STATE.selectedFrom = null;
          render();
          return;
        }
        const pz = currentPuzzle();
        // If the last attempt solved a pending puzzle (good/best), retry should be practice (non-destructive).
        if (STATE.lastAttemptWasPendingSolve && STATE.mode !== 'practice') {
          if (pz) setBlunderModePractice(pz);
        }
        if (pz) {
          STATE.uiBoard.blunderFen = String(pz.startFEN || '');
        }
        STATE.uiBoard.blunderMoveUci = '';
        STATE.uiBoard.blunderVerdict = '';
        STATE.uiBoard.blunderBestMoveUci = '';
        STATE.selectedFrom = null;
        render();
        return;
      }
      if (t?.closest?.('[data-bl-master-prev]')) {
        STATE.master.currentIndex = Math.max(0, Number(STATE.master.currentIndex || 0) - 1);
        STATE.selectedFrom = null;
        clearInlineResult('master');
        render();
        return;
      }
      if (t?.closest?.('[data-bl-master-next]')) {
        const max = Math.max(0, (Array.isArray(STATE.master.pending) ? STATE.master.pending.length : 0) - 1);
        STATE.master.currentIndex = Math.min(max, Number(STATE.master.currentIndex || 0) + 1);
        STATE.selectedFrom = null;
        clearInlineResult('master');
        render();
        return;
      }
      const mb = t?.closest?.('[data-bl-master]');
      if (mb) {
        const mid = String(mb.getAttribute('data-bl-master') || '');
        ensureMasterPuzzlesLoaded(mid).catch(() => {});
        return;
      }

      const sqEl = t?.closest?.('[data-bl-sq]');
      if (sqEl && STATE.page === 'blunder') {
        STATE.ui.lastBlunderUiActionTs = Date.now();
        const sq = String(sqEl.getAttribute('data-bl-sq') || '');
        handleBoardClick(sq);
        return;
      }
      if (sqEl && STATE.page === 'challenge') {
        STATE.ui.lastBlunderUiActionTs = Date.now();
        const sq = String(sqEl.getAttribute('data-bl-sq') || '');
        handleChallengeBoardClick(sq);
        return;
      }
      if (sqEl && STATE.page === 'masterGame') {
        const sq = String(sqEl.getAttribute('data-bl-sq') || '');
        handleMasterBoardClick(sq);
        return;
      }

      const open = t?.closest?.('[data-bl-open]');
      if (open) {
        const id = String(open.getAttribute('data-bl-open') || '');
        const all = [
          ...(Array.isArray(STATE.pending) ? STATE.pending : []),
          ...(Array.isArray(STATE.completed) ? STATE.completed : [])
        ];
        const pz = all.find(x => String(x?.id || '') === id) || null;
        if (!pz) return;
        openModal('Review', `
          <div class="blunders-muted" style="margin-bottom:10px;">${escapeHtml(String(pz.blunderSan || pz.blunderMoveUci || ''))}</div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            ${renderMiniBoardFromFen(String(pz.startFEN || ''))}
            <div style="min-width:220px;">
              <div class="blunders-muted">Drop: <strong>${escapeHtml(Number(pz.dropPoints ?? (Number(pz.dropCp || 0) / 100)).toFixed(2))}</strong></div>
              <div class="blunders-muted" style="margin-top:6px;">Status: <strong>${escapeHtml(String(pz.status || 'pending'))}</strong></div>
              <div class="blunders-muted" style="margin-top:6px;">Time: <strong>${escapeHtml(fmtTs(pz.completedAt || pz.createdAt))}</strong></div>
              ${pz.gameUrl ? `<div class="blunders-muted" style="margin-top:6px;">Source: <a href="${escapeHtml(String(pz.gameUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(pz.gameUrl))}</a></div>` : ''}
              <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                <button class="btn btn-primary" type="button" data-bl-practice="${escapeHtml(String(pz.id || ''))}">Practice</button>
              </div>
            </div>
          </div>
        `);
        return;
      }

      const practiceBtn = t?.closest?.('[data-bl-practice]');
      if (practiceBtn) {
        const id = String(practiceBtn.getAttribute('data-bl-practice') || '');
        const all = [
          ...(Array.isArray(STATE.pending) ? STATE.pending : []),
          ...(Array.isArray(STATE.completed) ? STATE.completed : [])
        ];
        const pz = all.find(x => String(x?.id || '') === id) || null;
        if (!pz) return;
        closeModal();
        STATE.practiceKey = bucketKeyOfPuzzle(pz) || 'random';
        setBlunderModePractice(pz);
        setPage('blunder');
        return;
      }

      if (t?.closest?.('[data-bl-random]')) {
        const all = [
          ...(Array.isArray(STATE.pending) ? STATE.pending : []),
          ...(Array.isArray(STATE.completed) ? STATE.completed : [])
        ];
        if (!all.length) return;
        STATE.practiceKey = 'random';
        const pick = all[Math.floor(Math.random() * all.length)];
        setBlunderModePractice(pick);
        setPage('blunder');
        return;
      }
    });

    root.addEventListener('input', (ev) => {
      const t = ev.target;
      if (!t) return;
      if (t.id === 'blBoardLightInput' || t.id === 'blBoardDarkInput') {
        const lightEl = document.getElementById('blBoardLightInput');
        const darkEl = document.getElementById('blBoardDarkInput');
        const light = String(lightEl?.value || '').trim() || VCP_DEFAULTS.boardLight;
        const dark = String(darkEl?.value || '').trim() || VCP_DEFAULTS.boardDark;
        setBoardColors({ light, dark });
        // Re-render to refresh preview + input values
        render();
      }
    });

    root.addEventListener('input', (ev) => {
      const el = ev.target;
      // Teacher inputs
      const sEl = el?.closest?.('[data-bl-teacher-search]');
      if (sEl) {
        STATE.teacher.search = String(sEl.value || '');
        render();
        return;
      }
      const sd = el?.closest?.('[data-bl-teacher-student-date]');
      if (sd) {
        const sid = String(sd.getAttribute('data-bl-teacher-student-date') || '');
        const v = String(sd.value || '').trim();
        if (sid) {
          if (!STATE.teacher.dateByStudent || typeof STATE.teacher.dateByStudent !== 'object') STATE.teacher.dateByStudent = {};
          STATE.teacher.dateByStudent[sid] = v;
        }
        return;
      }
      const md = el?.closest?.('[data-bl-teacher-master-date]');
      if (md) {
        const mid = String(md.getAttribute('data-bl-teacher-master-date') || '');
        const v = String(md.value || '').trim();
        if (mid) {
          if (!STATE.teacher.dateByMaster || typeof STATE.teacher.dateByMaster !== 'object') STATE.teacher.dateByMaster = {};
          STATE.teacher.dateByMaster[mid] = v;
        }
        return;
      }
      const ar = el?.closest?.('[data-bl-teacher-all-rating]');
      if (ar) {
        STATE.teacher.allRating = String(ar.value || 'any');
        render();
        teacherLoad('allBlunders').catch(() => {});
        return;
      }
      const bm = el?.closest?.('[data-bl-teacher-bulk-max]');
      if (bm) {
        STATE.teacher.bulkMaxGames = Number(bm.value);
        return;
      }
      const bt = el?.closest?.('[data-bl-teacher-bulk-thr]');
      if (bt) {
        STATE.teacher.bulkThreshold = Number(bt.value);
        return;
      }
      const bh = el?.closest?.('[data-bl-teacher-bulk-history]');
      if (bh) {
        STATE.teacher.bulkHistoryGames = Math.max(1, Math.min(500, Number(bh.value || 0) || 200));
        return;
      }
      const maxEl = el?.closest?.('[data-bl-teacher-student-max]');
      if (maxEl) {
        const sid = String(maxEl.getAttribute('data-bl-teacher-student-max') || '');
        const v = Number(maxEl.value);
        if (!STATE.teacher.edits.student[sid]) STATE.teacher.edits.student[sid] = {};
        STATE.teacher.edits.student[sid].maxGamesPerDay = Number.isFinite(v) ? v : 10;
        return;
      }
      const thrEl = el?.closest?.('[data-bl-teacher-student-thr]');
      if (thrEl) {
        const sid = String(thrEl.getAttribute('data-bl-teacher-student-thr') || '');
        const v = Number(thrEl.value);
        if (!STATE.teacher.edits.student[sid]) STATE.teacher.edits.student[sid] = {};
        STATE.teacher.edits.student[sid].thresholdPoints = Number.isFinite(v) ? v : 1.0;
        return;
      }
      const hn = el?.closest?.('[data-bl-teacher-history-n]');
      if (hn) {
        const sid = String(hn.getAttribute('data-bl-teacher-history-n') || '');
        const v = Math.max(1, Math.min(500, Number(hn.value || 0) || 200));
        if (!STATE.teacher.historyScanN || typeof STATE.teacher.historyScanN !== 'object') STATE.teacher.historyScanN = {};
        STATE.teacher.historyScanN[sid] = v;
        return;
      }
      const mn = el?.closest?.('[data-bl-teacher-master-name]');
      if (mn) {
        const idx = Number(mn.getAttribute('data-bl-teacher-master-name'));
        const cur = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters : [];
        if (!Number.isNaN(idx) && cur[idx]) cur[idx].name = String(mn.value || '');
        return;
      }
      const mu = el?.closest?.('[data-bl-teacher-master-user]');
      if (mu) {
        const idx = Number(mu.getAttribute('data-bl-teacher-master-user'));
        const cur = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters : [];
        if (!Number.isNaN(idx) && cur[idx]) cur[idx].username = String(mu.value || '');
        return;
      }
      const mm = el?.closest?.('[data-bl-teacher-mastercfg-max]');
      if (mm) {
        const v = Number(mm.value);
        if (!STATE.teacher.edits.masterCfg) STATE.teacher.edits.masterCfg = {};
        STATE.teacher.edits.masterCfg.maxGamesPerDay = Number.isFinite(v) ? v : 10;
        return;
      }
      const mt = el?.closest?.('[data-bl-teacher-mastercfg-thr]');
      if (mt) {
        const v = Number(mt.value);
        if (!STATE.teacher.edits.masterCfg) STATE.teacher.edits.masterCfg = {};
        STATE.teacher.edits.masterCfg.thresholdPoints = Number.isFinite(v) ? v : 1.0;
        return;
      }

      // Student settings inputs
      if (el?.closest?.('#blBoardLightInput') || el?.closest?.('#blBoardDarkInput')) {
        const light = document.getElementById('blBoardLightInput')?.value;
        const dark = document.getElementById('blBoardDarkInput')?.value;
        setBoardColors({ light, dark });
        render();
      }
    });
  }

  window.initBlunders = initBlunders;
})();


