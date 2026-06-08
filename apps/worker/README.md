# @feruz-crawler/worker

Background worker that processes crawl jobs from BullMQ queues.

## Running

```bash
# Production
bun apps/worker/src/index.js
# or from repo root:
bun run start:worker

# Development (watch mode)
bun run dev:worker
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string |
| `REDIS_URL` | yes | `redis://localhost:6379` | Redis connection for BullMQ |
| `OPENAI_API_KEY` | no | — | Enables model/grade/free-value translation via GPT-4o-mini. Without it, unmapped values fall back to the original Japanese text; maker still resolves via the built-in dictionary. |
| `TELEGRAM_BOT_TOKEN` | no | — | Enables Telegram alerts on new matching listings. |
| `WORKER_CONCURRENCY` | no | `2` | Number of parallel jobs each worker processes. |

## Queues

The worker consumes two BullMQ queues, both backed by Redis.

### `listing` queue

Each job carries `{ site, url }`. The listing pipeline is:

1. **Fetch** — stealth Chromium (CloakBrowser) loads the detail page.
2. **Parse** — the site adapter extracts a canonical listing object (maker, model, price, specs, photos, …).
3. **Translate** — each structured field is resolved to English via: built-in dictionary → DB translation cache → OpenAI GPT-4o-mini (if key is set). Failures from OpenAI fall back to the original Japanese text.
4. **Upsert** — the listing is inserted or updated in Postgres; a price-history row is written if the price changed.
5. **Notify** — if the listing is new (`isNew=true`), active notification presets are matched and Telegram alerts are sent.

### `discovery` queue

Each job carries `{ site, presetId, page }`. The discovery pipeline is:

1. **Build URL** — the site adapter's `buildSearchUrl(preset, page)` produces a search-results page URL.
2. **Fetch & parse** — the adapter's `parseSearchPage` extracts listing IDs and detail URLs.
3. **Enqueue** — each discovered URL is added to the `listing` queue (deduplicated by BullMQ job ID).
4. **Sold detection** — `markMisses(db, site, seenIds)` increments `consecutiveMisses` on active listings absent from the run. After 3 consecutive misses a listing's `status` becomes `sold_removed`.

## Scheduler

`syncSchedules(db)` runs at startup. It reads all enabled filter presets from the database and registers a BullMQ repeatable job (`every: 3600000 ms`) in the `discovery` queue for each one. Presets disabled or deleted after startup are pruned from the repeatable-job set on the next restart.

## Adding a new site adapter

1. Create `packages/crawler/src/adapters/<site>.js` that exports an object with this interface:

   ```js
   export const mysite = {
     site: "mysite",                         // string key, used in DB and queues
     detectFromUrl(url) { /* return true if this adapter owns the URL */ },
     buildSearchUrl(preset, page) { /* return a search-results page URL */ },
     async parseSearchPage(doc, url) {
       // doc: Cheerio/DOM document
       // return { listings: [{ sourceListingId, url }] }
     },
     async parseListingPage(doc, url, deps) {
       // deps: { cache, openai } — pass to translateField(field, value, deps)
       // return a canonical listing object (see packages/crawler/src/parseSpecs.js)
     }
   };
   ```

2. Register it in `packages/crawler/src/adapters/index.js`:

   ```js
   import { mysite } from "./mysite.js";
   export { mysite };
   export const adapters = { goonet, carsensor, mysite };
   ```

   The scheduler and API route will pick it up automatically.

## Sold detection

After each discovery run, `markMisses(db, site, seenIds)` increments `consecutiveMisses` on every active listing for the given site whose `sourceListingId` was not present in the run. Once a listing accumulates 3 consecutive misses its `status` is flipped to `sold_removed`.

Known limitation: the counter is site-scoped, so results are most accurate when only one preset per site is active at a time. When multiple presets cover the same site, a listing absent from one preset's run will be incremented even if it appeared in another preset's run. Multi-preset overlap handling is a future refinement.
