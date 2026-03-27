import fs from 'node:fs';
import path from 'node:path';
import type { CompatCssConfig, ThemeManifest } from '../../types/index.js';

const HIGHLIGHT_INLINE_CSS = `
.hljs-comment,
.hljs-quote {
  color: #6a9955;
  font-style: italic;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-literal,
.hljs-section,
.hljs-link,
.hljs-meta .hljs-keyword {
  color: #c586c0;
  font-weight: 600;
}

.hljs-string,
.hljs-regexp,
.hljs-symbol,
.hljs-bullet,
.hljs-addition,
.hljs-template-tag,
.hljs-template-variable {
  color: #ce9178;
}

.hljs-number,
.hljs-literal,
.hljs-meta,
.hljs-selector-attr,
.hljs-selector-pseudo,
.hljs-attr,
.hljs-attribute {
  color: #b5cea8;
}

.hljs-built_in,
.hljs-type,
.hljs-name,
.hljs-selector-class,
.hljs-selector-id {
  color: #4ec9b0;
}

.hljs-title,
.hljs-title.class_,
.hljs-title.class_.inherited__,
.hljs-title.function_,
.hljs-function .hljs-title,
.hljs-class .hljs-title {
  color: #dcdcaa;
}

.hljs-variable,
.hljs-params,
.hljs-operator,
.hljs-punctuation,
.hljs-subst,
.hljs-deletion,
.hljs-property {
  color: #d4d4d4;
}

.hljs-emphasis {
  font-style: italic;
}

.hljs-strong {
  font-weight: 700;
}
`;

const WECHAT_BLOCKQUOTE_INLINE_CSS = `
blockquote,
q {
  margin: 1.2em 3% !important;
  padding: 0 0 0 1em !important;
  border: 0 !important;
  border-left: 4px solid #d9d9d9 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #8c8c8c !important;
  quotes: none;
}

blockquote p,
blockquote ul,
blockquote ol,
blockquote section,
blockquote pre,
blockquote table,
q p,
q ul,
q ol,
q section,
q pre,
q table {
  margin: 0.45em 0 !important;
  color: inherit !important;
}

blockquote p:first-child,
blockquote ul:first-child,
blockquote ol:first-child,
blockquote section:first-child,
blockquote pre:first-child,
blockquote table:first-child,
q p:first-child,
q ul:first-child,
q ol:first-child,
q section:first-child,
q pre:first-child,
q table:first-child {
  margin-top: 0 !important;
}

blockquote p:last-child,
blockquote ul:last-child,
blockquote ol:last-child,
blockquote section:last-child,
blockquote pre:last-child,
blockquote table:last-child,
q p:last-child,
q ul:last-child,
q ol:last-child,
q section:last-child,
q pre:last-child,
q table:last-child {
  margin-bottom: 0 !important;
}
`;

const WECHAT_LAYOUT_INLINE_CSS = `
p,
h1,
h2,
h3,
h4,
h5,
h6,
ul,
ol,
dl,
blockquote,
q,
pre,
hr,
section.img-wrapper,
section.tbl-wrapper,
section.math-block,
section.theme-heading {
  margin-left: 0 !important;
  margin-right: 0 !important;
}

section.img-wrapper,
section.tbl-wrapper,
section.math-block {
  width: 100% !important;
  box-sizing: border-box !important;
}
`;

const WECHAT_TABLE_INLINE_CSS = `
section.tbl-wrapper {
  margin: 1.4em 3% !important;
  padding: 0 0 10px 0 !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  -webkit-overflow-scrolling: touch;
  background: transparent !important;
}

section.tbl-wrapper table {
  width: max-content !important;
  min-width: 100% !important;
  margin: 0 !important;
  border-collapse: collapse !important;
  border-spacing: 0 !important;
  table-layout: auto !important;
  background: #ffffff !important;
  font-size: 15px !important;
  line-height: 1.75 !important;
}

section.tbl-wrapper thead,
section.tbl-wrapper tbody,
section.tbl-wrapper tr {
  background: #ffffff !important;
}

section.tbl-wrapper th,
section.tbl-wrapper td {
  min-width: 120px !important;
  padding: 14px 16px !important;
  border: 1px solid #d9d9d9 !important;
  text-align: left !important;
  vertical-align: middle !important;
  white-space: nowrap !important;
}

section.tbl-wrapper th {
  background: #fafafa !important;
  color: #444444 !important;
  font-weight: 700 !important;
}

section.tbl-wrapper td {
  color: #4f638f !important;
}

section.tbl-wrapper a {
  color: #4f638f !important;
  text-decoration: none !important;
}
`;

const WECHAT_CODE_BLOCK_INLINE_CSS = `
pre {
  overflow-x: auto !important;
  overflow-y: hidden !important;
  -webkit-overflow-scrolling: touch;
}

pre code.hljs,
pre code[class*="language-"] {
  display: block !important;
  width: max-content !important;
  min-width: 100% !important;
  box-sizing: border-box !important;
  white-space: nowrap !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
  overflow: visible !important;
}

pre code.hljs *,
pre code[class*="language-"] * {
  white-space: inherit !important;
  word-break: inherit !important;
  overflow-wrap: inherit !important;
}
`;

const WECHAT_MATH_INLINE_CSS = `
span.math-inline {
  display: inline-block !important;
  max-width: 100% !important;
  margin: 0 0.12em !important;
  vertical-align: middle !important;
}

span.math-inline mjx-container {
  display: inline-block !important;
  max-width: 100% !important;
  color: #111111 !important;
  vertical-align: middle !important;
}

section.math-block {
  margin: 1.4em 3% !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  text-align: center !important;
  -webkit-overflow-scrolling: touch;
}

section.math-block mjx-container {
  display: inline-block !important;
  min-width: min-content !important;
  color: #111111 !important;
}

section.math-block mjx-container > svg,
span.math-inline mjx-container > svg {
  display: block !important;
}
`;

export function getDefaultCompatCss(): CompatCssConfig {
  return {
    highlight: HIGHLIGHT_INLINE_CSS,
    blockquote: WECHAT_BLOCKQUOTE_INLINE_CSS,
    table: WECHAT_TABLE_INLINE_CSS,
    codeBlock: WECHAT_CODE_BLOCK_INLINE_CSS,
    math: WECHAT_MATH_INLINE_CSS,
    layout: WECHAT_LAYOUT_INLINE_CSS,
  };
}

export function loadThemeCompatOverrides(
  themesDir: string,
  themeName: string
): Partial<CompatCssConfig> {
  const themeDir = path.join(themesDir, themeName);
  const manifestPath = path.join(themeDir, 'theme.json');
  const compatPath = path.join(themeDir, 'compat.css');

  if (!fs.existsSync(manifestPath)) return {};

  let manifest: ThemeManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return {};
  }

  if (!manifest.compatOverrides || !fs.existsSync(compatPath)) return {};

  const compatCss = fs.readFileSync(compatPath, 'utf8');
  const overrides: Partial<CompatCssConfig> = {};

  for (const [key, enabled] of Object.entries(manifest.compatOverrides)) {
    if (enabled) {
      overrides[key as keyof CompatCssConfig] = compatCss;
    }
  }

  return overrides;
}

export function getCompatCss(overrides?: Partial<CompatCssConfig>): string {
  const defaults = getDefaultCompatCss();
  const merged = { ...defaults, ...overrides };
  return Object.values(merged).join('\n');
}
