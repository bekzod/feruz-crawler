import { Worker } from "bullmq";
import { createRedisConnection, QUEUE_LISTING } from "@feruz-crawler/shared";
import { createDb } from "@feruz-crawler/db";
import { createDbCache, createOpenAiTranslator } from "@feruz-crawler/lookup";
import { getAdapter } from "@feruz-crawler/crawler/adapters";
import { fetchDocument } from "@feruz-crawler/crawler/browser";
import { upsertListing } from "../ingest/upsert.js";
import { notifyMatches } from "../ingest/notify.js";
import { createTelegram } from "../telegram.js";
import { mirrorListingPhotos } from "../s3/images.js";

export async function processListingJob(
  job,
  {
    db,
    deps,
    telegram,
    getAdapterImpl = getAdapter,
    fetchDocumentImpl = fetchDocument,
    mirrorListingPhotosImpl = mirrorListingPhotos,
    upsertListingImpl = upsertListing,
    notifyMatchesImpl = notifyMatches,
  },
) {
  const { site, url } = job.data;
  const adapter = getAdapterImpl(site);
  const doc = await fetchDocumentImpl(url);
  const parsed = await adapter.parseListingPage(doc, url, deps);
  const canonical = await mirrorListingPhotosImpl(parsed);
  const { listing, isNew } = await upsertListingImpl(db, canonical);
  if (isNew) await notifyMatchesImpl(db, listing, { telegram });
  return { id: listing.id, isNew };
}

// Processes the `listing` queue. job.data: { site, url }.
// Fetch -> parse+translate -> upsert -> notify (on new).
export function startListingWorker({ db } = createDb()) {
  const deps = { cache: createDbCache(db), openai: createOpenAiTranslator() };
  const telegram = createTelegram();
  const worker = new Worker(QUEUE_LISTING, async (job) => {
    return processListingJob(job, { db, deps, telegram });
  }, {
    connection: createRedisConnection(),
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2)
  });
  return worker;
}
