# Crawlix

A pluggable scraping platform (Outscraper-style) built on **Node.js + TypeScript + Playwright + Fastify**.

> MVP status — runs locally, in-memory queue, single browser pool. Auth, billing, persistent storage, and proxy rotation are intentionally deferred.

## Features

- Pluggable **adapter** architecture — one module per data source.
- **In-memory job queue** with configurable concurrency (swap for BullMQ/Redis later).
- **REST API** (`/api/...`) + minimal **dashboard** at `/`.
- **CLI** for local one-shot runs.

### Adapters shipped

| Name           | Status     | What it does                                                         |
| -------------- | ---------- | -------------------------------------------------------------------- |
| `google-maps`  | Functional | Search Maps → businesses w/ rating, reviews, address, phone, url     |
| `google-serp`  | Functional | Organic Google search results                                        |
| `email-phone`  | Functional | Crawl a site + contact pages for emails, phones, social links        |
| `generic`      | Functional | CSS-selector driven extraction from any URL                          |
| `yelp`         | Best-effort| Yelp business search                                                 |
| `amazon`       | Best-effort| Amazon product search listings                                       |
| `instagram`    | Best-effort| Public profile meta (logged-out only)                                |

> Selector-based scrapers need maintenance when target sites change their markup. That's expected.

## Getting started

```powershell
npm install
# Playwright Chromium is installed via postinstall; if it fails:
npx playwright install chromium

copy .env.example .env
npm run dev
```

Open http://localhost:3000 for the dashboard.

### REST API

```http
GET  /api/health
GET  /api/adapters
POST /api/jobs           { "adapter": "google-maps", "input": { "query": "coffee", "location": "Berlin", "limit": 10 } }
GET  /api/jobs
GET  /api/jobs/:id
POST /api/jobs/:id/cancel
```

### CLI

```powershell
npm run cli -- adapters
npm run cli -- run -a google-maps -i "{\"query\":\"coffee\",\"location\":\"Berlin\",\"limit\":5}"
```

## Architecture

The project is organized as an npm workspace monorepo:

```
crawlix/
├── apps/
│   ├── backend/              # Fastify API + Playwright engine + adapters
│   │   ├── package.json
│   │   └── src/
│   │       ├── adapters/     # One file per data source
│   │       ├── engine/
│   │       │   ├── browser.ts  # Playwright launch + page pool
│   │       │   └── runner.ts   # Job queue (p-queue), cancellation
│   │       ├── routes/         # Fastify route modules
│   │       ├── utils/          # Logger, text helpers
│   │       ├── config.ts       # zod-validated env
│   │       ├── types.ts        # Adapter / AdapterContext types
│   │       ├── server.ts       # Fastify entrypoint
│   │       └── cli.ts          # Commander CLI
│   └── frontend/             # Static dashboard (served by backend)
│       ├── index.html
│       ├── styles/main.css
│       └── scripts/app.js
├── packages/
│   └── database/             # Persistence layer (swap-in point for Postgres/SQLite)
│       └── src/
│           ├── index.ts        # Barrel export
│           ├── types.ts        # JobRecord, JobStatus, JobStore interface
│           └── jobs.ts         # InMemoryJobStore + default singleton
├── package.json              # Root — npm workspaces, scripts, deps
└── tsconfig.json             # Compiles backend + database together
```

Backend imports the database via the workspace package `@crawlix/database`.

### Adding a new adapter

1. Create `apps/backend/src/adapters/<name>.ts` exporting an `Adapter<Input, Result>`.
2. Register it in `apps/backend/src/adapters/registry.ts`.
3. Optionally add an example payload to `apps/frontend/scripts/app.js` (`EXAMPLES` map).

### Swapping the database

`packages/database` exposes a `JobStore` interface. The default `InMemoryJobStore` can be replaced with a Postgres/SQLite implementation without touching backend code.

## Roadmap (post-MVP)

- Persistent storage (Postgres) + job history.
- Redis + BullMQ for distributed workers.
- Proxy rotation, stealth plugins, CAPTCHA solver hooks.
- Auth + API keys + Stripe billing.
- Webhook delivery on job completion.
- Export as CSV / JSON / XLSX.
- Next.js dashboard with live progress via WebSockets.

## Legal

Only scrape data you're allowed to scrape. Respect each target site's ToS and `robots.txt`, applicable data-protection law (GDPR, CCPA, etc.), and rate limits. You are responsible for how you use this code.
