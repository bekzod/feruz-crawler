import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { createRedisConnection, QUEUE_DISCOVERY, JOB_DISCOVER_PRESET, JOB_CRAWL_LISTING } from "@feruz-crawler/shared";
import { createDb, schema } from "@feruz-crawler/db";
import { getAdapter } from "@feruz-crawler/crawler/adapters";
import { fetchDocument } from "@feruz-crawler/crawler/browser";
import { listingQueue, defaultJobOpts } from "../queues.js";
import { markMisses } from "../ingest/soldDetection.js";
import { fanOutPreset } from "../scheduler.js";

const MAX_PAGES = 10;

// Processes the `discovery` queue. Two job types:
//  - JOB_DISCOVER_PRESET (repeatable): fan out one "discover-site" job per site.
//  - "discover-site": crawl a single site's search results for a preset.
export function startDiscoveryWorker({ db } = createDb()) {
  return new Worker(QUEUE_DISCOVERY, async (job) => {
    if (job.name === JOB_DISCOVER_PRESET) {
      await fanOutPreset(db, job);
      return { fannedOut: true };
    }

    const { presetId, site, criteria } = job.data;
    const adapter = getAdapter(site);
    const [run] = await db.insert(schema.crawlRuns).values({ presetId, site, status: "running" }).returning();

    const seen = new Set();
    let url = adapter.buildSearchUrl(criteria ?? {});
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
      if (presetId) {
        await db.update(schema.filterPresets).set({ lastRunAt: new Date() }).where(eq(schema.filterPresets.id, presetId));
      }
      return { found: seen.size };
    } catch (err) {
      await db.update(schema.crawlRuns)
        .set({ status: "error", errorCount: 1, finishedAt: new Date() })
        .where(eq(schema.crawlRuns.id, run.id));
      throw err;
    }
  }, { connection: createRedisConnection(), concurrency: 1 });
}
