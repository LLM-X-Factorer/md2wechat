import type { FastifyInstance } from 'fastify';
import { listBuiltinThemes, listCustomThemes } from '../core/converter.js';
import type { AppConfig } from '../types/index.js';

export function registerThemesRoute(app: FastifyInstance, config: AppConfig): void {
  app.get('/api/themes', async () => {
    return {
      builtin: listBuiltinThemes(),
      custom: listCustomThemes(config.themesDir),
    };
  });
}
