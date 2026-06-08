# Car Listing Crawler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a crawler for goo-net.com and carsensor.net that ingests Japanese car listings (parameters stored in English, description verbatim), driven by hourly filter presets and on-demand single-URL crawls, with a React UI for browsing, presets, job monitoring, and new-match alerts.

**Architecture:** Bun monorepo. A `worker` process runs BullMQ workers (discovery → listing) scheduled by repeatable jobs; an `api` process serves REST and enqueues jobs. Shared `packages/`: `db` (Drizzle+Postgres), `crawler` (cloakbrowser pool + per-site adapters), `lookup` (JP→EN dictionaries + OpenAI fallback), `shared` (Zod criteria + queue helpers).

**Tech Stack:** Bun, JavaScript (no TypeScript), Postgres + Drizzle, Redis + BullMQ, cloakbrowser + playwright-core, OpenAI API, React 19 + Vite. Tests: `bun:test`.

---

## Conventions

- All packages are ESM (`"type": "module"`), JavaScript only.
- Tests are co-located `*.test.js` files run with `bun test`.
- Pure logic (parsing, matching, number normalization, counters) is unit-tested with no IO. DB/Redis/browser/network are integration-tested or dependency-injected and mocked.
- Run `docker compose up -d` (Task 1) before any test that touches Postgres/Redis.
- Commit after every task.

## File Structure (locked decomposition)

```
docker-compose.yml                         # Postgres + Redis (NEW)
.env.example                               # NEW

packages/shared/src/
  criteria.js        # Zod schema for filter criteria + matchesCriteria()
  queues.js          # queue/job name constants
  redis.js           # ioredis connection factory
  index.js

packages/db/
  drizzle.config.js
  src/schema.js      # all Drizzle pg tables
  src/client.js      # postgres client + drizzle db instance
  src/index.js

packages/lookup/src/
  dictionaries/{maker,color,transmission,fuel,body,drivetrain,prefecture,specLabels}.js
  normalize.js       # number/price/mileage parsing
  translate.js       # translateField() with injected {dict, cache, openai}
  openai.js          # OpenAI client wrapper
  cache.js           # translation_cache get/set backed by db
  index.js

packages/crawler/
  src/adapters/{goonet,carsensor,index}.js
  src/browser.js     # cloakbrowser pool: fetchHtml(url)
  test/fixtures/     # saved HTML pages

apps/worker/src/
  queues.js          # BullMQ Queue instances
  ingest/{upsert,soldDetection,notify}.js
  workers/{listing,discovery}.js
  scheduler.js       # registers repeatable jobs from presets
  telegram.js
  index.js

apps/api/src/
  index.js           # Bun.serve + router
  queues.js          # Queue refs for enqueueing
  routes/{presets,listings,crawl,jobs,notifications}.js
  json.js            # response helpers

apps/web/src/
  api.js
  App.jsx
  pages/{Listings,ListingDetail,Presets,Jobs,Notifications}.jsx
  components/*.jsx
```

---

# Phase 0 — Foundation & Infrastructure

## Task 1: Infra deps, docker-compose, env

**Files:**
- Create: `docker-compose.yml`, `.env.example`
- Modify: `package.json` (root), `apps/api/package.json`

- [ ] **Step 1: Add docker-compose for Postgres + Redis**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: feruz
      POSTGRES_PASSWORD: feruz
      POSTGRES_DB: feruz
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
volumes:
  pgdata:
```

- [ ] **Step 2: Add `.env.example`**

```bash
DATABASE_URL=postgres://feruz:feruz@localhost:5432/feruz
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...
TELEGRAM_BOT_TOKEN=
PORT=3000
WORKER_CONCURRENCY=2
```

- [ ] **Step 3: Install dependencies**

Run:
```bash
bun add -d drizzle-kit
bun add drizzle-orm postgres bullmq ioredis zod
cd apps/api && bun add openai && cd ../..
```
Expected: packages added, `bun.lock` updated.

- [ ] **Step 4: Add root scripts**

In root `package.json` `scripts`, add:
```json
"dev:worker": "bun --watch apps/worker/src/index.js",
"start:worker": "bun apps/worker/src/index.js",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 5: Bring up infra and verify**

Run: `docker compose up -d && docker compose ps`
Expected: both `postgres` and `redis` show "running".

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example package.json apps/api/package.json bun.lock
git commit -m "chore: add postgres/redis infra and core deps"
```

---

## Task 2: `packages/shared` — criteria schema, matching, queue/redis helpers

**Files:**
- Create: `packages/shared/package.json`, `src/criteria.js`, `src/queues.js`, `src/redis.js`, `src/index.js`, `src/criteria.test.js`

- [ ] **Step 1: Create package.json**

`packages/shared/package.json`:
```json
{
  "name": "@feruz-crawler/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.js",
  "exports": { ".": "./src/index.js" },
  "dependencies": { "zod": "^4.4.3", "bullmq": "^5.0.0", "ioredis": "^5.4.0" }
}
```
Then run `bun install`.

- [ ] **Step 2: Write the failing test for criteria + matching**

`packages/shared/src/criteria.test.js`:
```javascript
import { expect, test } from "bun:test";
import { criteriaSchema, matchesCriteria } from "./criteria.js";

test("criteriaSchema accepts a full criteria object", () => {
  const parsed = criteriaSchema.parse({
    maker: "toyota", models: ["prius"],
    priceMin: 500000, priceMax: 2000000,
    yearMin: 2015, yearMax: 2022,
    mileageMax: 80000,
    bodyTypes: ["suv"], fuelTypes: ["hybrid"], transmissions: ["cvt"],
    prefectures: ["tokyo"]
  });
  expect(parsed.maker).toBe("toyota");
});

test("criteriaSchema rejects unknown enum", () => {
  expect(() => criteriaSchema.parse({ maker: 1 })).toThrow();
});

test("matchesCriteria respects ranges and arrays", () => {
  const listing = {
    maker: "toyota", model: "prius", model_year: 2018,
    total_price: 1500000, mileage_km: 50000,
    body_type: "suv", fuel_type: "hybrid", transmission: "cvt", prefecture: "tokyo"
  };
  expect(matchesCriteria(listing, { maker: "toyota", priceMax: 2000000 })).toBe(true);
  expect(matchesCriteria(listing, { priceMax: 1000000 })).toBe(false);
  expect(matchesCriteria(listing, { models: ["aqua"] })).toBe(false);
  expect(matchesCriteria(listing, { yearMin: 2015, yearMax: 2022 })).toBe(true);
  expect(matchesCriteria(listing, {})).toBe(true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test packages/shared/src/criteria.test.js`
Expected: FAIL — cannot resolve `./criteria.js`.

- [ ] **Step 4: Implement criteria.js**

`packages/shared/src/criteria.js`:
```javascript
import { z } from "zod";

export const criteriaSchema = z.object({
  maker: z.string().optional(),
  models: z.array(z.string()).optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  yearMin: z.number().int().optional(),
  yearMax: z.number().int().optional(),
  mileageMin: z.number().int().nonnegative().optional(),
  mileageMax: z.number().int().nonnegative().optional(),
  bodyTypes: z.array(z.string()).optional(),
  fuelTypes: z.array(z.string()).optional(),
  transmissions: z.array(z.string()).optional(),
  prefectures: z.array(z.string()).optional()
}).strict();

function inRange(value, min, max) {
  if (value == null) return min == null && max == null ? true : false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function inSet(value, set) {
  if (!set || set.length === 0) return true;
  return value != null && set.includes(value);
}

export function matchesCriteria(listing, criteria) {
  if (criteria.maker && listing.maker !== criteria.maker) return false;
  if (!inSet(listing.model, criteria.models)) return false;
  if (!inRange(listing.total_price, criteria.priceMin, criteria.priceMax)) return false;
  if (!inRange(listing.model_year, criteria.yearMin, criteria.yearMax)) return false;
  if (!inRange(listing.mileage_km, criteria.mileageMin, criteria.mileageMax)) return false;
  if (!inSet(listing.body_type, criteria.bodyTypes)) return false;
  if (!inSet(listing.fuel_type, criteria.fuelTypes)) return false;
  if (!inSet(listing.transmission, criteria.transmissions)) return false;
  if (!inSet(listing.prefecture, criteria.prefectures)) return false;
  return true;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/shared/src/criteria.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Implement queues.js and redis.js**

`packages/shared/src/queues.js`:
```javascript
export const QUEUE_DISCOVERY = "discovery";
export const QUEUE_LISTING = "listing";
export const JOB_DISCOVER_PRESET = "discover-preset";
export const JOB_CRAWL_LISTING = "crawl-listing";
export const SITES = ["goonet", "carsensor"];
```

`packages/shared/src/redis.js`:
```javascript
import IORedis from "ioredis";

export function createRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new IORedis(url, { maxRetriesPerRequest: null });
}
```

`packages/shared/src/index.js`:
```javascript
export * from "./criteria.js";
export * from "./queues.js";
export * from "./redis.js";
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared bun.lock
git commit -m "feat(shared): criteria schema, matching, queue/redis helpers"
```

---

## Task 3: `packages/db` — Drizzle schema, client, migrations

**Files:**
- Create: `packages/db/package.json`, `drizzle.config.js`, `src/schema.js`, `src/client.js`, `src/index.js`, `src/schema.test.js`

- [ ] **Step 1: Create package.json**

`packages/db/package.json`:
```json
{
  "name": "@feruz-crawler/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.js",
  "exports": { ".": "./src/index.js" },
  "dependencies": { "drizzle-orm": "^0.36.0", "postgres": "^3.4.0" }
}
```
Run `bun install`.

- [ ] **Step 2: Write schema.js**

`packages/db/src/schema.js`:
```javascript
import {
  pgTable, uuid, text, integer, boolean, timestamp, jsonb,
  bigint, primaryKey, index, uniqueIndex
} from "drizzle-orm/pg-core";

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  sourceListingId: text("source_listing_id").notNull(),
  url: text("url").notNull(),
  maker: text("maker"),
  model: text("model"),
  grade: text("grade"),
  modelYear: integer("model_year"),
  mileageKm: integer("mileage_km"),
  displacementCc: integer("displacement_cc"),
  transmission: text("transmission"),
  fuelType: text("fuel_type"),
  bodyType: text("body_type"),
  drivetrain: text("drivetrain"),
  color: text("color"),
  doors: integer("doors"),
  seats: integer("seats"),
  inspectionUntil: text("inspection_until"),
  repairHistory: boolean("repair_history"),
  totalPrice: bigint("total_price", { mode: "number" }),
  vehiclePrice: bigint("vehicle_price", { mode: "number" }),
  prefecture: text("prefecture"),
  dealerName: text("dealer_name"),
  photos: jsonb("photos").$type().default([]),
  descriptionOriginal: text("description_original"),
  raw: jsonb("raw"),
  status: text("status").notNull().default("active"),
  consecutiveMisses: integer("consecutive_misses").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  bySource: uniqueIndex("listings_source_id_uq").on(t.source, t.sourceListingId)
}));

export const priceHistory = pgTable("price_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  price: bigint("price", { mode: "number" }).notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({ byListing: index("price_history_listing_idx").on(t.listingId) }));

export const filterPresets = pgTable("filter_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sites: jsonb("sites").$type().notNull().default(["goonet", "carsensor"]),
  criteria: jsonb("criteria").notNull().default({}),
  telegramChatId: text("telegram_chat_id"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const crawlRuns = pgTable("crawl_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  presetId: uuid("preset_id").references(() => filterPresets.id, { onDelete: "set null" }),
  site: text("site").notNull(),
  status: text("status").notNull().default("running"),
  foundCount: integer("found_count").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true })
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  presetId: uuid("preset_id").references(() => filterPresets.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true })
});

export const translationCache = pgTable("translation_cache", {
  field: text("field").notNull(),
  sourceText: text("source_text").notNull(),
  english: text("english").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({ pk: primaryKey({ columns: [t.field, t.sourceText] }) }));
```

- [ ] **Step 3: Write client.js and index.js**

`packages/db/src/client.js`:
```javascript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(url = process.env.DATABASE_URL) {
  const sql = postgres(url, { max: 10 });
  return { db: drizzle(sql, { schema }), sql };
}
```

`packages/db/src/index.js`:
```javascript
export * as schema from "./schema.js";
export { createDb } from "./client.js";
```

- [ ] **Step 4: Write drizzle.config.js**

`packages/db/drizzle.config.js`:
```javascript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./packages/db/src/schema.js",
  out: "./packages/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://feruz:feruz@localhost:5432/feruz" }
});
```

Update the root `db:generate`/`db:migrate` scripts to point at this config:
```json
"db:generate": "drizzle-kit generate --config packages/db/drizzle.config.js",
"db:migrate": "drizzle-kit migrate --config packages/db/drizzle.config.js"
```

- [ ] **Step 5: Generate and apply migration**

Run:
```bash
bun run db:generate
bun run db:migrate
```
Expected: a migration file appears in `packages/db/migrations/`; migrate prints applied migration. (Requires `docker compose up -d` and a local `.env` copied from `.env.example`.)

- [ ] **Step 6: Write a smoke test against the DB**

`packages/db/src/schema.test.js`:
```javascript
import { expect, test, afterAll } from "bun:test";
import { createDb, schema } from "./index.js";

const { db, sql } = createDb();
afterAll(() => sql.end());

test("can insert and read a listing", async () => {
  const [row] = await db.insert(schema.listings).values({
    source: "goonet", sourceListingId: `t-${Date.now()}`, url: "http://x", maker: "toyota"
  }).returning();
  expect(row.maker).toBe("toyota");
  await db.delete(schema.listings).where(schema.eq?.(schema.listings.id, row.id) ?? undefined);
});
```
(If `schema.eq` is awkward, import `eq` from `drizzle-orm` instead.)

Replace the delete line with a proper `eq`:
```javascript
import { eq } from "drizzle-orm";
// ...
await db.delete(schema.listings).where(eq(schema.listings.id, row.id));
```

- [ ] **Step 7: Run the smoke test**

Run: `bun test packages/db/src/schema.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/db bun.lock package.json
git commit -m "feat(db): drizzle schema, client, migrations"
```

---

# Phase 1 — Translation (`packages/lookup`)

## Task 4: Number normalization + dictionaries + `translateField` (dictionary path)

**Files:**
- Modify: `packages/lookup/package.json`
- Create: `src/normalize.js`, `src/dictionaries/*.js`, `src/translate.js`
- Replace: `src/index.js`, `src/index.test.js`
- Create: `src/normalize.test.js`, `src/translate.test.js`

- [ ] **Step 1: Update package.json deps**

`packages/lookup/package.json` add:
```json
"dependencies": { "@feruz-crawler/db": "workspace:*", "openai": "^4.0.0" }
```
Run `bun install`.

- [ ] **Step 2: Write normalize tests**

`packages/lookup/src/normalize.test.js`:
```javascript
import { expect, test } from "bun:test";
import { parseYen, parseMileageKm, parseInt0, parseYear } from "./normalize.js";

test("parseYen handles 万円 and commas", () => {
  expect(parseYen("150.5万円")).toBe(1505000);
  expect(parseYen("1,500,000円")).toBe(1500000);
  expect(parseYen("応談")).toBeNull();
});

test("parseMileageKm handles 万km and km", () => {
  expect(parseMileageKm("5.2万km")).toBe(52000);
  expect(parseMileageKm("80,000km")).toBe(80000);
});

test("parseYear handles Japanese era and western", () => {
  expect(parseYear("2018年")).toBe(2018);
  expect(parseYear("平成30年")).toBe(2018);
});
```

- [ ] **Step 3: Run to verify fail**

Run: `bun test packages/lookup/src/normalize.test.js` → FAIL (no normalize.js).

- [ ] **Step 4: Implement normalize.js**

```javascript
const HALF = (s) => s.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xFF10));

export function parseYen(text) {
  if (!text) return null;
  const t = HALF(String(text)).replace(/,/g, "");
  const man = t.match(/([\d.]+)\s*万/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const yen = t.match(/([\d.]+)\s*円/);
  if (yen) return Math.round(parseFloat(yen[1]));
  const bare = t.match(/^[\d.]+$/) ? parseFloat(t) : null;
  return bare;
}

export function parseMileageKm(text) {
  if (!text) return null;
  const t = HALF(String(text)).replace(/,/g, "");
  const man = t.match(/([\d.]+)\s*万\s*km/i);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const km = t.match(/([\d.]+)\s*km/i);
  if (km) return Math.round(parseFloat(km[1]));
  return null;
}

export function parseInt0(text) {
  if (text == null) return null;
  const m = HALF(String(text)).replace(/,/g, "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

const ERA = { 令和: 2018, 平成: 1988, 昭和: 1925 }; // year = era_base + nth
export function parseYear(text) {
  if (!text) return null;
  const t = HALF(String(text));
  for (const [era, base] of Object.entries(ERA)) {
    const m = t.match(new RegExp(`${era}\\s*(\\d+)`));
    if (m) return base + parseInt(m[1], 10);
  }
  const w = t.match(/(19|20)\d{2}/);
  return w ? parseInt(w[0], 10) : null;
}
```

- [ ] **Step 5: Run normalize test** → PASS.

- [ ] **Step 6: Write dictionaries**

Create one file per field. Each exports a JP→canonical map. Example `src/dictionaries/transmission.js`:
```javascript
export const transmission = {
  "AT": "at", "オートマ": "at", "フロアAT": "at", "コラムAT": "at",
  "MT": "mt", "マニュアル": "mt", "フロアMT": "mt",
  "CVT": "cvt", "AT/CVT": "cvt"
};
```
`src/dictionaries/fuel.js`:
```javascript
export const fuel = {
  "ガソリン": "gasoline", "ハイブリッド": "hybrid", "ディーゼル": "diesel",
  "軽油": "diesel", "電気": "ev", "EV": "ev", "プラグインハイブリッド": "phev", "LPG": "lpg"
};
```
`src/dictionaries/body.js`:
```javascript
export const body = {
  "セダン": "sedan", "SUV・クロカン": "suv", "SUV": "suv", "ステーションワゴン": "wagon",
  "ミニバン": "minivan", "コンパクトカー": "compact", "ハッチバック": "hatchback",
  "クーペ": "coupe", "オープン": "convertible", "軽自動車": "kei", "トラック": "truck", "ワンボックス": "van"
};
```
`src/dictionaries/drivetrain.js`:
```javascript
export const drivetrain = {
  "FF": "ff", "FR": "fr", "4WD": "awd", "AWD": "awd", "MR": "mr", "RR": "rr" };
```
`src/dictionaries/color.js` (seed common values; extend during build):
```javascript
export const color = {
  "ホワイト": "white", "白": "white", "パール": "pearl white",
  "ブラック": "black", "黒": "black", "シルバー": "silver", "グレー": "gray",
  "レッド": "red", "赤": "red", "ブルー": "blue", "青": "blue",
  "イエロー": "yellow", "ゴールド": "gold", "ブラウン": "brown", "グリーン": "green", "緑": "green"
};
```
`src/dictionaries/maker.js` (seed top makers; extend during build):
```javascript
export const maker = {
  "トヨタ": "toyota", "ホンダ": "honda", "日産": "nissan", "マツダ": "mazda",
  "スバル": "subaru", "スズキ": "suzuki", "ダイハツ": "daihatsu", "三菱": "mitsubishi",
  "レクサス": "lexus", "メルセデス・ベンツ": "mercedes-benz", "BMW": "bmw",
  "アウディ": "audi", "フォルクスワーゲン": "volkswagen"
};
```
`src/dictionaries/prefecture.js` (all 47; seed a few here, complete during build):
```javascript
export const prefecture = {
  "東京都": "tokyo", "大阪府": "osaka", "神奈川県": "kanagawa", "愛知県": "aichi",
  "北海道": "hokkaido", "福岡県": "fukuoka", "埼玉県": "saitama", "千葉県": "chiba",
  "兵庫県": "hyogo", "京都府": "kyoto"
  // NOTE: complete all 47 prefectures during implementation.
};
```
`src/dictionaries/specLabels.js` (maps spec-table JP labels → canonical listing field keys; used by adapters):
```javascript
export const specLabels = {
  "メーカー": "maker", "車名": "model", "グレード": "grade",
  "年式": "modelYear", "走行距離": "mileageKm", "排気量": "displacementCc",
  "ミッション": "transmission", "シフト": "transmission", "燃料": "fuelType",
  "ボディタイプ": "bodyType", "ボディカラー": "color", "車体色": "color",
  "駆動方式": "drivetrain", "ドア数": "doors", "乗車定員": "seats",
  "車検": "inspectionUntil", "修復歴": "repairHistory",
  "支払総額": "totalPrice", "車両本体価格": "vehiclePrice", "本体価格": "vehiclePrice",
  "地域": "prefecture", "所在地": "prefecture"
};
```
`src/dictionaries/index.js`:
```javascript
export { maker } from "./maker.js";
export { color } from "./color.js";
export { transmission } from "./transmission.js";
export { fuel } from "./fuel.js";
export { body } from "./body.js";
export { drivetrain } from "./drivetrain.js";
export { prefecture } from "./prefecture.js";
export { specLabels } from "./specLabels.js";
```

- [ ] **Step 7: Write translate test (dictionary path, no OpenAI)**

`packages/lookup/src/translate.test.js`:
```javascript
import { expect, test } from "bun:test";
import { translateField } from "./translate.js";

const noOpenAI = { translate: async () => { throw new Error("should not be called"); } };
const memCache = () => {
  const m = new Map();
  return {
    get: async (f, s) => m.get(`${f}:${s}`) ?? null,
    set: async (f, s, e) => { m.set(`${f}:${s}`, e); }
  };
};

test("translateField uses dictionary when available", async () => {
  const out = await translateField("transmission", "オートマ", { cache: memCache(), openai: noOpenAI });
  expect(out).toBe("at");
});

test("translateField returns null/empty unchanged", async () => {
  expect(await translateField("color", "", { cache: memCache(), openai: noOpenAI })).toBeNull();
});
```

- [ ] **Step 8: Run → FAIL (no translate.js).**

- [ ] **Step 9: Implement translate.js (dictionary + cache + openai fallback hook)**

```javascript
import * as dicts from "./dictionaries/index.js";

const DICT_FOR = {
  maker: dicts.maker, color: dicts.color, transmission: dicts.transmission,
  fuelType: dicts.fuel, bodyType: dicts.body, drivetrain: dicts.drivetrain,
  prefecture: dicts.prefecture
};

export async function translateField(field, value, { cache, openai }) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();

  const dict = DICT_FOR[field];
  if (dict && dict[text]) return dict[text];

  const cached = await cache.get(field, text);
  if (cached) return cached;

  if (openai) {
    const english = await openai.translate(field, text);
    if (english) {
      await cache.set(field, text, english);
      return english;
    }
  }
  return text; // fallback: original (flagged by caller)
}
```

- [ ] **Step 10: Run translate test** → PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/lookup bun.lock
git commit -m "feat(lookup): dictionaries, number normalization, translateField"
```

---

## Task 5: OpenAI wrapper + DB-backed translation cache + lookup index

**Files:**
- Create: `packages/lookup/src/openai.js`, `src/cache.js`
- Replace: `packages/lookup/src/index.js`, `src/index.test.js`

- [ ] **Step 1: Implement openai.js**

```javascript
import OpenAI from "openai";

export function createOpenAiTranslator(apiKey = process.env.OPENAI_API_KEY) {
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  return {
    async translate(field, text) {
      const res = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "Translate the given Japanese car-listing value to a short English term. Reply with ONLY the English term, lowercase, no punctuation." },
          { role: "user", content: `Field: ${field}\nValue: ${text}` }
        ]
      });
      return res.choices[0]?.message?.content?.trim().toLowerCase() || null;
    }
  };
}
```

- [ ] **Step 2: Implement cache.js (DB-backed)**

```javascript
import { and, eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";

export function createDbCache(db) {
  return {
    async get(field, sourceText) {
      const [row] = await db.select().from(schema.translationCache)
        .where(and(eq(schema.translationCache.field, field), eq(schema.translationCache.sourceText, sourceText)))
        .limit(1);
      return row?.english ?? null;
    },
    async set(field, sourceText, english) {
      await db.insert(schema.translationCache)
        .values({ field, sourceText, english })
        .onConflictDoNothing();
    }
  };
}
```

- [ ] **Step 3: Replace index.js**

```javascript
export { translateField } from "./translate.js";
export { createOpenAiTranslator } from "./openai.js";
export { createDbCache } from "./cache.js";
export * as normalize from "./normalize.js";
export * as dictionaries from "./dictionaries/index.js";
```

- [ ] **Step 4: Replace the stale stub test**

Delete the old placeholder test content in `src/index.test.js` and replace with:
```javascript
import { expect, test } from "bun:test";
import { translateField, normalize, dictionaries } from "./index.js";

test("public API exports are wired", () => {
  expect(typeof translateField).toBe("function");
  expect(typeof normalize.parseYen).toBe("function");
  expect(dictionaries.maker["トヨタ"]).toBe("toyota");
});
```

- [ ] **Step 5: Run** `bun test packages/lookup` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/lookup
git commit -m "feat(lookup): openai translator and db-backed translation cache"
```

---

# Phase 2 — Crawler Core (`packages/crawler`)

## Task 6: Package scaffold + spec-table parsing helper + canonical mapping

**Files:**
- Create: `packages/crawler/package.json`, `src/parseSpecs.js`, `src/parseSpecs.test.js`

The two sites both present specs as label/value pairs. We parse the spec block into a `{ japaneseLabel: value }` map, then map labels → canonical fields via `specLabels`, then normalize. This isolates site-specific work to *locating the spec block* (verified against fixtures in later tasks).

- [ ] **Step 1: package.json**

```json
{
  "name": "@feruz-crawler/crawler",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/adapters/index.js",
  "dependencies": {
    "@feruz-crawler/lookup": "workspace:*",
    "@feruz-crawler/shared": "workspace:*",
    "cloakbrowser": "^0.3.26",
    "playwright-core": "^1.49.0"
  }
}
```
Run `bun install`.

- [ ] **Step 2: Write parseSpecs test**

`packages/crawler/src/parseSpecs.test.js`:
```javascript
import { expect, test } from "bun:test";
import { specMapToCanonical } from "./parseSpecs.js";

const memCache = () => ({ get: async () => null, set: async () => {} });

test("maps a JP spec map to canonical English fields", async () => {
  const specMap = {
    "メーカー": "トヨタ", "年式": "2018年", "走行距離": "5.2万km",
    "ミッション": "CVT", "燃料": "ハイブリッド", "ボディカラー": "パール",
    "支払総額": "150万円", "車両本体価格": "130万円", "修復歴": "なし",
    "所在地": "東京都", "排気量": "1800cc", "乗車定員": "5名"
  };
  const out = await specMapToCanonical(specMap, { cache: memCache(), openai: null });
  expect(out.maker).toBe("toyota");
  expect(out.modelYear).toBe(2018);
  expect(out.mileageKm).toBe(52000);
  expect(out.transmission).toBe("cvt");
  expect(out.fuelType).toBe("hybrid");
  expect(out.color).toBe("pearl white");
  expect(out.totalPrice).toBe(1500000);
  expect(out.vehiclePrice).toBe(1300000);
  expect(out.repairHistory).toBe(false);
  expect(out.prefecture).toBe("tokyo");
  expect(out.displacementCc).toBe(1800);
  expect(out.seats).toBe(5);
});
```

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implement parseSpecs.js**

```javascript
import { translateField, normalize } from "@feruz-crawler/lookup";
import { specLabels } from "@feruz-crawler/lookup/src/dictionaries/index.js";

const NUMERIC = { modelYear: normalize.parseYear, mileageKm: normalize.parseMileageKm,
  displacementCc: normalize.parseInt0, doors: normalize.parseInt0, seats: normalize.parseInt0,
  totalPrice: normalize.parseYen, vehiclePrice: normalize.parseYen };
const TRANSLATED = ["maker", "color", "transmission", "fuelType", "bodyType", "drivetrain", "prefecture"];

function parseRepairHistory(value) {
  if (value == null) return null;
  return !/なし|無/.test(String(value)); // "なし"/"無" => no repair history => false
}

export async function specMapToCanonical(specMap, deps) {
  const out = {};
  for (const [label, rawValue] of Object.entries(specMap)) {
    const field = specLabels[label.trim()];
    if (!field) continue;
    if (out[field] != null) continue; // first match wins (e.g. multiple price labels)
    if (NUMERIC[field]) out[field] = NUMERIC[field](rawValue);
    else if (field === "repairHistory") out[field] = parseRepairHistory(rawValue);
    else if (TRANSLATED.includes(field)) out[field] = await translateField(field, rawValue, deps);
    else if (field === "model" || field === "grade" || field === "inspectionUntil") out[field] = String(rawValue).trim();
  }
  return out;
}
```

> Note: importing `specLabels` via the dictionaries path keeps it internal; if the subpath import is awkward in Bun, add `specLabels` to the `@feruz-crawler/lookup` index exports and import from there.

To avoid the subpath import, export `specLabels` from lookup's index. In `packages/lookup/src/index.js` add:
```javascript
export { specLabels } from "./dictionaries/index.js";
```
and in `parseSpecs.js` change the import to:
```javascript
import { translateField, normalize, specLabels } from "@feruz-crawler/lookup";
```

- [ ] **Step 5: Run → PASS.**

- [ ] **Step 6: Commit**

```bash
git add packages/crawler packages/lookup bun.lock
git commit -m "feat(crawler): spec-map to canonical field mapping"
```

---

## Task 7: goo-net adapter — buildSearchUrl (TDD) + fixtures + parsers

**Files:**
- Create: `packages/crawler/src/adapters/goonet.js`, `src/adapters/goonet.test.js`
- Create fixtures: `packages/crawler/test/fixtures/goonet-search.html`, `goonet-listing.html`

- [ ] **Step 1: Inspect goo-net search + listing pages (manual)**

Open https://goo-net.com/ , perform a search (e.g. Toyota Prius), and:
- Note the search URL pattern and query-param names for: maker, model, price min/max, year min/max, mileage max, body type, fuel, transmission, prefecture.
- Save the rendered search-results HTML to `packages/crawler/test/fixtures/goonet-search.html`.
- Open one listing, save it to `packages/crawler/test/fixtures/goonet-listing.html`.
- Record, for the listing fixture, the true values you can see (id, price, mileage, year) — you'll assert on them.

- [ ] **Step 2: Write buildSearchUrl test**

`packages/crawler/src/adapters/goonet.test.js`:
```javascript
import { expect, test } from "bun:test";
import { goonet } from "./goonet.js";

test("buildSearchUrl includes maker, price and year params", () => {
  const url = goonet.buildSearchUrl({
    maker: "toyota", models: ["prius"], priceMax: 2000000, yearMin: 2015
  });
  expect(url).toContain("goo-net.com");
  // Param names below are pinned from Step 1 inspection — adjust to the real keys:
  expect(url).toMatch(/maker|brand/i);
});

test("detectFromUrl recognizes goo-net listing urls", () => {
  expect(goonet.detectFromUrl("https://www.goo-net.com/usedcar/spread/goo/123.html")).toBe(true);
  expect(goonet.detectFromUrl("https://www.carsensor.net/usedcar/detail/abc/index.html")).toBe(false);
});
```

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implement goonet.js**

Implement using the param names and selectors pinned in Step 1. Structure:
```javascript
import { specMapToCanonical } from "../parseSpecs.js";

const BASE = "https://www.goo-net.com";

export const goonet = {
  site: "goonet",

  detectFromUrl(url) {
    return /(^|\.)goo-net\.com/i.test(new URL(url).hostname);
  },

  // Map canonical criteria -> goo-net search query. Param keys come from Step 1.
  buildSearchUrl(criteria) {
    const p = new URLSearchParams();
    if (criteria.maker) p.set("maker", criteria.maker);            // adjust key per Step 1
    if (criteria.models?.length) p.set("car", criteria.models.join(","));
    if (criteria.priceMin) p.set("price_from", String(criteria.priceMin));
    if (criteria.priceMax) p.set("price_to", String(criteria.priceMax));
    if (criteria.yearMin) p.set("year_from", String(criteria.yearMin));
    if (criteria.yearMax) p.set("year_to", String(criteria.yearMax));
    if (criteria.mileageMax) p.set("mileage_to", String(criteria.mileageMax));
    return `${BASE}/usedcar/search/?${p.toString()}`;
  },

  // Extract listing refs + next page from a search-results document.
  parseSearchPage(doc) {
    const refs = [...doc.querySelectorAll("a[href*='/usedcar/spread/']")].map((a) => {
      const href = new URL(a.getAttribute("href"), BASE).toString();
      const id = href.match(/\/(\d+)\.html/)?.[1] ?? href;
      return { sourceListingId: id, url: href };
    });
    const next = doc.querySelector("a[rel='next'], .pager .next a");
    return { listingRefs: dedupeById(refs), nextPageUrl: next ? new URL(next.getAttribute("href"), BASE).toString() : null };
  },

  // Build a JP spec map from the listing document, then convert to canonical.
  async parseListingPage(doc, url, deps) {
    const specMap = readSpecTable(doc);                 // selector pinned in Step 1
    const canonical = await specMapToCanonical(specMap, deps);
    return {
      source: "goonet",
      sourceListingId: url.match(/\/(\d+)\.html/)?.[1] ?? url,
      url,
      ...canonical,
      photos: [...doc.querySelectorAll(".photo img, .gallery img")].map((i) => i.getAttribute("src")).filter(Boolean),
      descriptionOriginal: doc.querySelector(".comment, .seller-comment, .pr-comment")?.textContent?.trim() ?? null,
      raw: { specMap }
    };
  }
};

function dedupeById(refs) {
  const seen = new Set();
  return refs.filter((r) => (seen.has(r.sourceListingId) ? false : seen.add(r.sourceListingId)));
}

// Reads a definition-list / table of specs into { label: value }. Selector pinned in Step 1.
function readSpecTable(doc) {
  const map = {};
  for (const row of doc.querySelectorAll("table.spec tr, .spec-table tr")) {
    const k = row.querySelector("th")?.textContent?.trim();
    const v = row.querySelector("td")?.textContent?.trim();
    if (k && v) map[k] = v;
  }
  for (const dt of doc.querySelectorAll("dl.spec dt")) {
    const k = dt.textContent?.trim();
    const v = dt.nextElementSibling?.textContent?.trim();
    if (k && v) map[k] = v;
  }
  return map;
}
```

> `doc` is a DOM `Document` (provided by the browser pool in Task 10; tests parse fixtures with a `DOMParser`, see Step 5).

- [ ] **Step 5: Add a fixture-based parse test**

Append to `goonet.test.js`:
```javascript
import { readFileSync } from "node:fs";
import { join } from "node:path";

const memDeps = { cache: { get: async () => null, set: async () => {} }, openai: null };
function parse(file) {
  const html = readFileSync(join(import.meta.dir, "../../test/fixtures", file), "utf8");
  // Bun provides a global DOMParser via happy-dom if installed; otherwise use linkedom (see note).
  return new DOMParser().parseFromString(html, "text/html");
}

test("parseListingPage extracts canonical fields from fixture", async () => {
  const doc = parse("goonet-listing.html");
  const listing = await goonet.parseListingPage(doc, "https://www.goo-net.com/usedcar/spread/goo/123.html", memDeps);
  expect(listing.source).toBe("goonet");
  expect(listing.sourceListingId).toBe("123");          // adjust to real fixture id
  expect(typeof listing.totalPrice).toBe("number");
  expect(listing.descriptionOriginal).toBeTruthy();
});
```

> **DOM in tests:** `DOMParser` is not built into Bun. Add `linkedom` as a dev dep and create a tiny helper `packages/crawler/src/dom.js` exporting `parseHtml(html)` using `import { parseHTML } from "linkedom"`. Use it in both tests and the browser pool's HTML path. Update the test's `parse()` to `parseHtml(html)`. Run `bun add -d linkedom` in the crawler package.

Add `packages/crawler/src/dom.js`:
```javascript
import { parseHTML } from "linkedom";
export function parseHtml(html) { return parseHTML(html).document; }
```
Update `goonet.test.js` to `import { parseHtml } from "../dom.js";` and use it.

- [ ] **Step 6: Run** `bun test packages/crawler/src/adapters/goonet.test.js`
Expected: PASS. Adjust selectors in `goonet.js` until the fixture test passes against the real saved HTML.

- [ ] **Step 7: Commit**

```bash
git add packages/crawler bun.lock
git commit -m "feat(crawler): goo-net adapter (search url, parsers) + fixtures"
```

---

## Task 8: carsensor adapter — mirror of Task 7 for carsensor.net

**Files:**
- Create: `packages/crawler/src/adapters/carsensor.js`, `src/adapters/carsensor.test.js`
- Create fixtures: `packages/crawler/test/fixtures/carsensor-search.html`, `carsensor-listing.html`

- [ ] **Step 1: Inspect carsensor.net search + listing (manual)** — same procedure as Task 7 Step 1, saving the two fixtures and noting the search param names and listing id pattern (carsensor listing URLs look like `/usedcar/detail/<ID>/index.html`).

- [ ] **Step 2: Write tests** — copy `goonet.test.js` structure into `carsensor.test.js`, importing `{ carsensor }`, asserting `detectFromUrl` recognizes `carsensor.net` (and rejects goo-net), `buildSearchUrl` contains `carsensor.net` + a maker param, and a fixture parse test against `carsensor-listing.html` with the real id.

```javascript
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { carsensor } from "./carsensor.js";
import { parseHtml } from "../dom.js";

const memDeps = { cache: { get: async () => null, set: async () => {} }, openai: null };
const parse = (f) => parseHtml(readFileSync(join(import.meta.dir, "../../test/fixtures", f), "utf8"));

test("detectFromUrl recognizes carsensor", () => {
  expect(carsensor.detectFromUrl("https://www.carsensor.net/usedcar/detail/AB12/index.html")).toBe(true);
  expect(carsensor.detectFromUrl("https://www.goo-net.com/usedcar/spread/goo/1.html")).toBe(false);
});

test("buildSearchUrl contains carsensor + maker", () => {
  const url = carsensor.buildSearchUrl({ maker: "toyota", priceMax: 2000000 });
  expect(url).toContain("carsensor.net");
});

test("parseListingPage extracts canonical fields", async () => {
  const doc = parse("carsensor-listing.html");
  const listing = await carsensor.parseListingPage(doc, "https://www.carsensor.net/usedcar/detail/AB12/index.html", memDeps);
  expect(listing.source).toBe("carsensor");
  expect(typeof listing.totalPrice).toBe("number");
});
```

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implement carsensor.js** — same shape as `goonet.js` (`site: "carsensor"`, `detectFromUrl` matching `carsensor.net`, `buildSearchUrl` with carsensor param keys from Step 1, `parseSearchPage` extracting `a[href*='/usedcar/detail/']` with id from `/detail/(\w+)/`, `parseListingPage` using `readSpecTable` + `specMapToCanonical`). Reuse the `readSpecTable`/`dedupeById` helpers — extract them into `packages/crawler/src/parseSpecs.js` exports and import in both adapters (DRY).

Move `readSpecTable` and `dedupeById` into `parseSpecs.js`:
```javascript
export function readSpecTable(doc) { /* body from Task 7 Step 4 */ }
export function dedupeById(refs) { /* body from Task 7 Step 4 */ }
```
and import them in both adapters.

- [ ] **Step 5: Run** carsensor tests, adjust selectors against the fixture until PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/crawler
git commit -m "feat(crawler): carsensor adapter + shared spec helpers"
```

---

## Task 9: Adapter registry

**Files:**
- Create: `packages/crawler/src/adapters/index.js`, `src/adapters/index.test.js`

- [ ] **Step 1: Write test**

```javascript
import { expect, test } from "bun:test";
import { getAdapter, getAdapterForUrl, adapters } from "./index.js";

test("getAdapter by site name", () => {
  expect(getAdapter("goonet").site).toBe("goonet");
  expect(getAdapter("carsensor").site).toBe("carsensor");
});

test("getAdapterForUrl picks the right adapter", () => {
  expect(getAdapterForUrl("https://www.carsensor.net/usedcar/detail/AB/index.html").site).toBe("carsensor");
  expect(getAdapterForUrl("https://www.goo-net.com/usedcar/spread/goo/1.html").site).toBe("goonet");
  expect(getAdapterForUrl("https://example.com")).toBeNull();
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement index.js**

```javascript
import { goonet } from "./goonet.js";
import { carsensor } from "./carsensor.js";

export const adapters = { goonet, carsensor };

export function getAdapter(site) {
  const a = adapters[site];
  if (!a) throw new Error(`Unknown site: ${site}`);
  return a;
}

export function getAdapterForUrl(url) {
  return Object.values(adapters).find((a) => a.detectFromUrl(url)) ?? null;
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/crawler
git commit -m "feat(crawler): adapter registry"
```

---

## Task 10: Browser pool (cloakbrowser) — `fetchDocument`

**Files:**
- Create: `packages/crawler/src/browser.js`

Not unit-tested (network + heavy binary). Verified via a manual smoke script.

- [ ] **Step 1: Implement browser.js**

```javascript
import { parseHtml } from "./dom.js";

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { launch } = await import("cloakbrowser");
      return launch({ headless: true }); // cloakbrowser stealth Chromium
    })();
  }
  return browserPromise;
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Fetch a URL, return a parsed Document. Polite: jittered delay before each navigation.
export async function fetchDocument(url, { waitFor } = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await delay(1000 + Math.random() * 2000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
    const html = await page.content();
    return parseHtml(html);
  } finally {
    await context.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) { const b = await browserPromise; await b.close(); browserPromise = null; }
}
```

> **API verification:** Confirm cloakbrowser's launch/context/page API matches Playwright (the package peers `playwright-core`). If cloakbrowser exposes a different entry (e.g. `chromium.launch`), adjust the dynamic import. Verify with the smoke script in Step 2 before wiring workers.

- [ ] **Step 2: Manual smoke verification**

Run:
```bash
cd apps/api 2>/dev/null; cd /Users/bekzod/conductor/workspaces/feruz-crawler/monterrey
bun -e "import('./packages/crawler/src/browser.js').then(async (m)=>{const d=await m.fetchDocument('https://example.com');console.log('TITLE:', d.querySelector('title')?.textContent); await m.closeBrowser();})"
```
Expected: prints `TITLE: Example Domain`. If cloakbrowser needs `ensureBinary()` first, run the Dockerfile's pre-download step locally once.

- [ ] **Step 3: Commit**

```bash
git add packages/crawler
git commit -m "feat(crawler): cloakbrowser pool with fetchDocument"
```

---

# Phase 3 — Ingest Pipeline (`apps/worker/src/ingest`)

## Task 11: `apps/worker` scaffold + upsert listing with price history

**Files:**
- Create: `apps/worker/package.json`, `src/ingest/upsert.js`, `src/ingest/upsert.test.js`

- [ ] **Step 1: Create apps/worker/package.json**

```json
{
  "name": "@feruz-crawler/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "bun --watch src/index.js", "start": "bun src/index.js" },
  "dependencies": {
    "@feruz-crawler/db": "workspace:*",
    "@feruz-crawler/shared": "workspace:*",
    "@feruz-crawler/lookup": "workspace:*",
    "@feruz-crawler/crawler": "workspace:*",
    "bullmq": "^5.0.0",
    "ioredis": "^5.4.0"
  }
}
```
Run `bun install`.

- [ ] **Step 2: Write upsert test (integration, real DB)**

`apps/worker/src/ingest/upsert.test.js`:
```javascript
import { expect, test, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@feruz-crawler/db";
import { upsertListing } from "./upsert.js";

const { db, sql } = createDb();
afterAll(() => sql.end());

const base = (over = {}) => ({
  source: "goonet", sourceListingId: `u-${Date.now()}-${Math.random()}`,
  url: "http://x", maker: "toyota", totalPrice: 1000000, ...over
});

test("inserts new listing and records initial price", async () => {
  const l = base();
  const r = await upsertListing(db, l);
  expect(r.isNew).toBe(true);
  const prices = await db.select().from(schema.priceHistory).where(eq(schema.priceHistory.listingId, r.listing.id));
  expect(prices.length).toBe(1);
});

test("updating with new price appends history; same price does not", async () => {
  const l = base();
  const r1 = await upsertListing(db, l);
  const r2 = await upsertListing(db, { ...l, totalPrice: 900000 });
  expect(r2.isNew).toBe(false);
  expect(r2.priceChanged).toBe(true);
  const r3 = await upsertListing(db, { ...l, totalPrice: 900000 });
  expect(r3.priceChanged).toBe(false);
  const prices = await db.select().from(schema.priceHistory).where(eq(schema.priceHistory.listingId, r1.listing.id));
  expect(prices.length).toBe(2);
});
```

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implement upsert.js**

```javascript
import { and, eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";

export async function upsertListing(db, canonical) {
  const { source, sourceListingId } = canonical;
  const [existing] = await db.select().from(schema.listings)
    .where(and(eq(schema.listings.source, source), eq(schema.listings.sourceListingId, sourceListingId)))
    .limit(1);

  const newPrice = canonical.totalPrice ?? null;

  if (!existing) {
    const [listing] = await db.insert(schema.listings).values({ ...canonical, status: "active" }).returning();
    if (newPrice != null) await db.insert(schema.priceHistory).values({ listingId: listing.id, price: newPrice });
    return { listing, isNew: true, priceChanged: false };
  }

  const priceChanged = newPrice != null && existing.totalPrice !== newPrice;
  const [listing] = await db.update(schema.listings)
    .set({ ...canonical, status: "active", consecutiveMisses: 0, lastSeenAt: new Date() })
    .where(eq(schema.listings.id, existing.id))
    .returning();
  if (priceChanged) await db.insert(schema.priceHistory).values({ listingId: listing.id, price: newPrice });
  return { listing, isNew: false, priceChanged };
}
```

- [ ] **Step 5: Run → PASS.**

- [ ] **Step 6: Commit**

```bash
git add apps/worker bun.lock
git commit -m "feat(worker): upsert listing with price history"
```

---

## Task 12: Sold detection (after-run miss bookkeeping)

**Files:**
- Create: `apps/worker/src/ingest/soldDetection.js`, `src/ingest/soldDetection.test.js`

- [ ] **Step 1: Write test**

`apps/worker/src/ingest/soldDetection.test.js`:
```javascript
import { expect, test, afterAll, beforeEach } from "bun:test";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@feruz-crawler/db";
import { markMisses } from "./soldDetection.js";

const { db, sql } = createDb();
afterAll(() => sql.end());

async function makeListing(id, misses = 0) {
  const [l] = await db.insert(schema.listings).values({
    source: "goonet", sourceListingId: id, url: "http://x", status: "active", consecutiveMisses: misses
  }).returning();
  return l;
}

test("missing listing increments; reaching 3 flips to sold_removed", async () => {
  const l = await makeListing(`s-${Date.now()}`, 2);
  await markMisses(db, "goonet", new Set()); // seen set empty -> it's a miss
  const [after] = await db.select().from(schema.listings).where(eq(schema.listings.id, l.id));
  expect(after.consecutiveMisses).toBe(3);
  expect(after.status).toBe("sold_removed");
});

test("seen listing is not incremented", async () => {
  const l = await makeListing(`s2-${Date.now()}`, 2);
  await markMisses(db, "goonet", new Set([l.sourceListingId]));
  const [after] = await db.select().from(schema.listings).where(eq(schema.listings.id, l.id));
  expect(after.consecutiveMisses).toBe(2);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement soldDetection.js**

```javascript
import { and, eq, ne, notInArray } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";

const SOLD_THRESHOLD = 3;

// After a discovery run for `site`, bump misses for active listings not in `seenIds`.
export async function markMisses(db, site, seenIds) {
  const active = await db.select().from(schema.listings)
    .where(and(eq(schema.listings.source, site), eq(schema.listings.status, "active")));
  for (const l of active) {
    if (seenIds.has(l.sourceListingId)) continue;
    const misses = l.consecutiveMisses + 1;
    await db.update(schema.listings)
      .set({ consecutiveMisses: misses, status: misses >= SOLD_THRESHOLD ? "sold_removed" : "active" })
      .where(eq(schema.listings.id, l.id));
  }
}
```

> Scope note: this bumps all active listings of a site not seen in the run. Because a discovery run covers a single preset's filter, restrict `seenIds` semantics to the run by only considering listings whose ids were ever discovered by that preset is a future refinement; for now, site-level miss tracking across runs is acceptable and matches the "3 consecutive misses" rule when one preset per site is active. Document this limitation in the worker README.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): sold detection via consecutive-miss counter"
```

---

## Task 13: New-match notifications

**Files:**
- Create: `apps/worker/src/ingest/notify.js`, `src/ingest/notify.test.js`

- [ ] **Step 1: Write test**

```javascript
import { expect, test, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@feruz-crawler/db";
import { notifyMatches } from "./notify.js";

const { db, sql } = createDb();
afterAll(() => sql.end());

test("creates a notification when a new listing matches an enabled preset", async () => {
  const [preset] = await db.insert(schema.filterPresets).values({
    name: "t", enabled: true, sites: ["goonet"], criteria: { maker: "toyota" }
  }).returning();
  const [listing] = await db.insert(schema.listings).values({
    source: "goonet", sourceListingId: `n-${Date.now()}`, url: "http://x", maker: "toyota"
  }).returning();

  const sent = [];
  await notifyMatches(db, listing, { telegram: { send: async (chatId, text) => sent.push({ chatId, text }) } });

  const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.listingId, listing.id));
  expect(notes.length).toBe(1);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement notify.js**

```javascript
import { eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { matchesCriteria } from "@feruz-crawler/shared";

// Call only for newly-inserted listings. Creates in-app notifications + Telegram pushes.
export async function notifyMatches(db, listing, { telegram } = {}) {
  const presets = await db.select().from(schema.filterPresets).where(eq(schema.filterPresets.enabled, true));
  for (const preset of presets) {
    if (!preset.sites.includes(listing.source)) continue;
    if (!matchesCriteria(listing, preset.criteria ?? {})) continue;

    await db.insert(schema.notifications).values({ listingId: listing.id, presetId: preset.id });
    if (telegram && preset.telegramChatId) {
      const text = `New match (${preset.name}): ${listing.maker ?? ""} ${listing.model ?? ""} — ¥${listing.totalPrice ?? "?"}\n${listing.url}`;
      await telegram.send(preset.telegramChatId, text).catch(() => {});
    }
  }
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): new-match notifications (in-app + telegram hook)"
```

---

# Phase 4 — Worker Wiring

## Task 14: Telegram notifier

**Files:**
- Create: `apps/worker/src/telegram.js`

- [ ] **Step 1: Implement telegram.js**

```javascript
// Minimal Telegram Bot API sender. No-op if no token configured.
export function createTelegram(token = process.env.TELEGRAM_BOT_TOKEN) {
  if (!token) return { send: async () => {} };
  return {
    async send(chatId, text) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false })
      });
    }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): telegram notifier"
```

---

## Task 15: Queues module (shared by worker + api)

**Files:**
- Create: `apps/worker/src/queues.js`

- [ ] **Step 1: Implement queues.js**

```javascript
import { Queue } from "bullmq";
import { createRedisConnection, QUEUE_DISCOVERY, QUEUE_LISTING } from "@feruz-crawler/shared";

const connection = createRedisConnection();

export const discoveryQueue = new Queue(QUEUE_DISCOVERY, { connection });
export const listingQueue = new Queue(QUEUE_LISTING, { connection });

export const defaultJobOpts = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 5000
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): bullmq queues module"
```

---

## Task 16: Listing worker

**Files:**
- Create: `apps/worker/src/workers/listing.js`

- [ ] **Step 1: Implement listing.js**

```javascript
import { Worker } from "bullmq";
import { createRedisConnection, QUEUE_LISTING } from "@feruz-crawler/shared";
import { createDb } from "@feruz-crawler/db";
import { createDbCache, createOpenAiTranslator } from "@feruz-crawler/lookup";
import { getAdapter } from "@feruz-crawler/crawler/src/adapters/index.js";
import { fetchDocument } from "@feruz-crawler/crawler/src/browser.js";
import { upsertListing } from "../ingest/upsert.js";
import { notifyMatches } from "../ingest/notify.js";
import { createTelegram } from "../telegram.js";

// job.data: { site, url }
export function startListingWorker({ db, sql } = createDb()) {
  const deps = { cache: createDbCache(db), openai: createOpenAiTranslator() };
  const telegram = createTelegram();
  const worker = new Worker(QUEUE_LISTING, async (job) => {
    const { site, url } = job.data;
    const adapter = getAdapter(site);
    const doc = await fetchDocument(url);
    const canonical = await adapter.parseListingPage(doc, url, deps);
    const { listing, isNew } = await upsertListing(db, canonical);
    if (isNew) await notifyMatches(db, listing, { telegram });
    return { id: listing.id, isNew };
  }, {
    connection: createRedisConnection(),
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2)
  });
  return worker;
}
```

> Subpath imports (`@feruz-crawler/crawler/src/...`): if Bun's workspace resolution rejects deep subpaths, add explicit `exports` entries in `packages/crawler/package.json` for `./browser` and `./adapters`, and import those subpaths. Prefer adding exports over deep paths.

Add to `packages/crawler/package.json`:
```json
"exports": {
  ".": "./src/adapters/index.js",
  "./browser": "./src/browser.js",
  "./adapters": "./src/adapters/index.js"
}
```
and import `from "@feruz-crawler/crawler/browser"` / `"@feruz-crawler/crawler/adapters"`.

- [ ] **Step 2: Commit**

```bash
git add apps/worker packages/crawler
git commit -m "feat(worker): listing worker (fetch -> parse -> translate -> upsert -> notify)"
```

---

## Task 17: Discovery worker

**Files:**
- Create: `apps/worker/src/workers/discovery.js`

- [ ] **Step 1: Implement discovery.js**

```javascript
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { createRedisConnection, QUEUE_DISCOVERY, JOB_CRAWL_LISTING } from "@feruz-crawler/shared";
import { createDb, schema } from "@feruz-crawler/db";
import { getAdapter } from "@feruz-crawler/crawler/adapters";
import { fetchDocument } from "@feruz-crawler/crawler/browser";
import { listingQueue, defaultJobOpts } from "../queues.js";
import { markMisses } from "../ingest/soldDetection.js";

const MAX_PAGES = 10;

// job.data: { presetId, site, criteria }
export function startDiscoveryWorker({ db } = createDb()) {
  return new Worker(QUEUE_DISCOVERY, async (job) => {
    const { presetId, site, criteria } = job.data;
    const adapter = getAdapter(site);
    const [run] = await db.insert(schema.crawlRuns).values({ presetId, site, status: "running" }).returning();

    const seen = new Set();
    let url = adapter.buildSearchUrl(criteria);
    let pages = 0;
    try {
      while (url && pages < MAX_PAGES) {
        const doc = await fetchDocument(url);
        const { listingRefs, nextPageUrl } = adapter.parseSearchPage(doc);
        for (const ref of listingRefs) {
          if (seen.has(ref.sourceListingId)) continue;
          seen.add(ref.sourceListingId);
          await listingQueue.add(JOB_CRAWL_LISTING, { site, url: ref.url }, defaultJobOpts);
        }
        url = nextPageUrl;
        pages += 1;
      }
      await markMisses(db, site, seen);
      await db.update(schema.crawlRuns)
        .set({ status: "done", foundCount: seen.size, finishedAt: new Date() })
        .where(eq(schema.crawlRuns.id, run.id));
      if (presetId) await db.update(schema.filterPresets).set({ lastRunAt: new Date() }).where(eq(schema.filterPresets.id, presetId));
      return { found: seen.size };
    } catch (err) {
      await db.update(schema.crawlRuns).set({ status: "error", errorCount: 1, finishedAt: new Date() }).where(eq(schema.crawlRuns.id, run.id));
      throw err;
    }
  }, { connection: createRedisConnection(), concurrency: 1 });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): discovery worker (paginate search -> enqueue listings -> sold detection)"
```

---

## Task 18: Scheduler (repeatable jobs from presets) + worker entrypoint

**Files:**
- Create: `apps/worker/src/scheduler.js`, `src/index.js`

- [ ] **Step 1: Implement scheduler.js**

```javascript
import { eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { JOB_DISCOVER_PRESET } from "@feruz-crawler/shared";
import { discoveryQueue, listingQueue, defaultJobOpts } from "./queues.js";

const repeatKey = (presetId) => `preset:${presetId}`;

// Sync BullMQ repeatable jobs with enabled presets. Call on startup and after preset writes.
export async function syncSchedules(db) {
  const presets = await db.select().from(schema.filterPresets);
  const existing = await discoveryQueue.getRepeatableJobs();

  for (const job of existing) {
    const id = job.name === JOB_DISCOVER_PRESET ? job.id : null;
    if (id && !presets.find((p) => repeatKey(p.id) === id && p.enabled)) {
      await discoveryQueue.removeRepeatableByKey(job.key);
    }
  }

  for (const preset of presets) {
    if (!preset.enabled) continue;
    await discoveryQueue.add(JOB_DISCOVER_PRESET, { presetId: preset.id, sites: preset.sites, criteria: preset.criteria },
      { repeat: { every: 60 * 60 * 1000 }, jobId: repeatKey(preset.id) });
  }
}

// The repeatable JOB_DISCOVER_PRESET fans out one discovery job per (preset x site).
export async function fanOutPreset(db, job) {
  const { presetId, sites, criteria } = job.data;
  for (const site of sites) {
    await discoveryQueue.add("discover-site", { presetId, site, criteria }, defaultJobOpts);
  }
}
```

> The discovery worker (Task 17) must distinguish the repeatable fan-out job (`JOB_DISCOVER_PRESET`) from per-site jobs (`discover-site`). Update `discovery.js` to branch: if `job.name === JOB_DISCOVER_PRESET` call `fanOutPreset(db, job)` and return; otherwise run the per-site crawl. Add that branch now.

Update `apps/worker/src/workers/discovery.js` processor top:
```javascript
import { JOB_DISCOVER_PRESET } from "@feruz-crawler/shared";
import { fanOutPreset } from "../scheduler.js";
// inside processor, first line:
if (job.name === JOB_DISCOVER_PRESET) { await fanOutPreset(db, job); return { fannedOut: true }; }
```

- [ ] **Step 2: Implement index.js (worker entrypoint)**

```javascript
import { createDb } from "@feruz-crawler/db";
import { startListingWorker } from "./workers/listing.js";
import { startDiscoveryWorker } from "./workers/discovery.js";
import { syncSchedules } from "./scheduler.js";

const { db, sql } = createDb();

startListingWorker({ db, sql });
startDiscoveryWorker({ db });
await syncSchedules(db);

console.log("feruz-crawler worker started");

process.on("SIGTERM", async () => { await sql.end(); process.exit(0); });
```

- [ ] **Step 3: Verify worker boots**

Run: `bun apps/worker/src/index.js`
Expected: prints "feruz-crawler worker started" and stays running (Ctrl-C to stop). Requires docker infra up.

- [ ] **Step 4: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): scheduler with repeatable jobs and entrypoint"
```

---

# Phase 5 — API (`apps/api`)

## Task 19: API router + presets CRUD (+ schedule sync)

**Files:**
- Modify: `apps/api/package.json`, `apps/api/src/index.js`
- Create: `apps/api/src/json.js`, `src/queues.js`, `src/routes/presets.js`

- [ ] **Step 1: Update apps/api deps**

Add to `apps/api/package.json` dependencies:
```json
"@feruz-crawler/db": "workspace:*",
"@feruz-crawler/shared": "workspace:*",
"@feruz-crawler/worker": "workspace:*",
"bullmq": "^5.0.0"
```
Run `bun install`.

- [ ] **Step 2: Implement json.js**

```javascript
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
export async function body(request) { try { return await request.json(); } catch { return {}; } }
```

- [ ] **Step 3: Implement api queues.js**

```javascript
import { Queue } from "bullmq";
import { createRedisConnection, QUEUE_DISCOVERY, QUEUE_LISTING } from "@feruz-crawler/shared";
const connection = createRedisConnection();
export const discoveryQueue = new Queue(QUEUE_DISCOVERY, { connection });
export const listingQueue = new Queue(QUEUE_LISTING, { connection });
```

- [ ] **Step 4: Implement presets route**

`apps/api/src/routes/presets.js`:
```javascript
import { eq } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { criteriaSchema, JOB_DISCOVER_PRESET } from "@feruz-crawler/shared";
import { syncSchedules } from "@feruz-crawler/worker/src/scheduler.js";
import { discoveryQueue } from "../queues.js";
import { json, body } from "../json.js";

export async function presetsRoutes(db, request, url) {
  const m = url.pathname.match(/^\/presets(?:\/([\w-]+))?(?:\/(run))?$/);
  if (!m) return null;
  const id = m[1], action = m[2];

  if (request.method === "GET" && !id) {
    return json(await db.select().from(schema.filterPresets));
  }
  if (request.method === "POST" && !id) {
    const b = await body(request);
    const criteria = criteriaSchema.parse(b.criteria ?? {});
    const [row] = await db.insert(schema.filterPresets).values({
      name: b.name, enabled: b.enabled ?? true, sites: b.sites ?? ["goonet", "carsensor"],
      criteria, telegramChatId: b.telegramChatId ?? null
    }).returning();
    await syncSchedules(db);
    return json(row, 201);
  }
  if (request.method === "PATCH" && id) {
    const b = await body(request);
    const patch = {};
    for (const k of ["name", "enabled", "sites", "telegramChatId"]) if (k in b) patch[k] = b[k];
    if (b.criteria) patch.criteria = criteriaSchema.parse(b.criteria);
    const [row] = await db.update(schema.filterPresets).set(patch).where(eq(schema.filterPresets.id, id)).returning();
    await syncSchedules(db);
    return json(row);
  }
  if (request.method === "DELETE" && id) {
    await db.delete(schema.filterPresets).where(eq(schema.filterPresets.id, id));
    await syncSchedules(db);
    return json({ ok: true });
  }
  if (request.method === "POST" && id && action === "run") {
    const [preset] = await db.select().from(schema.filterPresets).where(eq(schema.filterPresets.id, id));
    if (!preset) return json({ error: "not found" }, 404);
    await discoveryQueue.add(JOB_DISCOVER_PRESET, { presetId: preset.id, sites: preset.sites, criteria: preset.criteria });
    return json({ ok: true });
  }
  return null;
}
```

- [ ] **Step 5: Wire router in index.js**

Replace `apps/api/src/index.js`:
```javascript
import { createDb } from "@feruz-crawler/db";
import { json } from "./json.js";
import { presetsRoutes } from "./routes/presets.js";
import { listingsRoutes } from "./routes/listings.js";
import { crawlRoutes } from "./routes/crawl.js";
import { jobsRoutes } from "./routes/jobs.js";
import { notificationsRoutes } from "./routes/notifications.js";

const port = Number(process.env.PORT ?? 3000);
const { db } = createDb();
const routes = [presetsRoutes, listingsRoutes, crawlRoutes, jobsRoutes, notificationsRoutes];

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({});
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });
    for (const route of routes) {
      try {
        const res = await route(db, request, url);
        if (res) return res;
      } catch (err) {
        return json({ error: String(err.message ?? err) }, 400);
      }
    }
    return json({ error: "Not found" }, 404);
  }
});
console.log(`feruz-crawler API listening on http://localhost:${server.port}`);
```

> Create stub route modules now so the imports resolve; they get bodies in Tasks 20-21. Each stub: `export async function NAME(db, request, url) { return null; }`

- [ ] **Step 6: Verify presets CRUD**

Run (with infra + worker not required for API boot):
```bash
bun apps/api/src/index.js &
sleep 1
curl -s -XPOST localhost:3000/presets -H 'content-type: application/json' -d '{"name":"prius","criteria":{"maker":"toyota"}}'
curl -s localhost:3000/presets
kill %1
```
Expected: POST returns the created preset JSON; GET lists it.

- [ ] **Step 7: Commit**

```bash
git add apps/api bun.lock
git commit -m "feat(api): router + presets CRUD with schedule sync"
```

---

## Task 20: Listings endpoints

**Files:**
- Replace stub: `apps/api/src/routes/listings.js`

- [ ] **Step 1: Implement listings route**

```javascript
import { and, desc, eq, gte, lte, sql as dsql } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { json } from "../json.js";

export async function listingsRoutes(db, request, url) {
  const detail = url.pathname.match(/^\/listings\/([\w-]+)$/);
  if (request.method === "GET" && detail) {
    const id = detail[1];
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, id));
    if (!listing) return json({ error: "not found" }, 404);
    const prices = await db.select().from(schema.priceHistory)
      .where(eq(schema.priceHistory.listingId, id)).orderBy(schema.priceHistory.observedAt);
    return json({ ...listing, priceHistory: prices });
  }
  if (request.method === "GET" && url.pathname === "/listings") {
    const q = url.searchParams;
    const conds = [];
    if (q.get("source")) conds.push(eq(schema.listings.source, q.get("source")));
    if (q.get("maker")) conds.push(eq(schema.listings.maker, q.get("maker")));
    if (q.get("status")) conds.push(eq(schema.listings.status, q.get("status")));
    if (q.get("priceMax")) conds.push(lte(schema.listings.totalPrice, Number(q.get("priceMax"))));
    if (q.get("priceMin")) conds.push(gte(schema.listings.totalPrice, Number(q.get("priceMin"))));
    const limit = Math.min(Number(q.get("limit") ?? 50), 200);
    const offset = Number(q.get("offset") ?? 0);
    const rows = await db.select().from(schema.listings)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.listings.lastSeenAt)).limit(limit).offset(offset);
    return json({ rows, limit, offset });
  }
  return null;
}
```

- [ ] **Step 2: Verify**

Run API, then `curl -s 'localhost:3000/listings?limit=5'` → returns `{rows:[],...}` (empty until a crawl runs).

- [ ] **Step 3: Commit**

```bash
git add apps/api
git commit -m "feat(api): listings list + detail with price history"
```

---

## Task 21: Manual crawl, jobs, notifications endpoints

**Files:**
- Replace stubs: `apps/api/src/routes/crawl.js`, `jobs.js`, `notifications.js`

- [ ] **Step 1: Implement crawl.js**

```javascript
import { getAdapterForUrl } from "@feruz-crawler/crawler/adapters";
import { JOB_CRAWL_LISTING } from "@feruz-crawler/shared";
import { listingQueue } from "../queues.js";
import { json, body } from "../json.js";

export async function crawlRoutes(db, request, url) {
  if (request.method === "POST" && url.pathname === "/crawl/url") {
    const { url: target } = await body(request);
    if (!target) return json({ error: "url required" }, 400);
    const adapter = getAdapterForUrl(target);
    if (!adapter) return json({ error: "unsupported site" }, 400);
    const job = await listingQueue.add(JOB_CRAWL_LISTING, { site: adapter.site, url: target });
    return json({ jobId: job.id, site: adapter.site }, 202);
  }
  return null;
}
```
(`apps/api/package.json` must depend on `@feruz-crawler/crawler` — add it and `bun install`.)

- [ ] **Step 2: Implement jobs.js**

```javascript
import { discoveryQueue, listingQueue } from "../queues.js";
import { json } from "../json.js";

const queues = { discovery: discoveryQueue, listing: listingQueue };

export async function jobsRoutes(db, request, url) {
  if (request.method === "GET" && url.pathname === "/jobs") {
    const out = {};
    for (const [name, q] of Object.entries(queues)) {
      out[name] = await q.getJobCounts("active", "waiting", "completed", "failed", "delayed");
      const failed = await q.getJobs(["failed"], 0, 20);
      out[`${name}_failed`] = failed.map((j) => ({ id: j.id, name: j.name, reason: j.failedReason, data: j.data }));
    }
    return json(out);
  }
  const retry = url.pathname.match(/^\/jobs\/(discovery|listing)\/([\w:-]+)\/retry$/);
  if (request.method === "POST" && retry) {
    const job = await queues[retry[1]].getJob(retry[2]);
    if (!job) return json({ error: "not found" }, 404);
    await job.retry();
    return json({ ok: true });
  }
  return null;
}
```

- [ ] **Step 3: Implement notifications.js**

```javascript
import { desc, eq, isNull } from "drizzle-orm";
import { schema } from "@feruz-crawler/db";
import { json } from "../json.js";

export async function notificationsRoutes(db, request, url) {
  if (request.method === "GET" && url.pathname === "/notifications") {
    const rows = await db.select({
      n: schema.notifications, listing: schema.listings
    }).from(schema.notifications)
      .leftJoin(schema.listings, eq(schema.notifications.listingId, schema.listings.id))
      .orderBy(desc(schema.notifications.createdAt)).limit(100);
    return json(rows);
  }
  const read = url.pathname.match(/^\/notifications\/([\w-]+)\/read$/);
  if (request.method === "POST" && read) {
    await db.update(schema.notifications).set({ readAt: new Date() }).where(eq(schema.notifications.id, read[1]));
    return json({ ok: true });
  }
  return null;
}
```

- [ ] **Step 4: Verify**

Run API + infra; `curl -s -XPOST localhost:3000/crawl/url -d '{"url":"https://www.carsensor.net/usedcar/detail/AB/index.html"}' -H 'content-type: application/json'` → returns `{jobId,...}` (202). `curl -s localhost:3000/jobs` → returns queue counts.

- [ ] **Step 5: Commit**

```bash
git add apps/api bun.lock
git commit -m "feat(api): manual crawl, jobs, notifications endpoints"
```

---

# Phase 6 — Frontend (`apps/web`)

## Task 22: API client + app shell with navigation

**Files:**
- Create: `apps/web/src/api.js`
- Replace: `apps/web/src/App.jsx`, `src/App.css` (minimal)
- Modify: `apps/web/vite.config.js` (proxy /api → :3000)

- [ ] **Step 1: Configure dev proxy**

`apps/web/vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } } }
})
```

- [ ] **Step 2: Implement api.js**

```javascript
const base = "/api";
async function req(path, opts) {
  const res = await fetch(base + path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}
export const api = {
  listings: (qs = "") => req(`/listings${qs}`),
  listing: (id) => req(`/listings/${id}`),
  presets: () => req(`/presets`),
  createPreset: (p) => req(`/presets`, { method: "POST", body: JSON.stringify(p) }),
  updatePreset: (id, p) => req(`/presets/${id}`, { method: "PATCH", body: JSON.stringify(p) }),
  deletePreset: (id) => req(`/presets/${id}`, { method: "DELETE" }),
  runPreset: (id) => req(`/presets/${id}/run`, { method: "POST" }),
  crawlUrl: (url) => req(`/crawl/url`, { method: "POST", body: JSON.stringify({ url }) }),
  jobs: () => req(`/jobs`),
  notifications: () => req(`/notifications`),
  readNotification: (id) => req(`/notifications/${id}/read`, { method: "POST" })
};
```

- [ ] **Step 3: Implement App.jsx (tab shell, no router dep)**

```jsx
import { useState } from 'react'
import Listings from './pages/Listings.jsx'
import Presets from './pages/Presets.jsx'
import Jobs from './pages/Jobs.jsx'
import Notifications from './pages/Notifications.jsx'
import './App.css'

const TABS = { listings: Listings, presets: Presets, jobs: Jobs, notifications: Notifications }

export default function App() {
  const [tab, setTab] = useState('listings')
  const Active = TABS[tab]
  return (
    <div className="app">
      <nav className="nav">
        <h1>feruz-crawler</h1>
        {Object.keys(TABS).map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      <main><Active /></main>
    </div>
  )
}
```

- [ ] **Step 4: Minimal App.css** — replace with a small functional stylesheet (nav as a horizontal bar, `.active` highlighted, basic table styling `table{width:100%;border-collapse:collapse} td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}`).

- [ ] **Step 5: Verify build**

Run: `cd apps/web && bun run build` → builds without unresolved imports (pages created next task may stub-fail; create empty stubs returning `<div/>` first so build passes, then fill in Task 23-24).

Create stub pages now:
```jsx
export default function Page() { return <div>todo</div> }
```
for `Listings.jsx`, `Presets.jsx`, `Jobs.jsx`, `Notifications.jsx`.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): api client + tab shell"
```

---

## Task 23: Listings browser + detail

**Files:**
- Replace: `apps/web/src/pages/Listings.jsx`
- Create: `apps/web/src/pages/ListingDetail.jsx`

- [ ] **Step 1: Implement Listings.jsx**

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import ListingDetail from './ListingDetail.jsx'

export default function Listings() {
  const [rows, setRows] = useState([])
  const [filters, setFilters] = useState({ maker: '', priceMax: '', status: 'active' })
  const [selected, setSelected] = useState(null)

  async function load() {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
    const data = await api.listings(`?${qs}`)
    setRows(data.rows)
  }
  useEffect(() => { load() }, [])

  if (selected) return <ListingDetail id={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="filters">
        <input placeholder="maker" value={filters.maker} onChange={(e) => setFilters({ ...filters, maker: e.target.value })} />
        <input placeholder="max price" value={filters.priceMax} onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="active">active</option><option value="sold_removed">sold</option><option value="">all</option>
        </select>
        <button onClick={load}>Search</button>
      </div>
      <table>
        <thead><tr><th>Source</th><th>Maker</th><th>Model</th><th>Year</th><th>Price</th><th>Mileage</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => setSelected(r.id)} style={{ cursor: 'pointer' }}>
              <td>{r.source}</td><td>{r.maker}</td><td>{r.model}</td><td>{r.modelYear}</td>
              <td>{r.totalPrice?.toLocaleString()}</td><td>{r.mileageKm?.toLocaleString()}</td><td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Implement ListingDetail.jsx**

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function ListingDetail({ id, onBack }) {
  const [l, setL] = useState(null)
  useEffect(() => { api.listing(id).then(setL) }, [id])
  if (!l) return <div>Loading…</div>
  const fields = ['maker','model','grade','modelYear','mileageKm','displacementCc','transmission','fuelType','bodyType','drivetrain','color','doors','seats','inspectionUntil','repairHistory','totalPrice','vehiclePrice','prefecture','dealerName']
  return (
    <div>
      <button onClick={onBack}>← Back</button>
      <h2>{l.maker} {l.model} ({l.modelYear})</h2>
      <a href={l.url} target="_blank" rel="noreferrer">Original listing ↗</a>
      <div className="photos">{(l.photos ?? []).slice(0, 8).map((p, i) => <img key={i} src={p} width="160" alt="" />)}</div>
      <table><tbody>{fields.map((f) => <tr key={f}><th>{f}</th><td>{String(l[f] ?? '')}</td></tr>)}</tbody></table>
      <h3>Price history</h3>
      <ul>{(l.priceHistory ?? []).map((p) => <li key={p.id}>{new Date(p.observedAt).toLocaleString()} — ¥{p.price.toLocaleString()}</li>)}</ul>
      <h3>Original description (Japanese)</h3>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{l.descriptionOriginal}</pre>
    </div>
  )
}
```

- [ ] **Step 3: Verify** — `bun run build` passes; `bun run dev:web` shows the listings page (empty table until data exists).

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): listings browser + detail view"
```

---

## Task 24: Presets management + single-URL crawl

**Files:**
- Replace: `apps/web/src/pages/Presets.jsx`

- [ ] **Step 1: Implement Presets.jsx**

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api.js'

const EMPTY = { name: '', sites: ['goonet', 'carsensor'], enabled: true, telegramChatId: '', criteria: { maker: '', priceMax: '', yearMin: '' } }

export default function Presets() {
  const [presets, setPresets] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [singleUrl, setSingleUrl] = useState('')
  const load = () => api.presets().then(setPresets)
  useEffect(() => { load() }, [])

  async function create() {
    const criteria = {}
    if (form.criteria.maker) criteria.maker = form.criteria.maker
    if (form.criteria.priceMax) criteria.priceMax = Number(form.criteria.priceMax)
    if (form.criteria.yearMin) criteria.yearMin = Number(form.criteria.yearMin)
    await api.createPreset({ name: form.name, sites: form.sites, enabled: form.enabled, telegramChatId: form.telegramChatId || null, criteria })
    setForm(EMPTY); load()
  }

  return (
    <div>
      <section className="card">
        <h3>Crawl a single URL</h3>
        <input style={{ width: '60%' }} placeholder="paste goo-net or carsensor listing URL" value={singleUrl} onChange={(e) => setSingleUrl(e.target.value)} />
        <button onClick={async () => { await api.crawlUrl(singleUrl); setSingleUrl(''); alert('Queued') }}>Crawl</button>
      </section>

      <section className="card">
        <h3>New filter preset</h3>
        <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="maker (e.g. toyota)" value={form.criteria.maker} onChange={(e) => setForm({ ...form, criteria: { ...form.criteria, maker: e.target.value } })} />
        <input placeholder="max price" value={form.criteria.priceMax} onChange={(e) => setForm({ ...form, criteria: { ...form.criteria, priceMax: e.target.value } })} />
        <input placeholder="min year" value={form.criteria.yearMin} onChange={(e) => setForm({ ...form, criteria: { ...form.criteria, yearMin: e.target.value } })} />
        <input placeholder="telegram chat id" value={form.telegramChatId} onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })} />
        <button onClick={create}>Create</button>
      </section>

      <table>
        <thead><tr><th>Name</th><th>Sites</th><th>Enabled</th><th>Last run</th><th></th></tr></thead>
        <tbody>
          {presets.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{(p.sites || []).join(', ')}</td>
              <td><input type="checkbox" checked={p.enabled} onChange={async () => { await api.updatePreset(p.id, { enabled: !p.enabled }); load() }} /></td>
              <td>{p.lastRunAt ? new Date(p.lastRunAt).toLocaleString() : '—'}</td>
              <td>
                <button onClick={async () => { await api.runPreset(p.id); alert('Run queued') }}>Run now</button>
                <button onClick={async () => { await api.deletePreset(p.id); load() }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Verify** — create a preset via UI; it appears in the table; toggle enabled; "Run now" works (with infra + worker running).

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat(web): presets management + single-url crawl"
```

---

## Task 25: Job monitoring + notifications pages

**Files:**
- Replace: `apps/web/src/pages/Jobs.jsx`, `src/pages/Notifications.jsx`

- [ ] **Step 1: Implement Jobs.jsx**

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Jobs() {
  const [data, setData] = useState(null)
  const load = () => api.jobs().then(setData)
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])
  if (!data) return <div>Loading…</div>
  return (
    <div>
      {['discovery', 'listing'].map((q) => (
        <section key={q} className="card">
          <h3>{q} queue</h3>
          <pre>{JSON.stringify(data[q], null, 2)}</pre>
          <h4>Recent failures</h4>
          <ul>
            {(data[`${q}_failed`] ?? []).map((j) => (
              <li key={j.id}>#{j.id} {j.name}: {j.reason} <span>{JSON.stringify(j.data)}</span></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Implement Notifications.jsx**

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Notifications() {
  const [items, setItems] = useState([])
  const load = () => api.notifications().then(setItems)
  useEffect(() => { load() }, [])
  return (
    <table>
      <thead><tr><th>When</th><th>Car</th><th>Price</th><th></th></tr></thead>
      <tbody>
        {items.map(({ n, listing }) => (
          <tr key={n.id} style={{ fontWeight: n.readAt ? 'normal' : 'bold' }}>
            <td>{new Date(n.createdAt).toLocaleString()}</td>
            <td><a href={listing?.url} target="_blank" rel="noreferrer">{listing?.maker} {listing?.model}</a></td>
            <td>{listing?.totalPrice?.toLocaleString()}</td>
            <td>{!n.readAt && <button onClick={async () => { await api.readNotification(n.id); load() }}>Mark read</button>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 3: Verify** — `bun run build` passes; pages render with live data when infra/worker/api are running.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): job monitoring + notifications pages"
```

---

# Phase 7 — End-to-end verification

## Task 26: Integration smoke + docs

**Files:**
- Create: `apps/worker/README.md`, update root `README.md`

- [ ] **Step 1: Full local run**

```bash
docker compose up -d
cp .env.example .env   # fill OPENAI_API_KEY, TELEGRAM_BOT_TOKEN if testing those
bun run db:migrate
bun apps/api/src/index.js &      # API
bun apps/worker/src/index.js &   # worker
bun run dev:web                  # frontend
```

- [ ] **Step 2: Manual single-URL crawl**

In the web UI (Presets tab), paste a real carsensor listing URL → Crawl. Within ~30s the listing should appear in the Listings tab with English fields and the original Japanese description in detail view. Verify in DB:
```bash
bun -e "import('./packages/db/src/index.js').then(async({createDb,schema})=>{const{db,sql}=createDb();console.log(await db.select().from(schema.listings).limit(5));await sql.end()})"
```

- [ ] **Step 3: Preset crawl + notification**

Create a preset (e.g. maker=toyota), "Run now", confirm listings populate, `crawl_runs` records counts, and a matching new listing produces a notification (and Telegram message if configured).

- [ ] **Step 4: Run the full test suite**

Run: `bun test`
Expected: all unit + integration tests PASS (infra must be up for DB tests).

- [ ] **Step 5: Write docs**

`apps/worker/README.md`: document the two queues, the repeatable-job scheduler, the site-level sold-detection limitation (from Task 12), and how to add a new site adapter. Update root `README.md` with run instructions from Step 1.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/README.md README.md
git commit -m "docs: run instructions and worker architecture notes"
```

---

## Notes for the implementer

- **Site selectors are calibrated against saved fixtures** (Tasks 7-8). Treat the selector strings in the adapters as starting points — adjust until the fixture parse tests pass against the real HTML. The spec-table approach means most fields flow through `specLabels`; you mainly need to locate the spec block, photo elements, and the description element per site.
- **Dictionaries are seeds.** `maker`, `color`, and `prefecture` need completing (47 prefectures, common makers/colors). Unknown values fall through to OpenAI then to the raw string — safe, but complete the high-frequency entries to minimize API calls.
- **cloakbrowser API** (Task 10) is the one external unknown — verify its launch/page API before wiring workers; adjust `browser.js` if it differs from Playwright's shape.
- **Politeness/legal:** keep `WORKER_CONCURRENCY` low and the jittered delay in `fetchDocument`. These are commercial sites; respect their load.
