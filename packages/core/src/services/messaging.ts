import type { MessagingHook, Disposable } from '@desktalk/sdk';
import type { WebSocket } from 'ws';

/**
 * Map of all registered command handlers across all MiniApps.
 * Key format: "miniAppId:commandName"
 */
const commandHandlers = new Map<string, (data: unknown) => Promise<unknown>>();

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
 * Handle an incoming command:invoke message from a frontend client.
 */
export async function handleCommand(
  miniAppId: string,
  command: string,
  data: unknown,
): Promise<unknown> {
  const key = `${miniAppId}:${command}`;
  const handler = commandHandlers.get(key);
  if (!handler) {
    throw new Error(`No handler registered for command: ${command} (miniApp: ${miniAppId})`);
  }
  return handler(data);
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

/**
 * Creates a MessagingHook scoped to a specific MiniApp.
 */
export function createMessagingHook(miniAppId: string): MessagingHook {
  return {
    onCommand<TReq, TRes>(
      command: string,
      handler: (data: TReq) => Promise<TRes>,
    ): Disposable {
      const key = `${miniAppId}:${command}`;
      commandHandlers.set(key, handler as (data: unknown) => Promise<unknown>);
      return {
        dispose() {
          commandHandlers.delete(key);
        },
      };
    },

    emit(event: string, data: unknown): void {
      broadcastEvent(miniAppId, event, data);
    },
  };
}
