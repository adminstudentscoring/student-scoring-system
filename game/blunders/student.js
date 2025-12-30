// Blunders Student module (pages + student sidebar). Depends on window.BlundersCore + window.BlundersEntryApi.
(function () {
  const C = window.BlundersCore;
  if (!C) {
    console.error('BlundersCore missing. Load /game/blunders/core.js first.');
    return;
  }

  const {
    escapeHtml,
    STATE,
    fmtTs,
    fmtIsoUtc,
    todayYmdLocal,
    readBoardColors,
    displaySquares,
    isDarkSquare,
    parseFenBoard,
    squareToRC,
    pieceImagePath,
    getReviewPuzzlesFiltered,
    bucketKeyOfPuzzle,
    dropOfPuzzle,
    isMissMatePuzzle,
    puzzleTimeMs
  } = C;

  function entry() {
    const e = window.BlundersEntryApi;
    if (!e) throw new Error('BlundersEntryApi missing. Load /game/blunders/blunders.js after this file.');
    return e;
  }

  function currentPuzzle() {
    if (STATE.mode === 'practice') return STATE.practicePuzzle;
    const list = Array.isArray(STATE.pending) ? STATE.pending : [];
    if (!list.length) return null;
    const idx = Math.max(0, Math.min(list.length - 1, Number(STATE.currentIndex) || 0));
    return list[idx] || null;
  }

  function ensureReviewUi() {
    if (!STATE.ui || typeof STATE.ui !== 'object') STATE.ui = {};
    if (!STATE.ui.reviewUi || typeof STATE.ui.reviewUi !== 'object') {
      STATE.ui.reviewUi = {
        pageSize: 50,
        cacheKey: '',
        cache: null,
        buckets: {
          missMate: { open: false, page: 1, totalPages: 1, jump: '' },
          d1: { open: false, page: 1, totalPages: 1, jump: '' },
          d2: { open: false, page: 1, totalPages: 1, jump: '' },
          d3: { open: false, page: 1, totalPages: 1, jump: '' },
          d4: { open: false, page: 1, totalPages: 1, jump: '' }
        }
      };
    }
    if (!STATE.ui.reviewUi.buckets || typeof STATE.ui.reviewUi.buckets !== 'object') {
      STATE.ui.reviewUi.buckets = {};
    }
    const keys = ['missMate', 'd1', 'd2', 'd3', 'd4'];
    for (const k of keys) {
      if (!STATE.ui.reviewUi.buckets[k] || typeof STATE.ui.reviewUi.buckets[k] !== 'object') {
        STATE.ui.reviewUi.buckets[k] = { open: false, page: 1, totalPages: 1, jump: '' };
      }
    }
    return STATE.ui.reviewUi;
  }

  function resetReviewUi() {
    const ui = ensureReviewUi();
    ui.cacheKey = '';
    ui.cache = null;
    for (const b of Object.values(ui.buckets)) {
      if (!b || typeof b !== 'object') continue;
      b.open = false;
      b.page = 1;
      b.totalPages = 1;
      b.jump = '';
    }
  }

  function buildReviewCacheIfNeeded() {
    const ui = ensureReviewUi();
    const dur = String(STATE.reviewDuration || 'all');
    const cacheKey = `dur:${dur}`;
    if (ui.cache && ui.cacheKey === cacheKey) return ui.cache;

    const allAll = [
      ...(Array.isArray(STATE.pending) ? STATE.pending : []),
      ...(Array.isArray(STATE.completed) ? STATE.completed : [])
    ];
    const all = getReviewPuzzlesFiltered(); // includes pending + completed, filtered by duration

    const sorted = all.slice().sort((a, b) => {
      // Keep mate-miss near top by drop, then by time
      const da = dropOfPuzzle(a);
      const db = dropOfPuzzle(b);
      if (db !== da) return db - da;
      const ta = puzzleTimeMs(a);
      const tb = puzzleTimeMs(b);
      return tb - ta;
    });

    const buckets = { missMate: [], d1: [], d2: [], d3: [], d4: [] };
    for (const p of sorted) {
      const bk = bucketKeyOfPuzzle(p);
      if (bk === 'missMate') buckets.missMate.push(p);
      else if (bk === 'd1') buckets.d1.push(p);
      else if (bk === 'd2') buckets.d2.push(p);
      else if (bk === 'd3') buckets.d3.push(p);
      else buckets.d4.push(p);
    }

    const counts = {
      missMate: buckets.missMate.length,
      d1: buckets.d1.length,
      d2: buckets.d2.length,
      d3: buckets.d3.length,
      d4: buckets.d4.length
    };

    ui.cache = { totalAll: allAll.length, totalFiltered: all.length, counts, buckets };
    ui.cacheKey = cacheKey;

    // Update totalPages based on counts
    const pageSize = Math.max(1, Number(ui.pageSize || 50) || 50);
    for (const [k, b] of Object.entries(ui.buckets)) {
      const n = Number(counts[k] || 0) || 0;
      b.totalPages = Math.max(1, Math.ceil(n / pageSize));
      // Clamp current page
      b.page = Math.max(1, Math.min(b.totalPages, Number(b.page || 1) || 1));
    }
    return ui.cache;
  }

  function reviewToggleBucket(bucketKey) {
    const key = String(bucketKey || '').trim();
    const ui = ensureReviewUi();
    const b = ui.buckets[key];
    if (!b) return;
    b.open = !b.open;
    entry().render();
  }

  function reviewPrev(bucketKey) {
    const key = String(bucketKey || '').trim();
    const ui = ensureReviewUi();
    const b = ui.buckets[key];
    if (!b) return;
    b.page = Math.max(1, (Number(b.page || 1) || 1) - 1);
    entry().render();
  }

  function reviewNext(bucketKey) {
    const key = String(bucketKey || '').trim();
    const ui = ensureReviewUi();
    const b = ui.buckets[key];
    if (!b) return;
    b.page = Math.min(Math.max(1, Number(b.totalPages || 1) || 1), (Number(b.page || 1) || 1) + 1);
    entry().render();
  }

  function reviewSetJump(bucketKey, value) {
    const key = String(bucketKey || '').trim();
    const ui = ensureReviewUi();
    const b = ui.buckets[key];
    if (!b) return;
    b.jump = String(value || '').trim();
  }

  function reviewGo(bucketKey) {
    const key = String(bucketKey || '').trim();
    const ui = ensureReviewUi();
    const b = ui.buckets[key];
    if (!b) return;
    const raw = String(b.jump || '').trim();
    const n = Math.floor(Number(raw || 0));
    if (!Number.isFinite(n) || n < 1) return;
    b.page = Math.max(1, Math.min(Math.max(1, Number(b.totalPages || 1) || 1), n));
    b.jump = '';
    entry().render();
  }

  function renderSidebar() {
    const pendingCount = Array.isArray(STATE.pending) ? STATE.pending.length : 0;
    const completedCount = Array.isArray(STATE.completed) ? STATE.completed.length : 0;
    const me = STATE.me;
    const masterTotalPending = (() => {
      const ms = Array.isArray(STATE.master?.masters) ? STATE.master.masters : [];
      if (!ms.length) return '';
      const sum = ms.reduce((acc, m) => acc + Number(m?.counts?.pending || 0), 0);
      return String(sum || '');
    })();
    return `
      <aside class="bl-sidebar" aria-label="Blunders sidebar">
        <div class="bl-side-title">💥 Blunders</div>
        <div class="bl-side-sub">${escapeHtml(me ? `${me.name || 'Student'} (${me.studentId || ''})` : '')}</div>
        <div class="bl-nav">
          <button class="bl-nav-btn ${STATE.page === 'home' ? 'active' : ''}" type="button" data-bl-nav="home">
            <span class="bl-nav-left"><span class="bl-nav-icon">🏠</span>Home</span>
          </button>
          <button class="bl-nav-btn ${STATE.page === 'blunder' ? 'active' : ''}" type="button" data-bl-nav="blunder">
            <span class="bl-nav-left"><span class="bl-nav-icon">⚡</span>Blunder</span>
            <span class="bl-badge">${escapeHtml(String(pendingCount))}</span>
          </button>
          <button class="bl-nav-btn ${STATE.page === 'review' ? 'active' : ''}" type="button" data-bl-nav="review">
            <span class="bl-nav-left"><span class="bl-nav-icon">🧠</span>Review</span>
            <span class="bl-badge">${escapeHtml(String(completedCount))}</span>
          </button>
          <button class="bl-nav-btn ${STATE.page === 'masterGame' ? 'active' : ''}" type="button" data-bl-nav="masterGame">
            <span class="bl-nav-left"><span class="bl-nav-icon">♟️</span>Master Game</span>
            ${masterTotalPending ? `<span class="bl-badge">${escapeHtml(masterTotalPending)}</span>` : ``}
          </button>
          <button class="bl-nav-btn ${STATE.page === 'challenge' ? 'active' : ''}" type="button" data-bl-nav="challenge">
            <span class="bl-nav-left"><span class="bl-nav-icon">🏁</span>Challenge</span>
          </button>
          <button class="bl-nav-btn ${STATE.page === 'leaderboard' ? 'active' : ''}" type="button" data-bl-nav="leaderboard">
            <span class="bl-nav-left"><span class="bl-nav-icon">🏆</span>Leaderboard</span>
          </button>
          <button class="bl-nav-btn ${STATE.page === 'settings' ? 'active' : ''}" type="button" data-bl-nav="settings">
            <span class="bl-nav-left"><span class="bl-nav-icon">⚙️</span>Settings</span>
          </button>
        </div>
      </aside>
    `;
  }

  function renderDebugBlock() {
    const dbg = STATE.data?.debug || {};
    const sync = dbg?.sync || null;
    const stats = STATE.data?.stats || {};
    return `
      <div class="bl-debug-mini">
        <div class="bl-debug-title">Debug</div>
        <div class="bl-debug-line">HK day: <strong>${escapeHtml(String(dbg.hkDay || ''))}</strong></div>
        <div class="bl-debug-line">Chess.com: <strong>${escapeHtml(String(dbg.chessComUsername || ''))}</strong></div>
        <div class="bl-debug-line">Games today: <strong>${escapeHtml(String(dbg.gamesTodayRapidBlitz ?? ''))}</strong></div>
        <div class="bl-debug-line">Analyzed games: <strong>${escapeHtml(String(stats.analyzedGamesTotal ?? '0'))}</strong></div>
        ${sync ? `
          <div class="bl-debug-line" style="margin-top:6px;">Analysis: <strong>${escapeHtml(sync.running ? 'running' : 'idle')}</strong> · stage: <strong>${escapeHtml(String(sync.stage || ''))}</strong></div>
          <div class="bl-debug-line">fetched/processed: <strong>${escapeHtml(String(sync.gamesFetched ?? ''))}</strong> / <strong>${escapeHtml(String(sync.gamesProcessed ?? ''))}</strong></div>
          <div class="bl-debug-line">plies: <strong>${escapeHtml(String(sync.pliesProcessed ?? ''))}</strong> · added: <strong>${escapeHtml(String(sync.blundersAdded ?? ''))}</strong></div>
        ` : ``}
      </div>
    `;
  }

  function openHomePracticeModal() {
    const dur = String(STATE.ui.homePracticeDuration || 'all');
    const durBtns = [
      { k: 'week', label: 'Last 7 days' },
      { k: 'month', label: 'Last 30 days' },
      { k: 'halfYear', label: 'Last 6 months' },
      { k: 'year', label: 'Last 12 months' },
      { k: 'all', label: 'All time' }
    ];
    entry().openModal('Practice', `
      <div class="blunders-muted" style="margin-bottom:10px;">Choose filters, then start a practice puzzle.</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <span class="blunders-muted" style="margin-right:2px;">Practice:</span>
        <button class="btn btn-primary" type="button" data-bl-home-practice-start="random">Random</button>
        <button class="btn btn-secondary" type="button" data-bl-home-practice-start="d1">1–1.5</button>
        <button class="btn btn-secondary" type="button" data-bl-home-practice-start="d2">1.51–2</button>
        <button class="btn btn-secondary" type="button" data-bl-home-practice-start="d3">2.01–3</button>
        <button class="btn btn-secondary" type="button" data-bl-home-practice-start="d4">3.01+</button>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:12px;">
        <span class="blunders-muted" style="margin-right:2px;">Duration:</span>
        ${durBtns.map(b => `
          <button class="btn ${dur === b.k ? 'btn-info' : 'btn-secondary'} btn-small" type="button" data-bl-home-practice-duration="${escapeHtml(b.k)}">
            ${escapeHtml(b.label)}
          </button>
        `).join('')}
      </div>
      <div class="blunders-muted" style="margin-top:12px;">Tip: Practice uses <strong>pending + completed</strong> puzzles.</div>
    `);
  }

  function startPracticeFromHome(key) {
    const k = String(key || 'random');
    const dur = String(STATE.ui.homePracticeDuration || 'all');
    STATE.reviewDuration = dur;
    const all = getReviewPuzzlesFiltered();
    if (!all.length) {
      entry().closeModal();
      return;
    }
    let pool = [];
    if (k === 'random') pool = all.filter(p => bucketKeyOfPuzzle(p) !== 'missMate');
    else pool = all.filter(p => bucketKeyOfPuzzle(p) === k);
    if (!pool.length) pool = all.slice();
    const pick = pool[Math.floor(Math.random() * pool.length)];
    STATE.practiceKey = k || 'random';
    entry().closeModal();
    entry().setBlunderModePractice(pick);
    entry().setPage('blunder');
  }

  function renderHomePage() {
    const counts = STATE.data?.counts || {};
    const stats = STATE.data?.stats || {};
    const r3 = stats?.rolling3m || {};
    const fmtMovesPer = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return '—';
      if (n >= 100) return `${Math.round(n)}`;
      return `${n.toFixed(1)}`;
    };
    const avgOpp = (() => {
      const n = Number(r3?.avgOpponentRating ?? NaN);
      return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : '—';
    })();
    return `
      <div class="bl-card">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div class="bl-title">Home</div>
            <div class="blunders-muted">Your Blunders progress summary.</div>
          </div>
          <div style="text-align:right;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-page-reload title="Reload page">Refresh page</button>
            <div class="blunders-muted" style="margin-top:6px;">If anything looks wrong, click Refresh page.</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button class="btn btn-secondary" type="button" data-bl-refresh>Refresh</button>
          <button class="btn btn-primary" type="button" data-bl-go-blunder>New Blunders</button>
          <button class="btn btn-secondary" type="button" data-bl-home-practice-open>Practice</button>
        </div>
        <div class="bl-stats">
          <div class="bl-stat">
            <div class="bl-stat-label">Pending Blunders</div>
            <div class="bl-stat-value">${escapeHtml(String(counts.pending ?? 0))}</div>
          </div>
          <div class="bl-stat">
            <div class="bl-stat-label">Solved Blunders</div>
            <div class="bl-stat-value">${escapeHtml(String(counts.completed ?? 0))}</div>
          </div>
          <div class="bl-stat">
            <div class="bl-stat-label">Analyzed games</div>
            <div class="bl-stat-value">${escapeHtml(String(stats.analyzedGamesTotal ?? 0))}</div>
          </div>
          <div class="bl-stat">
            <div class="bl-stat-label">Blunders rate (last 3 months)</div>
            <div class="blunders-muted" style="margin-top:6px; line-height:1.25;">
              <div>&gt; 1.0: <strong>1 / ${escapeHtml(fmtMovesPer(r3?.movesPer?.gt1))}</strong> moves</div>
              <div>&gt; 2.0: <strong>1 / ${escapeHtml(fmtMovesPer(r3?.movesPer?.gt2))}</strong> moves</div>
              <div>&gt; 3.0: <strong>1 / ${escapeHtml(fmtMovesPer(r3?.movesPer?.gt3))}</strong> moves</div>
              <div>Miss mate: <strong>1 / ${escapeHtml(fmtMovesPer(r3?.movesPer?.missMate))}</strong> moves</div>
            </div>
          </div>
          <div class="bl-stat">
            <div class="bl-stat-label">Average Opponents rating (last 3 months)</div>
            <div class="bl-stat-value">${escapeHtml(avgOpp)}</div>
          </div>
        </div>
        ${renderDebugBlock()}
      </div>
    `;
  }

  function renderBlunderPage() {
    const puzzle = currentPuzzle();
    const pendingCount = Array.isArray(STATE.pending) ? STATE.pending.length : 0;
    const flip = puzzle ? String(puzzle.studentColor || '') === 'b' : false;
    const modeLabel = STATE.mode === 'practice' ? 'Practice (Random)' : 'Pending';
    const dropVal = puzzle ? Number(puzzle.dropPoints ?? (Number(puzzle.dropCp || 0) / 100)) : 0;
    const infoLine = puzzle ? `${String(puzzle.blunderSan || puzzle.blunderMoveUci || '')} · Drop ${dropVal.toFixed(2)}` : '';
    const fenOverride = String(STATE.uiBoard.blunderFen || puzzle?.startFEN || '');
    const myMoveUci = String(STATE.uiBoard.blunderMoveUci || '');
    return `
      <div class="bl-card">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div class="bl-title">Blunder</div>
            <div class="blunders-muted">Mode: <strong>${escapeHtml(modeLabel)}</strong>${STATE.mode === 'pending' ? ` · Remaining: <strong>${escapeHtml(String(pendingCount))}</strong>` : ''}</div>
          </div>
          <div style="text-align:right;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-page-reload title="Reload page">Refresh page</button>
            <div class="blunders-muted" style="margin-top:6px;">If anything looks wrong, click Refresh page.</div>
          </div>
        </div>

        ${puzzle ? `
          <div class="bl-board-wrap">
            <div>
              ${entry().renderBoardForPuzzle(puzzle, flip, STATE.selectedFrom, { fenOverride, myMoveUci })}
            </div>
            <div>
              <div class="bl-card" style="box-shadow:none;">
                <div style="font-weight:950; color:#111827;">Puzzle</div>
                <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(infoLine)}</div>
                ${puzzle.gameUrl ? `<div class="blunders-muted" style="margin-top:6px;">Source: <a href="${escapeHtml(String(puzzle.gameUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(puzzle.gameUrl))}</a></div>` : ''}
                ${STATE.mode === 'pending' ? `
                  <div class="bl-btn-row cols-3">
                    <button class="btn btn-secondary" type="button" data-bl-prev ${STATE.currentIndex <= 0 ? 'disabled' : ''}>Prev</button>
                    <button class="btn btn-secondary" type="button" data-bl-next ${STATE.currentIndex >= pendingCount - 1 ? 'disabled' : ''}>Next</button>
                  </div>
                ` : `
                  <div class="bl-btn-row cols-2">
                    <button class="btn btn-secondary" type="button" data-bl-back-review>Back to Review</button>
                  </div>
                `}
                <div class="blunders-muted" id="blBlunderMsg" style="margin-top:10px;"></div>
                <button class="btn btn-secondary btn-small" type="button" data-bl-copy-fen="blunder" style="margin-top:12px;">
                  <span style="display:inline-flex; align-items:center; gap:8px;">
                    <span aria-hidden="true">📋</span>
                    <span>Copy FEN</span>
                  </span>
                </button>
              </div>
              ${entry().renderInlineResultPanel('blunder')}
            </div>
          </div>
        ` : `
          <div class="blunders-muted" style="margin-top:10px;">No pending puzzles yet.</div>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <button class="btn btn-secondary" type="button" data-bl-refresh>Refresh</button>
            <button class="btn btn-secondary" type="button" data-bl-force>Force refresh</button>
            <button class="btn btn-primary" type="button" data-bl-go-review>Go to Review</button>
          </div>
          ${renderDebugBlock()}
        `}
      </div>
    `;
  }

  function renderReviewPage() {
    const ui = ensureReviewUi();
    const cache = buildReviewCacheIfNeeded();
    const pageSize = Math.max(1, Number(ui.pageSize || 50) || 50);

    const renderRows = (arr, bucketKey) => {
      const list = Array.isArray(arr) ? arr : [];
      const b = ui.buckets[bucketKey] || { page: 1, totalPages: 1 };
      const page = Math.max(1, Number(b.page || 1) || 1);
      const start = (page - 1) * pageSize;
      const pageItems = list.slice(start, start + pageSize);
      if (!pageItems.length) return `<div class="blunders-muted" style="margin-top:10px;">No records.</div>`;
      return `
        <div class="bl-grid" style="margin-top:10px;">
          ${pageItems.map((p) => {
            const drop = dropOfPuzzle(p);
            const label = isMissMatePuzzle(p) ? 'Miss the mate' : `Drop ${drop.toFixed(2)}`;
            const status = String(p?.status || 'pending') === 'completed' ? 'Completed' : 'Pending';
            return `
              <button class="bl-card" type="button" data-bl-open="${escapeHtml(String(p.id || ''))}" style="text-align:left; cursor:pointer;">
                <div style="display:flex; gap:10px; align-items:center;">
                  ${entry().renderMiniBoardFromFen(String(p.startFEN || ''))}
                  <div style="flex:1 1 auto; min-width:0;">
                    <div style="font-weight:950; color:#111827; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(String(p.blunderSan || p.blunderMoveUci || ''))}</div>
                    <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(label)} · <strong>${escapeHtml(status)}</strong></div>
                    <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(fmtTs(p.completedAt || p.createdAt))}</div>
                  </div>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      `;
    };

    const renderBucket = (key, label) => {
      const b = ui.buckets[key] || { open: false, page: 1, totalPages: 1, jump: '' };
      const open = !!b.open;
      const count = Number(cache?.counts?.[key] || 0) || 0;
      const totalPages = Math.max(1, Number(b.totalPages || 1) || 1);
      const page = Math.max(1, Number(b.page || 1) || 1);
      const canPrev = open && page > 1;
      const canNext = open && page < totalPages;
      const jumpVal = String(b.jump || '');
      return `
        <div class="bl-card" style="margin-top:12px;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-review-toggle="${escapeHtml(key)}">${open ? 'Hide' : 'Show'}</button>
            <div style="font-weight:950; color:#111827;">${escapeHtml(label)} <span class="bl-badge" style="margin-left:8px;">${escapeHtml(String(count))}</span></div>
            <div style="flex:1;"></div>
            ${open ? `
              <div class="blunders-muted">Page <strong>${escapeHtml(String(page))}</strong> / <strong>${escapeHtml(String(totalPages))}</strong></div>
              <button class="btn btn-secondary btn-small" type="button" data-bl-review-prev="${escapeHtml(key)}" ${canPrev ? '' : 'disabled'}>Prev</button>
              <button class="btn btn-secondary btn-small" type="button" data-bl-review-next="${escapeHtml(key)}" ${canNext ? '' : 'disabled'}>Next</button>
              <div style="display:flex; gap:6px; align-items:center;">
                <input type="number" min="1" max="${escapeHtml(String(totalPages))}" value="${escapeHtml(jumpVal)}" placeholder="Page #" data-bl-review-jump="${escapeHtml(key)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                <button class="btn btn-secondary btn-small" type="button" data-bl-review-go="${escapeHtml(key)}">Go</button>
              </div>
            ` : ``}
          </div>
          ${open ? renderRows(cache?.buckets?.[key] || [], key) : ``}
        </div>
      `;
    };

    const dur = String(STATE.reviewDuration || 'all');
    const durBtns = [
      { k: 'week', label: 'Last 7 days' },
      { k: 'month', label: 'Last 30 days' },
      { k: 'halfYear', label: 'Last 6 months' },
      { k: 'year', label: 'Last 12 months' },
      { k: 'all', label: 'All time' }
    ];

    return `
      <div class="bl-card">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div class="bl-title">Review</div>
            <div class="blunders-muted">All puzzles are shown here (pending + completed).</div>
          </div>
          <div style="text-align:right;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-page-reload title="Reload page">Refresh page</button>
            <div class="blunders-muted" style="margin-top:6px;">If anything looks wrong, click Refresh page.</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button class="btn btn-secondary" type="button" data-bl-refresh>Refresh</button>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <span class="blunders-muted" style="margin-right:2px;">Practice:</span>
            <button class="btn btn-primary" type="button" data-bl-review-practice="random" ${cache.totalFiltered ? '' : 'disabled'}>Random</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d1" ${cache.counts?.d1 ? '' : 'disabled'}>1–1.5</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d2" ${cache.counts?.d2 ? '' : 'disabled'}>1.51–2</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d3" ${cache.counts?.d3 ? '' : 'disabled'}>2.01–3</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d4" ${cache.counts?.d4 ? '' : 'disabled'}>3.01+</button>
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px;">
          <span class="blunders-muted" style="margin-right:2px;">Duration:</span>
          ${durBtns.map(b => `
            <button class="btn ${dur === b.k ? 'btn-info' : 'btn-secondary'} btn-small" type="button" data-bl-review-duration="${escapeHtml(b.k)}">
              ${escapeHtml(b.label)}
            </button>
          `).join('')}
          <span class="blunders-muted" style="margin-left:6px;">Showing <strong>${escapeHtml(String(cache.totalFiltered))}</strong> of <strong>${escapeHtml(String(cache.totalAll))}</strong></span>
        </div>
        ${cache.totalFiltered ? `
          ${renderBucket('missMate', 'Miss the mate')}
          ${renderBucket('d1', 'Drop 1.00–1.50')}
          ${renderBucket('d2', 'Drop 1.51–2.00')}
          ${renderBucket('d3', 'Drop 2.01–3.00')}
          ${renderBucket('d4', 'Drop 3.01+')}
        ` : `<div class="blunders-muted" style="margin-top:12px;">No puzzles yet.</div>`}
      </div>
    `;
  }

  function renderBoardPreview(light, dark) {
    const squares = displaySquares(false);
    return `
      <div class="bl-board-preview" style="--vcp-board-light:${escapeHtml(light)}; --vcp-board-dark:${escapeHtml(dark)};">
        ${squares.map((sq) => {
          const isLight = !isDarkSquare(sq);
          return `<div class="sq ${isLight ? 'light' : 'dark'}"></div>`;
        }).join('')}
      </div>
    `;
  }

  function renderStudentMasterGamePage() {
    const masters = Array.isArray(STATE.master.masters) ? STATE.master.masters : [];
    const selectedId = String(STATE.master.selectedMasterId || '');
    const selected = masters.find(m => String(m.id || '') === selectedId) || null;
    const puzzle = (Array.isArray(STATE.master.pending) && STATE.master.pending.length)
      ? STATE.master.pending[Math.max(0, Math.min(STATE.master.pending.length - 1, Number(STATE.master.currentIndex) || 0))]
      : null;
    const flip = puzzle ? String(puzzle.playerColor || puzzle.studentColor || '') === 'b' : false;
    const dropVal = puzzle ? Number(puzzle.dropPoints ?? (Number(puzzle.dropCp || 0) / 100)) : 0;
    const infoLine = puzzle ? `${String(puzzle.blunderSan || puzzle.blunderMoveUci || '')} · Drop ${dropVal.toFixed(2)}` : '';

    return `
      <div class="bl-card">
        <div class="bl-title">Master Game</div>
        <div class="blunders-muted">Solve blunders from master games (teacher-curated via Master settings).</div>

        <div style="margin-top:12px;">
          <div class="blunders-muted" style="margin-bottom:8px;">Masters</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${masters.map((m) => {
              const mid = String(m.id || '');
              const active = mid === selectedId;
              const pending = Number(m?.counts?.pending || 0);
              return `
                <button class="btn ${active ? 'btn-info' : 'btn-secondary'} btn-small" type="button" data-bl-master="${escapeHtml(mid)}">
                  ${escapeHtml(String(m.name || 'Master'))}${pending ? ` <span style="opacity:.9;">(${pending})</span>` : ''}
                </button>
              `;
            }).join('') || `<div class="blunders-muted">No masters configured yet.</div>`}
          </div>
        </div>

        ${STATE.master.loading ? `<div class="blunders-muted" style="margin-top:12px;">Loading...</div>` : ``}
        ${STATE.master.error ? `<div class="blunders-muted" style="margin-top:12px; color:#b91c1c;">${escapeHtml(STATE.master.error)}</div>` : ``}

        ${selected ? `
          <div class="bl-board-wrap" style="margin-top:12px;">
            <div>
              ${puzzle ? entry().renderBoardForPuzzle(puzzle, flip, STATE.selectedFrom, { fenOverride: (STATE.uiBoard.masterFen || puzzle.startFEN), myMoveUci: (STATE.uiBoard.masterMoveUci || '') }) : `<div class="bl-card" style="box-shadow:none;"><div class="blunders-muted">No pending puzzles for this master.</div></div>`}
            </div>
            <div>
              <div class="bl-card" style="box-shadow:none;">
                <div style="font-weight:950; color:#111827;">${escapeHtml(String(selected.name || 'Master'))}</div>
                <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(String(selected.username || ''))}</div>
                ${puzzle ? `
                  <div class="blunders-muted" style="margin-top:10px;">${escapeHtml(infoLine)}</div>
                  ${puzzle.gameUrl ? `<div class="blunders-muted" style="margin-top:6px;">Source: <a href="${escapeHtml(String(puzzle.gameUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(puzzle.gameUrl))}</a></div>` : ''}
                  <div class="bl-btn-row cols-3">
                    <button class="btn btn-secondary" type="button" data-bl-master-prev ${STATE.master.currentIndex <= 0 ? 'disabled' : ''}>Prev</button>
                    <button class="btn btn-secondary" type="button" data-bl-master-next ${STATE.master.currentIndex >= (STATE.master.pending.length - 1) ? 'disabled' : ''}>Next</button>
                  </div>
                  <div class="blunders-muted" id="blMasterMsg" style="margin-top:10px;"></div>
                  <button class="btn btn-secondary btn-small" type="button" data-bl-copy-fen="master" style="margin-top:12px;">
                    <span style="display:inline-flex; align-items:center; gap:8px;">
                      <span aria-hidden="true">📋</span>
                      <span>Copy FEN</span>
                    </span>
                  </button>
                ` : ``}
              </div>
              ${entry().renderInlineResultPanel('master')}
            </div>
          </div>
        ` : ``}
      </div>
    `;
  }

  function renderSettingsPage() {
    const tab = String(STATE.settingsTab || 'board');
    const { light, dark } = readBoardColors();
    return `
      <div class="bl-card">
        <div class="bl-title">Settings</div>
        <div class="blunders-muted">Chess Board Setting: adjust board colors. General: coming soon.</div>

        <div class="bl-settings-tabs" role="tablist" aria-label="Settings tabs">
          <button class="bl-settings-tab-btn ${tab === 'board' ? 'active' : ''}" type="button" data-bl-settings-tab="board" role="tab" aria-selected="${tab === 'board' ? 'true' : 'false'}">Chess Board Setting</button>
          <button class="bl-settings-tab-btn ${tab === 'general' ? 'active' : ''}" type="button" data-bl-settings-tab="general" role="tab" aria-selected="${tab === 'general' ? 'true' : 'false'}">General</button>
        </div>

        ${tab === 'board' ? `
          <div class="bl-settings-panel" role="tabpanel" aria-label="Chess Board Setting">
            <div class="bl-settings-grid">
              <div class="bl-settings-row">
                <label for="blBoardLightInput">Light squares</label>
                <input id="blBoardLightInput" type="color" value="${escapeHtml(light)}" />
              </div>
              <div class="bl-settings-row">
                <label for="blBoardDarkInput">Dark squares</label>
                <input id="blBoardDarkInput" type="color" value="${escapeHtml(dark)}" />
              </div>
              <div class="bl-settings-row">
                <button id="blBoardResetBtn" class="btn btn-secondary" type="button">Reset</button>
              </div>
            </div>
            <div style="margin-top:12px;">
              <div class="blunders-muted" style="margin-bottom:8px;">Preview</div>
              ${renderBoardPreview(light, dark)}
            </div>
          </div>
        ` : `
          <div class="bl-settings-panel" role="tabpanel" aria-label="General">
            <div class="blunders-muted">To be developed.</div>
          </div>
        `}
      </div>
    `;
  }

  window.BlundersStudent = {
    renderSidebar,
    renderDebugBlock,
    openHomePracticeModal,
    startPracticeFromHome,
    renderHomePage,
    renderBlunderPage,
    renderReviewPage,
    // Review (bucketed paging)
    reviewToggleBucket,
    reviewPrev,
    reviewNext,
    reviewGo,
    reviewSetJump,
    resetReviewUi,
    renderStudentMasterGamePage,
    renderSettingsPage
  };
})();


