'use strict';

function registerVcpWsHandlers(ctx: any): void {
  const { wss } = ctx;

  wss.on('connection', (ws: any) => {
    ws.vcp = null; // { kind, orgId, userId, name }

    ws.on('message', async (raw: any) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw || '')) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(msg?.type || '');

      if (await ctx.vcpHandleWsProtocolMessage(ws, msg, type)) return;
      if (await ctx.vcpHandleWsInvitesMessage(ws, msg, type)) return;
      if (await ctx.vcpHandleWsChessMessage(ws, msg, type)) return;
    });

    ws.on('close', () => {
      ctx.vcpHandleWsClose(ws);
    });
  });
}

module.exports = { registerVcpWsHandlers };
export {};
