'use strict';

/**
 * V.Chess Platform (WebSocket realtime) — extracted from server.js.
 *
 * Exports a single async setup function that wires all VCP state,
 * WebSocket handlers, timers, and helper utilities.
 */

const { registerVcpChessEngine } = require('./vcp/chessEngine');
const { registerVcpGameHistory } = require('./vcp/gameHistory');
const { registerVcpPresence } = require('./vcp/presence');
const { registerVcpSessionLifecycle } = require('./vcp/sessionLifecycle');
const { registerVcpTickers } = require('./vcp/tickers');
const { registerVcpWsAuth } = require('./vcp/wsAuth');
const { registerVcpWsProtocol } = require('./vcp/wsProtocol');
const { registerVcpWsInvites } = require('./vcp/wsInvites');
const { registerVcpWsChess } = require('./vcp/wsChess');
const { registerVcpWsHandlers } = require('./vcp/wsHandlers');

async function setupVcpChess({ wss, WebSocket, fs, VCP_CHESS_GAMES_FILE, verifyToken, readData, readUsers, nowIso }: any): Promise<void> {
  const ctx: any = {
    wss,
    WebSocket,
    fs,
    VCP_CHESS_GAMES_FILE,
    verifyToken,
    readData,
    readUsers,
    nowIso,
    VCP_IDLE_MS: 3 * 60 * 1000,
    VCP_FILES: 'abcdefgh',
    vcpChessGameIdIndex: new Set(),
    vcp: {
      studentsByOrg: new Map(),
      teachersByOrg: new Map(),
      invites: new Map(),
      sessions: new Map(),
      watchersBySession: new Map()
    }
  };

  registerVcpChessEngine(ctx);
  registerVcpGameHistory(ctx);
  registerVcpPresence(ctx);
  registerVcpSessionLifecycle(ctx);
  registerVcpTickers(ctx);
  registerVcpWsAuth(ctx);
  registerVcpWsProtocol(ctx);
  registerVcpWsInvites(ctx);
  registerVcpWsChess(ctx);

  await ctx.loadVcpChessGameHistoryIndex();

  registerVcpWsHandlers(ctx);
}

module.exports = { setupVcpChess };
export {};
