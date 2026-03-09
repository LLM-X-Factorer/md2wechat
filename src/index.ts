import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { loadConfig, validateConfig } from './config.js';
import { initDatabase, closeDatabase } from './services/database.js';
import { PublishPipeline } from './services/pipeline.js';
import { registerHealthRoute } from './routes/health.js';
import { registerPublishRoute } from './routes/publish.js';
import { registerHistoryRoute } from './routes/history.js';
import { registerThemesRoute } from './routes/themes.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerStaticRoute } from './routes/static.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const warnings = validateConfig(config);

  const app = Fastify({
    logger: {
      level: config.logLevel,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
          };
        },
      },
    },
  });

  // Register plugins
  await app.register(cors);
  await app.register(multipart, {
    limits: {
      fileSize: config.maxFileSizeMb * 1024 * 1024,
      files: 20,
    },
  });

  // API key auth hook
  if (config.apiKey) {
    app.addHook('onRequest', async (request, reply) => {
      // Skip auth for health check and web UI
      if (request.url === '/health' || request.url === '/') return;

      const apiKey = request.headers['x-api-key'];
      if (apiKey !== config.apiKey) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        });
      }
    });
  }

  // Initialize database
  await initDatabase(config.databaseUrl, config.dataDir);
  app.log.info('Database initialized');

  // Initialize pipeline
  const pipeline = new PublishPipeline(config, app.log);

  // Register routes
  registerHealthRoute(app, pipeline);
  registerPublishRoute(app, pipeline, config);
  registerHistoryRoute(app);
  registerThemesRoute(app, config);
  registerConfigRoutes(app, config);
  registerStaticRoute(app);

  // Log warnings
  for (const warning of warnings) {
    app.log.warn(warning);
  }

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start server
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`md2wechat server listening on port ${config.port}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
