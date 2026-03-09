import type { FastifyInstance } from 'fastify';
import { checkDatabaseConnection } from '../services/database.js';
import type { PublishPipeline } from '../services/pipeline.js';

export function registerHealthRoute(app: FastifyInstance, pipeline: PublishPipeline): void {
  app.get('/health', async () => {
    const dbConnected = await checkDatabaseConnection();

    return {
      status: 'ok',
      version: '1.0.0',
      wxConfigured: !!process.env.WXGZH_APPID && !!process.env.WXGZH_APPSECRET,
      tokenCached: pipeline.getWechatClient().isTokenCached(),
      dbConnected,
      aiCoverAvailable: pipeline.isAiCoverAvailable(),
    };
  });
}
