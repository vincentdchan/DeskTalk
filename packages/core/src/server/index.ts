import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type pino from 'pino';
import { addClient, broadcastRaw } from '../services/messaging';
import { registry } from '../services/miniapp-registry';
import { processManager } from '../services/backend-process-manager';
import { PiSessionService } from '../services/ai/pi-session-service';
import { getStoredPreference } from '../services/preferences';
import { loadMergedLocaleMessages } from '../services/i18n';
import { getWorkspacePaths } from '../services/workspace';
import { VoiceSession } from '../services/voice/voice-session';
import { AzureOpenAIWhisperAdapter } from '../services/voice/azure-openai-whisper-adapter';
import { OpenAIWhisperAdapter } from '../services/voice/openai-whisper-adapter';
import type { SttAdapter } from '../services/voice/stt-adapter';
import {
  WindowManagerService,
  type SerializableActionDefinition,
} from '../services/window-manager';
import { UserService, type User } from '../services/user-service';
import { MemoryService } from '../services/memory-service';

const COOKIE_NAME = 'desktalk_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const corePackageRoot = join(__dirname, '..', '..');

export interface ServerOptions {
  dev: boolean;
  host: string;
  port: number;
  logger: pino.Logger;
}

export async function createServer(options: ServerOptions) {
  const app = Fastify({ loggerInstance: options.logger.child({ scope: 'http' }) });
  const log = options.logger;
  const workspacePaths = getWorkspacePaths();

  // ─── User / auth service ────────────────────────────────────────────────
  const userService = new UserService(join(workspacePaths.data, 'storage', 'users.json'));

  // ─── Memory service ────────────────────────────────────────────────────
  const memoryService = new MemoryService(join(workspacePaths.data, 'storage', 'memories.json'));

  // In dev mode, inject a default admin user and create a session
  let devSessionId: string | undefined;
  if (options.dev) {
    const { session } = await userService.ensureDevAdmin();
    devSessionId = session.id;
    log.info({ sessionId: session.id }, 'dev mode: injected admin user with auto-login session');
  }

  // Register cookie support
  await app.register(fastifyCookie);

  // Register rate-limiting (applied per-route below)
  await app.register(fastifyRateLimit, { global: false });

  // ─── Augment Fastify request with user ──────────────────────────────────
  app.decorateRequest('user', null);

  // ─── Auth middleware ────────────────────────────────────────────────────
  // Public routes that don't require authentication
  const publicRoutes = new Set(['/api/auth/login', '/api/auth/me', '/api/auth/status']);

  app.addHook('preHandler', async (request, reply) => {
    // Skip auth for non-API routes (static assets, SPA fallback)
    if (!request.url.startsWith('/api/') && !request.url.startsWith('/ws')) {
      return;
    }
    // Skip auth for public routes
    if (publicRoutes.has(request.url.split('?')[0])) {
      return;
    }
    // Skip auth entirely when in setup mode (no users yet)
    if (userService.isSetupMode()) {
      return;
    }

    const sessionId = request.cookies[COOKIE_NAME];
    if (!sessionId) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const user = userService.validateSession(sessionId);
    if (!user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    (request as unknown as Record<string, unknown>).user = user;
  });

  const windowManager = new WindowManagerService(
    join(workspacePaths.data, 'storage', 'window-state.json'),
  );
  windowManager.activatePersistedMiniApps(async (miniAppId) => {
    await registry.activate(miniAppId);
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
  );

  // Register WebSocket support
  await app.register(fastifyWebsocket);

  if (!options.dev) {
    const frontendDir = join(__dirname, '..', 'frontend');
    await app.register(fastifyStatic, {
      root: frontendDir,
      prefix: '/',
      wildcard: false,
    });
  }

  // WebSocket endpoint for MiniApp messaging and AI events
  app.get('/ws', { websocket: true }, (socket, _req) => {
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

    // Send AI history on connect
    sendAiEvent({
      type: 'history_sync',
      sessionId: piSessionService.getSessionId(),
      messages: piSessionService.getHistory(),
    });

    // Send persisted window state so the frontend can restore on connect/refresh
    const persisted = windowManager.getPersistedState();
    socket.send(
      JSON.stringify({
        type: 'window:state',
        windows: persisted.windows,
        nextZIndex: persisted.nextZIndex,
        windowIdCounter: persisted.windowIdCounter,
      }),
    );

    socket.on('message', async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'command:invoke') {
          const { miniAppId, command, requestId, data } = msg;
          try {
            const result = await processManager.sendCommand(miniAppId, command, data);
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
              nextZIndex: typeof msg.nextZIndex === 'number' ? msg.nextZIndex : 1,
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
          },
          voiceLog.child({ sessionId }),
        );
        voiceSessions.set(sessionId, session);

        voiceLog.info({ sessionId, format, sampleRate, channels }, 'voice session started');

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

  app.get<{ Params: { id: string } }>('/api/miniapps/:id/icon', async (req, reply) => {
    const entry = registry.getEntry(req.params.id);
    if (!entry?.iconFilePath) {
      reply.code(404);
      return { error: 'MiniApp icon not found' };
    }

    reply.type('image/png');
    return reply.send(createReadStream(entry.iconFilePath));
  });

  app.get('/api/preferences/public', async () => {
    return {
      theme: getStoredPreference('general.theme') === 'dark' ? 'dark' : 'light',
      accentColor: String(getStoredPreference('general.accentColor') ?? '#7c6ff7'),
    };
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

  // REST API: Activate a MiniApp
  app.post<{ Params: { id: string } }>('/api/miniapps/:id/activate', async (req) => {
    const { id } = req.params;
    await registry.activate(id);
    return { id, activated: true };
  });

  // REST API: Deactivate a MiniApp
  app.post<{ Params: { id: string } }>('/api/miniapps/:id/deactivate', async (req) => {
    const { id } = req.params;
    await registry.deactivate(id);
    return { id, deactivated: true };
  });

  // ─── Auth API ─────────────────────────────────────────────────────────────

  /** Returns auth status + dev session info so the frontend can bootstrap. */
  app.get('/api/auth/status', async () => {
    return {
      setupMode: userService.isSetupMode(),
      devMode: options.dev,
      devSessionId: options.dev ? devSessionId : undefined,
    };
  });

  /** Return current user info (or 401). */
  app.get('/api/auth/me', async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    if (!sessionId) {
      reply.code(401);
      return { error: 'Unauthorized' };
    }
    const user = userService.validateSession(sessionId);
    if (!user) {
      reply.code(401);
      return { error: 'Unauthorized' };
    }
    return user;
  });

  /** Authenticate with username + password. */
  app.post<{ Body: { username: string; password: string } }>('/api/auth/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  }, async (req, reply) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      reply.code(400);
      return { error: 'Username and password are required' };
    }

    try {
      const { user, session } = await userService.login(username, password);
      reply.setCookie(COOKIE_NAME, session.id, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE,
      });
      return user;
    } catch {
      reply.code(401);
      return { error: 'Invalid username or password' };
    }
  });

  /** Destroy the current session. */
  app.post('/api/auth/logout', async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    if (sessionId) {
      userService.logout(sessionId);
    }
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  /** Mark current user as onboarded. */
  app.post('/api/auth/onboard', async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    const user = sessionId ? userService.validateSession(sessionId) : null;
    if (!user) {
      reply.code(401);
      return { error: 'Unauthorized' };
    }
    userService.markOnboarded(user.id);
    return { ...user, onboarded: true };
  });

  // ─── User management API (admin only) ─────────────────────────────────────

  /** Extract the authenticated user from the request (set by auth middleware). */
  function getAuthUser(req: unknown): User | null {
    return ((req as Record<string, unknown>).user as User) ?? null;
  }

  function requireAdmin(req: unknown): User {
    const user = getAuthUser(req);
    if (!user || user.role !== 'admin') {
      throw { statusCode: 403, message: 'Forbidden' };
    }
    return user;
  }

  app.get('/api/users', async (req, reply) => {
    try {
      requireAdmin(req);
    } catch {
      reply.code(403);
      return { error: 'Forbidden' };
    }
    return userService.listUsers();
  });

  app.post<{ Body: { username: string; password: string } }>('/api/users', async (req, reply) => {
    try {
      requireAdmin(req);
    } catch {
      reply.code(403);
      return { error: 'Forbidden' };
    }

    const { username, password } = req.body ?? {};
    if (!username || !password) {
      reply.code(400);
      return { error: 'Username and password are required' };
    }
    if (username.length < 3 || username.length > 32) {
      reply.code(400);
      return { error: 'Username must be 3-32 characters' };
    }
    if (password.length < 8) {
      reply.code(400);
      return { error: 'Password must be at least 8 characters' };
    }

    try {
      const user = await userService.createUser(username, password);
      reply.code(201);
      return user;
    } catch (err) {
      reply.code(409);
      return { error: (err as Error).message };
    }
  });

  app.delete<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    try {
      requireAdmin(req);
    } catch {
      reply.code(403);
      return { error: 'Forbidden' };
    }

    try {
      await userService.deleteUser(Number(req.params.id));
      return { ok: true };
    } catch (err) {
      reply.code(404);
      return { error: (err as Error).message };
    }
  });

  app.patch<{ Params: { id: string }; Body: { password?: string; onboarded?: boolean } }>(
    '/api/users/:id',
    async (req, reply) => {
      try {
        requireAdmin(req);
      } catch {
        reply.code(403);
        return { error: 'Forbidden' };
      }

      try {
        const user = await userService.updateUser(Number(req.params.id), req.body ?? {});
        return user;
      } catch (err) {
        reply.code(404);
        return { error: (err as Error).message };
      }
    },
  );

  // ─── Memory API ─────────────────────────────────────────────────────────

  /** List memories for the current user (optionally filtered by category). */
  app.get<{ Querystring: { category?: string; q?: string } }>(
    '/api/memories',
    async (req, reply) => {
      const user = getAuthUser(req);
      if (!user) {
        reply.code(401);
        return { error: 'Unauthorized' };
      }

      const { category, q } = req.query;
      if (q) {
        return memoryService.searchMemories(user.id, q);
      }
      return memoryService.listMemories(user.id, category ? { category } : undefined);
    },
  );

  /** Create a new memory for the current user. */
  app.post<{ Body: { content: string; category?: string; source?: 'user' | 'ai' | 'system' } }>(
    '/api/memories',
    async (req, reply) => {
      const user = getAuthUser(req);
      if (!user) {
        reply.code(401);
        return { error: 'Unauthorized' };
      }

      const { content, category, source } = req.body ?? {};
      if (!content) {
        reply.code(400);
        return { error: 'Content is required' };
      }

      const memory = memoryService.createMemory(user.id, content, { category, source });
      reply.code(201);
      return memory;
    },
  );

  /** Get a single memory by ID. */
  app.get<{ Params: { id: string } }>('/api/memories/:id', async (req, reply) => {
    const user = getAuthUser(req);
    if (!user) {
      reply.code(401);
      return { error: 'Unauthorized' };
    }

    const memory = memoryService.getMemory(Number(req.params.id));
    if (!memory || memory.userId !== user.id) {
      reply.code(404);
      return { error: 'Memory not found' };
    }
    return memory;
  });

  /** Update a memory. */
  app.patch<{ Params: { id: string }; Body: { content?: string; category?: string } }>(
    '/api/memories/:id',
    async (req, reply) => {
      const user = getAuthUser(req);
      if (!user) {
        reply.code(401);
        return { error: 'Unauthorized' };
      }

      const memory = memoryService.getMemory(Number(req.params.id));
      if (!memory || memory.userId !== user.id) {
        reply.code(404);
        return { error: 'Memory not found' };
      }

      try {
        return memoryService.updateMemory(memory.id, req.body ?? {});
      } catch (err) {
        reply.code(404);
        return { error: (err as Error).message };
      }
    },
  );

  /** Delete a memory. */
  app.delete<{ Params: { id: string } }>('/api/memories/:id', async (req, reply) => {
    const user = getAuthUser(req);
    if (!user) {
      reply.code(401);
      return { error: 'Unauthorized' };
    }

    const memory = memoryService.getMemory(Number(req.params.id));
    if (!memory || memory.userId !== user.id) {
      reply.code(404);
      return { error: 'Memory not found' };
    }

    try {
      memoryService.deleteMemory(memory.id);
      return { ok: true };
    } catch (err) {
      reply.code(404);
      return { error: (err as Error).message };
    }
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
