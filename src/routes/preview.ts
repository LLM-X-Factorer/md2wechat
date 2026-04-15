import type { FastifyInstance } from 'fastify';
import * as cheerio from 'cheerio';
import type { PublishPipeline } from '../services/pipeline.js';
import type { PipelineError } from '../types/index.js';
import { fixHtmlContent } from '../core/fixer.js';
import { parsePublishMultipart } from './_multipart.js';

function detectImageMime(buffer: Buffer, filename?: string): string {
  if (buffer.length >= 4) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) return 'image/webp';
  }
  const ext = (filename ?? '').toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function inlineLocalImages(html: string, localImages: Map<string, Buffer>): string {
  const $ = cheerio.load(html);
  $('img').each((_, element) => {
    const $img = $(element);
    const src = $img.attr('src');
    if (!src || /^(https?:|data:)/i.test(src)) return;

    const decoded = (() => {
      try { return decodeURIComponent(src); } catch { return src; }
    })();
    const filename = decoded.split('/').pop() ?? decoded;
    const buffer = localImages.get(filename) ?? localImages.get(decoded);
    if (!buffer) return;

    const mime = detectImageMime(buffer, filename);
    $img.attr('src', `data:${mime};base64,${buffer.toString('base64')}`);
  });
  return $.html();
}

export function registerPreviewRoute(app: FastifyInstance, pipeline: PublishPipeline): void {
  app.post('/api/preview', async (request, reply) => {
    const parseResult = await parsePublishMultipart(request);
    if (!parseResult.ok) {
      return reply.status(400).send({
        success: false,
        error: { code: parseResult.code, step: parseResult.step, message: parseResult.message },
      });
    }

    try {
      const prepared = await pipeline.prepare(parseResult.options);

      const fixResult = await fixHtmlContent(prepared.html, {
        upload: false,
        localImages: prepared.localImages,
        logger: request.log,
      });

      const html = inlineLocalImages(fixResult.html, prepared.localImages);
      const coverMime = detectImageMime(prepared.coverBuffer, 'cover.jpg');
      const cover = `data:${coverMime};base64,${prepared.coverBuffer.toString('base64')}`;

      return reply.status(200).send({
        success: true,
        data: {
          html,
          cover,
          coverStrategy: prepared.coverStrategy,
          title: prepared.title,
          author: prepared.author,
          digest: prepared.digest,
          theme: prepared.theme,
          enableComment: prepared.enableComment,
          bannerCount: prepared.bannerCount,
          imageCount: fixResult.imageCount,
        },
      });
    } catch (err) {
      const pipelineErr = err as PipelineError;
      if (pipelineErr.code && pipelineErr.step) {
        request.log.error({ code: pipelineErr.code, step: pipelineErr.step, message: pipelineErr.message }, 'Preview pipeline error');
        return reply.status(500).send({
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
