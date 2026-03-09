import type { FastifyInstance } from 'fastify';
import { queryPublishRecords } from '../services/publishRecord.js';

export function registerHistoryRoute(app: FastifyInstance): void {
  app.get<{
    Querystring: { page?: string; pageSize?: string; status?: string };
  }>('/api/history', async (request) => {
    const { page, pageSize, status } = request.query;

    const result = await queryPublishRecords({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      status: status || undefined,
    });

    return {
      total: result.total,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      items: result.items,
    };
  });
}
