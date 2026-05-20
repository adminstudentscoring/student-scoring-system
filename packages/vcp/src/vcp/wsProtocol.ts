'use strict';

function registerVcpWsProtocol(ctx: any): void {
  const { vcp, verifyToken, nowIso } = ctx;

  async function vcpHandleWsProtocolMessage(ws: any, msg: any, type: string): Promise<boolean> {
    if (type === 'vcp_hello') {
      const token = String(msg?.token || '');
      const decoded = verifyToken(token);
      if (!decoded) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Unauthorized' });
        return true;
      }
      const role = String(decoded?.role || '');
      const kind = role === 'teacher' ? 'teacher' : role === 'student' ? 'student' : '';
      if (!kind) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Role not supported', role });
        return true;
      }

      const orgId = await ctx.resolveOrgIdFromToken(decoded);
      if (!orgId) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Organization not found' });
        return true;
      }

      const name = await ctx.resolveUserName(decoded);
      ws.vcp = { kind, orgId, userId: String(decoded?.id || ''), name, role };

      if (kind === 'teacher') {
        ctx.vcpOrgTeachersSet(orgId).add(ws);
        ctx.wsSend(ws, { type: 'vcp_ready', kind, orgId, name, userId: String(decoded?.id || '') });
        ctx.wsSend(ws, { type: 'vcp_presence_snapshot', students: ctx.vcpSnapshotForOrg(orgId) });
      } else {
        // Student presence
        const studentId = String(decoded?.id || '');
        const studentPublicId = String(decoded?.studentId || '');
        const map = ctx.vcpOrgStudentsMap(orgId);
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
        const inActiveSession = Array.from(vcp.sessions.values()).some((s: any) => {
          return s && String(s.orgId) === String(orgId) && String(s.mode) === 'chess' && String(s.status) === 'active'
            && Array.isArray(s.studentIds) && s.studentIds.includes(String(studentId));
        });
        presence.inGame = !!inActiveSession;
        presence.status = inActiveSession ? 'in-game' : 'online';
        presence.lastActivity = nowIso();
        presence.lastActivityTs = Date.now();
        presence.connections.add(ws);
        map.set(studentId, presence);
        ctx.wsSend(ws, { type: 'vcp_ready', kind, orgId, name, status: presence.status, userId: studentId, studentId: studentPublicId });
        ctx.vcpBroadcastPresence(orgId);
      }
      return true;
    }

    // Require hello first
    if (!ws.vcp) {
      ctx.wsSend(ws, { type: 'vcp_error', error: 'Not initialized' });
      return true;
    }

    const { kind, orgId, userId } = ws.vcp;

    if (type === 'vcp_activity') {
      if (kind !== 'student') return true;
      const map = ctx.vcpOrgStudentsMap(orgId);
      const p = map.get(String(userId));
      if (!p) return true;
      p.lastActivityTs = Date.now();
      p.lastActivity = nowIso();
      if (!p.inGame && p.status !== 'online') p.status = 'online';
      map.set(String(userId), p);
      // Throttle: do not broadcast every activity; only if status changed
      if (String(msg?.statusChanged) === 'true') ctx.vcpBroadcastPresence(orgId);
      return true;
    }

    if (type === 'vcp_ping') {
      // App-level heartbeat to keep connections alive behind proxies.
      if (kind === 'student') {
        const map = ctx.vcpOrgStudentsMap(orgId);
        const p = map.get(String(userId));
        if (p) {
          p.lastActivityTs = Date.now();
          p.lastActivity = nowIso();
          if (!p.inGame && p.status !== 'online') p.status = 'online';
          map.set(String(userId), p);
        }
      }
      ctx.wsSend(ws, { type: 'vcp_pong', ts: Date.now() });
      return true;
    }

    if (type === 'vcp_get_presence') {
      // Allow both teacher and student to refresh presence snapshot.
      ctx.wsSend(ws, { type: 'vcp_presence_snapshot', students: ctx.vcpSnapshotForOrg(orgId) });
      return true;
    }

    if (type === 'vcp_get_live_games') {
      ctx.wsSend(ws, { type: 'vcp_live_games_snapshot', games: ctx.vcpLiveGamesSnapshotForOrg(orgId) });
      return true;
    }

    if (type === 'vcp_get_session') {
      const sessionId = String(msg?.sessionId || '');
      if (!sessionId) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'sessionId is required' });
        return true;
      }
      const session = vcp.sessions.get(sessionId);
      if (!session || String(session.orgId) !== String(orgId)) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Session not found' });
        return true;
      }
      // Send the full session snapshot (for spectator viewer)
      ctx.wsSend(ws, { type: 'vcp_session_snapshot', sessionId, session });
      return true;
    }

    if (type === 'vcp_watch_session') {
      const sessionId = String(msg?.sessionId || '');
      if (!sessionId) return true;
      const session = vcp.sessions.get(sessionId);
      if (!session || String(session.orgId) !== String(orgId)) return true;
      if (!ws.vcpWatched) ws.vcpWatched = new Set();
      ws.vcpWatched.add(sessionId);
      if (!vcp.watchersBySession.has(sessionId)) vcp.watchersBySession.set(sessionId, new Set());
      vcp.watchersBySession.get(sessionId).add(ws);
      return true;
    }

    if (type === 'vcp_unwatch_session') {
      const sessionId = String(msg?.sessionId || '');
      if (!sessionId) return true;
      try { ws.vcpWatched?.delete?.(sessionId); } catch {}
      try { vcp.watchersBySession.get(sessionId)?.delete?.(ws); } catch {}
      return true;
    }

    if (type === 'vcp_get_game_history') {
      const targetUserId = String(msg?.targetUserId || '');
      const pageRaw = Number(msg?.page || 1);
      const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
      const pageSize = 10;
      if (!targetUserId) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'targetUserId is required' });
        return true;
      }
      const all = await ctx.readVcpChessGameHistory(orgId, targetUserId);
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
      ctx.wsSend(ws, {
        type: 'vcp_game_history',
        targetUserId,
        page: cur,
        pageSize,
        totalItems,
        totalPages,
        games
      });
      return true;
    }

    if (type === 'vcp_get_game_record') {
      const gameId = String(msg?.gameId || '');
      if (!gameId) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'gameId is required' });
        return true;
      }
      const g = await ctx.readVcpChessGameById(orgId, gameId);
      if (!g) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Game not found' });
        return true;
      }
      ctx.wsSend(ws, { type: 'vcp_game_record', game: g });
      return true;
    }

    return false;
  }

  function vcpHandleWsClose(ws: any): void {
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
      try { ctx.vcpOrgTeachersSet(orgId).delete(ws); } catch {}
      return;
    }
    if (kind === 'student') {
      const smap = ctx.vcpOrgStudentsMap(orgId);
      const p = smap.get(String(userId));
      if (p && p.connections) {
        try { p.connections.delete(ws); } catch {}
        if (p.connections.size <= 0) {
          smap.delete(String(userId));
          ctx.vcpBroadcastPresence(orgId);
        } else {
          smap.set(String(userId), p);
        }
      }
    }
  }

  Object.assign(ctx, { vcpHandleWsProtocolMessage, vcpHandleWsClose });
}

module.exports = { registerVcpWsProtocol };
export {};
