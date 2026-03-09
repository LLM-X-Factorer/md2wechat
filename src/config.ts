import path from 'node:path';
import type { AppConfig } from './types/index.js';

export function loadConfig(): AppConfig {
  return {
    wxAppId: process.env.WXGZH_APPID ?? '',
    wxAppSecret: process.env.WXGZH_APPSECRET ?? '',
    defaultAuthor: process.env.WXGZH_DEFAULT_AUTHOR ?? 'tenisinfinite',
    defaultTheme: process.env.WXGZH_DEFAULT_THEME ?? 'default',
    defaultCoverStrategy: (process.env.WXGZH_DEFAULT_COVER_STRATEGY as 'sharp' | 'ai') ?? 'sharp',
    imagenApiKey: process.env.IMAGEN_API_KEY || undefined,
    imagenModel: process.env.IMAGEN_MODEL || undefined,
    databaseUrl: process.env.DATABASE_URL || undefined,
    webhookUrl: process.env.WEBHOOK_URL || undefined,
    apiKey: process.env.API_KEY || undefined,
    port: parseInt(process.env.PORT ?? '3000', 10),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? '10', 10),
    tempDir: process.env.TEMP_DIR ?? '/tmp',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    dataDir: process.env.DATA_DIR ?? path.resolve('data'),
    themesDir: process.env.THEMES_DIR ?? path.resolve('themes'),
    configDir: process.env.CONFIG_DIR ?? path.resolve('config'),
  };
}

export function validateConfig(config: AppConfig): string[] {
  const warnings: string[] = [];
  if (!config.wxAppId) {
    warnings.push('WXGZH_APPID is not configured');
  }
  if (!config.wxAppSecret) {
    warnings.push('WXGZH_APPSECRET is not configured');
  }
  return warnings;
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}
