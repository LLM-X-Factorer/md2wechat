import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { ThemeCoverSpec, ThemeCoverOverlaySpec } from '../../types/index.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapByWidth(text: string, maxWidth: number, fontSize: number): string[] {
  if (!maxWidth || maxWidth <= 0) return [text];
  const approxCharWidth = fontSize * 1.05;
  const charsPerLine = Math.max(1, Math.floor(maxWidth / approxCharWidth));
  const chars = [...text];
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += charsPerLine) {
    lines.push(chars.slice(i, i + charsPerLine).join(''));
  }
  return lines;
}

function renderOverlayText(
  overlay: ThemeCoverOverlaySpec,
  value: string,
  canvasWidth: number,
  canvasHeight: number
): string {
  const size = overlay.size ?? 36;
  const color = overlay.color ?? '#000000';
  const font = overlay.font ?? "'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif";
  const weight = overlay.weight ?? 400;
  const anchor = overlay.anchor ?? 'start';
  const lines = overlay.maxWidth ? wrapByWidth(value, overlay.maxWidth, size) : [value];
  const lineHeight = Math.round(size * 1.25);

  return lines
    .map((line, index) => {
      const y = overlay.y + size + index * lineHeight;
      return `<text x="${overlay.x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-family="${escapeXml(font)}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`;
    })
    .join('');
}

export interface TemplateCoverGenerateOptions {
  title: string;
  author?: string;
  width: number;
  height: number;
  themeName: string;
  coverSpec: ThemeCoverSpec;
  fields: Record<string, string>;
}

export class TemplateCoverStrategy {
  name = 'template';
  private themesDir: string;

  constructor(themesDir: string) {
    this.themesDir = themesDir;
  }

  async generate(options: TemplateCoverGenerateOptions): Promise<Buffer> {
    const basePath = path.join(this.themesDir, options.themeName, options.coverSpec.base);
    if (!fs.existsSync(basePath)) {
      throw new Error(`Cover base image not found: ${basePath}`);
    }

    const width = options.coverSpec.width ?? options.width;
    const height = options.coverSpec.height ?? options.height;

    const base = sharp(basePath).resize(width, height, { fit: 'cover' });

    const textFragments = options.coverSpec.overlays
      .map((overlay) => {
        const raw = options.fields[overlay.field];
        if (raw === undefined || raw === null || String(raw).trim() === '') return '';
        return renderOverlayText(overlay, String(raw).trim(), width, height);
      })
      .filter(Boolean)
      .join('');

    if (!textFragments) {
      return base.jpeg({ quality: 92 }).toBuffer();
    }

    const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${textFragments}</svg>`;

    return base
      .composite([{ input: Buffer.from(svg) }])
      .jpeg({ quality: 92 })
      .toBuffer();
  }
}
