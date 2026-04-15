export interface ParsedMarkdown {
  metadata: ArticleMetadata;
  body: string;
  originalBody: string;
}

export interface ArticleMetadata {
  title?: string;
  author?: string;
  digest?: string;
  theme?: string;
  cover?: string;
  enableComment?: boolean;
  coverFields?: Record<string, string>;
  background?: Record<string, string>;
}

export interface PublishOptions {
  article: Buffer;
  articleFilename: string;
  images?: Array<{ buffer: Buffer; filename: string }>;
  cover?: { buffer: Buffer; filename: string };
  author?: string;
  theme?: string;
  digest?: string;
  enableComment?: boolean;
  coverStrategy?: 'sharp' | 'ai';
  coverPrompt?: string;
  webhookUrl?: string;
}

export interface PublishResult {
  publishId: string;
  mediaId: string;
  title: string;
  author: string;
  coverUrl?: string;
  coverStrategy: string;
  publishedAt: string;
}

export interface CoverGenerateOptions {
  title: string;
  author?: string;
  width: number;
  height: number;
  backgroundPath?: string;
  presetName?: string;
  overlays?: CoverOverlay[];
  prompt?: string;
}

export interface CoverOverlay {
  input: Buffer;
  top?: number;
  left?: number;
  gravity?: string;
}

export interface CoverStrategy {
  name: string;
  generate(options: CoverGenerateOptions): Promise<Buffer>;
}

export interface CompatCssConfig {
  highlight: string;
  blockquote: string;
  table: string;
  codeBlock: string;
  math: string;
  layout: string;
}

export type HeadingStyle = 'default' | 'part-number' | 'chinese-number';

export interface ThemeAutoInject {
  header?: string;
  footerMarkdown?: string;
}

export interface ThemeCoverOverlaySpec {
  field: string;
  x: number;
  y: number;
  size?: number;
  color?: string;
  font?: string;
  weight?: string | number;
  maxWidth?: number;
  anchor?: 'start' | 'middle' | 'end';
}

export interface ThemeCoverMaskSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  rx?: number;
}

export interface ThemeCoverSpec {
  type: 'template';
  base: string;
  width?: number;
  height?: number;
  masks?: ThemeCoverMaskSpec[];
  overlays: ThemeCoverOverlaySpec[];
}

export interface ThemeHeadingBannerSpec {
  enabled: boolean;
  base?: string;
  width?: number;
  height?: number;
  english?: { font?: string; size?: number; color?: string; top?: number; align?: 'start' | 'middle' | 'end' };
  chinese?: { font?: string; size?: number; color?: string; weight?: string | number; top?: number; align?: 'start' | 'middle' | 'end' };
}

export interface ThemeManifest {
  name: string;
  displayName: string;
  version: string;
  description?: string;
  category?: string;
  headingStyle?: HeadingStyle;
  compatOverrides?: Partial<Record<keyof CompatCssConfig, boolean>>;
  autoInject?: ThemeAutoInject;
  cover?: ThemeCoverSpec;
  headingBanner?: ThemeHeadingBannerSpec;
}

export interface ThemeInfo {
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  headingStyle?: HeadingStyle;
  hasTemplate: boolean;
}

export interface PublishRecord {
  id: string;
  title: string;
  author: string | null;
  media_id: string;
  thumb_media_id: string;
  cover_url: string | null;
  cover_strategy: string;
  theme: string | null;
  digest: string | null;
  enable_comment: number;
  status: string;
  error_message: string | null;
  webhook_status: string | null;
  webhook_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineError extends Error {
  code: string;
  step: string;
}

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: {
    publishId: string;
    mediaId: string;
    title: string;
    author: string;
    coverUrl?: string;
    coverStrategy: string;
  };
}

export interface AppConfig {
  wxAppId: string;
  wxAppSecret: string;
  defaultAuthor: string;
  defaultTheme: string;
  defaultCoverStrategy: 'sharp' | 'ai';
  imagenApiKey?: string;
  imagenModel?: string;
  databaseUrl?: string;
  webhookUrl?: string;
  apiKey?: string;
  port: number;
  maxFileSizeMb: number;
  tempDir: string;
  logLevel: string;
  dataDir: string;
  themesDir: string;
  configDir: string;
}
