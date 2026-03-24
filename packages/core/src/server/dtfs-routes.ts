import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getUserHomeDir } from '../services/workspace';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function createThemeLinkTag(accentColor: string, mode: 'light' | 'dark'): string {
  const params = new URLSearchParams({ accent: accentColor, theme: mode });
  return `<link rel="stylesheet" href="/api/ui/desktalk-theme.css?${params.toString()}" data-dt-theme>`;
}

function createHtmlBridgeScript(streamId: string, bridgeToken: string): string {
  const serializedStreamId = serializeForInlineScript(streamId);
  const serializedBridgeToken = serializeForInlineScript(bridgeToken);

  return [
    '<script data-dt-bridge>',
    '(() => {',
    `  const streamId = ${serializedStreamId};`,
    `  const token = ${serializedBridgeToken};`,
    '  let requestCounter = 0;',
    '  const pending = new Map();',
    '  const REQUEST_TIMEOUT_MS = 30000;',
    '',
    '  function createError(message) {',
    '    return message instanceof Error ? message : new Error(String(message));',
    '  }',
    '',
    '  function normalizeExecArgs(programOrShell, argsOrOpts, maybeOpts) {',
    '    if (typeof programOrShell === "string" && /\\s/.test(programOrShell)',
    '        && (argsOrOpts === undefined || argsOrOpts === null',
    '            || (typeof argsOrOpts === "object" && !Array.isArray(argsOrOpts)))) {',
    '      return {',
    '        program: "sh",',
    '        args: ["-c", programOrShell],',
    '        options: (typeof argsOrOpts === "object" && argsOrOpts !== null) ? argsOrOpts : {},',
    '      };',
    '    }',
    '    return {',
    '      program: programOrShell,',
    '      args: Array.isArray(argsOrOpts) ? argsOrOpts : [],',
    '      options: (Array.isArray(argsOrOpts) ? maybeOpts : argsOrOpts) || {},',
    '    };',
    '  }',
    '',
    '  function request(kind, payload) {',
    '    return new Promise((resolve, reject) => {',
    '      const requestId = `dt-bridge-${Date.now()}-${++requestCounter}`;',
    '      const timeout = window.setTimeout(() => {',
    '        pending.delete(requestId);',
    "        reject(new Error('DeskTalk bridge request timed out.'));",
    '      }, REQUEST_TIMEOUT_MS);',
    '',
    '      pending.set(requestId, { resolve, reject, timeout });',
    '      window.parent.postMessage({',
    "        type: 'desktalk:bridge-request',",
    '        streamId,',
    '        token,',
    '        requestId,',
    '        kind,',
    '        payload,',
    "      }, '*');",
    '    });',
    '  }',
    '',
    '  function createCollectionStorage(name) {',
    '    return Object.freeze({',
    '      insert(params) {',
    "        return request('storage', { action: 'collection.insert', collection: name, params }).then(() => undefined);",
    '      },',
    '      update(id, params) {',
    "        return request('storage', { action: 'collection.update', collection: name, id, params }).then(() => undefined);",
    '      },',
    '      delete(id) {',
    "        return request('storage', { action: 'collection.delete', collection: name, id }).then(() => undefined);",
    '      },',
    '      findById(id) {',
    "        return request('storage', { action: 'collection.findById', collection: name, id }).then((result) => result.record);",
    '      },',
    '      find(filter, options) {',
    "        return request('storage', { action: 'collection.find', collection: name, filter, options }).then((result) => result.records);",
    '      },',
    '      findAll() {',
    "        return request('storage', { action: 'collection.findAll', collection: name }).then((result) => result.records);",
    '      },',
    '      count(filter) {',
    "        return request('storage', { action: 'collection.count', collection: name, filter }).then((result) => result.count);",
    '      },',
    '      compact() {',
    "        return request('storage', { action: 'collection.compact', collection: name }).then(() => undefined);",
    '      },',
    '    });',
    '  }',
    '',
    '  const storage = Object.freeze({',
    '    get(name) {',
    "      return request('storage', { action: 'kv.get', name }).then((result) => result.value);",
    '    },',
    '    set(name, value) {',
    "      return request('storage', { action: 'kv.set', name, value }).then(() => undefined);",
    '    },',
    '    delete(name) {',
    "      return request('storage', { action: 'kv.delete', name }).then((result) => result.deleted);",
    '    },',
    '    list() {',
    "      return request('storage', { action: 'kv.list' }).then((result) => result.names);",
    '    },',
    '    collection(name) {',
    '      return createCollectionStorage(name);',
    '    },',
    '  });',
    '',
    "  window.addEventListener('message', (event) => {",
    '    const message = event.data;',
    "    if (!message || message.type !== 'desktalk:bridge-response') return;",
    '    if (message.streamId !== streamId || message.token !== token) return;',
    '    const pendingRequest = pending.get(message.requestId);',
    '    if (!pendingRequest) return;',
    '    pending.delete(message.requestId);',
    '    window.clearTimeout(pendingRequest.timeout);',
    '    if (message.ok) {',
    '      pendingRequest.resolve(message.result);',
    '      return;',
    '    }',
    '    pendingRequest.reject(createError(message.error || "DeskTalk bridge request failed."));',
    '  });',
    '',
    '  window.DeskTalk = Object.freeze({',
    '    getState(selector) {',
    "      return request('getState', { selector });",
    '    },',
    '    exec(programOrShell, argsOrOpts, maybeOpts) {',
    '      const n = normalizeExecArgs(programOrShell, argsOrOpts, maybeOpts);',
    "      return request('exec', { program: n.program, args: n.args, options: n.options });",
    '    },',
    '    execute(programOrShell, argsOrOpts, maybeOpts) {',
    '      const n = normalizeExecArgs(programOrShell, argsOrOpts, maybeOpts);',
    "      return request('exec', { program: n.program, args: n.args, options: n.options });",
    '    },',
    '    storage,',
    '  });',
    '})();',
    '</script>',
  ].join('\n');
}

function stripDtInjections(html: string): string {
  return html
    .replace(/<link[^>]*data-dt-theme[^>]*>\s*/gi, '')
    .replace(/<script[^>]*data-dt-ui[^>]*><\/script>\s*/gi, '')
    .replace(/<script[^>]*data-dt-bridge[^>]*>[\s\S]*?<\/script>\s*/gi, '');
}

function injectIntoHtmlHead(html: string, snippet: string): string {
  const headMatch = html.match(/<head(\s[^>]*)?>|<head>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertPos = headMatch.index + headMatch[0].length;
    return html.slice(0, insertPos) + '\n' + snippet + '\n' + html.slice(insertPos);
  }

  return snippet + '\n' + html;
}

function injectDtRuntime(
  html: string,
  options: {
    accentColor: string;
    theme: 'light' | 'dark';
    streamId: string;
    bridgeToken: string;
  },
): string {
  const cleanHtml = stripDtInjections(html);
  const snippet = [
    createThemeLinkTag(options.accentColor, options.theme),
    '<script src="/api/ui/desktalk-ui.js" data-dt-ui></script>',
    createHtmlBridgeScript(options.streamId, options.bridgeToken),
  ].join('\n');
  return injectIntoHtmlHead(cleanHtml, snippet);
}

function normalizeRelativePath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/');
}

function isAllowedHiddenPath(relativePath: string): boolean {
  return relativePath === '.data/liveapps' || relativePath.startsWith('.data/liveapps/');
}

function hasDisallowedHiddenSegment(relativePath: string): boolean {
  const segments = normalizeRelativePath(relativePath).split('/').filter(Boolean);
  const allowLiveAppsRoot = isAllowedHiddenPath(relativePath);

  return segments.some((segment, index) => {
    if (!segment.startsWith('.')) {
      return false;
    }

    if (allowLiveAppsRoot && index === 0 && segment === '.data') {
      return false;
    }

    if (allowLiveAppsRoot && index === 1 && segment === 'liveapps') {
      return false;
    }

    return true;
  });
}

function resolveUserFile(userHomeDir: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath).replace(/^\/+/, '');
  const resolvedPath = resolve(userHomeDir, normalized);
  const homePrefix = `${resolve(userHomeDir)}${sep}`;
  if (resolvedPath !== resolve(userHomeDir) && !resolvedPath.startsWith(homePrefix)) {
    throw new Error('Path escapes the user home directory.');
  }
  return resolvedPath;
}

function getMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export async function dtfsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { '*': string };
    Querystring: { streamId?: string; token?: string; accent?: string; theme?: string; t?: string };
  }>('/@dtfs/*', async (req, reply) => {
    const rawPath = req.params['*'];
    if (!rawPath) {
      reply.code(404);
      return { error: 'Not found' };
    }

    const relativePath = normalizeRelativePath(decodeURIComponent(rawPath));
    if (!relativePath || relativePath.split('/').some((segment) => segment === '..')) {
      reply.code(400);
      return { error: 'Invalid file path' };
    }

    if (hasDisallowedHiddenSegment(relativePath)) {
      reply.code(403);
      return { error: 'Access denied' };
    }

    const userHomeDir = getUserHomeDir(req.user!.username);
    const absolutePath = resolveUserFile(userHomeDir, relativePath);

    let stat;
    try {
      stat = await lstat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reply.code(404);
        return { error: 'Not found' };
      }
      throw error;
    }

    if (!stat.isFile() || stat.isSymbolicLink()) {
      reply.code(403);
      return { error: 'Access denied' };
    }

    const realFilePath = await realpath(absolutePath);
    const realHomeDir = await realpath(userHomeDir);
    const realHomePrefix = `${realHomeDir}${sep}`;
    if (realFilePath !== realHomeDir && !realFilePath.startsWith(realHomePrefix)) {
      reply.code(403);
      return { error: 'Access denied' };
    }

    const mimeType = getMimeType(relativePath);
    const isHtml = mimeType.startsWith('text/html');
    const isLiveAppHtml = isHtml && isAllowedHiddenPath(relativePath);

    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', isHtml ? 'no-store' : 'no-cache');

    if (!isHtml) {
      reply.type(mimeType);
      return reply.send(createReadStream(realFilePath));
    }

    let html = await readFile(realFilePath, 'utf-8');
    const streamId = req.query.streamId;
    const token = req.query.token;
    if (isLiveAppHtml && streamId && token) {
      html = injectDtRuntime(html, {
        accentColor: req.query.accent ?? '#7c6ff7',
        theme: req.query.theme === 'light' ? 'light' : 'dark',
        streamId,
        bridgeToken: token,
      });
    }

    reply.type('text/html; charset=utf-8');
    return reply.send(html);
  });
}
