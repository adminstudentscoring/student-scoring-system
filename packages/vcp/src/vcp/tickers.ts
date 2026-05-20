'use strict';

function registerVcpTickers(ctx: any): void {
  const { vcp, VCP_IDLE_MS, nowIso } = ctx;

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
      if (changed) ctx.vcpBroadcastPresence(orgId);
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
        ctx.vcpBroadcastChessSync(session);
        ctx.vcpBroadcastLiveGames(String(session.orgId));
      }

      if (wMs <= 0 || bMs <= 0) {
        st.clocks.wMs = wMs;
        st.clocks.bMs = bMs;
        st.gameOver = true;
        st.gameOverReason = 'Time out';
        session.chessState = st;
        vcp.sessions.set(String(session.id), session);
        // End session + record game history
        ctx.vcpEndChessSession(String(session.orgId), session, 'Time out');
      }
    }
  }, 1000);
  vcpChessClockTicker.unref?.();

  Object.assign(ctx, { vcpIdleTicker, vcpChessClockTicker });
}

module.exports = { registerVcpTickers };
export {};
