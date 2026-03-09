import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

export function registerStaticRoute(app: FastifyInstance): void {
  const indexPath = path.resolve(__dirname, '../../public/index.html');
  let cachedHtml: string | null = null;

  app.get('/', async (_request, reply) => {
    if (!cachedHtml) {
      cachedHtml = fs.readFileSync(indexPath, 'utf8');
    }
    return reply.type('text/html').send(cachedHtml);
  });
}
