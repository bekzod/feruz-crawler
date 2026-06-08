import { Worker } from "bullmq";
import { createRedisConnection, QUEUE_LISTING } from "@feruz-crawler/shared";
import { createDb } from "@feruz-crawler/db";
import { createDbCache, createOpenAiTranslator } from "@feruz-crawler/lookup";
import { getAdapter } from "@feruz-crawler/crawler/adapters";
import { fetchDocument } from "@feruz-crawler/crawler/browser";
import { upsertListing } from "../ingest/upsert.js";
import { notifyMatches } from "../ingest/notify.js";
import { createTelegram } from "../telegram.js";

// Processes the `listing` queue. job.data: { site, url }.
// Fetch -> parse+translate -> upsert -> notify (on new).
export function startListingWorker({ db } = createDb()) {
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
