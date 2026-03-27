import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { listBuiltinThemes, listCustomThemeDetails, getThemeTemplatePath } from '../core/converter.js';
import type { AppConfig } from '../types/index.js';

export function registerThemesRoute(app: FastifyInstance, config: AppConfig): void {
  app.get('/api/themes', async () => {
    return {
      builtin: listBuiltinThemes(),
      custom: listCustomThemeDetails(config.themesDir),
    };
  });

  app.get<{ Params: { name: string } }>('/api/themes/:name/template', async (request, reply) => {
    const { name } = request.params;
    const templatePath = getThemeTemplatePath(config.themesDir, name);
    if (!templatePath) {
      return reply.status(404).send({ error: '该主题没有写作模板' });
    }
    const content = fs.readFileSync(templatePath, 'utf8');
    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${name}-template.md"`);
    return reply.send(content);
  });
}
