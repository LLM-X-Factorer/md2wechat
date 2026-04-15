import sharp from 'sharp';
import * as cheerio from 'cheerio';
import type { ThemeManifest } from '../types/index.js';

const AVATAR_PALETTES: Array<[string, string]> = [
  ['#FF9AA2', '#FFDAC1'],
  ['#B5EAD7', '#C7CEEA'],
  ['#FFB7B2', '#E2F0CB'],
  ['#A8DADC', '#457B9D'],
  ['#F6BD60', '#F7EDE2'],
  ['#84A59D', '#F28482'],
  ['#E07A5F', '#3D405B'],
  ['#90E0EF', '#CAF0F8'],
  ['#FDCDAC', '#CBD5E8'],
  ['#F4CAE4', '#E6F5C9'],
];

function seedToIndex(seed: string): number {
  let hash = 0;
  for (const ch of seed) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % AVATAR_PALETTES.length;
}

export async function renderAvatar(seed: string): Promise<Buffer> {
  const idx = seedToIndex(seed || String(Date.now()));
  const [c1, c2] = AVATAR_PALETTES[idx]!;
  const size = 256;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="65%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </radialGradient>
  </defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="url(#g)"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function processAvatarPlaceholders(
  html: string,
  manifest: ThemeManifest | undefined,
  collector: Map<string, Buffer>
): Promise<string> {
  if (manifest?.name !== 'student-share') return html;

  const $ = cheerio.load(html);
  const pending = $('section[data-avatar-pending="1"]').toArray();
  if (pending.length === 0) return html;

  for (const element of pending) {
    const $section = $(element);
    const seed = $section.attr('data-avatar-seed') ?? '';
    const buffer = await renderAvatar(seed);
    const idx = seedToIndex(seed || String(Date.now()));
    const filename = `__avatar_${manifest.name}__${idx}.png`;
    collector.set(filename, buffer);

    $section.replaceWith(
      `<section class="student-share-avatar" data-wxgzh="image" style="text-align:center;margin:24px 0 16px 0;">` +
      `<img src="${filename}" alt="头像" data-avatar-generated="1" style="width:120px;height:120px;border-radius:50%;display:inline-block;">` +
      `</section>`
    );
  }

  return $.html();
}
