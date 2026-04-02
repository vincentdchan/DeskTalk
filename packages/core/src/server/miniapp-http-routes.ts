import type { FastifyInstance } from 'fastify';
import { request as httpRequest } from 'node:http';
import { processManager } from '../services/backend-process-manager';
import { getUserHomeDir } from '../services/workspace';

export async function miniAppHttpRoutes(app: FastifyInstance): Promise<void> {
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    url: '/api/miniapps/:id/http/*',
    handler: async (req, reply) => {
      const { id, '*': wildcard } = req.params as { id: string; '*': string };
      const username = req.user!.username;
      const processKey = `${id}:${username}`;
      const socketPath = processManager.getHttpSocketPath(processKey);

      if (!socketPath) {
        reply.code(404);
        return { error: 'MiniApp HTTP server not available' };
      }

      const queryIndex = req.url.indexOf('?');
      const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
      const proxyPath = `/${wildcard ?? ''}${query}`;

      await new Promise<void>((resolve) => {
        const proxyReq = httpRequest(
          {
            socketPath,
            method: req.method,
            path: proxyPath,
            headers: {
              ...req.headers,
              host: 'localhost',
              'x-desktalk-username': username,
              'x-desktalk-userhome': getUserHomeDir(username),
            },
          },
          (proxyRes) => {
            reply.raw.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
            proxyRes.pipe(reply.raw);
            proxyRes.on('end', resolve);
          },
        );

        proxyReq.on('error', () => {
          if (!reply.sent) {
            reply.code(502).send({ error: 'MiniApp HTTP backend error' });
          }
          resolve();
        });

        if (req.method === 'GET' || req.method === 'HEAD') {
          proxyReq.end();
          return;
        }

        req.raw.pipe(proxyReq);
      });

      return reply;
    },
  });
}
