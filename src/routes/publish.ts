import type { FastifyInstance } from 'fastify';
import type { PublishPipeline } from '../services/pipeline.js';
import type { AppConfig, PipelineError, PublishOptions } from '../types/index.js';

const ALLOWED_ARTICLE_EXT = new Set(['.md']);
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const FILENAME_REGEX = /^[a-zA-Z0-9._\-\u4e00-\u9fff]+$/;

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-]/g, '_');
}

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : '';
}

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

    let articleBuffer: Buffer | null = null;
    let articleFilename = 'article.md';
    const images: Array<{ buffer: Buffer; filename: string }> = [];
    let coverFile: { buffer: Buffer; filename: string } | undefined;
    const fields: Record<string, string> = {};

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          const filename = sanitizeFilename(part.filename);
          const ext = getFileExtension(part.filename);

          if (part.fieldname === 'article') {
            if (!ALLOWED_ARTICLE_EXT.has(ext)) {
              return reply.status(400).send({
                success: false,
                error: { code: 'INVALID_FILE', step: 'upload', message: `不支持的文件格式: ${ext}` },
              });
            }
            articleBuffer = buffer;
            articleFilename = filename;
          } else if (part.fieldname === 'cover') {
            if (!ALLOWED_IMAGE_EXT.has(ext)) {
              return reply.status(400).send({
                success: false,
                error: { code: 'INVALID_FILE', step: 'upload', message: `不支持的封面格式: ${ext}` },
              });
            }
            coverFile = { buffer, filename };
          } else if (part.fieldname === 'images[]' || part.fieldname === 'images') {
            if (ALLOWED_IMAGE_EXT.has(ext)) {
              images.push({ buffer, filename });
            }
          }
        } else {
          fields[part.fieldname] = (part.value as string) ?? '';
        }
      }
    } catch (err) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_FILE',
          step: 'upload',
          message: err instanceof Error ? err.message : '文件上传解析失败',
        },
      });
    }

    if (!articleBuffer) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_FILE', step: 'upload', message: '缺少 article 文件' },
      });
    }

    const publishOptions: PublishOptions = {
      article: articleBuffer,
      articleFilename,
      images: images.length > 0 ? images : undefined,
      cover: coverFile,
      author: fields.author || undefined,
      theme: fields.theme || undefined,
      digest: fields.digest || undefined,
      enableComment: fields.enableComment === 'true' || fields.enableComment === '1',
      coverStrategy: (fields.coverStrategy as 'sharp' | 'ai') || undefined,
      coverPrompt: fields.coverPrompt || undefined,
      webhookUrl: fields.webhookUrl || undefined,
    };

    try {
      const result = await pipeline.execute(publishOptions);
      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err) {
      const pipelineErr = err as PipelineError;
      if (pipelineErr.code && pipelineErr.step) {
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
