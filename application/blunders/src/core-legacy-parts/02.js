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
    return `/application/vchess-platform/pieces/${color}_${name}.png`;
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
    fetchMasterPuzzlesSummary,
    fetchMasterPuzzlesBucket,
    submitMasterAttempt,
    getTeacherAuthHeader,
    teacherApi,
    submitAttempt,
    challengeStart,
    challengeAttempt,
    fetchChallengeLeaderboard,
    // Student home: recent games (PGN viewer)
    fetchRecentGamesWithBlunders,
    // Student home: AI coach comment
    fetchAiComment,
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



