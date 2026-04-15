import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { loadConfig, validateConfig } from './config.js';
import { initDatabase, closeDatabase } from './services/database.js';
import { PublishPipeline } from './services/pipeline.js';
import { registerHealthRoute } from './routes/health.js';
import { registerPublishRoute } from './routes/publish.js';
import { registerPreviewRoute } from './routes/preview.js';
import { registerHistoryRoute } from './routes/history.js';
import { registerThemesRoute } from './routes/themes.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerStaticRoute } from './routes/static.js';
import { isAuthEnabled, checkAuth, verifyPassword, getTokenCookie, getClearCookie, getLoginPageHtml } from './core/auth.js';

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

  // Auth endpoints (always accessible)
  app.post<{ Body: { password: string } }>('/api/console-login', async (request, reply) => {
    try {
      const { password } = request.body as { password: string };
      if (verifyPassword(password)) {
        return reply.header('Set-Cookie', getTokenCookie()).send({ ok: true });
      }
      return reply.status(401).send({ ok: false, error: '密码错误' });
    } catch {
      return reply.status(400).send({ ok: false, error: '请求格式错误' });
    }
  });

  app.post('/api/console-logout', async (_request, reply) => {
    return reply.header('Set-Cookie', getClearCookie()).send({ ok: true });
  });

  app.get('/api/console-auth', async (request) => {
    return { authEnabled: isAuthEnabled(), loggedIn: checkAuth(request) };
  });

  // Cookie-based auth hook
  if (isAuthEnabled()) {
    app.addHook('onRequest', async (request, reply) => {
      // Skip auth for login/logout/auth-check, health check
      if (request.url.startsWith('/api/console-')) return;
      if (request.url === '/health') return;

      if (!checkAuth(request)) {
        // API requests get 401
        if (request.url.startsWith('/api/')) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: '未登录' },
          });
        }
        // HTML requests get login page
        return reply.type('text/html').send(getLoginPageHtml());
      }
    });
    app.log.info('Password protection: enabled');
  }

  // Initialize database
  await initDatabase(config.databaseUrl, config.dataDir);
  app.log.info('Database initialized');

  // Initialize pipeline
  const pipeline = new PublishPipeline(config, app.log);

  // Register routes
  registerHealthRoute(app, pipeline);
  registerPublishRoute(app, pipeline, config);
  registerPreviewRoute(app, pipeline);
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
