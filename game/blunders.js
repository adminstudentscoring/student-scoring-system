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
    ui: { modalOpen: false, modalHtml: '' }
  };

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
    render();
  }

  function setBlunderModePractice(puzzle) {
    STATE.mode = 'practice';
    STATE.practicePuzzle = puzzle || null;
    STATE.selectedFrom = null;
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
    return `
      <div class="bl-board" id="blBoard" role="grid" aria-label="Chessboard">
        ${squares.map((sq) => {
          const rc = squareToRC(sq);
          const piece = rc ? parsed.board[rc.r][rc.c] : '';
          const light = !isDarkSquare(sq);
          const isSel = selectedFrom && selectedFrom === sq;
          const showRank = sq[0] === (flip ? 'h' : 'a');
          const showFile = sq[1] === (flip ? '8' : '1');
          return `
            <div class="bl-sq ${light ? 'light' : 'dark'} ${isSel ? 'selected' : ''}" data-bl-sq="${escapeHtml(sq)}" role="gridcell" aria-label="${escapeHtml(sq)}">
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
                ${puzzle.gameUrl ? `<div class="blunders-muted" style="margin-top:6px;">Source: <a href="${escapeHtml(String(puzzle.gameUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(puzzle.gameUrl))}</a></div>` : ''}
                <div class="blunders-muted" style="margin-top:10px;">Click a piece, then click a target square.</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
                  <button class="btn btn-secondary" type="button" data-bl-reveal>Reveal best</button>
                  ${STATE.mode === 'pending' ? `
                    <button class="btn btn-secondary" type="button" data-bl-prev ${STATE.currentIndex <= 0 ? 'disabled' : ''}>Prev</button>
                    <button class="btn btn-secondary" type="button" data-bl-next ${STATE.currentIndex >= pendingCount - 1 ? 'disabled' : ''}>Next</button>
                  ` : `
                    <button class="btn btn-secondary" type="button" data-bl-back-review>Back to Review</button>
                  `}
                </div>
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

  async function submitMoveUci(uci) {
    const puzzle = currentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    const isPractice = STATE.mode === 'practice';
    try {
      setMessage('Checking...');
      const out = await submitAttempt(STATE.me.id, String(puzzle.id || ''), uci, false, isPractice);
      if (out.ok) {
        setMessage(out.verdict === 'best' ? 'Correct (best move).' : 'Correct (no blunder).');
        if (!isPractice) await refreshData();
      } else {
        setMessage(`Retry. Drop: ${Number(out.dropPoints || 0).toFixed(2)}`);
      }
    } catch (e) {
      setMessage(`Error: ${e?.message || e}`);
    } finally {
      STATE.selectedFrom = null;
      STATE.promoPending = null;
      closeModal();
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
      setMessage('Revealing...');
      const out = await submitAttempt(STATE.me.id, String(puzzle.id || ''), '', true, false);
      if (out?.bestMove) setMessage(`Best move: ${out.bestMove}`);
      else setMessage('Best move not available yet.');
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
      renderReviewPage();

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
  }

  window.initBlunders = initBlunders;
})();


