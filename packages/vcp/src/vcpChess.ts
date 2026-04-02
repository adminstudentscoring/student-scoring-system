'use strict';

/**
 * V.Chess Platform (WebSocket realtime) — extracted from server.js.
 *
 * Exports a single async setup function that wires all VCP state,
 * WebSocket handlers, timers, and helper utilities.
 */
async function setupVcpChess({ wss, WebSocket, fs, VCP_CHESS_GAMES_FILE, verifyToken, readData, readUsers, nowIso }: any): Promise<void> {

  // ============================
  // V.Chess Platform (WebSocket realtime)
  // ============================
  const VCP_IDLE_MS = 3 * 60 * 1000;
  const vcp = {
    studentsByOrg: new Map(), // orgId -> Map(studentUserId -> presence)
    teachersByOrg: new Map(), // orgId -> Set(ws)
    invites: new Map(), // inviteId -> invite
    sessions: new Map(), // sessionId -> session
    watchersBySession: new Map() // sessionId -> Set(ws)
  };

  function wsSend(ws, payload) {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    } catch {}
  }

  function vcpOrgStudentsMap(orgId) {
    const key = String(orgId || '');
    if (!vcp.studentsByOrg.has(key)) vcp.studentsByOrg.set(key, new Map());
    return vcp.studentsByOrg.get(key);
  }

  function vcpOrgTeachersSet(orgId) {
    const key = String(orgId || '');
    if (!vcp.teachersByOrg.has(key)) vcp.teachersByOrg.set(key, new Set());
    return vcp.teachersByOrg.get(key);
  }

  function vcpSnapshotForOrg(orgId: any) {
    const students = Array.from(vcpOrgStudentsMap(orgId).values()).map((p: any) => ({
      id: p.id,
      name: p.name,
      studentId: p.studentId || '',
      status: p.status,
      lastActivity: p.lastActivity,
      inGame: !!p.inGame
    }));
    // Stable sort: in-game, online, idle
    const order = { 'in-game': 0, online: 1, idle: 2 };
    students.sort((a, b) => {
      const oa = order[a.status] ?? 9;
      const ob = order[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return students;
  }

  function vcpBroadcastPresence(orgId) {
    const payload = { type: 'vcp_presence_snapshot', students: vcpSnapshotForOrg(orgId) };
    for (const tws of vcpOrgTeachersSet(orgId)) wsSend(tws, payload);
  }

  async function resolveOrgIdFromToken(decoded) {
    const orgId = decoded?.organizationId || null;
    if (orgId) return String(orgId);
    // Student tokens might not carry orgId; fallback to student record lookup.
    if (String(decoded?.role || '') === 'student') {
      const data = await readData();
      const students = Array.isArray(data?.students) ? data.students : [];
      const sid = String(decoded?.id || '');
      const s = students.find(st => String(st?.id) === sid);
      if (s?.organizationId) return String(s.organizationId);
    }
    return '';
  }

  async function resolveUserName(decoded) {
    const name = String(decoded?.name || '').trim();
    if (name) return name;
    try {
      const users = await readUsers();
      const u = users.find(x => String(x?.id) === String(decoded?.id));
      if (u?.name) return String(u.name);
    } catch {}
    return 'Unknown';
  }


  function updateStudentPresence(orgId, student) {
    const map = vcpOrgStudentsMap(orgId);
    map.set(String(student.id), student);
    vcpBroadcastPresence(orgId);
  }

  function setStudentStatus(orgId, studentId, status, inGame = false) {
    const map = vcpOrgStudentsMap(orgId);
    const cur = map.get(String(studentId));
    if (!cur) return;
    cur.status = status;
    cur.inGame = !!inGame;
    map.set(String(studentId), cur);
  }

  // Periodic idle checker
  const vcpIdleTicker = setInterval(() => {
    const now = Date.now();
    for (const [orgId, smap] of vcp.studentsByOrg.entries()) {
      let changed = false;
      for (const st of smap.values()) {
        if (!st || st.inGame) continue;
        const last = Number(st.lastActivityTs || 0);
        const shouldIdle = last && (now - last) >= VCP_IDLE_MS;
        if (shouldIdle && st.status !== 'idle') {
          st.status = 'idle';
          st.lastActivity = nowIso();
          changed = true;
        }
        if (!shouldIdle && st.status === 'idle') {
          st.status = 'online';
          st.lastActivity = nowIso();
          changed = true;
        }
      }
      if (changed) vcpBroadcastPresence(orgId);
    }
  }, 15000);
  vcpIdleTicker.unref?.();

  // Periodic chess timeout checker (keeps clocks accurate even without moves)
  const vcpChessClockTicker = setInterval(() => {
    const now = Date.now();
    for (const session of vcp.sessions.values()) {
      if (!session || String(session.mode) !== 'chess') continue;
      if (String(session.status) !== 'active') continue;
      const st = session.chessState;
      if (!st || st.gameOver) continue;
      const turn = String(st.turn || 'w');
      const elapsed = Math.max(0, now - Number(st.turnStartTs || now));
      const wMs0 = Number(st.clocks?.wMs ?? 0);
      const bMs0 = Number(st.clocks?.bMs ?? 0);
      const wMs = turn === 'w' ? Math.max(0, wMs0 - elapsed) : wMs0;
      const bMs = turn === 'b' ? Math.max(0, bMs0 - elapsed) : bMs0;

      // keep clients in sync even if no moves are made
      if (now - Number(st._lastSyncTs || 0) >= 1000) {
        st._lastSyncTs = now;
        session.chessState = st;
        vcp.sessions.set(String(session.id), session);
        vcpBroadcastChessSync(session);
        vcpBroadcastLiveGames(String(session.orgId));
      }

      if (wMs <= 0 || bMs <= 0) {
        st.clocks.wMs = wMs;
        st.clocks.bMs = bMs;
        st.gameOver = true;
        st.gameOverReason = 'Time out';
        session.chessState = st;
        vcp.sessions.set(String(session.id), session);
        // End session + record game history
        vcpEndChessSession(String(session.orgId), session, 'Time out');
      }
    }
  }, 1000);
  vcpChessClockTicker.unref?.();

  // ----------------------------
  // Normal Chess (MVP) helpers
  // ----------------------------
  const VCP_FILES = 'abcdefgh';

  // ----------------------------
  // VCP Chess game history (persisted)
  // ----------------------------
  const vcpChessGameIdIndex = new Set(); // gameId (sessionId) -> recorded

  async function loadVcpChessGameHistoryIndex() {
    try {
      const raw = await fs.readFile(VCP_CHESS_GAMES_FILE, 'utf8');
      const lines = String(raw || '').split('\n').map(s => s.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const id = String(obj?.id || '');
          if (id) vcpChessGameIdIndex.add(id);
        } catch {}
      }
    } catch {}
  }

  function vcpComputeChessResult(session) {
    const st = session?.chessState || {};
    const reason = String(st.gameOverReason || '');
    const cfg = session?.config || {};
    const whiteId = String(cfg.whiteStudentId || '');
    const blackId = String(cfg.blackStudentId || '');
    const wMs = Number(st?.clocks?.wMs ?? 0);
    const bMs = Number(st?.clocks?.bMs ?? 0);

    if (/Draw agreed/i.test(reason)) return { result: '1/2-1/2', winnerColor: null, reason };
    if (/White resigned/i.test(reason)) return { result: '0-1', winnerColor: 'b', reason };
    if (/Black resigned/i.test(reason)) return { result: '1-0', winnerColor: 'w', reason };
    if (/Time out/i.test(reason)) {
      if (wMs <= 0 && bMs <= 0) return { result: '1/2-1/2', winnerColor: null, reason };
      if (wMs <= 0) return { result: '0-1', winnerColor: 'b', reason };
      if (bMs <= 0) return { result: '1-0', winnerColor: 'w', reason };
      return { result: '1/2-1/2', winnerColor: null, reason };
    }
    if (/Player left/i.test(reason)) {
      // Unknown winner for MVP; treat as loss for leaver if available; otherwise show unknown.
      const endedBy = String(session?.endedByUserId || '');
      if (endedBy && endedBy === whiteId) return { result: '0-1', winnerColor: 'b', reason };
      if (endedBy && endedBy === blackId) return { result: '1-0', winnerColor: 'w', reason };
      return { result: '1/2-1/2', winnerColor: null, reason };
    }
    // Default fallback
    return { result: '1/2-1/2', winnerColor: null, reason: reason || 'ended' };
  }

  async function appendVcpChessGameRecord(record) {
    try {
      const id = String(record?.id || '');
      if (!id) return;
      if (vcpChessGameIdIndex.has(id)) return;
      const line = JSON.stringify(record);
      await fs.appendFile(VCP_CHESS_GAMES_FILE, `${line}\n`, 'utf8');
      vcpChessGameIdIndex.add(id);
    } catch (e) {
      console.error('Failed to append VCP chess game record:', e);
    }
  }

  function vcpBuildPgnFromSanMoves(sanMoves) {
    const m = Array.isArray(sanMoves) ? sanMoves.filter(x => String(x || '').trim()) : [];
    if (!m.length) return '';
    const parts = [];
    for (let i = 0; i < m.length; i += 2) {
      const moveNo = Math.floor(i / 2) + 1;
      const w = m[i] ? String(m[i]) : '';
      const b = m[i + 1] ? String(m[i + 1]) : '';
      parts.push(`${moveNo}. ${w}${b ? ` ${b}` : ''}`);
    }
    return parts.join(' ');
  }

  function vcpBuildTimelineBoards(session) {
    try {
      const base = vcpCreateInitialChessState(session);
      // keep a clean clock to avoid side effects
      base.clocks = { wMs: 0, bMs: 0 };
      base.turnStartTs = 0;
      const boards = [vcpCloneBoard(base.board)];
      let cur = base;
      const moves = Array.isArray(session?.chessState?.history) ? session.chessState.history : [];
      for (const mv of moves) {
        const next = vcpApplyMoveToState(cur, String(mv.from || ''), String(mv.to || ''), String(mv.promo || 'q'));
        if (!next) break;
        cur = next;
        boards.push(vcpCloneBoard(cur.board));
      }
      return boards;
    } catch {
      return null;
    }
  }

  function vcpBuildTimelineClocks(session) {
    try {
      const cfg = session?.config || {};
      const minutes = Math.max(1, Math.min(60, Number(cfg?.minutes) || 3));
      const inc = Math.max(0, Math.min(60, Number(cfg?.incrementSec) || 0));
      let wMs = minutes * 60 * 1000;
      let bMs = minutes * 60 * 1000;
      let turn = 'w';
      const out = [{ wMs, bMs, turn }];
      const moves = Array.isArray(session?.chessState?.history) ? session.chessState.history : [];
      for (const mv of moves) {
        const spent = Math.max(0, Number(mv?.spentMs ?? 0) || 0);
        if (turn === 'w') wMs = Math.max(0, wMs - spent) + inc * 1000;
        else bMs = Math.max(0, bMs - spent) + inc * 1000;
        turn = vcpOpp(turn);
        out.push({ wMs, bMs, turn });
      }
      return out;
    } catch {
      return null;
    }
  }

  async function readVcpChessGameHistory(orgId, userId) {
    try {
      const raw = await fs.readFile(VCP_CHESS_GAMES_FILE, 'utf8');
      const lines = String(raw || '').split('\n').map(s => s.trim()).filter(Boolean);
      const out = [];
      const oid = String(orgId || '');
      const uid = String(userId || '');
      for (const line of lines) {
        try {
          const g = JSON.parse(line);
          if (!g) continue;
          if (String(g.orgId || '') !== oid) continue;
          if (String(g.whiteId || '') !== uid && String(g.blackId || '') !== uid) continue;
          out.push(g);
        } catch {}
      }
      // newest first
      out.sort((a, b) => Number(new Date(b.endedAt || b.startedAt || 0)) - Number(new Date(a.endedAt || a.startedAt || 0)));
      return out;
    } catch {
      return [];
    }
  }

  async function readVcpChessGameById(orgId, gameId) {
    try {
      const raw = await fs.readFile(VCP_CHESS_GAMES_FILE, 'utf8');
      const lines = String(raw || '').split('\n').map(s => s.trim()).filter(Boolean);
      const oid = String(orgId || '');
      const gid = String(gameId || '');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const g = JSON.parse(lines[i]);
          if (String(g?.id || '') !== gid) continue;
          if (String(g?.orgId || '') !== oid) return null;
          return g;
        } catch {}
      }
      return null;
    } catch {
      return null;
    }
  }

  function vcpCoordToRc(coord) {
    const s = String(coord || '');
    const f = VCP_FILES.indexOf(s[0]);
    const rank = Number(s[1] || 0);
    if (f < 0 || rank < 1 || rank > 8) return null;
    return { r: 8 - rank, c: f };
  }

  function vcpRcToCoord(r, c) {
    return `${VCP_FILES[c]}${8 - r}`;
  }

  function vcpPieceColor(p) {
    if (!p) return null;
    return p === p.toUpperCase() ? 'w' : 'b';
  }

  function vcpOpp(c) {
    return c === 'w' ? 'b' : 'w';
  }

  function vcpInBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function vcpCloneBoard(b) {
    return b.map(row => row.slice());
  }

  function vcpInitialBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(''));
    const backW = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    const backB = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    b[7] = backW.slice();
    b[6] = Array(8).fill('P');
    b[0] = backB.slice();
    b[1] = Array(8).fill('p');
    return b;
  }

  function vcpFindKing(board, color) {
    const k = color === 'w' ? 'K' : 'k';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === k) return { r, c };
    return null;
  }

  function vcpIsSquareAttacked(board, r, c, byColor) {
    // pawns
    const pawnDir = byColor === 'w' ? -1 : 1;
    const pawn = byColor === 'w' ? 'P' : 'p';
    for (const dc of [-1, 1]) {
      const rr = r + pawnDir, cc = c + dc;
      if (vcpInBounds(rr, cc) && board[rr][cc] === pawn) return true;
    }
    // knights
    const knight = byColor === 'w' ? 'N' : 'n';
    const kd = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of kd) {
      const rr = r + dr, cc = c + dc;
      if (vcpInBounds(rr, cc) && board[rr][cc] === knight) return true;
    }
    // king
    const king = byColor === 'w' ? 'K' : 'k';
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (vcpInBounds(rr, cc) && board[rr][cc] === king) return true;
    }
    // sliding
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (vcpInBounds(rr, cc)) {
        const p = board[rr][cc];
        if (p) {
          const col = vcpPieceColor(p);
          if (col === byColor) {
            const up = p.toUpperCase();
            if ((dr === 0 || dc === 0) && (up === 'R' || up === 'Q')) return true;
            if ((dr !== 0 && dc !== 0) && (up === 'B' || up === 'Q')) return true;
          }
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  }

  function vcpIsInCheck(board, color) {
    const k = vcpFindKing(board, color);
    if (!k) return false;
    return vcpIsSquareAttacked(board, k.r, k.c, vcpOpp(color));
  }

  function vcpHasAnyLegalMove(state, color) {
    const board = state?.board;
    if (!board) return false;
    // brute force (64x64 max) but only used on check situations for SAN suffix
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || vcpPieceColor(p) !== color) continue;
        const from = vcpRcToCoord(r, c);
        for (let rr = 0; rr < 8; rr++) {
          for (let cc = 0; cc < 8; cc++) {
            if (rr === r && cc === c) continue;
            const to = vcpRcToCoord(rr, cc);
            // Promotions: try all four; otherwise default 'q'
            const isPawn = p.toUpperCase() === 'P';
            const lastRank = color === 'w' ? 8 : 1;
            const toRank = Number(String(to)[1] || 0);
            const promos = (isPawn && toRank === lastRank) ? ['q', 'r', 'b', 'n'] : ['q'];
            for (const promo of promos) {
              if (vcpLegalMove(state, from, to, color, promo)) return true;
            }
          }
        }
      }
    }
    return false;
  }

  function vcpSanForMove(state, from, to, promo, moverColor) {
    const a = vcpCoordToRc(from);
    const z = vcpCoordToRc(to);
    if (!a || !z) return '';
    const board = state?.board;
    if (!board) return '';
    const p = board[a.r][a.c];
    if (!p) return '';
    const up = p.toUpperCase();

    // Castling
    if (up === 'K' && String(from) === (moverColor === 'w' ? 'e1' : 'e8')) {
      if (String(to) === (moverColor === 'w' ? 'g1' : 'g8')) return 'O-O';
      if (String(to) === (moverColor === 'w' ? 'c1' : 'c8')) return 'O-O-O';
    }

    const destPiece = board[z.r][z.c];
    const isPawn = up === 'P';
    const isCapture = (() => {
      if (destPiece) return true;
      // En passant capture: pawn moves diagonally onto empty square equal to ep target
      const ep = state?.ep;
      if (!ep || !isPawn) return false;
      if (String(ep) !== String(to)) return false;
      if (a.c === z.c) return false;
      return true;
    })();

    const pieceLetter = isPawn ? '' : up;

    // Disambiguation for pieces (except pawns)
    let disamb = '';
    if (!isPawn && up !== 'K') {
      const candidates = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (r === a.r && c === a.c) continue;
          const pp = board[r][c];
          if (!pp) continue;
          if (vcpPieceColor(pp) !== moverColor) continue;
          if (pp.toUpperCase() !== up) continue;
          const cf = vcpRcToCoord(r, c);
          if (vcpLegalMove(state, cf, to, moverColor, String(promo || 'q'))) {
            candidates.push({ r, c, coord: cf });
          }
        }
      }
      if (candidates.length) {
        const fromFile = String(from)[0];
        const fromRank = String(from)[1];
        const sameFile = candidates.some(x => String(x.coord)[0] === fromFile);
        const sameRank = candidates.some(x => String(x.coord)[1] === fromRank);
        if (!sameFile) disamb = fromFile;
        else if (!sameRank) disamb = fromRank;
        else disamb = `${fromFile}${fromRank}`;
      }
    }

    // Pawn capture includes file of origin
    const originFile = String(from)[0];
    const capturePrefix = isPawn && isCapture ? originFile : '';

    // Promotion
    const promoStr = (() => {
      const toRank = Number(String(to)[1] || 0);
      if (!isPawn) return '';
      if (moverColor === 'w' && toRank !== 8) return '';
      if (moverColor === 'b' && toRank !== 1) return '';
      const pr = String(promo || 'q').toLowerCase();
      const ok = ['q', 'r', 'b', 'n'].includes(pr) ? pr : 'q';
      return `=${ok.toUpperCase()}`;
    })();

    let san = `${pieceLetter}${disamb}${capturePrefix}${isCapture ? 'x' : ''}${String(to)}${promoStr}`;

    // Check / mate suffix
    try {
      const next = vcpApplyMoveToState(state, from, to, promo);
      const opp = vcpOpp(moverColor);
      if (next && vcpIsInCheck(next.board, opp)) {
        const hasReply = vcpHasAnyLegalMove(next, opp);
        san += hasReply ? '+' : '#';
      }
    } catch {}

    return san;
  }

  function vcpApplyMoveToBoard(board, from, to, promo) {
    const b = vcpCloneBoard(board);
    const a = vcpCoordToRc(from);
    const z = vcpCoordToRc(to);
    if (!a || !z) return null;
    const p = b[a.r][a.c];
    b[a.r][a.c] = '';
    let placed = p;
    if ((p === 'P' && z.r === 0) || (p === 'p' && z.r === 7)) {
      placed = vcpPieceColor(p) === 'w' ? 'Q' : 'q';
      const up = String(promo || 'q').toLowerCase();
      if (['q','r','b','n'].includes(up)) placed = vcpPieceColor(p) === 'w' ? up.toUpperCase() : up;
    }
    b[z.r][z.c] = placed;
    return b;
  }

  function vcpGenPseudoMoves(board, from, color) {
    const a = vcpCoordToRc(from);
    if (!a) return [];
    const p = board[a.r][a.c];
    if (!p || vcpPieceColor(p) !== color) return [];
    const up = p.toUpperCase();
    const moves = [];
    const add = (rr, cc) => {
      if (!vcpInBounds(rr, cc)) return;
      const t = board[rr][cc];
      if (!t) moves.push({ to: vcpRcToCoord(rr, cc) });
      else if (vcpPieceColor(t) !== color) moves.push({ to: vcpRcToCoord(rr, cc) });
    };

    if (up === 'P') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const oneR = a.r + dir;
      if (vcpInBounds(oneR, a.c) && !board[oneR][a.c]) {
        moves.push({ to: vcpRcToCoord(oneR, a.c) });
        const twoR = a.r + dir * 2;
        if (a.r === startRow && vcpInBounds(twoR, a.c) && !board[twoR][a.c]) moves.push({ to: vcpRcToCoord(twoR, a.c) });
      }
      for (const dc of [-1, 1]) {
        const rr = a.r + dir, cc = a.c + dc;
        if (!vcpInBounds(rr, cc)) continue;
        const t = board[rr][cc];
        if (t && vcpPieceColor(t) !== color) moves.push({ to: vcpRcToCoord(rr, cc) });
      }
      return moves;
    }

    if (up === 'N') {
      const d = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of d) add(a.r + dr, a.c + dc);
      return moves;
    }

    if (up === 'K') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        add(a.r + dr, a.c + dc);
      }
      return moves;
    }

    const dirs = [];
    if (up === 'B' || up === 'Q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
    if (up === 'R' || up === 'Q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
    for (const [dr, dc] of dirs) {
      let rr = a.r + dr, cc = a.c + dc;
      while (vcpInBounds(rr, cc)) {
        const t = board[rr][cc];
        if (!t) moves.push({ to: vcpRcToCoord(rr, cc) });
        else {
          if (vcpPieceColor(t) !== color) moves.push({ to: vcpRcToCoord(rr, cc) });
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return moves;
  }

  function vcpHasCastleRight(castling, right) {
    return String(castling || '').includes(right);
  }

  function vcpIsCastleMove(piece, from, to) {
    if (!piece) return false;
    if (piece.toUpperCase() !== 'K') return false;
    return (
      (from === 'e1' && (to === 'g1' || to === 'c1')) ||
      (from === 'e8' && (to === 'g8' || to === 'c8'))
    );
  }

  function vcpUpdateCastlingRights(castling, from, to, movedPiece, capturedPiece) {
    let s = String(castling || '');
    const remove = (ch) => { s = s.replace(ch, ''); };

    if (movedPiece === 'K') { remove('K'); remove('Q'); }
    if (movedPiece === 'k') { remove('k'); remove('q'); }

    if (movedPiece === 'R') {
      if (from === 'h1') remove('K');
      if (from === 'a1') remove('Q');
    }
    if (movedPiece === 'r') {
      if (from === 'h8') remove('k');
      if (from === 'a8') remove('q');
    }

    if (capturedPiece === 'R') {
      if (to === 'h1') remove('K');
      if (to === 'a1') remove('Q');
    }
    if (capturedPiece === 'r') {
      if (to === 'h8') remove('k');
      if (to === 'a8') remove('q');
    }
    return s;
  }

  function vcpApplyMoveToState(state, from, to, promo) {
    const board = state.board;
    const a = vcpCoordToRc(from);
    const z = vcpCoordToRc(to);
    if (!a || !z) return null;
    const piece = board[a.r][a.c];
    const captured = board[z.r][z.c] || '';

    const next = {
      ...state,
      board: vcpCloneBoard(board),
      ep: null,
      castling: String(state.castling || '')
    };

    // castling
    if (vcpIsCastleMove(piece, from, to)) {
      next.board[a.r][a.c] = '';
      next.board[z.r][z.c] = piece;
      if (to === 'g1') { next.board[7][7] = ''; next.board[7][5] = 'R'; }
      if (to === 'c1') { next.board[7][0] = ''; next.board[7][3] = 'R'; }
      if (to === 'g8') { next.board[0][7] = ''; next.board[0][5] = 'r'; }
      if (to === 'c8') { next.board[0][0] = ''; next.board[0][3] = 'r'; }
      next.castling = vcpUpdateCastlingRights(next.castling, from, to, piece, captured);
      return next;
    }

    // en passant capture
    if (piece && piece.toUpperCase() === 'P' && String(state.ep || '') === to && !captured) {
      if (piece === 'P') {
        const capR = z.r + 1;
        if (vcpInBounds(capR, z.c)) next.board[capR][z.c] = '';
      } else {
        const capR = z.r - 1;
        if (vcpInBounds(capR, z.c)) next.board[capR][z.c] = '';
      }
    }

    // normal move + promotion
    next.board[a.r][a.c] = '';
    let placed = piece;
    if ((piece === 'P' && z.r === 0) || (piece === 'p' && z.r === 7)) {
      let up = String(promo || 'q').toLowerCase();
      if (!['q', 'r', 'b', 'n'].includes(up)) up = 'q';
      placed = vcpPieceColor(piece) === 'w' ? up.toUpperCase() : up;
    }
    next.board[z.r][z.c] = placed;

    next.castling = vcpUpdateCastlingRights(next.castling, from, to, piece, captured);

    // set ep square on double pawn push
    if (piece && piece.toUpperCase() === 'P') {
      const color = vcpPieceColor(piece);
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      if (a.r === startRow && z.r === a.r + dir * 2) {
        const epR = a.r + dir;
        next.ep = vcpRcToCoord(epR, a.c);
      }
    }
    return next;
  }

  function vcpIsCastlePathSafe(board, color, to, castling) {
    if (vcpIsInCheck(board, color)) return false;
    if (color === 'w') {
      if (to === 'g1') {
        if (!vcpHasCastleRight(castling, 'K')) return false;
        const f1 = vcpCoordToRc('f1'), g1 = vcpCoordToRc('g1'), h1 = vcpCoordToRc('h1');
        if (!f1 || !g1 || !h1) return false;
        if (board[f1.r][f1.c] || board[g1.r][g1.c]) return false;
        if (board[h1.r][h1.c] !== 'R') return false;
        if (vcpIsSquareAttacked(board, f1.r, f1.c, 'b')) return false;
        if (vcpIsSquareAttacked(board, g1.r, g1.c, 'b')) return false;
        return true;
      }
      if (to === 'c1') {
        if (!vcpHasCastleRight(castling, 'Q')) return false;
        const d1 = vcpCoordToRc('d1'), c1 = vcpCoordToRc('c1'), b1 = vcpCoordToRc('b1'), a1 = vcpCoordToRc('a1');
        if (!d1 || !c1 || !b1 || !a1) return false;
        if (board[d1.r][d1.c] || board[c1.r][c1.c] || board[b1.r][b1.c]) return false;
        if (board[a1.r][a1.c] !== 'R') return false;
        if (vcpIsSquareAttacked(board, d1.r, d1.c, 'b')) return false;
        if (vcpIsSquareAttacked(board, c1.r, c1.c, 'b')) return false;
        return true;
      }
    } else {
      if (to === 'g8') {
        if (!vcpHasCastleRight(castling, 'k')) return false;
        const f8 = vcpCoordToRc('f8'), g8 = vcpCoordToRc('g8'), h8 = vcpCoordToRc('h8');
        if (!f8 || !g8 || !h8) return false;
        if (board[f8.r][f8.c] || board[g8.r][g8.c]) return false;
        if (board[h8.r][h8.c] !== 'r') return false;
        if (vcpIsSquareAttacked(board, f8.r, f8.c, 'w')) return false;
        if (vcpIsSquareAttacked(board, g8.r, g8.c, 'w')) return false;
        return true;
      }
      if (to === 'c8') {
        if (!vcpHasCastleRight(castling, 'q')) return false;
        const d8 = vcpCoordToRc('d8'), c8 = vcpCoordToRc('c8'), b8 = vcpCoordToRc('b8'), a8 = vcpCoordToRc('a8');
        if (!d8 || !c8 || !b8 || !a8) return false;
        if (board[d8.r][d8.c] || board[c8.r][c8.c] || board[b8.r][b8.c]) return false;
        if (board[a8.r][a8.c] !== 'r') return false;
        if (vcpIsSquareAttacked(board, d8.r, d8.c, 'w')) return false;
        if (vcpIsSquareAttacked(board, c8.r, c8.c, 'w')) return false;
        return true;
      }
    }
    return false;
  }

  function vcpLegalMove(state, from, to, color, promo) {
    const board = state.board;
    const a = vcpCoordToRc(from);
    const z = vcpCoordToRc(to);
    if (!a || !z) return false;
    const piece = board[a.r][a.c];
    if (!piece || vcpPieceColor(piece) !== color) return false;

    if (vcpIsCastleMove(piece, from, to)) {
      if (!vcpIsCastlePathSafe(board, color, to, state.castling)) return false;
      const next = vcpApplyMoveToState(state, from, to, promo);
      if (!next) return false;
      return !vcpIsInCheck(next.board, color);
    }

    const pseudo = vcpGenPseudoMoves(board, from, color);
    const canEP = piece.toUpperCase() === 'P' && String(state.ep || '') === String(to || '');
    if (!pseudo.some(m => m.to === to) && !canEP) return false;

    if (canEP) {
      const dir = color === 'w' ? -1 : 1;
      if (z.r !== a.r + dir) return false;
      if (Math.abs(z.c - a.c) !== 1) return false;
      if (board[z.r][z.c]) return false;
    }

    const next = vcpApplyMoveToState(state, from, to, promo);
    if (!next) return false;
    return !vcpIsInCheck(next.board, color);
  }

  function vcpCreateInitialChessState(session) {
    const minutes = Math.max(1, Math.min(60, Number(session?.config?.minutes) || 3));
    const wMs = minutes * 60 * 1000;
    const bMs = minutes * 60 * 1000;
    return {
      board: vcpInitialBoard(),
      turn: 'w',
      turnStartTs: Date.now(),
      clocks: { wMs, bMs },
      moveNumber: 1,
      castling: 'KQkq',
      ep: null,
      drawOffer: null, // { from: 'w'|'b', atTs }
      gameOver: false,
      gameOverReason: null,
      history: [] // [{ from,to,promo,by,atTs,moveNumber }]
    };
  }

  function vcpUpdateClocksForMove(state, incrementSec) {
    const now = Date.now();
    const turn = String(state.turn || 'w');
    const elapsed = Math.max(0, now - Number(state.turnStartTs || now));
    if (turn === 'w') state.clocks.wMs = Math.max(0, Number(state.clocks.wMs || 0) - elapsed);
    else state.clocks.bMs = Math.max(0, Number(state.clocks.bMs || 0) - elapsed);
    // add increment to the mover after move
    if (turn === 'w') state.clocks.wMs += incrementSec * 1000;
    else state.clocks.bMs += incrementSec * 1000;
    state.turnStartTs = now;
  }

  function vcpApplyChessMove(session, moverId, { from, to, promo }) {
    const cfg = session.config || {};
    const whiteId = String(cfg.whiteStudentId || '');
    const blackId = String(cfg.blackStudentId || '');
    const moverColor = String(moverId) === whiteId ? 'w' : String(moverId) === blackId ? 'b' : null;
    if (!moverColor) return { ok: false, error: 'Not a player' };

    const st = session.chessState;
    if (!st || st.gameOver) return { ok: false, error: 'Game not active' };
    if (String(st.turn || 'w') !== moverColor) return { ok: false, error: 'Not your turn' };

    // Time spent on this move (A: per-move thinking time)
    const nowTs = Date.now();
    const spentMs = Math.max(0, nowTs - Number(st.turnStartTs || nowTs));

    const board = st.board;
    const a = vcpCoordToRc(from);
    const z = vcpCoordToRc(to);
    if (!a || !z) return { ok: false, error: 'Invalid coordinates' };
    const piece = board[a.r][a.c];
    if (!piece || vcpPieceColor(piece) !== moverColor) return { ok: false, error: 'Invalid piece' };

    if (!vcpLegalMove(st, from, to, moverColor, promo)) return { ok: false, error: 'Illegal move' };

    // SAN (PGN) record based on current state before applying move
    const san = vcpSanForMove(st, from, to, promo, moverColor);

    const inc = Math.max(0, Math.min(60, Number(cfg.incrementSec) || 0));
    // clock update for mover (uses current turn)
    vcpUpdateClocksForMove(st, inc);

    // apply move (incl castling / en passant / promotion / ep / castling rights)
    const next = vcpApplyMoveToState(st, from, to, promo);
    if (!next) return { ok: false, error: 'Illegal move' };
    st.board = next.board;
    st.castling = next.castling;
    st.ep = next.ep;
    st.drawOffer = null; // clear any outstanding draw offer on move
    if (!Array.isArray(st.history)) st.history = [];
    st.history.push({
      from: String(from),
      to: String(to),
      promo: String(promo || 'q').toLowerCase(),
      san: String(san || ''),
      spentMs,
      by: String(moverId),
      atTs: Date.now(),
      moveNumber: Number(st.moveNumber || 1)
    });
    st.turn = vcpOpp(String(st.turn || 'w'));
    st.moveNumber = Number(st.moveNumber || 1) + 1;

    // timeout check (if mover used all time before moving)
    if (Number(st.clocks.wMs || 0) <= 0 || Number(st.clocks.bMs || 0) <= 0) {
      st.gameOver = true;
      st.gameOverReason = 'Time out';
    }

    // Checkmate / stalemate detection (server-authoritative)
    if (!st.gameOver) {
      const sideToMove = String(st.turn || 'w');
      const hasMove = vcpHasAnyLegalMove(st, sideToMove);
      if (!hasMove) {
        const inCheck = vcpIsInCheck(st.board, sideToMove);
        st.gameOver = true;
        st.gameOverReason = inCheck ? 'Checkmate' : 'Stalemate';
      }
    }

    session.chessState = st;
    vcp.sessions.set(String(session.id), session);
    return { ok: true };
  }

  function vcpBroadcastChessSync(session) {
    const payload = { type: 'vcp_chess_sync', sessionId: String(session.id), state: session.chessState };
    // teacher who created session
    for (const tws of vcpOrgTeachersSet(String(session.orgId))) {
      if (tws?.vcp?.kind === 'teacher' && String(tws.vcp.userId) === String(session.teacherId)) wsSend(tws, payload);
    }
    // students
    const smap = vcpOrgStudentsMap(String(session.orgId));
    for (const sid of session.studentIds || []) {
      const pres = smap.get(String(sid));
      if (!pres) continue;
      for (const sWs of pres.connections) wsSend(sWs, payload);
    }

    // spectators (watchers)
    try {
      const set = vcp.watchersBySession.get(String(session.id));
      if (set && set.size) {
        for (const w of Array.from(set)) wsSend(w, payload);
      }
    } catch {}
  }

  // Live games (org-wide spectator snapshots)
  function vcpLiveGamesSnapshotForOrg(orgId) {
    const out = [];
    const smap = vcpOrgStudentsMap(String(orgId));
    for (const s of vcp.sessions.values()) {
      if (!s || String(s.orgId) !== String(orgId)) continue;
      if (String(s.mode) !== 'chess') continue;
      if (String(s.status) !== 'active') continue;
      const st = s.chessState;
      if (!st) continue;
      const cfg = s.config || {};
      const whiteId = String(cfg.whiteStudentId || '');
      const blackId = String(cfg.blackStudentId || '');
      const wp = smap.get(whiteId);
      const bp = smap.get(blackId);
      out.push({
        sessionId: String(s.id),
        teacherId: String(s.teacherId || ''),
        teacherName: String(s.teacherName || ''),
        whiteId,
        blackId,
        whiteName: wp ? String(wp.name || 'White') : (String(s.whiteName || '') || (whiteId === String(s.teacherId || '') ? String(s.teacherName || 'Teacher') : 'White')),
        blackName: bp ? String(bp.name || 'Black') : (String(s.blackName || '') || (blackId === String(s.teacherId || '') ? String(s.teacherName || 'Teacher') : 'Black')),
        whiteStudentId: wp ? String(wp.studentId || '') : '',
        blackStudentId: bp ? String(bp.studentId || '') : '',
        config: { minutes: Number(cfg.minutes || 3), incrementSec: Number(cfg.incrementSec || 0) },
        state: {
          board: st.board,
          turn: st.turn,
          turnStartTs: st.turnStartTs,
          clocks: st.clocks,
          castling: st.castling,
          ep: st.ep,
          drawOffer: st.drawOffer,
          moveNumber: st.moveNumber,
          gameOver: st.gameOver,
          gameOverReason: st.gameOverReason
        }
      });
    }
    return out;
  }

  function vcpBroadcastLiveGames(orgId) {
    const payload = { type: 'vcp_live_games_snapshot', games: vcpLiveGamesSnapshotForOrg(orgId) };
    // teachers
    for (const tws of vcpOrgTeachersSet(String(orgId))) wsSend(tws, payload);
    // students
    const smap = vcpOrgStudentsMap(String(orgId));
    for (const pres of smap.values()) {
      if (!pres?.connections) continue;
      for (const sWs of pres.connections) wsSend(sWs, payload);
    }
  }

  function vcpEndChessSession(orgId, session, reason) {
    try {
      session.status = 'ended';
      if (session.chessState && !session.chessState.gameOver) {
        session.chessState.gameOver = true;
        session.chessState.gameOverReason = String(reason || 'ended');
      }
      vcp.sessions.set(String(session.id), session);
    } catch {}

    // Persist game record (append-only)
    try {
      const st = session?.chessState || {};
      const cfg = session?.config || {};
      const resultInfo = vcpComputeChessResult(session);
      const sanMoves = Array.isArray(st.history) ? st.history.map(m => String(m?.san || '').trim()).filter(Boolean) : [];
      const pgn = vcpBuildPgnFromSanMoves(sanMoves);
      const timelineBoards = vcpBuildTimelineBoards(session) || null;
      const timelineClocks = vcpBuildTimelineClocks(session) || null;
      const record = {
        id: String(session.id || ''),
        orgId: String(orgId || ''),
        mode: 'chess',
        startedAt: String(session?.startedAt || session?.createdAt || ''),
        endedAt: new Date().toISOString(),
        teacherId: String(session.teacherId || ''),
        teacherName: String(session.teacherName || ''),
        whiteId: String(cfg.whiteStudentId || ''),
        blackId: String(cfg.blackStudentId || ''),
        whiteName: String(session.whiteName || ''),
        blackName: String(session.blackName || ''),
        whiteStudentId: String(session.whiteStudentId || ''),
        blackStudentId: String(session.blackStudentId || ''),
        config: { minutes: Number(cfg.minutes || 3), incrementSec: Number(cfg.incrementSec || 0) },
        result: String(resultInfo.result || '1/2-1/2'),
        resultReason: String(resultInfo.reason || st.gameOverReason || ''),
        endedByUserId: String(session.endedByUserId || ''),
        sanMoves,
        pgn,
        timelineBoards,
        timelineClocks,
        state: {
          board: st.board,
          clocks: st.clocks,
          turn: st.turn,
          moveNumber: st.moveNumber,
          castling: st.castling,
          ep: st.ep,
          gameOver: !!st.gameOver,
          gameOverReason: st.gameOverReason
        },
        moves: Array.isArray(st.history) ? st.history : []
      };
      // Fill missing names from presence snapshot if available
      const smap = vcpOrgStudentsMap(orgId);
      const wp = smap.get(String(cfg.whiteStudentId || ''));
      const bp = smap.get(String(cfg.blackStudentId || ''));
      if (!record.whiteName) record.whiteName = wp ? String(wp.name || 'White') : 'White';
      if (!record.blackName) record.blackName = bp ? String(bp.name || 'Black') : 'Black';
      if (!record.whiteStudentId) record.whiteStudentId = wp ? String(wp.studentId || '') : '';
      if (!record.blackStudentId) record.blackStudentId = bp ? String(bp.studentId || '') : '';
      appendVcpChessGameRecord(record);
    } catch {}

    // Mark players back online
    for (const sid of session.studentIds || []) {
      setStudentStatus(orgId, String(sid), 'online', false);
      const smap = vcpOrgStudentsMap(orgId);
      const pres = smap.get(String(sid));
      if (pres) {
        pres.lastActivityTs = Date.now();
        pres.lastActivity = nowIso();
        smap.set(String(sid), pres);
      }
    }
    vcpBroadcastPresence(orgId);
    vcpBroadcastChessSync(session);
    vcpBroadcastLiveGames(orgId);
  }

  // Load persisted game history index before accepting connections
  await loadVcpChessGameHistoryIndex();

  wss.on('connection', (ws) => {
    ws.vcp = null; // { kind, orgId, userId, name }

    ws.on('message', async (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw || '')) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(msg?.type || '');

      if (type === 'vcp_hello') {
        const token = String(msg?.token || '');
        const decoded = verifyToken(token);
        if (!decoded) {
          wsSend(ws, { type: 'vcp_error', error: 'Unauthorized' });
          return;
        }
        const role = String(decoded?.role || '');
        const kind = role === 'teacher' ? 'teacher' : role === 'student' ? 'student' : '';
        if (!kind) {
          wsSend(ws, { type: 'vcp_error', error: 'Role not supported', role });
          return;
        }

        const orgId = await resolveOrgIdFromToken(decoded);
        if (!orgId) {
          wsSend(ws, { type: 'vcp_error', error: 'Organization not found' });
          return;
        }

        const name = await resolveUserName(decoded);
        ws.vcp = { kind, orgId, userId: String(decoded?.id || ''), name, role };

        if (kind === 'teacher') {
          vcpOrgTeachersSet(orgId).add(ws);
          wsSend(ws, { type: 'vcp_ready', kind, orgId, name, userId: String(decoded?.id || '') });
          wsSend(ws, { type: 'vcp_presence_snapshot', students: vcpSnapshotForOrg(orgId) });
        } else {
          // Student presence
          const studentId = String(decoded?.id || '');
          const studentPublicId = String(decoded?.studentId || '');
          const map = vcpOrgStudentsMap(orgId);
          const existing = map.get(studentId);
          const presence = existing || {
            id: studentId,
            name,
            studentId: studentPublicId,
            status: 'online',
            inGame: false,
            lastActivity: nowIso(),
            lastActivityTs: Date.now(),
            connections: new Set()
          };
          presence.name = name;
          presence.studentId = presence.studentId || studentPublicId;
          // If the student is already in an active session, keep them in-game after refresh/reconnect.
          const inActiveSession = Array.from(vcp.sessions.values()).some((s) => {
            return s && String(s.orgId) === String(orgId) && String(s.mode) === 'chess' && String(s.status) === 'active'
              && Array.isArray(s.studentIds) && s.studentIds.includes(String(studentId));
          });
          presence.inGame = !!inActiveSession;
          presence.status = inActiveSession ? 'in-game' : 'online';
          presence.lastActivity = nowIso();
          presence.lastActivityTs = Date.now();
          presence.connections.add(ws);
          map.set(studentId, presence);
          wsSend(ws, { type: 'vcp_ready', kind, orgId, name, status: presence.status, userId: studentId, studentId: studentPublicId });
          vcpBroadcastPresence(orgId);
        }
        return;
      }

      // Require hello first
      if (!ws.vcp) {
        wsSend(ws, { type: 'vcp_error', error: 'Not initialized' });
        return;
      }

      const { kind, orgId, userId, name } = ws.vcp;

      if (type === 'vcp_activity') {
        if (kind !== 'student') return;
        const map = vcpOrgStudentsMap(orgId);
        const p = map.get(String(userId));
        if (!p) return;
        p.lastActivityTs = Date.now();
        p.lastActivity = nowIso();
        if (!p.inGame && p.status !== 'online') p.status = 'online';
        map.set(String(userId), p);
        // Throttle: do not broadcast every activity; only if status changed
        if (String(msg?.statusChanged) === 'true') vcpBroadcastPresence(orgId);
        return;
      }

      if (type === 'vcp_ping') {
        // App-level heartbeat to keep connections alive behind proxies.
        if (kind === 'student') {
          const map = vcpOrgStudentsMap(orgId);
          const p = map.get(String(userId));
          if (p) {
            p.lastActivityTs = Date.now();
            p.lastActivity = nowIso();
            if (!p.inGame && p.status !== 'online') p.status = 'online';
            map.set(String(userId), p);
          }
        }
        wsSend(ws, { type: 'vcp_pong', ts: Date.now() });
        return;
      }

      if (type === 'vcp_get_presence') {
        // Allow both teacher and student to refresh presence snapshot.
        wsSend(ws, { type: 'vcp_presence_snapshot', students: vcpSnapshotForOrg(orgId) });
        return;
      }

      if (type === 'vcp_get_live_games') {
        wsSend(ws, { type: 'vcp_live_games_snapshot', games: vcpLiveGamesSnapshotForOrg(orgId) });
        return;
      }

      if (type === 'vcp_get_session') {
        const sessionId = String(msg?.sessionId || '');
        if (!sessionId) {
          wsSend(ws, { type: 'vcp_error', error: 'sessionId is required' });
          return;
        }
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) {
          wsSend(ws, { type: 'vcp_error', error: 'Session not found' });
          return;
        }
        // Send the full session snapshot (for spectator viewer)
        wsSend(ws, { type: 'vcp_session_snapshot', sessionId, session });
        return;
      }

      if (type === 'vcp_watch_session') {
        const sessionId = String(msg?.sessionId || '');
        if (!sessionId) return;
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (!ws.vcpWatched) ws.vcpWatched = new Set();
        ws.vcpWatched.add(sessionId);
        if (!vcp.watchersBySession.has(sessionId)) vcp.watchersBySession.set(sessionId, new Set());
        vcp.watchersBySession.get(sessionId).add(ws);
        return;
      }

      if (type === 'vcp_unwatch_session') {
        const sessionId = String(msg?.sessionId || '');
        if (!sessionId) return;
        try { ws.vcpWatched?.delete?.(sessionId); } catch {}
        try { vcp.watchersBySession.get(sessionId)?.delete?.(ws); } catch {}
        return;
      }

      if (type === 'vcp_get_game_history') {
        const targetUserId = String(msg?.targetUserId || '');
        const pageRaw = Number(msg?.page || 1);
        const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
        const pageSize = 10;
        if (!targetUserId) {
          wsSend(ws, { type: 'vcp_error', error: 'targetUserId is required' });
          return;
        }
        const all = await readVcpChessGameHistory(orgId, targetUserId);
        const totalItems = all.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const cur = Math.min(page, totalPages);
        const start = (cur - 1) * pageSize;
        const games = all.slice(start, start + pageSize).map((g) => ({
          id: String(g.id || ''),
          endedAt: String(g.endedAt || ''),
          startedAt: String(g.startedAt || ''),
          whiteId: String(g.whiteId || ''),
          blackId: String(g.blackId || ''),
          whiteName: String(g.whiteName || 'White'),
          blackName: String(g.blackName || 'Black'),
          whiteStudentId: String(g.whiteStudentId || ''),
          blackStudentId: String(g.blackStudentId || ''),
          result: String(g.result || '1/2-1/2'),
          resultReason: String(g.resultReason || '')
        }));
        wsSend(ws, {
          type: 'vcp_game_history',
          targetUserId,
          page: cur,
          pageSize,
          totalItems,
          totalPages,
          games
        });
        return;
      }

      if (type === 'vcp_get_game_record') {
        const gameId = String(msg?.gameId || '');
        if (!gameId) {
          wsSend(ws, { type: 'vcp_error', error: 'gameId is required' });
          return;
        }
        const g = await readVcpChessGameById(orgId, gameId);
        if (!g) {
          wsSend(ws, { type: 'vcp_error', error: 'Game not found' });
          return;
        }
        wsSend(ws, { type: 'vcp_game_record', game: g });
        return;
      }

      if (type === 'vcp_invite_create') {
        if (kind !== 'teacher') return;
        const mode = String(msg?.mode || '');
        const studentIds = Array.isArray(msg?.studentIds) ? msg.studentIds.map(x => String(x)) : [];
        const configRaw = msg?.config;
        const config: Record<string, unknown> =
          configRaw && typeof configRaw === 'object' && !Array.isArray(configRaw)
            ? (configRaw as Record<string, unknown>)
            : {};

        if (mode !== 'chess') {
          wsSend(ws, { type: 'vcp_error', error: 'Only Normal Chess is supported for now' });
          return;
        }
        if (studentIds.length !== 2) {
          wsSend(ws, { type: 'vcp_error', error: 'Normal Chess requires exactly 2 students' });
          return;
        }

        const smap = vcpOrgStudentsMap(orgId);
        const p1 = smap.get(studentIds[0]);
        const p2 = smap.get(studentIds[1]);
        if (!p1 || !p2) {
          wsSend(ws, { type: 'vcp_error', error: 'One or more students are not online' });
          return;
        }
        if (p1.inGame || p2.inGame) {
          wsSend(ws, { type: 'vcp_error', error: 'One or more students are already in-game' });
          return;
        }

        const minutes = Math.max(1, Math.min(60, Number(config?.minutes) || 3));
        const incrementSec = Math.max(0, Math.min(60, Number(config?.incrementSec) || 2));
        const whiteStudentId = String(config?.whiteStudentId || studentIds[0]);
        const blackStudentId = String(config?.blackStudentId || studentIds[1]);
        if (![studentIds[0], studentIds[1]].includes(whiteStudentId) || ![studentIds[0], studentIds[1]].includes(blackStudentId) || whiteStudentId === blackStudentId) {
          wsSend(ws, { type: 'vcp_error', error: 'Invalid color assignment' });
          return;
        }

        const inviteId = `vcp_inv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const invite = {
          id: inviteId,
          orgId,
          teacher: { id: String(userId), name: String(name || 'Teacher') },
          mode: 'chess',
          studentIds: [studentIds[0], studentIds[1]],
          config: { minutes, incrementSec, whiteStudentId, blackStudentId },
          createdAt: nowIso(),
          status: 'pending',
          responses: {}
        };
        vcp.invites.set(inviteId, invite);

        // Send invite to students
        const payload = { type: 'vcp_invite', invite };
        for (const sid of invite.studentIds) {
          const pres = smap.get(String(sid));
          if (!pres) continue;
          for (const sWs of pres.connections) wsSend(sWs, payload);
        }
        wsSend(ws, { type: 'vcp_invite_sent', inviteId });
        return;
      }

      // Teacher vs Student match (teacher plays as a player; only 1 student needs to accept)
      if (type === 'vcp_invite_teacher_match') {
        if (kind !== 'teacher') return;
        const mode = String(msg?.mode || '');
        const studentId = String(msg?.studentId || '');
        const configRawTm = msg?.config;
        const config: Record<string, unknown> =
          configRawTm && typeof configRawTm === 'object' && !Array.isArray(configRawTm)
            ? (configRawTm as Record<string, unknown>)
            : {};

        if (mode !== 'chess') {
          wsSend(ws, { type: 'vcp_error', error: 'Only Normal Chess is supported for now' });
          return;
        }
        if (!studentId) {
          wsSend(ws, { type: 'vcp_error', error: 'studentId is required' });
          return;
        }

        const smap = vcpOrgStudentsMap(orgId);
        const p1 = smap.get(studentId);
        if (!p1) {
          wsSend(ws, { type: 'vcp_error', error: 'Student is not online' });
          return;
        }
        if (p1.inGame) {
          wsSend(ws, { type: 'vcp_error', error: 'Student is already in-game' });
          return;
        }

        const minutes = Math.max(1, Math.min(60, Number(config?.minutes) || 3));
        const incrementSec = Math.max(0, Math.min(60, Number(config?.incrementSec) || 2));
        const teacherId = String(userId || '');
        const whiteStudentId = String(config?.whiteStudentId || teacherId);
        const blackStudentId = String(config?.blackStudentId || studentId);
        const ids = [teacherId, studentId];
        if (!ids.includes(whiteStudentId) || !ids.includes(blackStudentId) || whiteStudentId === blackStudentId) {
          wsSend(ws, { type: 'vcp_error', error: 'Invalid color assignment' });
          return;
        }

        const inviteId = `vcp_inv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const invite = {
          id: inviteId,
          orgId,
          teacher: { id: teacherId, name: String(name || 'Teacher') },
          mode: 'chess',
          studentIds: [studentId],
          config: { minutes, incrementSec, whiteStudentId, blackStudentId },
          createdAt: nowIso(),
          status: 'pending',
          responses: {}
        };
        vcp.invites.set(inviteId, invite);

        const payload = { type: 'vcp_invite', invite };
        for (const sWs of p1.connections || []) wsSend(sWs, payload);
        wsSend(ws, { type: 'vcp_invite_sent', inviteId });
        return;
      }

      if (type === 'vcp_invite_respond') {
        if (kind !== 'student') return;
        const inviteId = String(msg?.inviteId || '');
        const response = String(msg?.response || '');
        const invite = vcp.invites.get(inviteId);
        if (!invite || String(invite.orgId) !== String(orgId)) return;
        if (!invite.studentIds.includes(String(userId))) return;
        if (!['accept', 'decline'].includes(response)) return;

        invite.responses[String(userId)] = response;
        // Notify teachers in org (simple broadcast)
        for (const tws of vcpOrgTeachersSet(orgId)) wsSend(tws, { type: 'vcp_invite_update', inviteId, studentId: String(userId), response });

        if (response === 'decline') {
          invite.status = 'declined';
          vcp.invites.set(inviteId, invite);
          return;
        }

        // If accepted -> start session (2-student or teacher-vs-student)
        const r1 = invite.responses[invite.studentIds[0]];
        const r2 = invite.studentIds.length > 1 ? invite.responses[invite.studentIds[1]] : null;
        const allAccepted = invite.studentIds.length === 1
          ? (r1 === 'accept')
          : (r1 === 'accept' && r2 === 'accept');

        if (allAccepted) {
          invite.status = 'accepted';
          vcp.invites.set(inviteId, invite);

          const sessionId = `vcp_sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          const startedAt = nowIso();
          const smap2 = vcpOrgStudentsMap(orgId);
          const whiteId = String(invite.config?.whiteStudentId || invite.studentIds[0]);
          const blackId = String(invite.config?.blackStudentId || (invite.studentIds[1] || invite.teacher?.id || ''));
          const wp = smap2.get(whiteId);
          const bp = smap2.get(blackId);
          const session = {
            id: sessionId,
            orgId,
            teacherId: invite.teacher.id,
            teacherName: String(invite.teacher?.name || ''),
            mode: invite.mode,
            studentIds: invite.studentIds.slice(),
            config: invite.config,
            chessState: null,
            createdAt: startedAt,
            startedAt,
            whiteName: wp ? String(wp.name || 'White') : (whiteId === String(invite.teacher?.id || '') ? String(invite.teacher?.name || 'Teacher') : 'White'),
            blackName: bp ? String(bp.name || 'Black') : (blackId === String(invite.teacher?.id || '') ? String(invite.teacher?.name || 'Teacher') : 'Black'),
            whiteStudentId: wp ? String(wp.studentId || '') : '',
            blackStudentId: bp ? String(bp.studentId || '') : '',
            status: 'active'
          };
          if (String(session.mode) === 'chess') session.chessState = vcpCreateInitialChessState(session);
          vcp.sessions.set(sessionId, session);

          // Mark students in-game
          for (const sid of session.studentIds) {
            setStudentStatus(orgId, sid, 'in-game', true);
          }
          vcpBroadcastPresence(orgId);

          const startPayload = { type: 'vcp_session_start', session };
          // Notify teacher sockets
          for (const tws of vcpOrgTeachersSet(orgId)) {
            if (tws?.vcp?.kind === 'teacher' && String(tws.vcp.userId) === String(session.teacherId)) wsSend(tws, startPayload);
          }
          // Notify students
          const smap = vcpOrgStudentsMap(orgId);
          for (const sid of session.studentIds) {
            const pres = smap.get(String(sid));
            if (!pres) continue;
            for (const sWs of pres.connections) wsSend(sWs, startPayload);
          }

          // Broadcast live games snapshot
          vcpBroadcastLiveGames(orgId);
        }
        return;
      }

      if (type === 'vcp_leave_session') {
        const sessionId = String(msg?.sessionId || '');
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (kind === 'student') {
          // End session if any player leaves (MVP)
          session.endedByUserId = String(userId);
          vcpEndChessSession(orgId, session, 'Player left');

          // Notify teacher that student left
          for (const tws of vcpOrgTeachersSet(orgId)) wsSend(tws, { type: 'vcp_session_update', sessionId, studentId: String(userId), action: 'left' });
        }
        return;
      }

      // Normal Chess: server-authoritative state
      if (type === 'vcp_chess_move') {
        const sessionId = String(msg?.sessionId || '');
        const from = String(msg?.from || '');
        const to = String(msg?.to || '');
        const promo = String(msg?.promo || 'q');
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (String(session.mode) !== 'chess') return;

        const cfg = session.config || {};
        const whitePlayerId = String(cfg.whiteStudentId || '');
        const blackPlayerId = String(cfg.blackStudentId || '');
        const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;

        // Only participants can move:
        // - students must be in session.studentIds
        // - teachers can only move if they are one of the two players (teacher vs student match)
        if (kind === 'student') {
          if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return;
        } else if (kind === 'teacher') {
          if (!isPlayer) return;
        } else {
          return;
        }

        // Ensure chess state exists
        if (!session.chessState) {
          session.chessState = vcpCreateInitialChessState(session);
          vcp.sessions.set(sessionId, session);
        }
        const result = vcpApplyChessMove(session, String(userId), { from, to, promo });
        if (!result?.ok) {
          wsSend(ws, { type: 'vcp_error', error: String(result?.error || 'Illegal move') });
          return;
        }

        if (session.chessState?.gameOver) {
          vcpEndChessSession(orgId, session, String(session.chessState.gameOverReason || 'ended'));
          return;
        }

        vcpBroadcastChessSync(session);
        vcpBroadcastLiveGames(orgId);
        return;
      }

      if (type === 'vcp_chess_offer_draw') {
        const sessionId = String(msg?.sessionId || '');
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (String(session.mode) !== 'chess') return;
        if (String(session.status) !== 'active') return;
        const cfg = session.config || {};
        const whitePlayerId = String(cfg.whiteStudentId || '');
        const blackPlayerId = String(cfg.blackStudentId || '');
        const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;
        if (kind === 'student') {
          if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return;
        } else if (kind === 'teacher') {
          if (!isPlayer) return;
        } else {
          return;
        }
        if (!session.chessState || session.chessState.gameOver) return;

        const moverColor = String(userId) === String(cfg.whiteStudentId || '') ? 'w' : String(userId) === String(cfg.blackStudentId || '') ? 'b' : null;
        if (!moverColor) return;

        session.chessState.drawOffer = { from: moverColor, atTs: Date.now() };
        vcp.sessions.set(String(session.id), session);
        vcpBroadcastChessSync(session);
        vcpBroadcastLiveGames(orgId);
        return;
      }

      if (type === 'vcp_chess_draw_response') {
        const sessionId = String(msg?.sessionId || '');
        const accept = String(msg?.accept || '') === 'true';
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (String(session.mode) !== 'chess') return;
        if (String(session.status) !== 'active') return;
        const cfg = session.config || {};
        const whitePlayerId = String(cfg.whiteStudentId || '');
        const blackPlayerId = String(cfg.blackStudentId || '');
        const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;
        if (kind === 'student') {
          if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return;
        } else if (kind === 'teacher') {
          if (!isPlayer) return;
        } else {
          return;
        }
        if (!session.chessState || session.chessState.gameOver) return;

        const myColor = String(userId) === String(cfg.whiteStudentId || '') ? 'w' : String(userId) === String(cfg.blackStudentId || '') ? 'b' : null;
        if (!myColor) return;

        const offer = session.chessState.drawOffer;
        if (!offer || !offer.from) return;
        if (String(offer.from) === String(myColor)) return; // cannot respond to own offer

        if (accept) {
          session.chessState.drawOffer = null;
          vcpEndChessSession(orgId, session, 'Draw agreed');
        } else {
          session.chessState.drawOffer = null;
          vcp.sessions.set(String(session.id), session);
          vcpBroadcastChessSync(session);
          vcpBroadcastLiveGames(orgId);
        }
        return;
      }

      if (type === 'vcp_chess_resign') {
        const sessionId = String(msg?.sessionId || '');
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (String(session.mode) !== 'chess') return;
        if (String(session.status) !== 'active') return;
        const cfg = session.config || {};
        const whitePlayerId = String(cfg.whiteStudentId || '');
        const blackPlayerId = String(cfg.blackStudentId || '');
        const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;
        if (kind === 'student') {
          if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return;
        } else if (kind === 'teacher') {
          if (!isPlayer) return;
        } else {
          return;
        }
        if (!session.chessState || session.chessState.gameOver) return;

        const myColor = String(userId) === String(cfg.whiteStudentId || '') ? 'w' : String(userId) === String(cfg.blackStudentId || '') ? 'b' : null;
        if (!myColor) return;

        vcpEndChessSession(orgId, session, `${myColor === 'w' ? 'White' : 'Black'} resigned`);
        return;
      }
    });

    ws.on('close', () => {
      if (!ws.vcp) return;
      const { kind, orgId, userId } = ws.vcp;
      // Cleanup any spectator watches
      try {
        if (ws.vcpWatched && ws.vcpWatched.size) {
          for (const sessionId of Array.from(ws.vcpWatched)) {
            try { vcp.watchersBySession.get(String(sessionId))?.delete?.(ws); } catch {}
          }
        }
      } catch {}
      if (kind === 'teacher') {
        try { vcpOrgTeachersSet(orgId).delete(ws); } catch {}
        return;
      }
      if (kind === 'student') {
        const smap = vcpOrgStudentsMap(orgId);
        const p = smap.get(String(userId));
        if (p && p.connections) {
          try { p.connections.delete(ws); } catch {}
          if (p.connections.size <= 0) {
            smap.delete(String(userId));
            vcpBroadcastPresence(orgId);
          } else {
            smap.set(String(userId), p);
          }
        }
      }
    });
  });
}

module.exports = { setupVcpChess };
