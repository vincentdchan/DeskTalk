import type { WebSocket } from 'ws';

/**
 * Set of connected WebSocket clients.
 */
const connectedClients = new Set<WebSocket>();

/**
 * Register a WebSocket client for receiving events.
 */
export function addClient(ws: WebSocket): void {
  connectedClients.add(ws);
  ws.on('close', () => {
    connectedClients.delete(ws);
  });
}

/**
 * Broadcast an event to all connected clients.
 */
export function broadcastEvent(miniAppId: string, event: string, data: unknown): void {
  const message = JSON.stringify({
    type: 'event',
    miniAppId,
    event,
    data,
  });

  for (const client of connectedClients) {
    if (client.readyState === 1 /* WebSocket.OPEN */) {
      client.send(message);
    }
  }
}

/**
 * Broadcast a raw message to all connected clients (for AI events, etc.).
 */
export function broadcastRaw(message: unknown): void {
  const raw = JSON.stringify(message);
  for (const client of connectedClients) {
    if (client.readyState === 1) {
      client.send(raw);
    }
  }
}
