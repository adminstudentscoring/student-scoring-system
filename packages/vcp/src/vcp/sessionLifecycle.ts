'use strict';

function registerVcpSessionLifecycle(ctx: any): void {
  const { vcp, nowIso } = ctx;

  function vcpBroadcastChessSync(session: any) {
    const payload = { type: 'vcp_chess_sync', sessionId: String(session.id), state: session.chessState };
    // teacher who created session
    for (const tws of ctx.vcpOrgTeachersSet(String(session.orgId))) {
      if (tws?.vcp?.kind === 'teacher' && String(tws.vcp.userId) === String(session.teacherId)) ctx.wsSend(tws, payload);
    }
    // students
    const smap = ctx.vcpOrgStudentsMap(String(session.orgId));
    for (const sid of session.studentIds || []) {
      const pres = smap.get(String(sid));
      if (!pres) continue;
      for (const sWs of pres.connections) ctx.wsSend(sWs, payload);
    }

    // spectators (watchers)
    try {
      const set = vcp.watchersBySession.get(String(session.id));
      if (set && set.size) {
        for (const w of Array.from(set)) ctx.wsSend(w, payload);
      }
    } catch {}
  }

  // Live games (org-wide spectator snapshots)
  function vcpLiveGamesSnapshotForOrg(orgId: any) {
    const out = [];
    const smap = ctx.vcpOrgStudentsMap(String(orgId));
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

  function vcpBroadcastLiveGames(orgId: any) {
    const payload = { type: 'vcp_live_games_snapshot', games: vcpLiveGamesSnapshotForOrg(orgId) };
    // teachers
    for (const tws of ctx.vcpOrgTeachersSet(String(orgId))) ctx.wsSend(tws, payload);
    // students
    const smap = ctx.vcpOrgStudentsMap(String(orgId));
    for (const pres of smap.values()) {
      if (!pres?.connections) continue;
      for (const sWs of pres.connections) ctx.wsSend(sWs, payload);
    }
  }

  function vcpEndChessSession(orgId: any, session: any, reason: any) {
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
      const resultInfo = ctx.vcpComputeChessResult(session);
      const sanMoves = Array.isArray(st.history) ? st.history.map(m => String(m?.san || '').trim()).filter(Boolean) : [];
      const pgn = ctx.vcpBuildPgnFromSanMoves(sanMoves);
      const timelineBoards = ctx.vcpBuildTimelineBoards(session) || null;
      const timelineClocks = ctx.vcpBuildTimelineClocks(session) || null;
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
      const smap = ctx.vcpOrgStudentsMap(orgId);
      const wp = smap.get(String(cfg.whiteStudentId || ''));
      const bp = smap.get(String(cfg.blackStudentId || ''));
      if (!record.whiteName) record.whiteName = wp ? String(wp.name || 'White') : 'White';
      if (!record.blackName) record.blackName = bp ? String(bp.name || 'Black') : 'Black';
      if (!record.whiteStudentId) record.whiteStudentId = wp ? String(wp.studentId || '') : '';
      if (!record.blackStudentId) record.blackStudentId = bp ? String(bp.studentId || '') : '';
      ctx.appendVcpChessGameRecord(record);
    } catch {}

    // Mark players back online
    for (const sid of session.studentIds || []) {
      ctx.setStudentStatus(orgId, String(sid), 'online', false);
      const smap = ctx.vcpOrgStudentsMap(orgId);
      const pres = smap.get(String(sid));
      if (pres) {
        pres.lastActivityTs = Date.now();
        pres.lastActivity = nowIso();
        smap.set(String(sid), pres);
      }
    }
    ctx.vcpBroadcastPresence(orgId);
    vcpBroadcastChessSync(session);
    vcpBroadcastLiveGames(orgId);
  }

  Object.assign(ctx, {
    vcpBroadcastChessSync,
    vcpLiveGamesSnapshotForOrg,
    vcpBroadcastLiveGames,
    vcpEndChessSession
  });
}

module.exports = { registerVcpSessionLifecycle };
export {};
