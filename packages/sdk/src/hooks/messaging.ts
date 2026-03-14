import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';

// ─── MiniApp ID Context ──────────────────────────────────────────────────────

/**
 * React context that provides the current MiniApp's ID to hooks.
 * The core shell wraps each MiniApp window with this provider.
 */
const MiniAppIdContext = createContext<string | null>(null);

/**
 * Provider component that injects the miniAppId into context.
 * Used by the core shell — MiniApps should NOT use this directly.
 */
export function MiniAppIdProvider({
  miniAppId,
  children,
}: {
  miniAppId: string;
  children: React.ReactNode;
}) {
  return React.createElement(MiniAppIdContext.Provider, { value: miniAppId }, children);
}

/**
 * Hook to read the current MiniApp's ID from context.
 */
export function useMiniAppId(): string {
  const id = useContext(MiniAppIdContext);
  if (!id) {
    throw new Error('useMiniAppId must be used inside a <MiniAppIdProvider>');
  }
  return id;
}

// ─── WebSocket / Messaging ───────────────────────────────────────────────────

/**
 * Internal context for the WebSocket connection.
 * Set by the core shell at startup.
 */
let wsInstance: WebSocket | null = null;
const pendingRequests: Map<
  string,
  { resolve: (data: unknown) => void; reject: (err: Error) => void }
> = new Map();
const eventListeners: Map<string, Set<(data: unknown) => void>> = new Map();

let requestIdCounter = 0;

function getNextRequestId(): string {
  return `req-${++requestIdCounter}-${Date.now()}`;
}

/**
 * Initialize the messaging system with a WebSocket connection.
 * Called by the core shell, not by MiniApps directly.
 */
export function initMessaging(ws: WebSocket): void {
  wsInstance = ws;

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      if (msg.type === 'command:response') {
        const pending = pendingRequests.get(msg.requestId);
        if (pending) {
          pendingRequests.delete(msg.requestId);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.data);
          }
        }
      } else if (msg.type === 'event') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('desktalk:event', {
              detail: {
                miniAppId: typeof msg.miniAppId === 'string' ? msg.miniAppId : null,
                event: typeof msg.event === 'string' ? msg.event : null,
                data: msg.data,
              },
            }),
          );
        }

        const listeners = eventListeners.get(msg.event);
        if (listeners) {
          for (const listener of listeners) {
            listener(msg.data);
          }
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });
}

/**
 * React hook to invoke a backend command registered via ctx.messaging.onCommand().
 *
 * Must be used inside a <MiniAppIdProvider> so the command is routed correctly.
 *
 * Usage:
 * ```ts
 * const listNotes = useCommand<void, Note[]>('notes.list');
 * const notes = await listNotes();
 * ```
 */
export function useCommand<TReq, TRes>(command: string): (data?: TReq) => Promise<TRes> {
  const miniAppId = useMiniAppId();

  return useCallback(
    (data?: TReq): Promise<TRes> => {
      return new Promise((resolve, reject) => {
        if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket not connected'));
          return;
        }

        const requestId = getNextRequestId();
        pendingRequests.set(requestId, {
          resolve: resolve as (data: unknown) => void,
          reject,
        });

        wsInstance.send(
          JSON.stringify({
            type: 'command:invoke',
            miniAppId,
            command,
            requestId,
            data: data ?? null,
          }),
        );
      });
    },
    [miniAppId, command],
  );
}

/**
 * React hook to listen for backend events emitted via ctx.messaging.emit().
 *
 * Usage:
 * ```ts
 * useEvent<Note>('note:updated', (note) => {
 *   console.log('Note updated:', note);
 * });
 * ```
 */
export function useEvent<T>(event: string, handler: (data: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const wrappedHandler = (data: unknown) => {
      handlerRef.current(data as T);
    };

    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event)!.add(wrappedHandler);

    return () => {
      eventListeners.get(event)?.delete(wrappedHandler);
      if (eventListeners.get(event)?.size === 0) {
        eventListeners.delete(event);
      }
    };
  }, [event]);
}
