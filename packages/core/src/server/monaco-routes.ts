import fastifyStatic from '@fastify/static';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';

const MONACO_WORKER_PATHS: Record<string, string> = {
  editorWorkerService: 'vs/editor/editor.worker.js',
  json: 'vs/language/json/json.worker.js',
  css: 'vs/language/css/css.worker.js',
  scss: 'vs/language/css/css.worker.js',
  less: 'vs/language/css/css.worker.js',
  html: 'vs/language/html/html.worker.js',
  handlebars: 'vs/language/html/html.worker.js',
  razor: 'vs/language/html/html.worker.js',
  typescript: 'vs/language/typescript/ts.worker.js',
  javascript: 'vs/language/typescript/ts.worker.js',
};

const MONACO_ASSET_PREFIX = '/api/miniapps/text-edit/monaco/assets/';
const MONACO_WORKER_PREFIX = '/api/miniapps/text-edit/monaco/worker/';

export async function monacoRoutes(app: FastifyInstance): Promise<void> {
  const require = createRequire(import.meta.url);
  const editorWorkerEntry = require.resolve('monaco-editor/esm/vs/editor/editor.worker.js');
  const monacoEsmDir = join(dirname(editorWorkerEntry), '..', '..');

  await app.register(fastifyStatic, {
    root: monacoEsmDir,
    prefix: MONACO_ASSET_PREFIX,
    decorateReply: false,
    cacheControl: true,
    immutable: true,
    maxAge: '1d',
  });

  app.get<{ Params: { label: string } }>(`${MONACO_WORKER_PREFIX}:label`, async (req, reply) => {
    const workerPath = MONACO_WORKER_PATHS[req.params.label];
    if (!workerPath) {
      reply.code(404);
      return { error: 'Unknown Monaco worker' };
    }

    const bootstrap = [
      `globalThis._VSCODE_FILE_ROOT = new URL(${JSON.stringify(MONACO_ASSET_PREFIX)}, globalThis.location.origin).toString();`,
      `await import(new URL(${JSON.stringify(`${MONACO_ASSET_PREFIX}${workerPath}`)}, globalThis.location.origin).toString());`,
    ].join('\n');

    reply.header('Content-Type', 'application/javascript; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=86400, immutable');
    return reply.send(bootstrap);
  });
}
