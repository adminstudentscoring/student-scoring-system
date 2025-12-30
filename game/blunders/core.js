// Blunders core (shared state + helpers). Keep this file dependency-free.
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
    page: 'home', // 'home' | 'blunder' | 'review' | 'masterGame' | 'challenge' | 'leaderboard' | 'settings'
    mode: 'pending', // 'pending' | 'practice'
    me: null,
    data: null,
    pending: [],
    completed: [],
    currentIndex: 0,
    selectedFrom: null,
    promoPending: null, // { baseUci }
    practicePuzzle: null,
    // Practice context (used for "Next" in practice mode)
    practiceKey: 'random', // 'random' | 'missMate' | 'd1' | 'd2' | 'd3' | 'd4'
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
      // Deprecated (pre-pagination): teacher all-blunders returned full entries list.
      // Kept for backward compatibility, but new UI uses allUi below.
      allBlunders: [],
      masterConfig: { maxGamesPerDay: 10, thresholdPoints: 1.0 },
      edits: { student: {}, masters: null, masterCfg: null },
      lastLoadedAt: '',
      ratingsSchedule: null,
      blundersSchedule: null,
      // Teacher Students UI
      search: '',
      selectedIds: [],
      bulkMaxGames: 10,
      bulkThreshold: 1.0,
      bulkHistoryGames: 200,
      historyScanN: {},
      dateByStudent: {}, // studentId -> YYYY-MM-DD
      dateByMaster: {}, // masterId -> YYYY-MM-DD
      // Teacher All blunders UI
      allDuration: 'all', // week | month | halfYear | year | all
      allRating: 'any', // any | 100-400 | 401-700 | 701-1000 | 1001-1500 | 1501-2000 | 2000up
      allUi: {
        pageSize: 50,
        counts: null, // { missMate, d1, d2, d3, d4, total }
        storageStats: null,
        buckets: {
          missMate: { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' },
          d1: { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' },
          d2: { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' },
          d3: { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' },
          d4: { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' }
        }
      }
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
      // Challenge
      challengeFen: '',
      challengeMoveUci: '',
      challengeMoveSan: '',
      challengeVerdict: '',
      challengeBestMoveUci: '',
      challengeBestMoveSan: '',
      challengeBestOrigin: '', // '' | 'attempt' | 'revealed'
      // Master game
      masterFen: '',
      masterMoveUci: '',
      masterMoveSan: '',
      masterVerdict: '',
      masterBestMoveUci: '',
      masterBestMoveSan: '',
      masterBestOrigin: '' // '' | 'attempt' | 'revealed'
    },
    challenge: {
      loading: false,
      error: '',
      sessionId: '',
      difficulty: 'easy', // easy | medium | hard
      pointsAward: 1,
      ratingBucket: '',
      correct: 0,
      target: 10,
      idx: 0,
      puzzle: null,
      nextPuzzle: null,
      done: false,
      totalPoints: null
    },
    leaderboard: { loading: false, error: '', entries: [], myTotal: 0, loadedAt: '' },
    ui: {
      modalOpen: false,
      modalHtml: '',
      lastInlineBestClickTs: 0,
      homePracticeDuration: 'all',
      focus: null,
      // Student Review UI (bucketed + paged; avoids rendering all puzzles at once)
      reviewUi: {
        pageSize: 50,
        cacheKey: '',
        cache: null, // { totalAll, totalFiltered, counts, buckets: {key: puzzles[]} }
        buckets: {
          missMate: { open: false, page: 1, totalPages: 1, jump: '' },
          d1: { open: false, page: 1, totalPages: 1, jump: '' },
          d2: { open: false, page: 1, totalPages: 1, jump: '' },
          d3: { open: false, page: 1, totalPages: 1, jump: '' },
          d4: { open: false, page: 1, totalPages: 1, jump: '' }
        }
      }
    }
  };

  function todayYmdLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }

  function captureFocusInfo(root) {
    try {
      const ae = document.activeElement;
      if (!ae || !root.contains(ae)) { STATE.ui.focus = null; return; }
      const isInput = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
      const selStart = isInput && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;
      const selEnd = isInput && typeof ae.selectionEnd === 'number' ? ae.selectionEnd : null;

      if (ae.closest?.('[data-bl-teacher-search]')) {
        STATE.ui.focus = { kind: 'teacherSearch', selStart, selEnd };
        return;
      }
      const sd = ae.closest?.('[data-bl-teacher-student-date]');
      if (sd) {
        const sid = String(sd.getAttribute('data-bl-teacher-student-date') || '');
        STATE.ui.focus = { kind: 'studentDate', sid, selStart, selEnd };
        return;
      }
      const md = ae.closest?.('[data-bl-teacher-master-date]');
      if (md) {
        const mid = String(md.getAttribute('data-bl-teacher-master-date') || '');
        STATE.ui.focus = { kind: 'masterDate', mid, selStart, selEnd };
        return;
      }
      STATE.ui.focus = null;
    } catch {
      STATE.ui.focus = null;
    }
  }

  function restoreFocusInfo(root) {
    try {
      const f = STATE.ui.focus;
      if (!f) return;
      let el = null;
      if (f.kind === 'teacherSearch') el = root.querySelector('[data-bl-teacher-search]');
      if (f.kind === 'studentDate' && f.sid) el = root.querySelector(`[data-bl-teacher-student-date="${CSS.escape(String(f.sid))}"]`);
      if (f.kind === 'masterDate' && f.mid) el = root.querySelector(`[data-bl-teacher-master-date="${CSS.escape(String(f.mid))}"]`);
      if (!el) return;
      el.focus?.();
      if (typeof f.selStart === 'number' && typeof f.selEnd === 'number') {
        try { el.setSelectionRange?.(f.selStart, f.selEnd); } catch {}
      }
    } catch {}
  }

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

  async function challengeStart(studentId, difficulty) {
    const qs = getStudentPasswordQuery();
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/challenge/start${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: String(difficulty || 'easy') })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  async function challengeAttempt(studentId, sessionId, moveUci, revealBest) {
    const qs = getStudentPasswordQuery();
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/challenge/attempt${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, moveUci, revealBest: !!revealBest })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  async function fetchChallengeLeaderboard(studentId) {
    const qs = getStudentPasswordQuery();
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/challenge/leaderboard${qs}`);
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

  function dropOfPuzzle(p) {
    const d = (typeof p?.dropPoints === 'number') ? p.dropPoints : (Number(p?.dropCp || 0) / 100);
    return Number.isFinite(d) ? d : 0;
  }

  function isMissMatePuzzle(p) {
    const bestCp = Number(p?.bestCp ?? 0);
    return Number.isFinite(bestCp) && Math.abs(bestCp) >= 99999;
  }

  function bucketKeyOfPuzzle(p) {
    if (isMissMatePuzzle(p)) return 'missMate';
    const d = dropOfPuzzle(p);
    if (d <= 1.5) return 'd1';
    if (d <= 2.0) return 'd2';
    if (d <= 3.0) return 'd3';
    return 'd4';
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

  window.BlundersCore = {
    escapeHtml,
    STATE,
    todayYmdLocal,
    captureFocusInfo,
    restoreFocusInfo,
    getBlundersRole,
    VCP_DEFAULTS,
    readBoardColors,
    applyBoardColors,
    setBoardColors,
    getPlayers,
    getStudentPasswordQuery,
    getStudentPasswordQueryWith,
    fetchMyBlunders,
    fetchMasterList,
    fetchMasterPuzzles,
    submitMasterAttempt,
    getTeacherAuthHeader,
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
  };
})();


