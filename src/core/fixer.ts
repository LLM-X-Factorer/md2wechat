import * as cheerio from 'cheerio';
import type { WechatClient } from './wechat.js';

export interface FixOptions {
  upload?: boolean;
  wechat?: WechatClient;
  localImages?: Map<string, Buffer>;
  logger?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function fixHtmlContent(
  html: string,
  options: FixOptions
): Promise<{ html: string; imageCount: number; uploadedCount: number; failedCount: number }> {
  const $ = cheerio.load(html);

  $('script,iframe').remove();

  const images = $('img').toArray();
  let uploadedCount = 0;
  let failedCount = 0;

  for (const element of images) {
    const image = $(element);
    const source = image.attr('src');
    if (!source) continue;

    if (options.upload && options.wechat) {
      // Skip already-uploaded WeChat images
      if (source.includes('mmbiz.qpic.cn')) continue;

      try {
        let uploadedUrl: string;

        if (isRemoteUrl(source)) {
          options.logger?.info(`Uploading remote image: ${source}`);
          uploadedUrl = await options.wechat.uploadArticleImageFromUrl(source);
        } else if (options.localImages) {
          // Try to find a matching local image by filename
          const decodedSource = (() => {
            try { return decodeURIComponent(source); } catch { return source; }
          })();
          const filename = decodedSource.split('/').pop() ?? decodedSource;
          const buffer = options.localImages.get(filename) ?? options.localImages.get(decodedSource);

          if (buffer) {
            options.logger?.info(`Uploading local image: ${filename}`);
            uploadedUrl = await options.wechat.uploadArticleImage(buffer, filename);
          } else {
            options.logger?.warn(`Local image not found: ${source}`);
            continue;
          }
        } else {
          continue;
        }

        image.removeAttr('data-original-src');
        image.attr('src', uploadedUrl);
        uploadedCount++;
        options.logger?.info(`Image uploaded: ${source} -> ${uploadedUrl}`);
      } catch (err) {
        failedCount++;
        const msg = err instanceof Error ? err.message : String(err);
        options.logger?.warn(`Failed to upload image: ${source} — ${msg}`);
        // Remove the img tag so broken images don't show as empty space
        image.remove();
        continue;
      }
    }

    image.attr('style', [
      'display:block',
      'max-width:100%',
      'height:auto',
      'margin:0 auto',
      'border-radius:6px',
    ].join(';'));
  }

  return { html: $.html(), imageCount: images.length, uploadedCount, failedCount };
}
