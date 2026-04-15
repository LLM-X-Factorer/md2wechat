import { randomUUID } from 'node:crypto';
import { parseMarkdown } from '../core/parser.js';
import { renderMarkdownToHtml, extractPublishableContent } from '../core/converter.js';
import { fixHtmlContent } from '../core/fixer.js';
import { resolveCoverStrategy } from '../core/cover/strategy.js';
import { SharpCoverStrategy } from '../core/cover/sharp-strategy.js';
import { AiCoverStrategy } from '../core/cover/ai-strategy.js';
import { TemplateCoverStrategy } from '../core/cover/template-strategy.js';
import { WechatClient } from '../core/wechat.js';
import { applyAutoInject, loadThemeManifest, resolveThemeAssetsInHtml } from '../core/themeAssets.js';
import { processHeadingBanners } from '../core/banner.js';
import { processAvatarPlaceholders } from '../core/avatar.js';
import { insertPublishRecord } from './publishRecord.js';
import { triggerWebhook } from './webhook.js';
import type { AppConfig, PublishOptions, PublishResult, CoverStrategy, PipelineError } from '../types/index.js';

export interface PreparedArticle {
  title: string;
  author: string;
  theme: string;
  digest: string;
  enableComment: boolean;
  html: string;
  coverBuffer: Buffer;
  coverStrategy: string;
  localImages: Map<string, Buffer>;
  bannerCount: number;
}

function createPipelineError(message: string, code: string, step: string): PipelineError {
  const error = new Error(message) as PipelineError;
  error.code = code;
  error.step = step;
  return error;
}

export class PublishPipeline {
  private config: AppConfig;
  private wechat: WechatClient;
  private sharpStrategy: SharpCoverStrategy;
  private aiStrategy?: AiCoverStrategy;
  private templateStrategy: TemplateCoverStrategy;
  private logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

  constructor(
    config: AppConfig,
    logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
  ) {
    this.config = config;
    this.logger = logger;

    this.wechat = new WechatClient({
      appid: config.wxAppId,
      appsecret: config.wxAppSecret,
    });

    this.sharpStrategy = new SharpCoverStrategy();
    this.templateStrategy = new TemplateCoverStrategy(config.themesDir);

    if (config.imagenApiKey) {
      this.aiStrategy = new AiCoverStrategy(config.imagenApiKey, config.imagenModel);
    }
  }

  getWechatClient(): WechatClient {
    return this.wechat;
  }

  isAiCoverAvailable(): boolean {
    return !!this.aiStrategy;
  }

  async prepare(options: PublishOptions): Promise<PreparedArticle> {
    // Step 1: Parse Markdown
    let parsed;
    try {
      const markdownContent = options.article.toString('utf-8');
      parsed = parseMarkdown(markdownContent);
    } catch (err) {
      throw createPipelineError(
        `Markdown 解析失败: ${err instanceof Error ? err.message : String(err)}`,
        'PARSE_ERROR',
        'parse'
      );
    }

    const title = parsed.metadata.title ?? '未命名文章';
    const author = options.author ?? parsed.metadata.author ?? this.config.defaultAuthor;
    const theme = options.theme ?? parsed.metadata.theme ?? this.config.defaultTheme;
    const rawDigest = options.digest ?? parsed.metadata.digest ?? title;
    const digest = rawDigest.length > 120 ? rawDigest.slice(0, 117) + '...' : rawDigest;
    const enableComment = options.enableComment ?? parsed.metadata.enableComment ?? false;
    const coverStrategy = options.coverStrategy ?? this.config.defaultCoverStrategy;

    this.logger.info(`Preparing: "${title}" by ${author}, theme=${theme}, cover=${coverStrategy}`);

    // Step 2: Render Markdown to HTML (autoInject → render → banner → themeAssets)
    const manifest = loadThemeManifest(this.config.themesDir, theme);
    const bodyWithInjections = applyAutoInject(parsed.body, this.config.themesDir, manifest);

    let html;
    const themeAssetImages = new Map<string, Buffer>();
    let bannerCount = 0;
    try {
      const rendered = renderMarkdownToHtml(
        bodyWithInjections,
        { ...parsed.metadata, title, author, theme },
        {
          configDir: this.config.configDir,
          themesDir: this.config.themesDir,
        }
      );
      const sizeBeforeBanner = themeAssetImages.size;
      const withBanners = await processHeadingBanners(rendered, manifest, this.config.themesDir, themeAssetImages);
      bannerCount = themeAssetImages.size - sizeBeforeBanner;
      const withAvatar = await processAvatarPlaceholders(withBanners, manifest, themeAssetImages);
      const resolved = resolveThemeAssetsInHtml(withAvatar, this.config.themesDir, manifest, themeAssetImages);
      html = resolved.html;
    } catch (err) {
      throw createPipelineError(
        `HTML 渲染失败: ${err instanceof Error ? err.message : String(err)}`,
        'RENDER_ERROR',
        'render'
      );
    }

    // Merge theme assets with user-provided images
    const localImages = new Map<string, Buffer>(themeAssetImages);
    if (options.images) {
      for (const img of options.images) {
        localImages.set(img.filename, img.buffer);
      }
    }

    // Step 3: Generate cover (no upload here)
    let coverBuffer: Buffer;
    let actualCoverStrategy = coverStrategy as string;
    try {
      if (options.cover) {
        coverBuffer = options.cover.buffer;
        actualCoverStrategy = 'custom';
      } else if (manifest?.cover?.type === 'template' && coverStrategy !== 'ai') {
        try {
          coverBuffer = await this.templateStrategy.generate({
            title,
            author,
            width: manifest.cover.width ?? 1000,
            height: manifest.cover.height ?? 700,
            themeName: manifest.name,
            coverSpec: manifest.cover,
            fields: parsed.metadata.coverFields ?? {},
          });
          actualCoverStrategy = 'template';
        } catch (err) {
          this.logger.warn(
            `Template cover failed, falling back to sharp: ${err instanceof Error ? err.message : String(err)}`
          );
          coverBuffer = await this.sharpStrategy.generate({ title, author, width: 1000, height: 700 });
          actualCoverStrategy = 'sharp';
        }
      } else {
        const strategies: { sharp: CoverStrategy; ai?: CoverStrategy } = {
          sharp: this.sharpStrategy,
          ai: this.aiStrategy,
        };
        const strategy = resolveCoverStrategy(coverStrategy, this.isAiCoverAvailable(), strategies);

        if (coverStrategy === 'ai' && strategy.name !== 'ai') {
          this.logger.warn('AI cover not available, falling back to sharp strategy');
        }

        actualCoverStrategy = strategy.name;

        coverBuffer = await strategy.generate({
          title,
          author,
          width: 1000,
          height: 700,
          prompt: options.coverPrompt,
        });
      }
    } catch (err) {
      if (coverStrategy === 'ai') {
        this.logger.warn(`AI cover failed, falling back to sharp: ${err instanceof Error ? err.message : String(err)}`);
        try {
          coverBuffer = await this.sharpStrategy.generate({
            title,
            author,
            width: 1000,
            height: 700,
          });
          actualCoverStrategy = 'sharp';
        } catch (sharpErr) {
          throw createPipelineError(
            `AI 封面生成失败，已降级为 sharp 策略但仍失败：${sharpErr instanceof Error ? sharpErr.message : String(sharpErr)}`,
            'COVER_ERROR',
            'cover'
          );
        }
      } else {
        throw createPipelineError(
          `封面生成失败: ${err instanceof Error ? err.message : String(err)}`,
          'COVER_ERROR',
          'cover'
        );
      }
    }

    return {
      title,
      author,
      theme,
      digest,
      enableComment,
      html,
      coverBuffer,
      coverStrategy: actualCoverStrategy,
      localImages,
      bannerCount,
    };
  }

  async execute(options: PublishOptions): Promise<PublishResult> {
    const publishId = randomUUID();
    const prepared = await this.prepare(options);
    const { title, author, theme, digest, enableComment, html, coverBuffer, localImages } = prepared;
    const actualCoverStrategy = prepared.coverStrategy;

    this.logger.info(`Publishing: "${title}" by ${author}, theme=${theme}, cover=${actualCoverStrategy}`);

    // Fix HTML (upload images)
    let fixedHtml;
    try {
      const fixResult = await fixHtmlContent(html, {
        upload: !!this.config.wxAppId,
        wechat: this.wechat,
        localImages,
        logger: this.logger,
      });
      fixedHtml = fixResult.html;
      this.logger.info(`Images: ${fixResult.imageCount} found, ${fixResult.uploadedCount} uploaded, ${fixResult.failedCount} failed`);
    } catch (err) {
      throw createPipelineError(
        `图片上传替换失败: ${err instanceof Error ? err.message : String(err)}`,
        'FIX_ERROR',
        'fix'
      );
    }

    // Upload cover and create draft
    let mediaId: string;
    let thumbMediaId: string;
    let coverUrl: string | undefined;
    try {
      const coverResult = await this.wechat.uploadCoverImage(coverBuffer, 'cover.jpg');
      thumbMediaId = coverResult.mediaId;
      coverUrl = coverResult.url;

      const content = extractPublishableContent(fixedHtml);
      const draftResult = await this.wechat.createDraft({
        title,
        author,
        digest,
        content,
        thumbMediaId,
        enableComment,
      });
      mediaId = draftResult.media_id;
    } catch (err) {
      throw createPipelineError(
        `微信草稿 API 调用失败: ${err instanceof Error ? err.message : String(err)}`,
        'WXAPI_ERROR',
        'publish'
      );
    }

    const publishedAt = new Date().toISOString();

    // Save publish record
    try {
      await insertPublishRecord({
        id: publishId,
        title,
        author,
        media_id: mediaId,
        thumb_media_id: thumbMediaId,
        cover_url: coverUrl ?? null,
        cover_strategy: actualCoverStrategy,
        theme,
        digest,
        enable_comment: enableComment ? 1 : 0,
        status: 'draft',
        error_message: null,
        webhook_status: null,
        webhook_url: options.webhookUrl ?? this.config.webhookUrl ?? null,
      });
    } catch (err) {
      this.logger.error(`Failed to save publish record: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Trigger webhook (async, non-blocking)
    triggerWebhook(
      options.webhookUrl,
      this.config.webhookUrl,
      {
        event: 'draft.created',
        timestamp: publishedAt,
        data: {
          publishId,
          mediaId,
          title,
          author,
          coverUrl,
          coverStrategy: actualCoverStrategy,
        },
      },
      publishId,
      this.logger
    );

    return {
      publishId,
      mediaId,
      title,
      author,
      coverUrl,
      coverStrategy: actualCoverStrategy,
      publishedAt,
    };
  }
}
