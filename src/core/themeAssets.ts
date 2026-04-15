import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import type { ThemeManifest } from '../types/index.js';

const ASSET_PREFIX = 'assets/';

export function loadThemeManifest(themesDir: string, theme: string | undefined): ThemeManifest | undefined {
  const resolvedTheme = (theme ?? '').trim();
  if (!resolvedTheme) return undefined;
  const manifestPath = path.join(themesDir, resolvedTheme, 'theme.json');
  if (!fs.existsSync(manifestPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ThemeManifest;
  } catch {
    return undefined;
  }
}

function resolveThemeAssetPath(themesDir: string, theme: string, relative: string): string {
  return path.join(themesDir, theme, relative);
}

function readThemeAssetText(themesDir: string, theme: string, relative: string): string | undefined {
  const full = resolveThemeAssetPath(themesDir, theme, relative);
  if (!fs.existsSync(full)) return undefined;
  return fs.readFileSync(full, 'utf8');
}

function readThemeAssetBuffer(themesDir: string, theme: string, relative: string): Buffer | undefined {
  const full = resolveThemeAssetPath(themesDir, theme, relative);
  if (!fs.existsSync(full)) return undefined;
  return fs.readFileSync(full);
}

export function applyAutoInject(
  body: string,
  themesDir: string,
  manifest: ThemeManifest | undefined
): string {
  if (!manifest?.autoInject) return body;
  const { header, footerMarkdown } = manifest.autoInject;

  let result = body;
  if (header) {
    result = `![${manifest.displayName} 开头](${header})\n\n${result}`;
  }
  if (footerMarkdown) {
    const footer = readThemeAssetText(themesDir, manifest.name, footerMarkdown);
    if (footer) {
      result = `${result.trimEnd()}\n\n${footer.trim()}\n`;
    }
  }
  return result;
}

export interface ThemeAssetResolution {
  html: string;
  localImages: Map<string, Buffer>;
}

export function resolveThemeAssetsInHtml(
  html: string,
  themesDir: string,
  manifest: ThemeManifest | undefined,
  existing?: Map<string, Buffer>
): ThemeAssetResolution {
  const localImages = existing ?? new Map<string, Buffer>();
  if (!manifest) return { html, localImages };

  const $ = cheerio.load(html);
  $('img').each((_, element) => {
    const $img = $(element);
    const src = $img.attr('src') ?? '';
    if (!src.startsWith(ASSET_PREFIX)) return;

    const buffer = readThemeAssetBuffer(themesDir, manifest.name, src);
    if (!buffer) return;

    const filename = `__theme_${manifest.name}__${src.slice(ASSET_PREFIX.length).replace(/[/\\]/g, '_')}`;
    localImages.set(filename, buffer);
    $img.attr('src', filename);
    $img.attr('data-theme-asset', '1');
  });

  return { html: $.html(), localImages };
}

export function readThemeAsset(themesDir: string, theme: string, relative: string): Buffer | undefined {
  return readThemeAssetBuffer(themesDir, theme, relative);
}
