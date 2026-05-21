(function () {
  const C = window.BlundersCore;
  if (!C) {
    console.error('BlundersCore missing. Load /application/blunders/core.js first.');
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
    if (!e) throw new Error('BlundersEntryApi missing. Load /application/blunders/blunders.js after this file.');
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
        theme: 'any', // any | <tag>
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
    const theme = String(ui.theme || 'any').trim() || 'any';
    const cacheKey = `dur:${dur}|theme:${theme}`;
    if (ui.cache && ui.cacheKey === cacheKey) return ui.cache;

    const allAll = [
      ...(Array.isArray(STATE.pending) ? STATE.pending : []),
      ...(Array.isArray(STATE.completed) ? STATE.completed : [])
    ];
    const all = getReviewPuzzlesFiltered(); // includes pending + completed, filtered by duration

    const sorted0 = all.slice().sort((a, b) => {
      // Keep mate-miss near top by drop, then by time
      const da = dropOfPuzzle(a);
      const db = dropOfPuzzle(b);
      if (db !== da) return db - da;
      const ta = puzzleTimeMs(a);
      const tb = puzzleTimeMs(b);
      return tb - ta;
    });

    // Tag counts (before applying theme filter)
    const tagCounts = {};
    for (const p of sorted0) {
      const tags = Array.isArray(p?.tags) ? p.tags.map(String).filter(Boolean) : [];
      for (const t of tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }

    const sorted = (theme && theme !== 'any')
      ? sorted0.filter((p) => (Array.isArray(p?.tags) ? p.tags.map(String) : []).includes(theme))
      : sorted0;

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

    ui.cache = { totalAll: allAll.length, totalFiltered: sorted.length, totalDurationFiltered: all.length, theme, tagCounts, counts, buckets };
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

  function reviewSetTheme(theme) {
    const ui = ensureReviewUi();
    ui.theme = String(theme || 'any').trim() || 'any';
    ui.cacheKey = '';
    ui.cache = null;
    for (const b of Object.values(ui.buckets)) {
      if (!b || typeof b !== 'object') continue;
      b.page = 1;
      b.totalPages = 1;
      b.jump = '';
    }
    entry().render();
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
    const dur = String(STATE.reviewDuration || STATE.ui.homePracticeDuration || 'all');
    STATE.ui.homePracticeDuration = dur;
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
    const dur = String(STATE.reviewDuration || STATE.ui.homePracticeDuration || 'all');
    STATE.reviewDuration = dur;
    STATE.ui.homePracticeDuration = dur;
    let all = getReviewPuzzlesFiltered();
    const theme = String(ensureReviewUi()?.theme || 'any').trim() || 'any';
    if (theme !== 'any') {
      all = all.filter((p) => (Array.isArray(p?.tags) ? p.tags.map(String) : []).includes(theme));
    }
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

    const rg = (STATE.homeRecent && typeof STATE.homeRecent === 'object') ? STATE.homeRecent : { loading: false, error: '', games: [], selectedGameIdx: 0, plyIdx: 0 };
    const games = Array.isArray(rg.games) ? rg.games : [];
    const gIdx = Math.max(0, Math.min(games.length - 1, Number(rg.selectedGameIdx || 0) || 0));
    const game = games[gIdx] || null;
    const plyMax = game && Array.isArray(game.fens) ? Math.max(0, game.fens.length - 1) : 0;
    const ply = Math.max(0, Math.min(plyMax, Number(rg.plyIdx || 0) || 0));
    const fen = (game && Array.isArray(game.fens) && game.fens[ply]) ? String(game.fens[ply]) : '';
    const moveLabel = (() => {
      if (!game || !Array.isArray(game.movesSan)) return '';
      if (ply <= 0) return 'Start position';
      const san = String(game.movesSan[ply - 1] || '');
      return san ? `Move: ${san}` : '';
    })();
    const canPrev = ply > 0;
    const canNext = ply < plyMax;
    const bls = game && Array.isArray(game.blunders) ? game.blunders : [];
    const ai = (STATE.homeAi && typeof STATE.homeAi === 'object') ? STATE.homeAi : { loading: false, error: '', status: 'disabled', updatedAt: null, comment: null };
    const aiText = (() => {
      const c = ai.comment;
      if (!c) return '';
      if (typeof c === 'string') return c;
      if (typeof c?.text === 'string') return c.text;
      if (typeof c?.article === 'string' && c.article.trim()) return c.article.trim();

      // Backward-compat: older cached schema (summary + arrays) -> stitch into a short article-like text
      const s = c?.summary ? String(c.summary).trim() : '';
      const highlights = (Array.isArray(c?.highlights) ? c.highlights : []).map(String).filter(Boolean);
      const improvements = (Array.isArray(c?.improvements) ? c.improvements : []).map(String).filter(Boolean);
      const nextActions = (Array.isArray(c?.next_actions) ? c.next_actions : []).map(String).filter(Boolean);
      const p1 = s;
      const p2 = highlights.length ? `Highlights: ${highlights.join(', ')}.` : '';
      const p3 = improvements.length ? `Focus next: ${improvements.join(', ')}.` : '';
      const p4 = nextActions.length ? `Next steps: ${nextActions.join(', ')}.` : '';
      return [p1, p2, p3, p4].filter(Boolean).join('\n\n');
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

        <div class="bl-card" style="box-shadow:none; margin-top:12px;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <div style="font-weight:950; color:#111827;">Coach comment (last 30 days)</div>
            <div style="flex:1;"></div>
            <button class="btn btn-secondary btn-small" type="button" data-bl-home-ai-refresh ${ai.loading ? 'disabled' : ''}>Refresh</button>
          </div>
          ${ai.error ? `<div class="blunders-muted" style="margin-top:8px; color:#b91c1c;">${escapeHtml(String(ai.error))}</div>` : ``}
          <div class="blunders-muted" style="margin-top:8px;">
            Status: <strong>${escapeHtml(String(ai.status || 'disabled'))}</strong>
            ${ai.updatedAt ? ` · Updated: <strong>${escapeHtml(fmtTs(ai.updatedAt))}</strong>` : ``}
          </div>
          ${ai.loading ? `<div class="blunders-muted" style="margin-top:8px;">Loading...</div>` : ``}
          ${!ai.loading ? `
            ${aiText ? `<div class="bl-card" style="box-shadow:none; margin-top:10px; white-space:pre-wrap; line-height:1.35;">${escapeHtml(aiText)}</div>` : `<div class="blunders-muted" style="margin-top:10px;">No comment yet.</div>`}
          ` : ``}
        </div>

        <div class="bl-card" style="box-shadow:none; margin-top:12px;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <div style="font-weight:950; color:#111827;">Recent games (last 5)</div>
            <div style="flex:1;"></div>
            <button class="btn btn-secondary btn-small" type="button" data-bl-home-recent-refresh ${rg.loading ? 'disabled' : ''}>Refresh</button>
          </div>
