'use strict';

function registerVcpWsChess(ctx: any): void {
  const { vcp } = ctx;

  async function vcpHandleWsChessMessage(ws: any, msg: any, type: string): Promise<boolean> {
    const { kind, orgId, userId } = ws.vcp;

    if (type === 'vcp_leave_session') {
      const sessionId = String(msg?.sessionId || '');
      const session = vcp.sessions.get(sessionId);
      if (!session || String(session.orgId) !== String(orgId)) return true;
      if (kind === 'student') {
        // End session if any player leaves (MVP)
        session.endedByUserId = String(userId);
        ctx.vcpEndChessSession(orgId, session, 'Player left');

        // Notify teacher that student left
        for (const tws of ctx.vcpOrgTeachersSet(orgId)) ctx.wsSend(tws, { type: 'vcp_session_update', sessionId, studentId: String(userId), action: 'left' });
      }
      return true;
    }

    // Normal Chess: server-authoritative state
    if (type === 'vcp_chess_move') {
      const sessionId = String(msg?.sessionId || '');
      const from = String(msg?.from || '');
      const to = String(msg?.to || '');
      const promo = String(msg?.promo || 'q');
      const session = vcp.sessions.get(sessionId);
      if (!session || String(session.orgId) !== String(orgId)) return true;
      if (String(session.mode) !== 'chess') return true;

      const cfg = session.config || {};
      const whitePlayerId = String(cfg.whiteStudentId || '');
      const blackPlayerId = String(cfg.blackStudentId || '');
      const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;

      // Only participants can move:
      // - students must be in session.studentIds
      // - teachers can only move if they are one of the two players (teacher vs student match)
      if (kind === 'student') {
        if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return true;
      } else if (kind === 'teacher') {
        if (!isPlayer) return true;
      } else {
        return true;
      }

      // Ensure chess state exists
      if (!session.chessState) {
        session.chessState = ctx.vcpCreateInitialChessState(session);
        vcp.sessions.set(sessionId, session);
      }
      const result = ctx.vcpApplyChessMove(session, String(userId), { from, to, promo });
      if (!result?.ok) {
        ctx.wsSend(ws, { type: 'vcp_error', error: String(result?.error || 'Illegal move') });
        return true;
      }

      if (session.chessState?.gameOver) {
        ctx.vcpEndChessSession(orgId, session, String(session.chessState.gameOverReason || 'ended'));
        return true;
      }

      ctx.vcpBroadcastChessSync(session);
      ctx.vcpBroadcastLiveGames(orgId);
      return true;
    }

    if (type === 'vcp_chess_offer_draw') {
      const sessionId = String(msg?.sessionId || '');
      const session = vcp.sessions.get(sessionId);
      if (!session || String(session.orgId) !== String(orgId)) return true;
      if (String(session.mode) !== 'chess') return true;
      if (String(session.status) !== 'active') return true;
      const cfg = session.config || {};
      const whitePlayerId = String(cfg.whiteStudentId || '');
      const blackPlayerId = String(cfg.blackStudentId || '');
      const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;
      if (kind === 'student') {
        if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return true;
      } else if (kind === 'teacher') {
        if (!isPlayer) return true;
      } else {
        return true;
      }
      if (!session.chessState || session.chessState.gameOver) return true;

      const moverColor = String(userId) === String(cfg.whiteStudentId || '') ? 'w' : String(userId) === String(cfg.blackStudentId || '') ? 'b' : null;
      if (!moverColor) return true;

      session.chessState.drawOffer = { from: moverColor, atTs: Date.now() };
      vcp.sessions.set(String(session.id), session);
      ctx.vcpBroadcastChessSync(session);
      ctx.vcpBroadcastLiveGames(orgId);
      return true;
    }

    if (type === 'vcp_chess_draw_response') {
      const sessionId = String(msg?.sessionId || '');
      const accept = String(msg?.accept || '') === 'true';
      const session = vcp.sessions.get(sessionId);
      if (!session || String(session.orgId) !== String(orgId)) return true;
      if (String(session.mode) !== 'chess') return true;
      if (String(session.status) !== 'active') return true;
      const cfg = session.config || {};
      const whitePlayerId = String(cfg.whiteStudentId || '');
      const blackPlayerId = String(cfg.blackStudentId || '');
      const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;
      if (kind === 'student') {
        if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return true;
      } else if (kind === 'teacher') {
        if (!isPlayer) return true;
      } else {
        return true;
      }
      if (!session.chessState || session.chessState.gameOver) return true;

      const myColor = String(userId) === String(cfg.whiteStudentId || '') ? 'w' : String(userId) === String(cfg.blackStudentId || '') ? 'b' : null;
      if (!myColor) return true;

      const offer = session.chessState.drawOffer;
      if (!offer || !offer.from) return true;
      if (String(offer.from) === String(myColor)) return true; // cannot respond to own offer

      if (accept) {
        session.chessState.drawOffer = null;
        ctx.vcpEndChessSession(orgId, session, 'Draw agreed');
      } else {
        session.chessState.drawOffer = null;
        vcp.sessions.set(String(session.id), session);
        ctx.vcpBroadcastChessSync(session);
        ctx.vcpBroadcastLiveGames(orgId);
      }
      return true;
    }

    if (type === 'vcp_chess_resign') {
      const sessionId = String(msg?.sessionId || '');
      const session = vcp.sessions.get(sessionId);
      if (!session || String(session.orgId) !== String(orgId)) return true;
      if (String(session.mode) !== 'chess') return true;
      if (String(session.status) !== 'active') return true;
      const cfg = session.config || {};
      const whitePlayerId = String(cfg.whiteStudentId || '');
      const blackPlayerId = String(cfg.blackStudentId || '');
      const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;
      if (kind === 'student') {
        if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return true;
      } else if (kind === 'teacher') {
        if (!isPlayer) return true;
      } else {
        return true;
      }
      if (!session.chessState || session.chessState.gameOver) return true;

      const myColor = String(userId) === String(cfg.whiteStudentId || '') ? 'w' : String(userId) === String(cfg.blackStudentId || '') ? 'b' : null;
      if (!myColor) return true;

      ctx.vcpEndChessSession(orgId, session, `${myColor === 'w' ? 'White' : 'Black'} resigned`);
      return true;
    }

    return false;
  }

  Object.assign(ctx, { vcpHandleWsChessMessage });
}

module.exports = { registerVcpWsChess };
export {};
