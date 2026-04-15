import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import type { ThemeHeadingBannerSpec, ThemeManifest } from '../types/index.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function anchorToX(align: 'start' | 'middle' | 'end' | undefined, width: number): { x: number; anchor: string } {
  if (align === 'start') return { x: 60, anchor: 'start' };
  if (align === 'end') return { x: width - 60, anchor: 'end' };
  return { x: Math.round(width / 2), anchor: 'middle' };
}

function wrapChineseByWidth(text: string, maxWidth: number, fontSize: number): string[] {
  const approxCharWidth = fontSize * 1.05;
  const charsPerLine = Math.max(1, Math.floor(maxWidth / approxCharWidth));
  const chars = [...text];
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += charsPerLine) {
    lines.push(chars.slice(i, i + charsPerLine).join(''));
  }
  return lines;
}

export interface BannerRenderOptions {
  partNumber: string;
  title: string;
  spec: ThemeHeadingBannerSpec;
  themesDir: string;
  themeName: string;
}

export async function renderHeadingBanner(options: BannerRenderOptions): Promise<Buffer> {
  const spec = options.spec;
  const width = spec.width ?? 1123;
  const height = spec.height ?? 437;

  const englishCfg = spec.english ?? {};
  const chineseCfg = spec.chinese ?? {};

  const englishSize = englishCfg.size ?? 208;
  const englishColor = englishCfg.color ?? '#111111';
  const englishFont = englishCfg.font ?? "Georgia, 'Times New Roman', serif";
  const englishTop = englishCfg.top ?? 60;
  const { x: englishX, anchor: englishAnchor } = anchorToX(englishCfg.align, width);

  const chineseSize = chineseCfg.size ?? 60;
  const chineseColor = chineseCfg.color ?? '#111111';
  const chineseFont = chineseCfg.font ?? "'PingFang SC', 'Noto Sans CJK SC', sans-serif";
  const chineseWeight = chineseCfg.weight ?? 900;
  const chineseTop = chineseCfg.top ?? Math.round(height * 0.7);
  const { x: chineseX, anchor: chineseAnchor } = anchorToX(chineseCfg.align, width);

  const chineseLines = wrapChineseByWidth(options.title, width - 120, chineseSize);
  const chineseLineHeight = Math.round(chineseSize * 1.25);

  const englishSvg = `<text x="${englishX}" y="${englishTop + englishSize}" text-anchor="${englishAnchor}" font-size="${englishSize}" font-family="${escapeXml(englishFont)}" font-weight="700" font-style="italic" fill="${englishColor}">${escapeXml(options.partNumber)}</text>`;

  const chineseSvg = chineseLines
    .map((line, idx) => {
      const y = chineseTop + chineseSize + idx * chineseLineHeight;
      return `<text x="${chineseX}" y="${y}" text-anchor="${chineseAnchor}" font-size="${chineseSize}" font-family="${escapeXml(chineseFont)}" font-weight="${chineseWeight}" fill="${chineseColor}">${escapeXml(line)}</text>`;
    })
    .join('');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${englishSvg}${chineseSvg}</svg>`;

  if (spec.base) {
    const basePath = path.join(options.themesDir, options.themeName, spec.base);
    if (fs.existsSync(basePath)) {
      return sharp(basePath)
        .resize(width, height, { fit: 'cover' })
        .composite([{ input: Buffer.from(svg) }])
        .jpeg({ quality: 92 })
        .toBuffer();
    }
  }

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function processHeadingBanners(
  html: string,
  manifest: ThemeManifest | undefined,
  themesDir: string,
  collector: Map<string, Buffer>
): Promise<string> {
  if (!manifest?.headingBanner?.enabled) return html;

  const $ = cheerio.load(html);
  const pending = $('section[data-banner-pending="1"]').toArray();
  if (pending.length === 0) return html;

  for (const element of pending) {
    const $section = $(element);
    const number = $section.attr('data-banner-number') ?? '01';
    const rawTitle = $section.attr('data-banner-title') ?? '';
    const title = rawTitle.replace(/&quot;/g, '"');

    const buffer = await renderHeadingBanner({
      partNumber: `Part.${number}`,
      title,
      spec: manifest.headingBanner,
      themesDir,
      themeName: manifest.name,
    });

    const filename = `__banner_${manifest.name}__${number}.jpg`;
    collector.set(filename, buffer);

    $section.replaceWith(
      `<section class="theme-heading-banner-wrap" data-wxgzh="image">` +
      `<img src="${filename}" alt="Part.${number} ${title.replace(/"/g, '&quot;')}" data-banner-generated="1">` +
      `</section>`
    );
  }

  return $.html();
}

