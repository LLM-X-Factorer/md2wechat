# md2wechat

Markdown → 微信公众号草稿箱，自托管 HTTP 微服务。

## Tech Stack

- TypeScript (CommonJS, ES2022 target, strict mode)
- Fastify v5 web framework
- markdown-it + cheerio + @css-inline for HTML processing
- sharp for cover image compositing, Google Imagen 4 for AI covers
- Kysely + better-sqlite3 (default) / pg (PostgreSQL)
- Docker multi-stage build, Alpine Linux runtime

## Project Structure

```
src/
  core/       # parser, converter, fixer, wechat client, cover strategies
  services/   # pipeline orchestration, database, publish records, webhook, fileManager
  routes/     # HTTP endpoints (publish, history, health, themes, config, static)
  types/      # TypeScript interfaces
  index.ts    # Server entry point
themes/       # Built-in CSS themes (default, blue, green, etc.)
assets/       # Background images for cover generation
public/       # Web UI (SPA)
config/       # User markdown plugins
```

## Commands

```bash
npm run build     # TypeScript compile
npm run dev       # Development with ts-node
npm start         # Production (requires build first)
```

## Key Patterns

- 7-step pipeline: parse → render → fix → cover → upload → persist → webhook
- Strategy pattern for cover generation (sharp / ai)
- In-memory processing, no temp file I/O during pipeline
- CSS inlining for WeChat compatibility
- Graceful degradation: AI cover fails → fallback to sharp
- Non-blocking webhooks and database errors

## Deployment

- Docker Compose: dev (SQLite) / prod (PostgreSQL)
- Required env: WXGZH_APPID, WXGZH_APPSECRET
- Optional: IMAGEN_API_KEY, DATABASE_URL, API_KEY, WEBHOOK_URL
- Repo: github.com/sawyerbutton/md2wechat
