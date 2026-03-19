import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import sharp from 'sharp';
import type pino from 'pino';
import { addClient, broadcastRaw } from '../services/messaging';
import { registry } from '../services/miniapp-registry';
import { processManager } from '../services/backend-process-manager';
import { PiSessionService } from '../services/ai/pi-session-service';
import { getStoredPreference, setPreferenceUser } from '../services/preferences';
import { loadMergedLocaleMessages } from '../services/i18n';
import { getWorkspacePaths, getUserHomeDir, ensureUserHome } from '../services/workspace';
import { VoiceSession } from '../services/voice/voice-session';
import { AzureOpenAIWhisperAdapter } from '../services/voice/azure-openai-whisper-adapter';
import { OpenAIWhisperAdapter } from '../services/voice/openai-whisper-adapter';
import type { SttAdapter } from '../services/voice/stt-adapter';
import {
  WindowManagerService,
  type SerializableActionDefinition,
} from '../services/window-manager';
import {
  MINIAPP_ICON_CACHE_CONTROL,
  MINIAPP_ICON_SIZES,
  parseMiniAppIconSize,
} from '../services/miniapp-icon';
import { validateSession, type PublicUser } from '../services/user-db';
import { COOKIE_NAME, authRoutes } from './auth-routes';
import { adminRoutes } from './admin-routes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const corePackageRoot = join(__dirname, '..', '..');

export interface ServerOptions {
  dev: boolean;
  host: string;
  port: number;
  logger: pino.Logger;
}

// Augment Fastify request with the authenticated user
declare module 'fastify' {
  interface FastifyRequest {
    user?: PublicUser;
  }
}

export async function createServer(options: ServerOptions) {
  const app = Fastify({ loggerInstance: options.logger.child({ scope: 'http' }) });
  const log = options.logger;
  const workspacePaths = getWorkspacePaths();
  const windowManager = new WindowManagerService(
    join(getUserHomeDir('admin'), '.storage', 'window-state.json'),
  );

  // ─── Track the "current user" for the AI service ───────────────────────
  // The AI service is currently a singleton (not per-user). We track the
  // most recently authenticated WebSocket user so the AI can activate
  // MiniApps on their behalf.
  let currentWsUsername: string | null = null;

  windowManager.activatePersistedMiniApps(async (miniAppId) => {
    // During startup restore, use the admin user as the default owner.
    // In practice, persisted windows will be re-associated when the user logs in.
    await registry.activate(miniAppId, 'admin');
  });

  // ─── Pending requests for action invocations brokered to the frontend ───
  const pendingWindowActionRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  async function invokeWindowAction(
    windowId: string,
    actionName: string,
    actionParams?: Record<string, unknown>,
  ): Promise<unknown> {
    const requestId = `window-action-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingWindowActionRequests.delete(requestId);
        reject(new Error(`Timed out waiting for action result: ${actionName}`));
      }, 10000);

      pendingWindowActionRequests.set(requestId, { resolve, reject, timeout });
      broadcastRaw({
        type: 'window:invoke_action',
        requestId,
        windowId,
        actionName,
        params: actionParams ?? null,
      });
    });
  }

  // ─── Pending requests for AI window commands sent to the frontend ───
  const pendingAiCommandRequests = new Map<
    string,
    {
      resolve: (value: { ok: boolean; windowId?: string; error?: string }) => void;
      reject: (reason?: unknown) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  async function sendAiCommand(command: {
    action: string;
    windowId?: string;
    miniAppId?: string;
    title?: string;
    args?: Record<string, unknown>;
  }): Promise<{ ok: boolean; windowId?: string; error?: string }> {
    const requestId = `ai-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingAiCommandRequests.delete(requestId);
        reject(new Error(`Timed out waiting for AI command result: ${command.action}`));
      }, 10000);

      pendingAiCommandRequests.set(requestId, { resolve, reject, timeout });
      broadcastRaw({
        type: 'window:ai_command',
        requestId,
        ...command,
      });
    });
  }

  const piSessionService = await PiSessionService.create(
    workspacePaths,
    async (key) => getStoredPreference(key),
    windowManager,
    invokeWindowAction,
    sendAiCommand,
    () => currentWsUsername ?? 'admin',
  );

  // ─── Plugins ──────────────────────────────────────────────────────────────

  await app.register(fastifyCookie);
  await app.register(fastifyWebsocket);

  if (!options.dev) {
    const frontendDir = join(__dirname, '..', 'frontend');
    await app.register(fastifyStatic, {
      root: frontendDir,
      prefix: '/',
      wildcard: false,
    });
  }

  // ─── Auth middleware ──────────────────────────────────────────────────────
  // Validate session cookie on every request except public routes.

  const PUBLIC_ROUTES = new Set([
    '/api/auth/login',
    '/api/auth/me',
    '/api/setup/status',
    '/api/setup',
    '/api/preferences/public',
  ]);

  app.addHook('onRequest', async (req, reply) => {
    // Skip auth for public routes
    if (PUBLIC_ROUTES.has(req.url)) return;

    // Skip auth for static file requests (non-API, non-WS)
    if (!req.url.startsWith('/api/') && !req.url.startsWith('/ws')) return;

    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      reply.code(401);
      reply.send({ error: 'Authentication required.' });
      return;
    }

    const user = validateSession(token);
    if (!user) {
      reply.code(401);
      reply.send({ error: 'Session expired or invalid.' });
      return;
    }

    req.user = user;
  });

  // ─── Auth & Admin Routes ──────────────────────────────────────────────────

  await app.register(authRoutes);
  await app.register(adminRoutes, { prefix: '/api/admin' });

  // ─── WebSocket endpoint for MiniApp messaging and AI events ──────────────

  app.get('/ws', { websocket: true }, (socket, req) => {
    const user = req.user;
    if (!user) {
      socket.close(4001, 'Authentication required');
      return;
    }

    const username = user.username;
    currentWsUsername = username;

    addClient(socket);
    let activeAiRequestId: string | null = null;

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
        // Restore this user's backend processes before asking the frontend
        // to rebuild its persisted windows.
        ensureUserHome(username);
        windowManager.switchUser(join(getUserHomeDir(username), '.storage', 'window-state.json'));
        setPreferenceUser(username);

        await windowManager.activatePersistedMiniApps(async (miniAppId) => {
          await registry.activate(miniAppId, username);
        });

        // Send AI history on connect
        sendAiEvent({
          type: 'history_sync',
          sessionId: piSessionService.getSessionId(),
          messages: piSessionService.getHistory(),
        });

        // Send persisted window state only after MiniApp backends are ready.
        const persisted = windowManager.getPersistedState();
        socket.send(
          JSON.stringify({
            type: 'window:state',
            windows: persisted.windows,
            tree: persisted.tree,
            focusedWindowId: persisted.focusedWindowId,
            fullscreenWindowId: persisted.fullscreenWindowId,
            windowIdCounter: persisted.windowIdCounter,
          }),
        );
      } catch (error) {
        log.error(
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
          // Build the process key scoped to the authenticated user
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
          // Frontend syncs its full state — persist it
          if (Array.isArray(msg.windows)) {
            windowManager.syncState({
              windows: msg.windows,
              tree: msg.tree ?? null,
              focusedWindowId: typeof msg.focusedWindowId === 'string' ? msg.focusedWindowId : null,
              fullscreenWindowId:
                typeof msg.fullscreenWindowId === 'string' ? msg.fullscreenWindowId : null,
              windowIdCounter: typeof msg.windowIdCounter === 'number' ? msg.windowIdCounter : 0,
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

            sendAiEvent({
              type: 'history_sync',
              sessionId: piSessionService.getSessionId(),
              messages: piSessionService.getHistory(),
            });
          } catch (err) {
            sendAiEvent({
              type: 'error',
              requestId,
              message: (err as Error).message,
            });
          } finally {
            activeAiRequestId = null;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  // ─── Voice Streaming WebSocket ────────────────────────────────────────────

  /** Active voice sessions keyed by sessionId */
  const voiceSessions = new Map<string, VoiceSession>();

  /**
   * Read a preference value directly from persisted preference storage.
   */
  async function getPreference(key: string): Promise<string | number | boolean | undefined> {
    return getStoredPreference(key);
  }

  /**
   * Create an STT adapter from preference-stored voice configuration.
   * Returns null if no API key is configured.
   */
  async function createSttAdapter(): Promise<SttAdapter | null> {
    const apiKey = (await getPreference('voice.apiKey')) as string | undefined;
    if (!apiKey) return null;

    const provider = ((await getPreference('voice.provider')) as string) ?? 'openai-whisper';

    if (provider === 'openai-whisper') {
      const model = ((await getPreference('voice.model')) as string) ?? 'whisper-1';
      const baseUrl =
        ((await getPreference('voice.baseUrl')) as string) ?? 'https://api.openai.com/v1';
      return new OpenAIWhisperAdapter({ apiKey, model, baseUrl });
    }

    if (provider === 'azure-openai-whisper') {
      const endpoint = (await getPreference('voice.baseUrl')) as string | undefined;
      const deployment = (await getPreference('voice.azureDeployment')) as string | undefined;
      const apiVersion =
        ((await getPreference('voice.azureApiVersion')) as string | undefined) ?? '2024-06-01';

      if (!endpoint || !deployment) {
        return null;
      }

      return new AzureOpenAIWhisperAdapter({
        apiKey,
        endpoint,
        deployment,
        apiVersion,
      });
    }

    // Unknown provider
    return null;
  }

  /**
   * Read VAD-related preferences for voice session configuration.
   */
  async function getVadConfigFromPreferences(): Promise<{
    silenceTimeoutMs?: number;
    energyThreshold?: number;
  }> {
    const silenceTimeoutMs = (await getPreference('voice.silenceTimeoutMs')) as number | undefined;
    const energyThreshold = (await getPreference('voice.energyThreshold')) as number | undefined;
    return {
      ...(silenceTimeoutMs !== undefined ? { silenceTimeoutMs } : {}),
      ...(energyThreshold !== undefined ? { energyThreshold } : {}),
    };
  }

  const voiceLog = log.child({ scope: 'voice' });

  app.get('/ws/voice', { websocket: true }, (socket, _req) => {
    let session: VoiceSession | null = null;

    socket.on('message', async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      // Binary messages are audio chunks
      if (Buffer.isBuffer(raw) || raw instanceof ArrayBuffer) {
        // Check if this is actually a JSON control message (text frame)
        // WebSocket text frames arrive as Buffer too — try parsing as JSON first
        let isJson = false;
        try {
          const str = Buffer.isBuffer(raw)
            ? raw.toString('utf-8')
            : Buffer.from(raw).toString('utf-8');
          // Quick check: JSON messages start with '{'
          if (str.length > 0 && str[0] === '{') {
            const msg = JSON.parse(str);
            isJson = true;
            await handleVoiceControlMessage(msg);
          }
        } catch {
          // Not JSON — treat as binary audio
        }

        if (!isJson && session) {
          const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          await session.processAudioChunk(buf);
        }
        return;
      }

      // Array of buffers — concatenate
      if (Array.isArray(raw)) {
        if (session) {
          const buf = Buffer.concat(raw);
          await session.processAudioChunk(buf);
        }
      }
    });

    async function handleVoiceControlMessage(msg: { type: string; [key: string]: unknown }) {
      if (msg.type === 'session.start') {
        const sessionId = msg.sessionId as string;
        const sampleRate = (msg.sampleRate as number) ?? 16000;
        const channels = (msg.channels as number) ?? 1;
        const format = (msg.format as string) ?? 'pcm_s16le';

        // Language: prefer client-provided value, fall back to general.language preference
        const prefLanguage = (await getPreference('general.language')) as string | undefined;
        const language = (msg.language as string | undefined) ?? prefLanguage;

        const adapter = await createSttAdapter();
        if (!adapter) {
          socket.send(
            JSON.stringify({
              type: 'error',
              sessionId,
              code: 'NO_STT_PROVIDER',
              message:
                'No STT provider configured. Check Preferences -> Voice for provider credentials.',
            }),
          );
          return;
        }

        const vadConfig = await getVadConfigFromPreferences();

        session = new VoiceSession(
          sessionId,
          socket,
          adapter,
          {
            sampleRate,
            channels,
            format,
            vad: vadConfig,
            language,
          },
          voiceLog.child({ sessionId }),
        );
        voiceSessions.set(sessionId, session);

        voiceLog.info(
          { sessionId, format, sampleRate, channels, language },
          'voice session started',
        );

        socket.send(
          JSON.stringify({
            type: 'session.ready',
            sessionId,
          }),
        );
      } else if (msg.type === 'session.end') {
        const sessionId = msg.sessionId as string;
        if (session) {
          session.close();
          voiceSessions.delete(session.sessionId);
          session = null;
        }
        voiceLog.info({ sessionId }, 'voice session ended by client');
      }
    }

    socket.on('close', () => {
      if (session) {
        voiceLog.info({ sessionId: session.sessionId }, 'voice session closed (connection lost)');
        voiceSessions.delete(session.sessionId);
        session.close();
        session = null;
      }
    });

    socket.on('error', (err) => {
      voiceLog.error({ err: err.message }, 'voice WebSocket error');
    });
  });

  // REST API: Get all registered MiniApp manifests (for initial Dock load)
  app.get('/api/miniapps', async () => {
    return registry.getManifests();
  });

  app.get<{ Params: { id: string }; Querystring: { size?: string } }>(
    '/api/miniapps/:id/icon',
    async (req, reply) => {
      const entry = registry.getEntry(req.params.id);
      if (!entry?.iconFilePath) {
        reply.code(404);
        return { error: 'MiniApp icon not found' };
      }

      const size = parseMiniAppIconSize(req.query.size);
      if (req.query.size !== undefined && size === undefined) {
        reply.code(400);
        return {
          error: `Invalid icon size. Supported sizes: ${MINIAPP_ICON_SIZES.join(', ')}`,
        };
      }

      reply.header('Cache-Control', MINIAPP_ICON_CACHE_CONTROL);
      reply.type('image/png');

      if (size === undefined) {
        return reply.send(createReadStream(entry.iconFilePath));
      }

      const image = await sharp(entry.iconFilePath)
        .resize({
          width: size,
          height: size,
          fit: 'cover',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();

      return reply.send(image);
    },
  );

  app.get('/api/preferences/public', async () => {
    return {
      theme: getStoredPreference('general.theme') === 'dark' ? 'dark' : 'light',
      accentColor: String(getStoredPreference('general.accentColor') ?? '#7c6ff7'),
    };
  });

  app.get('/api/ai/providers', async () => {
    return piSessionService.getProviderOptions();
  });

  app.get<{ Querystring: { locale?: string } }>('/api/i18n/catalog', async (req) => {
    const locale = String(req.query.locale ?? getStoredPreference('general.language') ?? 'en');
    const packages = [
      { packageRoot: corePackageRoot, packageScope: 'core' },
      ...registry.getIds().flatMap((id) => {
        const entry = registry.getEntry(id);
        return entry
          ? [
              {
                packageRoot: entry.packageRoot,
                packageScope: entry.manifest.id,
              },
            ]
          : [];
      }),
    ];

    return {
      locale,
      messages: loadMergedLocaleMessages(packages, locale),
    };
  });

  // REST API: Activate a MiniApp (scoped to authenticated user)
  app.post<{ Params: { id: string } }>('/api/miniapps/:id/activate', async (req) => {
    const { id } = req.params;
    const username = req.user!.username;
    await registry.activate(id, username);
    return { id, activated: true };
  });

  // REST API: Deactivate a MiniApp (scoped to authenticated user)
  app.post<{ Params: { id: string } }>('/api/miniapps/:id/deactivate', async (req) => {
    const { id } = req.params;
    const username = req.user!.username;
    await registry.deactivate(id, username);
    return { id, deactivated: true };
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) {
      reply.code(404);
      return { error: 'Not found' };
    }

    if (options.dev) {
      reply.code(404);
      return { error: 'Frontend is served by the Vite dev server in development mode.' };
    }

    return reply.sendFile('index.html');
  });

  await app.listen({ host: options.host, port: options.port });
  return app;
}
