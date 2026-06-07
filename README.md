# feruz-crawler

A Bun monorepo that crawls Japanese used-car listings from CarSensor and Goo-net, translates structured fields to English, stores them in Postgres, and sends Telegram alerts when new listings match saved filter presets.

## Architecture

```
apps/
  api/        Bun HTTP server — REST API for listings, presets, jobs, notifications
  worker/     BullMQ worker — fetches, parses, translates, upserts, notifies
  web/        React + Vite frontend
packages/
  db/         Drizzle ORM schema + migrations (listings, price_history, presets, …)
  crawler/    Site adapters (carsensor, goonet) + stealth browser (CloakBrowser)
  lookup/     Translation pipeline: dictionaries → DB cache → OpenAI GPT-4o-mini
  shared/     Queue names, Redis factory, filter-criteria helpers
```

Two trigger modes:
- **Hourly filter presets** — each enabled preset schedules a repeatable BullMQ discovery job that paginates through search results, enqueues all found listing URLs, and marks absent listings as potentially sold.
- **Paste a single URL** — `POST /crawl/url` enqueues the URL immediately for instant ingestion.

## Prerequisites

- [Bun](https://bun.sh) >= 1.1
- [Docker](https://docs.docker.com/get-docker/) (for Postgres and Redis)

## Quick start

```bash
# 1. Start Postgres and Redis
docker compose up -d

# 2. Copy and edit env vars
cp .env.example .env

# 3. Install dependencies
bun install

# 4. Apply database schema
bun run db:migrate

# 5. Start the API (port 3000)
bun run start        # production
bun run dev          # watch mode

# 6. Start the worker (separate terminal)
bun run start:worker
bun run dev:worker

# 7. Start the web frontend (separate terminal, port 5173)
bun run dev:web
```

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (default points to docker-compose container) |
| `REDIS_URL` | yes | Redis connection string (default points to docker-compose container) |
| `OPENAI_API_KEY` | no | Enables model/grade/free-value translation via GPT-4o-mini. Without it, unmapped field values fall back to the original Japanese text; maker still resolves via the built-in dictionary. |
| `TELEGRAM_BOT_TOKEN` | no | Enables Telegram alerts when new listings match a notification preset. |
| `PORT` | no | API port (default `3000`). |
| `WORKER_CONCURRENCY` | no | Parallel BullMQ jobs (default `2`). |

## Running tests

```bash
bun test
```

Requires Postgres and Redis to be running (used by DB and worker integration tests).

## Notes

- The carsensor `buildSearchUrl` maker filter is best-effort. CarSensor uses numeric brand codes in its search URL that do not map 1:1 to the plain maker names stored in the DB. A full brand-code mapping is a future refinement.
- The stealth Chromium (CloakBrowser) is baked into the Docker API image. For local development it is installed as an npm dependency.
