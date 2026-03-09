import type { FastifyInstance } from 'fastify';
import { maskSecret } from '../config.js';
import type { AppConfig } from '../types/index.js';

export function registerConfigRoutes(app: FastifyInstance, config: AppConfig): void {
  app.get('/api/config', async () => {
    return {
      appid: config.wxAppId ? maskSecret(config.wxAppId) : null,
      defaultAuthor: config.defaultAuthor,
      defaultTheme: config.defaultTheme,
      defaultCoverStrategy: config.defaultCoverStrategy,
      aiCoverConfigured: !!config.imagenApiKey,
      webhookConfigured: !!config.webhookUrl,
    };
  });
}
