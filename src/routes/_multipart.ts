import type { FastifyRequest } from 'fastify';
import type { PublishOptions } from '../types/index.js';

const ALLOWED_ARTICLE_EXT = new Set(['.md']);
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

export interface MultipartParseSuccess {
  ok: true;
  options: PublishOptions;
}

export interface MultipartParseError {
  ok: false;
  code: 'INVALID_FILE';
  step: 'upload';
  message: string;
}

export type MultipartParseResult = MultipartParseSuccess | MultipartParseError;

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-]/g, '_');
}

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : '';
}

export async function parsePublishMultipart(request: FastifyRequest): Promise<MultipartParseResult> {
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
            return { ok: false, code: 'INVALID_FILE', step: 'upload', message: `不支持的文件格式: ${ext}` };
          }
          articleBuffer = buffer;
          articleFilename = filename;
        } else if (part.fieldname === 'cover') {
          if (!ALLOWED_IMAGE_EXT.has(ext)) {
            return { ok: false, code: 'INVALID_FILE', step: 'upload', message: `不支持的封面格式: ${ext}` };
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
    return {
      ok: false,
      code: 'INVALID_FILE',
      step: 'upload',
      message: err instanceof Error ? err.message : '文件上传解析失败',
    };
  }

  if (!articleBuffer) {
    return { ok: false, code: 'INVALID_FILE', step: 'upload', message: '缺少 article 文件' };
  }

  const options: PublishOptions = {
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

  return { ok: true, options };
}
