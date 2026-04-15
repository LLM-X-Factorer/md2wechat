import type { FastifyInstance } from 'fastify';
import type { PublishPipeline } from '../services/pipeline.js';
import type { AppConfig, PipelineError } from '../types/index.js';
import { parsePublishMultipart } from './_multipart.js';

export function registerPublishRoute(
  app: FastifyInstance,
  pipeline: PublishPipeline,
  config: AppConfig
): void {
  app.post('/api/publish', async (request, reply) => {
    if (!config.wxAppId || !config.wxAppSecret) {
      return reply.status(400).send({
        success: false,
        error: { code: 'CONFIG_MISSING', message: 'AppID / AppSecret 未配置' },
      });
    }

    const parseResult = await parsePublishMultipart(request);
    if (!parseResult.ok) {
      return reply.status(400).send({
        success: false,
        error: { code: parseResult.code, step: parseResult.step, message: parseResult.message },
      });
    }

    try {
      const result = await pipeline.execute(parseResult.options);
      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err) {
      const pipelineErr = err as PipelineError;
      if (pipelineErr.code && pipelineErr.step) {
        request.log.error({ code: pipelineErr.code, step: pipelineErr.step, message: pipelineErr.message }, 'Pipeline error');
        const statusCode = pipelineErr.code === 'WXAPI_ERROR' ? 502 : 500;
        return reply.status(statusCode).send({
          success: false,
          error: {
            code: pipelineErr.code,
            message: pipelineErr.message,
            step: pipelineErr.step,
          },
        });
      }

      request.log.error(err);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务内部错误',
        },
      });
    }
  });
}
