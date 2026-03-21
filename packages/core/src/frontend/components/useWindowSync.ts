import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { ActionDefinition, ActionHandler } from '@desktalk/sdk';
import {
  reportWindowActionResult,
  setWindowManagerSocket,
  useWindowManager,
} from '../stores/window-manager';
import type { WindowSyncPayload } from '../stores/window-manager';
import { httpClient } from '../http-client';

export function useWindowSync(socket: WebSocket | null): {
  actionHandlersRef: React.MutableRefObject<Map<string, Map<string, ActionHandler>>>;
  buildClientActions: (
    windowId: string,
    actions: Array<Pick<ActionDefinition, 'name' | 'description' | 'params'>>,
  ) => ActionDefinition[];
} {
  const actionHandlersRef = useRef<Map<string, Map<string, ActionHandler>>>(new Map());

  const buildClientActions = useCallback(
    (
      windowId: string,
      actions: Array<Pick<ActionDefinition, 'name' | 'description' | 'params'>>,
    ): ActionDefinition[] => {
      const handlerMap =
        actionHandlersRef.current.get(windowId) ?? new Map<string, ActionHandler>();
      return actions
        .map((action) => {
          const handler = handlerMap.get(action.name);
          if (!handler) {
            return null;
          }
          return {
            ...action,
            handler,
          } satisfies ActionDefinition;
        })
        .filter((action): action is ActionDefinition => action !== null);
    },
    [],
  );

  useEffect(() => {
    setWindowManagerSocket(socket);
    return () => {
      setWindowManagerSocket(null);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleAiCommand = (
      action: string,
      windowId?: string,
      miniAppId?: string,
      title?: string,
      requestId?: string,
      args?: Record<string, unknown>,
    ): void => {
      const store = useWindowManager.getState();
      let resultWindowId: string | undefined;

      try {
        switch (action) {
          case 'open': {
            if (!miniAppId || !title) {
              break;
            }
            void httpClient.post(`/api/miniapps/${encodeURIComponent(miniAppId)}/activate`, {
              args,
            });
            resultWindowId = store.openWindow(miniAppId, title, args);
            break;
          }
          case 'close':
            if (windowId) {
              store.closeWindow(windowId);
            }
            break;
          case 'focus':
            if (windowId) {
              store.focusWindow(windowId);
            }
            break;
          case 'maximize':
            if (windowId) {
              store.maximizeWindow(windowId);
            }
            break;
          default:
            console.warn(`[shell] Unknown AI window command: ${action}`);
        }

        if (requestId) {
          const ws = socket;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'window:ai_command_result',
                requestId,
                ok: true,
                action,
                windowId: resultWindowId ?? windowId,
              }),
            );
          }
        }
      } catch (err) {
        if (requestId) {
          const ws = socket;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'window:ai_command_result',
                requestId,
                ok: false,
                error: (err as Error).message,
              }),
            );
          }
        }
      }
    };

    const handleWindowMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data as string) as Record<string, unknown>;

        if (message.type === 'window:state') {
          const payload = message as unknown as {
            type: string;
          } & WindowSyncPayload;
          useWindowManager.getState().restoreFromBackend({
            version: 2,
            windows: payload.windows ?? [],
            tree: payload.tree ?? null,
            focusedWindowId:
              typeof payload.focusedWindowId === 'string' ? payload.focusedWindowId : null,
            fullscreenWindowId:
              typeof payload.fullscreenWindowId === 'string' ? payload.fullscreenWindowId : null,
            windowIdCounter:
              typeof payload.windowIdCounter === 'number' ? payload.windowIdCounter : 0,
            nextSplitDirection:
              payload.nextSplitDirection === 'horizontal' ||
              payload.nextSplitDirection === 'vertical' ||
              payload.nextSplitDirection === 'auto'
                ? payload.nextSplitDirection
                : 'auto',
          });
          return;
        }

        if (message.type === 'window:ai_command') {
          const { action, windowId, miniAppId, title, requestId, args } = message as {
            action: string;
            windowId?: string;
            miniAppId?: string;
            title?: string;
            requestId: string;
            args?: Record<string, unknown>;
          };
          handleAiCommand(action, windowId, miniAppId, title, requestId, args);
          return;
        }

        if (message.type === 'window:invoke_action') {
          const requestId = message.requestId as string | undefined;
          const windowId = message.windowId as string | undefined;
          const actionName = message.actionName as string | undefined;
          if (!requestId || !windowId || !actionName) {
            return;
          }

          const handler = actionHandlersRef.current.get(windowId)?.get(actionName);
          if (!handler) {
            reportWindowActionResult(
              requestId,
              undefined,
              `Action not available on window ${windowId}: ${actionName}`,
            );
            return;
          }

          void handler(message.params as Record<string, unknown> | undefined)
            .then((result) => {
              reportWindowActionResult(requestId, result);
            })
            .catch((error) => {
              reportWindowActionResult(requestId, undefined, (error as Error).message);
            });
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    socket.addEventListener('message', handleWindowMessage);
    return () => {
      socket.removeEventListener('message', handleWindowMessage);
    };
  }, [socket]);

  return { actionHandlersRef, buildClientActions };
}
