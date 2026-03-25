import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import type { PiSessionService } from '../services/ai/pi-session-service';
import { loadMergedLocaleMessages } from '../services/i18n';
import {
  LIVEAPP_ICON_CACHE_CONTROL,
  LIVEAPP_ICON_SIZES,
  parseLiveAppIconSize,
} from '../services/liveapp-icon';
import { listLiveApps } from '../services/liveapps';
import {
  MINIAPP_ICON_CACHE_CONTROL,
  MINIAPP_ICON_SIZES,
  parseMiniAppIconSize,
} from '../services/miniapp-icon';
import { registry } from '../services/miniapp-registry';
import { getStoredPreference, getStoredPreferenceForUser } from '../services/preferences';
import {
  DEFAULT_THEME_PREFERENCES,
  generateThemeCSS,
  HTML_BASE_STYLESHEET,
} from '@desktalk/ui/theme-css';
import { getUserHomeDir } from '../services/workspace';
import { validateSession } from '../services/user-db';
import { COOKIE_NAME } from './auth-routes';

export interface ApiRoutesOptions {
  corePackageRoot: string;
  piSessionService: PiSessionService;
}

export async function apiRoutes(app: FastifyInstance, options: ApiRoutesOptions): Promise<void> {
  const require = createRequire(import.meta.url);
  const uiDistDir = join(dirname(require.resolve('@desktalk/ui/package.json')), 'dist');
  const uiBundleCache = new Map<string, { body: Buffer; etag: string }>();
  const themeCssCache = new Map<string, { body: string; etag: string }>();

  async function getUiBundle(
    fileName: string,
    cacheKey: string,
  ): Promise<{ body: Buffer; etag: string }> {
    const cached = uiBundleCache.get(cacheKey);
    if (cached) return cached;

    const body = await readFile(join(uiDistDir, fileName));
    const etag = `"${cacheKey}-${body.length.toString(36)}"`;
    const next = { body, etag };
    uiBundleCache.set(cacheKey, next);
    return next;
  }

  app.get('/api/miniapps', async () => {
    return registry.getManifests();
  });

  app.get('/api/liveapps', async (req) => {
    const username = req.user!.username;
    return listLiveApps(getUserHomeDir(username));
  });

  app.get<{ Params: { id: string }; Querystring: { size?: string } }>(
    '/api/liveapps/:id/icon',
    async (req, reply) => {
      const username = req.user!.username;
      const iconFilePath = join(
        getUserHomeDir(username),
        '.data',
        'liveapps',
        req.params.id,
        'icon.png',
      );

      try {
        await readFile(iconFilePath);
      } catch {
        reply.code(404);
        return { error: 'LiveApp icon not found' };
      }

      const size = parseLiveAppIconSize(req.query.size);
      if (req.query.size !== undefined && size === undefined) {
        reply.code(400);
        return {
          error: `Invalid icon size. Supported sizes: ${LIVEAPP_ICON_SIZES.join(', ')}`,
        };
      }

      reply.header('Cache-Control', LIVEAPP_ICON_CACHE_CONTROL);
      reply.type('image/png');

      if (size === undefined) {
        return reply.send(createReadStream(iconFilePath));
      }

      const image = await sharp(iconFilePath)
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

  app.get<{ Params: { file: string } }>('/api/ui/:file(^[^/]+\\.js$)', async (req, reply) => {
    const fileName = req.params.file;
    if (
      !fileName ||
      fileName.includes('/') ||
      fileName.includes('\\') ||
      fileName.endsWith('.map')
    ) {
      reply.code(404);
      return { error: 'Not found' };
    }

    let bundle: { body: Buffer; etag: string };
    try {
      bundle = await getUiBundle(fileName, fileName);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reply.code(404);
        return { error: 'Not found' };
      }

      throw error;
    }

    const { body, etag } = bundle;
    reply.header('Content-Type', 'application/javascript; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=86400, immutable');
    reply.header('ETag', etag);
    return reply.send(body);
  });

  app.get<{ Querystring: { accent?: string; theme?: string } }>(
    '/api/ui/desktalk-theme.css',
    async (req, reply) => {
      const accent = req.query.accent ?? DEFAULT_THEME_PREFERENCES.accentColor;
      const theme = req.query.theme === 'light' ? 'light' : DEFAULT_THEME_PREFERENCES.theme;
      const cacheKey = `${accent}|${theme}`;

      let cached = themeCssCache.get(cacheKey);
      if (!cached) {
        const themeCSS = generateThemeCSS({ accentColor: accent, theme });
        const body = `${themeCSS}\n${HTML_BASE_STYLESHEET}`;
        const etag = `"theme-${Buffer.byteLength(body).toString(36)}"`;
        cached = { body, etag };
        themeCssCache.set(cacheKey, cached);
      }

      reply.header('Content-Type', 'text/css; charset=utf-8');
      reply.header('Cache-Control', 'public, max-age=86400, immutable');
      reply.header('ETag', cached.etag);
      return reply.send(cached.body);
    },
  );

  app.get('/api/preferences/public', async (req) => {
    const requestUser = req.user;
    const token = req.cookies[COOKIE_NAME];
    const user = requestUser ?? (token ? validateSession(token) : undefined);
    const getPreference = (key: string) =>
      user ? getStoredPreferenceForUser(user.username, key) : getStoredPreference(key);

    return {
      theme: getPreference('general.theme') === 'light' ? 'light' : DEFAULT_THEME_PREFERENCES.theme,
      accentColor: String(getPreference('general.accentColor') ?? '#7c6ff7'),
    };
  });

  app.get('/api/ai/providers', async () => {
    return options.piSessionService.getProviderOptions();
  });

  app.get<{ Querystring: { locale?: string } }>('/api/i18n/catalog', async (req) => {
    const locale = String(req.query.locale ?? getStoredPreference('general.language') ?? 'en');
    const packages = [
      { packageRoot: options.corePackageRoot, packageScope: 'core' },
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

  app.post<{ Params: { id: string }; Body: { args?: Record<string, unknown> } }>(
    '/api/miniapps/:id/activate',
    async (req) => {
      const { id } = req.params;
      const username = req.user!.username;
      const launchArgs = req.body?.args ? [req.body.args] : [];
      await registry.activate(id, username, { launchArgs });
      return { id, activated: true };
    },
  );

  app.post<{ Params: { id: string } }>('/api/miniapps/:id/deactivate', async (req) => {
    const { id } = req.params;
    const username = req.user!.username;
    await registry.deactivate(id, username);
    return { id, deactivated: true };
  });
}
