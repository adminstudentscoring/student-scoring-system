(function () {
  const C = window.BlundersCore;
  if (!C) {
    console.error('BlundersCore missing. Ensure /application/blunders/core.js is loaded before /application/blunders/blunders.js');
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
    const prevMid = String(STATE.master.selectedMasterId || '').trim();
    STATE.master.loading = true;
    STATE.master.error = '';
    STATE.master.selectedMasterId = mid;
    if (prevMid && prevMid !== mid) {
      STATE.master.selectedPuzzleId = '';
    }
    render();
    try {
      // New: bucketed master puzzles (like Review / Teacher All blunders).
      const data = await window.BlundersCore.fetchMasterPuzzlesSummary(STATE.me.id, mid);
      const ui = (STATE.master.ui && typeof STATE.master.ui === 'object') ? STATE.master.ui : {};
      if (!ui.buckets || typeof ui.buckets !== 'object') ui.buckets = {};
      ui.pageSize = Number(data?.pageSize || 50) || 50;
      ui.counts = (data?.counts && typeof data.counts === 'object') ? data.counts : null;
      // Reset buckets for new master selection
      for (const k of ['missMate', 'd1', 'd2', 'd3', 'd4']) {
        if (!ui.buckets[k] || typeof ui.buckets[k] !== 'object') ui.buckets[k] = {};
        ui.buckets[k] = { ...ui.buckets[k], open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' };
      }
      STATE.master.ui = ui;
      STATE.master.byId = {};
      STATE.master.pending = [];
      STATE.master.completed = [];
      STATE.master.currentIndex = 0;

      // Prefetch first bucket (d1) to show something on the board without expanding buckets.
      try {
        const pre = await window.BlundersCore.fetchMasterPuzzlesBucket(STATE.me.id, mid, 'd1', 1);
        const b = STATE.master.ui.buckets.d1;
        b.entries = Array.isArray(pre?.entries) ? pre.entries : [];
        b.page = Number(pre?.page || 1) || 1;
        b.totalPages = Number(pre?.totalPages || 1) || 1;
        b.total = Number(pre?.totalBucket || b.entries.length || 0) || 0;
        // Cache by id
        const map = (STATE.master.byId && typeof STATE.master.byId === 'object') ? STATE.master.byId : {};
        for (const p of b.entries) {
          const pid = String(p?.id || '');
          if (pid) map[pid] = p;
        }
        STATE.master.byId = map;
        // Auto-select first pending puzzle if none selected
        const cur = String(STATE.master.selectedPuzzleId || '');
        if (!cur) {
          const firstPending = b.entries.find(p => String(p?.status || 'pending') === 'pending') || b.entries[0] || null;
          if (firstPending) {
            STATE.master.selectedPuzzleId = String(firstPending.id || '');
            STATE.uiBoard.masterFen = String(firstPending.startFEN || '');
            STATE.uiBoard.masterMoveUci = '';
            STATE.uiBoard.masterVerdict = '';
            STATE.uiBoard.masterBestMoveUci = '';
          }
        }
      } catch {}
      STATE.master.loading = false;
      render();
    } catch (e) {
      STATE.master.loading = false;
      STATE.master.error = String(e?.message || e);
      render();
    }
  }

  async function masterLoadBucket(key, page) {
    const mid = String(STATE.master?.selectedMasterId || '').trim();
    if (!STATE.me?.id || !mid) return;
    const ui = (STATE.master.ui && typeof STATE.master.ui === 'object') ? STATE.master.ui : null;
    if (!ui || !ui.buckets || typeof ui.buckets !== 'object') return;
    const b = ui.buckets[key];
    if (!b || b.loading) return;
    b.loading = true;
    b.error = '';
    render();
    try {
      const p = Math.max(1, Number(page || 1) || 1);
      const out = await window.BlundersCore.fetchMasterPuzzlesBucket(STATE.me.id, mid, key, p);
      b.entries = Array.isArray(out?.entries) ? out.entries : [];
      b.page = Number(out?.page || p) || p;
      b.totalPages = Number(out?.totalPages || 1) || 1;
      b.total = Number(out?.totalBucket || b.entries.length || 0) || 0;
      // Cache by id
      const map = (STATE.master.byId && typeof STATE.master.byId === 'object') ? STATE.master.byId : {};
      for (const it of b.entries) {
        const pid = String(it?.id || '');
        if (pid) map[pid] = it;
      }
      STATE.master.byId = map;
    } catch (e) {
      b.error = String(e?.message || e);
    } finally {
      b.loading = false;
      render();
    }
  }

  function masterBucketToggle(key) {
    const k = String(key || '').trim();
    if (!['missMate', 'd1', 'd2', 'd3', 'd4'].includes(k)) return;
    const ui = (STATE.master.ui && typeof STATE.master.ui === 'object') ? STATE.master.ui : null;
    if (!ui || !ui.buckets || typeof ui.buckets !== 'object') return;
    const b = ui.buckets[k];
    b.open = !b.open;
    if (b.open && (!Array.isArray(b.entries) || !b.entries.length)) {
      masterLoadBucket(k, 1).catch(() => {});
    } else {
      render();
    }
  }

  function masterBucketPrev(key) {
    const k = String(key || '').trim();
    const ui = (STATE.master.ui && typeof STATE.master.ui === 'object') ? STATE.master.ui : null;
    const b = ui?.buckets?.[k];
    if (!b || b.loading) return;
    const p = Math.max(1, Number(b.page || 1) - 1);
    masterLoadBucket(k, p).catch(() => {});
  }

  function masterBucketNext(key) {
    const k = String(key || '').trim();
    const ui = (STATE.master.ui && typeof STATE.master.ui === 'object') ? STATE.master.ui : null;
    const b = ui?.buckets?.[k];
    if (!b || b.loading) return;
    const max = Math.max(1, Number(b.totalPages || 1) || 1);
    const p = Math.min(max, Number(b.page || 1) + 1);
    masterLoadBucket(k, p).catch(() => {});
  }

  function masterBucketSetJump(key, value) {
    const k = String(key || '').trim();
    const ui = (STATE.master.ui && typeof STATE.master.ui === 'object') ? STATE.master.ui : null;
    const b = ui?.buckets?.[k];
    if (!b) return;
    b.jump = String(value || '');
  }

  function masterBucketGo(key) {
    const k = String(key || '').trim();
    const ui = (STATE.master.ui && typeof STATE.master.ui === 'object') ? STATE.master.ui : null;
    const b = ui?.buckets?.[k];
    if (!b || b.loading) return;
    const raw = String(b.jump || '').trim();
    const n = Math.floor(Number(raw || 0));
    const max = Math.max(1, Number(b.totalPages || 1) || 1);
    if (!Number.isFinite(n) || n < 1) return;
    masterLoadBucket(k, Math.min(max, n)).catch(() => {});
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
      // Home: AI comment (best-effort, non-blocking)
      if (STATE.page === 'home') {
        // Prefer bundled response (fast), then lazy fetch.
        try {
          if (data?.ai?.monthComment) {
            STATE.homeAi = STATE.homeAi && typeof STATE.homeAi === 'object' ? STATE.homeAi : {};
            STATE.homeAi.status = String(data.ai.monthCommentStatus || 'cached');
            STATE.homeAi.updatedAt = data.ai.monthCommentUpdatedAt || null;
            STATE.homeAi.comment = data.ai.monthComment || null;
            STATE.homeAi.error = data.ai.monthCommentError || '';
      } else {
            ensureHomeAiLoaded().catch(() => {});
          }
        } catch {}
      }
      // Home: load recent games (best-effort, non-blocking)
      if (STATE.page === 'home') {
        ensureHomeRecentGamesLoaded().catch(() => {});
      }
      render();
    } catch (e) {
      setStatus(`Failed: ${e?.message || e}`);
    }
  }

  async function ensureHomeRecentGamesLoaded() {
    if (!STATE.me?.id) return;
    if (!STATE.homeRecent || typeof STATE.homeRecent !== 'object') STATE.homeRecent = { loading: false, error: '', games: [], selectedGameIdx: 0, plyIdx: 0 };
    if (STATE.homeRecent.loading) return;
    STATE.homeRecent.loading = true;
