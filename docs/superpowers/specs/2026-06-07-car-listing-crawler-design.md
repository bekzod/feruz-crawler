# feruz-crawler — Car Listing Crawler Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)

## Overview

A crawler for Japanese car listing platforms — initially [goo-net.com](https://goo-net.com/)
and [carsensor.net](https://www.carsensor.net/). It collects car listings and stores
them with **all structured parameters translated to English**, while the **original
full description is stored verbatim (untranslated)**.

Two trigger modes:

1. **Automatic** — the user defines filter presets (maker, model, price/year/mileage,
   body/fuel/transmission, region). Every hour, the crawler walks each site's search
   results matching those filters and ingests every listing.
2. **Manual** — the user pastes a single car listing URL; the crawler ingests just
   that listing.

Both modes converge on the same parse → translate → upsert pipeline.

## Goals & Non-Goals

**Goals**

- Hourly automatic crawling driven by user-defined filter presets.
- Single-URL manual crawling.
- English-only structured parameters; verbatim original description.
- Track listing changes over time (price history) and detect sold/removed listings.
- Web UI to browse/search listings, manage presets, monitor jobs, and see new-match alerts.
- New-match alerts via in-app feed and Telegram.

**Non-Goals (for this spec)**

- Sites beyond goo-net and carsensor (the adapter interface keeps the door open).
- Proxy rotation / large-scale distributed crawling (single-node worker, scalable by replicas).
- Authentication / multi-tenant accounts (single-user tool for now).
- Email/webhook alert channels (only in-app + Telegram were chosen).

## Decisions (locked)

| Area | Decision |
|------|----------|
| Storage | **PostgreSQL + Drizzle** |
| Queue / worker | **BullMQ + Redis**, dedicated worker process, **repeatable jobs** for hourly scheduling |
| Crawling | **cloakbrowser** (stealth Chromium) + **playwright-core** (already installed) |
| Translation | **Dictionaries first, OpenAI API fallback**, cached |
| Frontend | **React 19 + Vite** (already scaffolded) |
| Filters | Mirror what **each site's search form supports** (common set across both sites) |
| Re-crawl behavior | **Upsert + track changes** (price history, sold detection) |
| Sold detection | Flip to `sold_removed` after **3 consecutive misses** |
| Alerts | **In-app feed + Telegram** |

## Architecture

Building on the existing Bun workspace monorepo.

```
apps/
  api      Bun.serve REST API — frontend talks to this; enqueues jobs to Redis
  worker   BullMQ workers + scheduler (NEW) — owns all crawling
  web      React 19 + Vite frontend (exists; currently scaffold)
packages/
  db       Drizzle schema + migrations + Postgres client (NEW)
  crawler  Browser pool (cloakbrowser) + per-site adapters (NEW)
  lookup   Translation: dictionaries → OpenAI fallback → cache (exists as stub)
  shared   Zod schemas for filter criteria + queue/job payload types (NEW)
```

- **`apps/api`** and **`apps/worker`** are **separate processes**, both depending on
  `db`, `crawler`, `lookup`, `shared`. Heavy headful-browser crawling in the worker
  never blocks API request handling.
- **Redis** (BullMQ backend) and **Postgres** run as Docker services alongside the
  existing API image (which already bakes the stealth Chromium per the current Dockerfile).
- The worker scales by running additional replicas; the API scales independently.

## Crawler core (`packages/crawler`)

**Browser pool** — a single shared `cloakbrowser` stealth Chromium; a fresh browser
context per job; politeness controls (per-site concurrency cap + randomized inter-request
delays).

**Site adapter interface** — one implementation per site (`goonet`, `carsensor`):

```
buildSearchUrl(criteria)  → string[]                  // canonical filter → site search URL(s) + pagination
parseSearchPage(html)     → { listingRefs[], nextPageUrl? }
parseListingPage(html)    → RawListing                // raw JP fields, raw price, photo URLs, original description
detectFromUrl(url)        → boolean                    // used by manual mode to pick the adapter
```

The **canonical filter model** is the intersection of what both sites' search forms
support. Exact query-param names per site are pinned during implementation by inspecting
each search UI. Common set:

- maker, model (multiple)
- price range (¥ min/max)
- model year range (min/max)
- mileage range (km min/max)
- body type, fuel type, transmission
- prefecture / region

Adapters are pure parsing functions over HTML (testable against saved fixtures); the
browser pool is the only stateful/IO part.

## Data model (`packages/db`, Postgres + Drizzle)

**`listings`** — natural key `(source, source_listing_id)`.

- Identity: `id` (uuid), `source` (`goonet` | `carsensor`), `source_listing_id`, `url`
- English structured fields: `maker`, `model`, `grade`, `model_year`, `mileage_km`,
  `displacement_cc`, `transmission`, `fuel_type`, `body_type`, `drivetrain`, `color`,
  `doors`, `seats`, `inspection_until`, `repair_history` (bool), `total_price`,
  `vehicle_price`, `prefecture`, `dealer_name`, `photos` (text[])
- `description_original` — **raw Japanese, never translated**
- `raw` (jsonb) — everything scraped, for reprocessing/debugging
- Lifecycle: `first_seen_at`, `last_seen_at`, `consecutive_misses` (int), `status`
  (`active` | `sold_removed`)

**`price_history`** — `(id, listing_id, price, observed_at)`; a row appended only when
the observed price differs from the latest stored price.

**`filter_presets`** — `id`, `name`, `enabled`, `sites` (text[]),
`criteria` (jsonb, validated by a `shared` Zod schema), `telegram_chat_id` (nullable),
`last_run_at`.

**`crawl_runs`** — per discovery run: `id`, `preset_id`, `site`, `started_at`,
`finished_at`, `found_count`, `new_count`, `updated_count`, `error_count`, `status`.
Powers the monitoring UI and sold-detection bookkeeping.

**`notifications`** — in-app feed of new matches: `id`, `listing_id`, `preset_id`,
`created_at`, `read_at` (nullable).

**`translation_cache`** — `(field, source_text)` → `english`; ensures OpenAI is called
at most once per unique value per field.

## Data flow

1. **Scheduler** (runs on worker startup, and re-syncs on preset create/edit/enable/disable):
   registers a BullMQ **repeatable job per enabled preset**, hourly.
2. A repeatable job fires → enqueues a **`discovery`** job per `(preset × site)`.
3. **`discovery` worker**:
   - builds search URL(s) from `criteria` via the site adapter,
   - paginates results through the browser pool,
   - opens a `crawl_run`,
   - enqueues one **`listing`** job per discovered listing (deduped within the run),
   - records `found_count`.
4. **`listing` worker**:
   - fetches the listing page via the browser pool,
   - adapter parses raw fields,
   - `lookup` translates each structured field (dictionary → OpenAI fallback → cache),
   - **upserts** into `listings` (insert new, or update existing by natural key),
   - appends `price_history` if the price changed,
   - sets `last_seen_at`, resets `consecutive_misses` to 0,
   - if the row was **newly inserted** and matches a preset's criteria → creates a
     `notification` and pushes to **Telegram** (if the preset has a chat id).
5. **Sold detection**: when a discovery run finishes, listings previously associated with
   that preset/site that were **not seen in this run** have `consecutive_misses`
   incremented; once it reaches **3**, `status` flips to `sold_removed`. Listings seen in
   the run reset the counter.
6. **Manual mode**: `POST /crawl/url` picks the adapter via `detectFromUrl`, then enqueues
   a `listing` job directly — identical parse/translate/upsert path, no preset association.

## Translation (`packages/lookup`)

- Curated **JP→EN dictionaries** for finite enum fields: makers, colors, transmissions,
  fuel types, body types, drivetrains, prefectures.
- Unmapped values (new grade/trim strings, etc.) → **OpenAI API**, result written to
  `translation_cache`. Subsequent occurrences hit the cache.
- Unresolved values fall back to the original text and are flagged in `raw` for review.
- **`description_original` is stored verbatim and never sent through translation.**

The existing `packages/lookup` stub (`lookup(query)`) is replaced by this module while
keeping the package name `@feruz-crawler/lookup`.

## API surface (`apps/api`, Bun.serve REST)

- `GET /health` (exists)
- Presets: `GET/POST /presets`, `GET/PATCH/DELETE /presets/:id`, `POST /presets/:id/run` (run now)
- Listings: `GET /listings` (filter/sort/paginate), `GET /listings/:id` (full detail + price history)
- Manual crawl: `POST /crawl/url` (`{ url }`)
- Jobs: `GET /jobs` (BullMQ queue/job status), `POST /jobs/:id/retry`
- Notifications: `GET /notifications`, `POST /notifications/:id/read`

Preset writes also trigger the scheduler to (re)register/remove the corresponding
repeatable job.

## Frontend (`apps/web`, React 19 + Vite)

Four areas, replacing the scaffold:

1. **Listings browser** — filterable/sortable grid (English fields + thumbnail), detail
   view showing all English params, photo gallery, the **original Japanese description**,
   and the **price-history timeline**.
2. **Filter presets** — create/edit, enable/disable, choose sites, set criteria, set
   Telegram chat; shows `last_run_at` and last-run counts.
3. **Job monitoring** — queued/running/failed jobs from BullMQ, error messages, retry
   button, and "run now" per preset.
4. **Notifications** — in-app new-match feed with read/unread state.

Telegram is the external alert channel (bot token in worker config, chat id per preset).

## Error handling

- BullMQ retries with exponential backoff; failed jobs retained for the monitoring UI.
- **Parse failures** snapshot the raw HTML (into `raw` / a debug store) and fail the job
  with a reason, surfaced in monitoring.
- **Translation failures** fall back to the original value and flag it; never block ingest.
- **Politeness/anti-bot**: per-site concurrency cap + randomized delays; cloakbrowser
  provides stealth. Transient fetch failures retry; persistent ones mark the job failed.

## Testing (TDD)

- **Unit**: site adapters (fixture HTML → canonical `RawListing`), `buildSearchUrl`
  (criteria → expected URL/params), `lookup` (dictionary mapping + cache hit/miss, OpenAI
  mocked), sold-detection counter logic.
- **Integration**: full queue flow (discovery → listing → upsert → notification) against a
  test Redis + Postgres; upsert + price-history + sold-detection across simulated runs.
- **Fixtures**: saved HTML pages for both sites (search + detail) checked into the repo.

## New dependencies

- `bullmq`, `ioredis` (queue)
- `drizzle-orm`, `drizzle-kit`, `postgres` (db)
- `openai` (translation fallback)
- `zod` (criteria validation; already present transitively, add as direct dep)
- `cheerio` or use Playwright's DOM APIs for parsing (decided at implementation; lean
  toward parsing via the page DOM the browser already has open to avoid an extra dep)

## Open implementation details (resolved during build, not blocking)

- Exact search query-param names and listing-page selectors per site (from live inspection).
- Final dictionary contents for each enum field.
- Telegram bot setup (token via env), message format for a new match.
