const WebSocket = require('ws');

let wss: any = null;

function setWss(server: any): void {
  wss = server;
}

function broadcast(data: any): void {
  if (!wss) return;
  wss.clients.forEach((client: any) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

export {};

module.exports = { setWss, broadcast, getWss: () => wss };
