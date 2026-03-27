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
  core/       # parser, converter, fixer, wechat client, cover strategies
  services/   # pipeline orchestration, database, publish records, webhook, fileManager
  routes/     # HTTP endpoints (publish, history, health, themes, config, static)
  types/      # TypeScript interfaces (HeadingStyle, ThemeInfo, ThemeManifest)
  index.ts    # Server entry point
themes/       # Custom themes with CSS + template.md + theme.json
  paperweekly/    # 论文解读 (headingStyle: part-number)
  student-share/  # 学员经验分享 (headingStyle: part-number)
  values/         # 价值观人物 (headingStyle: chinese-number)
assets/       # Background images for cover generation
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

- 7-step pipeline: parse → render → fix → cover → upload → persist → webhook
- Strategy pattern for cover generation (sharp / ai)
- Theme headingStyle: h2 auto-transform (part-number → Part.XX, chinese-number → 第X部分)
- In-memory processing, no temp file I/O during pipeline
- CSS inlining for WeChat compatibility
- Graceful degradation: AI cover fails → fallback to sharp
- Non-blocking webhooks and database errors

## API Endpoints

- POST /api/publish — publish markdown article to WeChat draft
- GET /api/themes — list all themes with metadata (displayName, description, category)
- GET /api/themes/:name/template — download theme writing template
- GET /api/history — paginated publish history
- GET /api/config — masked config summary
- GET /health — service health check

## Deployment

- CI/CD: GitHub Actions → SSH to Lighthouse → git pull + docker compose up --build
- Deploy workflow: .github/workflows/deploy.yml (push to main triggers deploy)
- Server: Tencent Cloud Lighthouse (43.139.146.170:3000)
- Required env: WXGZH_APPID, WXGZH_APPSECRET
- Optional: IMAGEN_API_KEY, DATABASE_URL, API_KEY, WEBHOOK_URL
- Repo: github.com/LLM-X-Factorer/md2wechat
