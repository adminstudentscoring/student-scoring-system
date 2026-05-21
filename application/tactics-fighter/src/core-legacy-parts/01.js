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
    return h || '';
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
    if (m === 'home') return 'home';
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
    // IMPORTANT:
    // - For JSON bodies, set Content-Type.
    // - For FormData (multipart), NEVER set Content-Type manually (browser must set boundary).
    const isFormData = (typeof FormData !== 'undefined') && (options.body instanceof FormData);
    if (options.body && !headers['Content-Type'] && !isFormData) headers['Content-Type'] = 'application/json';
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
    return `/application/pieces/${color}_${name}.png`;
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

  function displayToBoardRc(displayR, displayC, orientation) {
    const o = String(orientation || 'white').toLowerCase();
    if (o === 'black') return { r: 7 - displayR, c: 7 - displayC };
    return { r: displayR, c: displayC };
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

  async function studentFetchStats(studentId, bucket, password) {
    const qp = new URLSearchParams();
    if (bucket) qp.set('bucket', normalizeBucketKey(bucket));
    if (password) qp.set('password', String(password));
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/stats?${qp.toString()}`, { method: 'GET' });
    return await tfJson(resp);
  }

  async function studentFetchGhostPuzzles(studentId, bucket, limit, password) {
    const qp = new URLSearchParams();
    if (bucket) qp.set('bucket', normalizeBucketKey(bucket));
    if (limit) qp.set('limit', String(limit));
    if (password) qp.set('password', String(password));
    const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/challenge/ghost?${qp.toString()}`, { method: 'GET' });
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

  async function teacherApplyMove(fen, uci) {
    const body = { fen: String(fen || ''), uci: String(uci || '') };
    const resp = await apiRequest('/api/teachers/tactics-fighter/apply-move', {
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

  async function builderUpdatePuzzle(puzzleId, payload) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/puzzles/${encodeURIComponent(String(puzzleId || ''))}`, {
      method: 'PATCH',
      body: JSON.stringify(payload || {})
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

  async function builderMoveCategory(categoryId, bucket) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ bucket })
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
