import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AliveWebSocket, WsOutgoingMessage, WsIncomingMessage } from './types';
import { getQueue } from './queue';

const HEARTBEAT_INTERVAL = 30000;

const wsClients = new Set<AliveWebSocket>();

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    const aliveWs = ws as AliveWebSocket;
    console.log('WebSocket client connected');
    wsClients.add(aliveWs);

    aliveWs.isAlive = true;

    aliveWs.on('pong', () => {
      aliveWs.isAlive = true;
    });

    aliveWs.on('message', (message: Buffer | string) => {
      try {
        const data = JSON.parse(message.toString()) as WsIncomingMessage;
        console.log('WS message:', data.type || 'unknown');

        if (data.type === 'ping') {
          aliveWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch {
        // Ignore invalid JSON
      }
    });

    aliveWs.on('close', () => {
      console.log('WebSocket client disconnected');
      wsClients.delete(aliveWs);
    });

    aliveWs.on('error', (err: Error) => {
      console.error('WebSocket error:', err.message);
      wsClients.delete(aliveWs);
    });

    const queue = getQueue();
    const pendingCount = queue.filter(e => !e.acknowledged).length;
    aliveWs.send(JSON.stringify({
      type: 'connected',
      queueSize: queue.length,
      pendingCount,
      timestamp: Date.now()
    }));
  });

  const heartbeatInterval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      const aliveWs = ws as AliveWebSocket;
      if (aliveWs.isAlive === false) {
        wsClients.delete(aliveWs);
        return aliveWs.terminate();
      }
      aliveWs.isAlive = false;
      aliveWs.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return wss;
}

export function broadcast(message: WsOutgoingMessage | Record<string, unknown>): void {
  const data = JSON.stringify(message);
  let sent = 0;

  wsClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
      sent++;
    }
  });

  if (sent > 0) {
    const msgType = 'type' in message ? (message as { type: string }).type : 'unknown';
    console.log(`Broadcast to ${sent} client(s): ${msgType}`);
  }
}
