import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import type pino from 'pino';
import { addClient } from '../services/messaging';
import { registry } from '../services/miniapp-registry';
import { processManager } from '../services/backend-process-manager';
import { setPreferenceUser } from '../services/preferences';
import { getUserHomeDir, ensureUserHome } from '../services/workspace';
import type { PiSessionService } from '../services/ai/pi-session-service';
import {
  type SerializableActionDefinition,
  type WindowManagerService,
} from '../services/window-manager';

type PendingWindowActionRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type PendingAiCommandRequest = {
  resolve: (value: { ok: boolean; windowId?: string; error?: string }) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export interface WsRoutesOptions {
  logger: pino.Logger;
  piSessionService: PiSessionService;
  windowManager: WindowManagerService;
  pendingWindowActionRequests: Map<string, PendingWindowActionRequest>;
  pendingAiCommandRequests: Map<string, PendingAiCommandRequest>;
  setCurrentWsUsername: (username: string | null) => void;
}

export async function wsRoutes(app: FastifyInstance, options: WsRoutesOptions): Promise<void> {
  const {
    logger,
    piSessionService,
    windowManager,
    pendingWindowActionRequests,
    pendingAiCommandRequests,
    setCurrentWsUsername,
  } = options;

  app.get('/ws', { websocket: true }, (socket, req) => {
    const user = req.user;
    if (!user) {
      socket.close(4001, 'Authentication required');
      return;
    }

    const username = user.username;
    setCurrentWsUsername(username);

    addClient(socket);
    let activeAiRequestId: string | null = null;
    const cancelledAiRequestIds = new Set<string>();

    function sendAiEvent(event: Record<string, unknown>): void {
      socket.send(
        JSON.stringify({
          type: 'ai:event',
          event,
        }),
      );
    }

    void (async () => {
      try {
        ensureUserHome(username);
        windowManager.switchUser(join(getUserHomeDir(username), '.storage', 'window-state.json'));
        setPreferenceUser(username);

        await windowManager.activatePersistedMiniApps(async (miniAppId, launchArgs) => {
          await registry.activate(miniAppId, username, { launchArgs });
        });

        sendAiEvent({
          type: 'history_sync',
          sessionId: piSessionService.getSessionId(),
          messages: piSessionService.getHistory(),
        });
        sendAiEvent({
          type: 'sessions_sync',
          sessionId: piSessionService.getSessionId(),
          sessions: await piSessionService.listSessions(),
        });

        const persisted = windowManager.getPersistedState();
        socket.send(
          JSON.stringify({
            type: 'window:state',
            version: persisted.version,
            windows: persisted.windows,
            tree: persisted.tree,
            focusedWindowId: persisted.focusedWindowId,
            fullscreenWindowId: persisted.fullscreenWindowId,
            windowIdCounter: persisted.windowIdCounter,
            nextSplitDirection: persisted.nextSplitDirection,
          }),
        );
      } catch (error) {
        logger.error(
          { username, err: error instanceof Error ? error.message : String(error) },
          'failed to restore persisted miniapps for websocket session',
        );
        socket.close(1011, 'Failed to restore desktop state');
      }
    })();

    socket.on('message', async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'command:invoke') {
          const { miniAppId, command, requestId, data } = msg;
          const processKey = `${miniAppId}:${username}`;
          try {
            const result = await processManager.sendCommand(processKey, command, data);
            socket.send(
              JSON.stringify({
                type: 'command:response',
                requestId,
                data: result,
              }),
            );
          } catch (err) {
            socket.send(
              JSON.stringify({
                type: 'command:response',
                requestId,
                error: (err as Error).message,
              }),
            );
          }
        } else if (msg.type === 'window:sync') {
          if (Array.isArray(msg.windows)) {
            windowManager.syncState({
              version: 2,
              windows: msg.windows,
              tree: msg.tree ?? null,
              focusedWindowId: typeof msg.focusedWindowId === 'string' ? msg.focusedWindowId : null,
              fullscreenWindowId:
                typeof msg.fullscreenWindowId === 'string' ? msg.fullscreenWindowId : null,
              windowIdCounter: typeof msg.windowIdCounter === 'number' ? msg.windowIdCounter : 0,
              nextSplitDirection:
                msg.nextSplitDirection === 'horizontal' ||
                msg.nextSplitDirection === 'vertical' ||
                msg.nextSplitDirection === 'auto'
                  ? msg.nextSplitDirection
                  : 'auto',
            });
          }
        } else if (msg.type === 'window:actions_changed') {
          if (typeof msg.windowId === 'string' && Array.isArray(msg.actions)) {
            windowManager.setWindowActions(
              msg.windowId,
              msg.actions as SerializableActionDefinition[],
            );
          }
        } else if (msg.type === 'window:action_result') {
          if (typeof msg.requestId === 'string') {
            const pending = pendingWindowActionRequests.get(msg.requestId);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingWindowActionRequests.delete(msg.requestId);
              if (typeof msg.error === 'string' && msg.error.length > 0) {
                pending.reject(new Error(msg.error));
              } else {
                pending.resolve(msg.result);
              }
            }
          }
        } else if (msg.type === 'window:ai_command_result') {
          if (typeof msg.requestId === 'string') {
            const pending = pendingAiCommandRequests.get(msg.requestId);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingAiCommandRequests.delete(msg.requestId);
              pending.resolve({
                ok: msg.ok === true,
                windowId: typeof msg.windowId === 'string' ? msg.windowId : undefined,
                error: typeof msg.error === 'string' ? msg.error : undefined,
              });
            }
          }
        } else if (msg.type === 'ai:sessions:list') {
          sendAiEvent({
            type: 'sessions_sync',
            sessionId: piSessionService.getSessionId(),
            sessions: await piSessionService.listSessions(),
          });
        } else if (msg.type === 'ai:sessions:create') {
          if (activeAiRequestId) {
            sendAiEvent({
              type: 'error',
              message: 'Cannot create a new session while the AI is responding.',
            });
            return;
          }

          await piSessionService.createNewSession();
          sendAiEvent({
            type: 'history_sync',
            sessionId: piSessionService.getSessionId(),
            messages: piSessionService.getHistory(),
          });
          sendAiEvent({
            type: 'sessions_sync',
            sessionId: piSessionService.getSessionId(),
            sessions: await piSessionService.listSessions(),
          });
        } else if (msg.type === 'ai:sessions:switch') {
          const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId : '';
          if (activeAiRequestId) {
            sendAiEvent({
              type: 'error',
              message: 'Wait for the current AI response to finish before switching sessions.',
            });
            return;
          }

          if (!sessionId) {
            sendAiEvent({
              type: 'error',
              message: 'A session ID is required to switch sessions.',
            });
            return;
          }

          const switched = await piSessionService.switchSession(sessionId);
          if (!switched) {
            sendAiEvent({
              type: 'error',
              message: 'The selected session could not be found.',
            });
            return;
          }

          sendAiEvent({
            type: 'history_sync',
            sessionId: piSessionService.getSessionId(),
            messages: piSessionService.getHistory(),
          });
          sendAiEvent({
            type: 'sessions_sync',
            sessionId: piSessionService.getSessionId(),
            sessions: await piSessionService.listSessions(),
          });
        } else if (msg.type === 'ai:sessions:rename') {
          const title = typeof msg.title === 'string' ? msg.title.trim() : '';
          if (activeAiRequestId) {
            sendAiEvent({
              type: 'error',
              message: 'Wait for the current AI response to finish before renaming sessions.',
            });
            return;
          }

          if (!title) {
            sendAiEvent({
              type: 'error',
              message: 'A session title is required.',
            });
            return;
          }

          await piSessionService.renameCurrentSession(title);
          sendAiEvent({
            type: 'sessions_sync',
            sessionId: piSessionService.getSessionId(),
            sessions: await piSessionService.listSessions(),
          });
        } else if (msg.type === 'ai:cancel') {
          const requestId = typeof msg.requestId === 'string' ? msg.requestId : '';

          if (!activeAiRequestId) {
            sendAiEvent({
              type: 'error',
              requestId,
              message: 'No AI request is currently running.',
            });
            return;
          }

          if (!requestId || requestId !== activeAiRequestId) {
            sendAiEvent({
              type: 'error',
              requestId,
              message: 'Only the active AI request can be cancelled.',
            });
            return;
          }

          if (cancelledAiRequestIds.has(requestId)) {
            return;
          }

          cancelledAiRequestIds.add(requestId);

          try {
            await piSessionService.abort();
          } catch (err) {
            cancelledAiRequestIds.delete(requestId);
            sendAiEvent({
              type: 'error',
              requestId,
              message: (err as Error).message,
            });
          }
        } else if (msg.type === 'ai:answer') {
          const questionId = typeof msg.questionId === 'string' ? msg.questionId : '';
          const answer = typeof msg.answer === 'string' ? msg.answer : '';

          if (!questionId) {
            sendAiEvent({
              type: 'error',
              message: 'A question ID is required to answer an agent question.',
            });
            return;
          }

          piSessionService.resolveQuestion(questionId, answer);
        } else if (msg.type === 'ai:prompt') {
          const requestId = typeof msg.requestId === 'string' ? msg.requestId : `ai-${Date.now()}`;
          const text = typeof msg.text === 'string' ? msg.text.trim() : '';
          const source = msg.source === 'voice' ? 'voice' : 'text';
          const provider = typeof msg.provider === 'string' ? msg.provider : undefined;

          if (!text) {
            sendAiEvent({
              type: 'error',
              requestId,
              message: 'Prompt cannot be empty.',
            });
            return;
          }

          if (activeAiRequestId) {
            sendAiEvent({
              type: 'error',
              requestId,
              message: 'Another AI request is already running. Wait for it to finish.',
            });
            return;
          }

          activeAiRequestId = requestId;

          try {
            await piSessionService.prompt(
              {
                text,
                source,
                provider,
              },
              {
                onEvent: (event) =>
                  sendAiEvent({
                    requestId,
                    ...event,
                  }),
              },
            );

            if (cancelledAiRequestIds.has(requestId)) {
              sendAiEvent({
                type: 'message_end',
                requestId,
                cancelled: true,
              });
              return;
            }

            sendAiEvent({
              type: 'history_sync',
              sessionId: piSessionService.getSessionId(),
              messages: piSessionService.getHistory(),
            });
            sendAiEvent({
              type: 'sessions_sync',
              sessionId: piSessionService.getSessionId(),
              sessions: await piSessionService.listSessions(),
            });
          } catch (err) {
            if (cancelledAiRequestIds.has(requestId)) {
              sendAiEvent({
                type: 'message_end',
                requestId,
                cancelled: true,
              });
              return;
            }

            sendAiEvent({
              type: 'error',
              requestId,
              message: (err as Error).message,
            });
          } finally {
            cancelledAiRequestIds.delete(requestId);
            if (activeAiRequestId === requestId) {
              activeAiRequestId = null;
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });
}
