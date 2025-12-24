// Blunders UI (Home / Blunder / Review)
(function () {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const STATE = {
    page: 'home', // 'home' | 'blunder' | 'review'
    mode: 'pending', // 'pending' | 'practice'
    me: null,
    data: null,
    pending: [],
    completed: [],
    currentIndex: 0,
    selectedFrom: null,
    promoPending: null, // { baseUci }
    practicePuzzle: null,
    // Post-attempt flow control
    needsRefreshAfterModal: false,
    lastAttemptWasPendingSolve: false,
    settingsTab: 'board', // 'board' | 'general'
    ui: { modalOpen: false, modalHtml: '' }
  };

  const VCP_DEFAULTS = {
    boardLight: '#f1f5f9',
    boardDark: '#94a3b8'
  };

  function readBoardColors() {
    try {
      const light = String(localStorage.getItem('vcpBoardLight') || '') || VCP_DEFAULTS.boardLight;
      const dark = String(localStorage.getItem('vcpBoardDark') || '') || VCP_DEFAULTS.boardDark;
      return { light, dark };
    } catch {
      return { light: VCP_DEFAULTS.boardLight, dark: VCP_DEFAULTS.boardDark };
    }
  }

  function applyBoardColors() {
    const { light, dark } = readBoardColors();
    try {
      document.documentElement.style.setProperty('--vcp-board-light', light);
      document.documentElement.style.setProperty('--vcp-board-dark', dark);
    } catch {}
  }

  function setBoardColors({ light, dark }) {
    const l = String(light || '').trim() || VCP_DEFAULTS.boardLight;
    const d = String(dark || '').trim() || VCP_DEFAULTS.boardDark;
    try {
      localStorage.setItem('vcpBoardLight', l);
      localStorage.setItem('vcpBoardDark', d);
    } catch {}
    applyBoardColors();
  }

  function getPlayers() {
    const fromWindow = Array.isArray(window.blundersPlayers) ? window.blundersPlayers : null;
    if (fromWindow && fromWindow.length) return fromWindow;
    try {
      const raw = localStorage.getItem('blundersPlayers');
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function getStudentPasswordQuery() {
    try {
      const pwd = String(localStorage.getItem('studentAccessPassword') || '');
      return pwd ? `?password=${encodeURIComponent(pwd)}` : '';
    } catch {
      return '';
    }
  }

  async function fetchMyBlunders(studentId, opts = {}) {
    const qs = getStudentPasswordQuery();
    const forceQs = opts.force ? (qs ? `${qs}&force=1` : '?force=1') : qs;
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders${forceQs}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  async function submitAttempt(studentId, puzzleId, moveUci, revealBest, practice) {
    const qs = getStudentPasswordQuery();
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/${encodeURIComponent(String(puzzleId))}/attempt${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moveUci, revealBest: !!revealBest, practice: !!practice })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  function fmtTs(iso) {
    try {
      const d = new Date(String(iso || ''));
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch {
      return '';
    }
  }

  function pieceImagePath(p) {
    const ch = String(p || '');
    if (!ch) return '';
    const isWhite = ch === ch.toUpperCase();
    const t = ch.toLowerCase();
    const name =
      t === 'p' ? 'Pawn' :
      t === 'n' ? 'Knight' :
      t === 'b' ? 'Bishop' :
      t === 'r' ? 'Rook' :
      t === 'q' ? 'Queen' :
      t === 'k' ? 'King' : '';
    if (!name) return '';
    const color = isWhite ? 'white' : 'black';
    return `/game/vchess-platform/pieces/${color}_${name}.png`;
  }

  function parseFenBoard(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    if (parts.length < 2) return null;
    const boardPart = parts[0];
    const turn = parts[1];
    const ranks = boardPart.split('/');
    if (ranks.length !== 8) return null;
    const board = Array.from({ length: 8 }, () => Array(8).fill(''));
    for (let r = 0; r < 8; r++) {
      const row = ranks[r];
      let c = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) c += Number(ch);
        else {
          if (c >= 8) return null;
          board[r][c] = ch;
          c++;
        }
      }
      if (c !== 8) return null;
    }
    return { board, turn };
  }

  function squareToRC(sq) {
    const s = String(sq || '');
    if (!/^[a-h][1-8]$/.test(s)) return null;
    const file = s.charCodeAt(0) - 97;
    const rank = Number(s[1]) - 1;
    const r = 7 - rank;
    const c = file;
    return { r, c, file, rank };
  }

  function rcToSquare(r, c) {
    return `${String.fromCharCode(97 + c)}${String(8 - r)}`;
  }

  function isDarkSquare(sq) {
    const p = squareToRC(sq);
    if (!p) return false;
    return ((p.file + p.rank) % 2) === 0;
  }

  function displaySquares(flip) {
    const out = [];
    if (!flip) {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) out.push(rcToSquare(r, c));
    } else {
      for (let r = 7; r >= 0; r--) for (let c = 7; c >= 0; c--) out.push(rcToSquare(r, c));
    }
    return out;
  }

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
    STATE.ui.modalOpen = false;
    STATE.ui.modalHtml = '';
    const shouldRefresh = !!STATE.needsRefreshAfterModal;
    STATE.needsRefreshAfterModal = false;
    if (shouldRefresh) {
      // Fire-and-forget; render immediately and refresh in background.
      render();
      refreshData();
      return;
    }
    render();
  }

  function setPage(page) {
    STATE.page = page;
    render();
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

  function renderSidebar() {
    const pendingCount = Array.isArray(STATE.pending) ? STATE.pending.length : 0;
    const completedCount = Array.isArray(STATE.completed) ? STATE.completed.length : 0;
    const me = STATE.me;
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
      <div style="border:1px dashed #e5e7eb; border-radius:12px; padding:10px; margin-top:12px;">
        <div style="font-weight:900; color:#111827; margin-bottom:6px;">Debug</div>
        <div class="blunders-muted">HK day: <strong>${escapeHtml(String(dbg.hkDay || ''))}</strong></div>
        <div class="blunders-muted">Chess.com username (server): <strong>${escapeHtml(String(dbg.chessComUsername || ''))}</strong></div>
        <div class="blunders-muted">Today rapid+blitz games found: <strong>${escapeHtml(String(dbg.gamesTodayRapidBlitz ?? ''))}</strong></div>
        <div class="blunders-muted">Analyzed games (total): <strong>${escapeHtml(String(stats.analyzedGamesTotal ?? '0'))}</strong></div>
        ${sync ? `
          <div class="blunders-muted" style="margin-top:8px;">Analysis: <strong>${escapeHtml(sync.running ? 'running' : 'idle')}</strong> · stage: <strong>${escapeHtml(String(sync.stage || ''))}</strong></div>
          <div class="blunders-muted">games fetched/processed: <strong>${escapeHtml(String(sync.gamesFetched ?? ''))}</strong> / <strong>${escapeHtml(String(sync.gamesProcessed ?? ''))}</strong></div>
          <div class="blunders-muted">student plies processed: <strong>${escapeHtml(String(sync.pliesProcessed ?? ''))}</strong> · blunders added: <strong>${escapeHtml(String(sync.blundersAdded ?? ''))}</strong></div>
          ${sync.lastError ? `<div class="blunders-muted" style="color:#b91c1c;">Error: ${escapeHtml(String(sync.lastError))}</div>` : ``}
        ` : ``}
      </div>
    `;
  }

  function renderHomePage() {
    const counts = STATE.data?.counts || {};
    const stats = STATE.data?.stats || {};
    return `
      <div class="bl-card">
        <div class="bl-title">Home</div>
        <div class="blunders-muted">Your Blunders progress summary.</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button class="btn btn-secondary" type="button" data-bl-refresh>Refresh</button>
          <button class="btn btn-secondary" type="button" data-bl-force>Force refresh</button>
          <button class="btn btn-primary" type="button" data-bl-go-blunder>Go to Blunder</button>
        </div>
        <div class="bl-stats">
          <div class="bl-stat">
            <div class="bl-stat-label">Pending blunders</div>
            <div class="bl-stat-value">${escapeHtml(String(counts.pending ?? 0))}</div>
          </div>
          <div class="bl-stat">
            <div class="bl-stat-label">Solved blunders</div>
            <div class="bl-stat-value">${escapeHtml(String(counts.completed ?? 0))}</div>
          </div>
          <div class="bl-stat">
            <div class="bl-stat-label">Analyzed games (total)</div>
            <div class="bl-stat-value">${escapeHtml(String(stats.analyzedGamesTotal ?? 0))}</div>
          </div>
        </div>
        ${renderDebugBlock()}
      </div>
    `;
  }

  function renderBoardForPuzzle(puzzle, flip, selectedFrom) {
    const fen = String(puzzle?.startFEN || '');
    const parsed = parseFenBoard(fen);
    if (!parsed) return `<div class="blunders-muted">Invalid FEN.</div>`;
    const squares = displaySquares(!!flip);
    const oppUci = String(puzzle?.opponentMoveUci || '');
    const hlFrom = oppUci && oppUci.length >= 4 ? oppUci.slice(0, 2) : '';
    const hlTo = oppUci && oppUci.length >= 4 ? oppUci.slice(2, 4) : '';
    return `
      <div class="bl-board" id="blBoard" role="grid" aria-label="Chessboard">
        ${squares.map((sq) => {
          const rc = squareToRC(sq);
          const piece = rc ? parsed.board[rc.r][rc.c] : '';
          const light = !isDarkSquare(sq);
          const isSel = selectedFrom && selectedFrom === sq;
          const isLastFrom = hlFrom && sq === hlFrom;
          const isLastTo = hlTo && sq === hlTo;
          const showRank = sq[0] === (flip ? 'h' : 'a');
          const showFile = sq[1] === (flip ? '8' : '1');
          return `
            <div class="bl-sq ${light ? 'light' : 'dark'} ${isSel ? 'selected' : ''} ${isLastFrom ? 'bl-last-from' : ''} ${isLastTo ? 'bl-last-to' : ''}" data-bl-sq="${escapeHtml(sq)}" role="gridcell" aria-label="${escapeHtml(sq)}">
              ${piece ? `<img class="bl-piece" draggable="false" alt="${escapeHtml(piece)}" src="${pieceImagePath(piece)}">` : ''}
              ${showRank ? `<span class="bl-coord bl-coord-rank">${escapeHtml(sq[1])}</span>` : ''}
              ${showFile ? `<span class="bl-coord bl-coord-file">${escapeHtml(sq[0])}</span>` : ''}
            </div>
          `;
        }).join('')}
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
    const oppLine = puzzle ? (String(puzzle.opponentSan || puzzle.opponentMoveUci || '') || '(game start)') : '';
    return `
      <div class="bl-card">
        <div class="bl-title">Blunder</div>
        <div class="blunders-muted">Mode: <strong>${escapeHtml(modeLabel)}</strong>${STATE.mode === 'pending' ? ` · Remaining: <strong>${escapeHtml(String(pendingCount))}</strong>` : ''}</div>

        ${puzzle ? `
          <div class="bl-board-wrap">
            <div>
              ${renderBoardForPuzzle(puzzle, flip, STATE.selectedFrom)}
            </div>
            <div>
              <div class="bl-card" style="box-shadow:none;">
                <div style="font-weight:950; color:#111827;">Puzzle</div>
                <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(infoLine)}</div>
                <div class="blunders-muted" style="margin-top:6px;">Opponent just played: <strong>${escapeHtml(oppLine)}</strong></div>
                ${puzzle.gameUrl ? `<div class="blunders-muted" style="margin-top:6px;">Source: <a href="${escapeHtml(String(puzzle.gameUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(puzzle.gameUrl))}</a></div>` : ''}
                <div class="blunders-muted" style="margin-top:10px;">Click a piece, then click a target square.</div>
                ${STATE.mode === 'pending' ? `
                  <div class="bl-btn-row cols-3">
                    <button class="btn btn-secondary" type="button" data-bl-reveal>Reveal best</button>
                    <button class="btn btn-secondary" type="button" data-bl-prev ${STATE.currentIndex <= 0 ? 'disabled' : ''}>Prev</button>
                    <button class="btn btn-secondary" type="button" data-bl-next ${STATE.currentIndex >= pendingCount - 1 ? 'disabled' : ''}>Next</button>
                  </div>
                ` : `
                  <div class="bl-btn-row cols-2">
                    <button class="btn btn-secondary" type="button" data-bl-reveal>Reveal best</button>
                    <button class="btn btn-secondary" type="button" data-bl-back-review>Back to Review</button>
                  </div>
                `}
                <div class="blunders-muted" id="blBlunderMsg" style="margin-top:10px;"></div>
                <details style="margin-top:12px;">
                  <summary class="blunders-muted" style="cursor:pointer;">Show FEN</summary>
                  <div style="margin-top:6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:12px; color:#111827; word-break:break-all;">${escapeHtml(String(puzzle.startFEN || ''))}</div>
                </details>
              </div>
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

  function renderReviewPage() {
    const completed = Array.isArray(STATE.completed) ? STATE.completed : [];
    return `
      <div class="bl-card">
        <div class="bl-title">Review</div>
        <div class="blunders-muted">Completed puzzles you can revisit.</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button class="btn btn-secondary" type="button" data-bl-refresh>Refresh</button>
          <button class="btn btn-primary" type="button" data-bl-random ${completed.length ? '' : 'disabled'}>Random Practice</button>
        </div>
        ${completed.length ? `
          <div class="bl-grid">
            ${completed.map((p) => {
              const drop = typeof p.dropPoints === 'number' ? p.dropPoints : (Number(p.dropCp || 0) / 100);
              return `
                <button class="bl-card" type="button" data-bl-open="${escapeHtml(String(p.id || ''))}" style="text-align:left; cursor:pointer;">
                  <div style="display:flex; gap:10px; align-items:center;">
                    ${renderMiniBoardFromFen(String(p.startFEN || ''))}
                    <div style="flex:1 1 auto;">
                      <div style="font-weight:950; color:#111827;">${escapeHtml(String(p.blunderSan || p.blunderMoveUci || ''))}</div>
                      <div class="blunders-muted" style="margin-top:6px;">Drop ${escapeHtml(drop.toFixed(2))}</div>
                      <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(fmtTs(p.completedAt || p.createdAt))}</div>
                    </div>
                  </div>
                </button>
              `;
            }).join('')}
          </div>
        ` : `<div class="blunders-muted" style="margin-top:12px;">No completed puzzles yet.</div>`}
      </div>
    `;
  }

  function renderBoardPreview(light, dark) {
    // Use the shared CSS variables for preview. (We also set them inline to show the chosen colors immediately.)
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

  async function refreshData(opts = {}) {
    if (!STATE.me?.id) return;
    const statusEl = document.getElementById('blGlobalStatus');
    const setStatus = (t) => { if (statusEl) statusEl.textContent = String(t || ''); };
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

  function setMessage(txt) {
    const el = document.getElementById('blBlunderMsg');
    if (el) el.textContent = String(txt || '');
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

  function openResultModal(opts) {
    const verdict = String(opts?.verdict || '');
    const bestMove = String(opts?.bestMove || '');
    const isPractice = !!opts?.isPractice;
    const iconClass = verdict === 'best' ? 'best' : (verdict === 'good' ? 'good' : 'blunder');
    const iconGlyph = verdict === 'best' ? '👑' : (verdict === 'good' ? '✅' : '⚠️');
    const heroText = verdict === 'best' ? 'Best Move' : (verdict === 'good' ? 'Good move' : 'STILL BLUNDER!!');
    const subText =
      verdict === 'best' ? 'Perfect. You found the best move.' :
      verdict === 'good' ? 'Still fine but not the best.' :
      'STILL BLUNDER!! Try again.';
    const bestHtml = bestMove ? `<div class="blunders-muted" style="margin-top:10px;">Best move: <strong>${escapeHtml(bestMove)}</strong></div>` : `<div id="blResultBest" class="blunders-muted" style="margin-top:10px;"></div>`;

    let actionsHtml = '';
    if (verdict === 'best') {
      actionsHtml = `
        <div class="bl-result-actions one">
          <button class="btn btn-primary" type="button" data-bl-result="next">${isPractice ? 'Next (Random)' : 'Next'}</button>
        </div>
      `;
    } else if (verdict === 'good') {
      actionsHtml = `
        <div class="bl-result-actions">
          <button class="btn btn-secondary" type="button" data-bl-result="best">Best move</button>
          <button class="btn btn-primary" type="button" data-bl-result="retry">Retry</button>
        </div>
      `;
    } else {
      actionsHtml = `
        <div class="bl-result-actions one">
          <button class="btn btn-primary" type="button" data-bl-result="retry">Retry</button>
        </div>
      `;
    }

    openModal('Result', `
      <div class="bl-result-hero">
        <span class="bl-result-icon ${iconClass}">${escapeHtml(iconGlyph)}</span>
        <span>${escapeHtml(heroText)}</span>
      </div>
      <div class="blunders-muted" style="margin-top:8px;">${escapeHtml(subText)}</div>
      ${bestHtml}
      ${actionsHtml}
    `);
  }

  async function submitMoveUci(uci) {
    const puzzle = currentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    const isPractice = STATE.mode === 'practice';
    try {
      setMessage('');
      const out = await submitAttempt(STATE.me.id, String(puzzle.id || ''), uci, false, isPractice);
      if (out.ok) {
        openResultModal({ verdict: out.verdict, isPractice, bestMove: out.bestMove || '' });
        // For GOOD move on pending: keep board as-is for optional retry, refresh after modal closes.
        // For BEST on pending: refresh when user clicks Next.
        if (!isPractice && out.verdict === 'good') {
          STATE.needsRefreshAfterModal = true;
          STATE.lastAttemptWasPendingSolve = true;
        } else if (!isPractice && out.verdict === 'best') {
          STATE.needsRefreshAfterModal = false;
          STATE.lastAttemptWasPendingSolve = true;
        } else {
          STATE.lastAttemptWasPendingSolve = false;
        }
      } else {
        openResultModal({ verdict: 'blunder', isPractice });
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
      openPromotionPicker(baseUci);
      return;
    }
    submitMoveUci(baseUci);
  }

  async function revealBestMove() {
    const puzzle = currentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    try {
      const out = await submitAttempt(STATE.me.id, String(puzzle.id || ''), '', true, false);
      const bm = out?.bestMove ? String(out.bestMove) : '';
      if (STATE.ui.modalOpen) {
        const bestEl = document.getElementById('blResultBest');
        if (bestEl) bestEl.innerHTML = bm ? `Best move: <strong>${escapeHtml(bm)}</strong>` : 'Best move not available yet.';
        else openResultModal({ verdict: 'good', isPractice: (STATE.mode === 'practice'), bestMove: bm });
      } else {
        if (bm) setMessage(`Best move: ${bm}`);
        else setMessage('Best move not available yet.');
      }
    } catch (e) {
      setMessage(`Error: ${e?.message || e}`);
    }
  }

  function render() {
    const root = document.getElementById('blundersRoot');
    if (!root) return;
    const content =
      STATE.page === 'home' ? renderHomePage() :
      STATE.page === 'blunder' ? renderBlunderPage() :
      STATE.page === 'review' ? renderReviewPage() :
      renderSettingsPage();

    root.innerHTML = `
      <div class="bl-app">
        ${renderSidebar()}
        <main class="bl-main">
          <div class="bl-container">
            <div id="blGlobalStatus" class="blunders-muted"></div>
            ${content}
          </div>
        </main>
        ${STATE.ui.modalOpen ? STATE.ui.modalHtml : ''}
      </div>
    `;
  }

  function initBlunders() {
    const root = document.getElementById('blundersRoot');
    if (!root) return;

    const players = getPlayers();
    STATE.me = players[0] || null;
    if (!STATE.me || !STATE.me.id) {
      root.innerHTML = `<div class="bl-card"><div class="bl-title">Blunders</div><div class="blunders-muted">Missing student identity.</div></div>`;
      return;
    }

    applyBoardColors();
    render();
    refreshData();

    root.addEventListener('click', async (ev) => {
      const t = ev.target;

      const nav = t?.closest?.('[data-bl-nav]');
      if (nav) {
        const key = String(nav.getAttribute('data-bl-nav') || '');
        if (key) setPage(key);
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
      if (t?.closest?.('[data-bl-go-blunder]')) { setBlunderModePending(); return setPage('blunder'); }
      if (t?.closest?.('[data-bl-go-review]')) return setPage('review');

      if (t?.closest?.('[data-bl-prev]')) {
        STATE.currentIndex = Math.max(0, STATE.currentIndex - 1);
        STATE.selectedFrom = null;
        render();
        return;
      }
      if (t?.closest?.('[data-bl-next]')) {
        STATE.currentIndex = Math.min((STATE.pending.length - 1), STATE.currentIndex + 1);
        STATE.selectedFrom = null;
        render();
        return;
      }
      if (t?.closest?.('[data-bl-back-review]')) {
        setPage('review');
        return;
      }

      const resultBtn = t?.closest?.('[data-bl-result]');
      if (resultBtn) {
        const action = String(resultBtn.getAttribute('data-bl-result') || '');
        if (action === 'retry') {
          // If the last attempt solved a pending puzzle (good/best), retry should be practice (non-destructive).
          if (STATE.lastAttemptWasPendingSolve && STATE.mode !== 'practice') {
            const pz = currentPuzzle();
            if (pz) setBlunderModePractice(pz);
          }
          closeModal();
          return;
        }
        if (action === 'best') {
          revealBestMove();
          return;
        }
        if (action === 'next') {
          closeModal();
          if (STATE.mode === 'practice') {
            const completed = Array.isArray(STATE.completed) ? STATE.completed : [];
            if (completed.length) {
              const pick = completed[Math.floor(Math.random() * completed.length)];
              setBlunderModePractice(pick);
              setPage('blunder');
              return;
            }
            return;
          }
          // Pending mode: move to next pending after refresh
          await refreshData();
          setBlunderModePending();
          setPage('blunder');
          return;
        }
      }

      if (t?.closest?.('#blModalClose') || t?.id === 'blModalBackdrop') {
        closeModal();
        return;
      }
      const promo = t?.closest?.('[data-bl-promo]');
      if (promo && STATE.promoPending) {
        const p = String(promo.getAttribute('data-bl-promo') || '').toLowerCase();
        const uci = `${STATE.promoPending.baseUci}${p}`;
        submitMoveUci(uci);
        return;
      }

      if (t?.closest?.('[data-bl-reveal]')) {
        revealBestMove();
        return;
      }

      const sqEl = t?.closest?.('[data-bl-sq]');
      if (sqEl && STATE.page === 'blunder') {
        const sq = String(sqEl.getAttribute('data-bl-sq') || '');
        handleBoardClick(sq);
        return;
      }

      const open = t?.closest?.('[data-bl-open]');
      if (open) {
        const id = String(open.getAttribute('data-bl-open') || '');
        const pz = STATE.completed.find(x => String(x?.id || '') === id) || null;
        if (!pz) return;
        openModal('Review', `
          <div class="blunders-muted" style="margin-bottom:10px;">${escapeHtml(String(pz.blunderSan || pz.blunderMoveUci || ''))}</div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            ${renderMiniBoardFromFen(String(pz.startFEN || ''))}
            <div style="min-width:220px;">
              <div class="blunders-muted">Drop: <strong>${escapeHtml(Number(pz.dropPoints ?? (Number(pz.dropCp || 0) / 100)).toFixed(2))}</strong></div>
              <div class="blunders-muted" style="margin-top:6px;">Completed: <strong>${escapeHtml(fmtTs(pz.completedAt || pz.createdAt))}</strong></div>
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
        const pz = STATE.completed.find(x => String(x?.id || '') === id) || null;
        if (!pz) return;
        closeModal();
        setBlunderModePractice(pz);
        setPage('blunder');
        return;
      }

      if (t?.closest?.('[data-bl-random]')) {
        const completed = Array.isArray(STATE.completed) ? STATE.completed : [];
        if (!completed.length) return;
        const pick = completed[Math.floor(Math.random() * completed.length)];
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
  }

  window.initBlunders = initBlunders;
})();


