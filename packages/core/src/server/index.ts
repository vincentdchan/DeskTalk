import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { addClient, handleCommand, broadcastRaw } from '../services/messaging.js';
import { registry } from '../services/miniapp-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ServerOptions {
  host: string;
  port: number;
}

export async function createServer(options: ServerOptions) {
  const app = Fastify({ logger: false });

  // Register WebSocket support
  await app.register(fastifyWebsocket);

  // Serve the frontend build from dist/frontend/
  const frontendDir = join(__dirname, '..', 'frontend');
  await app.register(fastifyStatic, {
    root: frontendDir,
    prefix: '/',
    wildcard: false,
  });

  // WebSocket endpoint for MiniApp messaging and AI events
  app.get('/ws', { websocket: true }, (socket, req) => {
    addClient(socket);

    socket.on('message', async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'command:invoke') {
          const { miniAppId, command, requestId, data } = msg;
          try {
            const result = await handleCommand(miniAppId, command, data);
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
        } else if (msg.type === 'ai:prompt') {
          // AI prompt handling — will be wired to pi SDK later
          broadcastRaw({
            type: 'ai:event',
            event: { type: 'message_update', text: '[AI not yet configured]' },
          });
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  // REST API: Get all registered MiniApp manifests (for initial Dock load)
  app.get('/api/miniapps', async () => {
    return registry.getManifests();
  });

  // REST API: Activate a MiniApp
  app.post<{ Params: { id: string } }>('/api/miniapps/:id/activate', async (req) => {
    const { id } = req.params;
    const activation = registry.activate(id);
    return { id, activated: true };
  });

  // REST API: Deactivate a MiniApp
  app.post<{ Params: { id: string } }>('/api/miniapps/:id/deactivate', async (req) => {
    const { id } = req.params;
    registry.deactivate(id);
    return { id, deactivated: true };
  });

  // SPA fallback — serve index.html for all non-API, non-asset routes
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) {
      reply.code(404);
      return { error: 'Not found' };
    }
    return reply.sendFile('index.html');
  });

  await app.listen({ host: options.host, port: options.port });
  return app;
}
