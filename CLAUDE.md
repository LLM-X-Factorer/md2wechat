# md2wechat

Markdown → 微信公众号草稿箱，自托管 HTTP 微服务。

## Tech Stack

- TypeScript (CommonJS, ES2022 target, strict mode)
- Fastify v5 web framework
- markdown-it + cheerio + @css-inline for HTML processing
- sharp for cover image compositing, Google Imagen 4 for AI covers
- Kysely + better-sqlite3 (default) / pg (PostgreSQL)
- Docker multi-stage build, Alpine Linux runtime (China mirrors for apk/npm)

## Project Structure

```
src/
  core/
    parser.ts, converter.ts, fixer.ts         # markdown → HTML pipeline
    themeAssets.ts                            # autoInject + theme static asset resolution
    banner.ts                                 # async heading banner (Part.XX) renderer
    avatar.ts                                 # Part.01 circular avatar generator (SVG→PNG, 10 palettes)
    cover/
      strategy.ts, sharp-strategy.ts          # background + title SVG composite
      ai-strategy.ts                          # Google Imagen 4
      template-strategy.ts                    # theme base image + SVG masks/overlays from coverFields
    wechat.ts, auth.ts, css/
  services/   # pipeline orchestration, database, publish records, webhook, fileManager
  routes/     # HTTP endpoints (publish, preview, history, health, themes, config, static)
  types/      # TypeScript interfaces (HeadingStyle, ThemeInfo, ThemeManifest, ThemeCoverSpec…)
  index.ts    # Server entry point
themes/       # Custom themes (CSS + template.md + theme.json + assets/)
  paperweekly/    # 论文解读 (headingStyle: part-number)
  student-share/  # 学员经验分享 (part-number + template cover + heading banner + autoInject)
  values/         # 价值观人物 (chinese-number + autoInject)
assets/
  backgrounds/    # Built-in background images for sharp cover strategy
public/       # Web UI (SPA)
config/       # User markdown plugins
```

## Commands

```bash
npm run build     # TypeScript compile (CSS files need manual copy: cp src/core/css/themes/*.css dist/core/css/themes/)
npm run dev       # Development with ts-node
npm start         # Production (requires build first)
```

## Key Patterns

- `PublishPipeline` split into `prepare()` (parse → autoInject → render → banner → avatar → themeAssets → cover gen) and `execute()` (fix/upload → createDraft → persist → webhook). `/api/preview` reuses `prepare()` to return HTML+cover without touching WeChat API.
- Pipeline order inside `prepare()`: parse → **autoInject** → render → **banner** → **avatar** → **theme assets** → cover gen
  - autoInject prepends `theme.autoInject.header` GIF and appends `theme.autoInject.footerMarkdown` before render
  - `converter.applyThemeClassifiers` (student-share only) adds `class=exam-card` to blockquotes whose first `<strong>` matches 大学/学院/学校 — must run BEFORE CSS inlining so `.exam-card` rules get inlined
  - banner walks heading placeholders marked `data-banner-pending` and async-renders 1123×437 JPEG via sharp+SVG; buffers collected for fixer upload
  - avatar (student-share only) replaces `data-avatar-pending` placeholder after Part.01 heading with 256×256 PNG (seed = theme|title|author, picks one of 10 radial-gradient palettes)
  - theme assets rewrites `<img src="assets/...">` to synthetic filenames and loads buffers for fixer upload
- Strategy pattern for cover: `sharp` (random bg) / `ai` (Imagen 4) / `template` (theme base image + SVG masks/overlays driven by `coverFields` frontmatter)
- Theme manifest extensions (`theme.json`):
  - `headingStyle` — `part-number` / `chinese-number` / `default`
  - `autoInject.header` — relative path under `assets/` for opening card
  - `autoInject.footerMarkdown` — relative path to `footer.md` appended as rendered markdown
  - `cover.type: "template"` — requires `base` + `overlays[]` + optional `masks[]` (rects to cover baked-in text)
  - `headingBanner.enabled` — when true, every H2 in `part-number` mode becomes a generated banner image
- Graceful degradation: `template` cover failure or missing fields → `sharp`; AI failure → `sharp`
- In-memory processing, no temp file I/O during pipeline
- CSS inlining for WeChat compatibility
- Non-blocking webhooks and database errors

## Authentication

- Cookie-based auth (HttpOnly + SameSite=Strict), enabled when `API_KEY` env is set
- Auth module: src/core/auth.ts
- Login/logout/auth-check: /api/console-login, /api/console-logout, /api/console-auth
- Unauthenticated HTML requests → server-rendered login page
- Unauthenticated API requests → 401
- /health always accessible without auth

## API Endpoints

- POST /api/publish — publish markdown article to WeChat draft
- POST /api/preview — same multipart input as publish; returns rendered HTML (local images inlined as data URIs) + cover data URI + theme/coverStrategy/bannerCount/imageCount, without calling WeChat API
- GET /api/themes — list all themes with metadata (displayName, description, category)
- GET /api/themes/:name/template — download theme writing template
- GET /api/history — paginated publish history
- GET /api/config — masked config summary
- GET /health — service health check
- POST /api/console-login — password login (returns HttpOnly cookie)
- POST /api/console-logout — clear session cookie
- GET /api/console-auth — check auth status

## Deployment

- CI/CD: GitHub Actions → SSH to Lighthouse → git pull + docker compose up --build
- Deploy workflow: .github/workflows/deploy.yml (push to main triggers deploy)
- Server: Tencent Cloud Lighthouse (43.139.146.170:3000)
- Required env: WXGZH_APPID, WXGZH_APPSECRET
- Optional: IMAGEN_API_KEY, DATABASE_URL, API_KEY, WEBHOOK_URL
- Repo: github.com/LLM-X-Factorer/md2wechat

## Frontmatter Schema

Basic fields: `title`, `author`, `digest`, `theme`, `cover`, `enableComment`.

Theme-specific:
- `coverFields: { <field>: <string> }` — consumed by `template` cover strategy; keys must match `cover.overlays[].field` in the manifest. Example for `student-share`: `coverFields: { tagline: "双非 SE 保研北航" }`.
- `background: { school, rank, english, research, awards, summerCamps, prePromotion, offers, final, mentor }` — `student-share` only; auto-rendered as a two-column table injected after the Part.01 heading/avatar. Empty fields skipped, missing `background` skips the table.
