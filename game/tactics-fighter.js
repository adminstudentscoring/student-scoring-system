// Tactics Fighter (Running Queen-like fixed sidebar scaffold)
// UI text is English by design.

(function () {
  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getUrlMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      const m = String(params.get('mode') || '').trim();
      if (m) return m;
    } catch {}
    // fallback: hash
    const h = String(window.location.hash || '').replace('#', '').trim();
    return h || 'practice';
  }

  function setUrlMode(mode) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', String(mode));
      window.history.replaceState(null, '', url.toString());
      return;
    } catch {}
    try {
      window.location.hash = String(mode);
    } catch {}
  }

  function normalizeMode(mode) {
    const m = String(mode || '').toLowerCase().trim();
    if (m === 'practice') return 'practice';
    if (m === 'challenge') return 'challenge';
    if (m === 'builder') return 'builder';
    if (m === 'setting' || m === 'settings') return 'settings';
    return 'practice';
  }

  async function fetchConfig() {
    const resp = await fetch('/api/tactics-fighter/config', { method: 'GET' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Failed to load config');
    return data;
  }

  function apiRequest(path, options = {}) {
    // Teacher endpoints require Bearer auth; student endpoints generally don't.
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const token = localStorage.getItem('authToken');
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
    return fetch(path, { ...options, headers });
  }

  function getPublicStudentPassword() {
    try { return String(localStorage.getItem('studentAccessPassword') || '').trim(); } catch { return ''; }
  }

  function getPublicStudentId(players) {
    const p0 = Array.isArray(players) ? players[0] : null;
    return String(p0?.id || '').trim();
  }

  function normalizeBucketKey(k) {
    const s = String(k || '').trim().toLowerCase();
    return s || 'beginner';
  }

  async function tfJson(resp) {
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const base = String(data?.error || `Request failed (${resp.status})`);
      const details = data && Object.prototype.hasOwnProperty.call(data, 'details') ? String(data.details || '').trim() : '';
      const suffix = details ? ` · ${details}` : '';
      throw new Error(`${base} [${resp.status}]${suffix}`);
    }
    return data;
  }

  const PIECE_UNICODE = {
    P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
    p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚'
  };

  const FILES = 'abcdefgh';
  function rcToCoord(r, c) { return `${FILES[c]}${8 - r}`; }

  function pieceImageSrc(p) {
    const s = String(p || '');
    if (!s) return '';
    const isWhite = s === s.toUpperCase();
    const t = s.toLowerCase();
    const name =
      t === 'p' ? 'Pawn' :
      t === 'n' ? 'Knight' :
      t === 'b' ? 'Bishop' :
      t === 'r' ? 'Rook' :
      t === 'q' ? 'Queen' :
      t === 'k' ? 'King' : '';
    if (!name) return '';
    const color = isWhite ? 'white' : 'black';
    return `/game/pieces/${color}_${name}.png`;
  }

  function parseFenToBoard(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    const placement = String(parts[0] || '').trim();
    const ranks = placement.split('/');
    if (ranks.length !== 8) return null;
    const board = Array.from({ length: 8 }, () => Array(8).fill(''));
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of ranks[r]) {
        if (c > 7) return null;
        if (/\d/.test(ch)) c += Number(ch);
        else if (/[prnbqkPRNBQK]/.test(ch)) { board[r][c] = ch; c++; }
        else return null;
      }
      if (c !== 8) return null;
    }
    return board;
  }

  function boardToFenPlacement(board) {
    const ranks = [];
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      let out = '';
      for (let c = 0; c < 8; c++) {
        const p = board[r][c] || '';
        if (!p) empty++;
        else {
          if (empty) { out += String(empty); empty = 0; }
          out += p;
        }
      }
      if (empty) out += String(empty);
      ranks.push(out || '8');
    }
    return ranks.join('/');
  }

  function buildFenFromBoard(board, side) {
    const placement = boardToFenPlacement(board);
    const stm = (String(side) === 'b') ? 'b' : 'w';
    return `${placement} ${stm} - - 0 1`;
  }

  function fenSideToMove(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    const s = String(parts[1] || '').trim();
    return (s === 'b') ? 'b' : 'w';
  }

  function cloneBoard(board) {
    return Array.isArray(board) ? board.map((row) => Array.isArray(row) ? row.slice() : []) : null;
  }

  function coordToRc(coord) {
    const s = String(coord || '').trim().toLowerCase();
    if (!/^[a-h][1-8]$/.test(s)) return null;
    const c = FILES.indexOf(s[0]);
    const r = 8 - Number(s[1]);
    if (r < 0 || r > 7 || c < 0 || c > 7) return null;
    return { r, c };
  }

  function applyUciToBoard(state, uci) {
    const s = String(uci || '').trim().toLowerCase();
    const m = s.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (!m) return { ok: false, error: 'Invalid move format' };
    const from = coordToRc(m[1]);
    const to = coordToRc(m[2]);
    const promo = m[3] || '';
    if (!from || !to) return { ok: false, error: 'Invalid squares' };

    const board = state?.board;
    if (!Array.isArray(board) || !Array.isArray(board[from.r])) return { ok: false, error: 'Board not ready' };
    const piece = board[from.r][from.c] || '';
    if (!piece) return { ok: false, error: 'No piece on from-square' };

    // snapshot
    state.history.push({ board: cloneBoard(board), side: state.side, uci: s });

    // move piece
    board[from.r][from.c] = '';
    board[to.r][to.c] = piece;

    // Basic castling rook move (does not validate legality)
    const isWhiteKing = piece === 'K';
    const isBlackKing = piece === 'k';
    const fromCoord = m[1];
    const toCoord = m[2];
    if (isWhiteKing && fromCoord === 'e1' && toCoord === 'g1') { // O-O
      const rookFrom = coordToRc('h1'); const rookTo = coordToRc('f1');
      if (rookFrom && rookTo) { board[rookTo.r][rookTo.c] = board[rookFrom.r][rookFrom.c] || 'R'; board[rookFrom.r][rookFrom.c] = ''; }
    } else if (isWhiteKing && fromCoord === 'e1' && toCoord === 'c1') { // O-O-O
      const rookFrom = coordToRc('a1'); const rookTo = coordToRc('d1');
      if (rookFrom && rookTo) { board[rookTo.r][rookTo.c] = board[rookFrom.r][rookFrom.c] || 'R'; board[rookFrom.r][rookFrom.c] = ''; }
    } else if (isBlackKing && fromCoord === 'e8' && toCoord === 'g8') {
      const rookFrom = coordToRc('h8'); const rookTo = coordToRc('f8');
      if (rookFrom && rookTo) { board[rookTo.r][rookTo.c] = board[rookFrom.r][rookFrom.c] || 'r'; board[rookFrom.r][rookFrom.c] = ''; }
    } else if (isBlackKing && fromCoord === 'e8' && toCoord === 'c8') {
      const rookFrom = coordToRc('a8'); const rookTo = coordToRc('d8');
      if (rookFrom && rookTo) { board[rookTo.r][rookTo.c] = board[rookFrom.r][rookFrom.c] || 'r'; board[rookFrom.r][rookFrom.c] = ''; }
    }

    // Promotion (default to queen if omitted and pawn reaches last rank)
    const isPawn = piece === 'P' || piece === 'p';
    if (isPawn) {
      const toRank = Number(m[2][1]);
      if ((piece === 'P' && toRank === 8) || (piece === 'p' && toRank === 1)) {
        const want = promo || 'q';
        const up = piece === 'P';
        const promPiece =
          want === 'q' ? (up ? 'Q' : 'q') :
          want === 'r' ? (up ? 'R' : 'r') :
          want === 'b' ? (up ? 'B' : 'b') :
          want === 'n' ? (up ? 'N' : 'n') : (up ? 'Q' : 'q');
        board[to.r][to.c] = promPiece;
      }
    }

    // Toggle side
    state.side = (state.side === 'b') ? 'w' : 'b';
    return { ok: true };
  }

  function undoOnePly(state) {
    const last = state.history.pop();
    if (!last) return false;
    state.board = cloneBoard(last.board);
    state.side = last.side;
    return true;
  }

  function uciToPseudoSan(beforeBoard, uci) {
    const s = String(uci || '').trim().toLowerCase();
    const m = s.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (!m) return s;
    const from = coordToRc(m[1]);
    const to = coordToRc(m[2]);
    if (!from || !to) return s;
    const piece = beforeBoard?.[from.r]?.[from.c] || '';
    const target = beforeBoard?.[to.r]?.[to.c] || '';
    const promo = m[3] || '';
    const pieceLetter = (() => {
      const p = String(piece || '');
      const t = p.toLowerCase();
      if (t === 'p') return '';
      if (t === 'n') return 'N';
      if (t === 'b') return 'B';
      if (t === 'r') return 'R';
      if (t === 'q') return 'Q';
      if (t === 'k') return 'K';
      return '';
    })();
    const isCapture = !!target;
    const toSq = m[2];
    if (!pieceLetter) {
      // pawn: include file on capture
      const file = m[1][0];
      const cap = isCapture ? `${file}x` : '';
      const prom = promo ? `=${promo.toUpperCase()}` : '';
      return `${cap}${toSq}${prom}`;
    }
    return `${pieceLetter}${isCapture ? 'x' : ''}${toSq}`;
  }

  async function studentFetchTree(studentId, bucket, password) {
    const qp = new URLSearchParams();
    qp.set('bucket', normalizeBucketKey(bucket));
    if (password) qp.set('password', String(password));
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/tree?${qp.toString()}`, { method: 'GET' });
    return await tfJson(resp);
  }

  async function studentFetchSubtopicPuzzles(studentId, subtopicId, bucket, page, pageSize, password) {
    const qp = new URLSearchParams();
    qp.set('bucket', normalizeBucketKey(bucket));
    qp.set('page', String(page || 1));
    qp.set('pageSize', String(pageSize || 10));
    if (password) qp.set('password', String(password));
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/subtopics/${encodeURIComponent(String(subtopicId))}/puzzles?${qp.toString()}`, { method: 'GET' });
    return await tfJson(resp);
  }

  async function studentPostAttempt(studentId, puzzleId, payload, password) {
    const body = { ...(payload || {}) };
    if (password) body.password = String(password);
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/puzzles/${encodeURIComponent(String(puzzleId))}/attempt`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return await tfJson(resp);
  }

  async function studentEngineAnalyze(studentId, fen, options, password) {
    const body = { fen: String(fen || ''), ...(options || {}) };
    if (password) body.password = String(password);
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/engine/analyze`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return await tfJson(resp);
  }

  async function studentApplyMove(studentId, fen, uci, password) {
    const body = { fen: String(fen || ''), uci: String(uci || '') };
    if (password) body.password = String(password);
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/apply-move`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return await tfJson(resp);
  }

  async function builderFetchPuzzles(subtopicId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}/puzzles`, {
      method: 'GET'
    });
    return await tfJson(resp);
  }

  async function builderCreatePuzzle(subtopicId, payload) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}/puzzles`, {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
    return await tfJson(resp);
  }

  async function engineAnalyze(payload) {
    const resp = await apiRequest('/api/teachers/tactics-fighter/engine/analyze', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
    return await tfJson(resp);
  }

  async function builderDeletePuzzle(puzzleId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/puzzles/${encodeURIComponent(String(puzzleId || ''))}`, {
      method: 'DELETE'
    });
    return await tfJson(resp);
  }

  async function builderFetchTree() {
    const resp = await apiRequest('/api/teachers/tactics-fighter/builder/tree', { method: 'GET' });
    return await tfJson(resp);
  }

  async function builderCreateCategory(name) {
    const resp = await apiRequest('/api/teachers/tactics-fighter/builder/categories', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderRenameCategory(categoryId, name) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderDeleteCategory(categoryId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}`, {
      method: 'DELETE'
    });
    return await tfJson(resp);
  }

  async function builderCreateTopic(categoryId, name) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}/topics`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderRenameTopic(topicId, name) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/topics/${encodeURIComponent(topicId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderDeleteTopic(topicId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/topics/${encodeURIComponent(topicId)}`, {
      method: 'DELETE'
    });
    return await tfJson(resp);
  }

  async function builderCreateSubtopic(topicId, name) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/topics/${encodeURIComponent(topicId)}/subtopics`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderRenameSubtopic(subtopicId, name) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderDeleteSubtopic(subtopicId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}`, {
      method: 'DELETE'
    });
    return await tfJson(resp);
  }

  async function builderFetchPuzzles(subtopicId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}/puzzles`, {
      method: 'GET'
    });
    return await tfJson(resp);
  }

  function renderShell({ role, players, mode }) {
    const playerName = players?.[0]?.name || 'Student';
    const playerId = players?.[0]?.studentId || '';
    const isTeacher = String(role || '').toLowerCase() === 'teacher';

    return `
      <div class="tf-app">
        <aside class="tf-sidebar" aria-label="Tactics Fighter sidebar">
          <div class="tf-side-title">⚔️ Tactics Fighter</div>
          <div class="tf-side-sub">${escapeHtml(playerName)}${playerId ? ` (${escapeHtml(playerId)})` : ''}</div>
          <div class="tf-side-sub" style="margin-top:-6px; opacity:0.9;">${escapeHtml(role || '')}</div>

          <div class="tf-nav" role="navigation" aria-label="Modes">
            <button type="button" class="tf-nav-btn ${mode === 'practice' ? 'is-active' : ''}" data-mode="practice">Practice</button>
            <button type="button" class="tf-nav-btn ${mode === 'challenge' ? 'is-active' : ''}" data-mode="challenge">Challenge</button>
            ${isTeacher ? `<button type="button" class="tf-nav-btn ${mode === 'builder' ? 'is-active' : ''}" data-mode="builder">Builder</button>` : ''}
            <button type="button" class="tf-nav-btn ${mode === 'settings' ? 'is-active' : ''}" data-mode="settings">Setting</button>
          </div>
        </aside>

        <main class="tf-main">
          <div class="tf-container">
            <div class="tf-card tf-root-card">
              <div class="tf-title">${mode === 'practice' ? 'Practice Mode' : mode === 'challenge' ? 'Challenge Mode' : mode === 'builder' ? 'Builder' : 'Setting'}</div>
              <div class="tf-muted">Tactics Fighter</div>
              <div id="tfMain" style="margin-top:12px;"></div>
            </div>
          </div>
        </main>
      </div>
    `;
  }

  function renderPractice() {
    const levels = [
      { key: 'beginner', label: 'Beginner' },
      { key: '400up', label: '400 up' },
      { key: '700up', label: '700 up' },
      { key: '1000up', label: '1000 up' },
      { key: '1500up', label: '1500 up' },
      { key: '2000up', label: '2000 up' },
      { key: '2500up', label: '2500 up' },
      { key: '2800up', label: '2800 up' }
    ];

    return `
      <div>
        <div class="tf-practice-grid">
          ${levels.map(l => `<button class="btn btn-primary tf-practice-btn" type="button" data-practice="${escapeHtml(l.key)}">${escapeHtml(l.label)}</button>`).join('')}
        </div>
        <div id="tfOutput" style="margin-top:12px; color:#111827;"></div>
      </div>
    `;
  }

  function renderChallenge() {
    return `
      <div>
        <div class="tf-section-title">Challenge Mode</div>
        <div style="color:#6b7280;">Coming soon.</div>
      </div>
    `;
  }

  function renderSettings() {
    return `
      <div>
        <div class="tf-section-title">Setting</div>
        <div style="color:#6b7280;">Coming soon.</div>
      </div>
    `;
  }

  function renderBuilder() {
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div class="tf-section-title">Builder</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label class="tf-muted" for="tfBuilderBucketSelect" style="font-weight:900;">Bucket</label>
            <select id="tfBuilderBucketSelect" class="tf-select" style="min-width:180px;">
              <option value="beginner">Beginner</option>
              <option value="400up">400 up</option>
              <option value="700up">700 up</option>
              <option value="1000up">1000 up</option>
              <option value="1500up">1500 up</option>
              <option value="2000up">2000 up</option>
              <option value="2500up">2500 up</option>
              <option value="2800up">2800 up</option>
            </select>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button id="tfBuilderCreateCategoryBtn" class="btn btn-primary" type="button">Create</button>
            <button id="tfBuilderRefreshBtn" class="btn btn-secondary" type="button">Refresh</button>
          </div>
        </div>
        <div class="tf-muted" style="margin-bottom:10px;">Manage Category → Topic → Subtopic → Puzzles</div>
        <div id="tfBuilderMsg" class="tf-builder-msg" style="display:none;"></div>
        <div id="tfBuilderTree"></div>
      </div>
    `;
  }

  function renderMode(mode) {
    if (mode === 'challenge') return renderChallenge();
    if (mode === 'builder') return renderBuilder();
    if (mode === 'settings') return renderSettings();
    return renderPractice();
  }

  window.initTacticsFighter = async function initTacticsFighter() {
    const root = document.getElementById('tacticsFighterRoot');
    if (!root) return;

    const players = Array.isArray(window.tacticsFighterPlayers) ? window.tacticsFighterPlayers : [];
    const role = new URLSearchParams(window.location.search).get('role') || '';
    const mode = normalizeMode(getUrlMode());
    const isTeacher = String(role || '').toLowerCase() === 'teacher';
    const publicStudentId = isTeacher ? '' : getPublicStudentId(players);
    const publicStudentPassword = isTeacher ? '' : getPublicStudentPassword();

    root.innerHTML = renderShell({ role, players, mode });

    const main = document.getElementById('tfMain');
    const setMain = (html) => { if (main) main.innerHTML = html; };
    const setOut = (html) => {
      const out = document.getElementById('tfOutput');
      if (out) out.innerHTML = html;
    };

    const loadConfigOnce = async () => {
      try {
        const cfg = await fetchConfig();
        return cfg;
      } catch {
        return null;
      }
    };
    const cfg = await loadConfigOnce();

    const ui = {
      builderTree: null,
      builderMsg: null,
      builderLoadedOnce: false,
      expanded: {
        cat: new Set(),
        topic: new Set(),
        subtopic: new Set(),
        puzzlesLoaded: new Set()
      },
      puzzlesBySubtopic: new Map()
      ,
      puzzlePageBySubtopic: new Map(),
      student: {
        bucket: (() => {
          try { return normalizeBucketKey(localStorage.getItem('tacticsFighterPracticeBucket') || 'beginner'); } catch { return 'beginner'; }
        })(),
        tree: null,
        view: 'bucket',
        categoryId: null,
        topicId: null,
        subtopicId: null,
        puzzles: [],
        page: 1,
        pageSize: 10,
        total: 0,
        runner: null
      }
    };

    function showBuilderMsg(type, text) {
      const el = document.getElementById('tfBuilderMsg');
      if (!el) return;
      el.style.display = 'block';
      el.classList.remove('ok', 'err');
      if (type === 'ok') el.classList.add('ok');
      if (type === 'err') el.classList.add('err');
      el.textContent = String(text || '');
    }

    function clearBuilderMsg() {
      const el = document.getElementById('tfBuilderMsg');
      if (!el) return;
      el.style.display = 'none';
      el.textContent = '';
      el.classList.remove('ok', 'err');
    }

    function renderMiniBoardHtml(fen) {
      const b = parseFenToBoard(fen);
      if (!b) return `<div class="tf-mini-board" aria-label="Mini board"></div>`;
      const sqs = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const isDark = (r + c) % 2 === 1;
          const p = b[r][c] || '';
          const src = p ? pieceImageSrc(p) : '';
          const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
          sqs.push(`<div class="tf-mini-sq ${isDark ? 'dark' : 'light'}">${img}</div>`);
        }
      }
      return `<div class="tf-mini-board" aria-label="Mini board">${sqs.join('')}</div>`;
    }

    function renderStudentCategories(categories) {
      const cats = Array.isArray(categories) ? categories : [];
      if (!cats.length) return `<div class="tf-muted">No categories for this bucket yet.</div>`;
      return `
        <div class="tf-section-title">Categories</div>
        <div class="tf-muted" style="margin-bottom:10px;">Pick a category to see topics.</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${cats.map((c) => `
            <button type="button" class="btn btn-secondary" data-stu-cat="${escapeHtml(String(c.id))}" style="text-align:left;">
              <strong>${escapeHtml(String(c.name || ''))}</strong>
            </button>
          `).join('')}
        </div>
      `;
    }

    function renderStudentTopics(category) {
      const topics = Array.isArray(category?.topics) ? category.topics : [];
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Topics</div>
            <div class="tf-muted">${escapeHtml(String(category?.name || ''))}</div>
          </div>
          <button type="button" class="btn btn-secondary" data-stu-back="categories">Back</button>
        </div>
        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${topics.length ? topics.map((t) => `
            <button type="button" class="btn btn-secondary" data-stu-topic="${escapeHtml(String(t.id))}" style="text-align:left;">
              <strong>${escapeHtml(String(t.name || ''))}</strong>
            </button>
          `).join('') : `<div class="tf-muted">No topics yet.</div>`}
        </div>
      `;
    }

    function renderStudentSubtopics(category, topic) {
      const subs = Array.isArray(topic?.subtopics) ? topic.subtopics : [];
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Subtopics</div>
            <div class="tf-muted">${escapeHtml(String(category?.name || ''))} → ${escapeHtml(String(topic?.name || ''))}</div>
          </div>
          <button type="button" class="btn btn-secondary" data-stu-back="topics">Back</button>
        </div>
        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${subs.length ? subs.map((s) => `
            <button type="button" class="btn btn-secondary" data-stu-subtopic="${escapeHtml(String(s.id))}" style="text-align:left;">
              <strong>${escapeHtml(String(s.name || ''))}</strong>
              <span class="tf-muted" style="margin-left:8px;">(${Number(s.puzzleCount || 0)} puzzles)</span>
            </button>
          `).join('') : `<div class="tf-muted">No subtopics yet.</div>`}
        </div>
      `;
    }

    function renderStudentPuzzles(puzzles, page, pageSize, total) {
      const list = Array.isArray(puzzles) ? puzzles : [];
      const totalPages = Math.max(1, Math.ceil(Math.max(0, Number(total || 0)) / Math.max(1, Number(pageSize || 10))));
      const p = Math.max(1, Number(page || 1));
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Puzzles</div>
            <div class="tf-muted">Click a puzzle or press Start.</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button type="button" class="btn btn-primary" data-stu-start="1">Start</button>
            <button type="button" class="btn btn-secondary" data-stu-back="subtopics">Back</button>
          </div>
        </div>

        <div style="margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div class="tf-muted">Page ${p} / ${totalPages} · ${Number(total || 0)} puzzles</div>
          <div style="display:flex; gap:10px;">
            <button type="button" class="btn btn-secondary" data-stu-page="prev" ${p <= 1 ? 'disabled' : ''}>Prev</button>
            <button type="button" class="btn btn-secondary" data-stu-page="next" ${p >= totalPages ? 'disabled' : ''}>Next</button>
          </div>
        </div>

        <div class="tf-puzzles-grid" style="margin-top:12px;">
          ${list.length ? list.map((pz, idx) => `
            <button type="button" class="tf-puzzle-card" data-stu-open-puzzle="${escapeHtml(String(pz.id))}" data-stu-idx="${idx}" aria-label="Open puzzle">
              <div style="position:relative;">
                ${renderMiniBoardHtml(pz.fen)}
                ${pz.completed ? `<div style="position:absolute; right:8px; top:8px; font-size:20px; font-weight:900; color:#16a34a;">✓</div>` : ''}
              </div>
            </button>
          `).join('') : `<div class="tf-muted">No puzzle is found.</div>`}
        </div>
      `;
    }

    function openStudentRunnerModal() {
      const puzzles = Array.isArray(ui.student.puzzles) ? ui.student.puzzles : [];
      if (!puzzles.length) return;
      const startIdx = Math.max(0, Math.min(puzzles.length - 1, Number(ui.student.runner?.index || 0)));
      const p0 = puzzles[startIdx];
      const startFen = String(p0?.fen || '').trim();
      const startBoard = parseFenToBoard(startFen);
      const startSide = fenSideToMove(startFen);
      ui.student.runner = {
        index: startIdx,
        movesUci: [],
        movesSan: [],
        selectedFrom: null,
        // board state (client-side, no legality validation)
        startFen,
        fen: startFen,
        board: startBoard || Array.from({ length: 8 }, () => Array(8).fill('')),
        side: startSide,
        history: [], // entries: { fen, board, side, movesUciLen, movesSanLen }
        // PV selection (chosen accepted line)
        lineIdx: null,
        lineUci: null,
        lineSan: null,
        busy: false
      };

      const modal = document.createElement('div');
      modal.className = 'vcp-modal-backdrop';
      modal.innerHTML = `
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Practice" style="width: calc(100vw - 40px); max-width: 1100px;">
          <div class="vcp-modal-header">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;">
              <div>
                <div style="font-weight:900;">Practice</div>
                <div class="tf-muted" id="tfStuRunnerMeta"></div>
              </div>
              <button type="button" class="btn btn-secondary" data-stu-runner-close="1">Close</button>
            </div>
          </div>
          <div class="vcp-modal-body">
            <div style="display:grid; grid-template-columns: 420px 1fr; gap:14px; align-items:start;">
              <div>
                <div id="tfStuRunnerBoard" class="tf-board" style="width:100%; aspect-ratio:1/1;"></div>
              </div>
              <div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                  <div class="tf-section-title" style="margin:0;">Moves</div>
                  <div style="display:flex; gap:10px;">
                    <button type="button" class="btn btn-secondary" data-stu-prev="1">←</button>
                    <button type="button" class="btn btn-secondary" data-stu-next="1">→</button>
                  </div>
                </div>
                <div id="tfStuRunnerMoves" style="margin-top:10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space:pre-wrap;"></div>
                <div id="tfStuRunnerMsg" class="tf-builder-msg" style="display:none; margin-top:10px;"></div>
                <div style="display:flex; gap:10px; align-items:center; margin-top:12px; flex-wrap:wrap;">
                  <button type="button" class="btn btn-secondary" data-stu-undo="1">Undo</button>
                  <button type="button" class="btn btn-primary" data-stu-submit="1">Submit Move</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const close = () => { try { document.body.removeChild(modal); } catch {} };
      const setMsg = (type, text) => {
        const el = modal.querySelector('#tfStuRunnerMsg');
        if (!el) return;
        el.style.display = 'block';
        el.classList.remove('ok', 'err');
        if (type === 'ok') el.classList.add('ok');
        if (type === 'err') el.classList.add('err');
        el.textContent = String(text || '');
      };
      const clearMsg = () => {
        const el = modal.querySelector('#tfStuRunnerMsg');
        if (!el) return;
        el.style.display = 'none';
        el.textContent = '';
        el.classList.remove('ok', 'err');
      };

      function renderBoardInteractive() {
        const host = modal.querySelector('#tfStuRunnerBoard');
        if (!host) return;
        const b = ui.student.runner.board;
        if (!b) { host.innerHTML = ''; return; }
        const sqs = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const isDark = (r + c) % 2 === 1;
            const coord = rcToCoord(r, c);
            const piece = b[r][c] || '';
            const src = piece ? pieceImageSrc(piece) : '';
            const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
            const sel = ui.student.runner.selectedFrom === coord ? ' is-selected' : '';
            sqs.push(
              `<button type="button" class="tf-sq tf-sq-btn ${isDark ? 'dark' : 'light'}${sel}" data-stu-sq="${escapeHtml(coord)}">${img}</button>`
            );
          }
        }
        // Host is already a square 8x8 grid via .tf-board; render squares directly.
        host.innerHTML = sqs.join('');
      }

      function currentPuzzle() {
        const puzzles = Array.isArray(ui.student.puzzles) ? ui.student.puzzles : [];
        return puzzles[ui.student.runner.index] || null;
      }

      function renderRunner() {
        clearMsg();
        const pz = currentPuzzle();
        if (!pz) return close();
        const meta = modal.querySelector('#tfStuRunnerMeta');
        if (meta) meta.textContent = `Puzzle ${ui.student.runner.index + 1} / ${ui.student.puzzles.length} · ${pz.completed ? 'Completed' : 'Not completed'}`;
        const movesEl = modal.querySelector('#tfStuRunnerMoves');
        if (movesEl) {
          const html = formatPvWithMoveNumbersHtml(ui.student.runner.startFen || pz.fen, ui.student.runner.movesSan);
          movesEl.innerHTML = html || escapeHtml(ui.student.runner.movesUci.join(' '));
        }
        renderBoardInteractive();
      }

      function chooseAcceptedLineForFirstMove(pz, firstUci) {
        const sol = pz?.solutions && typeof pz.solutions === 'object' ? pz.solutions : {};
        const lines = Array.isArray(sol.acceptedLines) ? sol.acceptedLines : (Array.isArray(sol.lines) ? sol.lines : []);
        const uci = String(firstUci || '').trim().toLowerCase();
        for (let i = 0; i < lines.length; i++) {
          const pvUci = Array.isArray(lines[i]?.pvUci) ? lines[i].pvUci : null;
          if (!pvUci || !pvUci.length) continue;
          if (String(pvUci[0] || '').trim().toLowerCase() === uci) return { idx: i, line: lines[i] };
        }
        return null;
      }

      function uciAtPlyMatches(uciList, plyIndex, uci) {
        if (!Array.isArray(uciList)) return false;
        const want = String(uciList[plyIndex] || '').trim().toLowerCase();
        return want && want === String(uci || '').trim().toLowerCase();
      }

      async function submitMoveAndReply() {
        const pz = currentPuzzle();
        if (!pz) return;
        if (ui.student.runner.busy) return;
        const moves = ui.student.runner.movesUci.slice();
        if (!moves.length) return;

        const plyIndex = moves.length - 1;
        const studentUci = moves[plyIndex];
        const beforeBoard = ui.student.runner.history.length ? ui.student.runner.history[ui.student.runner.history.length - 1].board : null;

        // Determine correctness vs PV accepted line (choose on first move).
        if (ui.student.runner.lineIdx == null) {
          const chosen = chooseAcceptedLineForFirstMove(pz, studentUci);
          if (chosen) {
            ui.student.runner.lineIdx = chosen.idx;
            ui.student.runner.lineUci = Array.isArray(chosen.line?.pvUci) ? chosen.line.pvUci.map((x) => String(x || '').trim().toLowerCase()) : null;
            ui.student.runner.lineSan = Array.isArray(chosen.line?.pvSan) ? chosen.line.pvSan.map((x) => String(x || '').trim()) : null;
          }
        }

        const lineUci = ui.student.runner.lineUci;
        const lineSan = ui.student.runner.lineSan;
        const isCorrect = uciAtPlyMatches(lineUci, plyIndex, studentUci);

        // SAN is already appended during click-to-move via /apply-move.
        // Keep it aligned with accepted PV SAN if needed.
        if (Array.isArray(lineSan) && isCorrect) {
          ui.student.runner.movesSan = lineSan.slice(0, moves.length);
        }

        ui.student.runner.busy = true;
        try {
          clearMsg();

          if (isCorrect && Array.isArray(lineUci) && plyIndex + 1 < lineUci.length) {
            // PV reply move (computer)
            const replyUci = lineUci[plyIndex + 1];
            const r0 = await studentApplyMove(publicStudentId, ui.student.runner.fen, replyUci, publicStudentPassword);
            if (r0 && r0.ok && r0.fenAfter) {
              ui.student.runner.history.push({
                fen: ui.student.runner.fen,
                board: cloneBoard(ui.student.runner.board),
                side: ui.student.runner.side,
                movesUciLen: ui.student.runner.movesUci.length,
                movesSanLen: ui.student.runner.movesSan.length
              });
              ui.student.runner.fen = String(r0.fenAfter);
              ui.student.runner.board = parseFenToBoard(ui.student.runner.fen) || ui.student.runner.board;
              ui.student.runner.side = fenSideToMove(ui.student.runner.fen);
              ui.student.runner.movesUci.push(replyUci);
              if (Array.isArray(lineSan)) ui.student.runner.movesSan = lineSan.slice(0, ui.student.runner.movesUci.length);
              else ui.student.runner.movesSan.push(String(r0.san || replyUci));
            }
          } else if (!isCorrect) {
            // Engine reply on wrong move
            const fenNow = ui.student.runner.fen;
            const eng = await studentEngineAnalyze(publicStudentId, fenNow, { depth: 12, pvPlies: 6 }, publicStudentPassword);
            const bestUci = String(eng?.bestMove || eng?.lines?.[0]?.bestMove || eng?.lines?.[0]?.pvUci?.[0] || '').trim().toLowerCase();
            if (bestUci) {
              const r1 = await studentApplyMove(publicStudentId, ui.student.runner.fen, bestUci, publicStudentPassword);
              if (r1 && r1.ok && r1.fenAfter) {
                ui.student.runner.history.push({
                  fen: ui.student.runner.fen,
                  board: cloneBoard(ui.student.runner.board),
                  side: ui.student.runner.side,
                  movesUciLen: ui.student.runner.movesUci.length,
                  movesSanLen: ui.student.runner.movesSan.length
                });
                ui.student.runner.fen = String(r1.fenAfter);
                ui.student.runner.board = parseFenToBoard(ui.student.runner.fen) || ui.student.runner.board;
                ui.student.runner.side = fenSideToMove(ui.student.runner.fen);
                ui.student.runner.movesUci.push(bestUci);
                const engSan0 = String(r1.san || (Array.isArray(eng?.lines?.[0]?.pvSan) ? (eng.lines[0].pvSan[0] || '') : '') || bestUci);
                ui.student.runner.movesSan = ui.student.runner.movesSan.concat([engSan0]);
              }
            }
          }

          // Log attempt once per student submission (send the full sequence including reply move, if any)
          const last = ui.student.runner.movesUci[ui.student.runner.movesUci.length - 1];
          const out = await studentPostAttempt(publicStudentId, pz.id, {
            bucket: ui.student.bucket,
            subtopicId: ui.student.subtopicId,
            movesUci: ui.student.runner.movesUci.slice(),
            plyIndex: ui.student.runner.movesUci.length - 1,
            moveUci: last
          }, publicStudentPassword);

          if (out.completed) {
            pz.completed = true;
            setMsg('ok', 'Correct. Puzzle completed.');
          } else if (out.correctPrefix) {
            setMsg('ok', 'Correct. Computer replied.');
          } else {
            setMsg('err', 'Wrong. Engine replied.');
          }
          renderRunner();
        } catch (e) {
          setMsg('err', e?.message || String(e));
        } finally {
          ui.student.runner.busy = false;
        }
      }

      modal.addEventListener('click', (ev) => {
        const t = ev.target;
        if (!(t instanceof Element)) return;
        if (t.closest('[data-stu-runner-close]')) return close();
        if (t.closest('[data-stu-prev]')) {
          ui.student.runner.index = Math.max(0, ui.student.runner.index - 1);
          ui.student.runner.movesUci = [];
          ui.student.runner.selectedFrom = null;
          return renderRunner();
        }
        if (t.closest('[data-stu-next]')) {
          ui.student.runner.index = Math.min(ui.student.puzzles.length - 1, ui.student.runner.index + 1);
          ui.student.runner.movesUci = [];
          ui.student.runner.selectedFrom = null;
          return renderRunner();
        }
        if (t.closest('[data-stu-undo]')) {
          // Undo one ply (restores previous fen/board)
          const last = ui.student.runner.history.pop();
          if (last) {
            ui.student.runner.fen = String(last.fen || ui.student.runner.fen);
            ui.student.runner.board = cloneBoard(last.board) || ui.student.runner.board;
            ui.student.runner.side = last.side || ui.student.runner.side;
            ui.student.runner.movesUci = ui.student.runner.movesUci.slice(0, Math.max(0, Number(last.movesUciLen || 0)));
            ui.student.runner.movesSan = ui.student.runner.movesSan.slice(0, Math.max(0, Number(last.movesSanLen || 0)));
          } else {
            // fallback: clear selection only
          }
          ui.student.runner.selectedFrom = null;
          return renderRunner();
        }
        if (t.closest('[data-stu-submit]')) {
          return submitMoveAndReply();
        }
        const sq = t.closest('[data-stu-sq]');
        if (sq) {
          const coord = String(sq.getAttribute('data-stu-sq') || '').trim();
          if (!coord) return;
          if (!ui.student.runner.selectedFrom) {
            ui.student.runner.selectedFrom = coord;
            return renderRunner();
          }
          const from = ui.student.runner.selectedFrom;
          const to = coord;
          ui.student.runner.selectedFrom = null;
          if (from === to) return renderRunner();

          const uci = `${from}${to}`;
          (async () => {
            try {
              clearMsg();
              // Save state for undo BEFORE applying.
              ui.student.runner.history.push({
                fen: ui.student.runner.fen,
                board: cloneBoard(ui.student.runner.board),
                side: ui.student.runner.side,
                movesUciLen: ui.student.runner.movesUci.length,
                movesSanLen: ui.student.runner.movesSan.length
              });

              const r = await studentApplyMove(publicStudentId, ui.student.runner.fen, uci, publicStudentPassword);
              if (!r || !r.ok || !r.fenAfter) throw new Error('Illegal move');

              ui.student.runner.fen = String(r.fenAfter);
              ui.student.runner.board = parseFenToBoard(ui.student.runner.fen) || ui.student.runner.board;
              ui.student.runner.side = fenSideToMove(ui.student.runner.fen);
              ui.student.runner.movesUci.push(String(r.uci || uci));
              ui.student.runner.movesSan.push(String(r.san || uci));
              renderRunner();
            } catch (err) {
              // rollback history entry
              const last = ui.student.runner.history.pop();
              if (last) {
                ui.student.runner.fen = String(last.fen || ui.student.runner.fen);
                ui.student.runner.board = cloneBoard(last.board) || ui.student.runner.board;
                ui.student.runner.side = last.side || ui.student.runner.side;
              }
              setMsg('err', err?.message || String(err));
              renderRunner();
            }
          })();
          return;
        }
      });

      renderRunner();
    }

    function renderBuilderTree(categories) {
      const host = document.getElementById('tfBuilderTree');
      if (!host) return;

      const cats = Array.isArray(categories) ? categories : [];
      if (!cats.length) {
        host.innerHTML = `<div class="tf-muted">No categories yet. Click <strong>Create</strong> to add one.</div>`;
        return;
      }

      host.innerHTML = cats.map((c) => {
        const catId = String(c.id);
        const catOpen = ui.expanded.cat.has(catId);
        const topics = Array.isArray(c.topics) ? c.topics : [];
        return `
          <div class="tf-tree-card">
            <div class="tf-tree-row">
              <button type="button" class="tf-plus ${catOpen ? 'is-open' : ''}" data-tf-toggle="cat" data-id="${escapeHtml(catId)}" aria-label="Toggle category">${catOpen ? '−' : '+'}</button>
              <div class="tf-tree-title">${escapeHtml(String(c.name || ''))}</div>
              <div class="tf-tree-actions">
                <button type="button" class="btn btn-secondary btn-small" data-tf-add-topic="${escapeHtml(catId)}">+ Topic</button>
                <button type="button" class="btn btn-secondary btn-small" data-tf-rename-cat="${escapeHtml(catId)}">Rename</button>
                <button type="button" class="btn btn-danger btn-small" data-tf-del-cat="${escapeHtml(catId)}">Delete</button>
              </div>
            </div>
            ${catOpen ? `
              <div class="tf-tree-children">
                ${topics.length ? topics.map((t) => {
                  const tid = String(t.id);
                  const tOpen = ui.expanded.topic.has(tid);
                  const subs = Array.isArray(t.subtopics) ? t.subtopics : [];
                  return `
                    <div class="tf-tree-card tf-tree-card--nested">
                      <div class="tf-tree-row">
                        <button type="button" class="tf-plus ${tOpen ? 'is-open' : ''}" data-tf-toggle="topic" data-id="${escapeHtml(tid)}" aria-label="Toggle topic">${tOpen ? '−' : '+'}</button>
                        <div class="tf-tree-title">${escapeHtml(String(t.name || ''))}</div>
                        <div class="tf-tree-actions">
                          <button type="button" class="btn btn-secondary btn-small" data-tf-add-subtopic="${escapeHtml(tid)}">+ Subtopic</button>
                          <button type="button" class="btn btn-secondary btn-small" data-tf-rename-topic="${escapeHtml(tid)}">Rename</button>
                          <button type="button" class="btn btn-danger btn-small" data-tf-del-topic="${escapeHtml(tid)}">Delete</button>
                        </div>
                      </div>
                      ${tOpen ? `
                        <div class="tf-tree-children">
                          ${subs.length ? subs.map((s) => {
                            const sid = String(s.id);
                            const sOpen = ui.expanded.subtopic.has(sid);
                            const puzzlesLoaded = ui.expanded.puzzlesLoaded.has(sid);
                            const puzzles = ui.puzzlesBySubtopic.get(sid) || [];
                            const perPage = 10;
                            const page = Math.max(0, Number(ui.puzzlePageBySubtopic.get(sid) || 0) || 0);
                            const maxPage = Math.max(0, Math.ceil(puzzles.length / perPage) - 1);
                            const safePage = Math.min(page, maxPage);
                            if (safePage !== page) ui.puzzlePageBySubtopic.set(sid, safePage);
                            const start = safePage * perPage;
                            const pageItems = puzzles.slice(start, start + perPage);
                            return `
                              <div class="tf-tree-card tf-tree-card--nested2">
                                <div class="tf-tree-row">
                                  <button type="button" class="tf-plus ${sOpen ? 'is-open' : ''}" data-tf-toggle="subtopic" data-id="${escapeHtml(sid)}" aria-label="Toggle subtopic">${sOpen ? '−' : '+'}</button>
                                  <div class="tf-tree-title">${escapeHtml(String(s.name || ''))}</div>
                                  <div class="tf-tree-actions">
                                    <button type="button" class="btn btn-primary btn-small" data-tf-add-puzzle="${escapeHtml(sid)}">Add puzzles</button>
                                    <button type="button" class="btn btn-secondary btn-small" data-tf-load-puzzles="${escapeHtml(sid)}">${puzzlesLoaded ? 'Reload' : 'Load'} puzzles</button>
                                    <button type="button" class="btn btn-secondary btn-small" data-tf-rename-subtopic="${escapeHtml(sid)}">Rename</button>
                                    <button type="button" class="btn btn-danger btn-small" data-tf-del-subtopic="${escapeHtml(sid)}">Delete</button>
                                  </div>
                                </div>
                                ${sOpen ? `
                                  <div class="tf-tree-children">
                                    <div class="tf-muted">Puzzles: ${escapeHtml(String(puzzles.length))}</div>
                                    <div class="tf-puzzle-list">
                                      ${puzzles.length ? pageItems.map(p => `
                                        <button type="button" class="tf-puzzle-card" data-tf-open-puzzle="${escapeHtml(String(p.id || ''))}" data-tf-subtopic="${escapeHtml(sid)}">
                                          <div class="tf-puzzle-card-row">
                                            ${renderMiniBoardHtml(String(p.fen || ''))}
                                            <div style="min-width:0;">
                                              <div class="tf-puzzle-title">Puzzle #${escapeHtml(String(p.id || ''))}</div>
                                              <div class="tf-puzzle-meta">${escapeHtml(String(p.createdAt || ''))}</div>
                                            </div>
                                          </div>
                                        </button>
                                      `).join('') : `<div class="tf-muted">No puzzles loaded.</div>`}
                                    </div>
                                    ${puzzles.length > perPage ? `
                                      <div class="tf-pagination">
                                        <div class="tf-page-label">Page ${escapeHtml(String(safePage + 1))} / ${escapeHtml(String(maxPage + 1))}</div>
                                        <button type="button" class="btn btn-secondary btn-small" data-tf-page-prev="${escapeHtml(sid)}" ${safePage <= 0 ? 'disabled' : ''}>Prev</button>
                                        <button type="button" class="btn btn-secondary btn-small" data-tf-page-next="${escapeHtml(sid)}" ${safePage >= maxPage ? 'disabled' : ''}>Next</button>
                                      </div>
                                    ` : ''}
                                  </div>
                                ` : ''}
                              </div>
                            `;
                          }).join('') : `<div class="tf-muted">No subtopics.</div>`}
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('') : `<div class="tf-muted">No topics.</div>`}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    function formatPvWithMoveNumbersHtml(fen, pvSan) {
      const parts = String(fen || '').trim().split(/\s+/);
      const side = (parts[1] === 'b') ? 'b' : 'w';
      const fullmove = Math.max(1, Number(parts[5] || 1) || 1);
      const moves = Array.isArray(pvSan) ? pvSan.map(String).filter(Boolean) : [];
      if (!moves.length) return '';

      const lines = [];
      let idx = 0;
      let m = fullmove;

      if (side === 'b') {
        const b = moves[idx++];
        if (b) lines.push(`${m}. ... ${b}`);
        m += 1;
      }

      while (idx < moves.length) {
        const w = moves[idx++] || '';
        const b = moves[idx++] || '';
        if (w && b) lines.push(`${m}. ${w} ${b}`);
        else if (w) lines.push(`${m}. ${w}`);
        m += 1;
      }

      return lines.map(escapeHtml).join('<br>');
    }

    function getBuilderBucket() {
      try {
        const v = String(localStorage.getItem('tacticsFighterBuilderBucket') || '').trim();
        return v || 'beginner';
      } catch {}
      return 'beginner';
    }

    function setBuilderBucket(bucket) {
      try { localStorage.setItem('tacticsFighterBuilderBucket', String(bucket || 'beginner')); } catch {}
    }

    async function builderRefresh() {
      clearBuilderMsg();
      showBuilderMsg('ok', 'Loading...');
      try {
        const bucket = getBuilderBucket();
        const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/tree?bucket=${encodeURIComponent(bucket)}`, { method: 'GET' });
        const data = await tfJson(resp);
        renderBuilderTree(data.categories || []);
        clearBuilderMsg();
        ui.builderLoadedOnce = true;
      } catch (e) {
        showBuilderMsg('err', e?.message || String(e));
      }
    }

    async function promptText(title, placeholder) {
      const v = prompt(String(title || ''), String(placeholder || ''));
      if (v == null) return null;
      return String(v).trim();
    }

    function studentFindCategoryById(cid) {
      const cats = Array.isArray(ui.student.tree?.categories) ? ui.student.tree.categories : [];
      return cats.find((c) => String(c.id) === String(cid)) || null;
    }

    function studentFindTopicById(category, tid) {
      const topics = Array.isArray(category?.topics) ? category.topics : [];
      return topics.find((t) => String(t.id) === String(tid)) || null;
    }

    async function studentLoadTree(bucket) {
      ui.student.bucket = normalizeBucketKey(bucket);
      try { localStorage.setItem('tacticsFighterPracticeBucket', ui.student.bucket); } catch {}
      if (!publicStudentId) throw new Error('Missing student id');
      const tree = await studentFetchTree(publicStudentId, ui.student.bucket, publicStudentPassword);
      ui.student.tree = tree;
      return tree;
    }

    async function studentShowCategories(bucket) {
      setOut(`<div class="tf-muted">Loading...</div>`);
      try {
        const tree = await studentLoadTree(bucket);
        ui.student.view = 'categories';
        ui.student.categoryId = null;
        ui.student.topicId = null;
        ui.student.subtopicId = null;
        setOut(renderStudentCategories(tree.categories || []));
      } catch (e) {
        setOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function studentOpenSubtopic(subtopicId) {
      ui.student.view = 'puzzles';
      ui.student.subtopicId = String(subtopicId);
      ui.student.page = 1;
      setOut(`<div class="tf-muted">Loading puzzles...</div>`);
      try {
        const data = await studentFetchSubtopicPuzzles(publicStudentId, ui.student.subtopicId, ui.student.bucket, ui.student.page, ui.student.pageSize, publicStudentPassword);
        ui.student.puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];
        ui.student.total = Number(data.total || 0);
        setOut(renderStudentPuzzles(ui.student.puzzles, ui.student.page, ui.student.pageSize, ui.student.total));
      } catch (e) {
        setOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function studentChangePuzzlePage(dir) {
      const total = Number(ui.student.total || 0);
      const pageSize = Number(ui.student.pageSize || 10);
      const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
      const next = dir === 'next' ? Math.min(totalPages, ui.student.page + 1) : Math.max(1, ui.student.page - 1);
      if (next === ui.student.page) return;
      ui.student.page = next;
      setOut(`<div class="tf-muted">Loading puzzles...</div>`);
      try {
        const data = await studentFetchSubtopicPuzzles(publicStudentId, ui.student.subtopicId, ui.student.bucket, ui.student.page, ui.student.pageSize, publicStudentPassword);
        ui.student.puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];
        ui.student.total = Number(data.total || 0);
        setOut(renderStudentPuzzles(ui.student.puzzles, ui.student.page, ui.student.pageSize, ui.student.total));
      } catch (e) {
        setOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    const activateMode = (m) => {
      const nm = normalizeMode(m);
      setUrlMode(nm);
      root.querySelectorAll('.tf-nav-btn').forEach((b) => {
        const bm = String(b.getAttribute('data-mode') || '');
        b.classList.toggle('is-active', bm === nm);
      });
      setMain(renderMode(nm));
      // Keep the card title in sync when switching modes (avoid showing "Practice Mode" while on Builder).
      try {
        const titleEl = root.querySelector('.tf-title');
        if (titleEl) titleEl.textContent = (nm === 'practice' ? 'Practice Mode' : nm === 'challenge' ? 'Challenge Mode' : nm === 'builder' ? 'Builder' : 'Setting');
      } catch {}
      if (nm === 'practice' && !isTeacher && ui.student.tree && ui.student.view !== 'bucket') {
        if (ui.student.view === 'categories') {
          setOut(renderStudentCategories(ui.student.tree.categories || []));
        } else if (ui.student.view === 'topics') {
          const cat = studentFindCategoryById(ui.student.categoryId);
          setOut(cat ? renderStudentTopics(cat) : renderStudentCategories(ui.student.tree.categories || []));
        } else if (ui.student.view === 'subtopics') {
          const cat = studentFindCategoryById(ui.student.categoryId);
          const topic = studentFindTopicById(cat, ui.student.topicId);
          setOut((cat && topic) ? renderStudentSubtopics(cat, topic) : renderStudentCategories(ui.student.tree.categories || []));
        } else if (ui.student.view === 'puzzles') {
          setOut(renderStudentPuzzles(ui.student.puzzles, ui.student.page, ui.student.pageSize, ui.student.total));
        } else {
          setOut(renderStudentCategories(ui.student.tree.categories || []));
        }
      } else if (cfg) {
        setOut(`<div style="color:#16a34a; font-weight:800;">API OK</div><div style="color:#6b7280; margin-top:4px;">${escapeHtml(cfg.version || '')}</div>`);
      } else {
        setOut(`<div style="color:#6b7280;">API not ready (ok for now).</div>`);
      }

      // Builder wire-up (teacher only)
      if (nm === 'builder') {
        const createBtn = document.getElementById('tfBuilderCreateCategoryBtn');
        const refreshBtn = document.getElementById('tfBuilderRefreshBtn');
        const bucketSel = document.getElementById('tfBuilderBucketSelect');
        if (bucketSel) {
          bucketSel.value = getBuilderBucket();
          bucketSel.addEventListener('change', () => {
            setBuilderBucket(bucketSel.value);
            builderRefresh();
          });
        }
        createBtn?.addEventListener('click', async () => {
          const name = await promptText('Create category (unique)', 'Category name');
          if (!name) return;
          clearBuilderMsg();
          try {
            const bucket = getBuilderBucket();
            const resp = await apiRequest('/api/teachers/tactics-fighter/builder/categories', {
              method: 'POST',
              body: JSON.stringify({ name, bucket })
            });
            await tfJson(resp);
            showBuilderMsg('ok', 'Created.');
            await builderRefresh();
          } catch (e) {
            showBuilderMsg('err', e?.message || String(e));
          }
        });
        refreshBtn?.addEventListener('click', () => builderRefresh());

        // Delegated actions
        const tree = document.getElementById('tfBuilderTree');
        tree?.addEventListener('click', async (ev) => {
          const t = ev.target;
          const toggleBtn = t?.closest?.('[data-tf-toggle]');
          if (toggleBtn) {
            const kind = String(toggleBtn.getAttribute('data-tf-toggle') || '');
            const id = String(toggleBtn.getAttribute('data-id') || '');
            if (!id) return;
            const set = kind === 'cat' ? ui.expanded.cat : kind === 'topic' ? ui.expanded.topic : ui.expanded.subtopic;
            const wasOpen = set.has(id);
            if (wasOpen) {
              set.delete(id);
              await builderRefresh();
              return;
            }
            set.add(id);
            // Auto-load puzzles on first open of a subtopic (no need to click Load).
            if (kind === 'subtopic' && !ui.expanded.puzzlesLoaded.has(id)) {
              try {
                const data = await builderFetchPuzzles(id);
                ui.puzzlesBySubtopic.set(id, Array.isArray(data.puzzles) ? data.puzzles : []);
                ui.expanded.puzzlesLoaded.add(id);
                ui.puzzlePageBySubtopic.set(id, 0);
              } catch (e) {
                showBuilderMsg('err', e?.message || String(e));
              }
            }
            await builderRefresh();
            return;
          }

          const addTopicBtn = t?.closest?.('[data-tf-add-topic]');
          if (addTopicBtn) {
            const cid = String(addTopicBtn.getAttribute('data-tf-add-topic') || '');
            const name = await promptText('Create topic (unique in category)', 'Topic name');
            if (!name) return;
            try { await builderCreateTopic(cid, name); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const addSubBtn = t?.closest?.('[data-tf-add-subtopic]');
          if (addSubBtn) {
            const tid = String(addSubBtn.getAttribute('data-tf-add-subtopic') || '');
            const name = await promptText('Create subtopic (unique in topic)', 'Subtopic name');
            if (!name) return;
            try { await builderCreateSubtopic(tid, name); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const renCatBtn = t?.closest?.('[data-tf-rename-cat]');
          if (renCatBtn) {
            const cid = String(renCatBtn.getAttribute('data-tf-rename-cat') || '');
            const name = await promptText('Rename category', 'New name');
            if (!name) return;
            try { await builderRenameCategory(cid, name); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const delCatBtn = t?.closest?.('[data-tf-del-cat]');
          if (delCatBtn) {
            const cid = String(delCatBtn.getAttribute('data-tf-del-cat') || '');
            const ok = confirm('Delete this category? (Topics/Subtopics/Puzzles will be deleted too)');
            if (!ok) return;
            try { await builderDeleteCategory(cid); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const renTopicBtn = t?.closest?.('[data-tf-rename-topic]');
          if (renTopicBtn) {
            const tid = String(renTopicBtn.getAttribute('data-tf-rename-topic') || '');
            const name = await promptText('Rename topic', 'New name');
            if (!name) return;
            try { await builderRenameTopic(tid, name); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const delTopicBtn = t?.closest?.('[data-tf-del-topic]');
          if (delTopicBtn) {
            const tid = String(delTopicBtn.getAttribute('data-tf-del-topic') || '');
            const ok = confirm('Delete this topic? (Subtopics/Puzzles will be deleted too)');
            if (!ok) return;
            try { await builderDeleteTopic(tid); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const renSubBtn = t?.closest?.('[data-tf-rename-subtopic]');
          if (renSubBtn) {
            const sid = String(renSubBtn.getAttribute('data-tf-rename-subtopic') || '');
            const name = await promptText('Rename subtopic', 'New name');
            if (!name) return;
            try { await builderRenameSubtopic(sid, name); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const delSubBtn = t?.closest?.('[data-tf-del-subtopic]');
          if (delSubBtn) {
            const sid = String(delSubBtn.getAttribute('data-tf-del-subtopic') || '');
            const ok = confirm('Delete this subtopic? (Puzzles will be deleted too)');
            if (!ok) return;
            try { await builderDeleteSubtopic(sid); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const loadPuzzlesBtn = t?.closest?.('[data-tf-load-puzzles]');
          if (loadPuzzlesBtn) {
            const sid = String(loadPuzzlesBtn.getAttribute('data-tf-load-puzzles') || '');
            if (!sid) return;
            try {
              const data = await builderFetchPuzzles(sid);
              ui.puzzlesBySubtopic.set(sid, Array.isArray(data.puzzles) ? data.puzzles : []);
              ui.expanded.puzzlesLoaded.add(sid);
              ui.expanded.subtopic.add(sid);
              ui.puzzlePageBySubtopic.set(sid, 0);
              await builderRefresh();
            } catch (e) {
              showBuilderMsg('err', e?.message || String(e));
            }
            return;
          }

          const pagePrevBtn = t?.closest?.('[data-tf-page-prev]');
          if (pagePrevBtn) {
            const sid = String(pagePrevBtn.getAttribute('data-tf-page-prev') || '');
            const cur = Number(ui.puzzlePageBySubtopic.get(sid) || 0) || 0;
            ui.puzzlePageBySubtopic.set(sid, Math.max(0, cur - 1));
            await builderRefresh();
            return;
          }

          const pageNextBtn = t?.closest?.('[data-tf-page-next]');
          if (pageNextBtn) {
            const sid = String(pageNextBtn.getAttribute('data-tf-page-next') || '');
            const cur = Number(ui.puzzlePageBySubtopic.get(sid) || 0) || 0;
            ui.puzzlePageBySubtopic.set(sid, cur + 1);
            await builderRefresh();
            return;
          }

          const openPuzzleBtn = t?.closest?.('[data-tf-open-puzzle]');
          if (openPuzzleBtn) {
            const sid = String(openPuzzleBtn.getAttribute('data-tf-subtopic') || '');
            const pid = String(openPuzzleBtn.getAttribute('data-tf-open-puzzle') || '');
            const puzzles = ui.puzzlesBySubtopic.get(sid) || [];
            const p = puzzles.find((x) => String(x?.id || '') === pid);
            if (!p) return;
            openPuzzleDetailModal({ subtopicId: sid, puzzle: p }).catch((e) => showBuilderMsg('err', e?.message || String(e)));
            return;
          }

          const addPuzzleBtn = t?.closest?.('[data-tf-add-puzzle]');
          if (addPuzzleBtn) {
            const sid = String(addPuzzleBtn.getAttribute('data-tf-add-puzzle') || '');
            if (!sid) return;
            openAddPuzzleModal(sid).catch((e) => showBuilderMsg('err', e?.message || String(e)));
            return;
          }
        });

        if (!ui.builderLoadedOnce) {
          builderRefresh();
        }
      }
    };

    async function openPuzzleDetailModal({ subtopicId, puzzle }) {
      const fen = String(puzzle?.fen || '').trim();
      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfPuzzleDetailBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Puzzle detail" style="width: calc(100vw - 40px); max-width: 1400px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Puzzle #${escapeHtml(String(puzzle?.id || ''))}</div>
              <button id="tfPuzzleDetailClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-modal-grid">
                <div>
                  <div class="tf-board" id="tfPuzzleDetailBoard" aria-label="Puzzle board"></div>
                  <div class="tf-field">
                    <label>FEN</label>
                    <textarea class="tf-textarea" rows="3" readonly>${escapeHtml(fen)}</textarea>
                  </div>
                </div>
                <div>
                  <div class="tf-section-title">Answers</div>
                  <div id="tfPuzzleDetailAnswers" class="tf-lines"></div>
                  <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px; flex-wrap:wrap;">
                    <button id="tfPuzzleDeleteBtn" class="btn btn-danger" type="button">Delete</button>
                    <button id="tfPuzzleCloseBtn" class="btn btn-secondary" type="button">Close</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };
      host.querySelector('#tfPuzzleDetailClose')?.addEventListener('click', close);
      host.querySelector('#tfPuzzleCloseBtn')?.addEventListener('click', close);
      host.querySelector('#tfPuzzleDetailBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfPuzzleDetailBackdrop') close();
      });

      // Render board
      try {
        const b = parseFenToBoard(fen);
        const boardEl = host.querySelector('#tfPuzzleDetailBoard');
        if (boardEl) {
          const sqs = [];
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const isDark = (r + c) % 2 === 1;
              const p = b && b[r] ? (b[r][c] || '') : '';
              const src = p ? pieceImageSrc(p) : '';
              const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
              sqs.push(`<div class="tf-sq ${isDark ? 'dark' : 'light'}">${img}</div>`);
            }
          }
          boardEl.innerHTML = sqs.join('');
        }
      } catch {}

      // Render answers
      const answersEl = host.querySelector('#tfPuzzleDetailAnswers');
      const sol = puzzle?.solutions && typeof puzzle.solutions === 'object' ? puzzle.solutions : null;
      const accepted = Array.isArray(sol?.acceptedLines) ? sol.acceptedLines : null;
      const lines = accepted && accepted.length ? accepted : (Array.isArray(sol?.lines) ? sol.lines : []);
      const html = lines.length ? lines.map((ln) => {
        const mp = String(ln?.multiPv || 1);
        const scoreObj = ln?.score || {};
        const score = (scoreObj && Object.prototype.hasOwnProperty.call(scoreObj, 'mate'))
          ? `mate ${Number(scoreObj.mate) || 0}`
          : `cp ${Number(scoreObj.cp) || 0}`;
        const pv = formatPvWithMoveNumbersHtml(fen, ln?.pvSan);
        const fallback = Array.isArray(ln?.pvUci) ? escapeHtml(ln.pvUci.join(' ')) : '';
        return `<div class="tf-line"><div class="tf-line-title">#${escapeHtml(mp)} · ${escapeHtml(score)}</div><div class="tf-line-meta">${pv || fallback}</div></div>`;
      }).join('') : `<div class="tf-muted">No answers saved.</div>`;
      if (answersEl) answersEl.innerHTML = html;

      host.querySelector('#tfPuzzleDeleteBtn')?.addEventListener('click', async () => {
        const ok = confirm('Delete this puzzle?');
        if (!ok) return;
        await builderDeletePuzzle(puzzle?.id);
        // refresh puzzles in this subtopic
        const data = await builderFetchPuzzles(subtopicId);
        ui.puzzlesBySubtopic.set(subtopicId, Array.isArray(data.puzzles) ? data.puzzles : []);
        ui.expanded.puzzlesLoaded.add(subtopicId);
        ui.expanded.subtopic.add(subtopicId);
        // clamp page
        const per = 10;
        const total = ui.puzzlesBySubtopic.get(subtopicId).length;
        const maxPage = Math.max(0, Math.ceil(total / per) - 1);
        const cur = Number(ui.puzzlePageBySubtopic.get(subtopicId) || 0) || 0;
        ui.puzzlePageBySubtopic.set(subtopicId, Math.min(cur, maxPage));
        await builderRefresh();
        close();
      });
    }

    async function openAddPuzzleModal(subtopicId) {
      const roleNow = String(new URLSearchParams(window.location.search).get('role') || '');
      if (String(roleNow).toLowerCase() !== 'teacher') {
        alert('Add puzzles is available for teacher only.');
        return;
      }

      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfAddPuzzleBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Add puzzles" style="width: calc(100vw - 40px); max-width: 1600px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Add puzzles</div>
              <button id="tfAddPuzzleClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-modal-grid">
                <div>
                  <div id="tfEditorBoard" class="tf-board" aria-label="Board editor"></div>
                  <div class="tf-field">
                    <label for="tfFenInput">FEN</label>
                    <textarea id="tfFenInput" class="tf-textarea" rows="3" placeholder="Paste FEN here..."></textarea>
                  </div>
                </div>

                <div>
                  <div class="tf-field">
                    <label>Pieces</label>
                    <div id="tfPalette" class="tf-piece-palette"></div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                      <button id="tfClearSelection" class="btn btn-secondary" type="button">Clear selection</button>
                      <button id="tfClearBoard" class="btn btn-secondary" type="button">Clear board</button>
                      <button id="tfStartPos" class="btn btn-secondary" type="button">Start position</button>
                    </div>
                  </div>

                  <div class="tf-field">
                    <label>Side to move</label>
                    <select id="tfSideSelect" class="tf-select">
                      <option value="w">White to move</option>
                      <option value="b">Black to move</option>
                    </select>
                  </div>

                  <div class="tf-field">
                    <label>Engine Load</label>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px;">
                      <div>
                        <div class="tf-muted" style="font-weight:900;">MultiPV (N-best)</div>
                        <div class="tf-stepper">
                          <input id="tfMultiPv" type="number" min="1" max="10" value="1">
                          <div class="tf-stepper-arrows">
                            <button id="tfMultiPvUp" class="tf-arrow-btn" type="button" aria-label="Increase MultiPV">▲</button>
                            <button id="tfMultiPvDown" class="tf-arrow-btn" type="button" aria-label="Decrease MultiPV">▼</button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div class="tf-muted" style="font-weight:900;">PV plies</div>
                        <div class="tf-stepper">
                          <input id="tfPvPlies" type="number" min="1" max="32" value="8">
                          <div class="tf-stepper-arrows">
                            <button id="tfPvPliesUp" class="tf-arrow-btn" type="button" aria-label="Increase PV plies">▲</button>
                            <button id="tfPvPliesDown" class="tf-arrow-btn" type="button" aria-label="Decrease PV plies">▼</button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
                      <button id="tfEngineLoadBtn" class="btn btn-primary" type="button">Engine Load</button>
                      <button id="tfEngineClearBtn" class="btn btn-secondary" type="button">Clear Engine Load</button>
                      <button id="tfSavePuzzleBtn" class="btn btn-success" type="button" disabled>Confirm & Save</button>
                    </div>
                  </div>

                  <div id="tfEngineOut" class="tf-lines"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };
      host.querySelector('#tfAddPuzzleClose')?.addEventListener('click', close);
      host.querySelector('#tfAddPuzzleBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfAddPuzzleBackdrop') close();
      });

      let board = parseFenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1') || Array.from({ length: 8 }, () => Array(8).fill(''));
      let side = 'w';
      let selectedPiece = '';
      let lastEngine = null;

      const fenInput = host.querySelector('#tfFenInput');
      const sideSel = host.querySelector('#tfSideSelect');
      const boardEl = host.querySelector('#tfEditorBoard');
      const paletteEl = host.querySelector('#tfPalette');
      const engineOutEl = host.querySelector('#tfEngineOut');
      const saveBtn = host.querySelector('#tfSavePuzzleBtn');
      const selectedAnswerMultiPv = new Set();

      function formatPvWithMoveNumbers(fen, pvSan) {
        const parts = String(fen || '').trim().split(/\s+/);
        const side = (parts[1] === 'b') ? 'b' : 'w';
        const fullmove = Math.max(1, Number(parts[5] || 1) || 1);
        const moves = Array.isArray(pvSan) ? pvSan.map(String).filter(Boolean) : [];
        if (!moves.length) return '';

        const lines = [];
        let idx = 0;
        let m = fullmove;

        if (side === 'b') {
          const b = moves[idx++];
          if (b) lines.push(`${m}. ... ${b}`);
          m += 1;
        }

        while (idx < moves.length) {
          const w = moves[idx++] || '';
          const b = moves[idx++] || '';
          if (w && b) lines.push(`${m}. ${w} ${b}`);
          else if (w) lines.push(`${m}. ${w}`);
          m += 1;
        }

        return lines.map(escapeHtml).join('<br>');
      }

      function renderBoard() {
        if (!boardEl) return;
        const sqs = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const isDark = (r + c) % 2 === 1;
            const p = board[r][c] || '';
            const src = p ? pieceImageSrc(p) : '';
            const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
            sqs.push(`<div class="tf-sq ${isDark ? 'dark' : 'light'}" data-r="${r}" data-c="${c}" title="${escapeHtml(rcToCoord(r, c))}">${img}</div>`);
          }
        }
        boardEl.innerHTML = sqs.join('');
      }

      function syncFenText() {
        const fen = buildFenFromBoard(board, side);
        if (fenInput) fenInput.value = fen;
      }

      function applyFenText() {
        const fen = String(fenInput?.value || '').trim();
        const b = parseFenToBoard(fen);
        const parts = fen.split(/\s+/);
        const stm = parts[1] === 'b' ? 'b' : 'w';
        if (b) {
          board = b;
          side = stm;
          if (sideSel) sideSel.value = side;
          renderBoard();
        }
      }

      function renderPalette() {
        if (!paletteEl) return;
        const pieces = ['K','Q','R','B','N','P','k','q','r','b','n','p'];
        paletteEl.innerHTML = pieces.map((p) => {
          const src = pieceImageSrc(p);
          const inner = src
            ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">`
            : escapeHtml(PIECE_UNICODE[p] || p);
          return `<button type="button" class="tf-piece-btn ${selectedPiece === p ? 'is-active' : ''}" data-piece="${escapeHtml(p)}" aria-label="Piece ${escapeHtml(p)}">${inner}</button>`;
        }).join('');
      }

      function setEngineOut(html) { if (engineOutEl) engineOutEl.innerHTML = html; }

      function updateSaveEnabled() {
        if (!saveBtn) return;
        const hasEngine = !!(lastEngine && Array.isArray(lastEngine.lines) && lastEngine.lines.length);
        const hasPick = selectedAnswerMultiPv.size > 0;
        saveBtn.disabled = !(hasEngine && hasPick);
      }

      // init editor
      syncFenText();
      renderBoard();
      renderPalette();
      updateSaveEnabled();

      boardEl?.addEventListener('click', (e) => {
        const sq = e.target && e.target.closest ? e.target.closest('.tf-sq') : null;
        if (!sq) return;
        const r = Number(sq.getAttribute('data-r'));
        const c = Number(sq.getAttribute('data-c'));
        if (!Number.isFinite(r) || !Number.isFinite(c)) return;
        board[r][c] = selectedPiece ? selectedPiece : '';
        renderBoard();
        syncFenText();
      });

      paletteEl?.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.tf-piece-btn') : null;
        if (!btn) return;
        selectedPiece = String(btn.getAttribute('data-piece') || '');
        renderPalette();
      });

      host.querySelector('#tfClearSelection')?.addEventListener('click', () => {
        selectedPiece = '';
        renderPalette();
      });
      host.querySelector('#tfClearBoard')?.addEventListener('click', () => {
        board = Array.from({ length: 8 }, () => Array(8).fill(''));
        renderBoard();
        syncFenText();
      });
      host.querySelector('#tfStartPos')?.addEventListener('click', () => {
        const b = parseFenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
        if (b) board = b;
        side = 'w';
        if (sideSel) sideSel.value = 'w';
        renderBoard();
        syncFenText();
      });

      sideSel?.addEventListener('change', () => {
        side = String(sideSel.value || 'w') === 'b' ? 'b' : 'w';
        syncFenText();
      });

      fenInput?.addEventListener('blur', applyFenText);

      const multiPvEl = host.querySelector('#tfMultiPv');
      const pvPliesEl = host.querySelector('#tfPvPlies');
      host.querySelector('#tfMultiPvUp')?.addEventListener('click', () => {
        if (!multiPvEl) return;
        const v = Number(multiPvEl.value || 1) || 1;
        multiPvEl.value = String(Math.max(1, Math.min(10, v + 1)));
      });
      host.querySelector('#tfMultiPvDown')?.addEventListener('click', () => {
        if (!multiPvEl) return;
        const v = Number(multiPvEl.value || 1) || 1;
        multiPvEl.value = String(Math.max(1, Math.min(10, v - 1)));
      });
      host.querySelector('#tfPvPliesUp')?.addEventListener('click', () => {
        if (!pvPliesEl) return;
        const v = Number(pvPliesEl.value || 8) || 8;
        pvPliesEl.value = String(Math.max(1, Math.min(32, v + 1)));
      });
      host.querySelector('#tfPvPliesDown')?.addEventListener('click', () => {
        if (!pvPliesEl) return;
        const v = Number(pvPliesEl.value || 8) || 8;
        pvPliesEl.value = String(Math.max(1, Math.min(32, v - 1)));
      });

      host.querySelector('#tfEngineLoadBtn')?.addEventListener('click', async () => {
        try {
          applyFenText();
          const fen = String(fenInput?.value || '').trim();
          const multipv = Math.max(1, Math.min(10, Number(multiPvEl?.value || 1) || 1));
          const pvPlies = Math.max(1, Math.min(32, Number(pvPliesEl?.value || 8) || 8));
          selectedAnswerMultiPv.clear();
          updateSaveEnabled();
          setEngineOut(`<div class="tf-muted">Loading engine...</div>`);
          const data = await engineAnalyze({ fen, multipv, pvPlies });
          lastEngine = data;
          const lines = Array.isArray(data.lines) ? data.lines : [];
          setEngineOut(lines.length ? lines.map((ln) => {
            const score = ln?.score?.mate != null ? `mate ${ln.score.mate}` : `cp ${ln?.score?.cp ?? 0}`;
            const pv = formatPvWithMoveNumbers(fen, ln.pvSan);
            const fallback = Array.isArray(ln.pvUci) ? escapeHtml(ln.pvUci.join(' ')) : '';
            const mp = String(ln.multiPv || 1);
            return `
              <div class="tf-line">
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                  <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
                    <input type="checkbox" data-tf-answer="${escapeHtml(mp)}" style="width:18px; height:18px;">
                    <div class="tf-line-title">#${escapeHtml(mp)} · ${escapeHtml(score)}</div>
                  </label>
                </div>
                <div class="tf-line-meta">${pv || fallback}</div>
              </div>
            `;
          }).join('') : `<div class="tf-muted">No lines.</div>`);
          updateSaveEnabled();
        } catch (e) {
          setEngineOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
          selectedAnswerMultiPv.clear();
          updateSaveEnabled();
        }
      });

      host.querySelector('#tfEngineClearBtn')?.addEventListener('click', () => {
        lastEngine = null;
        selectedAnswerMultiPv.clear();
        setEngineOut('');
        updateSaveEnabled();
      });

      engineOutEl?.addEventListener('change', (e) => {
        const cb = e.target && e.target.closest ? e.target.closest('input[type="checkbox"][data-tf-answer]') : null;
        if (!cb) return;
        const mp = String(cb.getAttribute('data-tf-answer') || '').trim();
        if (!mp) return;
        if (cb.checked) selectedAnswerMultiPv.add(mp);
        else selectedAnswerMultiPv.delete(mp);
        updateSaveEnabled();
      });

      host.querySelector('#tfSavePuzzleBtn')?.addEventListener('click', async () => {
        try {
          applyFenText();
          const fen = String(fenInput?.value || '').trim();
          if (!fen) throw new Error('Missing FEN');
          if (!lastEngine) throw new Error('Please run Engine Load first');
          if (!selectedAnswerMultiPv.size) throw new Error('Please select at least 1 answer line');
          const bucket = getBuilderBucket();

          // Keep only selected lines as accepted answers.
          const keep = new Set(Array.from(selectedAnswerMultiPv));
          const allLines = Array.isArray(lastEngine?.lines) ? lastEngine.lines : [];
          const selectedLines = allLines.filter((ln) => keep.has(String(ln?.multiPv || '1')));
          const solutions = {
            ...lastEngine,
            acceptedMultiPv: Array.from(keep),
            acceptedLines: selectedLines
          };

          const payload = {
            fen,
            engineDepth: 16,
            multipv: Number(multiPvEl?.value || 1) || 1,
            pvPlies: Number(pvPliesEl?.value || 8) || 8,
            solutions,
            meta: { bucket }
          };
          await builderCreatePuzzle(subtopicId, payload);
          const data = await builderFetchPuzzles(subtopicId);
          ui.puzzlesBySubtopic.set(subtopicId, Array.isArray(data.puzzles) ? data.puzzles : []);
          ui.expanded.puzzlesLoaded.add(subtopicId);
          ui.expanded.subtopic.add(subtopicId);
          await builderRefresh();
          close();
        } catch (e) {
          setEngineOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
        }
      });
    }

    // Sidebar mode switching
    root.querySelectorAll('.tf-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-mode');
        activateMode(m);
      });
    });

    // Practice + Student navigation (event delegation)
    root.addEventListener('click', (e) => {
      const target = e.target && e.target.closest ? e.target.closest(
        '[data-practice],[data-stu-cat],[data-stu-topic],[data-stu-subtopic],[data-stu-back],[data-stu-page],[data-stu-start],[data-stu-open-puzzle]'
      ) : null;
      if (!target) return;

      // Bucket selection (Beginner/400up/...)
      const bucketBtn = target.closest('[data-practice]');
      if (bucketBtn) {
        const bucket = String(bucketBtn.getAttribute('data-practice') || '').trim();
        if (!bucket) return;
        if (isTeacher) {
          try { localStorage.setItem('tacticsFighterPracticeBucket', bucket); } catch {}
          setOut(`<div style="font-weight:900;">Selected:</div><div>${escapeHtml(bucket)}</div>`);
          return;
        }
        return void studentShowCategories(bucket);
      }

      if (isTeacher) return; // below is student-only

      const backBtn = target.closest('[data-stu-back]');
      if (backBtn) {
        const dest = String(backBtn.getAttribute('data-stu-back') || '').trim();
        if (dest === 'categories') {
          ui.student.view = 'categories';
          ui.student.categoryId = null;
          ui.student.topicId = null;
          ui.student.subtopicId = null;
          return setOut(renderStudentCategories(ui.student.tree?.categories || []));
        }
        if (dest === 'topics') {
          const cat = studentFindCategoryById(ui.student.categoryId);
          if (!cat) return;
          ui.student.view = 'topics';
          ui.student.topicId = null;
          ui.student.subtopicId = null;
          return setOut(renderStudentTopics(cat));
        }
        if (dest === 'subtopics') {
          const cat = studentFindCategoryById(ui.student.categoryId);
          const topic = studentFindTopicById(cat, ui.student.topicId);
          if (!cat || !topic) return;
          ui.student.view = 'subtopics';
          ui.student.subtopicId = null;
          return setOut(renderStudentSubtopics(cat, topic));
        }
        return;
      }

      const catBtn = target.closest('[data-stu-cat]');
      if (catBtn) {
        const cid = String(catBtn.getAttribute('data-stu-cat') || '').trim();
        const cat = studentFindCategoryById(cid);
        if (!cat) return;
        ui.student.view = 'topics';
        ui.student.categoryId = cid;
        ui.student.topicId = null;
        ui.student.subtopicId = null;
        return setOut(renderStudentTopics(cat));
      }

      const topicBtn = target.closest('[data-stu-topic]');
      if (topicBtn) {
        const tid = String(topicBtn.getAttribute('data-stu-topic') || '').trim();
        const cat = studentFindCategoryById(ui.student.categoryId);
        const topic = studentFindTopicById(cat, tid);
        if (!cat || !topic) return;
        ui.student.view = 'subtopics';
        ui.student.topicId = tid;
        ui.student.subtopicId = null;
        return setOut(renderStudentSubtopics(cat, topic));
      }

      const subBtn = target.closest('[data-stu-subtopic]');
      if (subBtn) {
        const sid = String(subBtn.getAttribute('data-stu-subtopic') || '').trim();
        if (!sid) return;
        return void studentOpenSubtopic(sid);
      }

      const pageBtn = target.closest('[data-stu-page]');
      if (pageBtn) {
        const dir = String(pageBtn.getAttribute('data-stu-page') || '').trim();
        return void studentChangePuzzlePage(dir);
      }

      const startBtn = target.closest('[data-stu-start]');
      if (startBtn) {
        ui.student.runner = { index: 0 };
        return void openStudentRunnerModal();
      }

      const openBtn = target.closest('[data-stu-open-puzzle]');
      if (openBtn) {
        const idx = Number(openBtn.getAttribute('data-stu-idx') || 0);
        ui.student.runner = { index: Number.isFinite(idx) ? idx : 0 };
        return void openStudentRunnerModal();
      }
    });

    // Initial render
    activateMode(mode);
  };
})();


