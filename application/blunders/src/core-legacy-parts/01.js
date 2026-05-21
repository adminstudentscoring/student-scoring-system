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
      selectedPuzzleId: '',
      // Bucketed paging UI (like Review / All blunders)
      ui: {
        pageSize: 50,
        counts: null, // { missMate, d1, d2, d3, d4, total }
        buckets: {
          missMate: { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' },
          d1: { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' },
          d2: { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' },
          d3: { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' },
          d4: { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' }
        }
      },
      // Local cache: puzzleId -> puzzle (from loaded buckets)
      byId: {},
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
      // Blunder tag stats (A: tactical themes)
      tagDuration: 'month', // week | month | halfYear | year | all
      tagStats: null,
      // Teacher Students UI
      search: '',
      selectedIds: [],
      bulkMaxGames: 10,
      bulkThreshold: 1.0,
      bulkHistoryGames: 200,
      historyScanN: {},
      historyScanNMaster: {},
      dateByStudent: {}, // studentId -> YYYY-MM-DD
      dateByMaster: {}, // masterId -> YYYY-MM-DD
      // Teacher All blunders UI
      allDuration: 'all', // week | month | halfYear | year | all
      allRating: 'any', // any | 100-400 | 401-700 | 701-1000 | 1001-1500 | 1501-2000 | 2001-2300 | 2201-2500 | 2501-2800 | 2801-3000 | 3001up
      allTag: 'any', // any | <tag>
      allUi: {
        pageSize: 50,
        counts: null, // { missMate, d1, d2, d3, d4, total }
        storageStats: null,
        tagCounts: null, // { tag: count, ... } (top tags for current filters)
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
    homeRecent: {
      loading: false,
      error: '',
      games: [], // [{ url, endTime, timeClass, pgn, fens, movesSan, blunders }]
      selectedGameIdx: 0,
      plyIdx: 0
    },
    homeAi: {
      loading: false,
      error: '',
      status: 'disabled', // disabled | cached | generating
      updatedAt: null,
      comment: null
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
    boardLight: 'rgb(231,200,147)',
    boardDark: 'rgb(172,113,76)'
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

  async function fetchMasterPuzzlesSummary(studentId, masterId) {
    const qs = getStudentPasswordQueryWith({ masterId, paged: 1 });
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/master${qs}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  async function fetchMasterPuzzlesBucket(studentId, masterId, bucket, page) {
    const qs = getStudentPasswordQueryWith({ masterId, paged: 1, bucket, page });
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

  async function fetchRecentGamesWithBlunders(studentId, limit) {
    const qs = getStudentPasswordQueryWith({ limit: Number(limit || 5) || 5 });
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/recent-games${qs}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  async function fetchAiComment(studentId) {
    const qs = getStudentPasswordQueryWith({});
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/ai-comment${qs}`);
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
