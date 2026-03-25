import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pino from 'pino';
import { broadcastRaw } from '../services/messaging';
import { registry } from '../services/miniapp-registry';
import { PiSessionService } from '../services/ai/pi-session-service';
import { getStoredPreference } from '../services/preferences';
import { getWorkspacePaths, getUserHomeDir } from '../services/workspace';
import { WindowManagerService } from '../services/window-manager';
import { validateSession, type PublicUser } from '../services/user-db';
import { COOKIE_NAME, authRoutes } from './auth-routes';
import { adminRoutes } from './admin-routes';
import { wsRoutes } from './ws-routes';
import { voiceRoutes } from './voice-routes';
import { apiRoutes } from './api-routes';
import { dtfsRoutes } from './dtfs-routes';
import { monacoRoutes } from './monaco-routes';

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

  windowManager.activatePersistedMiniApps(async (miniAppId, launchArgs) => {
    // During startup restore, use the admin user as the default owner.
    // In practice, persisted windows will be re-associated when the user logs in.
    await registry.activate(miniAppId, 'admin', { launchArgs });
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
    log.child({ scope: 'ai-session' }),
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
    '/api/ui/desktalk-theme.css',
  ]);

  app.addHook('onRequest', async (req, reply) => {
    // Skip auth for public routes
    if (PUBLIC_ROUTES.has(req.url)) return;

    if (req.url.startsWith('/api/ui/') && req.url.endsWith('.js')) return;

    if (req.url.startsWith('/api/ui/fonts/')) return;

    if (req.url.startsWith('/api/miniapps/text-edit/monaco/')) return;

    // Skip auth for static file requests (non-API, non-WS, non-dtfs)
    if (!req.url.startsWith('/api/') && !req.url.startsWith('/ws') && !req.url.startsWith('/@dtfs'))
      return;

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
  await app.register(wsRoutes, {
    logger: log,
    piSessionService,
    windowManager,
    pendingWindowActionRequests,
    pendingAiCommandRequests,
    setCurrentWsUsername: (username) => {
      currentWsUsername = username;
    },
  });
  await app.register(voiceRoutes, { logger: log });
  await app.register(apiRoutes, {
    corePackageRoot,
    piSessionService,
  });
  await app.register(monacoRoutes);
  await app.register(dtfsRoutes);

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
