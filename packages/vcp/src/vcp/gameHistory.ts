'use strict';

function registerVcpGameHistory(ctx: any): void {
  const { fs, VCP_CHESS_GAMES_FILE, vcpChessGameIdIndex } = ctx;

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

  function vcpComputeChessResult(session: any) {
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

  async function appendVcpChessGameRecord(record: any) {
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

  function vcpBuildPgnFromSanMoves(sanMoves: any) {
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

  function vcpBuildTimelineBoards(session: any) {
    try {
      const base = ctx.vcpCreateInitialChessState(session);
      // keep a clean clock to avoid side effects
      base.clocks = { wMs: 0, bMs: 0 };
      base.turnStartTs = 0;
      const boards = [ctx.vcpCloneBoard(base.board)];
      let cur = base;
      const moves = Array.isArray(session?.chessState?.history) ? session.chessState.history : [];
      for (const mv of moves) {
        const next = ctx.vcpApplyMoveToState(cur, String(mv.from || ''), String(mv.to || ''), String(mv.promo || 'q'));
        if (!next) break;
        cur = next;
        boards.push(ctx.vcpCloneBoard(cur.board));
      }
      return boards;
    } catch {
      return null;
    }
  }

  function vcpBuildTimelineClocks(session: any) {
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
        turn = ctx.vcpOpp(turn);
        out.push({ wMs, bMs, turn });
      }
      return out;
    } catch {
      return null;
    }
  }

  async function readVcpChessGameHistory(orgId: any, userId: any) {
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

  async function readVcpChessGameById(orgId: any, gameId: any) {
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

  Object.assign(ctx, {
    loadVcpChessGameHistoryIndex,
    vcpComputeChessResult,
    appendVcpChessGameRecord,
    vcpBuildPgnFromSanMoves,
    vcpBuildTimelineBoards,
    vcpBuildTimelineClocks,
    readVcpChessGameHistory,
    readVcpChessGameById
  });
}

module.exports = { registerVcpGameHistory };
export {};
