import fs from 'node:fs';
import path from 'node:path';
import { inline } from '@css-inline/css-inline';
import * as cheerio from 'cheerio';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import mathjax3 from 'markdown-it-mathjax3';
import { getCompatCss, loadThemeCompatOverrides } from './css/compat.js';
import type { ArticleMetadata, HeadingStyle, ThemeInfo, ThemeManifest } from '../types/index.js';

const LANGUAGE_ALIASES: Record<string, string | null> = {
  'c#': 'csharp',
  'c++': 'cpp',
  bash: 'bash',
  console: 'bash',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  py3: 'python',
  python3: 'python',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  text: null,
  plaintext: null,
  txt: null,
  ts: 'typescript',
  tsx: 'typescript',
  yml: 'yaml',
  zsh: 'bash',
};

const VOID_HTML_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function resolveHighlightLanguage(language: string): string | null {
  const raw = language.trim().toLowerCase();
  if (!raw) return '';
  const token = raw
    .replace(/^[{[]|[}\]]$/g, '')
    .replace(/^language-/, '')
    .replace(/^lang-/, '')
    .split(/[\s,{]/, 1)[0]
    ?.trim();
  if (!token) return '';
  if (Object.prototype.hasOwnProperty.call(LANGUAGE_ALIASES, token)) {
    return LANGUAGE_ALIASES[token]!;
  }
  return token;
}

function renderHighlightedCode(code: string, language: string): string {
  const normalized = resolveHighlightLanguage(language);
  if (normalized === null) return escapeHtml(code);
  if (normalized && hljs.getLanguage(normalized)) {
    return hljs.highlight(code, { language: normalized }).value;
  }
  return hljs.highlightAuto(code).value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}

function createMarkdownEngine(configDir: string): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    highlight(code: string, language: string): string {
      const normalized = resolveHighlightLanguage(language);
      const highlighted = renderHighlightedCode(code, language);
      const languageClass = normalized ? ` language-${normalized}` : '';
      return `<pre><code class="hljs${languageClass}">${highlighted}</code></pre>`;
    },
  });

  md.use(mathjax3);

  // Load user plugins from config directory
  const pluginConfigPath = path.join(configDir, 'markdown-plugins.js');
  if (fs.existsSync(pluginConfigPath)) {
    try {
      const plugins = require(pluginConfigPath) as Array<[MarkdownIt.PluginSimple, ...unknown[]]>;
      plugins.forEach(([plugin, ...args]) => md.use(plugin, ...args));
    } catch {
      // Silently ignore plugin loading errors
    }
  }

  return md;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function isTextNodeEmpty(node: any): boolean {
  return node.type === 'text' && !node.data?.trim();
}

function isTagNode(node: any, tagName: string): boolean {
  return node.type === 'tag' && node.tagName?.toLowerCase() === tagName;
}

function isStandaloneImageParagraph($: cheerio.CheerioAPI, $paragraph: any): boolean {
  const nodes = $paragraph.contents().toArray().filter((node: any) => !isTextNodeEmpty(node));
  return nodes.every(
    (node: any) => node.type === 'tag' && ['img', 'br'].includes(node.tagName?.toLowerCase())
  );
}

function renderSoftBreakFriendlyHtml(nodes: any[], preserveSoftBreak = true): string {
  return nodes.map((node: any) => renderSoftBreakFriendlyNode(node, preserveSoftBreak)).join('');
}

function renderSoftBreakFriendlyNode(node: any, preserveSoftBreak: boolean): string {
  if (node.type === 'text') {
    return renderSoftBreakFriendlyText(node, preserveSoftBreak);
  }
  if (node.type !== 'tag') return '';
  const tagName = node.tagName.toLowerCase();
  const attributes = Object.entries(node.attribs ?? {})
    .map(([key, value]) => ` ${key}="${escapeHtmlAttribute(String(value))}"`)
    .join('');
  if (VOID_HTML_TAGS.has(tagName)) return `<${tagName}${attributes}>`;
  const nextPreserve = preserveSoftBreak && !['code', 'pre'].includes(tagName);
  const children = renderSoftBreakFriendlyHtml(node.children ?? [], nextPreserve);
  return `<${tagName}${attributes}>${children}</${tagName}>`;
}

function renderSoftBreakFriendlyText(node: any, preserveSoftBreak: boolean): string {
  const normalized = (node.data ?? '').replace(/\r\n?/g, '\n');
  if (!preserveSoftBreak || !normalized.includes('\n')) return escapeHtml(normalized);
  return normalized.split('\n').map((s: string) => escapeHtml(s)).join('<br>');
}

function normalizeListItems($: cheerio.CheerioAPI): void {
  $('li').each((_, element) => {
    const $item = $(element);
    const initialChildren = $item.contents().toArray();
    const hasParagraphChild = initialChildren.some((node) => isTagNode(node as any, 'p'));

    if (hasParagraphChild) {
      const fragments: string[] = [];
      let previousWasParagraph = false;
      for (const node of initialChildren) {
        if (isTextNodeEmpty(node as any)) continue;
        if (isTagNode(node as any, 'p')) {
          const paragraphHtml = renderSoftBreakFriendlyHtml(
            (node as any).children ?? []
          );
          if (!paragraphHtml.trim()) continue;
          if (previousWasParagraph) fragments.push('<br>');
          fragments.push(paragraphHtml);
          previousWasParagraph = true;
          continue;
        }
        fragments.push(renderSoftBreakFriendlyNode(node, true));
        previousWasParagraph = false;
      }
      $item.html(fragments.join(''));
    }

    const childElements = $item.contents().toArray().filter((n) => !isTextNodeEmpty(n as any));
    if (childElements.length === 0) return;

    const hasBlockChild = childElements.some((node) => {
      if (node.type !== 'tag') return false;
      return ['p', 'ul', 'ol', 'section', 'blockquote', 'pre', 'table'].includes(
        node.tagName.toLowerCase()
      );
    });

    const firstChild = childElements[0]!;
    if (
      !hasBlockChild &&
      isTagNode(firstChild as any, 'span') &&
      childElements.length === 1
    ) return;
    if (hasBlockChild) return;

    $item.html(`<span>${$item.html() ?? ''}</span>`);
  });
}

function normalizeImages($: cheerio.CheerioAPI): void {
  $('img').each((_, element) => {
    const $image = $(element);
    const parent = $image.parent();
    const parentTag = parent.get(0)?.type === 'tag'
      ? (parent.get(0) as any).tagName.toLowerCase()
      : undefined;

    if (parentTag === 'section' && parent.attr('data-wxgzh') === 'image') {
      parent.addClass('img-wrapper');
      return;
    }

    if (parentTag === 'p') {
      if (isStandaloneImageParagraph($, parent as any)) {
        parent.replaceWith(
          `<section class="img-wrapper" data-wxgzh="image">${$.html($image)}</section>`
        );
      } else {
        $image.wrap('<section class="img-wrapper" data-wxgzh="image"></section>');
      }
      return;
    }

    $image.wrap('<section class="img-wrapper" data-wxgzh="image"></section>');
  });
}

function normalizeTables($: cheerio.CheerioAPI): void {
  $('table').each((_, element) => {
    const $table = $(element);
    const parent = $table.parent();
    const parentTag = parent.get(0)?.type === 'tag'
      ? (parent.get(0) as any).tagName.toLowerCase()
      : undefined;

    if (parentTag === 'section' && parent.attr('data-wxgzh') === 'table') {
      parent.addClass('tbl-wrapper');
      return;
    }

    $table.wrap('<section class="tbl-wrapper" data-wxgzh="table"></section>');
  });
}

function normalizeBlockquoteSoftBreaks($: cheerio.CheerioAPI): void {
  $('blockquote p, q p').each((_, element) => {
    const paragraph = element as any;
    $(paragraph).html(renderSoftBreakFriendlyHtml(paragraph.children ?? []));
  });
}

function normalizeMathFormulas($: cheerio.CheerioAPI): void {
  $('span[id^="mjx-"]').each((_, element) => {
    const $wrapper = $(element);
    const $container = $wrapper.find('mjx-container').first();
    if ($container.length === 0) return;
    $wrapper.find('style, mjx-assistive-mml').remove();
    const isDisplay = $container.attr('display') === 'true';
    $container.removeAttr('style');
    if (isDisplay) {
      $wrapper.replaceWith(
        `<section class="math-block" data-wxgzh="math-block">${$.html($container)}</section>`
      );
      return;
    }
    $wrapper.replaceWith(
      `<span class="math-inline" data-wxgzh="math-inline">${$.html($container)}</span>`
    );
  });

  $('section > eqn').each((_, element) => {
    const $eqn = $(element);
    const $container = $eqn.find('mjx-container').first();
    if ($container.length === 0) return;
    $eqn.find('style, mjx-assistive-mml').remove();
    $container.removeAttr('style');
    $eqn.replaceWith(
      `<section class="math-block" data-wxgzh="math-block">${$.html($container)}</section>`
    );
  });

  $('eq').each((_, element) => {
    const $eq = $(element);
    const $container = $eq.find('mjx-container').first();
    if ($container.length === 0) return;
    $eq.find('style, mjx-assistive-mml').remove();
    $container.removeAttr('style');
    $eq.replaceWith(
      `<span class="math-inline" data-wxgzh="math-inline">${$.html($container)}</span>`
    );
  });
}

// Inline style helpers
function parseInlineStyle(existingStyle: string | undefined): Map<string, string> {
  const entries = new Map<string, string>();
  if (!existingStyle) return entries;
  for (const declaration of existingStyle.split(';')) {
    const trimmed = declaration.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!name || !value) continue;
    entries.set(name, value);
  }
  return entries;
}

function stringifyInlineStyle(entries: Map<string, string>): string | undefined {
  if (entries.size === 0) return undefined;
  return Array.from(entries.entries())
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ');
}

function setInlineStyleProperty(existingStyle: string | undefined, property: string, value: string): string {
  const entries = parseInlineStyle(existingStyle);
  entries.set(property, value);
  return stringifyInlineStyle(entries) ?? '';
}

function removeInlineStyleProperties(existingStyle: string | undefined, properties: string[]): string | undefined {
  const entries = parseInlineStyle(existingStyle);
  const toRemove = new Set(properties.map((p) => p.trim().toLowerCase()).filter(Boolean));
  for (const name of Array.from(entries.keys())) {
    if (toRemove.has(name.toLowerCase())) entries.delete(name);
  }
  return stringifyInlineStyle(entries);
}

function getInlineStyleProperty(existingStyle: string | undefined, property: string): string | undefined {
  const entries = parseInlineStyle(existingStyle);
  for (const [name, value] of entries.entries()) {
    if (name.trim().toLowerCase() === property.trim().toLowerCase()) return value;
  }
  return undefined;
}

function normalizeInlinedListStyles($: cheerio.CheerioAPI): void {
  $('ol').each((_, element) => {
    const $list = $(element);
    const depth = $list.parents('ol').length;
    const cleanedStyle = removeInlineStyleProperties($list.attr('style'), [
      'list-style', 'list-style-type', 'list-style-position',
    ]);
    const listType = depth === 0 ? '1' : depth === 1 ? 'a' : 'i';
    if (cleanedStyle) $list.attr('style', cleanedStyle);
    else $list.removeAttr('style');
    $list.attr('type', listType);
  });

  $('ul').each((_, element) => {
    const $list = $(element);
    const cleanedStyle = removeInlineStyleProperties($list.attr('style'), [
      'list-style', 'list-style-type', 'list-style-position',
    ]);
    if (cleanedStyle) $list.attr('style', cleanedStyle);
    else $list.removeAttr('style');
  });

  $('ol > li, ul > li').each((_, element) => {
    const $item = $(element);
    const cleanedStyle = removeInlineStyleProperties($item.attr('style'), [
      'list-style', 'list-style-type', 'list-style-position',
    ]);
    if (cleanedStyle) $item.attr('style', cleanedStyle);
    else $item.removeAttr('style');
  });
}

function removeWechatUnsafeListWhitespace($: cheerio.CheerioAPI): void {
  $('ol, ul').each((_, element) => {
    $(element)
      .contents()
      .toArray()
      .filter((node) => isTextNodeEmpty(node as any))
      .forEach((node) => $(node).remove());
  });
}

function renderWechatFriendlyCodeHtml(nodes: any[]): string {
  return nodes.map((node: any) => renderWechatFriendlyCodeNode(node)).join('');
}

function renderWechatFriendlyCodeNode(node: any): string {
  if (node.type === 'text') return renderWechatFriendlyCodeText(node);
  if (node.type !== 'tag') return '';
  const attributes = Object.entries(node.attribs ?? {})
    .map(([key, value]) => ` ${key}="${escapeHtmlAttribute(String(value))}"`)
    .join('');
  const children = renderWechatFriendlyCodeHtml(node.children ?? []);
  return `<${node.tagName}${attributes}>${children}</${node.tagName}>`;
}

function renderWechatFriendlyCodeText(node: any): string {
  const normalized = (node.data ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  let result = '';
  for (const char of normalized) {
    if (char === '\n') { result += '<br>'; continue; }
    if (char === ' ') { result += '&nbsp;'; continue; }
    result += escapeHtml(char);
  }
  return result;
}

function normalizeWechatCodeBlocks($: cheerio.CheerioAPI): void {
  const backgroundStyleProperties = [
    'background', 'background-color', 'background-image',
    'background-repeat', 'background-position', 'background-size',
  ];
  const codeStyleProperties = [
    ...backgroundStyleProperties,
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-color', 'border-style', 'border-width', 'border-radius',
    'box-shadow', 'padding', 'padding-top', 'padding-right',
    'padding-bottom', 'padding-left',
  ];
  const wrapperStyleProperties = [
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  ];

  $('pre').each((_, element) => {
    const $pre = $(element);
    const $code = $pre.children('code').first();
    if ($code.length === 0) return;

    if (!$pre.parent().is('section.code-block-wrapper')) {
      $pre.wrap('<section class="code-block-wrapper"></section>');
    }

    const $wrapper = $pre.parent();
    const codeStyle = $code.attr('style');
    const preStyle = $pre.attr('style');

    for (const property of wrapperStyleProperties) {
      const value = getInlineStyleProperty(codeStyle, property) ?? getInlineStyleProperty(preStyle, property);
      if (!value) continue;
      $wrapper.attr('style', setInlineStyleProperty($wrapper.attr('style'), property, value));
    }
    $wrapper.attr('style', setInlineStyleProperty($wrapper.attr('style'), 'display', 'block !important'));
    $wrapper.attr('style', setInlineStyleProperty($wrapper.attr('style'), 'overflow-x', 'auto !important'));
    $wrapper.attr('style', setInlineStyleProperty($wrapper.attr('style'), 'overflow-y', 'hidden !important'));
    $wrapper.attr('style', setInlineStyleProperty($wrapper.attr('style'), '-webkit-overflow-scrolling', 'touch'));

    for (const property of codeStyleProperties) {
      const value = getInlineStyleProperty(codeStyle, property);
      if (!value) continue;
      $pre.attr('style', setInlineStyleProperty($pre.attr('style'), property, value));
    }
    $pre.attr('style', removeInlineStyleProperties($pre.attr('style'), wrapperStyleProperties));
    $pre.attr('style', setInlineStyleProperty($pre.attr('style'), 'display', 'inline-block !important'));
    $pre.attr('style', setInlineStyleProperty($pre.attr('style'), 'width', 'max-content !important'));
    $pre.attr('style', setInlineStyleProperty($pre.attr('style'), 'min-width', '100% !important'));
    $pre.attr('style', setInlineStyleProperty($pre.attr('style'), 'max-width', 'none !important'));
    $pre.attr('style', setInlineStyleProperty($pre.attr('style'), 'box-sizing', 'border-box !important'));
    $pre.attr('style', setInlineStyleProperty($pre.attr('style'), 'white-space', 'normal !important'));
    $pre.attr('style', setInlineStyleProperty($pre.attr('style'), 'word-break', 'normal !important'));
    $pre.attr('style', setInlineStyleProperty($pre.attr('style'), 'overflow', 'visible !important'));
    $pre.attr('style', setInlineStyleProperty($pre.attr('style'), 'vertical-align', 'top !important'));

    $code.attr('style', removeInlineStyleProperties($code.attr('style'), [...codeStyleProperties, ...wrapperStyleProperties]));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'display', 'inline-block !important'));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'width', 'max-content !important'));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'min-width', '100% !important'));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'max-width', 'none !important'));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'white-space', 'nowrap !important'));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'word-break', 'normal !important'));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'overflow-wrap', 'normal !important'));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'border', '0 !important'));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'border-radius', '0 !important'));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'padding', '0 !important'));
    $code.attr('style', setInlineStyleProperty($code.attr('style'), 'margin', '0 !important'));

    for (const property of backgroundStyleProperties) {
      const value = getInlineStyleProperty(codeStyle, property) ?? getInlineStyleProperty(preStyle, property);
      if (!value) continue;
      $code.attr('style', setInlineStyleProperty($code.attr('style'), property, value));
    }
  });
}

function cleanInlinedHtml(html: string): string {
  const $ = cheerio.load(html);

  $('pre > code').each((_, element) => {
    const $element = $(element);
    $element.html(renderWechatFriendlyCodeHtml($element.contents().toArray()));
  });

  normalizeInlinedListStyles($);
  removeWechatUnsafeListWhitespace($);
  normalizeWechatCodeBlocks($);

  const $article = $('body > #write > article').first();
  const $firstChild = $article.children().first();
  if ($firstChild.length > 0) {
    $firstChild.attr('style', setInlineStyleProperty($firstChild.attr('style'), 'margin-top', '0 !important'));
  }

  $('style').remove();
  return $.html();
}

function createMetadataTags(metadata: ArticleMetadata): string {
  const entries = Object.entries(metadata).filter(([, value]) => {
    if (value === undefined || value === null) return false;
    return ['string', 'number', 'boolean'].includes(typeof value);
  });
  return entries
    .map(([key, value]) => `<meta name="wxgzh:${key}" content="${escapeHtmlAttribute(String(value))}">`)
    .join('\n');
}

function createDocumentHtml(content: string, metadata: ArticleMetadata): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="UTF-8">',
    `  <title>${escapeHtmlAttribute(metadata.title ?? 'md2wechat article')}</title>`,
    `  ${createMetadataTags(metadata)}`,
    '</head>',
    '<body>',
    `  <div id="write" class="wrapper"><article>${content}</article></div>`,
    '</body>',
    '</html>',
  ].join('\n');
}

// Theme CSS loading
function getBuiltinThemesDir(): string {
  return path.resolve(__dirname, 'css/themes');
}

function getBuiltinThemes(): string[] {
  try {
    return fs.readdirSync(getBuiltinThemesDir())
      .filter((f) => f.endsWith('.css') && f !== 'custom.css')
      .map((f) => f.replace('.css', ''))
      .sort();
  } catch {
    return ['default'];
  }
}

function isValidBuiltinTheme(theme: string): boolean {
  return getBuiltinThemes().includes(theme);
}

function loadThemeCss(theme: string | undefined, themesDir: string): string {
  const resolvedTheme = (theme ?? 'default').trim() || 'default';

  // Check custom themes directory first
  const customThemeCssPath = path.join(themesDir, resolvedTheme, 'theme.css');
  if (fs.existsSync(customThemeCssPath)) {
    return fs.readFileSync(customThemeCssPath, 'utf8');
  }

  // Fall back to builtin themes
  const builtinTheme = isValidBuiltinTheme(resolvedTheme) ? resolvedTheme : 'default';
  const builtinPath = path.join(getBuiltinThemesDir(), `${builtinTheme}.css`);
  try {
    return fs.readFileSync(builtinPath, 'utf8');
  } catch {
    return '';
  }
}

function loadThemeManifest(themesDir: string, theme: string | undefined): ThemeManifest | undefined {
  const resolvedTheme = (theme ?? '').trim();
  if (!resolvedTheme) return undefined;
  const manifestPath = path.join(themesDir, resolvedTheme, 'theme.json');
  if (!fs.existsSync(manifestPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return undefined;
  }
}

const CHINESE_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

const EXAM_CARD_STRONG_REGEX = /(大学|学院|学校)/;

const BACKGROUND_LABELS: Array<[string, string]> = [
  ['school', '学校 / 专业'],
  ['rank', '成绩排名'],
  ['english', '英语成绩'],
  ['research', '科研'],
  ['awards', '获奖'],
  ['summerCamps', '夏令营'],
  ['prePromotion', '预推免'],
  ['offers', 'Offer'],
  ['final', '最终去向'],
  ['mentor', '保研辅导'],
];

function renderBackgroundTable(background: Record<string, string>): string {
  const rows = BACKGROUND_LABELS
    .filter(([key]) => background[key] && background[key].trim())
    .map(([key, label]) => {
      const value = escapeHtml(background[key]!.trim());
      return (
        `<tr>` +
        `<th style="width:32%;padding:8px 10px;background:#f5f5f5;color:#555;font-weight:600;text-align:left;border:1px solid #e5e5e5;">${label}</th>` +
        `<td style="padding:8px 10px;color:#333;border:1px solid #e5e5e5;">${value}</td>` +
        `</tr>`
      );
    })
    .join('');
  if (!rows) return '';
  return (
    `<section class="tbl-wrapper student-share-bg-table-wrap" data-wxgzh="table" style="margin:16px 0 20px 0;">` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;"><tbody>${rows}</tbody></table>` +
    `</section>`
  );
}

function applyThemeClassifiers($: cheerio.CheerioAPI, manifest: ThemeManifest | undefined): void {
  if (manifest?.name !== 'student-share') return;

  $('blockquote').each((_, element) => {
    const $bq = $(element);
    const $firstStrong = $bq.find('strong').first();
    if ($firstStrong.length === 0) return;
    if (!EXAM_CARD_STRONG_REGEX.test($firstStrong.text())) return;

    const existing = ($bq.attr('class') ?? '').split(/\s+/).filter(Boolean);
    if (existing.includes('exam-card')) return;
    existing.push('exam-card');
    $bq.attr('class', existing.join(' '));
  });
}

function transformHeadings(
  $: cheerio.CheerioAPI,
  headingStyle: HeadingStyle,
  bannerEnabled: boolean,
  part1AvatarSeed?: string,
  part1Background?: Record<string, string>
): void {
  if (headingStyle === 'default') return;

  let h2Index = 0;
  $('h2').each((_, element) => {
    const $h2 = $(element);
    const text = $h2.text().trim();
    h2Index++;

    if (headingStyle === 'part-number') {
      const num = String(h2Index).padStart(2, '0');
      const avatarPlaceholder = h2Index === 1 && part1AvatarSeed !== undefined
        ? `<section class="student-share-avatar-pending" data-avatar-pending="1" data-avatar-seed="${part1AvatarSeed.replace(/"/g, '&quot;')}"></section>`
        : '';
      const backgroundTable = h2Index === 1 && part1Background
        ? renderBackgroundTable(part1Background)
        : '';
      if (bannerEnabled) {
        $h2.replaceWith(
          `<section class="theme-heading theme-heading-banner" data-wxgzh="heading" data-banner-pending="1" data-banner-number="${num}" data-banner-title="${text.replace(/"/g, '&quot;')}">` +
          `<section class="theme-heading-number">` +
          `<span class="theme-heading-part">Part.</span>` +
          `<span class="theme-heading-num">${num}</span>` +
          `</section>` +
          `<h2 class="theme-heading-title">${text}</h2>` +
          `</section>` +
          avatarPlaceholder +
          backgroundTable
        );
      } else {
        $h2.replaceWith(
          `<section class="theme-heading" data-wxgzh="heading">` +
          `<section class="theme-heading-number">` +
          `<span class="theme-heading-part">Part.</span>` +
          `<span class="theme-heading-num">${num}</span>` +
          `</section>` +
          `<h2 class="theme-heading-title">${text}</h2>` +
          `</section>` +
          avatarPlaceholder +
          backgroundTable
        );
      }
    } else if (headingStyle === 'chinese-number') {
      const label = CHINESE_NUMBERS[h2Index - 1] ?? String(h2Index);
      $h2.replaceWith(
        `<section class="theme-heading" data-wxgzh="heading">` +
        `<h2 class="theme-heading-title">第${label}部分：${text}</h2>` +
        `</section>`
      );
    }
  });
}

function loadCustomCss(themesDir: string): string {
  const customCssPath = path.join(getBuiltinThemesDir(), 'custom.css');
  try {
    return fs.readFileSync(customCssPath, 'utf8');
  } catch {
    return '';
  }
}

export interface ConverterOptions {
  configDir: string;
  themesDir: string;
}

let cachedMarkdown: MarkdownIt | null = null;
let cachedConfigDir: string | null = null;

function getMarkdownEngine(configDir: string): MarkdownIt {
  if (cachedMarkdown && cachedConfigDir === configDir) return cachedMarkdown;
  cachedMarkdown = createMarkdownEngine(configDir);
  cachedConfigDir = configDir;
  return cachedMarkdown;
}

export function renderMarkdownToHtml(
  body: string,
  metadata: ArticleMetadata,
  options: ConverterOptions
): string {
  const md = getMarkdownEngine(options.configDir);
  const content = md.render(body);
  const $ = cheerio.load(`<article>${content}</article>`);

  normalizeListItems($);
  normalizeImages($);
  normalizeTables($);
  normalizeBlockquoteSoftBreaks($);
  normalizeMathFormulas($);

  const manifest = loadThemeManifest(options.themesDir, metadata.theme);
  const headingStyle = manifest?.headingStyle ?? 'default';
  const bannerEnabled = !!manifest?.headingBanner?.enabled && headingStyle === 'part-number';
  const isStudentSharePart1 = manifest?.name === 'student-share' && headingStyle === 'part-number';
  const part1AvatarSeed = isStudentSharePart1
    ? `${metadata.theme ?? ''}|${metadata.title ?? ''}|${metadata.author ?? ''}`
    : undefined;
  const part1Background = isStudentSharePart1 ? metadata.background : undefined;
  transformHeadings($, headingStyle, bannerEnabled, part1AvatarSeed, part1Background);
  applyThemeClassifiers($, manifest);

  const themeCss = loadThemeCss(metadata.theme, options.themesDir);
  const customCss = loadCustomCss(options.themesDir);

  // Load compat overrides if this is a custom theme
  const compatOverrides = metadata.theme
    ? loadThemeCompatOverrides(options.themesDir, metadata.theme)
    : undefined;
  const compatCss = getCompatCss(compatOverrides);

  const articleHtml = $('article').html() ?? '';
  const baseHtml = createDocumentHtml(articleHtml, metadata);

  const inlinedHtml = inline(baseHtml, {
    extraCss: `${themeCss}\n${compatCss}\n${customCss}`,
    keepAtRules: true,
    applyWidthAttributes: false,
    applyHeightAttributes: false,
  });

  return cleanInlinedHtml(inlinedHtml);
}

export function extractPublishableContent(html: string): string {
  const $ = cheerio.load(html);

  // Remove all data-* attributes (data-wxgzh, data-original-src, etc.)
  // WeChat's content filter may strip or flag elements with unknown data attributes
  $('[data-wxgzh]').removeAttr('data-wxgzh');
  $('[data-original-src]').removeAttr('data-original-src');

  const articleHtml = $('body > #write > article').first().html();
  if (typeof articleHtml === 'string' && articleHtml.trim()) return articleHtml.trim();
  const bodyHtml = $('body').html();
  if (typeof bodyHtml === 'string' && bodyHtml.trim()) return bodyHtml.trim();
  return html.trim();
}

export function listBuiltinThemes(): string[] {
  return getBuiltinThemes();
}

export function listCustomThemes(themesDir: string): string[] {
  try {
    return fs.readdirSync(themesDir)
      .filter((entry) => {
        const manifestPath = path.join(themesDir, entry, 'theme.json');
        return fs.existsSync(manifestPath);
      })
      .sort();
  } catch {
    return [];
  }
}

export function listCustomThemeDetails(themesDir: string): ThemeInfo[] {
  try {
    return fs.readdirSync(themesDir)
      .filter((entry) => {
        const manifestPath = path.join(themesDir, entry, 'theme.json');
        return fs.existsSync(manifestPath);
      })
      .map((entry) => {
        const manifestPath = path.join(themesDir, entry, 'theme.json');
        const templatePath = path.join(themesDir, entry, 'template.md');
        try {
          const manifest: ThemeManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          return {
            name: manifest.name || entry,
            displayName: manifest.displayName || entry,
            description: manifest.description,
            category: manifest.category,
            headingStyle: manifest.headingStyle,
            hasTemplate: fs.existsSync(templatePath),
          };
        } catch {
          return {
            name: entry,
            displayName: entry,
            hasTemplate: fs.existsSync(templatePath),
          };
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function getThemeTemplatePath(themesDir: string, themeName: string): string | null {
  const templatePath = path.join(themesDir, themeName, 'template.md');
  return fs.existsSync(templatePath) ? templatePath : null;
}
