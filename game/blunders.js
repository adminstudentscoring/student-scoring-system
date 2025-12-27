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
    page: 'home', // 'home' | 'blunder' | 'review' | 'masterGame' | 'settings'
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
    needsMasterRefreshAfterModal: false,
    lastAttemptWasPendingSolve: false,
    settingsTab: 'board', // 'board' | 'general'
    reviewDuration: 'all', // 'week' | 'month' | 'halfYear' | 'year' | 'all'
    teacherTab: 'students', // 'students' | 'masterGame' | 'settings'
    // Student Master Game
    master: {
      loading: false,
      error: '',
      masters: [],
      selectedMasterId: '',
      pending: [],
      completed: [],
      countsByMaster: {}, // id -> {pending,completed,total}
      currentIndex: 0
    },
    // Teacher mode data
    teacher: {
      loading: false,
      error: '',
      students: [],
      masters: [],
      allBlunders: [],
      masterConfig: { maxGamesPerDay: 10, thresholdPoints: 1.0 },
      edits: { student: {}, masters: null, masterCfg: null },
      lastLoadedAt: '',
      ratingsSchedule: null,
      // Teacher Students UI
      search: '',
      selectedIds: [],
      bulkMaxGames: 10,
      bulkThreshold: 1.0,
      bulkHistoryGames: 200,
      historyScanN: {},
      // Teacher All blunders UI
      allDuration: 'all', // week | month | halfYear | year | all
      allRating: 'any' // any | 100-400 | 401-700 | 701-1000 | 1001-1500 | 1501-2000 | 2000up
    },
    uiBoard: {
      // Student blunders
      blunderFen: '',
      blunderMoveUci: '',
      blunderMoveSan: '',
      blunderVerdict: '',
      blunderBestMoveUci: '',
      blunderBestMoveSan: '',
      blunderBestOrigin: '', // '' | 'attempt' | 'revealed'
      // Master game
      masterFen: '',
      masterMoveUci: '',
      masterMoveSan: '',
      masterVerdict: '',
      masterBestMoveUci: '',
      masterBestMoveSan: '',
      masterBestOrigin: '' // '' | 'attempt' | 'revealed'
    },
    ui: { modalOpen: false, modalHtml: '', lastInlineBestClickTs: 0 }
  };

  function getBlundersRole() {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = String(params.get('role') || '').toLowerCase();
      if (q === 'teacher' || q === 'student') return q;
    } catch {}
    try {
      const w = String(window.blundersRole || '').toLowerCase();
      if (w === 'teacher' || w === 'student') return w;
    } catch {}
    try {
      const ls = String(localStorage.getItem('blundersRole') || '').toLowerCase();
      if (ls === 'teacher' || ls === 'student') return ls;
    } catch {}
    return 'student';
  }

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

  function getStudentPasswordQueryWith(extraParams) {
    const base = getStudentPasswordQuery(); // '' or '?password=...'
    const parts = [];
    if (base.startsWith('?')) parts.push(base.slice(1));
    if (extraParams && typeof extraParams === 'object') {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v === undefined || v === null || v === '') continue;
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      }
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }

  async function fetchMyBlunders(studentId, opts = {}) {
    const qs = getStudentPasswordQuery();
    const forceQs = opts.force ? (qs ? `${qs}&force=1` : '?force=1') : qs;
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders${forceQs}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  async function fetchMasterList(studentId) {
    const qs = getStudentPasswordQueryWith({});
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/master${qs}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  async function fetchMasterPuzzles(studentId, masterId) {
    const qs = getStudentPasswordQueryWith({ masterId });
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/master${qs}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  async function submitMasterAttempt(studentId, puzzleId, moveUci, revealBest, practice) {
    const qs = getStudentPasswordQueryWith({});
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/master/${encodeURIComponent(String(puzzleId))}/attempt${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moveUci, revealBest: !!revealBest, practice: !!practice })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  function getTeacherAuthHeader() {
    try {
      const t = String(localStorage.getItem('authToken') || localStorage.getItem('blundersTeacherAuthToken') || '').trim();
      if (!t) return {};
      return { Authorization: `Bearer ${t}` };
    } catch {
      return {};
    }
  }

  async function teacherApi(path, opts = {}) {
    const resp = await fetch(`/api${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getTeacherAuthHeader(),
        ...(opts.headers || {})
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      if (resp.status === 401) {
        throw new Error('Authentication required. Please open Blunders from the Teacher Dashboard while logged in.');
      }
      throw new Error(data?.error || `HTTP ${resp.status}`);
    }
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
    if (!resp.ok) {
      if (resp.status === 502) {
        throw new Error('Server temporarily unavailable (HTTP 502). Please try again in a few seconds.');
      }
      throw new Error(data?.error || `HTTP ${resp.status}`);
    }
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

  function fmtIsoUtc(iso) {
    try {
      const d = new Date(String(iso || ''));
      if (Number.isNaN(d.getTime())) return '';
      const s = d.toISOString();
      return `${s.slice(0, 10)} ${s.slice(11, 16)} UTC`;
    } catch {
      return '';
    }
  }

  function parseIsoMs(iso) {
    const t = Date.parse(String(iso || ''));
    return Number.isFinite(t) ? t : 0;
  }

  function puzzleTimeMs(p) {
    // Prefer completedAt if present; else use endTime (unix sec) or createdAt.
    const done = parseIsoMs(p?.completedAt || '');
    if (done) return done;
    const end = Number(p?.endTime || 0);
    const endMs = Number.isFinite(end) && end > 0 ? end * 1000 : 0;
    const created = parseIsoMs(p?.createdAt || '');
    return Math.max(endMs, created);
  }

  function reviewDurationStartMs(key) {
    const now = new Date();
    const k = String(key || 'all');
    if (k === 'week') return Date.now() - 7 * 24 * 3600 * 1000;
    if (k === 'month') return Date.now() - 30 * 24 * 3600 * 1000;
    if (k === 'halfYear') {
      const d = new Date(now.getTime());
      d.setMonth(d.getMonth() - 6);
      return d.getTime();
    }
    if (k === 'year') {
      const d = new Date(now.getTime());
      d.setFullYear(d.getFullYear() - 1);
      return d.getTime();
    }
    return 0; // all
  }

  function getReviewPuzzlesFiltered() {
    const all = [
      ...(Array.isArray(STATE.pending) ? STATE.pending : []),
      ...(Array.isArray(STATE.completed) ? STATE.completed : [])
    ];
    const start = reviewDurationStartMs(STATE.reviewDuration);
    if (!start) return all;
    return all.filter((p) => {
      const ms = puzzleTimeMs(p);
      return ms >= start;
    });
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
        <div class="bl-title">Blunder</div>
        <div class="blunders-muted">Mode: <strong>${escapeHtml(modeLabel)}</strong>${STATE.mode === 'pending' ? ` · Remaining: <strong>${escapeHtml(String(pendingCount))}</strong>` : ''}</div>

        ${puzzle ? `
          <div class="bl-board-wrap">
            <div>
              ${renderBoardForPuzzle(puzzle, flip, STATE.selectedFrom, { fenOverride, myMoveUci })}
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
              ${renderInlineResultPanel('blunder')}
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
    const allAll = [
      ...(Array.isArray(STATE.pending) ? STATE.pending : []),
      ...(Array.isArray(STATE.completed) ? STATE.completed : [])
    ];
    const all = getReviewPuzzlesFiltered();
    const dropOf = (p) => {
      const d = (typeof p?.dropPoints === 'number') ? p.dropPoints : (Number(p?.dropCp || 0) / 100);
      return Number.isFinite(d) ? d : 0;
    };
    const isMissMate = (p) => {
      const bestCp = Number(p?.bestCp ?? 0);
      return Number.isFinite(bestCp) && Math.abs(bestCp) >= 99999;
    };
    const bucketKeyOf = (p) => {
      if (isMissMate(p)) return 'missMate';
      const d = dropOf(p);
      if (d <= 1.5) return 'd1';
      if (d <= 2.0) return 'd2';
      if (d <= 3.0) return 'd3';
      return 'd4';
    };
    const sorted = all.slice().sort((a, b) => {
      // Keep mate-miss near top by drop, then by time
      const da = dropOf(a);
      const db = dropOf(b);
      if (db !== da) return db - da;
      const ta = puzzleTimeMs(a);
      const tb = puzzleTimeMs(b);
      return tb - ta;
    });

    const groups = {
      missMate: [],
      d1: [],
      d2: [],
      d3: [],
      d4: []
    };
    for (const p of sorted) {
      if (isMissMate(p)) {
        groups.missMate.push(p);
        continue;
      }
      const d = dropOf(p);
      if (d <= 1.5) groups.d1.push(p);
      else if (d <= 2.0) groups.d2.push(p);
      else if (d <= 3.0) groups.d3.push(p);
      else groups.d4.push(p);
    }

    const renderGroup = (title, items, openByDefault) => {
      const arr = Array.isArray(items) ? items : [];
      if (!arr.length) return '';
      return `
        <details ${openByDefault ? 'open' : ''} style="margin-top:12px;">
          <summary class="blunders-muted" style="cursor:pointer; font-weight:950; color:#111827;">
            ${escapeHtml(title)} <span class="bl-badge" style="margin-left:8px;">${escapeHtml(String(arr.length))}</span>
          </summary>
          <div class="bl-grid" style="margin-top:10px;">
            ${arr.map((p) => {
              const drop = dropOf(p);
              const label = isMissMate(p) ? 'Miss the mate' : `Drop ${drop.toFixed(2)}`;
              const status = String(p?.status || 'pending') === 'completed' ? 'Completed' : 'Pending';
              return `
                <button class="bl-card" type="button" data-bl-open="${escapeHtml(String(p.id || ''))}" style="text-align:left; cursor:pointer;">
                  <div style="display:flex; gap:10px; align-items:center;">
                    ${renderMiniBoardFromFen(String(p.startFEN || ''))}
                    <div style="flex:1 1 auto;">
                      <div style="font-weight:950; color:#111827;">${escapeHtml(String(p.blunderSan || p.blunderMoveUci || ''))}</div>
                      <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(label)} · <strong>${escapeHtml(status)}</strong></div>
                      <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(fmtTs(p.completedAt || p.createdAt))}</div>
                    </div>
                  </div>
                </button>
              `;
            }).join('')}
          </div>
        </details>
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
        <div class="bl-title">Review</div>
        <div class="blunders-muted">All puzzles are shown here (pending + completed).</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button class="btn btn-secondary" type="button" data-bl-refresh>Refresh</button>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <span class="blunders-muted" style="margin-right:2px;">Practice:</span>
            <button class="btn btn-primary" type="button" data-bl-review-practice="random" ${all.length ? '' : 'disabled'}>Random</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d1" ${groups.d1.length ? '' : 'disabled'}>1–1.5</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d2" ${groups.d2.length ? '' : 'disabled'}>1.51–2</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d3" ${groups.d3.length ? '' : 'disabled'}>2.01–3</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d4" ${groups.d4.length ? '' : 'disabled'}>3.01+</button>
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px;">
          <span class="blunders-muted" style="margin-right:2px;">Duration:</span>
          ${durBtns.map(b => `
            <button class="btn ${dur === b.k ? 'btn-info' : 'btn-secondary'} btn-small" type="button" data-bl-review-duration="${escapeHtml(b.k)}">
              ${escapeHtml(b.label)}
            </button>
          `).join('')}
          <span class="blunders-muted" style="margin-left:6px;">Showing <strong>${escapeHtml(String(all.length))}</strong> of <strong>${escapeHtml(String(allAll.length))}</strong></span>
        </div>
        ${all.length ? `
          ${renderGroup('Miss the mate', groups.missMate, true)}
          ${renderGroup('Drop 1.00–1.50', groups.d1, true)}
          ${renderGroup('Drop 1.51–2.00', groups.d2, false)}
          ${renderGroup('Drop 2.01–3.00', groups.d3, false)}
          ${renderGroup('Drop 3.01+', groups.d4, false)}
        ` : `<div class="blunders-muted" style="margin-top:12px;">No puzzles yet.</div>`}
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
              ${puzzle ? renderBoardForPuzzle(puzzle, flip, STATE.selectedFrom, { fenOverride: (STATE.uiBoard.masterFen || puzzle.startFEN), myMoveUci: (STATE.uiBoard.masterMoveUci || '') }) : `<div class="bl-card" style="box-shadow:none;"><div class="blunders-muted">No pending puzzles for this master.</div></div>`}
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
              ${renderInlineResultPanel('master')}
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

  function renderTeacherSidebar() {
    const tab = String(STATE.teacherTab || 'students');
    return `
      <aside class="bl-sidebar" aria-label="Blunders teacher sidebar">
        <div class="bl-side-title">💥 Blunders</div>
        <div class="bl-side-sub">Teacher mode</div>
        <div class="bl-nav">
          <button class="bl-nav-btn ${tab === 'students' ? 'active' : ''}" type="button" data-bl-teacher-tab="students">
            <span class="bl-nav-left"><span class="bl-nav-icon">👥</span>Students</span>
          </button>
          <button class="bl-nav-btn ${tab === 'allBlunders' ? 'active' : ''}" type="button" data-bl-teacher-tab="allBlunders">
            <span class="bl-nav-left"><span class="bl-nav-icon">📚</span>All blunders</span>
          </button>
          <button class="bl-nav-btn ${tab === 'masterGame' ? 'active' : ''}" type="button" data-bl-teacher-tab="masterGame">
            <span class="bl-nav-left"><span class="bl-nav-icon">♟️</span>Master Game</span>
          </button>
          <button class="bl-nav-btn ${tab === 'settings' ? 'active' : ''}" type="button" data-bl-teacher-tab="settings">
            <span class="bl-nav-left"><span class="bl-nav-icon">⚙️</span>Settings</span>
          </button>
        </div>
      </aside>
    `;
  }

  function renderTeacherStudentsPage() {
    const loading = !!STATE.teacher.loading;
    const err = String(STATE.teacher.error || '');
    const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
    const today = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    })();
    const q = String(STATE.teacher.search || '').trim().toLowerCase();
    const rows = !q ? allRows : allRows.filter((s) => {
      const name = String(s?.name || '').toLowerCase();
      const sid = String(s?.studentId || '').toLowerCase();
      const chessId = String(s?.chessComUsername || '').toLowerCase();
      return name.includes(q) || sid.includes(q) || chessId.includes(q);
    });

    const selectedSet = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
    const allFilteredSelected = rows.length > 0 && rows.every(s => selectedSet.has(String(s?.id || '')));

    const totalPending = allRows.reduce((a, s) => a + Number(s?.counts?.pending || 0), 0);
    const totalCompleted = allRows.reduce((a, s) => a + Number(s?.counts?.completed || 0), 0);
    const schedule = STATE.teacher.ratingsSchedule;
    const scheduleLine = schedule
      ? `Automatic Chess.com rating refresh: <strong>daily at ${escapeHtml(String(schedule.time || ''))}</strong>.`
      : `Automatic Chess.com rating refresh: <strong>daily</strong>.`;
    const lastRun = schedule?.lastRunAt ? fmtIsoUtc(schedule.lastRunAt) : '—';
    const nextRun = schedule?.nextRunAt ? fmtIsoUtc(schedule.nextRunAt) : '—';
    const selectedCount = Array.from(selectedSet).filter((id) => allRows.some(r => String(r.id || '') === id)).length;
    const bulkHistoryGames = Math.max(1, Math.min(500, Number(STATE.teacher.bulkHistoryGames || 200) || 200));

    return `
      <div class="bl-card">
        <div class="bl-title">Teacher · Students</div>
        <div class="blunders-muted">Per-student fetch limit + blunder threshold + date-based sync (date format: <strong>YYYY-MM-DD</strong>).</div>

        <div class="bl-card" style="box-shadow:none; margin-top:10px;">
          <div class="blunders-muted">${scheduleLine}</div>
          <div class="blunders-muted" style="margin-top:6px;">Last run: <strong>${escapeHtml(lastRun)}</strong> · Next run: <strong>${escapeHtml(nextRun)}</strong></div>
        </div>

        <div class="bl-stats" style="margin-top:12px;">
          <div class="bl-stat">
            <div class="bl-stat-label">Students</div>
            <div class="bl-stat-value">${escapeHtml(String(allRows.length))}</div>
          </div>
          <div class="bl-stat">
            <div class="bl-stat-label">Pending</div>
            <div class="bl-stat-value">${escapeHtml(String(totalPending))}</div>
          </div>
          <div class="bl-stat">
            <div class="bl-stat-label">Completed</div>
            <div class="bl-stat-value">${escapeHtml(String(totalCompleted))}</div>
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; align-items:center;">
          <button class="btn btn-secondary" type="button" data-bl-teacher-refresh-students ${loading ? 'disabled' : ''}>Refresh</button>
          <button class="btn btn-primary" type="button" data-bl-teacher-save-students ${loading ? 'disabled' : ''}>Save settings</button>
          <button class="btn btn-secondary" type="button" data-bl-teacher-sync-selected ${(!selectedCount || loading) ? 'disabled' : ''}>Sync selected (${escapeHtml(String(selectedCount))})</button>
          <button class="btn btn-secondary" type="button" data-bl-teacher-force-selected ${(!selectedCount || loading) ? 'disabled' : ''}>Force selected</button>
          <span style="display:inline-flex; gap:6px; align-items:center;">
            <span class="blunders-muted" style="margin:0;">History N</span>
            <select data-bl-teacher-bulk-history style="padding:8px 10px; border:1px solid #e5e7eb; border-radius:12px;" ${loading ? 'disabled' : ''}>
              ${[100, 200, 300, 500].map((n) => `<option value="${n}" ${Number(bulkHistoryGames) === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
            <button class="btn btn-secondary" type="button" data-bl-teacher-history-selected ${(!selectedCount || loading) ? 'disabled' : ''}>History selected</button>
            <button class="btn btn-secondary" type="button" data-bl-teacher-history-force-selected ${(!selectedCount || loading) ? 'disabled' : ''}>History Force selected</button>
          </span>
        </div>
        ${loading ? `<div class="blunders-muted" style="margin-top:10px;">Loading...</div>` : ``}
        ${err ? `<div class="blunders-muted" style="margin-top:10px; color:#b91c1c;">${escapeHtml(err)}</div>` : ``}

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
          <div style="flex:1 1 260px;">
            <div class="blunders-muted">Search</div>
            <input type="text" value="${escapeHtml(String(STATE.teacher.search || ''))}" placeholder="Search name / student id / chess.com id" data-bl-teacher-search style="width:100%; padding:8px 10px; border:1px solid #e5e7eb; border-radius:12px;">
          </div>
          <div>
            <div class="blunders-muted">Set selected Max games/day</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="number" min="1" max="50" step="1" value="${escapeHtml(String(Number(STATE.teacher.bulkMaxGames || 10) || 10))}" data-bl-teacher-bulk-max style="width:120px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:12px;">
              <button class="btn btn-secondary" type="button" data-bl-teacher-apply-max-selected ${loading ? 'disabled' : ''}>Apply</button>
            </div>
          </div>
          <div>
            <div class="blunders-muted">Set selected Threshold</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="number" min="0.1" max="10" step="0.1" value="${escapeHtml(String(Number(STATE.teacher.bulkThreshold || 1) || 1))}" data-bl-teacher-bulk-thr style="width:120px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:12px;">
              <button class="btn btn-secondary" type="button" data-bl-teacher-apply-thr-selected ${loading ? 'disabled' : ''}>Apply</button>
            </div>
          </div>
        </div>

        <div style="margin-top:12px; overflow:auto;">
          <table style="width:100%; border-collapse:separate; border-spacing:0 8px;">
            <thead>
              <tr class="blunders-muted" style="text-align:left;">
                <th style="padding:6px 8px; width:42px;">
                  <input type="checkbox" data-bl-teacher-select-all ${allFilteredSelected ? 'checked' : ''} aria-label="Select all">
                </th>
                <th style="padding:6px 8px;">Student</th>
                <th style="padding:6px 8px;">Chess.com rating</th>
                <th style="padding:6px 8px;">Pending</th>
                <th style="padding:6px 8px;">Completed</th>
                <th style="padding:6px 8px;">Analyzed games</th>
                <th style="padding:6px 8px;">Max games/day</th>
                <th style="padding:6px 8px;">Threshold</th>
                <th style="padding:6px 8px;">Date</th>
                <th style="padding:6px 8px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((s) => {
                const sid = String(s.id || '');
                const nm = String(s.name || '');
                const sid2 = String(s.studentId || '');
                const cfg = s.config || {};
                const maxGames = Number((STATE.teacher.edits.student?.[sid]?.maxGamesPerDay) ?? cfg.maxGamesPerDay ?? 10) || 10;
                const thr = Number((STATE.teacher.edits.student?.[sid]?.thresholdPoints) ?? cfg.thresholdPoints ?? 1.0) || 1.0;
                const chessId = String(s.chessComUsername || '');
                const r = (s.chessComRating === null || s.chessComRating === undefined) ? '' : String(s.chessComRating);
                const rs = String(s.chessComRatingSource || '');
                const ratingLabel = r ? `${r}${rs ? ` (${rs})` : ''}` : '—';
                const isChecked = selectedSet.has(sid);
                const historyVal = Number(STATE.teacher?.historyScanN?.[sid] || 200) || 200;
                return `
                  <tr style="background:#fff; border:1px solid #e5e7eb;">
                    <td style="padding:10px 8px; border-radius:12px 0 0 12px;">
                      <input type="checkbox" data-bl-teacher-select="${escapeHtml(sid)}" ${isChecked ? 'checked' : ''} aria-label="Select student">
                    </td>
                    <td style="padding:10px 8px;">
                      <div style="font-weight:900; color:#111827;">${escapeHtml(nm)}</div>
                      <div class="blunders-muted">${escapeHtml(sid2)}${chessId ? ` · ${escapeHtml(chessId)}` : ''}</div>
                    </td>
                    <td style="padding:10px 8px;">${escapeHtml(ratingLabel)}</td>
                    <td style="padding:10px 8px;">${escapeHtml(String(s?.counts?.pending || 0))}</td>
                    <td style="padding:10px 8px;">${escapeHtml(String(s?.counts?.completed || 0))}</td>
                    <td style="padding:10px 8px;">${escapeHtml(String(s?.analyzedGamesTotal || 0))}</td>
                    <td style="padding:10px 8px;">
                      <input type="number" min="1" max="50" step="1" value="${escapeHtml(String(maxGames))}" data-bl-teacher-student-max="${escapeHtml(sid)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px;">
                      <input type="number" min="0.1" max="10" step="0.1" value="${escapeHtml(String(thr))}" data-bl-teacher-student-thr="${escapeHtml(sid)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px;">
                      <input type="text" value="${escapeHtml(today)}" inputmode="numeric" placeholder="YYYY-MM-DD" data-bl-teacher-student-date="${escapeHtml(sid)}" style="width:110px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px; border-radius:0 12px 12px 0; white-space:nowrap;">
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-student="${escapeHtml(sid)}">Sync</button>
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-student-force="${escapeHtml(sid)}">Force</button>
                      <span style="display:inline-flex; gap:6px; align-items:center; margin-left:8px;">
                        <select data-bl-teacher-history-n="${escapeHtml(sid)}" style="padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px; font-size:12px;">
                          ${[100,200,300,500].map((n) => `<option value="${n}" ${Number(historyVal) === n ? 'selected' : ''}>${n}</option>`).join('')}
                        </select>
                        <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-history-scan="${escapeHtml(sid)}">History</button>
                        <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-history-scan-force="${escapeHtml(sid)}">History Force</button>
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTeacherAllBlundersPage() {
    const loading = !!STATE.teacher.loading;
    const err = String(STATE.teacher.error || '');
    const duration = String(STATE.teacher.allDuration || 'all');
    const rating = String(STATE.teacher.allRating || 'any');
    const entries = Array.isArray(STATE.teacher.allBlunders) ? STATE.teacher.allBlunders : [];

    const durationBtns = [
      { k: 'week', label: 'Last week' },
      { k: 'month', label: 'Last month' },
      { k: 'halfYear', label: 'Last 6 months' },
      { k: 'year', label: 'Last year' },
      { k: 'all', label: 'All time' }
    ];
    const ratingOpts = [
      { k: 'any', label: 'Any rating' },
      { k: '100-400', label: '100–400' },
      { k: '401-700', label: '401–700' },
      { k: '701-1000', label: '701–1000' },
      { k: '1001-1500', label: '1001–1500' },
      { k: '1501-2000', label: '1501–2000' },
      { k: '2000up', label: '2000+' }
    ];

    const dropOf = (p) => Number(p?.dropPoints ?? (Number(p?.dropCp || 0) / 100)) || 0;
    const isMissMate = (p) => {
      const bestCp = Number(p?.bestCp ?? 0);
      return Number.isFinite(bestCp) && Math.abs(bestCp) >= 99999;
    };
    const groups = { missMate: [], d1: [], d2: [], d3: [], d4: [] };
    for (const p of entries) {
      if (isMissMate(p)) { groups.missMate.push(p); continue; }
      const d = dropOf(p);
      if (d >= 1.0 && d <= 1.5) groups.d1.push(p);
      else if (d > 1.5 && d <= 2.0) groups.d2.push(p);
      else if (d > 2.0 && d <= 3.0) groups.d3.push(p);
      else if (d > 3.0) groups.d4.push(p);
      else groups.d1.push(p);
    }

    const renderRows = (arr) => {
      if (!arr.length) return `<div class="blunders-muted" style="margin-top:10px;">No records.</div>`;
      return `
        <div class="bl-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
          ${arr.slice(0, 200).map((p) => {
            const sid = escapeHtml(String(p.studentStudentId || ''));
            const sname = escapeHtml(String(p.studentName || 'Student'));
            const r = (p.chessComRating === null || p.chessComRating === undefined) ? '' : `${escapeHtml(String(p.chessComRating))}${p.chessComRatingSource ? ` (${escapeHtml(String(p.chessComRatingSource))})` : ''}`;
            const when = escapeHtml(String(p.completedAt || ''));
            const drop = dropOf(p).toFixed(2);
            const title = `${escapeHtml(String(p.blunderSan || p.blunderMoveUci || ''))} · Drop ${drop}`;
            return `
              <div class="bl-card" style="display:flex; gap:12px; align-items:center;">
                ${renderMiniBoardFromFen(String(p.startFEN || ''))}
                <div style="min-width:0;">
                  <div style="font-weight:950; color:#111827; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sname}${sid ? ` <span style="opacity:.7;">(${sid})</span>` : ''}</div>
                  <div class="blunders-muted" style="margin-top:4px;">Rating: <strong>${r || '—'}</strong></div>
                  <div class="blunders-muted" style="margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
                  ${p.gameUrl ? `<div class="blunders-muted" style="margin-top:4px;">Source: <a href="${escapeHtml(String(p.gameUrl))}" target="_blank" rel="noopener noreferrer">Chess.com</a></div>` : ``}
                  ${when ? `<div class="blunders-muted" style="margin-top:4px;">${when}</div>` : ``}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${entries.length > 200 ? `<div class="blunders-muted" style="margin-top:10px;">Showing 200 of ${entries.length}.</div>` : ``}
      `;
    };

    const renderGroup = (label, arr, open) => `
      <details ${open ? 'open' : ''} style="margin-top:10px;">
        <summary class="blunders-muted" style="cursor:pointer;"><strong>${escapeHtml(label)}</strong> (${arr.length})</summary>
        <div style="margin-top:10px;">${renderRows(arr)}</div>
      </details>
    `;

    return `
      <div class="bl-card">
        <div class="bl-title">All blunders</div>
        <div class="blunders-muted">Same as Review, but across all students in your organization.</div>

        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${durationBtns.map(b => `<button class="btn ${duration === b.k ? 'btn-info' : 'btn-secondary'} btn-small" type="button" data-bl-teacher-all-duration="${escapeHtml(b.k)}">${escapeHtml(b.label)}</button>`).join('')}
          <div style="flex:1;"></div>
          <select class="btn btn-secondary btn-small" data-bl-teacher-all-rating style="min-width:180px;">
            ${ratingOpts.map(o => `<option value="${escapeHtml(o.k)}" ${rating === o.k ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-refresh-all>Refresh</button>
        </div>

        ${loading ? `<div class="blunders-muted" style="margin-top:12px;">Loading...</div>` : ``}
        ${err ? `<div class="blunders-muted" style="margin-top:12px; color:#b91c1c;">${escapeHtml(err)}</div>` : ``}

        ${!loading ? `
          <div style="margin-top:12px;">
            ${renderGroup('Miss the mate', groups.missMate, true)}
            ${renderGroup('Drop 1.00–1.50', groups.d1, true)}
            ${renderGroup('Drop 1.51–2.00', groups.d2, false)}
            ${renderGroup('Drop 2.01–3.00', groups.d3, false)}
            ${renderGroup('Drop 3.01+', groups.d4, false)}
          </div>
        ` : ``}
      </div>
    `;
  }

  function renderTeacherMasterGamePage() {
    const loading = !!STATE.teacher.loading;
    const err = String(STATE.teacher.error || '');
    const masters = Array.isArray(STATE.teacher.masters) ? STATE.teacher.masters : [];
    const cfg = STATE.teacher.masterConfig || { maxGamesPerDay: 10, thresholdPoints: 1.0 };
    const maxGames = Number((STATE.teacher.edits.masterCfg?.maxGamesPerDay) ?? cfg.maxGamesPerDay ?? 10) || 10;
    const thr = Number((STATE.teacher.edits.masterCfg?.thresholdPoints) ?? cfg.thresholdPoints ?? 1.0) || 1.0;
    const today = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    })();
    const editMasters = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters : null;
    const rows = editMasters || masters;

    return `
      <div class="bl-card">
        <div class="bl-title">Teacher · Master Game</div>
        <div class="blunders-muted">Configure masters + run the same Blunder analysis on their games.</div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
          <button class="btn btn-secondary" type="button" data-bl-teacher-refresh-masters ${loading ? 'disabled' : ''}>Refresh</button>
          <button class="btn btn-secondary" type="button" data-bl-teacher-masters-presets ${loading ? 'disabled' : ''}>Presets</button>
          <button class="btn btn-secondary" type="button" data-bl-teacher-masters-add ${loading ? 'disabled' : ''}>Add master</button>
          <button class="btn btn-primary" type="button" data-bl-teacher-save-masters ${loading ? 'disabled' : ''}>Save</button>
        </div>

        <div style="margin-top:12px; display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
          <div>
            <div class="blunders-muted">Master max games/day</div>
            <input type="number" min="1" max="50" step="1" value="${escapeHtml(String(maxGames))}" data-bl-teacher-mastercfg-max style="width:130px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
          </div>
          <div>
            <div class="blunders-muted">Master threshold</div>
            <input type="number" min="0.1" max="10" step="0.1" value="${escapeHtml(String(thr))}" data-bl-teacher-mastercfg-thr style="width:130px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
          </div>
          <button class="btn btn-secondary" type="button" data-bl-teacher-save-mastercfg>Save config</button>
        </div>

        ${loading ? `<div class="blunders-muted" style="margin-top:10px;">Loading...</div>` : ``}
        ${err ? `<div class="blunders-muted" style="margin-top:10px; color:#b91c1c;">${escapeHtml(err)}</div>` : ``}

        <div style="margin-top:12px; overflow:auto;">
          <table style="width:100%; border-collapse:separate; border-spacing:0 8px;">
            <thead>
              <tr class="blunders-muted" style="text-align:left;">
                <th style="padding:6px 8px;">Name</th>
                <th style="padding:6px 8px;">Chess.com username</th>
                <th style="padding:6px 8px;">Total puzzles</th>
                <th style="padding:6px 8px;">Sync date</th>
                <th style="padding:6px 8px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((m, i) => {
                const mid = String(m.id || '');
                const name = String(m.name || '');
                const user = String(m.username || '');
                const total = Number(m?.counts?.total || 0);
                return `
                  <tr style="background:#fff; border:1px solid #e5e7eb;">
                    <td style="padding:10px 8px; border-radius:12px 0 0 12px;">
                      <input type="text" value="${escapeHtml(name)}" data-bl-teacher-master-name="${escapeHtml(String(i))}" style="width:180px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                      <div class="blunders-muted" style="margin-top:4px;">id: ${escapeHtml(mid || '(auto)')}</div>
                    </td>
                    <td style="padding:10px 8px;">
                      <input type="text" value="${escapeHtml(user)}" data-bl-teacher-master-user="${escapeHtml(String(i))}" style="width:220px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px;">${escapeHtml(String(total))}</td>
                    <td style="padding:10px 8px;">
                      <input type="date" value="${escapeHtml(today)}" data-bl-teacher-master-date="${escapeHtml(mid)}" style="padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px; border-radius:0 12px 12px 0;">
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-master="${escapeHtml(mid)}">Sync</button>
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-master-force="${escapeHtml(mid)}">Force</button>
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-master-del="${escapeHtml(String(i))}">Remove</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

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

  async function teacherLoad(tab) {
    STATE.teacher.loading = true;
    STATE.teacher.error = '';
    render();
    try {
      if (tab === 'masterGame') {
        const data = await teacherApi('/teachers/blunders/masters-summary');
        STATE.teacher.masters = Array.isArray(data?.masters) ? data.masters : [];
        STATE.teacher.masterConfig = data?.masterConfig || { maxGamesPerDay: 10, thresholdPoints: 1.0 };
        if (!Array.isArray(STATE.teacher.edits.masters)) STATE.teacher.edits.masters = STATE.teacher.masters.map((m) => ({ ...m }));
      } else if (tab === 'allBlunders') {
        const dur = String(STATE.teacher.allDuration || 'all');
        const rt = String(STATE.teacher.allRating || 'any');
        const qs = `?duration=${encodeURIComponent(dur)}&rating=${encodeURIComponent(rt)}`;
        const data = await teacherApi(`/teachers/blunders/all-blunders${qs}`);
        STATE.teacher.allBlunders = Array.isArray(data?.entries) ? data.entries : [];
      } else if (tab === 'settings') {
        // Reuse Settings UI (board colors), no server call needed.
      } else {
        const data = await teacherApi('/teachers/blunders/students-summary');
        STATE.teacher.students = Array.isArray(data?.students) ? data.students : [];
        STATE.teacher.ratingsSchedule = data?.ratingsSchedule || null;
      }
      STATE.teacher.loading = false;
      STATE.teacher.lastLoadedAt = new Date().toISOString();
      render();
    } catch (e) {
      STATE.teacher.loading = false;
      STATE.teacher.error = String(e?.message || e);
      render();
    }
  }

  async function teacherSaveStudentSettings() {
    const map = STATE.teacher.edits.student && typeof STATE.teacher.edits.student === 'object' ? STATE.teacher.edits.student : {};
    await teacherApi('/teachers/blunders/settings', { method: 'PUT', body: { student: map } });
  }

  async function teacherSaveMasters() {
    const masters = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters : [];
    await teacherApi('/teachers/blunders/settings', { method: 'PUT', body: { masters } });
  }

  async function teacherSaveMasterConfig() {
    const cfg = STATE.teacher.edits.masterCfg && typeof STATE.teacher.edits.masterCfg === 'object' ? STATE.teacher.edits.masterCfg : null;
    if (!cfg) return;
    await teacherApi('/teachers/blunders/settings', { method: 'PUT', body: { master: cfg } });
  }

  async function teacherSyncStudent(studentId, hkDayKey, force) {
    const sid = String(studentId || '').trim();
    if (!sid) return;
    const edit = STATE.teacher.edits.student?.[sid] || {};
    const maxGamesPerDay = edit.maxGamesPerDay;
    const thresholdPoints = edit.thresholdPoints;
    await teacherApi('/teachers/blunders/sync-student', {
      method: 'POST',
      body: { studentId: sid, hkDayKey, force: !!force, maxGamesPerDay, thresholdPoints }
    });
  }

  async function teacherHistoryScanStudent(studentId, historyGames, force) {
    const sid = String(studentId || '').trim();
    if (!sid) return;
    const n = Math.max(1, Math.min(500, Number(historyGames || 0) || 0));
    if (!n) return;
    const edit = STATE.teacher.edits.student?.[sid] || {};
    const thresholdPoints = edit.thresholdPoints;
    await teacherApi('/teachers/blunders/sync-student', {
      method: 'POST',
      body: { studentId: sid, mode: 'history', historyGames: n, force: !!force, thresholdPoints }
    });
  }

  async function teacherSyncMaster(masterId, hkDayKey, force) {
    const mid = String(masterId || '').trim();
    if (!mid) return;
    await teacherApi('/teachers/blunders/sync-master', { method: 'POST', body: { masterId: mid, hkDayKey, force: !!force } });
  }

  async function teacherBulkSyncSelected(force) {
    const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
    const ids = selected.filter(Boolean);
    if (!ids.length) return;
    const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
    const idSet = new Set(allRows.map(s => String(s.id || '')));
    const valid = ids.filter(id => idSet.has(id));
    if (!valid.length) return;

    STATE.teacher.loading = true;
    STATE.teacher.error = '';
    render();
    try {
      for (let i = 0; i < valid.length; i++) {
        const sid = valid[i];
        const dateEl = document.querySelector(`[data-bl-teacher-student-date="${CSS.escape(sid)}"]`);
        const hkDayKey = String(dateEl?.value || '').trim();
        STATE.teacher.error = `Syncing ${i + 1}/${valid.length}...`;
        render();
        await teacherSyncStudent(sid, hkDayKey, !!force);
      }
      STATE.teacher.error = '';
    } catch (e) {
      STATE.teacher.error = String(e?.message || e);
    } finally {
      STATE.teacher.loading = false;
      await teacherLoad('students').catch(() => {});
    }
  }

  async function teacherBulkHistoryScanSelected(force) {
    const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
    const ids = selected.filter(Boolean);
    if (!ids.length) return;
    const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
    const idSet = new Set(allRows.map(s => String(s.id || '')));
    const valid = ids.filter(id => idSet.has(id));
    if (!valid.length) return;

    const n = Math.max(1, Math.min(500, Number(STATE.teacher.bulkHistoryGames || 200) || 200));

    STATE.teacher.loading = true;
    STATE.teacher.error = '';
    render();
    try {
      for (let i = 0; i < valid.length; i++) {
        const sid = valid[i];
        STATE.teacher.error = `History scanning ${i + 1}/${valid.length} (N=${n})...`;
        render();
        await teacherHistoryScanStudent(sid, n, !!force);
      }
      STATE.teacher.error = '';
    } catch (e) {
      STATE.teacher.error = String(e?.message || e);
    } finally {
      STATE.teacher.loading = false;
      await teacherLoad('students').catch(() => {});
    }
  }

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
    const verdict = String(isMaster ? STATE.uiBoard.masterVerdict : STATE.uiBoard.blunderVerdict);
    const moveUci = String(isMaster ? STATE.uiBoard.masterMoveUci : STATE.uiBoard.blunderMoveUci);
    const moveSan = String(isMaster ? STATE.uiBoard.masterMoveSan : STATE.uiBoard.blunderMoveSan);
    const bestUci = String(isMaster ? STATE.uiBoard.masterBestMoveUci : STATE.uiBoard.blunderBestMoveUci);
    const bestSan = String(isMaster ? STATE.uiBoard.masterBestMoveSan : STATE.uiBoard.blunderBestMoveSan);
    const origin = String(isMaster ? STATE.uiBoard.masterBestOrigin : STATE.uiBoard.blunderBestOrigin);

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
    const showBestBtn = canShowBest ? `<button class="btn btn-secondary" type="button" data-bl-inline-best="${isMaster ? 'master' : 'blunder'}">Show best move</button>` : '';
    const retryBtn = `<button class="btn btn-primary" type="button" data-bl-inline-retry="${isMaster ? 'master' : 'blunder'}">Retry</button>`;
    // Next is only shown when the player FOUND the best move (not when best move was revealed).
    const nextBtn = (verdict === 'best' && origin === 'attempt')
      ? `<button class="btn btn-secondary" type="button" data-bl-inline-next="${isMaster ? 'master' : 'blunder'}">${isMaster ? 'Next' : (STATE.mode === 'practice' ? 'Next (Random)' : 'Next')}</button>`
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
          ${retryBtn}
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

  function render() {
    const root = document.getElementById('blundersRoot');
    if (!root) return;
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
      return;
    }
    const content =
      STATE.page === 'home' ? renderHomePage() :
      STATE.page === 'blunder' ? renderBlunderPage() :
      STATE.page === 'masterGame' ? renderStudentMasterGamePage() :
      STATE.page === 'review' ? renderReviewPage() :
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
  }

  function initBlunders() {
    const root = document.getElementById('blundersRoot');
    if (!root) return;

    applyBoardColors();

    const role = getBlundersRole();
    if (role === 'teacher') {
      STATE.me = { id: 'teacher', name: 'Teacher', studentId: '' };
      render();
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
        const dateEl = root.querySelector(`[data-bl-teacher-student-date="${CSS.escape(sid)}"]`);
        const hkDayKey = String(dateEl?.value || '');
        try { await teacherSyncStudent(sid, hkDayKey, false); } catch (e) { STATE.teacher.error = String(e?.message || e); render(); }
        return teacherLoad('students');
      }
      const syncStuF = t?.closest?.('[data-bl-teacher-sync-student-force]');
      if (syncStuF) {
        const sid = String(syncStuF.getAttribute('data-bl-teacher-sync-student-force') || '');
        const dateEl = root.querySelector(`[data-bl-teacher-student-date="${CSS.escape(sid)}"]`);
        const hkDayKey = String(dateEl?.value || '');
        try { await teacherSyncStudent(sid, hkDayKey, true); } catch (e) { STATE.teacher.error = String(e?.message || e); render(); }
        return teacherLoad('students');
      }
      const hs = t?.closest?.('[data-bl-teacher-history-scan]');
      if (hs) {
        const sid = String(hs.getAttribute('data-bl-teacher-history-scan') || '');
        const sel = root.querySelector(`[data-bl-teacher-history-n="${CSS.escape(sid)}"]`);
        const n = Number(sel?.value || 0) || Number(STATE.teacher?.historyScanN?.[sid] || 0) || 200;
        try { await teacherHistoryScanStudent(sid, n, false); } catch (e) { STATE.teacher.error = String(e?.message || e); render(); }
        return teacherLoad('students');
      }
      const hsF = t?.closest?.('[data-bl-teacher-history-scan-force]');
      if (hsF) {
        const sid = String(hsF.getAttribute('data-bl-teacher-history-scan-force') || '');
        const sel = root.querySelector(`[data-bl-teacher-history-n="${CSS.escape(sid)}"]`);
        const n = Number(sel?.value || 0) || Number(STATE.teacher?.historyScanN?.[sid] || 0) || 200;
        try { await teacherHistoryScanStudent(sid, n, true); } catch (e) { STATE.teacher.error = String(e?.message || e); render(); }
        return teacherLoad('students');
      }
      const syncM = t?.closest?.('[data-bl-teacher-sync-master]');
      if (syncM) {
        const mid = String(syncM.getAttribute('data-bl-teacher-sync-master') || '');
        const dateEl = root.querySelector(`[data-bl-teacher-master-date="${CSS.escape(mid)}"]`);
        const hkDayKey = String(dateEl?.value || '');
        try { await teacherSyncMaster(mid, hkDayKey, false); } catch (e) { STATE.teacher.error = String(e?.message || e); render(); }
        return teacherLoad('masterGame');
      }
      const syncMF = t?.closest?.('[data-bl-teacher-sync-master-force]');
      if (syncMF) {
        const mid = String(syncMF.getAttribute('data-bl-teacher-sync-master-force') || '');
        const dateEl = root.querySelector(`[data-bl-teacher-master-date="${CSS.escape(mid)}"]`);
        const hkDayKey = String(dateEl?.value || '');
        try { await teacherSyncMaster(mid, hkDayKey, true); } catch (e) { STATE.teacher.error = String(e?.message || e); render(); }
        return teacherLoad('masterGame');
      }

      const nav = t?.closest?.('[data-bl-nav]');
      if (nav) {
        const key = String(nav.getAttribute('data-bl-nav') || '');
        if (key) {
          setPage(key);
          if (key === 'masterGame') {
            ensureMasterGameLoaded().catch(() => {});
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
      if (t?.closest?.('[data-bl-go-blunder]')) { setBlunderModePending(); return setPage('blunder'); }
      if (t?.closest?.('[data-bl-go-review]')) {
        const ts = Number(STATE.ui?.lastBlunderUiActionTs || 0);
        if (STATE.page === 'blunder' && ts && (Date.now() - ts) < 900) return;
        return setPage('review');
      }

      const rp = t?.closest?.('[data-bl-review-practice]');
      if (rp) {
        const key = String(rp.getAttribute('data-bl-review-practice') || '');
        const all = getReviewPuzzlesFiltered();
        if (!all.length) return;

        const isMissMate = (p) => {
          const bestCp = Number(p?.bestCp ?? 0);
          return Number.isFinite(bestCp) && Math.abs(bestCp) >= 99999;
        };
        const dropOf = (p) => {
          const d = (typeof p?.dropPoints === 'number') ? p.dropPoints : (Number(p?.dropCp || 0) / 100);
          return Number.isFinite(d) ? d : 0;
        };
        const bucketKeyOf = (p) => {
          if (isMissMate(p)) return 'missMate';
          const d = dropOf(p);
          if (d <= 1.5) return 'd1';
          if (d <= 2.0) return 'd2';
          if (d <= 3.0) return 'd3';
          return 'd4';
        };

        let pool = [];
        if (key === 'random') {
          // Random = pick from the requested 4 drop buckets (exclude miss-mate, since it's its own category)
          pool = all.filter(p => bucketKeyOf(p) !== 'missMate');
        } else {
          pool = all.filter(p => bucketKeyOf(p) === key);
        }
        if (!pool.length) return;

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
        // blunder
        clearInlineResult('blunder');
        STATE.selectedFrom = null;
        if (STATE.mode === 'practice') {
          const completed = Array.isArray(STATE.completed) ? STATE.completed : [];
          if (completed.length) {
            const pick = completed[Math.floor(Math.random() * completed.length)];
            setBlunderModePractice(pick);
            setPage('blunder');
            return;
          }
          render();
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

    root.addEventListener('input', (ev) => {
      const el = ev.target;
      // Teacher inputs
      const sEl = el?.closest?.('[data-bl-teacher-search]');
      if (sEl) {
        STATE.teacher.search = String(sEl.value || '');
        render();
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


